import http from 'http';
import { createApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './utils/logger.js';
import { connectDatabase, disconnectDatabase } from './database/connection.js';

async function bootstrap() {
  const app = createApp();
  const server = http.createServer(app);

  // Attempt database connection
  await connectDatabase();

  server.listen(env.PORT, () => {
    logger.info(`🚀 KTV Online API server running at http://localhost:${env.PORT}`);
    logger.info(`📡 Health endpoint available at http://localhost:${env.PORT}/api/v1/health`);
    logger.info(`🌍 Environment: ${env.NODE_ENV}`);
  });

  const handleShutdown = async (signal: string) => {
    logger.info(`Received ${signal}, initiating graceful shutdown...`);
    server.close(async () => {
      logger.info('HTTP server closed');
      await disconnectDatabase();
      logger.info('Clean exit completed');
      process.exit(0);
    });

    // Force shutdown after timeout
    setTimeout(() => {
      logger.error('Graceful shutdown timed out, forcing exit');
      process.exit(1);
    }, 10000);
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
