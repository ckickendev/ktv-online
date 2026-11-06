import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

let isConnected = false;

export async function connectDatabase(): Promise<boolean> {
  if (isConnected || mongoose.connection.readyState === 1) {
    return true;
  }

  try {
    mongoose.connection.on('connected', () => {
      isConnected = true;
      logger.info('📦 MongoDB connected successfully');
    });

    mongoose.connection.on('error', (err) => {
      isConnected = false;
      logger.error({ err }, '❌ MongoDB connection error');
    });

    mongoose.connection.on('disconnected', () => {
      isConnected = false;
      logger.warn('⚠️ MongoDB disconnected');
    });

    await mongoose.connect(env.MONGODB_URI, {
      serverSelectionTimeoutMS: 3000,
      connectTimeoutMS: 5000,
    });

    isConnected = true;
    return true;
  } catch (error) {
    isConnected = false;
    logger.warn({ error: (error as Error).message }, '⚠️ MongoDB connection could not be established at startup');
    return false;
  }
}

export async function disconnectDatabase(): Promise<void> {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
    isConnected = false;
    logger.info('📦 MongoDB disconnected cleanly');
  }
}

export function getDatabaseStatus(): 'connected' | 'connecting' | 'disconnected' | 'error' {
  switch (mongoose.connection.readyState) {
    case 1:
      return 'connected';
    case 2:
      return 'connecting';
    default:
      return 'disconnected';
  }
}
