import mongoose from 'mongoose';
import { connectDatabase, disconnectDatabase } from '../connection.js';
import { logger } from '../../utils/logger.js';

export interface MigrationResult {
  collectionName: string;
  droppedOldTtlIndex: boolean;
  droppedConflictingIndex: boolean;
  createdSelectiveTtlIndex: boolean;
  finalIndexes: Array<{ name: string; key: Record<string, unknown> }>;
}

/**
 * Migration: Reconcile RoomStateOutbox TTL Index Safety
 *
 * 1. Discovers and safely drops legacy unconditional TTL index on `{ createdAt: 1 }`
 *    which previously purged pending or failed outbox events after 7 days.
 * 2. Removes any conflicting/duplicate un-filtered `{ expiresAt: 1 }` index.
 * 3. Builds and verifies the selective TTL index `{ expiresAt: 1 }` with
 *    `expireAfterSeconds: 0` and `partialFilterExpression: { expiresAt: { $type: 'date' } }`.
 *
 * Idempotent: safe to run multiple times. Refuses to drop unexpected indexes.
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

  let droppedOldTtlIndex = false;
  let droppedConflictingIndex = false;
  let createdSelectiveTtlIndex = false;

  // 1. Identify and drop old unconditional createdAt TTL index
  for (const idx of existingIndexes) {
    const isCreatedAtKey = idx.key && Object.keys(idx.key).length === 1 && idx.key.createdAt === 1;
    const hasTtlOption = typeof idx.expireAfterSeconds === 'number';

    if (isCreatedAtKey && hasTtlOption) {
      logger.info(
        { indexName: idx.name, expireAfterSeconds: idx.expireAfterSeconds },
        '🗑️ Detected legacy unconditional createdAt TTL index. Dropping...'
      );
      await collection.dropIndex(idx.name);
      droppedOldTtlIndex = true;
      logger.info({ indexName: idx.name }, '✅ Successfully dropped legacy createdAt TTL index');
    }
  }

  // 2. Identify and drop any conflicting un-filtered expiresAt index (e.g. from field-level `index: true`)
  for (const idx of existingIndexes) {
    const isExpiresAtKey = idx.key && Object.keys(idx.key).length === 1 && idx.key.expiresAt === 1;
    const isMissingPartialFilter = !idx.partialFilterExpression;

    if (isExpiresAtKey && isMissingPartialFilter) {
      logger.info(
        { indexName: idx.name },
        '🗑️ Detected conflicting un-filtered expiresAt index. Dropping...'
      );
      await collection.dropIndex(idx.name);
      droppedConflictingIndex = true;
      logger.info({ indexName: idx.name }, '✅ Successfully dropped conflicting expiresAt index');
    }
  }

  // 3. Ensure the intended selective TTL index exists
  logger.info('🛠️ Building selective TTL index on expiresAt (partialFilterExpression: date)...');
  await collection.createIndex(
    { expiresAt: 1 },
    {
      expireAfterSeconds: 0,
      partialFilterExpression: { expiresAt: { $type: 'date' } },
      name: 'expiresAt_1_ttl_selective',
    }
  );
  createdSelectiveTtlIndex = true;
  logger.info('✅ Successfully created/verified selective expiresAt TTL index');

  // 4. Verification of final indexes
  const finalIndexes = await collection.listIndexes().toArray();
  const summaryIndexes = finalIndexes.map((idx) => ({
    name: idx.name,
    key: idx.key,
  }));

  logger.info({ finalIndexes: summaryIndexes }, '🏁 Outbox TTL index reconciliation completed successfully');

  return {
    collectionName,
    droppedOldTtlIndex,
    droppedConflictingIndex,
    createdSelectiveTtlIndex,
    finalIndexes: summaryIndexes,
  };
}

// Standalone CLI runner (when invoked directly in deployment pipeline)
if (process.argv[1]?.endsWith('reconcile-outbox-ttl-index.ts') || process.argv[1]?.endsWith('reconcile-outbox-ttl-index.js')) {
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
