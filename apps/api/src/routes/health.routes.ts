import { Router, Request, Response } from 'express';
import { env } from '../config/env.js';
import { getDatabaseStatus } from '../database/connection.js';
import { sendSuccess } from '../utils/response.js';
import { HealthStatusDto } from '@ktv/contracts';

export const healthRoutes = Router();

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

  const statusCode = isHealthy ? 200 : 200; // Or 200 degraded so health monitors distinguish app up vs db
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  sendSuccess(res, healthData, isHealthy ? 'Service healthy' : 'Service degraded (database unavailable)', statusCode);
});
