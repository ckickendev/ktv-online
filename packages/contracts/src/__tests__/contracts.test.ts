import { describe, it, expect } from 'vitest';
import {
  CreateUserSchema,
  CreateRoomSchema,
  RoomStatusSchema,
  HealthStatusSchema,
} from '../index.js';

describe('Contracts & Schema Validation', () => {
  it('should validate valid CreateUser payload', () => {
    const payload = {
      username: 'karaoke_king',
      email: 'singer@ktv.test',
      password: 'SuperSecretPassword123!',
    };

    const result = CreateUserSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  it('should reject invalid username with special characters', () => {
    const payload = {
      username: 'invalid user*!',
      email: 'singer@ktv.test',
      password: 'SuperSecretPassword123!',
    };

    const result = CreateUserSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });

  it('should apply defaults for CreateRoom schema', () => {
    const payload = {
      name: 'Cyberpunk Karaoke Room',
    };

    const parsed = CreateRoomSchema.parse(payload);
    expect(parsed.roomType).toBe('standard');
    expect(parsed.visibility).toBe('public');
    expect(parsed.capacity).toBe(10);
    expect(parsed.category).toBe('all');
  });

  it('should validate RoomStatus enum', () => {
    expect(RoomStatusSchema.safeParse('singing').success).toBe(true);
    expect(RoomStatusSchema.safeParse('invalid_status').success).toBe(false);
  });

  it('should validate HealthStatus schema', () => {
    const health = {
      status: 'ok',
      environment: 'development',
      timestamp: new Date().toISOString(),
      uptime: 120.4,
      database: {
        status: 'connected',
        name: 'ktv_online',
        latencyMs: 4,
      },
    };

    const result = HealthStatusSchema.safeParse(health);
    expect(result.success).toBe(true);
  });
});
