import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';

describe('API Foundation Endpoints', () => {
  const app = createApp();

  describe('Health Probes (OPS-01)', () => {
    it('GET /api/v1/health/live should return 200 with process liveness status', async () => {
      const res = await request(app).get('/api/v1/health/live');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('success', true);
      expect(res.body).toHaveProperty('data');
      expect(res.body.data.status).toBe('ok');
      expect(res.body.data).toHaveProperty('uptime');
      expect(res.body.data).toHaveProperty('timestamp');
    });

    it('GET /api/v1/health/ready should return 503 when database is disconnected', async () => {
      const res = await request(app).get('/api/v1/health/ready');

      // Database is disconnected in this unit suite
      expect(res.status).toBe(503);
      expect(res.body).toHaveProperty('success', false);
      expect(res.body.data.status).toBe('not_ready');
      expect(res.body.data.database.status).toBe('disconnected');
    });

    it('GET /api/v1/health should return 503 degraded status when database is disconnected', async () => {
      const res = await request(app).get('/api/v1/health');

      expect(res.status).toBe(503);
      expect(res.body).toHaveProperty('success', false);
      expect(res.body).toHaveProperty('data');
      expect(res.body.data.status).toBe('degraded');
      expect(res.body.data).toHaveProperty('environment');
      expect(res.body.data.database.status).toBe('disconnected');
    });
  });

  describe('404 Not Found Handling', () => {
    it('should return standardized 404 error envelope for nonexistent route', async () => {
      const res = await request(app).get('/api/v1/nonexistent-route-xyz');

      expect(res.status).toBe(404);
      expect(res.body).toEqual({
        success: false,
        message: 'Cannot GET /api/v1/nonexistent-route-xyz - Route not found',
      });
    });
  });

  describe('Validation & Authorization Handling', () => {
    it('should return 400 with validation details when registering invalid user payload', async () => {
      const res = await request(app).post('/api/v1/users/register').send({
        username: 'a', // Too short
        email: 'invalid-email',
        password: 'short',
      });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('Validation failed');
      expect(Array.isArray(res.body.errors)).toBe(true);
      expect(res.body.errors.length).toBeGreaterThan(0);
    });

    it('should return 401 when creating room without authentication token', async () => {
      const res = await request(app).post('/api/v1/rooms').send({
        name: 'Cool Room',
        capacity: 999,
      });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('Authentication token is required');
    });
  });
});
