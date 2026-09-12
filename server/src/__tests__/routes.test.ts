import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../server';

describe('API Route Integration Tests', () => {
  describe('GET /api/health', () => {
    it('should return 200 OK with status ok and timestamp', async () => {
      const res = await request(app).get('/api/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.timestamp).toBeDefined();
    });
  });

  describe('POST /api/projects validation', () => {
    it('should return 400 Bad Request when project name is empty', async () => {
      const res = await request(app).post('/api/projects').send({ name: '' });
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should return 400 Bad Request when projectUrl is invalid URL', async () => {
      const res = await request(app).post('/api/projects').send({ name: 'Valid Project', projectUrl: 'invalid-url' });
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  describe('POST /api/test-cases/bulk-delete validation', () => {
    it('should return 400 Bad Request when ids array is missing or empty', async () => {
      const res = await request(app).post('/api/test-cases/bulk-delete').send({ ids: [] });
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  describe('GET /api/automation validation', () => {
    it('should return 400 Bad Request when projectId query param is missing', async () => {
      const res = await request(app).get('/api/automation');
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });
});
