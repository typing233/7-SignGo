import { Router } from 'express';
import path from 'path';
import fs from 'fs';
import { getOne, getAll, runQuery } from '../db/connection';
import { sendSigningEmail, sendCompletionEmail, sendRejectionEmail, triggerWebhooks } from '../services/email';
import { logAudit } from '../services/audit';
import { generateFinalDocument } from '../services/document';

const router = Router();

function checkExpiry(process: any): boolean {
  if (!process.expires_at) return false;
  return new Date(process.expires_at) < new Date();
}

router.get('/sign/:token', (req, res) => {
  const signer = getOne('SELECT * FROM signers WHERE token = ?', [req.params.token]);
  if (!signer) {
    return res.status(404).json({ error: '签署链接无效' });
  }

  const process = getOne('SELECT * FROM signing_processes WHERE id = ?', [signer.signing_process_id]);

  if (checkExpiry(process) && process.status === 'in_progress') {
    runQuery("UPDATE signing_processes SET status = 'expired', updated_at = datetime('now') WHERE id = ?", [process.id]);
    logAudit({ signingProcessId: process.id, action: 'process_expired', details: 'Process expired' });
    return res.status(410).json({ error: '签署流程已过期' });
  }

  if (process.status === 'expired') {
    return res.status(410).json({ error: '签署流程已过期' });
  }
  if (process.status === 'rejected') {
    return res.status(410).json({ error: '签署流程已被拒绝' });
  }
  if (signer.status === 'signed') {
    return res.status(400).json({ error: '您已完成签署', alreadySigned: true });
  }
  if (signer.status === 'rejected') {
    return res.status(400).json({ error: '您已拒绝签署' });
  }

  const doc = getOne('SELECT * FROM documents WHERE id = ?', [process.document_id]);
  const fields = getAll('SELECT * FROM fields WHERE signing_process_id = ? AND signer_id = ?', [process.id, signer.id]);

  const prevSigners = getAll(
    "SELECT * FROM signers WHERE signing_process_id = ? AND sign_order < ? AND status != 'signed'",
    [process.id, signer.sign_order]
  );
  if (prevSigners.length > 0) {
    return res.status(403).json({ error: '请等待前面的签署人完成' });
  }

  logAudit({
    signingProcessId: process.id,
    signerId: signer.id,
    action: 'signer_viewed',
    details: `${signer.name} viewed the document`,
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
  });

  const allSigners = getAll('SELECT id, name, email, sign_order, status, signed_at FROM signers WHERE signing_process_id = ? ORDER BY sign_order', [process.id]);

  res.json({
    signer: { id: signer.id, name: signer.name, email: signer.email },
    process: { id: process.id, title: process.title, status: process.status, expires_at: process.expires_at },
    document: { id: doc.id, title: doc.title },
    fields,
    signers: allSigners,
  });
});

router.get('/sign/:token/file', (req, res) => {
  const signer = getOne('SELECT * FROM signers WHERE token = ?', [req.params.token]);
  if (!signer) {
    return res.status(404).json({ error: '签署链接无效' });
  }

  const process = getOne('SELECT * FROM signing_processes WHERE id = ?', [signer.signing_process_id]);
  const doc = getOne('SELECT * FROM documents WHERE id = ?', [process.document_id]);

  const filepath = path.join(__dirname, '../../uploads', doc.filepath);
  if (!fs.existsSync(filepath)) {
    return res.status(404).json({ error: '文件不存在' });
  }

  res.setHeader('Content-Type', 'application/pdf');
  res.sendFile(filepath);
});

router.post('/sign/:token/complete', async (req, res) => {
  const signer = getOne('SELECT * FROM signers WHERE token = ?', [req.params.token]);
  if (!signer) {
    return res.status(404).json({ error: '签署链接无效' });
  }
  if (signer.status === 'signed') {
    return res.status(400).json({ error: '您已完成签署' });
  }

  const process = getOne('SELECT * FROM signing_processes WHERE id = ?', [signer.signing_process_id]);

  if (checkExpiry(process)) {
    runQuery("UPDATE signing_processes SET status = 'expired', updated_at = datetime('now') WHERE id = ?", [process.id]);
    return res.status(410).json({ error: '签署流程已过期' });
  }
  if (process.status !== 'in_progress') {
    return res.status(400).json({ error: '签署流程状态异常' });
  }

  const { fields } = req.body;
  if (!Array.isArray(fields)) {
    return res.status(400).json({ error: '字段数据格式错误' });
  }

  for (const f of fields) {
    runQuery('UPDATE fields SET value = ? WHERE id = ? AND signer_id = ?', [f.value, f.id, signer.id]);
  }
  runQuery("UPDATE signers SET status = 'signed', signed_at = datetime('now') WHERE id = ?", [signer.id]);

  logAudit({
    signingProcessId: process.id,
    signerId: signer.id,
    action: 'signer_signed',
    details: `${signer.name} signed the document`,
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
  });

  const nextSigner = getOne(
    "SELECT * FROM signers WHERE signing_process_id = ? AND status = 'pending' ORDER BY sign_order LIMIT 1",
    [process.id]
  );

  if (nextSigner) {
    runQuery("UPDATE signers SET status = 'notified' WHERE id = ?", [nextSigner.id]);
    sendSigningEmail(nextSigner.email, nextSigner.name, nextSigner.token);
    logAudit({
      signingProcessId: process.id,
      signerId: nextSigner.id,
      action: 'signer_notified',
      details: `Notification sent to ${nextSigner.name}`,
    });
  } else {
    runQuery("UPDATE signing_processes SET status = 'completed', updated_at = datetime('now') WHERE id = ?", [process.id]);

    logAudit({
      signingProcessId: process.id,
      action: 'process_completed',
      details: 'All signers completed signing',
    });

    const finalPath = await generateFinalDocument(process.id);
    if (finalPath) {
      runQuery("UPDATE signing_processes SET final_document_path = ? WHERE id = ?", [finalPath, process.id]);
      logAudit({
        signingProcessId: process.id,
        action: 'document_generated',
        details: 'Final signed document generated',
      });
    }

    const creator = getOne('SELECT * FROM users WHERE id = ?', [process.creator_id]);
    if (creator) {
      sendCompletionEmail(creator.email, creator.name, process.title);
    }

    triggerWebhooks(process.creator_id, 'process.completed', { processId: process.id, title: process.title });
  }

  triggerWebhooks(process.creator_id, 'signer.signed', {
    processId: process.id,
    signerName: signer.name,
    signerEmail: signer.email,
  });

  res.json({ success: true, message: '签署完成' });
});

router.post('/sign/:token/reject', async (req, res) => {
  const signer = getOne('SELECT * FROM signers WHERE token = ?', [req.params.token]);
  if (!signer) {
    return res.status(404).json({ error: '签署链接无效' });
  }
  if (signer.status === 'signed') {
    return res.status(400).json({ error: '您已完成签署，无法拒绝' });
  }
  if (signer.status === 'rejected') {
    return res.status(400).json({ error: '您已拒绝签署' });
  }

  const { reason } = req.body;

  runQuery("UPDATE signers SET status = 'rejected', rejected_at = datetime('now'), reject_reason = ? WHERE id = ?", [reason || null, signer.id]);

  const process = getOne('SELECT * FROM signing_processes WHERE id = ?', [signer.signing_process_id]);
  runQuery("UPDATE signing_processes SET status = 'rejected', updated_at = datetime('now') WHERE id = ?", [process.id]);

  logAudit({
    signingProcessId: process.id,
    signerId: signer.id,
    action: 'signer_rejected',
    details: `${signer.name} rejected signing. Reason: ${reason || 'No reason given'}`,
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
  });

  const creator = getOne('SELECT * FROM users WHERE id = ?', [process.creator_id]);
  if (creator) {
    sendRejectionEmail(creator.email, creator.name, process.title, signer.name, reason || '');
  }

  triggerWebhooks(process.creator_id, 'signer.rejected', {
    processId: process.id,
    signerName: signer.name,
    signerEmail: signer.email,
    reason: reason || '',
  });

  res.json({ success: true, message: '已拒绝签署' });
});

export default router;
