# KTVOnline — Sprint 5.7: Data Model & API Design

## 1. Data Model Impact Assessment

### 1.1 Zero Schema Migrations Guarantee
A central goal of Sprint 5.7 is to deliver high-value social features without introducing database schema complexity, migrations, or data drift.

**Evaluation of Existing Models:**
1. **`RoomModel`:**
   - Already stores `name`, `ownerId`, `visibility`, `status`, `capacity`, `currentParticipantsCount`, `atmospherePreset`.
   - Fully supports social lounges. No schema modification needed.
2. **`RoomInvitationModel`:**
   - Supports Option B recipient binding (`recipientId: Types.ObjectId | null`, index: `{ roomId: 1, recipientId: 1, revokedAt: 1 }`).
   - Fully supports isolated friend invitations. No schema modification needed.
3. **`FriendshipModel`:**
   - Stores bilateral pairs with `pairKey: computePairKey(userA, userB)`.
   - Fully supports friend lookup and verification. No schema modification needed.
4. **`KaraokeSessionModel`:**
   - Stores `hostId`, `participants`, `totalSongsPlayed`, `startedAt`, `endedAt`.
   - Fully records social session history. No schema modification needed.

**Conclusion:** **Zero MongoDB model or index changes are required.** The existing database architecture completely satisfies all Sprint 5.7 requirements.

---

## 2. API Contract Design

Sprint 5.7 introduces one high-leverage API endpoint to support batch multi-friend invitations:

### Endpoint: `POST /api/friends/invite-lounge-batch/:roomId`

#### Request:
- **Headers:** `Authorization: Bearer <token>`
- **URL Parameters:** `roomId: string` (MongoDB ObjectId format)
- **Request Body Schema (`BatchLoungeInviteDto`):**
  ```typescript
  export const BatchLoungeInviteSchema = z.object({
    friendUserIds: z.array(z.string().min(1)).min(1).max(20), // Bounded to max 20 friends per batch
  });
  export type BatchLoungeInviteDto = z.infer<typeof BatchLoungeInviteSchema>;
  ```

#### Authorization & Business Rules:
1. `req.user` must be authenticated.
2. `roomId` must exist and not be closed (`status !== 'closed'`).
3. Authoritative Host Ownership: `room.ownerId.toString() === req.user.id`. If caller is not the room owner, fails with HTTP 403 `FORBIDDEN_NOT_HOST`.
4. Friend Verification: For each `friendUserId` in `friendUserIds`:
   - Checks `FriendshipModel` where `pairKey = computePairKey(userId, friendUserId)` and `status = 'accepted'`.
   - If not accepted friends, that recipient is skipped with status `'NOT_FRIENDS'`.
5. Execution Strategy:
   - Uses `Promise.allSettled` to issue recipient-bound invitations in parallel.
   - For each valid friend, invokes `invitationService.createFriendInvitation(roomId, req.user.id, friendUserId, 48)`.
   - Emits `emitFriendInvitationReceived(io, friendUserId, payload)`.
   - Re-uses Option B token isolation; inviting 5 friends issues 5 independent tokens without mutual revocation.

#### Response Schema (`BatchLoungeInviteResultDto`):
```typescript
{
  success: boolean;
  totalRequested: number;
  totalInvited: number;
  results: Array<{
    friendUserId: string;
    status: 'invited' | 'failed';
    error?: string;
  }>;
}
```

#### HTTP Status Codes:
- `200 OK`: Batch invitation processed (contains breakdown of invited/failed).
- `400 Bad Request`: Invalid payload or closed room.
- `401 Unauthorized`: Missing or invalid JWT.
- `403 Forbidden`: Caller is not the room host (`FORBIDDEN_NOT_HOST`).
- `404 Not Found`: Room not found.

---

## 3. Frontend Hooks & API Integration

In `apps/web/src/features/friends/api/friends-api.ts`:
```typescript
export const friendsApi = {
  ...
  sendBatchLoungeInvites: async (
    roomId: string,
    friendUserIds: string[]
  ): Promise<BatchLoungeInviteResultDto> => {
    return apiClient.post(`/friends/invite-lounge-batch/${roomId}`, { friendUserIds });
  },
};
```

In `apps/web/src/features/friends/hooks/use-friends.ts`:
```typescript
export function useSendBatchLoungeInvites() {
  return useMutation({
    mutationFn: ({ roomId, friendUserIds }: { roomId: string; friendUserIds: string[] }) =>
      friendsApi.sendBatchLoungeInvites(roomId, friendUserIds),
  });
}
```

And helper selector hook for Friend Activity grouping:
```typescript
export function useFriendActivity() {
  const { data: friendsData, ...rest } = useFriends();

  const activity = useMemo(() => {
    const items = friendsData?.items || [];
    const singing = items.filter((f) => f.friend.presence?.status === 'singing');
    const inLounge = items.filter(
      (f) => f.friend.presence?.status === 'in_lounge' && f.friend.presence.roomId
    );
    const available = items.filter(
      (f) => f.friend.presence?.status === 'online' && !f.friend.presence.roomId
    );
    const offline = items.filter(
      (f) => !f.friend.presence?.status || f.friend.presence.status === 'offline'
    );

    return { singing, inLounge, available, offline };
  }, [friendsData]);

  return { activity, ...rest };
}
```
