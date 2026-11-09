import { FilterQuery, Types } from 'mongoose';
import { RoomModel } from './room.model.js';
import { RoomMembershipModel } from './membership.model.js';
import { IRoomDocument } from './room.types.js';
import { IRoomMembershipDocument } from './membership.types.js';
import { CreateRoomDto, RoomQueryDto, UpdateRoomDto } from '@ktv/contracts';
import { chatService } from '../chat/chat.service.js';
import { evictKickedMember } from '../../realtime/socket.server.js';

export type JoinRoomResult =
  | { success: true; membership: IRoomMembershipDocument; alreadyJoined: boolean }
  | {
      success: false;
      error: 'ROOM_NOT_FOUND' | 'ROOM_CLOSED' | 'ROOM_FULL' | 'PRIVATE_ROOM' | 'JOIN_FAILED';
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
        | 'CANNOT_KICK_SELF'
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
    return RoomModel.findById(id).populate('ownerId', 'username avatar').exec();
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
        .populate('ownerId', 'username avatar')
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
        .populate('ownerId', 'username avatar')
        .exec(),
      RoomModel.countDocuments(filter).exec(),
    ]);

    return { items, total };
  }

  async update(id: string, data: UpdateRoomDto): Promise<IRoomDocument | null> {
    if (!Types.ObjectId.isValid(id)) {
      return null;
    }

    const filter: FilterQuery<IRoomDocument> = { _id: new Types.ObjectId(id) };
    // Atomic capacity guard: cannot reduce capacity below current participant count
    if (data.capacity !== undefined) {
      filter.currentParticipantsCount = { $lte: data.capacity };
    }

    return RoomModel.findOneAndUpdate(
      filter,
      { $set: data },
      { new: true, runValidators: true }
    )
      .populate('ownerId', 'username avatar')
      .exec();
  }

  async closeRoom(id: string): Promise<IRoomDocument | null> {
    if (!Types.ObjectId.isValid(id)) {
      return null;
    }
    const roomObjectId = new Types.ObjectId(id);
    const room = await RoomModel.findByIdAndUpdate(
      roomObjectId,
      { $set: { status: 'closed', currentParticipantsCount: 0 } },
      { new: true, runValidators: true }
    )
      .populate('ownerId', 'username avatar')
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
      .populate('userId', 'username avatar role')
      .exec();

    if (existingMembership) {
      return { success: true, membership: existingMembership, alreadyJoined: true };
    }

    // 3. Atomic capacity check and reservation (must not be closed)
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
            .populate('userId', 'username avatar role')
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
            .populate('userId', 'username avatar role')
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
          .populate('userId', 'username avatar role')
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
            },
          },
          { new: true }
        )
          .populate('userId', 'username avatar role')
          .exec();

        if (!reactivated) {
          // Another concurrent request reactivated it already. Roll back reserved capacity!
          await RoomModel.updateOne(
            { _id: roomObjectId, status: { $ne: 'closed' } },
            { $inc: { currentParticipantsCount: -1 } }
          ).exec();

          const activeMem = await RoomMembershipModel.findById(existingDoc._id)
            .populate('userId', 'username avatar role')
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
    ).exec();

    if (!updatedMembership) {
      return { success: false, error: 'NOT_A_MEMBER' };
    }

    // 3. Safely decrement room participant count exactly once
    await RoomModel.findOneAndUpdate(
      { _id: roomObjectId, currentParticipantsCount: { $gt: 0 } },
      { $inc: { currentParticipantsCount: -1 } }
    ).exec();

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
      .populate('userId', 'username avatar role')
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
      .populate('userId', 'username avatar role')
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
          populate: { path: 'ownerId', select: 'username avatar' },
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

    const room = await RoomModel.findById(roomObjectId).populate('ownerId', 'username avatar').exec();
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

    // Atomically transition target membership to 'left' with kicked metadata
    const updatedMembership = await RoomMembershipModel.findOneAndUpdate(
      {
        roomId: roomObjectId,
        userId: targetObjectId,
        status: 'active',
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
      .populate('userId', 'username avatar')
      .exec();

    if (!updatedMembership) {
      return { success: false, error: 'NOT_A_MEMBER' };
    }

    // Safely decrement room participant count
    await RoomModel.findOneAndUpdate(
      { _id: roomObjectId, currentParticipantsCount: { $gt: 0 } },
      { $inc: { currentParticipantsCount: -1 } }
    ).exec();

    const hostUsername = (room.ownerId as any).username || 'Host';
    const targetUsername = (updatedMembership.userId as any)?.username || 'Member';

    // Record activity
    try {
      await chatService.recordActivity(
        roomId,
        'member_kicked',
        { id: hostUserId, username: hostUsername, role: 'host' },
        `${targetUsername} was removed from the room by the host`,
        { id: targetUserId, username: targetUsername },
        { reason: reason || 'Removed by host' }
      );
    } catch {
      // Non-blocking
    }

    // Evict socket
    await evictKickedMember(roomId, targetUserId, reason);

    return { success: true };
  }
}

export const roomService = new RoomService();
