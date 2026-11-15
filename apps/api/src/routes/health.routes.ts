import { Router, Request, Response } from 'express';
import mongoose from 'mongoose';
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

import { isAppShuttingDown } from '../utils/lifecycle.js';
import { isTransactionSupported, isProductionOrStaging } from '../database/transaction.js';

// Readiness probe: returns 200 only if MongoDB is connected, topology is valid, and process is not shutting down
healthRoutes.get('/health/ready', (_req: Request, res: Response) => {
  const dbStatus = getDatabaseStatus();
  const shuttingDown = isAppShuttingDown();
  const txSupported = isTransactionSupported();
  const topologyValid = !isProductionOrStaging() || txSupported;
  const isReady = dbStatus === 'connected' && !shuttingDown && topologyValid;

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
      message: shuttingDown
        ? 'Service is shutting down'
        : !topologyValid
          ? 'Service is not ready: replica set transactions are required in production and staging'
          : 'Service is not ready: database is disconnected',
      data,
    });
    return;
  }

  sendSuccess(res, data, 'Service is ready to handle traffic', 200);
});

// Consolidated health check
healthRoutes.get('/health', (_req: Request, res: Response) => {
  const dbStatus = getDatabaseStatus();
  const shuttingDown = isAppShuttingDown();
  const isHealthy = dbStatus === 'connected' && !shuttingDown;

  const healthData: HealthStatusDto = {
    status: isHealthy ? 'ok' : 'degraded',
    environment: env.NODE_ENV,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    database: {
      status: dbStatus,
      name: mongoose.connection.db?.databaseName || env.MONGODB_DB_NAME,
    },
  };

  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

  if (!isHealthy) {
    res.status(503).json({
      success: false,
      message: shuttingDown ? 'Service is shutting down' : 'Service degraded (database unavailable)',
      data: healthData,
    });
    return;
  }

  sendSuccess(res, healthData, 'Service healthy', 200);
});

// Voice service configuration probe: returns 200 if LiveKit credentials are configured, 503 if unconfigured
healthRoutes.get('/health/voice', (_req: Request, res: Response) => {
  const isConfigured = Boolean(env.LIVEKIT_URL && env.LIVEKIT_API_KEY && env.LIVEKIT_API_SECRET);

  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

  if (!isConfigured) {
    res.status(503).json({
      success: false,
      message: 'LiveKit voice service is not configured on this server',
      data: {
        status: 'not_configured',
        configured: false,
      },
    });
    return;
  }

  sendSuccess(
    res,
    {
      status: 'configured',
      configured: true,
    },
    'LiveKit voice service is configured',
    200
  );
});
