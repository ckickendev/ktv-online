import bcrypt from 'bcrypt';
import { UserModel } from './user.model.js';
import { IUserDocument } from './user.types.js';
import { CreateUserDto, UpdateUserDto } from '@ktv/contracts';

import { authService } from '../auth/auth.service.js';

export class UserService {
  async findById(id: string): Promise<IUserDocument | null> {
    return UserModel.findById(id).exec();
  }

  async findByEmail(email: string): Promise<IUserDocument | null> {
    return UserModel.findOne({ email: email.toLowerCase() }).exec();
  }

  async findByUsername(username: string): Promise<IUserDocument | null> {
    return UserModel.findOne({ username: username.toLowerCase() }).exec();
  }

  async create(data: CreateUserDto): Promise<IUserDocument> {
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(data.password, saltRounds);

    const user = new UserModel({
      username: data.username.toLowerCase(),
      email: data.email.toLowerCase(),
      passwordHash,
      avatar: data.avatar || null,
      role: 'user',
      status: 'active',
    });

    return user.save();
  }

  async update(id: string, data: UpdateUserDto): Promise<IUserDocument | null> {
    const updated = await UserModel.findByIdAndUpdate(
      id,
      { $set: data },
      { new: true, runValidators: true }
    ).exec();

    if (updated && (data.status === 'suspended' || (data as { status?: string }).status === 'deactivated')) {
      await authService.revokeUserSessions(id, `STATUS_${(data.status || 'SUSPENDED').toUpperCase()}`);
    }

    return updated;
  }
}

export const userService = new UserService();
