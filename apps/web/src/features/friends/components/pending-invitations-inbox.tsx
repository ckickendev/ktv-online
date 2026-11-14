'use client';

import React from 'react';
import Link from 'next/link';
import { UserAvatar } from '@/components/shared/user-avatar';
import { usePendingInvitations, useDismissInvitation } from '../hooks/use-friend-activity';
import { Mail, LogIn, X, Users, Lock, Clock, Loader2 } from 'lucide-react';

function formatExpiresIn(expiresAt: string | null | undefined): string {
  if (!expiresAt) return 'Expired';
  const timestamp = new Date(expiresAt).getTime();
  if (Number.isNaN(timestamp)) return 'Expired';
  const diffMs = timestamp - Date.now();
  if (diffMs <= 0) return 'Expired';
  const diffMinutes = Math.floor(diffMs / 60000);
  if (diffMinutes < 1) return 'Expires in < 1m';
  if (diffMinutes < 60) return `Expires in ${diffMinutes}m`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `Expires in ${diffHours}h`;
  const diffDays = Math.floor(diffHours / 24);
  return `Expires in ${diffDays}d`;
}

export function PendingInvitationsInbox() {
  const { data, isLoading } = usePendingInvitations();
  const dismissMutation = useDismissInvitation();

  const invitations = data?.items ?? [];

  if (isLoading) {
    return (
      <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/5 animate-pulse flex items-center gap-3">
        <Mail className="w-4 h-4 text-violet-400" />
        <span className="text-xs text-slate-400">Checking pending invitations...</span>
      </div>
    );
  }

  if (invitations.length === 0) {
    return null;
  }

  return (
    <section aria-labelledby="pending-invitations-heading" className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-600/30 to-fuchsia-600/30 border border-violet-500/30 flex items-center justify-center">
            <Mail className="w-4 h-4 text-violet-300" />
          </div>
          <h2 id="pending-invitations-heading" className="text-sm font-semibold text-white tracking-wide">
            Pending Lounge Invitations
          </h2>
          <span className="px-2 py-0.5 rounded-full bg-violet-600/20 border border-violet-500/30 text-violet-300 text-xs font-bold">
            {invitations.length}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {invitations.map((invitation) => {
          const inviterName = invitation.inviter.displayName || invitation.inviter.username;
          const isDismissing = dismissMutation.isPending && dismissMutation.variables === invitation.id;
          const timeRemaining = formatExpiresIn(invitation.expiresAt);

          return (
            <div
              key={invitation.id}
              className="flex items-center justify-between p-3.5 rounded-2xl bg-gradient-to-r from-violet-950/20 via-[#101426] to-purple-950/20 border border-violet-500/30 shadow-md shadow-violet-950/20 hover:border-violet-400/40 transition-all gap-3"
            >
              <div className="flex items-center gap-3 min-w-0">
                <UserAvatar
                  name={inviterName}
                  avatarUrl={invitation.inviter.avatar}
                  size="md"
                  status="online"
                />

                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-xs font-semibold text-slate-100 truncate">
                      {inviterName}
                    </span>
                    <span className="text-[11px] text-slate-400">invited you to</span>
                  </div>

                  <div className="flex items-center gap-1.5 mt-0.5 text-xs text-white font-medium truncate">
                    {invitation.room.visibility === 'private' && (
                      <Lock className="w-3 h-3 text-amber-400 shrink-0" />
                    )}
                    <span className="truncate">{invitation.room.name}</span>
                  </div>

                  <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-400">
                    <span className="flex items-center gap-1">
                      <Users className="w-3 h-3 text-slate-500" />
                      <span>{invitation.room.currentParticipantsCount}/{invitation.room.capacity}</span>
                    </span>
                    <span>•</span>
                    <span className="flex items-center gap-1 text-slate-400">
                      <Clock className="w-3 h-3 text-slate-500" />
                      <span>{timeRemaining}</span>
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <Link
                  href={`/rooms/${invitation.roomId}?invitationId=${invitation.id}`}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white text-xs font-semibold shadow-sm shadow-violet-600/30 transition-all active:scale-95"
                >
                  <LogIn className="w-3.5 h-3.5" />
                  <span>Join Lounge</span>
                </Link>

                <button
                  type="button"
                  onClick={() => dismissMutation.mutate(invitation.id)}
                  disabled={isDismissing}
                  aria-label="Dismiss invitation"
                  className="p-1.5 rounded-xl text-slate-400 hover:text-slate-200 hover:bg-white/10 transition-colors disabled:opacity-50"
                  title="Dismiss invitation"
                >
                  {isDismissing ? (
                    <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
                  ) : (
                    <X className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
