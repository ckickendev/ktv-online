import mongoose, { ClientSession } from 'mongoose';
import { logger } from '../utils/logger.js';

let transactionSupportKnown = false;
let transactionSupported = false;

/**
 * Checks whether the current MongoDB deployment supports multi-document transactions.
 * Multi-document transactions require a replica set or sharded cluster.
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
        logger.info(
          '📦 MongoDB deployment verified: Standalone mode detected; using explicit Recoverable CAS & Reconciliation Protocols'
        );
      } else {
        // Unknown error during transaction probe; fall back to CAS protocol safely
        transactionSupported = false;
        logger.warn({ err }, '⚠️ MongoDB transaction probe failed; defaulting to Recoverable CAS Protocol');
      }
    } finally {
      await session.endSession();
    }
  } catch (err) {
    transactionSupported = false;
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
 * @param fn Callback that accepts a ClientSession (or null if transactions are unsupported)
 */
export async function runInTransaction<T>(
  fn: (session: ClientSession | null) => Promise<T>
): Promise<T> {
  if (!transactionSupportKnown) {
    await checkTransactionSupport();
  }

  if (!transactionSupported) {
    // Standalone deployment: execute under Recoverable CAS & Fencing Protocol
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
    // If runtime discovers transactions are not supported, cache that knowledge and fallback
    if (
      msg.includes('replica set') ||
      msg.includes('Transaction numbers are only allowed') ||
      msg.includes('Transactions are not supported')
    ) {
      transactionSupported = false;
      transactionSupportKnown = true;
      logger.warn('⚠️ MongoDB runtime reported transactions unsupported; falling back to Recoverable CAS Protocol');
      return fn(null);
    }
    throw err;
  } finally {
    await session.endSession();
  }
}
