import crypto from 'crypto';
import { VoiceEvictionTaskModel, IVoiceEvictionTaskDocument } from './voice-eviction-task.model.js';
import { voiceService } from './voice.service.js';
import { logger } from '../../utils/logger.js';

export class VoiceEvictionWorker {
  private readonly instanceId: string;
  private intervalTimer: NodeJS.Timeout | null = null;
  private isProcessing = false;
  private isStopping = false;

  constructor() {
    this.instanceId = `api_worker_${process.pid}_${crypto.randomBytes(4).toString('hex')}`;
  }

  public start(pollIntervalMs = 10000): void {
    if (this.intervalTimer) return;

    logger.info(
      { instanceId: this.instanceId, pollIntervalMs },
      '🚀 Starting LiveKit voice eviction background worker'
    );

    this.intervalTimer = setInterval(() => {
      this.processBatch().catch((err) => {
        logger.error({ instanceId: this.instanceId, err }, 'Unhandled error in voice eviction worker cycle');
      });
    }, pollIntervalMs);

    // Initial pass immediately upon startup
    this.processBatch().catch((err) => {
      logger.error({ instanceId: this.instanceId, err }, 'Unhandled error in initial voice eviction worker pass');
    });
  }

  public async stop(): Promise<void> {
    this.isStopping = true;
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = null;
    }

    logger.info({ instanceId: this.instanceId }, 'Stopping voice eviction background worker...');

    // Wait if a batch is currently executing (bounded to 5 seconds)
    const startTime = Date.now();
    while (this.isProcessing && Date.now() - startTime < 5000) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    logger.info({ instanceId: this.instanceId }, 'Voice eviction background worker stopped cleanly');
  }

  public async processBatch(maxTasksPerCycle = 10): Promise<number> {
    if (this.isProcessing || this.isStopping) return 0;
    this.isProcessing = true;

    let processedCount = 0;

    try {
      while (processedCount < maxTasksPerCycle && !this.isStopping) {
        const task = await VoiceEvictionTaskModel.claimNextTask(this.instanceId, 30000);
        if (!task) {
          // No more ready tasks in queue
          break;
        }

        await this.executeTask(task);
        processedCount++;
      }
    } finally {
      this.isProcessing = false;
    }

    return processedCount;
  }

  private async executeTask(task: IVoiceEvictionTaskDocument): Promise<void> {
    const client = voiceService.getClient();
    const taskId = task._id.toString();

    logger.info(
      {
        taskId,
        targetType: task.targetType,
        targetId: task.targetId,
        roomId: task.roomId,
        attemptCount: task.attemptCount,
        correlationId: task.correlationId,
      },
      'Processing claimed voice eviction task'
    );

    if (!client) {
      // LiveKit is not configured in this environment (e.g. dev without credentials)
      task.status = 'failed_permanent';
      task.lastError = 'LiveKit service is not configured on this server';
      task.errorCategory = 'terminal';
      await task.save();
      return;
    }

    try {
      if (task.targetType === 'room' && task.roomId) {
        const roomName = voiceService.getLiveKitRoomName(task.roomId);
        await client.deleteRoom(roomName);
      } else if (task.targetType === 'user' && task.roomId && task.targetId) {
        const roomName = voiceService.getLiveKitRoomName(task.roomId);
        if (task.participantIdentity) {
          await client.removeParticipant(roomName, task.participantIdentity);
        } else {
          // Enumerate participants in room and disconnect any belonging to this user
          const participants = await client.listParticipants(roomName);
          for (const p of participants) {
            if (p.identity.startsWith(`${task.targetId}_`)) {
              await client.removeParticipant(roomName, p.identity);
            }
          }
        }
      } else if (task.targetType === 'family' && task.roomId && task.participantIdentity) {
        const roomName = voiceService.getLiveKitRoomName(task.roomId);
        await client.removeParticipant(roomName, task.participantIdentity);
      }

      task.status = 'completed';
      task.lastError = null;
      task.leaseExpiresAt = null;
      await task.save();

      logger.info(
        { taskId, targetType: task.targetType, targetId: task.targetId, roomId: task.roomId },
        'Successfully completed security voice eviction task'
      );
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      const isRoomNotFound = errorMsg.includes('room does not exist') || errorMsg.includes('not found');
      const isParticipantNotFound = errorMsg.includes('participant does not exist') || errorMsg.includes('participant not found');

      // If entity was already destroyed in LiveKit, the security goal is achieved
      if (isRoomNotFound || isParticipantNotFound) {
        task.status = 'completed';
        task.lastError = null;
        task.leaseExpiresAt = null;
        await task.save();

        logger.info(
          { taskId, targetType: task.targetType, targetId: task.targetId, reason: errorMsg },
          'Eviction target already absent in LiveKit; marked task completed'
        );
        return;
      }

      task.attemptCount += 1;
      task.lastError = errorMsg;
      task.leaseExpiresAt = null;

      if (task.attemptCount >= task.maxAttempts) {
        task.status = 'failed_permanent';
        task.errorCategory = 'terminal';
        logger.error(
          {
            taskId,
            targetType: task.targetType,
            targetId: task.targetId,
            roomId: task.roomId,
            attempts: task.attemptCount,
            err: errorMsg,
          },
          '🚨 CRITICAL: Exhausted max retries for voice eviction task. Marked failed_permanent for operator intervention'
        );
      } else {
        task.status = 'retry_scheduled';
        task.errorCategory = 'transient';
        // Bounded exponential backoff: 2s, 4s, 8s, 16s... capped at 60s
        const backoffMs = Math.min(60000, 2000 * Math.pow(2, task.attemptCount));
        task.nextAttemptAt = new Date(Date.now() + backoffMs);

        logger.warn(
          {
            taskId,
            targetType: task.targetType,
            targetId: task.targetId,
            attemptCount: task.attemptCount,
            nextAttemptAt: task.nextAttemptAt.toISOString(),
            err: errorMsg,
          },
          'Voice eviction call failed; scheduled retry'
        );
      }

      await task.save();
    }
  }
}

export const voiceEvictionWorker = new VoiceEvictionWorker();
