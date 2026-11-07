import { apiClient } from '../client';
import {
  CreateRoomDto,
  PaginationMeta,
  RoomDto,
  RoomMembershipDto,
  RoomMyMembershipDto,
  RoomQueryDto,
  UpdateRoomDto,
} from '@ktv/contracts';

export interface PaginatedRoomsResult {
  items: RoomDto[];
  pagination: PaginationMeta;
}

export const roomApi = {
  async getRooms(params?: Partial<RoomQueryDto>): Promise<PaginatedRoomsResult> {
    return apiClient.get<PaginatedRoomsResult>('/rooms', {
      params: params as Record<string, string | number | boolean | undefined>,
    });
  },

  async getMyRooms(params?: { page?: number; limit?: number }): Promise<PaginatedRoomsResult> {
    return apiClient.get<PaginatedRoomsResult>('/rooms/my-rooms', {
      params: params as Record<string, string | number | boolean | undefined>,
    });
  },

  async getRoomById(roomId: string): Promise<RoomDto> {
    return apiClient.get<RoomDto>(`/rooms/${roomId}`);
  },

  async createRoom(payload: CreateRoomDto): Promise<RoomDto> {
    return apiClient.post<RoomDto>('/rooms', payload);
  },

  async updateRoom(roomId: string, payload: UpdateRoomDto): Promise<RoomDto> {
    return apiClient.patch<RoomDto>(`/rooms/${roomId}`, payload);
  },

  async closeRoom(roomId: string): Promise<RoomDto> {
    return apiClient.post<RoomDto>(`/rooms/${roomId}/close`, {});
  },

  async joinRoom(roomId: string): Promise<RoomMembershipDto> {
    return apiClient.post<RoomMembershipDto>(`/rooms/${roomId}/join`, {});
  },

  async leaveRoom(roomId: string): Promise<null> {
    return apiClient.post<null>(`/rooms/${roomId}/leave`, {});
  },

  async getJoinedRooms(params?: { page?: number; limit?: number }): Promise<PaginatedRoomsResult> {
    return apiClient.get<PaginatedRoomsResult>('/rooms/joined-rooms', {
      params: params as Record<string, string | number | boolean | undefined>,
    });
  },

  async getMyMembership(roomId: string): Promise<RoomMyMembershipDto> {
    return apiClient.get<RoomMyMembershipDto>(`/rooms/${roomId}/membership`);
  },

  async getMembers(roomId: string): Promise<RoomMembershipDto[]> {
    return apiClient.get<RoomMembershipDto[]>(`/rooms/${roomId}/members`);
  },
};
