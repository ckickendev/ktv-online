'use client';

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { X, Mic, Users, Lock, Music } from 'lucide-react';
import { FriendInvitationReceivedPayload, SOCKET_EVENTS } from '@ktv/contracts';
import { socketManager } from '@/lib/socket/socket-client';
import { UserAvatar } from '@/components/shared/user-avatar';
import { useAuthStore } from '@/stores/use-auth-store';
import { friendsApi } from '../api/friends-api';
import { queryKeys } from '@/hooks/queries/query-keys';

export function InvitationNotificationListener() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const currentUser = useAuthStore((s) => s.user);

  const [invitations, setInvitations] = useState<FriendInvitationReceivedPayload[]>([]);
  const hasReconciledRef = useRef(false);
  const dismissedKeysRef = useRef<Set<string>>(new Set());
  const currentUserIdRef = useRef<string | undefined>(currentUser?.id);

  // Clear state on logout or account switch
  useEffect(() => {
    if (!isAuthenticated) {
      setInvitations([]);
      hasReconciledRef.current = false;
      dismissedKeysRef.current.clear();
      currentUserIdRef.current = undefined;
      return;
    }

    if (currentUser?.id !== currentUserIdRef.current) {
      // User account changed
      setInvitations([]);
      hasReconciledRef.current = false;
      dismissedKeysRef.current.clear();
      currentUserIdRef.current = currentUser?.id;
    }
  }, [isAuthenticated, currentUser?.id]);

  // Initial pending invitation reconciliation on authentication
  useEffect(() => {
    if (!isAuthenticated || hasReconciledRef.current) {
      return;
    }

    hasReconciledRef.current = true;

    async function reconcilePendingInvitations() {
      try {
        const response = await friendsApi.getPendingInvitations();
        if (!response?.items || response.items.length === 0) return;

        const pendingPayloads: FriendInvitationReceivedPayload[] = response.items.map((item) => ({
          invitationId: item.id,
          roomId: item.roomId,
          roomTitle: item.room.name,
          isPrivate: item.room.visibility === 'private',
          inviter: item.inviter,
          sentAt: item.createdAt,
        }));

        setInvitations((prev) => {
          const existingKeys = new Set(
            prev.map((inv) => inv.invitationId || inv.invitationToken)
          );
          const newItems = pendingPayloads.filter((payload) => {
            const key = payload.invitationId || payload.invitationToken;
            return key && !existingKeys.has(key) && !dismissedKeysRef.current.has(key);
          });

          return [...prev, ...newItems];
        });
      } catch (err) {
        // Non-blocking: fail gracefully without disrupting navigation
        console.warn('Could not reconcile pending invitations:', err);
      }
    }

    reconcilePendingInvitations();
  }, [isAuthenticated]);

  // Realtime Socket.IO listener for live invitations
  useEffect(() => {
    if (!isAuthenticated) return;

    const socket = socketManager.connect();
    if (!socket) return;

    const handleInvitationReceived = (payload: FriendInvitationReceivedPayload) => {
      const key = payload.invitationId || payload.invitationToken || payload.roomId;
      if (!key || dismissedKeysRef.current.has(key)) return;

      setInvitations((prev) => {
        // Deduplicate invitations by id or token
        if (
          prev.some(
            (inv) =>
              (inv.invitationId || inv.invitationToken || inv.roomId) === key
          )
        ) {
          return prev;
        }
        return [payload, ...prev];
      });
    };

    socket.on(SOCKET_EVENTS.SERVER.FRIEND_INVITATION_RECEIVED, handleInvitationReceived);

    return () => {
      socket.off(SOCKET_EVENTS.SERVER.FRIEND_INVITATION_RECEIVED, handleInvitationReceived);
    };
  }, [isAuthenticated]);

  // Dismiss notification toast and reconcile with server
  const handleDismiss = useCallback(
    async (invitation: FriendInvitationReceivedPayload) => {
      const key = invitation.invitationId || invitation.invitationToken || invitation.roomId;
      if (!key) return;

      dismissedKeysRef.current.add(key);
      setInvitations((prev) =>
        prev.filter(
          (inv) =>
            (inv.invitationId || inv.invitationToken || inv.roomId) !== key
        )
      );

      // If this is an authenticated recipient-bound invitation, dismiss on server to keep inbox in sync
      if (invitation.invitationId) {
        try {
          await friendsApi.dismissInvitation(invitation.invitationId);
          queryClient.invalidateQueries({ queryKey: queryKeys.friends.pendingInvitations() });
        } catch {
          // Non-blocking background dismissal
        }
      }
    },
    [queryClient]
  );

  // Accept notification toast and navigate to room
  const handleAccept = useCallback(
    (invitation: FriendInvitationReceivedPayload) => {
      const key = invitation.invitationId || invitation.invitationToken || invitation.roomId;
      if (key) {
        dismissedKeysRef.current.add(key);
      }

      setInvitations((prev) =>
        prev.filter(
          (inv) =>
            (inv.invitationId || inv.invitationToken || inv.roomId) !== key
        )
      );

      if (invitation.invitationToken) {
        router.push(`/invite/${invitation.invitationToken}`);
      } else if (invitation.invitationId) {
        router.push(`/rooms/${invitation.roomId}?invitationId=${invitation.invitationId}`);
      } else {
        router.push(`/rooms/${invitation.roomId}`);
      }
    },
    [router]
  );

  if (!isAuthenticated || invitations.length === 0) {
    return null;
  }

  return (
    <aside
      aria-label="Karaoke invitations"
      className="fixed bottom-5 right-5 z-50 flex flex-col gap-3 max-w-sm w-full pointer-events-none select-none"
    >
      {invitations.map((invitation) => {
        const inviterName = invitation.inviter.displayName || invitation.inviter.username;
        const stableKey =
          invitation.invitationId ||
          invitation.invitationToken ||
          `${invitation.roomId}-${invitation.sentAt}`;

        return (
          <div
            key={stableKey}
            className="pointer-events-auto bg-[#131627]/95 backdrop-blur-md border border-violet-500/40 rounded-2xl p-4 shadow-2xl text-white transition-all duration-300 animate-in slide-in-from-bottom-5"
          >
            <div className="flex items-start justify-between gap-3 mb-2">
              <div className="flex items-center gap-2.5">
                <UserAvatar
                  name={inviterName}
                  avatarUrl={invitation.inviter.avatar}
                  size="sm"
                  status="online"
                />
                <div>
                  <h4 className="text-sm font-semibold text-white leading-tight">
                    {inviterName}
                  </h4>
                  <p className="text-xs text-violet-300/80">Invited you to sing</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleDismiss(invitation)}
                className="text-white/40 hover:text-white transition-colors p-1 rounded-lg hover:bg-white/10 min-h-[32px] min-w-[32px] flex items-center justify-center"
                aria-label="Dismiss invitation"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="bg-black/30 rounded-xl p-2.5 mb-3 border border-white/5">
              <div className="flex items-center gap-2 mb-1">
                <Mic className="w-3.5 h-3.5 text-violet-400 shrink-0" />
                <span className="text-xs font-semibold text-white truncate">
                  {invitation.roomTitle}
                </span>
              </div>
              <div className="flex items-center gap-2 text-[11px] text-white/60">
                {invitation.isPrivate ? (
                  <span className="inline-flex items-center gap-1 text-amber-400 font-medium">
                    <Lock className="w-3 h-3" /> Private Lounge
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-emerald-400 font-medium">
                    <Users className="w-3 h-3" /> Public Lounge
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleDismiss(invitation)}
                className="flex-1 py-2 px-3 text-xs font-medium text-white/70 hover:text-white bg-white/5 hover:bg-white/10 rounded-xl transition-colors min-h-[38px]"
              >
                Dismiss
              </button>
              <button
                type="button"
                onClick={() => handleAccept(invitation)}
                className="flex-1 py-2 px-3 text-xs font-bold text-white bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 rounded-xl shadow-md shadow-violet-600/25 transition-all flex items-center justify-center gap-1.5 min-h-[38px] active:scale-95"
              >
                <Music className="w-3.5 h-3.5" />
                <span>Accept & Join</span>
              </button>
            </div>
          </div>
        );
      })}
    </aside>
  );
}
