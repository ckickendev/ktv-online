import http from 'http';
import { createApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './utils/logger.js';
import { connectDatabase, disconnectDatabase } from './database/connection.js';

import { setAppShuttingDown } from './utils/lifecycle.js';
import { createSocketServer, closeSocketServer } from './realtime/index.js';

import { voiceEvictionWorker } from './modules/voice/voice-eviction.worker.js';
import { songService } from './modules/karaoke/song.service.js';

async function bootstrap() {
  const app = createApp();
  const server = http.createServer(app);

  // Initialize Socket.IO server bound to HTTP server
  createSocketServer(server);

  // Attempt database connection
  await connectDatabase();

  // Initialize fixture song catalog
  try {
    await songService.ensureSeedSongs();
    logger.info('🎶 Karaoke song catalog initialized');
  } catch (err) {
    logger.error({ err }, 'Failed to initialize karaoke song catalog');
  }

  // Start voice eviction background recovery worker
  voiceEvictionWorker.start();

  server.listen(env.PORT, () => {
    logger.info(`🚀 KTV Online API server running at http://localhost:${env.PORT}`);
    logger.info(`⚡ Realtime Socket.IO server initialized`);
    logger.info(`📡 Health endpoint available at http://localhost:${env.PORT}/api/v1/health`);
    logger.info(`🌍 Environment: ${env.NODE_ENV}`);
  });

  let isShuttingDown = false;

  const handleShutdown = async (signal: string) => {
    if (isShuttingDown) {
      logger.warn(`Shutdown already in progress, ignoring duplicate ${signal}`);
      return;
    }
    isShuttingDown = true;
    setAppShuttingDown(true);

    logger.info(`Received ${signal}, initiating graceful shutdown...`);

    // 1. Stop background workers
    await voiceEvictionWorker.stop();

    // 2. Close Socket.IO connections
    await closeSocketServer();

    // 3. Stop accepting new HTTP connections
    server.close(async () => {
      logger.info('HTTP server closed');
      await disconnectDatabase();
      logger.info('Clean exit completed');
      process.exit(0);
    });

    // Bounded timeout: force exit after 10 seconds if hanging
    setTimeout(() => {
      logger.error('Graceful shutdown timed out, forcing exit');
      process.exit(1);
    }, 10000).unref();
  };

  process.on('SIGTERM', () => handleShutdown('SIGTERM'));
  process.on('SIGINT', () => handleShutdown('SIGINT'));

  process.on('unhandledRejection', (reason) => {
    logger.fatal({ reason }, 'Unhandled Promise Rejection detected');
    process.exit(1);
  });

  process.on('uncaughtException', (err) => {
    logger.fatal({ err }, 'Uncaught Exception detected');
    process.exit(1);
  });
}

bootstrap().catch((err) => {
  logger.fatal({ err }, 'Failed to start KTV Online API application');
  process.exit(1);
});
