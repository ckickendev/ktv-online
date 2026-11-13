import mongoose from 'mongoose';
import { connectDatabase, disconnectDatabase } from '../connection.js';
import { logger } from '../../utils/logger.js';

export interface MigrationResult {
  collectionName: string;
  droppedLegacyCreatedAtTtlIndex: boolean;
  droppedIncompatibleExpiresAtIndex: boolean;
  standardTtlIndexAlreadyExisted: boolean;
  createdStandardTtlIndex: boolean;
  finalIndexes: Array<{ name: string; key: Record<string, unknown>; expireAfterSeconds?: number }>;
}

/**
 * Migration: Reconcile RoomStateOutbox Standard MongoDB TTL Index Safety
 *
 * 1. Discovers and safely drops legacy unconditional TTL index on `{ createdAt: 1 }`
 *    which previously purged pending or failed outbox events after 7 days.
 * 2. Inspects existing `{ expiresAt: 1 }` indexes. Safely drops known incompatible
 *    intermediate indexes (e.g. unsupported partialFilterExpression or non-TTL indexes).
 * 3. Builds and verifies the standard single-field TTL index `{ expiresAt: 1 }` with
 *    `expireAfterSeconds: 0` and name `expiresAt_1_ttl`.
 * 4. Relies on standard MongoDB behavior: documents where `expiresAt` is null or missing
 *    are never indexed for expiration and never deleted by the TTL thread.
 *
 * Idempotent: safe to run multiple times. Refuses to drop unexpected indexes.
 * Never modifies or deletes outbox document data.
 */
export async function reconcileOutboxTtlIndex(): Promise<MigrationResult> {
  const isConnected = await connectDatabase();
  if (!isConnected) {
    throw new Error('Database connection failed; cannot execute outbox TTL index migration');
  }

  const collectionName = 'roomstateoutboxes';
  const collection = mongoose.connection.collection(collectionName);

  logger.info({ collectionName }, '🔍 Inspecting indexes on collection');
  const existingIndexes = await collection.listIndexes().toArray();

  let droppedLegacyCreatedAtTtlIndex = false;
  let droppedIncompatibleExpiresAtIndex = false;
  let standardTtlIndexAlreadyExisted = false;
  let createdStandardTtlIndex = false;

  // 1. Identify and safely drop legacy unconditional createdAt TTL index
  for (const idx of existingIndexes) {
    const isSingleFieldCreatedAt =
      idx.key && Object.keys(idx.key).length === 1 && idx.key.createdAt === 1;
    const hasTtlOption = typeof idx.expireAfterSeconds === 'number';

    if (isSingleFieldCreatedAt) {
      if (hasTtlOption) {
        logger.info(
          { indexName: idx.name, expireAfterSeconds: idx.expireAfterSeconds },
          '🗑️ Identified legacy unconditional createdAt TTL index. Dropping...'
        );
        await collection.dropIndex(idx.name);
        droppedLegacyCreatedAtTtlIndex = true;
        logger.info({ indexName: idx.name }, '✅ Successfully dropped legacy createdAt TTL index');
      } else {
        logger.info(
          { indexName: idx.name },
          'ℹ️ Found non-TTL createdAt index; leaving intact as it is not an unconditional TTL index'
        );
      }
    }
  }

  // 2. Inspect existing expiresAt indexes
  let hasValidStandardTtlIndex = false;

  for (const idx of existingIndexes) {
    const isSingleFieldExpiresAt =
      idx.key && Object.keys(idx.key).length === 1 && idx.key.expiresAt === 1;

    if (!isSingleFieldExpiresAt) continue;

    const hasTtl = typeof idx.expireAfterSeconds === 'number';
    const hasPartialFilter = Boolean(idx.partialFilterExpression);

    if (hasTtl && idx.expireAfterSeconds === 0 && !hasPartialFilter && idx.name === 'expiresAt_1_ttl') {
      logger.info({ indexName: idx.name }, '✅ Standard expiresAt TTL index already exists with correct options');
      hasValidStandardTtlIndex = true;
      standardTtlIndexAlreadyExisted = true;
      continue;
    }

    // Check if it's one of the known incompatible transition definitions
    const isKnownIncompatibleName =
      idx.name === 'expiresAt_1_ttl_selective' || idx.name === 'expiresAt_1';
    const isUnsupportedPartialTtl = hasTtl && hasPartialFilter;
    const isNonTtlIndex = !hasTtl;

    if (isKnownIncompatibleName || isUnsupportedPartialTtl || isNonTtlIndex) {
      logger.info(
        { indexName: idx.name, expireAfterSeconds: idx.expireAfterSeconds, hasPartialFilter },
        '🗑️ Identified incompatible/intermediate expiresAt index. Dropping before creating standard TTL index...'
      );
      await collection.dropIndex(idx.name);
      droppedIncompatibleExpiresAtIndex = true;
      logger.info({ indexName: idx.name }, '✅ Successfully dropped incompatible expiresAt index');
    } else {
      throw new Error(
        `Unexpected index detected on expiresAt: "${idx.name}" with options ${JSON.stringify(idx)}. Refusing to drop blindly.`
      );
    }
  }

  // 3. Create or verify standard single-field TTL index if not already present
  if (!hasValidStandardTtlIndex) {
    logger.info('🛠️ Building standard single-field TTL index on { expiresAt: 1 } (expireAfterSeconds: 0)...');
    await collection.createIndex(
      { expiresAt: 1 },
      {
        expireAfterSeconds: 0,
        name: 'expiresAt_1_ttl',
      }
    );
    createdStandardTtlIndex = true;
    logger.info('✅ Successfully created standard expiresAt TTL index (expiresAt_1_ttl)');
  }

  // 4. Verification of final indexes
  const finalIndexes = await collection.listIndexes().toArray();
  const summaryIndexes = finalIndexes.map((idx) => ({
    name: idx.name,
    key: idx.key,
    expireAfterSeconds: idx.expireAfterSeconds,
  }));

  logger.info({ finalIndexes: summaryIndexes }, '🏁 Outbox TTL index reconciliation completed successfully');

  return {
    collectionName,
    droppedLegacyCreatedAtTtlIndex,
    droppedIncompatibleExpiresAtIndex,
    standardTtlIndexAlreadyExisted,
    createdStandardTtlIndex,
    finalIndexes: summaryIndexes,
  };
}

// Standalone CLI runner (when invoked directly in deployment pipeline)
if (
  process.argv[1]?.endsWith('reconcile-outbox-ttl-index.ts') ||
  process.argv[1]?.endsWith('reconcile-outbox-ttl-index.js')
) {
  reconcileOutboxTtlIndex()
    .then((result) => {
      logger.info({ result }, 'Migration completed');
      return disconnectDatabase();
    })
    .catch((err) => {
      logger.error({ err }, 'Migration failed');
      process.exit(1);
    });
}
