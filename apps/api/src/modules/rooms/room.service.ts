import { FilterQuery, Types } from 'mongoose';
import { RoomModel } from './room.model.js';
import { RoomMembershipModel } from './membership.model.js';
import { IRoomDocument } from './room.types.js';
import { IRoomMembershipDocument } from './membership.types.js';
import {
  CreateRoomDto,
  RoomQueryDto,
  UpdateRoomDto,
  RoomStateSnapshotDto,
  RoomSnapshotDto,
  RoomMembershipDto,
  RoomStateVersionDto,
  SOCKET_EVENTS,
} from '@ktv/contracts';
import { chatService } from '../chat/chat.service.js';
import { evictKickedMember } from '../../realtime/socket.server.js';
import { publishRoomStateEvent } from '../../realtime/room-state.publisher.js';
import { presenceManager } from '../../realtime/presence.manager.js';
import { RoomReconciliationService } from './room-reconciliation.service.js';
import { voiceService } from '../voice/voice.service.js';
import { karaokeService } from '../karaoke/karaoke.service.js';
import { getSocketServer } from '../../realtime/socket.server.js';
import { getRoomChannel } from '../../realtime/room.events.js';
import {
  broadcastKaraokeQueueUpdated,
  broadcastKaraokePlaybackUpdated,
} from '../../realtime/karaoke.events.js';
import { logger } from '../../utils/logger.js';

const roomReconciliationService = new RoomReconciliationService();

export type GetRoomStateSnapshotResult =
  | { success: true; snapshot: RoomStateSnapshotDto }
  | {
      success: false;
      error:
        | 'ROOM_NOT_FOUND'
        | 'INVALID_ID'
        | 'UNAUTHORIZED'
        | 'FORBIDDEN_PRIVATE_ROOM'
        | 'FORBIDDEN_KICKED';
    };

export type JoinRoomResult =
  | { success: true; membership: IRoomMembershipDocument; alreadyJoined: boolean }
  | {
      success: false;
      error:
        | 'ROOM_NOT_FOUND'
        | 'ROOM_CLOSED'
        | 'ROOM_FULL'
        | 'ROOM_LOCKED'
        | 'PRIVATE_ROOM'
        | 'JOIN_FAILED'
        | 'FORBIDDEN_KICKED';
    };

export type LeaveRoomResult =
  | { success: true }
  | { success: false; error: 'NOT_A_MEMBER' | 'ROOM_NOT_FOUND' | 'HOST_CANNOT_LEAVE' };

export type KickMemberResult =
  | { success: true }
  | {
      success: false;
      error:
        | 'ROOM_NOT_FOUND'
        | 'ROOM_CLOSED'
        | 'FORBIDDEN_NOT_HOST'
        | 'FORBIDDEN_NOT_AUTHORIZED'
        | 'MODERATOR_CANNOT_KICK_MODERATOR'
        | 'CANNOT_KICK_SELF'
        | 'CANNOT_KICK_HOST'
        | 'NOT_A_MEMBER'
        | 'INVALID_ID';
    };

export type GetMembersResult =
  | { success: true; members: IRoomMembershipDocument[] }
  | { success: false; error: 'ROOM_NOT_FOUND' | 'FORBIDDEN_PRIVATE_ROOM' | 'UNAUTHORIZED' };

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export class RoomService {
  async findById(id: string): Promise<IRoomDocument | null> {
    if (!Types.ObjectId.isValid(id)) {
      return null;
    }
    return RoomModel.findById(id).populate('ownerId', 'username displayName avatar').exec();
  }

  async findRooms(query: RoomQueryDto): Promise<{ items: IRoomDocument[]; total: number }> {
    const filter: FilterQuery<IRoomDocument> = {
      // Security: Public room discovery strictly enforces public visibility
      visibility: 'public',
    };

    if (query.category && query.category !== 'all') {
      filter.category = query.category;
    }

    if (query.status) {
      filter.status = query.status;
    }

    if (query.roomType) {
      filter.roomType = query.roomType;
    }

    if (query.atmospherePreset) {
      filter.atmospherePreset = query.atmospherePreset;
    }

    if (query.availability === 'available') {
      filter.$expr = { $lt: ['$currentParticipantsCount', '$capacity'] };
      if (!filter.status) {
        filter.status = { $ne: 'closed' };
      }
    } else if (query.availability === 'full') {
      filter.$expr = { $gte: ['$currentParticipantsCount', '$capacity'] };
    }

    const trimmedSearch = query.search?.trim();
    if (trimmedSearch) {
      const safeRegex = new RegExp(escapeRegex(trimmedSearch), 'i');
      filter.$or = [{ name: safeRegex }, { description: safeRegex }];
    }

    let sortQuery: Record<string, 1 | -1> = { createdAt: -1 };
    if (query.sortBy === 'oldest') {
      sortQuery = { createdAt: 1 };
    } else if (query.sortBy === 'popular') {
      sortQuery = { currentParticipantsCount: -1, createdAt: -1 };
    }

    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      RoomModel.find(filter)
        .sort(sortQuery)
        .skip(skip)
        .limit(limit)
        .populate('ownerId', 'username displayName avatar')
        .exec(),
      RoomModel.countDocuments(filter).exec(),
    ]);

    return { items, total };
  }

  async create(ownerId: string, data: CreateRoomDto): Promise<IRoomDocument> {
    const room = new RoomModel({
      ...data,
      ownerId: new Types.ObjectId(ownerId),
      status: 'idle',
      currentParticipantsCount: 1,
      stateVersion: 1,
    });

    const savedRoom = await room.save();

    // Automatically create host membership for room owner
    await RoomMembershipModel.create({
      roomId: savedRoom._id,
      userId: new Types.ObjectId(ownerId),
      role: 'host',
      status: 'active',
      joinedAt: new Date(),
    });

    return savedRoom;
  }

  async findRoomsByOwner(
    ownerId: string,
    page = 1,
    limit = 20
  ): Promise<{ items: IRoomDocument[]; total: number }> {
    if (!Types.ObjectId.isValid(ownerId)) {
      return { items: [], total: 0 };
    }
    const filter: FilterQuery<IRoomDocument> = { ownerId: new Types.ObjectId(ownerId) };
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      RoomModel.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('ownerId', 'username displayName avatar')
        .exec(),
      RoomModel.countDocuments(filter).exec(),
    ]);

    return { items, total };
  }

  async update(id: string, data: UpdateRoomDto): Promise<IRoomDocument | null> {
    if (!Types.ObjectId.isValid(id)) {
      return null;
    }

    const { expectedStateVersion, ...updateFields } = data;
    const filter: FilterQuery<IRoomDocument> = { _id: new Types.ObjectId(id) };

    // Concurrency fencing: prevent stale writes if caller provided expectedStateVersion
    if (expectedStateVersion !== undefined) {
      filter.stateVersion = expectedStateVersion;
    }

    // Atomic capacity guard: cannot reduce capacity below current participant count
    if (updateFields.capacity !== undefined) {
      filter.currentParticipantsCount = { $lte: updateFields.capacity };
    }

    const updatedRoom = await RoomModel.findOneAndUpdate(
      filter,
      {
        $set: updateFields,
        $inc: { stateVersion: 1 },
      },
      { new: true, runValidators: true }
    )
      .populate('ownerId', 'username displayName avatar')
      .exec();

    if (updatedRoom) {
      publishRoomStateEvent(
        id,
        'room.settings.updated',
        {
          name: updatedRoom.name,
          description: updatedRoom.description,
          visibility: updatedRoom.visibility,
          capacity: updatedRoom.capacity,
          status: updatedRoom.status,
          category: updatedRoom.category,
          isChatEnabled: updatedRoom.isChatEnabled !== false,
          atmospherePreset: updatedRoom.atmospherePreset || 'midnight_lounge',
          currentParticipantsCount: updatedRoom.currentParticipantsCount,
        },
        updatedRoom.stateVersion
      );
    }

    return updatedRoom;
  }

  async closeRoom(id: string): Promise<IRoomDocument | null> {
    if (!Types.ObjectId.isValid(id)) {
      return null;
    }
    const roomObjectId = new Types.ObjectId(id);
    const room = await RoomModel.findByIdAndUpdate(
      roomObjectId,
      {
        $set: { status: 'closed', currentParticipantsCount: 0 },
        $inc: { stateVersion: 1 },
      },
      { new: true, runValidators: true }
    )
      .populate('ownerId', 'username displayName avatar')
      .exec();

    if (room) {
      // 1. Conclude all active memberships upon room closure
      await RoomMembershipModel.updateMany(
        { roomId: roomObjectId, status: 'active' },
        { $set: { status: 'left', leftAt: new Date() } }
      ).exec();

      // 2. Concurrency sweep: clean up any in-flight join that committed in the exact same tick
      await RoomMembershipModel.updateMany(
        { roomId: roomObjectId, status: 'active' },
        { $set: { status: 'left', leftAt: new Date() } }
      ).exec();

      // 3. Ensure closed room participant count remains strictly 0
      await RoomModel.updateOne(
        { _id: roomObjectId },
        { $set: { currentParticipantsCount: 0 } }
      ).exec();

      publishRoomStateEvent(
        id,
        'room.closed',
        { reason: 'Room has been closed by host' },
        room.stateVersion
      );

      // 4. Clean up karaoke queue and playback for closed room
      try {
        await karaokeService.handleRoomClosed(id);
        const io = getSocketServer();
        if (io) {
          const [playback, queue] = await Promise.all([
            karaokeService.getPlaybackSnapshot(id),
            karaokeService.getQueueSnapshot(id),
          ]);
          broadcastKaraokePlaybackUpdated(io, id, playback);
          broadcastKaraokeQueueUpdated(io, id, queue, 'cleared');
        }
      } catch (err) {
        logger.error({ err, roomId: id }, 'Error cleaning up karaoke for closed room');
      }
    }

    return room;
  }

  async joinRoom(roomId: string, userId: string): Promise<JoinRoomResult> {
    if (!Types.ObjectId.isValid(roomId) || !Types.ObjectId.isValid(userId)) {
      return { success: false, error: 'ROOM_NOT_FOUND' };
    }

    const roomObjectId = new Types.ObjectId(roomId);
    const userObjectId = new Types.ObjectId(userId);

    // 1. Validate room existence, status, and privacy policy
    const room = await RoomModel.findById(roomObjectId).exec();
    if (!room) {
      return { success: false, error: 'ROOM_NOT_FOUND' };
    }
    if (room.status === 'closed') {
      return { success: false, error: 'ROOM_CLOSED' };
    }
    // Private room access rule: only owner can join without direct invitation
    if (room.visibility === 'private' && room.ownerId.toString() !== userId) {
      return { success: false, error: 'PRIVATE_ROOM' };
    }

    // 2. Check if user already has an active membership (Idempotent Join)
    const existingMembership = await RoomMembershipModel.findOne({
      roomId: roomObjectId,
      userId: userObjectId,
      status: 'active',
    })
      .populate('userId', 'username displayName avatar role')
      .exec();

    if (existingMembership) {
      return { success: true, membership: existingMembership, alreadyJoined: true };
    }

    // 2a. Room lock check: locked rooms reject new entries from non-owners
    if (room.isLocked && room.ownerId.toString() !== userId) {
      return { success: false, error: 'ROOM_LOCKED' };
    }

    // 2b. Moderation check: Kicked users cannot rejoin unless reinstated by host
    const kickedCheck = await RoomMembershipModel.findOne({
      roomId: roomObjectId,
      userId: userObjectId,
      status: 'left',
      kickedAt: { $ne: null },
    }).exec();

    if (kickedCheck && room.ownerId.toString() !== userId) {
      return { success: false, error: 'FORBIDDEN_KICKED' };
    }

    // 3. Atomic capacity check and reservation (must not be closed)
    // Note: Do not increment stateVersion here; only advance upon verified membership commit
    const updatedRoom = await RoomModel.findOneAndUpdate(
      {
        _id: roomObjectId,
        status: { $ne: 'closed' },
        $expr: { $lt: ['$currentParticipantsCount', '$capacity'] },
      },
      { $inc: { currentParticipantsCount: 1 } },
      { new: true }
    ).exec();

    if (!updatedRoom) {
      const roomCheck = await RoomModel.findById(roomObjectId).exec();
      if (!roomCheck) {
        return { success: false, error: 'ROOM_NOT_FOUND' };
      }
      if (roomCheck.status === 'closed') {
        return { success: false, error: 'ROOM_CLOSED' };
      }
      if (roomCheck.currentParticipantsCount >= roomCheck.capacity) {
        return { success: false, error: 'ROOM_FULL' };
      }
      return { success: false, error: 'JOIN_FAILED' };
    }

    // 4. Create or reactivate membership record
    try {
      // Concurrency guard: verify room was not closed concurrently during reservation
      const currentRoomState = await RoomModel.findById(roomObjectId).select('status').exec();
      if (currentRoomState?.status === 'closed') {
        await RoomModel.updateOne(
          { _id: roomObjectId, status: { $ne: 'closed' } },
          { $inc: { currentParticipantsCount: -1 } }
        ).exec();
        return { success: false, error: 'ROOM_CLOSED' };
      }

      const isOwner = updatedRoom.ownerId.toString() === userId;

      // Check if membership record exists for this user in this room
      const existingDoc = await RoomMembershipModel.findOne({
        roomId: roomObjectId,
        userId: userObjectId,
      }).exec();

      let membership: IRoomMembershipDocument | null = null;

      if (!existingDoc) {
        // Attempt creating a new membership record
        try {
          const created = await RoomMembershipModel.create({
            roomId: roomObjectId,
            userId: userObjectId,
            role: isOwner ? 'host' : 'member',
            status: 'active',
            joinedAt: new Date(),
            leftAt: null,
          });

          membership = await RoomMembershipModel.findById(created._id)
            .populate('userId', 'username displayName avatar role')
            .exec();
        } catch (createErr: unknown) {
          // If concurrent create raced and succeeded, rollback our reserved capacity increment
          await RoomModel.updateOne(
            { _id: roomObjectId, status: { $ne: 'closed' } },
            { $inc: { currentParticipantsCount: -1 } }
          ).exec();

          const activeMem = await RoomMembershipModel.findOne({
            roomId: roomObjectId,
            userId: userObjectId,
            status: 'active',
          })
            .populate('userId', 'username displayName avatar role')
            .exec();

          if (activeMem) {
            return { success: true, membership: activeMem, alreadyJoined: true };
          }
          throw createErr;
        }
      } else if (existingDoc.status === 'active') {
        // User is already active in this room. Roll back the reserved capacity increment!
        await RoomModel.updateOne(
          { _id: roomObjectId, status: { $ne: 'closed' } },
          { $inc: { currentParticipantsCount: -1 } }
        ).exec();

        const activeMem = await RoomMembershipModel.findById(existingDoc._id)
          .populate('userId', 'username displayName avatar role')
          .exec();

        return { success: true, membership: activeMem || existingDoc, alreadyJoined: true };
      } else {
        // User previously left this room. Atomically transition from non-active to active!
        const reactivated = await RoomMembershipModel.findOneAndUpdate(
          {
            _id: existingDoc._id,
            status: { $ne: 'active' }, // Atomic condition ensures only one concurrent request reactivates
          },
          {
            $set: {
              role: isOwner ? 'host' : 'member',
              status: 'active',
              joinedAt: new Date(),
              leftAt: null,
              kickedAt: null,
              kickedBy: null,
            },
          },
          { new: true }
        )
          .populate('userId', 'username displayName avatar role')
          .exec();

        if (!reactivated) {
          // Another concurrent request reactivated it already. Roll back reserved capacity!
          await RoomModel.updateOne(
            { _id: roomObjectId, status: { $ne: 'closed' } },
            { $inc: { currentParticipantsCount: -1 } }
          ).exec();

          const activeMem = await RoomMembershipModel.findById(existingDoc._id)
            .populate('userId', 'username displayName avatar role')
            .exec();

          return { success: true, membership: activeMem || existingDoc, alreadyJoined: true };
        }

        membership = reactivated;
      }

      // 5. Atomic Post-Membership Verification:
      // Verify room was not closed while membership was being persisted
      const postJoinRoomCheck = await RoomModel.findById(roomObjectId).select('status').exec();
      if (postJoinRoomCheck?.status === 'closed') {
        // Room was closed concurrently! Invalidate this membership immediately
        await RoomMembershipModel.updateOne(
          { _id: membership!._id, status: 'active' },
          { $set: { status: 'left', leftAt: new Date() } }
        ).exec();
        await RoomModel.updateOne(
          { _id: roomObjectId },
          { $set: { currentParticipantsCount: 0 } }
        ).exec();
        return { success: false, error: 'ROOM_CLOSED' };
      }

      // 5b. Atomically advance stateVersion now that membership is committed
      const versionedRoom = await RoomModel.findByIdAndUpdate(
        roomObjectId,
        { $inc: { stateVersion: 1 } },
        { new: true }
      ).exec();

      const finalVersion = versionedRoom?.stateVersion || 1;
      const finalCount = versionedRoom?.currentParticipantsCount ?? updatedRoom.currentParticipantsCount;

      publishRoomStateEvent(
        roomId,
        'member.joined',
        {
          member: membership!.toJSON() as unknown as RoomMembershipDto,
          currentParticipantsCount: finalCount,
        },
        finalVersion
      );

      // Record activity
      try {
        const memUser = (membership as any)?.userId;
        const memberUsername = memUser?.displayName || memUser?.username || 'Member';
        const memberAvatar = memUser?.avatar ?? null;
        await chatService.recordActivity(
          roomId,
          'member_joined',
          { id: userId, username: memberUsername, avatar: memberAvatar, role: membership!.role },
          `${memberUsername} joined the lounge`
        );
      } catch {
        // Non-blocking
      }

      return { success: true, membership: membership!, alreadyJoined: false };
    } catch (err: unknown) {
      // Rollback reserved capacity on unhandled membership persistence failure
      await RoomModel.updateOne(
        { _id: roomObjectId, status: { $ne: 'closed' } },
        { $inc: { currentParticipantsCount: -1 } }
      ).exec();

      throw err;
    }
  }

  async leaveRoom(roomId: string, userId: string): Promise<LeaveRoomResult> {
    if (!Types.ObjectId.isValid(roomId) || !Types.ObjectId.isValid(userId)) {
      return { success: false, error: 'ROOM_NOT_FOUND' };
    }

    const roomObjectId = new Types.ObjectId(roomId);
    const userObjectId = new Types.ObjectId(userId);

    // 1. Validate room exists and host departure policy
    const room = await RoomModel.findById(roomObjectId).exec();
    if (!room) {
      return { success: false, error: 'ROOM_NOT_FOUND' };
    }
    // Host cannot leave active lounge (must close it instead)
    if (room.status !== 'closed' && room.ownerId.toString() === userId) {
      return { success: false, error: 'HOST_CANNOT_LEAVE' };
    }

    // 2. Atomic status transition: prevents race condition double-decrement
    const updatedMembership = await RoomMembershipModel.findOneAndUpdate(
      {
        roomId: roomObjectId,
        userId: userObjectId,
        status: 'active',
      },
      {
        $set: {
          status: 'left',
          leftAt: new Date(),
        },
      },
      { new: true }
    )
      .populate('userId', 'username displayName avatar role')
      .exec();

    if (!updatedMembership) {
      return { success: false, error: 'NOT_A_MEMBER' };
    }

    // 3. Safely decrement room participant count and increment stateVersion
    const updatedRoom = await RoomModel.findOneAndUpdate(
      { _id: roomObjectId, currentParticipantsCount: { $gt: 0 } },
      { $inc: { currentParticipantsCount: -1, stateVersion: 1 } },
      { new: true }
    ).exec();

    const memberObj = updatedMembership.userId as any;
    const username = memberObj?.displayName || memberObj?.username || 'Member';
    const avatar = memberObj?.avatar ?? null;
    if (updatedRoom) {
      publishRoomStateEvent(
        roomId,
        'member.left',
        {
          userId,
          username,
          currentParticipantsCount: updatedRoom.currentParticipantsCount,
        },
        updatedRoom.stateVersion
      );
    }

    // Record activity
    try {
      await chatService.recordActivity(
        roomId,
        'member_left',
        { id: userId, username, avatar, role: updatedMembership.role },
        `${username} left the lounge`
      );
    } catch {
      // Non-blocking
    }

    // Invalidate/disconnect active LiveKit voice session for leaving user
    try {
      await voiceService.evictLiveKitParticipant(roomId, userId);
    } catch {
      // Non-blocking
    }

    // Clean up queued songs and advance playback if leaving user is current singer
    try {
      const departureResult = await karaokeService.handleMemberDeparted(roomId, userId);
      if (departureResult) {
        const io = getSocketServer();
        if (io) {
          broadcastKaraokeQueueUpdated(io, roomId, departureResult.queue, 'removed');
          broadcastKaraokePlaybackUpdated(io, roomId, departureResult.playback);
        }
      }
    } catch {
      // Non-blocking
    }

    return { success: true };
  }

  async getActiveMembers(
    roomId: string,
    requestingUserId?: string
  ): Promise<GetMembersResult> {
    if (!Types.ObjectId.isValid(roomId)) {
      return { success: false, error: 'ROOM_NOT_FOUND' };
    }

    const roomObjectId = new Types.ObjectId(roomId);
    const room = await RoomModel.findById(roomObjectId).exec();
    if (!room) {
      return { success: false, error: 'ROOM_NOT_FOUND' };
    }

    // Private room protection: only host or active members can view members
    if (room.visibility === 'private') {
      if (!requestingUserId) {
        return { success: false, error: 'UNAUTHORIZED' };
      }
      const isOwner = room.ownerId.toString() === requestingUserId;
      if (!isOwner) {
        const isMember = await RoomMembershipModel.exists({
          roomId: roomObjectId,
          userId: new Types.ObjectId(requestingUserId),
          status: 'active',
        });
        if (!isMember) {
          return { success: false, error: 'FORBIDDEN_PRIVATE_ROOM' };
        }
      }
    }

    const members = await RoomMembershipModel.find({
      roomId: roomObjectId,
      status: 'active',
    })
      .populate('userId', 'username displayName avatar role')
      .sort({ joinedAt: 1 })
      .exec();

    return { success: true, members };
  }

  async getMyMembership(roomId: string, userId: string): Promise<IRoomMembershipDocument | null> {
    if (!Types.ObjectId.isValid(roomId) || !Types.ObjectId.isValid(userId)) {
      return null;
    }
    return RoomMembershipModel.findOne({
      roomId: new Types.ObjectId(roomId),
      userId: new Types.ObjectId(userId),
      status: 'active',
    })
      .populate('userId', 'username displayName avatar role')
      .exec();
  }

  async findJoinedRoomsByUser(
    userId: string,
    page = 1,
    limit = 20
  ): Promise<{ items: IRoomDocument[]; total: number }> {
    if (!Types.ObjectId.isValid(userId)) {
      return { items: [], total: 0 };
    }
    const userObjectId = new Types.ObjectId(userId);
    const skip = (page - 1) * limit;

    const filter = { userId: userObjectId, status: 'active', role: 'member' };
    const [memberships, total] = await Promise.all([
      RoomMembershipModel.find(filter)
        .sort({ joinedAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate({
          path: 'roomId',
          populate: { path: 'ownerId', select: 'username displayName avatar' },
        })
        .exec(),
      RoomMembershipModel.countDocuments(filter).exec(),
    ]);

    const items = memberships
      .map((m) => m.roomId as unknown as IRoomDocument)
      .filter((r) => Boolean(r && r._id));

    return { items, total };
  }

  async kickMember(
    roomId: string,
    hostUserId: string,
    targetUserId: string,
    reason?: string
  ): Promise<KickMemberResult> {
    if (
      !Types.ObjectId.isValid(roomId) ||
      !Types.ObjectId.isValid(hostUserId) ||
      !Types.ObjectId.isValid(targetUserId)
    ) {
      return { success: false, error: 'INVALID_ID' };
    }

    if (hostUserId === targetUserId) {
      return { success: false, error: 'CANNOT_KICK_SELF' };
    }

    const roomObjectId = new Types.ObjectId(roomId);
    const hostObjectId = new Types.ObjectId(hostUserId);
    const targetObjectId = new Types.ObjectId(targetUserId);

    const room = await RoomModel.findById(roomObjectId).populate('ownerId', 'username displayName avatar').exec();
    if (!room) {
      return { success: false, error: 'ROOM_NOT_FOUND' };
    }

    if (room.status === 'closed') {
      return { success: false, error: 'ROOM_CLOSED' };
    }

    const hostOwnerIdStr = (room.ownerId as any)._id
      ? (room.ownerId as any)._id.toString()
      : room.ownerId.toString();

    // Verify actor permissions (Host or Moderator)
    const isOwner = hostOwnerIdStr === hostUserId;
    let actorRole: 'host' | 'moderator' | 'member' = isOwner ? 'host' : 'member';

    if (!isOwner) {
      const actorMembership = await RoomMembershipModel.findOne({
        roomId: roomObjectId,
        userId: hostObjectId,
        status: 'active',
      }).exec();
      if (!actorMembership || (actorMembership.role !== 'host' && actorMembership.role !== 'moderator')) {
        return { success: false, error: 'FORBIDDEN_NOT_AUTHORIZED' };
      }
      actorRole = actorMembership.role;
    }

    // A host cannot be removed from the room
    if (targetUserId === hostOwnerIdStr) {
      return { success: false, error: 'CANNOT_KICK_HOST' };
    }

    // Verify target active membership and ensure target is not a host
    const targetMembership = await RoomMembershipModel.findOne({
      roomId: roomObjectId,
      userId: targetObjectId,
      status: 'active',
    }).exec();

    if (!targetMembership) {
      return { success: false, error: 'NOT_A_MEMBER' };
    }

    if (targetMembership.role === 'host') {
      return { success: false, error: 'CANNOT_KICK_HOST' };
    }

    // A moderator cannot remove another moderator
    if (actorRole === 'moderator' && targetMembership.role === 'moderator') {
      return { success: false, error: 'MODERATOR_CANNOT_KICK_MODERATOR' };
    }

    // Atomically transition target membership to 'left' with kicked metadata
    // Atomic filter role: { $ne: 'host' } prevents concurrent host elevation races
    const updatedMembership = await RoomMembershipModel.findOneAndUpdate(
      {
        roomId: roomObjectId,
        userId: targetObjectId,
        status: 'active',
        role: { $ne: 'host' },
      },
      {
        $set: {
          status: 'left',
          leftAt: new Date(),
          kickedAt: new Date(),
          kickedBy: hostObjectId,
        },
      },
      { new: true }
    )
      .populate('userId', 'username displayName avatar role')
      .exec();

    if (!updatedMembership) {
      return { success: false, error: 'NOT_A_MEMBER' };
    }

    // Safely decrement room participant count and increment stateVersion
    const updatedRoom = await RoomModel.findOneAndUpdate(
      { _id: roomObjectId, currentParticipantsCount: { $gt: 0 } },
      { $inc: { currentParticipantsCount: -1, stateVersion: 1 } },
      { new: true }
    ).exec();

    const hostUsername = isOwner
      ? ((room.ownerId as any).displayName || (room.ownerId as any).username || 'Host')
      : 'Moderator';
    const targetUsername =
      (updatedMembership.userId as any)?.displayName ||
      (updatedMembership.userId as any)?.username ||
      'Member';

    if (updatedRoom) {
      publishRoomStateEvent(
        roomId,
        'member.kicked',
        {
          userId: targetUserId,
          username: targetUsername,
          reason: reason || (isOwner ? 'Removed by host' : 'Removed by moderator'),
          kickedBy: hostUserId,
          currentParticipantsCount: updatedRoom.currentParticipantsCount,
        },
        updatedRoom.stateVersion
      );
    }

    // Record activity
    try {
      await chatService.recordActivity(
        roomId,
        'member_kicked',
        { id: hostUserId, username: hostUsername, role: actorRole },
        `${targetUsername} was removed from the room by ${isOwner ? 'the host' : 'a moderator'}`,
        { id: targetUserId, username: targetUsername },
        { reason: reason || (isOwner ? 'Removed by host' : 'Removed by moderator') }
      );
    } catch {
      // Non-blocking
    }

    // Evict socket
    await evictKickedMember(roomId, targetUserId, reason);

    // Evict LiveKit voice participant
    try {
      await voiceService.evictLiveKitParticipant(roomId, targetUserId);
    } catch {
      // Non-blocking
    }

    // Clean up queued songs and advance playback if kicked user is current singer
    try {
      const departureResult = await karaokeService.handleMemberDeparted(roomId, targetUserId);
      if (departureResult) {
        const io = getSocketServer();
        if (io) {
          broadcastKaraokeQueueUpdated(io, roomId, departureResult.queue, 'removed');
          broadcastKaraokePlaybackUpdated(io, roomId, departureResult.playback);
        }
      }
    } catch (err) {
      logger.error({ err, roomId, targetUserId }, 'Error cleaning up karaoke on member kick');
    }

    return { success: true };
  }

  /**
   * Reinstates a previously kicked member, removing their kick flag so they may rejoin.
   */
  async reinstateMember(
    roomId: string,
    hostUserId: string,
    targetUserId: string
  ): Promise<{ success: boolean; error?: string }> {
    if (
      !Types.ObjectId.isValid(roomId) ||
      !Types.ObjectId.isValid(hostUserId) ||
      !Types.ObjectId.isValid(targetUserId)
    ) {
      return { success: false, error: 'INVALID_ID' };
    }

    const roomObjectId = new Types.ObjectId(roomId);
    const targetObjectId = new Types.ObjectId(targetUserId);

    const room = await RoomModel.findById(roomObjectId).select('ownerId status').exec();
    if (!room) return { success: false, error: 'ROOM_NOT_FOUND' };

    const hostOwnerIdStr = (room.ownerId as any)._id
      ? (room.ownerId as any)._id.toString()
      : room.ownerId.toString();

    if (hostOwnerIdStr !== hostUserId) {
      return { success: false, error: 'FORBIDDEN_NOT_HOST' };
    }

    const updated = await RoomMembershipModel.findOneAndUpdate(
      {
        roomId: roomObjectId,
        userId: targetObjectId,
        status: 'left',
        kickedAt: { $ne: null },
      },
      {
        $set: { kickedAt: null, kickedBy: null },
      },
      { new: true }
    ).exec();

    if (!updated) {
      return { success: false, error: 'NOT_KICKED' };
    }

    logger.info(
      { roomId, hostUserId, targetUserId },
      'Host reinstated previously kicked member'
    );

    return { success: true };
  }

  /**
   * Assign or revoke moderator role for an active room participant. Host-only action.
   */
  async updateMemberRole(
    roomId: string,
    hostUserId: string,
    targetUserId: string,
    newRole: 'moderator' | 'member'
  ): Promise<{ success: boolean; error?: string; membership?: IRoomMembershipDocument }> {
    if (
      !Types.ObjectId.isValid(roomId) ||
      !Types.ObjectId.isValid(hostUserId) ||
      !Types.ObjectId.isValid(targetUserId)
    ) {
      return { success: false, error: 'INVALID_ID' };
    }

    if (hostUserId === targetUserId) {
      return { success: false, error: 'CANNOT_CHANGE_HOST_ROLE' };
    }

    const roomObjectId = new Types.ObjectId(roomId);
    const targetObjectId = new Types.ObjectId(targetUserId);

    const room = await RoomModel.findById(roomObjectId).populate('ownerId', 'username displayName avatar').exec();
    if (!room) {
      return { success: false, error: 'ROOM_NOT_FOUND' };
    }

    if (room.status === 'closed') {
      return { success: false, error: 'ROOM_CLOSED' };
    }

    const hostOwnerIdStr = (room.ownerId as any)._id
      ? (room.ownerId as any)._id.toString()
      : room.ownerId.toString();

    if (hostOwnerIdStr !== hostUserId) {
      return { success: false, error: 'FORBIDDEN_NOT_HOST' };
    }

    if (targetUserId === hostOwnerIdStr) {
      return { success: false, error: 'CANNOT_CHANGE_HOST_ROLE' };
    }

    // Target must be an active member
    const targetMembership = await RoomMembershipModel.findOne({
      roomId: roomObjectId,
      userId: targetObjectId,
      status: 'active',
    }).populate('userId', 'username displayName avatar').exec();

    if (!targetMembership) {
      return { success: false, error: 'NOT_A_MEMBER' };
    }

    if (targetMembership.role === newRole) {
      return { success: true, membership: targetMembership };
    }

    // Update role and advance stateVersion
    targetMembership.role = newRole;
    await targetMembership.save();

    const updatedRoom = await RoomModel.findByIdAndUpdate(
      roomObjectId,
      { $inc: { stateVersion: 1 } },
      { new: true }
    ).exec();

    const version = updatedRoom?.stateVersion || room.stateVersion + 1;
    const targetUsername = (targetMembership.userId as any)?.username || 'Member';
    const hostUsername = (room.ownerId as any)?.username || 'Host';

    // Publish room state event
    await publishRoomStateEvent(
      roomId,
      'member.role.updated',
      {
        userId: targetUserId,
        username: targetUsername,
        role: newRole,
        updatedBy: hostUserId,
      },
      version
    );

    // Emit typed Socket.IO event
    const io = getSocketServer();
    if (io) {
      io.to(getRoomChannel(roomId)).emit(SOCKET_EVENTS.SERVER.MEMBER_ROLE_UPDATED, {
        roomId,
        userId: targetUserId,
        role: newRole,
        updatedBy: hostUserId,
      });
    }

    // Record activity
    try {
      await chatService.recordActivity(
        roomId,
        'member_role_updated',
        { id: hostUserId, username: hostUsername, role: 'host' },
        newRole === 'moderator'
          ? `${targetUsername} was promoted to Lounge Moderator`
          : `${targetUsername} was demoted to Lounge Member`,
        { id: targetUserId, username: targetUsername },
        { newRole }
      );
    } catch {
      // Non-blocking
    }

    return { success: true, membership: targetMembership };
  }

  /**
   * Server-authoritatively mute or unmute a participant's voice publishing permissions.
   * Host or Moderator action.
   */
  async muteMember(
    roomId: string,
    actorUserId: string,
    targetUserId: string,
    isMuted: boolean,
    reason?: string
  ): Promise<{ success: boolean; error?: string; membership?: IRoomMembershipDocument }> {
    if (
      !Types.ObjectId.isValid(roomId) ||
      !Types.ObjectId.isValid(actorUserId) ||
      !Types.ObjectId.isValid(targetUserId)
    ) {
      return { success: false, error: 'INVALID_ID' };
    }

    if (actorUserId === targetUserId) {
      return { success: false, error: 'CANNOT_MUTE_SELF' };
    }

    const roomObjectId = new Types.ObjectId(roomId);
    const actorObjectId = new Types.ObjectId(actorUserId);
    const targetObjectId = new Types.ObjectId(targetUserId);

    const room = await RoomModel.findById(roomObjectId).populate('ownerId', 'username displayName avatar').exec();
    if (!room) {
      return { success: false, error: 'ROOM_NOT_FOUND' };
    }

    if (room.status === 'closed') {
      return { success: false, error: 'ROOM_CLOSED' };
    }

    const hostOwnerIdStr = (room.ownerId as any)._id
      ? (room.ownerId as any)._id.toString()
      : room.ownerId.toString();

    // Verify actor role (Host or Moderator)
    const isOwner = hostOwnerIdStr === actorUserId;
    let actorRole: 'host' | 'moderator' | 'member' = isOwner ? 'host' : 'member';

    if (!isOwner) {
      const actorMembership = await RoomMembershipModel.findOne({
        roomId: roomObjectId,
        userId: actorObjectId,
        status: 'active',
      }).exec();
      if (!actorMembership || (actorMembership.role !== 'host' && actorMembership.role !== 'moderator')) {
        return { success: false, error: 'FORBIDDEN_NOT_AUTHORIZED' };
      }
      actorRole = actorMembership.role;
    }

    // Host cannot be muted by anyone
    if (targetUserId === hostOwnerIdStr) {
      return { success: false, error: 'CANNOT_MUTE_HOST' };
    }

    // Target must be active member
    const targetMembership = await RoomMembershipModel.findOne({
      roomId: roomObjectId,
      userId: targetObjectId,
      status: 'active',
    }).populate('userId', 'username displayName avatar').exec();

    if (!targetMembership) {
      return { success: false, error: 'NOT_A_MEMBER' };
    }

    if (targetMembership.role === 'host') {
      return { success: false, error: 'CANNOT_MUTE_HOST' };
    }

    // Moderator cannot mute another moderator
    if (actorRole === 'moderator' && targetMembership.role === 'moderator') {
      return { success: false, error: 'MODERATOR_CANNOT_MUTE_MODERATOR' };
    }

    // Update mute state
    targetMembership.isMuted = isMuted;
    targetMembership.mutedAt = isMuted ? new Date() : null;
    targetMembership.mutedBy = isMuted ? actorObjectId : null;
    await targetMembership.save();

    // Enforce LiveKit server track mute and permission updates
    await voiceService.muteLiveKitParticipant(roomId, targetUserId, isMuted);

    const updatedRoom = await RoomModel.findByIdAndUpdate(
      roomObjectId,
      { $inc: { stateVersion: 1 } },
      { new: true }
    ).exec();

    const version = updatedRoom?.stateVersion || room.stateVersion + 1;
    const targetUsername = (targetMembership.userId as any)?.username || 'Member';
    const actorUsername = isOwner ? (room.ownerId as any)?.username : 'Moderator';

    // Publish room state event
    await publishRoomStateEvent(
      roomId,
      isMuted ? 'member.muted' : 'member.unmuted',
      {
        userId: targetUserId,
        username: targetUsername,
        isMuted,
        mutedBy: actorUserId,
        reason: reason || (isMuted ? 'Muted by room moderation' : 'Unmuted'),
      },
      version
    );

    // Emit typed Socket.IO event
    const io = getSocketServer();
    if (io) {
      io.to(getRoomChannel(roomId)).emit(SOCKET_EVENTS.SERVER.MEMBER_MUTED, {
        roomId,
        userId: targetUserId,
        isMuted,
        mutedBy: actorUserId,
        reason,
      });
    }

    // Record activity
    try {
      await chatService.recordActivity(
        roomId,
        isMuted ? 'member_muted' : 'member_unmuted',
        { id: actorUserId, username: actorUsername, role: actorRole },
        isMuted
          ? `${targetUsername}'s microphone was muted by ${actorRole === 'host' ? 'the host' : 'a moderator'}`
          : `${targetUsername}'s microphone was unmuted`,
        { id: targetUserId, username: targetUsername },
        { isMuted, reason }
      );
    } catch {
      // Non-blocking
    }

    return { success: true, membership: targetMembership };
  }

  /**
   * Concurrency-safe Host Ownership Transfer. Host-only action.
   */
  async transferHost(
    roomId: string,
    currentHostId: string,
    newHostUserId: string
  ): Promise<{ success: boolean; error?: string; room?: IRoomDocument }> {
    if (
      !Types.ObjectId.isValid(roomId) ||
      !Types.ObjectId.isValid(currentHostId) ||
      !Types.ObjectId.isValid(newHostUserId)
    ) {
      return { success: false, error: 'INVALID_ID' };
    }

    if (currentHostId === newHostUserId) {
      return { success: false, error: 'CANNOT_TRANSFER_TO_SELF' };
    }

    const roomObjectId = new Types.ObjectId(roomId);
    const currentHostObjectId = new Types.ObjectId(currentHostId);
    const newHostObjectId = new Types.ObjectId(newHostUserId);

    const room = await RoomModel.findById(roomObjectId).populate('ownerId', 'username displayName avatar').exec();
    if (!room) {
      return { success: false, error: 'ROOM_NOT_FOUND' };
    }

    if (room.status === 'closed') {
      return { success: false, error: 'ROOM_CLOSED' };
    }

    const hostOwnerIdStr = (room.ownerId as any)._id
      ? (room.ownerId as any)._id.toString()
      : room.ownerId.toString();

    if (hostOwnerIdStr !== currentHostId) {
      return { success: false, error: 'FORBIDDEN_NOT_HOST' };
    }

    // Target must be active member
    const targetMembership = await RoomMembershipModel.findOne({
      roomId: roomObjectId,
      userId: newHostObjectId,
      status: 'active',
    }).populate('userId', 'username displayName avatar').exec();

    if (!targetMembership) {
      return { success: false, error: 'TARGET_NOT_ACTIVE_MEMBER' };
    }

    // Atomic room ownership transfer
    const updatedRoom = await RoomModel.findOneAndUpdate(
      { _id: roomObjectId, ownerId: currentHostObjectId },
      { $set: { ownerId: newHostObjectId }, $inc: { stateVersion: 1 } },
      { new: true }
    ).populate('ownerId', 'username displayName avatar').exec();

    if (!updatedRoom) {
      return { success: false, error: 'TRANSFER_FAILED_CONCURRENT_CHANGE' };
    }

    // Promote new host membership
    targetMembership.role = 'host';
    await targetMembership.save();

    // Demote previous host membership to member
    await RoomMembershipModel.updateOne(
      { roomId: roomObjectId, userId: currentHostObjectId, status: 'active' },
      { $set: { role: 'member' } }
    ).exec();

    const version = updatedRoom.stateVersion;
    const previousHostUsername = (room.ownerId as any)?.username || 'Host';
    const newHostUsername = (targetMembership.userId as any)?.username || 'Member';
    const newHostDisplayName = (targetMembership.userId as any)?.displayName ?? null;

    // Publish room state event
    await publishRoomStateEvent(
      roomId,
      'room.host.transferred',
      {
        previousHostId: currentHostId,
        newHostId: newHostUserId,
        newHostUsername,
        newHostDisplayName,
      },
      version
    );

    // Also publish room.updated so host object updates in client snapshot
    await publishRoomStateEvent(
      roomId,
      'room.updated',
      {
        ownerId: newHostUserId,
        host: {
          id: newHostUserId,
          username: newHostUsername,
          displayName: newHostDisplayName,
          avatar: (targetMembership.userId as any)?.avatar ?? null,
        },
      },
      version
    );

    // Emit typed Socket.IO event
    const io = getSocketServer();
    if (io) {
      io.to(getRoomChannel(roomId)).emit(SOCKET_EVENTS.SERVER.ROOM_HOST_TRANSFERRED, {
        roomId,
        previousHostId: currentHostId,
        newHostId: newHostUserId,
        newHostUsername,
        newHostDisplayName,
      });
    }

    // Record activity
    try {
      await chatService.recordActivity(
        roomId,
        'room_host_transferred',
        { id: currentHostId, username: previousHostUsername, role: 'host' },
        `${previousHostUsername} transferred Lounge Host ownership to ${newHostUsername}`,
        { id: newHostUserId, username: newHostUsername },
        { previousHostId: currentHostId, newHostId: newHostUserId }
      );
    } catch {
      // Non-blocking
    }

    return { success: true, room: updatedRoom };
  }

  /**
   * Toggle room lock state. When locked, non-member entries are rejected. Host-only action.
   */
  async setRoomLock(
    roomId: string,
    hostUserId: string,
    isLocked: boolean
  ): Promise<{ success: boolean; error?: string; room?: IRoomDocument }> {
    if (!Types.ObjectId.isValid(roomId) || !Types.ObjectId.isValid(hostUserId)) {
      return { success: false, error: 'INVALID_ID' };
    }

    const roomObjectId = new Types.ObjectId(roomId);
    const hostObjectId = new Types.ObjectId(hostUserId);

    const room = await RoomModel.findById(roomObjectId).populate('ownerId', 'username displayName avatar').exec();
    if (!room) {
      return { success: false, error: 'ROOM_NOT_FOUND' };
    }

    if (room.status === 'closed') {
      return { success: false, error: 'ROOM_CLOSED' };
    }

    const hostOwnerIdStr = (room.ownerId as any)._id
      ? (room.ownerId as any)._id.toString()
      : room.ownerId.toString();

    if (hostOwnerIdStr !== hostUserId) {
      return { success: false, error: 'FORBIDDEN_NOT_HOST' };
    }

    const updatedRoom = await RoomModel.findOneAndUpdate(
      { _id: roomObjectId, ownerId: hostObjectId },
      { $set: { isLocked }, $inc: { stateVersion: 1 } },
      { new: true }
    ).populate('ownerId', 'username displayName avatar').exec();

    if (!updatedRoom) {
      return { success: false, error: 'LOCK_FAILED' };
    }

    const version = updatedRoom.stateVersion;
    const hostUsername = (room.ownerId as any)?.username || 'Host';

    // Publish room state event
    await publishRoomStateEvent(
      roomId,
      'room.lock.updated',
      {
        isLocked,
        updatedBy: hostUserId,
      },
      version
    );

    // Emit typed Socket.IO event
    const io = getSocketServer();
    if (io) {
      io.to(getRoomChannel(roomId)).emit(SOCKET_EVENTS.SERVER.ROOM_LOCK_UPDATED, {
        roomId,
        isLocked,
        updatedBy: hostUserId,
      });
    }

    // Record activity
    try {
      await chatService.recordActivity(
        roomId,
        isLocked ? 'room_locked' : 'room_unlocked',
        { id: hostUserId, username: hostUsername, role: 'host' },
        isLocked
          ? `${hostUsername} locked the lounge (new entries blocked)`
          : `${hostUsername} unlocked the lounge`,
        undefined,
        { isLocked }
      );
    } catch {
      // Non-blocking
    }

    return { success: true, room: updatedRoom };
  }

  /**
   * Retrieve lightweight room version and occupancy for lost final event detection.
   */
  async getRoomStateVersion(
    roomId: string
  ): Promise<{ success: true; data: RoomStateVersionDto } | { success: false; error: string }> {
    if (!Types.ObjectId.isValid(roomId)) {
      return { success: false, error: 'INVALID_ID' };
    }
    const room = await RoomModel.findById(roomId).select('stateVersion status currentParticipantsCount').exec();
    if (!room) {
      return { success: false, error: 'ROOM_NOT_FOUND' };
    }
    return {
      success: true,
      data: {
        version: room.stateVersion || 1,
        status: room.status,
        currentParticipantsCount: room.currentParticipantsCount,
      },
    };
  }

  /**
   * Retrieve authoritative server room state snapshot for synchronized client hydration.
   * Uses Version-Fenced Reads to guarantee consistent snapshot and detects/repairs occupancy drift.
   */
  async getRoomStateSnapshot(
    roomId: string,
    requestingUserId?: string
  ): Promise<GetRoomStateSnapshotResult> {
    if (!Types.ObjectId.isValid(roomId)) {
      return { success: false, error: 'INVALID_ID' };
    }

    const roomObjectId = new Types.ObjectId(roomId);

    // Initial check for room existence
    const initialRoom = await RoomModel.findById(roomObjectId).populate('ownerId', 'username displayName avatar').exec();
    if (!initialRoom) {
      return { success: false, error: 'ROOM_NOT_FOUND' };
    }

    const hostOwnerIdStr = (initialRoom.ownerId as any)._id
      ? (initialRoom.ownerId as any)._id.toString()
      : initialRoom.ownerId.toString();

    const isOwner = Boolean(requestingUserId && hostOwnerIdStr === requestingUserId);

    // Check if user was kicked from this room
    let isKicked = false;
    if (requestingUserId && !isOwner) {
      const kickedRecord = await RoomMembershipModel.findOne({
        roomId: roomObjectId,
        userId: new Types.ObjectId(requestingUserId),
        status: 'left',
        kickedAt: { $ne: null },
      }).exec();

      if (kickedRecord) {
        isKicked = true;
        // If room is private, kicked members are completely forbidden from viewing snapshot
        if (initialRoom.visibility === 'private') {
          return { success: false, error: 'FORBIDDEN_KICKED' };
        }
      }
    }

    // Private room authorization check
    if (initialRoom.visibility === 'private' && !isOwner) {
      if (!requestingUserId) {
        return { success: false, error: 'UNAUTHORIZED' };
      }

      const isMember = await RoomMembershipModel.exists({
        roomId: roomObjectId,
        userId: new Types.ObjectId(requestingUserId),
        status: 'active',
      });

      if (!isMember) {
        return { success: false, error: 'FORBIDDEN_PRIVATE_ROOM' };
      }
    }

    // Version-fenced read loop (up to 3 attempts) to ensure consistent snapshot
    let roomDoc: IRoomDocument = initialRoom;
    let activeMembersDocs: IRoomMembershipDocument[] = [];
    let verifiedVersion = initialRoom.stateVersion || 1;

    for (let attempt = 1; attempt <= 3; attempt++) {
      const r1 = await RoomModel.findById(roomObjectId).populate('ownerId', 'username displayName avatar').exec();
      if (!r1) {
        return { success: false, error: 'ROOM_NOT_FOUND' };
      }
      const v1 = r1.stateVersion || 1;

      const membersQuery = await RoomMembershipModel.find({
        roomId: roomObjectId,
        status: 'active',
      })
        .populate('userId', 'username displayName avatar role')
        .sort({ joinedAt: 1 })
        .exec();

      const r2 = await RoomModel.findById(roomObjectId).select('stateVersion currentParticipantsCount status').exec();
      const v2 = r2?.stateVersion || 1;

      // Check if version and status were stable during reading
      if (v1 === v2 && r1.status === r2?.status) {
        // Invariant check: currentParticipantsCount === members.length (unless closed)
        if (r2.status !== 'closed' && r2.currentParticipantsCount !== membersQuery.length) {
          logger.warn(
            { roomId, attempt, stored: r2.currentParticipantsCount, actual: membersQuery.length },
            '⚠️ Occupancy drift detected during snapshot read; running CAS reconciliation'
          );
          await roomReconciliationService.reconcileRoom(roomId);
          continue; // retry fence after reconciliation
        }

        roomDoc = r1;
        activeMembersDocs = membersQuery;
        verifiedVersion = v1;
        break;
      }

      if (attempt === 3) {
        // Bounded retry ceiling reached; take latest snapshot
        roomDoc = r1;
        activeMembersDocs = membersQuery;
        verifiedVersion = v2;
      }
    }

    // Determine viewer membership and role
    let isMember = false;
    let role: 'host' | 'moderator' | 'member' | 'viewer' | 'none' = 'none';
    let isMuted = false;

    if (requestingUserId) {
      if (isOwner) {
        isMember = true;
        role = 'host';
      } else {
        const myMembership = await RoomMembershipModel.findOne({
          roomId: roomObjectId,
          userId: new Types.ObjectId(requestingUserId),
          status: 'active',
        }).exec();

        if (myMembership) {
          isMember = true;
          role = myMembership.role as 'host' | 'moderator' | 'member';
          isMuted = Boolean(myMembership.isMuted);
        } else {
          role = 'viewer';
        }
      }
    }

    const members: RoomMembershipDto[] = activeMembersDocs.map(
      (m) => m.toJSON() as unknown as RoomMembershipDto
    );

    // Fetch active ephemeral presence (separately sourced)
    const presenceSnapshot = presenceManager.getRoomPresence(roomId);
    const presence = presenceSnapshot.map((p) => p.userId);

    const host = {
      id: hostOwnerIdStr,
      username: (roomDoc.ownerId as any).username || 'Host',
      displayName: (roomDoc.ownerId as any).displayName ?? null,
      avatar: (roomDoc.ownerId as any).avatar ?? null,
    };

    const roomSnapshot: RoomSnapshotDto = {
      id: roomDoc._id.toString(),
      name: roomDoc.name,
      description: roomDoc.description ?? null,
      ownerId: host.id,
      roomType: roomDoc.roomType,
      visibility: roomDoc.visibility,
      capacity: roomDoc.capacity,
      status: roomDoc.status,
      category: roomDoc.category,
      currentParticipantsCount: roomDoc.currentParticipantsCount,
      isChatEnabled: roomDoc.isChatEnabled !== false,
      isLocked: Boolean(roomDoc.isLocked),
      atmospherePreset: roomDoc.atmospherePreset || 'midnight_lounge',
      stateVersion: verifiedVersion,
      currentSongTitle: roomDoc.currentSongTitle ?? null,
      currentSingerName: roomDoc.currentSingerName ?? null,
    };

    return {
      success: true,
      snapshot: {
        room: roomSnapshot,
        host,
        members,
        presence,
        viewer: {
          isMember,
          role,
          isMuted,
          isKicked,
        },
        version: verifiedVersion,
        generatedAt: new Date().toISOString(),
      },
    };
  }
}

export const roomService = new RoomService();

