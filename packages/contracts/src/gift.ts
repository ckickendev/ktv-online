import { z } from 'zod';

export const GIFT_IDS = [
  'rose',
  'star',
  'microphone',
  'heart',
  'crown',
  'fireworks',
  'music_note',
  'trophy',
] as const;

export type GiftId = (typeof GIFT_IDS)[number];
export const GiftIdSchema = z.enum(GIFT_IDS);

export interface GiftDefinition {
  id: GiftId;
  name: string;
  icon: string;
  description: string;
  category:
    | 'appreciation'
    | 'recognition'
    | 'vocal'
    | 'affection'
    | 'prestige'
    | 'celebration'
    | 'melody'
    | 'honor';
  accentColor: string;
  isFree: true;
}

export const GIFT_CATALOG: readonly GiftDefinition[] = [
  {
    id: 'rose',
    name: 'Rose of Appreciation',
    icon: '🌹',
    description: 'A fragrant rose honoring an elegant performance',
    category: 'appreciation',
    accentColor: '#f43f5e',
    isFree: true,
  },
  {
    id: 'star',
    name: 'Sparkling Star',
    icon: '⭐',
    description: 'A shining star for a stellar vocalist',
    category: 'recognition',
    accentColor: '#eab308',
    isFree: true,
  },
  {
    id: 'microphone',
    name: 'Golden Microphone',
    icon: '🎤',
    description: 'Celebrating exceptional vocal talent and range',
    category: 'vocal',
    accentColor: '#a855f7',
    isFree: true,
  },
  {
    id: 'heart',
    name: 'Heartfelt Cheer',
    icon: '💖',
    description: 'Sending warmth, affection, and genuine love',
    category: 'affection',
    accentColor: '#ec4899',
    isFree: true,
  },
  {
    id: 'crown',
    name: 'Royal Crown',
    icon: '👑',
    description: 'Crowning an outstanding, showstopping performance',
    category: 'prestige',
    accentColor: '#f59e0b',
    isFree: true,
  },
  {
    id: 'fireworks',
    name: 'Celebration Fireworks',
    icon: '🎆',
    description: 'Lighting up the stage with explosive applause',
    category: 'celebration',
    accentColor: '#06b6d4',
    isFree: true,
  },
  {
    id: 'music_note',
    name: 'Melodic Notes',
    icon: '🎵',
    description: 'Harmonious appreciation for musical rhythm',
    category: 'melody',
    accentColor: '#3b82f6',
    isFree: true,
  },
  {
    id: 'trophy',
    name: 'Champion Trophy',
    icon: '🏆',
    description: 'Awarding mastery and stage presence of a champion',
    category: 'honor',
    accentColor: '#fbbf24',
    isFree: true,
  },
] as const;

export function getGiftDefinition(giftId: GiftId): GiftDefinition | undefined {
  return GIFT_CATALOG.find((g) => g.id === giftId);
}

// Client -> Server: Send gift
export const SendGiftPayloadSchema = z.object({
  roomId: z.string().min(1, 'Room ID is required'),
  giftId: GiftIdSchema,
  clientGiftId: z.string().optional(),
  recipientUserId: z.string().optional(),
  correlationId: z.string().optional(),
});
export type SendGiftPayload = z.infer<typeof SendGiftPayloadSchema>;

// Participant info representation
export const GiftParticipantDtoSchema = z.object({
  id: z.string(),
  username: z.string(),
  displayName: z.string().optional(),
  avatar: z.string().nullable().optional(),
});
export type GiftParticipantDto = z.infer<typeof GiftParticipantDtoSchema>;

// Server -> Client: Authoritative gift broadcast
export const GiftNewPayloadSchema = z.object({
  id: z.string(),
  roomId: z.string(),
  giftId: GiftIdSchema,
  sender: GiftParticipantDtoSchema,
  recipient: GiftParticipantDtoSchema,
  songTitle: z.string().optional(),
  timestamp: z.string(),
  clientGiftId: z.string().optional(),
  correlationId: z.string().optional(),
});
export type GiftNewPayload = z.infer<typeof GiftNewPayloadSchema>;
