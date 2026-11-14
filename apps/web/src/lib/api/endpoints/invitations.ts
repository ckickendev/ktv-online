import { apiClient } from '../client';
import {
  CreateInvitationResponseDto,
  InvitationPreviewDto,
  RoomInvitationDto,
  RoomMembershipDto,
} from '@ktv/contracts';

export const invitationApi = {
  /**
   * Generates a new invitation link for an authorized room host.
   */
  async createInvitation(
    roomId: string,
    expiresInHours = 48
  ): Promise<CreateInvitationResponseDto> {
    return apiClient.post<CreateInvitationResponseDto>(`/rooms/${roomId}/invitations`, {
      expiresInHours,
    });
  },

  /**
   * Retrieves active invitation metadata for a room (host only).
   */
  async getActiveInvitation(roomId: string): Promise<RoomInvitationDto | null> {
    return apiClient.get<RoomInvitationDto | null>(`/rooms/${roomId}/invitations`);
  },

  /**
   * Revokes any active invitation for a room (host only).
   */
  async revokeInvitation(roomId: string): Promise<null> {
    return apiClient.post<null>(`/rooms/${roomId}/invitations/revoke`, {});
  },

  /**
   * Public preview of an invitation token.
   */
  async previewInvitation(token: string): Promise<InvitationPreviewDto> {
    return apiClient.get<InvitationPreviewDto>(`/invitations/${encodeURIComponent(token)}`);
  },

  /**
   * Joins a room using an invitation token.
   */
  async joinViaInvitation(token: string): Promise<RoomMembershipDto> {
    return apiClient.post<RoomMembershipDto>(`/invitations/${encodeURIComponent(token)}/join`, {});
  },
};
