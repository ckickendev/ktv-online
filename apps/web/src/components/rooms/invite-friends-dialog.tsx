'use client';

import React, { useState } from 'react';
import {
  X,
  Share2,
  Copy,
  Check,
  Clock,
  ShieldAlert,
  Loader2,
  Sparkles,
  Lock,
  Globe,
  Trash2,
  RefreshCw,
} from 'lucide-react';
import {
  useActiveInvitation,
  useCreateInvitation,
  useRevokeInvitation,
} from '@/hooks/queries/use-invitation';
import { useFriends, useSendLoungeInviteToFriend } from '@/features/friends/hooks/use-friends';
import { UserAvatar } from '../shared/user-avatar';
import { PresenceStatusBadge } from '@/features/friends/components/presence-status-badge';
import { Users, Send } from 'lucide-react';

interface InviteFriendsRoomInfo {
  id: string;
  name: string;
  visibility?: 'public' | 'private' | string;
}

interface InviteFriendsDialogProps {
  room: InviteFriendsRoomInfo | null;
  isOpen: boolean;
  onClose: () => void;
  isHost: boolean;
}

export function InviteFriendsDialog({
  room,
  isOpen,
  onClose,
  isHost,
}: InviteFriendsDialogProps) {
  const [dialogMode, setDialogMode] = useState<'link' | 'friends'>('link');
  const [invitedFriends, setInvitedFriends] = useState<Record<string, boolean>>({});
  const [copied, setCopied] = useState(false);
  const [selectedDuration, setSelectedDuration] = useState<number>(48);
  const [latestToken, setLatestToken] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const { data: activeInvitation, isLoading: isLoadingActive } = useActiveInvitation(
    room?.id,
    isOpen && isHost
  );

  const { data: friendsData, isLoading: isLoadingFriends } = useFriends();
  const sendLoungeInviteMutation = useSendLoungeInviteToFriend();

  const createInvitationMutation = useCreateInvitation(room?.id || '');
  const revokeInvitationMutation = useRevokeInvitation(room?.id || '');

  if (!isOpen || !room) return null;

  const isPrivate = room.visibility === 'private';

  const handleSendInviteToFriend = async (friendUserId: string) => {
    if (!room) return;
    try {
      await sendLoungeInviteMutation.mutateAsync({
        roomId: room.id,
        friendUserId,
      });
      setInvitedFriends((prev) => ({ ...prev, [friendUserId]: true }));
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to send invite.');
    }
  };

  const handleCreate = async () => {
    setErrorMsg(null);
    try {
      const res = await createInvitationMutation.mutateAsync({
        expiresInHours: selectedDuration,
      });
      setLatestToken(res.token);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to generate invitation link.');
    }
  };

  const handleRevoke = async () => {
    setErrorMsg(null);
    try {
      await revokeInvitationMutation.mutateAsync();
      setLatestToken(null);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to revoke invitation.');
    }
  };

  const getInviteUrl = () => {
    if (typeof window === 'undefined') return '';
    if (latestToken) {
      return `${window.location.origin}/invite/${latestToken}`;
    }
    return '';
  };

  const handleCopyLink = async () => {
    const url = getInviteUrl();
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setErrorMsg('Could not copy to clipboard. Please copy manually.');
    }
  };

  const handleCopyDirectRoomUrl = async () => {
    if (typeof window === 'undefined') return;
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/rooms/${room.id}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setErrorMsg('Could not copy to clipboard.');
    }
  };

  const isPending =
    createInvitationMutation.isPending || revokeInvitationMutation.isPending;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="w-full max-w-md bg-[#0e121e] border border-white/10 rounded-3xl p-6 shadow-2xl relative animate-in zoom-in-95 duration-200"
        role="dialog"
        aria-modal="true"
        aria-labelledby="invite-dialog-title"
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          disabled={isPending}
          className="absolute right-4 top-4 p-2 text-slate-400 hover:text-white rounded-xl hover:bg-white/5 transition-colors disabled:opacity-50 min-h-[44px] min-w-[44px] flex items-center justify-center"
          aria-label="Close dialog"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Header */}
        <div className="flex items-center gap-3.5 mb-5">
          <div className="w-11 h-11 rounded-2xl bg-cyan-500/15 border border-cyan-500/25 flex items-center justify-center shrink-0">
            <Share2 className="w-5 h-5 text-cyan-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 id="invite-dialog-title" className="text-base font-bold text-white">
                Invite Friends
              </h3>
              <span
                className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                  isPrivate
                    ? 'bg-violet-500/10 text-violet-300 border-violet-500/20'
                    : 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20'
                }`}
              >
                {isPrivate ? (
                  <>
                    <Lock className="w-2.5 h-2.5" /> Private
                  </>
                ) : (
                  <>
                    <Globe className="w-2.5 h-2.5" /> Public
                  </>
                )}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5 truncate max-w-[260px]">
              {room.name}
            </p>
          </div>
        </div>

        {errorMsg && (
          <div className="p-3 mb-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-300 flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Host Mode Switcher */}
        {isHost && (
          <div className="grid grid-cols-2 gap-2 mb-4 p-1 bg-white/[0.03] border border-white/5 rounded-2xl">
            <button
              type="button"
              onClick={() => setDialogMode('link')}
              className={`py-1.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
                dialogMode === 'link'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Share2 className="w-3.5 h-3.5" />
              <span>Share Link</span>
            </button>
            <button
              type="button"
              onClick={() => setDialogMode('friends')}
              className={`py-1.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
                dialogMode === 'friends'
                  ? 'bg-violet-600/20 text-violet-300 border border-violet-500/30'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>Direct Invite</span>
            </button>
          </div>
        )}

        {/* Content based on Host status and selected mode */}
        {isHost && dialogMode === 'friends' ? (
          <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
            {isLoadingFriends ? (
              <div className="py-8 flex flex-col items-center justify-center gap-2 text-slate-400">
                <Loader2 className="w-5 h-5 animate-spin text-violet-400" />
                <span className="text-xs">Loading friends...</span>
              </div>
            ) : friendsData?.items && friendsData.items.length > 0 ? (
              friendsData.items.map((friendship) => {
                const friend = friendship.friend;
                const isInvited = invitedFriends[friend.id];
                const isSending =
                  sendLoungeInviteMutation.isPending &&
                  sendLoungeInviteMutation.variables?.friendUserId === friend.id;

                return (
                  <div
                    key={friend.id}
                    className="flex items-center justify-between p-2.5 rounded-xl bg-white/[0.02] border border-white/5"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <UserAvatar
                        name={friend.displayName || friend.username}
                        avatarUrl={friend.avatar}
                        size="sm"
                      />
                      <div className="min-w-0">
                        <span className="text-xs font-semibold text-slate-200 block truncate">
                          {friend.displayName || friend.username}
                        </span>
                        <PresenceStatusBadge presence={friend.presence} className="mt-0.5 scale-90 origin-left" />
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleSendInviteToFriend(friend.id)}
                      disabled={isInvited || isSending}
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all ${
                        isInvited
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                          : 'bg-violet-600 hover:bg-violet-500 text-white shadow-sm shadow-violet-600/20'
                      }`}
                    >
                      {isSending ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : isInvited ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-400" />
                          <span>Sent</span>
                        </>
                      ) : (
                        <>
                          <Send className="w-3 h-3" />
                          <span>Invite</span>
                        </>
                      )}
                    </button>
                  </div>
                );
              })
            ) : (
              <div className="py-8 text-center text-slate-500 text-xs">
                No friends added yet. Connect with people in the Friends tab first!
              </div>
            )}
          </div>
        ) : !isHost ? (
          <div className="space-y-4">
            <div className="p-4 rounded-2xl bg-white/5 border border-white/5 text-xs text-slate-300 leading-relaxed">
              {isPrivate ? (
                <div className="flex items-start gap-2.5">
                  <Lock className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
                  <span>
                    This is a private lounge. Only the room host can create and manage
                    secure invitation links.
                  </span>
                </div>
              ) : (
                <div className="space-y-3">
                  <p>
                    This is a public room. Anyone with the room link can discover and
                    join.
                  </p>
                  <button
                    type="button"
                    onClick={handleCopyDirectRoomUrl}
                    className="w-full py-2.5 px-4 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 text-xs font-semibold border border-cyan-500/30 flex items-center justify-center gap-2 transition-colors min-h-[44px]"
                  >
                    {copied ? (
                      <>
                        <Check className="w-4 h-4 text-emerald-400" />
                        <span>Link Copied!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4" />
                        <span>Copy Lounge Link</span>
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Newly Created Token Display */}
            {latestToken ? (
              <div className="p-4 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 space-y-3 animate-in fade-in">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-cyan-300 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5" /> Active Invitation Ready
                  </span>
                  <span className="text-[11px] text-slate-400">Share with friends</span>
                </div>

                <div className="flex items-center gap-2 bg-[#090b12] p-2 rounded-xl border border-white/10">
                  <input
                    type="text"
                    readOnly
                    value={getInviteUrl()}
                    className="w-full bg-transparent text-xs text-slate-200 outline-none select-all px-1 font-mono truncate"
                  />
                  <button
                    type="button"
                    onClick={handleCopyLink}
                    className="py-1.5 px-3 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-black text-xs font-bold flex items-center gap-1.5 transition-colors shrink-0 min-h-[36px]"
                  >
                    {copied ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-black" />
                        <span>Copied!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy</span>
                      </>
                    )}
                  </button>
                </div>

                <p className="text-[11px] text-slate-400 leading-snug">
                  Anyone with this link can preview and join your lounge until it expires
                  or is revoked.
                </p>
              </div>
            ) : isLoadingActive ? (
              <div className="py-8 flex flex-col items-center justify-center gap-2 text-slate-400">
                <Loader2 className="w-5 h-5 animate-spin text-cyan-400" />
                <span className="text-xs">Checking invitation status...</span>
              </div>
            ) : activeInvitation ? (
              <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/25 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-emerald-300 flex items-center gap-1.5">
                    <Check className="w-3.5 h-3.5 text-emerald-400" /> Active Link Exists
                  </span>
                  <span className="text-[11px] text-slate-400 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    Expires {new Date(activeInvitation.expiresAt).toLocaleDateString()}
                  </span>
                </div>

                <p className="text-xs text-slate-300 leading-relaxed">
                  An active invitation is currently valid for this lounge. You can generate
                  a replacement link or revoke it at any time.
                </p>

                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={handleRevoke}
                    disabled={isPending}
                    className="flex-1 py-2 px-3 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 text-xs font-medium border border-rose-500/30 flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50 min-h-[40px]"
                  >
                    {revokeInvitationMutation.isPending ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="w-3.5 h-3.5" />
                    )}
                    <span>Revoke Link</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-4 rounded-2xl bg-white/5 border border-white/5 text-xs text-slate-400 leading-relaxed">
                No active invitation link currently exists for this lounge. Choose an
                expiration and create one below.
              </div>
            )}

            {/* Expiration Duration Selector & Generator */}
            <div className="space-y-2 pt-1">
              <label className="block text-xs font-semibold text-slate-300">
                Link Expiration
              </label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { hours: 24, label: '24 Hours' },
                  { hours: 48, label: '48 Hours' },
                  { hours: 168, label: '7 Days' },
                ].map((opt) => (
                  <button
                    key={opt.hours}
                    type="button"
                    onClick={() => setSelectedDuration(opt.hours)}
                    className={`py-2 px-3 rounded-xl border text-xs font-medium transition-all min-h-[44px] ${
                      selectedDuration === opt.hours
                        ? 'bg-cyan-500/20 border-cyan-400 text-white shadow-sm shadow-cyan-500/20'
                        : 'bg-[#090b12] border-white/5 text-slate-400 hover:text-white'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="button"
              onClick={handleCreate}
              disabled={isPending}
              className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-cyan-500 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 text-white text-xs font-bold flex items-center justify-center gap-2 shadow-lg shadow-cyan-500/20 transition-all disabled:opacity-50 min-h-[44px]"
            >
              {createInvitationMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Generating Link...</span>
                </>
              ) : activeInvitation || latestToken ? (
                <>
                  <RefreshCw className="w-4 h-4" />
                  <span>Generate New Link (Replaces Previous)</span>
                </>
              ) : (
                <>
                  <Share2 className="w-4 h-4" />
                  <span>Create Invitation Link</span>
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
