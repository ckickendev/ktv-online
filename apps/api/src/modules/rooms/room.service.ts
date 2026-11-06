import { FilterQuery, Types } from 'mongoose';
import { RoomModel } from './room.model.js';
import { RoomMembershipModel } from './membership.model.js';
import { IRoomDocument } from './room.types.js';
import { IRoomMembershipDocument } from './membership.types.js';
import { CreateRoomDto, RoomQueryDto, UpdateRoomDto } from '@ktv/contracts';

export type JoinRoomResult =
  | { success: true; membership: IRoomMembershipDocument; alreadyJoined: boolean }
  | { success: false; error: 'ROOM_NOT_FOUND' | 'ROOM_CLOSED' | 'ROOM_FULL' | 'JOIN_FAILED' };

export type LeaveRoomResult =
  | { success: true }
  | { success: false; error: 'NOT_A_MEMBER' | 'ROOM_NOT_FOUND' };

export class RoomService {
  async findById(id: string): Promise<IRoomDocument | null> {
    if (!Types.ObjectId.isValid(id)) {
      return null;
    }
    return RoomModel.findById(id).populate('ownerId', 'username avatar').exec();
  }

  async findRooms(query: RoomQueryDto): Promise<{ items: IRoomDocument[]; total: number }> {
    const filter: FilterQuery<IRoomDocument> = {};

    if (query.visibility) {
      filter.visibility = query.visibility;
    } else {
      filter.visibility = 'public';
    }

    if (query.category && query.category !== 'all') {
      filter.category = query.category;
    }

    if (query.status) {
      filter.status = query.status;
    }

    if (query.roomType) {
      filter.roomType = query.roomType;
    }

    if (query.search) {
      filter.$text = { $search: query.search };
    }

    const page = query.page || 1;
    const limit = query.limit || 20;
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
    return RoomModel.findByIdAndUpdate(
      id,
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
    return RoomModel.findByIdAndUpdate(
      id,
      { $set: { status: 'closed' } },
      { new: true, runValidators: true }
    )
      .populate('ownerId', 'username avatar')
      .exec();
  }

  async joinRoom(roomId: string, userId: string): Promise<JoinRoomResult> {
    if (!Types.ObjectId.isValid(roomId) || !Types.ObjectId.isValid(userId)) {
      return { success: false, error: 'ROOM_NOT_FOUND' };
    }

    const roomObjectId = new Types.ObjectId(roomId);
    const userObjectId = new Types.ObjectId(userId);

    // 1. Check if user already has an active membership (Idempotent Join)
    const existingMembership = await RoomMembershipModel.findOne({
      roomId: roomObjectId,
      userId: userObjectId,
      status: 'active',
    }).exec();

    if (existingMembership) {
      return { success: true, membership: existingMembership, alreadyJoined: true };
    }

    // 2. Atomic capacity check and reservation
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

    // 3. Create or reactivate membership record
    try {
      const isOwner = updatedRoom.ownerId.toString() === userId;
      const membership = await RoomMembershipModel.findOneAndUpdate(
        { roomId: roomObjectId, userId: userObjectId },
        {
          $set: {
            role: isOwner ? 'host' : 'member',
            status: 'active',
            joinedAt: new Date(),
            leftAt: null,
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      ).exec();

      return { success: true, membership, alreadyJoined: false };
    } catch (err) {
      // Rollback reserved capacity on membership persistence failure
      await RoomModel.findByIdAndUpdate(roomObjectId, {
        $inc: { currentParticipantsCount: -1 },
      }).exec();
      throw err;
    }
  }

  async leaveRoom(roomId: string, userId: string): Promise<LeaveRoomResult> {
    if (!Types.ObjectId.isValid(roomId) || !Types.ObjectId.isValid(userId)) {
      return { success: false, error: 'ROOM_NOT_FOUND' };
    }

    const roomObjectId = new Types.ObjectId(roomId);
    const userObjectId = new Types.ObjectId(userId);

    const membership = await RoomMembershipModel.findOne({
      roomId: roomObjectId,
      userId: userObjectId,
      status: 'active',
    }).exec();

    if (!membership) {
      return { success: false, error: 'NOT_A_MEMBER' };
    }

    membership.status = 'left';
    membership.leftAt = new Date();
    await membership.save();

    // Safely decrement room participant count
    await RoomModel.findOneAndUpdate(
      { _id: roomObjectId, currentParticipantsCount: { $gt: 0 } },
      { $inc: { currentParticipantsCount: -1 } }
    ).exec();

    return { success: true };
  }

  async getActiveMembers(roomId: string): Promise<IRoomMembershipDocument[]> {
    if (!Types.ObjectId.isValid(roomId)) {
      return [];
    }
    return RoomMembershipModel.find({
      roomId: new Types.ObjectId(roomId),
      status: 'active',
    })
      .populate('userId', 'username avatar role')
      .sort({ joinedAt: 1 })
      .exec();
  }
}

export const roomService = new RoomService();
