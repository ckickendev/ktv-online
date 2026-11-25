import {
  MicOwnershipSnapshotDto,
  MicOwnershipSnapshotDtoSchema,
} from '@ktv/contracts';
import { apiClient } from '@/lib/api/client';

/**
 * Fetches the authoritative Virtual Microphone Ownership snapshot for a room
 * via GET /api/v1/rooms/:roomId/mic.
 *
 * Used strictly for initial hydration and fallback resynchronization when
 * the realtime Socket.IO transport cannot be used.
 */
export async function getMicSnapshot(roomId: string): Promise<MicOwnershipSnapshotDto> {
  const raw = await apiClient.get<MicOwnershipSnapshotDto>(`/rooms/${roomId}/mic`);
  return MicOwnershipSnapshotDtoSchema.parse(raw);
}

export const micApi = {
  getMicSnapshot,
};
