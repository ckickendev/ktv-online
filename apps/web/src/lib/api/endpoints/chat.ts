import { apiClient } from '../client';
import {
  ChatMessageDto,
  RoomActivityDto,
} from '@ktv/contracts';

export interface GetMessagesResult {
  messages: ChatMessageDto[];
  nextCursor?: string;
}

export const chatApi = {
  async getMessages(
    roomId: string,
    params?: { limit?: number; before?: string }
  ): Promise<GetMessagesResult> {
    return apiClient.get<GetMessagesResult>(`/rooms/${roomId}/messages`, {
      params: params as Record<string, string | number | boolean | undefined>,
    });
  },

  async deleteMessage(
    roomId: string,
    messageId: string
  ): Promise<{ success: boolean; messageId: string }> {
    return apiClient.delete<{ success: boolean; messageId: string }>(
      `/rooms/${roomId}/messages/${messageId}`
    );
  },

  async getActivities(roomId: string, limit?: number): Promise<RoomActivityDto[]> {
    return apiClient.get<RoomActivityDto[]>(`/rooms/${roomId}/activities`, {
      params: limit ? { limit } : undefined,
    });
  },
};
