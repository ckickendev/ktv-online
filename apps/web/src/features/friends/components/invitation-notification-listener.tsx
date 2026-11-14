'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { X, Mic, Users, Lock, Music } from 'lucide-react';
import { FriendInvitationReceivedPayload, SOCKET_EVENTS } from '@ktv/contracts';
import { socketManager } from '@/lib/socket/socket-client';
import { UserAvatar } from '@/components/shared/user-avatar';
import { useAuthStore } from '@/stores/use-auth-store';

export function InvitationNotificationListener() {
  const router = useRouter();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [invitations, setInvitations] = useState<FriendInvitationReceivedPayload[]>([]);

  useEffect(() => {
    if (!isAuthenticated) {
      setInvitations([]);
      return;
    }

    const socket = socketManager.connect();
    if (!socket) return;

    const handleInvitationReceived = (payload: FriendInvitationReceivedPayload) => {
      setInvitations((prev) => {
        // Deduplicate invitations by token
        if (prev.some((inv) => inv.invitationToken === payload.invitationToken)) {
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

  const handleDismiss = (token: string) => {
    setInvitations((prev) => prev.filter((inv) => inv.invitationToken !== token));
  };

  const handleAccept = (token: string) => {
    handleDismiss(token);
    router.push(`/invite/${token}`);
  };

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

        return (
          <div
            key={invitation.invitationToken}
            className="pointer-events-auto bg-[#131627]/95 backdrop-blur-md border border-violet-500/40 rounded-xl p-4 shadow-2xl text-white transition-all duration-300 animate-in slide-in-from-bottom-5"
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
                onClick={() => handleDismiss(invitation.invitationToken)}
                className="text-white/40 hover:text-white transition-colors p-1 rounded-md hover:bg-white/10"
                aria-label="Dismiss invitation"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="bg-black/30 rounded-lg p-2.5 mb-3 border border-white/5">
              <div className="flex items-center gap-2 mb-1">
                <Mic className="w-3.5 h-3.5 text-violet-400 shrink-0" />
                <span className="text-xs font-medium text-white truncate">
                  {invitation.roomTitle}
                </span>
              </div>
              <div className="flex items-center gap-2 text-[11px] text-white/60">
                {invitation.isPrivate ? (
                  <span className="inline-flex items-center gap-1 text-amber-400">
                    <Lock className="w-3 h-3" /> Private Lounge
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-emerald-400">
                    <Users className="w-3 h-3" /> Public Lounge
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleDismiss(invitation.invitationToken)}
                className="flex-1 py-1.5 px-3 text-xs font-medium text-white/70 hover:text-white bg-white/5 hover:bg-white/10 rounded-lg transition-colors"
              >
                Dismiss
              </button>
              <button
                type="button"
                onClick={() => handleAccept(invitation.invitationToken)}
                className="flex-1 py-1.5 px-3 text-xs font-semibold text-white bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 rounded-lg shadow-md transition-all flex items-center justify-center gap-1.5"
              >
                <Music className="w-3.5 h-3.5" />
                Accept & Join
              </button>
            </div>
          </div>
        );
      })}
    </aside>
  );
}
