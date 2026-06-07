import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getOne, getAll, runInsert, runQuery } from '../db/connection';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { sendSigningEmail } from '../services/email';

const router = Router();

router.use(authMiddleware);

router.get('/', (req: AuthRequest, res) => {
  const processes = getAll(`
    SELECT sp.*, d.title as document_title
    FROM signing_processes sp
    JOIN documents d ON sp.document_id = d.id
    WHERE sp.creator_id = ?
    ORDER BY sp.created_at DESC
  `, [req.userId!]);
  res.json({ processes });
});

router.post('/', (req: AuthRequest, res) => {
  const { document_id, title, signers } = req.body;
  if (!document_id || !title || !signers || !signers.length) {
    return res.status(400).json({ error: '请填写所有必要信息' });
  }

  const doc = getOne('SELECT * FROM documents WHERE id = ? AND user_id = ?', [document_id, req.userId!]);
  if (!doc) {
    return res.status(404).json({ error: '文档不存在' });
  }

  const processId = runInsert(
    'INSERT INTO signing_processes (document_id, creator_id, title) VALUES (?, ?, ?)',
    [document_id, req.userId!, title]
  );

  for (const s of signers) {
    runInsert(
      'INSERT INTO signers (signing_process_id, email, name, sign_order, token) VALUES (?, ?, ?, ?, ?)',
      [processId, s.email, s.name, s.sign_order, uuidv4()]
    );
  }

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

router.post('/:id/send', (req: AuthRequest, res) => {
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
  }

  res.json({ success: true, message: '签署流程已发送' });
});

router.delete('/:id', (req: AuthRequest, res) => {
  const process = getOne('SELECT * FROM signing_processes WHERE id = ? AND creator_id = ?', [Number(req.params.id), req.userId!]);
  if (!process) {
    return res.status(404).json({ error: '签署流程不存在' });
  }

  runQuery('DELETE FROM fields WHERE signing_process_id = ?', [process.id]);
  runQuery('DELETE FROM signers WHERE signing_process_id = ?', [process.id]);
  runQuery('DELETE FROM signing_processes WHERE id = ?', [process.id]);

  res.json({ success: true });
});

export default router;
