import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { getOne, runInsert } from '../db/connection';
import { signToken } from '../utils/token';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();

router.post('/register', (req, res) => {
  const { email, name, password } = req.body;
  if (!email || !name || !password) {
    return res.status(400).json({ error: '请填写所有字段' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: '密码至少6个字符' });
  }

  const existing = getOne('SELECT id FROM users WHERE email = ?', [email]);
  if (existing) {
    return res.status(409).json({ error: '该邮箱已注册' });
  }

  const passwordHash = bcrypt.hashSync(password, 10);
  const id = runInsert('INSERT INTO users (email, name, password_hash) VALUES (?, ?, ?)', [email, name, passwordHash]);
  const token = signToken(id);

  res.status(201).json({
    token,
    user: { id, email, name },
  });
});

router.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: '请填写邮箱和密码' });
  }

  const user = getOne('SELECT * FROM users WHERE email = ?', [email]);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: '邮箱或密码错误' });
  }

  const token = signToken(user.id);
  res.json({
    token,
    user: { id: user.id, email: user.email, name: user.name },
  });
});

router.get('/me', authMiddleware, (req: AuthRequest, res) => {
  const user = getOne('SELECT id, email, name, created_at FROM users WHERE id = ?', [req.userId!]);
  if (!user) {
    return res.status(404).json({ error: '用户不存在' });
  }
  res.json({ user });
});

export default router;
