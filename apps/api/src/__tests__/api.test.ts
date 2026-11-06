import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';

describe('API Foundation Endpoints', () => {
  const app = createApp();

  describe('GET /api/v1/health', () => {
    it('should return health status payload with expected structure', async () => {
      const res = await request(app).get('/api/v1/health');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('success', true);
      expect(res.body).toHaveProperty('data');
      expect(res.body.data).toHaveProperty('status');
      expect(res.body.data).toHaveProperty('environment');
      expect(res.body.data).toHaveProperty('timestamp');
      expect(res.body.data).toHaveProperty('database');
      expect(res.body.data.database).toHaveProperty('status');
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

  describe('Validation Error Handling', () => {
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

    it('should return 400 when creating room with invalid capacity', async () => {
      const res = await request(app).post('/api/v1/rooms').send({
        name: 'Cool Room',
        capacity: 999, // Exceeds max 50
      });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('Validation failed');
    });
  });
});
