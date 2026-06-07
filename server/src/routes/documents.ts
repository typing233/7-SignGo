import { Router } from 'express';
import path from 'path';
import fs from 'fs';
import { getOne, getAll, runInsert, runQuery } from '../db/connection';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { upload } from '../middleware/upload';

const router = Router();

router.use(authMiddleware);

router.get('/', (req: AuthRequest, res) => {
  const docs = getAll('SELECT * FROM documents WHERE user_id = ? ORDER BY created_at DESC', [req.userId!]);
  res.json({ documents: docs });
});

router.post('/upload', upload.single('file'), (req: AuthRequest, res) => {
  if (!req.file) {
    return res.status(400).json({ error: '请上传PDF文件' });
  }

  const title = req.body.title || req.file.originalname.replace('.pdf', '');
  const id = runInsert(
    'INSERT INTO documents (user_id, title, filename, filepath, page_count) VALUES (?, ?, ?, ?, ?)',
    [req.userId!, title, req.file.originalname, req.file.filename, 1]
  );

  const doc = getOne('SELECT * FROM documents WHERE id = ?', [id]);
  res.status(201).json({ document: doc });
});

router.get('/:id', (req: AuthRequest, res) => {
  const doc = getOne('SELECT * FROM documents WHERE id = ? AND user_id = ?', [Number(req.params.id), req.userId!]);
  if (!doc) {
    return res.status(404).json({ error: '文档不存在' });
  }
  res.json({ document: doc });
});

router.patch('/:id', (req: AuthRequest, res) => {
  const { title } = req.body;
  if (!title) {
    return res.status(400).json({ error: '请提供新标题' });
  }

  const doc = getOne('SELECT * FROM documents WHERE id = ? AND user_id = ?', [Number(req.params.id), req.userId!]);
  if (!doc) {
    return res.status(404).json({ error: '文档不存在' });
  }

  runQuery("UPDATE documents SET title = ?, updated_at = datetime('now') WHERE id = ?", [title, doc.id]);
  const updated = getOne('SELECT * FROM documents WHERE id = ?', [doc.id]);
  res.json({ document: updated });
});

router.delete('/:id', (req: AuthRequest, res) => {
  const doc = getOne('SELECT * FROM documents WHERE id = ? AND user_id = ?', [Number(req.params.id), req.userId!]);
  if (!doc) {
    return res.status(404).json({ error: '文档不存在' });
  }

  const activeProcess = getOne("SELECT id FROM signing_processes WHERE document_id = ? AND status = 'in_progress'", [doc.id]);
  if (activeProcess) {
    return res.status(400).json({ error: '该文档有进行中的签署流程，无法删除' });
  }

  const filepath = path.join(__dirname, '../../uploads', doc.filepath);
  if (fs.existsSync(filepath)) fs.unlinkSync(filepath);

  runQuery('DELETE FROM documents WHERE id = ?', [doc.id]);
  res.json({ success: true });
});

router.get('/:id/file', (req: AuthRequest, res) => {
  const doc = getOne('SELECT * FROM documents WHERE id = ? AND user_id = ?', [Number(req.params.id), req.userId!]);
  if (!doc) {
    return res.status(404).json({ error: '文档不存在' });
  }

  const filepath = path.join(__dirname, '../../uploads', doc.filepath);
  if (!fs.existsSync(filepath)) {
    return res.status(404).json({ error: '文件不存在' });
  }

  res.setHeader('Content-Type', 'application/pdf');
  res.sendFile(filepath);
});

export default router;
