import bcrypt from 'bcrypt';
import { UserModel } from './user.model.js';
import { IUserDocument } from './user.types.js';
import {
  CreateUserDto,
  UpdateUserDto,
  UpdateProfileDto,
  PublicUserProfileDto,
  UserPreferencesDto,
  UpdateUserPreferencesDto,
  DEFAULT_USER_PREFERENCES,
} from '@ktv/contracts';

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

  async updateProfile(userId: string, data: UpdateProfileDto): Promise<IUserDocument | null> {
    const updateObj: Record<string, unknown> = {};
    if (data.displayName !== undefined) {
      updateObj.displayName = data.displayName ? data.displayName.trim() : null;
    }
    if (data.bio !== undefined) {
      updateObj.bio = data.bio ? data.bio.trim() : null;
    }
    if (data.avatar !== undefined) {
      updateObj.avatar = data.avatar ? data.avatar.trim() : null;
    }

    return UserModel.findByIdAndUpdate(
      userId,
      { $set: updateObj },
      { new: true, runValidators: true }
    ).exec();
  }

  async getPublicProfile(userId: string): Promise<PublicUserProfileDto | null> {
    const user = await UserModel.findById(userId).exec();
    if (!user) {
      return null;
    }

    return {
      id: user._id.toString(),
      username: user.username,
      displayName: user.displayName ?? null,
      avatar: user.avatar ?? null,
      bio: user.bio ?? null,
      role: user.role,
      createdAt: user.createdAt.toISOString(),
      favoriteGenres: user.preferences?.preferredGenres,
      favoriteLanguages: user.preferences?.preferredLanguages,
      participationStyle: user.preferences?.participationStyle,
    };
  }

  async getPreferences(userId: string): Promise<UserPreferencesDto> {
    const user = await UserModel.findById(userId).select('preferences').exec();
    if (!user || !user.preferences) {
      return DEFAULT_USER_PREFERENCES;
    }
    return {
      preferredGenres: (user.preferences.preferredGenres && user.preferences.preferredGenres.length > 0)
        ? (user.preferences.preferredGenres as UserPreferencesDto['preferredGenres'])
        : DEFAULT_USER_PREFERENCES.preferredGenres,
      preferredLanguages: (user.preferences.preferredLanguages && user.preferences.preferredLanguages.length > 0)
        ? (user.preferences.preferredLanguages as UserPreferencesDto['preferredLanguages'])
        : DEFAULT_USER_PREFERENCES.preferredLanguages,
      participationStyle: user.preferences.participationStyle || DEFAULT_USER_PREFERENCES.participationStyle,
      lyricsFontSize: user.preferences.lyricsFontSize || DEFAULT_USER_PREFERENCES.lyricsFontSize,
      visualEffectsIntensity: user.preferences.visualEffectsIntensity || DEFAULT_USER_PREFERENCES.visualEffectsIntensity,
      showReactions: user.preferences.showReactions ?? DEFAULT_USER_PREFERENCES.showReactions,
      showGifts: user.preferences.showGifts ?? DEFAULT_USER_PREFERENCES.showGifts,
    };
  }

  async updatePreferences(
    userId: string,
    data: UpdateUserPreferencesDto
  ): Promise<UserPreferencesDto> {
    const updateObj: Record<string, unknown> = {};
    if (data.preferredGenres !== undefined) updateObj['preferences.preferredGenres'] = data.preferredGenres;
    if (data.preferredLanguages !== undefined) updateObj['preferences.preferredLanguages'] = data.preferredLanguages;
    if (data.participationStyle !== undefined) updateObj['preferences.participationStyle'] = data.participationStyle;
    if (data.lyricsFontSize !== undefined) updateObj['preferences.lyricsFontSize'] = data.lyricsFontSize;
    if (data.visualEffectsIntensity !== undefined) updateObj['preferences.visualEffectsIntensity'] = data.visualEffectsIntensity;
    if (data.showReactions !== undefined) updateObj['preferences.showReactions'] = data.showReactions;
    if (data.showGifts !== undefined) updateObj['preferences.showGifts'] = data.showGifts;

    const updated = await UserModel.findByIdAndUpdate(
      userId,
      { $set: updateObj },
      { new: true, runValidators: true }
    ).exec();

    if (!updated || !updated.preferences) {
      return DEFAULT_USER_PREFERENCES;
    }

    return {
      preferredGenres: (updated.preferences.preferredGenres && updated.preferences.preferredGenres.length > 0)
        ? (updated.preferences.preferredGenres as UserPreferencesDto['preferredGenres'])
        : DEFAULT_USER_PREFERENCES.preferredGenres,
      preferredLanguages: (updated.preferences.preferredLanguages && updated.preferences.preferredLanguages.length > 0)
        ? (updated.preferences.preferredLanguages as UserPreferencesDto['preferredLanguages'])
        : DEFAULT_USER_PREFERENCES.preferredLanguages,
      participationStyle: updated.preferences.participationStyle || DEFAULT_USER_PREFERENCES.participationStyle,
      lyricsFontSize: updated.preferences.lyricsFontSize || DEFAULT_USER_PREFERENCES.lyricsFontSize,
      visualEffectsIntensity: updated.preferences.visualEffectsIntensity || DEFAULT_USER_PREFERENCES.visualEffectsIntensity,
      showReactions: updated.preferences.showReactions ?? DEFAULT_USER_PREFERENCES.showReactions,
      showGifts: updated.preferences.showGifts ?? DEFAULT_USER_PREFERENCES.showGifts,
    };
  }
}

export const userService = new UserService();
