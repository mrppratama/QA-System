import './env';
import express from 'express';
import cors from 'cors';

import aiRoutes from './routes/ai';
import excelRoutes from './routes/excel';
import projectRoutes from './routes/projects';
import testCasesRoutes from './routes/test-cases';
import automationRoutes from './routes/automation';
import { requireAuth } from './middleware/auth';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:5173',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Everything below requires a valid Supabase session (health check above stays public)
app.use('/api', requireAuth);

// Routes
app.use('/api/ai', aiRoutes);
app.use('/api/excel', excelRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/test-cases', testCasesRoutes);
app.use('/api/automation', automationRoutes);

// Global error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[Server Error]', err);
  res.status(500).json({
    success: false,
    error: err.message || 'Internal server error',
  });
});

// Vercel invokes the exported app as a request handler directly; it never
// needs (or wants) a bound listener inside the serverless function.
if (!process.env.VERCEL && process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`✓ Server running on http://localhost:${PORT}`);
  });
}

export default app;
