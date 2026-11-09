import { apiClient } from '@/lib/api/client';
import { VoiceTokenRequestDto, VoiceTokenResponseDto } from '@ktv/contracts';

export const voiceApi = {
  /**
   * Requests a short-lived LiveKit voice access token for the specified room.
   */
  async getVoiceToken(roomId: string, payload?: VoiceTokenRequestDto): Promise<VoiceTokenResponseDto> {
    return apiClient.post<VoiceTokenResponseDto>(`/rooms/${roomId}/voice/token`, payload || {});
  },
};
