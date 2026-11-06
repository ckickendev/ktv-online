import { Router, Request, Response } from 'express';
import { env } from '../config/env.js';
import { getDatabaseStatus } from '../database/connection.js';
import { sendSuccess } from '../utils/response.js';
import { HealthStatusDto, LivenessStatusDto, ReadinessStatusDto } from '@ktv/contracts';

export const healthRoutes = Router();

// Liveness probe: returns 200 if the Node.js process is responsive
healthRoutes.get('/health/live', (_req: Request, res: Response) => {
  const data: LivenessStatusDto = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  };

  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  sendSuccess(res, data, 'Application process is alive', 200);
});

// Readiness probe: returns 200 only if MongoDB is connected; returns 503 if unavailable
healthRoutes.get('/health/ready', (_req: Request, res: Response) => {
  const dbStatus = getDatabaseStatus();
  const isReady = dbStatus === 'connected';

  const data: ReadinessStatusDto = {
    status: isReady ? 'ready' : 'not_ready',
    timestamp: new Date().toISOString(),
    database: {
      status: dbStatus,
    },
  };

  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

  if (!isReady) {
    res.status(503).json({
      success: false,
      message: 'Service is not ready: database is disconnected',
      data,
    });
    return;
  }

  sendSuccess(res, data, 'Service is ready to handle traffic', 200);
});

// Consolidated health check
healthRoutes.get('/health', (_req: Request, res: Response) => {
  const dbStatus = getDatabaseStatus();
  const isHealthy = dbStatus === 'connected';

  const healthData: HealthStatusDto = {
    status: isHealthy ? 'ok' : 'degraded',
    environment: env.NODE_ENV,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    database: {
      status: dbStatus,
      name: 'ktv_online',
    },
  };

  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

  if (!isHealthy) {
    res.status(503).json({
      success: false,
      message: 'Service degraded (database unavailable)',
      data: healthData,
    });
    return;
  }

  sendSuccess(res, healthData, 'Service healthy', 200);
});
