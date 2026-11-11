import mongoose, { Schema, model, Model } from 'mongoose';
import { IUserDocument } from './user.types.js';

const UserSchema = new Schema<IUserDocument>(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      minlength: 3,
      maxlength: 30,
    },
    displayName: {
      type: String,
      trim: true,
      default: null,
      maxlength: 32,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    passwordHash: {
      type: String,
      required: true,
    },
    avatar: {
      type: String,
      default: null,
    },
    bio: {
      type: String,
      trim: true,
      default: null,
      maxlength: 160,
    },
    role: {
      type: String,
      enum: ['admin', 'user', 'moderator'],
      default: 'user',
      index: true,
    },
    status: {
      type: String,
      enum: ['active', 'suspended', 'offline', 'online'],
      default: 'active',
      index: true,
    },
    preferences: {
      preferredGenres: {
        type: [String],
        default: ['pop'],
      },
      preferredLanguages: {
        type: [String],
        default: ['vi', 'en'],
      },
      participationStyle: {
        type: String,
        enum: ['singing', 'audience', 'both'],
        default: 'both',
      },
      lyricsFontSize: {
        type: String,
        enum: ['compact', 'normal', 'large'],
        default: 'normal',
      },
      visualEffectsIntensity: {
        type: String,
        enum: ['full', 'reduced', 'minimal'],
        default: 'full',
      },
      showReactions: {
        type: Boolean,
        default: true,
      },
      showGifts: {
        type: Boolean,
        default: true,
      },
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: (_doc, ret: Record<string, unknown>) => {
        ret.id = ret._id ? (ret._id as { toString(): string }).toString() : undefined;
        delete ret._id;
        delete ret.__v;
        delete ret.passwordHash;
        return ret;
      },
    },
  }
);

export const UserModel: Model<IUserDocument> =
  (mongoose.models.User as Model<IUserDocument>) || model<IUserDocument>('User', UserSchema);
