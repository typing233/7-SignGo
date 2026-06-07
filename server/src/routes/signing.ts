import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getOne, getAll, runInsert, runQuery } from '../db/connection';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { sendSigningEmail, sendReminderEmail, sendCompletionEmail, sendRejectionEmail, triggerWebhooks } from '../services/email';
import { logAudit, getAuditLogs } from '../services/audit';

const router = Router();

router.use(authMiddleware);

router.get('/', (req: AuthRequest, res) => {
  const processes = getAll(`
    SELECT sp.*, d.title as document_title, d.filename as document_filename,
      (SELECT COUNT(*) FROM signers WHERE signing_process_id = sp.id) as total_signers,
      (SELECT COUNT(*) FROM signers WHERE signing_process_id = sp.id AND status = 'signed') as signed_count
    FROM signing_processes sp
    JOIN documents d ON sp.document_id = d.id
    WHERE sp.creator_id = ?
    ORDER BY sp.created_at DESC
  `, [req.userId!]);
  res.json({ processes });
});

router.post('/', (req: AuthRequest, res) => {
  const { document_id, title, signers, expires_at } = req.body;
  if (!document_id || !title || !signers || !signers.length) {
    return res.status(400).json({ error: '请填写所有必要信息' });
  }

  const doc = getOne('SELECT * FROM documents WHERE id = ? AND user_id = ?', [document_id, req.userId!]);
  if (!doc) {
    return res.status(404).json({ error: '文档不存在' });
  }

  const processId = runInsert(
    'INSERT INTO signing_processes (document_id, creator_id, title, expires_at) VALUES (?, ?, ?, ?)',
    [document_id, req.userId!, title, expires_at || null]
  );

  for (const s of signers) {
    runInsert(
      'INSERT INTO signers (signing_process_id, email, name, sign_order, token) VALUES (?, ?, ?, ?, ?)',
      [processId, s.email, s.name, s.sign_order, uuidv4()]
    );
  }

  logAudit({
    signingProcessId: processId,
    userId: req.userId!,
    action: 'process_created',
    details: `Created signing process "${title}" with ${signers.length} signers`,
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
  });

  const process = getOne('SELECT * FROM signing_processes WHERE id = ?', [processId]);
  const savedSigners = getAll('SELECT * FROM signers WHERE signing_process_id = ? ORDER BY sign_order', [processId]);

  res.status(201).json({ process, signers: savedSigners });
});

router.get('/:id', (req: AuthRequest, res) => {
  const process = getOne('SELECT * FROM signing_processes WHERE id = ? AND creator_id = ?', [Number(req.params.id), req.userId!]);
  if (!process) {
    return res.status(404).json({ error: '签署流程不存在' });
  }

  const signers = getAll('SELECT * FROM signers WHERE signing_process_id = ? ORDER BY sign_order', [process.id]);
  const fields = getAll('SELECT * FROM fields WHERE signing_process_id = ?', [process.id]);
  const doc = getOne('SELECT * FROM documents WHERE id = ?', [process.document_id]);

  res.json({ process, signers, fields, document: doc });
});

router.get('/:id/audit', (req: AuthRequest, res) => {
  const process = getOne('SELECT * FROM signing_processes WHERE id = ? AND creator_id = ?', [Number(req.params.id), req.userId!]);
  if (!process) {
    return res.status(404).json({ error: '签署流程不存在' });
  }

  const logs = getAuditLogs(process.id);
  res.json({ logs });
});

router.put('/:id/fields', (req: AuthRequest, res) => {
  const process = getOne('SELECT * FROM signing_processes WHERE id = ? AND creator_id = ?', [Number(req.params.id), req.userId!]);
  if (!process) {
    return res.status(404).json({ error: '签署流程不存在' });
  }

  const { fields } = req.body;
  if (!Array.isArray(fields)) {
    return res.status(400).json({ error: '字段数据格式错误' });
  }

  runQuery('DELETE FROM fields WHERE signing_process_id = ?', [process.id]);
  for (const f of fields) {
    runInsert(
      'INSERT INTO fields (signing_process_id, signer_id, type, page, x, y, width, height, required) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [process.id, f.signer_id, f.type, f.page, f.x, f.y, f.width, f.height, f.required ? 1 : 0]
    );
  }

  const savedFields = getAll('SELECT * FROM fields WHERE signing_process_id = ?', [process.id]);
  res.json({ fields: savedFields });
});

router.post('/:id/send', async (req: AuthRequest, res) => {
  const process = getOne('SELECT * FROM signing_processes WHERE id = ? AND creator_id = ?', [Number(req.params.id), req.userId!]);
  if (!process) {
    return res.status(404).json({ error: '签署流程不存在' });
  }
  if (process.status !== 'draft') {
    return res.status(400).json({ error: '该流程已发送' });
  }

  const fields = getAll('SELECT * FROM fields WHERE signing_process_id = ?', [process.id]);
  if (fields.length === 0) {
    return res.status(400).json({ error: '请先添加签署字段' });
  }

  runQuery("UPDATE signing_processes SET status = 'in_progress', updated_at = datetime('now') WHERE id = ?", [process.id]);

  const firstSigner = getOne("SELECT * FROM signers WHERE signing_process_id = ? AND status = 'pending' ORDER BY sign_order LIMIT 1", [process.id]);
  if (firstSigner) {
    runQuery("UPDATE signers SET status = 'notified' WHERE id = ?", [firstSigner.id]);
    sendSigningEmail(firstSigner.email, firstSigner.name, firstSigner.token);

    logAudit({
      signingProcessId: process.id,
      signerId: firstSigner.id,
      userId: req.userId!,
      action: 'signer_notified',
      details: `Notification sent to ${firstSigner.name} <${firstSigner.email}>`,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  logAudit({
    signingProcessId: process.id,
    userId: req.userId!,
    action: 'process_sent',
    details: 'Signing process sent for signatures',
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
  });

  triggerWebhooks(req.userId!, 'process.sent', { processId: process.id, title: process.title });

  res.json({ success: true, message: '签署流程已发送' });
});

router.post('/:id/remind/:signerId', async (req: AuthRequest, res) => {
  const process = getOne('SELECT * FROM signing_processes WHERE id = ? AND creator_id = ?', [Number(req.params.id), req.userId!]);
  if (!process) {
    return res.status(404).json({ error: '签署流程不存在' });
  }

  const signer = getOne("SELECT * FROM signers WHERE id = ? AND signing_process_id = ? AND status IN ('notified', 'pending')", [Number(req.params.signerId), process.id]);
  if (!signer) {
    return res.status(404).json({ error: '签署人不存在或无需提醒' });
  }

  sendReminderEmail(signer.email, signer.name, signer.token, process.title);

  logAudit({
    signingProcessId: process.id,
    signerId: signer.id,
    userId: req.userId!,
    action: 'signer_notified',
    details: `Reminder sent to ${signer.name} <${signer.email}>`,
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
  });

  res.json({ success: true, message: '提醒已发送' });
});

router.delete('/:id', (req: AuthRequest, res) => {
  const process = getOne('SELECT * FROM signing_processes WHERE id = ? AND creator_id = ?', [Number(req.params.id), req.userId!]);
  if (!process) {
    return res.status(404).json({ error: '签署流程不存在' });
  }

  runQuery('DELETE FROM audit_logs WHERE signing_process_id = ?', [process.id]);
  runQuery('DELETE FROM fields WHERE signing_process_id = ?', [process.id]);
  runQuery('DELETE FROM signers WHERE signing_process_id = ?', [process.id]);
  runQuery('DELETE FROM signing_processes WHERE id = ?', [process.id]);

  res.json({ success: true });
});

router.get('/:id/download', (req: AuthRequest, res) => {
  const process = getOne('SELECT * FROM signing_processes WHERE id = ? AND creator_id = ?', [Number(req.params.id), req.userId!]);
  if (!process) {
    return res.status(404).json({ error: '签署流程不存在' });
  }
  if (process.status !== 'completed' || !process.final_document_path) {
    return res.status(400).json({ error: '签署尚未完成或文档未生成' });
  }

  const path = require('path');
  const fs = require('fs');
  const filepath = path.join(__dirname, '../../', process.final_document_path);
  if (!fs.existsSync(filepath)) {
    return res.status(404).json({ error: '文件不存在' });
  }

  logAudit({
    signingProcessId: process.id,
    userId: req.userId!,
    action: 'document_downloaded',
    details: 'Final signed document downloaded',
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
  });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="signed_${process.title}.pdf"`);
  res.sendFile(filepath);
});

export default router;
