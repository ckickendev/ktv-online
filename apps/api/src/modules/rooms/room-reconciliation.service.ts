import { Types } from 'mongoose';
import { RoomModel } from './room.model.js';
import { RoomMembershipModel } from './membership.model.js';
import { logger } from '../../utils/logger.js';

export interface RoomReconcileResult {
  roomId: string;
  roomName: string;
  status: string;
  storedCount: number;
  actualActiveMembers: number;
  drift: number;
  reconciled: boolean;
  actionTaken: 'NONE' | 'COUNT_REPAIRED' | 'MEMBERSHIPS_CONCLUDED_AND_COUNT_ZEROED';
}

export interface ReconcileSummary {
  dryRun: boolean;
  totalRoomsChecked: number;
  driftedRoomsCount: number;
  details: RoomReconcileResult[];
}

export class RoomReconciliationService {
  async reconcileRoom(roomId: string, dryRun = false): Promise<RoomReconcileResult | null> {
    if (!Types.ObjectId.isValid(roomId)) {
      return null;
    }
    const roomObjectId = new Types.ObjectId(roomId);
    const room = await RoomModel.findById(roomObjectId).exec();
    if (!room) {
      return null;
    }

    const activeCount = await RoomMembershipModel.countDocuments({
      roomId: roomObjectId,
      status: 'active',
    }).exec();

    // If room is closed, invariant requires 0 active members and 0 current participants
    if (room.status === 'closed') {
      const storedCount = room.currentParticipantsCount;
      const drift = storedCount - 0;
      let actionTaken: RoomReconcileResult['actionTaken'] = 'NONE';

      if (activeCount > 0 || storedCount !== 0) {
        actionTaken = 'MEMBERSHIPS_CONCLUDED_AND_COUNT_ZEROED';
        if (!dryRun) {
          await Promise.all([
            RoomMembershipModel.updateMany(
              { roomId: roomObjectId, status: 'active' },
              { $set: { status: 'left', leftAt: new Date() } }
            ).exec(),
            RoomModel.updateOne(
              { _id: roomObjectId },
              { $set: { currentParticipantsCount: 0 } }
            ).exec(),
          ]);
          logger.info(
            { roomId: room.id, storedCount, activeCount },
            '🛠️ Reconciled closed room: concluded lingering memberships and zeroed count'
          );
        }
      }

      return {
        roomId: room.id,
        roomName: room.name,
        status: room.status,
        storedCount,
        actualActiveMembers: activeCount,
        drift,
        reconciled: !dryRun && actionTaken !== 'NONE',
        actionTaken,
      };
    }

    // Active room: stored count must equal active memberships count
    const storedCount = room.currentParticipantsCount;
    const drift = storedCount - activeCount;
    let actionTaken: RoomReconcileResult['actionTaken'] = 'NONE';

    if (drift !== 0) {
      actionTaken = 'COUNT_REPAIRED';
      if (!dryRun) {
        await RoomModel.updateOne(
          { _id: roomObjectId },
          { $set: { currentParticipantsCount: activeCount } }
        ).exec();
        logger.info(
          { roomId: room.id, storedCount, activeCount, drift },
          '🛠️ Reconciled room participant count drift'
        );
      }
    }

    return {
      roomId: room.id,
      roomName: room.name,
      status: room.status,
      storedCount,
      actualActiveMembers: activeCount,
      drift,
      reconciled: !dryRun && actionTaken !== 'NONE',
      actionTaken,
    };
  }

  async reconcileAllRooms(dryRun = false): Promise<ReconcileSummary> {
    const rooms = await RoomModel.find({}).select('_id').exec();
    const details: RoomReconcileResult[] = [];
    let driftedRoomsCount = 0;

    for (const room of rooms) {
      const result = await this.reconcileRoom(room._id.toString(), dryRun);
      if (result) {
        if (result.drift !== 0 || result.actionTaken !== 'NONE') {
          driftedRoomsCount++;
          details.push(result);
        }
      }
    }

    return {
      dryRun,
      totalRoomsChecked: rooms.length,
      driftedRoomsCount,
      details,
    };
  }
}

export const roomReconciliationService = new RoomReconciliationService();
