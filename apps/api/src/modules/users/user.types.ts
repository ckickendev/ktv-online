import { Document } from 'mongoose';
import { UserRole, UserStatus, UserPreferencesDto } from '@ktv/contracts';

export interface IUser {
  username: string;
  email: string;
  passwordHash: string;
  avatar?: string | null;
  role: UserRole;
  status: UserStatus;
  preferences?: UserPreferencesDto;
  createdAt: Date;
  updatedAt: Date;
}

export interface IUserDocument extends IUser, Document {}
