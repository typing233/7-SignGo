import jwt from 'jsonwebtoken';

const SECRET = process.env.JWT_SECRET || 'signgo-dev-secret-change-in-prod';

export function signToken(userId: number): string {
  return jwt.sign({ userId }, SECRET, { expiresIn: '7d' });
}

export function verifyToken(token: string): { userId: number } {
  return jwt.verify(token, SECRET) as { userId: number };
}
