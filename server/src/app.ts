import express from 'express';
import cors from 'cors';
import path from 'path';
import authRoutes from './routes/auth';
import documentRoutes from './routes/documents';
import signingRoutes from './routes/signing';
import publicRoutes from './routes/public';

const app = express();

app.use(cors());
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/signing', signingRoutes);
app.use('/api/public', publicRoutes);

app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

export default app;
