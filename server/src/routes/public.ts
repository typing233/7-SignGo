import { Router } from 'express';
import path from 'path';
import fs from 'fs';
import { getOne, getAll, runQuery } from '../db/connection';
import { sendSigningEmail } from '../services/email';

const router = Router();

router.get('/sign/:token', (req, res) => {
  const signer = getOne('SELECT * FROM signers WHERE token = ?', [req.params.token]);
  if (!signer) {
    return res.status(404).json({ error: '签署链接无效' });
  }
  if (signer.status === 'signed') {
    return res.status(400).json({ error: '您已完成签署' });
  }

  const process = getOne('SELECT * FROM signing_processes WHERE id = ?', [signer.signing_process_id]);
  const doc = getOne('SELECT * FROM documents WHERE id = ?', [process.document_id]);
  const fields = getAll('SELECT * FROM fields WHERE signing_process_id = ? AND signer_id = ?', [process.id, signer.id]);

  const prevSigners = getAll(
    "SELECT * FROM signers WHERE signing_process_id = ? AND sign_order < ? AND status != 'signed'",
    [process.id, signer.sign_order]
  );
  if (prevSigners.length > 0) {
    return res.status(403).json({ error: '请等待前面的签署人完成' });
  }

  res.json({
    signer: { id: signer.id, name: signer.name, email: signer.email },
    process: { id: process.id, title: process.title },
    document: { id: doc.id, title: doc.title },
    fields,
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

router.post('/sign/:token/complete', (req, res) => {
  const signer = getOne('SELECT * FROM signers WHERE token = ?', [req.params.token]);
  if (!signer) {
    return res.status(404).json({ error: '签署链接无效' });
  }
  if (signer.status === 'signed') {
    return res.status(400).json({ error: '您已完成签署' });
  }

  const { fields } = req.body;
  if (!Array.isArray(fields)) {
    return res.status(400).json({ error: '字段数据格式错误' });
  }

  for (const f of fields) {
    runQuery('UPDATE fields SET value = ? WHERE id = ? AND signer_id = ?', [f.value, f.id, signer.id]);
  }
  runQuery("UPDATE signers SET status = 'signed', signed_at = datetime('now') WHERE id = ?", [signer.id]);

  const process = getOne('SELECT * FROM signing_processes WHERE id = ?', [signer.signing_process_id]);

  const nextSigner = getOne(
    "SELECT * FROM signers WHERE signing_process_id = ? AND status = 'pending' ORDER BY sign_order LIMIT 1",
    [process.id]
  );

  if (nextSigner) {
    runQuery("UPDATE signers SET status = 'notified' WHERE id = ?", [nextSigner.id]);
    sendSigningEmail(nextSigner.email, nextSigner.name, nextSigner.token);
  } else {
    runQuery("UPDATE signing_processes SET status = 'completed', updated_at = datetime('now') WHERE id = ?", [process.id]);
    console.log(`✅ 签署流程 "${process.title}" 已全部完成！`);
  }

  res.json({ success: true, message: '签署完成' });
});

export default router;
