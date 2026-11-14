import { apiClient } from '@/lib/api/client';
import {
  FriendshipDto,
  FriendRequestDto,
  UserSearchResultDto,
  FriendQueryDto,
  FriendRequestQueryDto,
  UserSearchQueryDto,
} from '@ktv/contracts';

export interface PaginatedFriendsResponse {
  items: FriendshipDto[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

export interface PaginatedFriendRequestsResponse {
  items: FriendRequestDto[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

export const friendsApi = {
  /**
   * Fetch accepted friends list with real-time presence indicators.
   */
  async getFriends(params?: Partial<FriendQueryDto>): Promise<PaginatedFriendsResponse> {
    return apiClient.get<PaginatedFriendsResponse>('/friends', {
      params: {
        page: params?.page ?? 1,
        limit: params?.limit ?? 50,
      },
    });
  },

  /**
   * Fetch incoming friend requests.
   */
  async getIncomingRequests(params?: Partial<FriendRequestQueryDto>): Promise<PaginatedFriendRequestsResponse> {
    return apiClient.get<PaginatedFriendRequestsResponse>('/friends/requests/incoming', {
      params: {
        page: params?.page ?? 1,
        limit: params?.limit ?? 50,
      },
    });
  },

  /**
   * Fetch outgoing friend requests.
   */
  async getOutgoingRequests(params?: Partial<FriendRequestQueryDto>): Promise<PaginatedFriendRequestsResponse> {
    return apiClient.get<PaginatedFriendRequestsResponse>('/friends/requests/outgoing', {
      params: {
        page: params?.page ?? 1,
        limit: params?.limit ?? 50,
      },
    });
  },

  /**
   * Send a friend request to a target user.
   */
  async sendFriendRequest(targetUserId: string): Promise<FriendRequestDto | FriendshipDto> {
    return apiClient.post<FriendRequestDto | FriendshipDto>('/friends/request', {
      targetUserId,
    });
  },

  /**
   * Accept an incoming friend request.
   */
  async acceptFriendRequest(requestId: string): Promise<FriendshipDto> {
    return apiClient.post<FriendshipDto>(`/friends/request/${requestId}/accept`);
  },

  /**
   * Decline an incoming friend request.
   */
  async declineFriendRequest(requestId: string): Promise<{ success: boolean }> {
    return apiClient.post<{ success: boolean }>(`/friends/request/${requestId}/decline`);
  },

  /**
   * Cancel a pending outgoing friend request.
   */
  async cancelFriendRequest(requestId: string): Promise<{ success: boolean }> {
    return apiClient.post<{ success: boolean }>(`/friends/request/${requestId}/cancel`);
  },

  /**
   * Remove a friend from the friends list.
   */
  async removeFriend(friendUserId: string): Promise<{ success: boolean }> {
    return apiClient.delete<{ success: boolean }>(`/friends/${friendUserId}`);
  },

  /**
   * Search users across the platform with relationship status.
   */
  async searchUsers(query: UserSearchQueryDto): Promise<UserSearchResultDto[]> {
    return apiClient.get<UserSearchResultDto[]>('/friends/search', {
      params: {
        q: query.q,
        limit: query.limit ?? 10,
      },
    });
  },

  /**
   * Send a direct room invitation to a friend.
   */
  async sendLoungeInvite(roomId: string, friendUserId: string): Promise<{ success: boolean }> {
    return apiClient.post<{ success: boolean }>(`/friends/rooms/${roomId}/invite`, {
      friendUserId,
    });
  },
};
