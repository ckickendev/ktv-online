import mongoose, { ClientSession } from 'mongoose';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

export class UnsupportedTopologyError extends Error {
  constructor(message = 'MongoDB replica set transactions are required in production but the current topology does not support them.') {
    super(message);
    this.name = 'UnsupportedTopologyError';
  }
}

export class TransactionAbortedError extends Error {
  public readonly causeError?: unknown;
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'TransactionAbortedError';
    this.causeError = cause;
  }
}

let transactionSupportKnown = false;
let transactionSupported = false;

/**
 * Checks whether the current MongoDB deployment supports multi-document transactions.
 * Multi-document transactions require a replica set or sharded cluster.
 * In production (NODE_ENV === 'production'), unsupported topology triggers a fail-closed error.
 */
export async function checkTransactionSupport(): Promise<boolean> {
  if (transactionSupportKnown) {
    return transactionSupported;
  }

  if (mongoose.connection.readyState !== 1) {
    return false;
  }

  try {
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        // No-op transaction test to detect replica set capability
      });
      transactionSupported = true;
      logger.info('📦 MongoDB deployment verified: Multi-document transactions supported (Replica Set)');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (
        msg.includes('replica set') ||
        msg.includes('Transaction numbers are only allowed') ||
        msg.includes('Transactions are not supported')
      ) {
        transactionSupported = false;
        if (env.NODE_ENV === 'production') {
          logger.fatal(
            '❌ FATAL: Production environment requires a MongoDB replica set supporting multi-document transactions. Standalone MongoDB detected.'
          );
          throw new UnsupportedTopologyError(
            'Production requires a MongoDB replica set supporting multi-document ACID transactions. Standalone MongoDB detected.'
          );
        }
        logger.info(
          '📦 MongoDB deployment verified: Standalone mode detected; using explicit Recoverable CAS & Reconciliation Protocols'
        );
      } else {
        transactionSupported = false;
        if (env.NODE_ENV === 'production') {
          logger.fatal({ err }, '❌ FATAL: MongoDB transaction probe failed in production');
          throw new UnsupportedTopologyError(`MongoDB transaction probe failed in production: ${msg}`);
        }
        logger.warn({ err }, '⚠️ MongoDB transaction probe failed; defaulting to Recoverable CAS Protocol');
      }
    } finally {
      await session.endSession();
    }
  } catch (err) {
    if (err instanceof UnsupportedTopologyError) {
      throw err;
    }
    transactionSupported = false;
    if (env.NODE_ENV === 'production') {
      logger.fatal({ err }, '❌ FATAL: Could not start MongoDB session in production');
      throw new UnsupportedTopologyError('Could not start MongoDB session in production');
    }
    logger.warn({ err }, '⚠️ Could not start MongoDB session; defaulting to Recoverable CAS Protocol');
  }

  transactionSupportKnown = true;
  return transactionSupported;
}

/**
 * Returns whether transactions are known to be supported by the active database connection.
 */
export function isTransactionSupported(): boolean {
  return transactionSupported;
}

/**
 * Returns detailed topology status for diagnostics, health checks, and logging.
 */
export function getTopologyStatus(): {
  isKnown: boolean;
  isSupported: boolean;
  mode: 'replica_set' | 'standalone' | 'unknown';
} {
  return {
    isKnown: transactionSupportKnown,
    isSupported: transactionSupported,
    mode: !transactionSupportKnown
      ? 'unknown'
      : transactionSupported
        ? 'replica_set'
        : 'standalone',
  };
}

/**
 * Manually set transaction support (e.g. during testing or config initialization).
 */
export function setTransactionSupported(supported: boolean): void {
  transactionSupported = supported;
  transactionSupportKnown = true;
}

/**
 * Executes a function inside a MongoDB transaction if the deployment supports it,
 * or runs with null session under the Recoverable CAS & State Machine Protocol.
 *
 * In production, this strictly rejects unsupported topologies to prevent silent non-atomic degradation.
 *
 * @param fn Callback that accepts a ClientSession (or null if transactions are unsupported in dev)
 */
export async function runInTransaction<T>(
  fn: (session: ClientSession | null) => Promise<T>
): Promise<T> {
  if (!transactionSupportKnown) {
    await checkTransactionSupport();
  }

  if (!transactionSupported) {
    if (env.NODE_ENV === 'production') {
      throw new UnsupportedTopologyError(
        'Transaction execution failed: Multi-document ACID transactions are mandatory in production but current MongoDB topology does not support them.'
      );
    }
    // Standalone deployment (development/test only): execute under Recoverable CAS & Fencing Protocol
    return fn(null);
  }

  const session = await mongoose.startSession();
  try {
    let result: T | undefined;
    await session.withTransaction(async () => {
      result = await fn(session);
    });
    return result as T;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    // If runtime discovers transactions are not supported, cache that knowledge
    if (
      msg.includes('replica set') ||
      msg.includes('Transaction numbers are only allowed') ||
      msg.includes('Transactions are not supported')
    ) {
      transactionSupported = false;
      transactionSupportKnown = true;
      if (env.NODE_ENV === 'production') {
        throw new UnsupportedTopologyError(
          'MongoDB transactions failed due to unsupported topology in production.'
        );
      }
      logger.warn('⚠️ MongoDB runtime reported transactions unsupported; falling back to Recoverable CAS Protocol');
      return fn(null);
    }
    throw err;
  } finally {
    await session.endSession();
  }
}
