import { FilterQuery, Types } from 'mongoose';
import { RoomModel } from './room.model.js';
import { IRoomDocument } from './room.types.js';
import { CreateRoomDto, RoomQueryDto, UpdateRoomDto } from '@ktv/contracts';

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

    return room.save();
  }

  async update(id: string, data: UpdateRoomDto): Promise<IRoomDocument | null> {
    if (!Types.ObjectId.isValid(id)) {
      return null;
    }
    return RoomModel.findByIdAndUpdate(
      id,
      { $set: data },
      { new: true, runValidators: true }
    ).exec();
  }
}

export const roomService = new RoomService();
