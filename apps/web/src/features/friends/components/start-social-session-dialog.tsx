'use client';

import React, { useMemo, useEffect } from 'react';
import {
  X,
  Sparkles,
  PlusCircle,
  FolderSync,
  Lock,
  Globe,
  Check,
  Search,
  AlertCircle,
  Loader2,
  CheckCircle2,
  RefreshCw,
  LogIn,
} from 'lucide-react';
import { FriendshipDto, RoomAtmospherePreset } from '@ktv/contracts';
import { UserAvatar } from '@/components/shared/user-avatar';
import { PresenceStatusBadge } from './presence-status-badge';
import { useSocialSessionStarter } from '../hooks/use-social-session-starter';
import { cn } from '@/lib/utils';

interface StartSocialSessionDialogProps {
  isOpen: boolean;
  onClose: () => void;
  friends: FriendshipDto[];
  initialFriendId?: string;
  fixedRoomId?: string;
  fixedRoomName?: string;
}

const ATMOSPHERE_OPTIONS: Array<{ id: RoomAtmospherePreset; label: string; accent: string }> = [
  { id: 'midnight_lounge', label: 'Midnight Lounge', accent: 'from-violet-600 to-indigo-600' },
  { id: 'neon_stage', label: 'Neon Stage', accent: 'from-fuchsia-600 to-cyan-600' },
  { id: 'cozy_acoustic', label: 'Cozy Acoustic', accent: 'from-emerald-600 to-teal-700' },
  { id: 'classic_karaoke', label: 'Classic Karaoke', accent: 'from-amber-500 to-rose-600' },
  { id: 'minimal_studio', label: 'Minimal Studio', accent: 'from-slate-600 to-zinc-700' },
];

export function StartSocialSessionDialog({
  isOpen,
  onClose,
  friends,
  initialFriendId,
  fixedRoomId,
  fixedRoomName,
}: StartSocialSessionDialogProps) {
  const starter = useSocialSessionStarter();
  const { open } = starter;

  useEffect(() => {
    if (isOpen) {
      open(initialFriendId, fixedRoomId);
    }
  }, [isOpen, initialFriendId, fixedRoomId, open]);

  const handleClose = () => {
    starter.close();
    onClose();
  };

  // Sort friends: Online -> In Lounge -> Singing -> Offline
  const sortedFriends = useMemo(() => {
    return [...friends].sort((a, b) => {
      const getPriority = (status?: string) => {
        if (status === 'online') return 1;
        if (status === 'in_lounge') return 2;
        if (status === 'singing') return 3;
        return 4; // offline
      };
      return (
        getPriority(a.friend.presence?.status) - getPriority(b.friend.presence?.status)
      );
    });
  }, [friends]);

  // Filter friends by search query
  const filteredFriends = useMemo(() => {
    const q = starter.searchQuery.trim().toLowerCase();
    if (!q) return sortedFriends;
    return sortedFriends.filter((f) => {
      const name = (f.friend.displayName || f.friend.username).toLowerCase();
      const username = f.friend.username.toLowerCase();
      return name.includes(q) || username.includes(q);
    });
  }, [sortedFriends, starter.searchQuery]);

  // Online friend IDs for "Select All Online"
  const onlineFriendIds = useMemo(() => {
    return friends
      .filter((f) => f.friend.presence?.status && f.friend.presence.status !== 'offline')
      .map((f) => f.friend.id);
  }, [friends]);

  if (!isOpen) return null;

  const isCompleteSuccess = starter.submissionStep === 'success';
  const isPartialSuccess = starter.submissionStep === 'partial_success';
  const hasResult = Boolean(starter.batchResult);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div
        className="w-full max-w-xl bg-[#0e121e] border border-white/10 rounded-3xl p-5 sm:p-6 shadow-2xl relative animate-in zoom-in-95 duration-200 max-h-[92vh] flex flex-col overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-labelledby="social-session-dialog-title"
      >
        {/* Close Button */}
        <button
          type="button"
          onClick={handleClose}
          disabled={starter.isSubmitting}
          className="absolute right-4 top-4 p-2 text-slate-400 hover:text-white rounded-xl hover:bg-white/5 transition-colors disabled:opacity-50 min-h-[44px] min-w-[44px] flex items-center justify-center z-10"
          aria-label="Close dialog"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Dialog Header */}
        <div className="flex items-center gap-3.5 mb-4 shrink-0">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-violet-600 to-fuchsia-600 p-0.5 shadow-lg shadow-violet-600/30">
            <div className="w-full h-full bg-[#0a0d17] rounded-[14px] flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-violet-400" />
            </div>
          </div>
          <div>
            <h2 id="social-session-dialog-title" className="text-base sm:text-lg font-bold text-white">
              {fixedRoomId ? 'Invite Friends to Lounge' : 'Start a Karaoke Session'}
            </h2>
            <p className="text-xs text-slate-400">
              {fixedRoomId
                ? 'Select friends to invite directly into your current lounge.'
                : 'Pick friends and start singing together in a shared lounge.'}
            </p>
          </div>
        </div>

        {/* Post-submission Result View */}
        {hasResult && starter.batchResult ? (
          <div className="flex-1 overflow-y-auto space-y-4 py-2">
            <div
              className={cn(
                'p-4 rounded-2xl border flex items-start gap-3',
                isCompleteSuccess
                  ? 'bg-emerald-950/20 border-emerald-500/30 text-emerald-300'
                  : 'bg-amber-950/20 border-amber-500/30 text-amber-300'
              )}
            >
              {isCompleteSuccess ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              )}
              <div className="min-w-0">
                <h4 className="text-sm font-bold text-white">
                  {isCompleteSuccess ? 'All Invitations Dispatched!' : 'Invitations Partially Sent'}
                </h4>
                <p className="text-xs mt-0.5 opacity-90">
                  {starter.batchResult.summary.sent} of {starter.batchResult.summary.total} friends
                  successfully invited.
                </p>
              </div>
            </div>

            {/* Recipient results detail */}
            <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
              {starter.batchResult.results.map((res) => {
                const friendItem = friends.find((f) => f.friend.id === res.friendUserId);
                const name =
                  friendItem?.friend.displayName ||
                  friendItem?.friend.username ||
                  res.friendUserId;
                const isSent = res.status === 'sent';

                return (
                  <div
                    key={res.friendUserId}
                    className="flex items-center justify-between p-2.5 rounded-xl bg-white/[0.02] border border-white/5 text-xs"
                  >
                    <span className="font-medium text-slate-200 truncate">{name}</span>
                    {isSent ? (
                      <span className="text-emerald-400 font-semibold flex items-center gap-1">
                        <Check className="w-3.5 h-3.5" />
                        <span>Invited</span>
                      </span>
                    ) : (
                      <span className="text-amber-400 font-medium">
                        {res.error === 'ALREADY_IN_ROOM'
                          ? 'Already in lounge'
                          : res.error === 'NOT_FRIENDS'
                          ? 'Not friends'
                          : 'Failed'}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Error Banner during retry if any */}
            {starter.errorMessage && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-300 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <span className="flex-1">{starter.errorMessage}</span>
              </div>
            )}

            {/* Actions */}
            <div className="flex flex-col sm:flex-row items-center gap-3 pt-3 border-t border-white/10">
              {isPartialSuccess && (
                <button
                  type="button"
                  onClick={starter.retryFailedInvitations}
                  disabled={starter.isSubmitting}
                  className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold text-slate-200 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {starter.isSubmitting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Retrying...</span>
                    </>
                  ) : (
                    <>
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>Retry Failed</span>
                    </>
                  )}
                </button>
              )}

              {fixedRoomId ? (
                <button
                  type="button"
                  onClick={handleClose}
                  className="w-full flex-1 px-5 py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white text-xs font-bold shadow-lg shadow-violet-600/30 transition-all flex items-center justify-center gap-2"
                >
                  <Check className="w-4 h-4" />
                  <span>Back to Lounge</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={starter.navigateToRoom}
                  className="w-full flex-1 px-5 py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white text-xs font-bold shadow-lg shadow-violet-600/30 transition-all flex items-center justify-center gap-2"
                >
                  <LogIn className="w-4 h-4" />
                  <span>Enter Lounge Now</span>
                </button>
              )}
            </div>
          </div>
        ) : (
          /* Normal Configuration & Selection Flow */
          <div className="flex-1 flex flex-col overflow-hidden space-y-4">
            {/* Error Banner if any */}
            {starter.errorMessage && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-300 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <span>{starter.errorMessage}</span>
                  {starter.activeRoomId && (
                    <button
                      type="button"
                      onClick={starter.navigateToRoom}
                      className="block mt-1 text-xs font-bold text-white underline"
                    >
                      Enter your created lounge anyway →
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Mode Switcher: New vs Existing */}
            {!fixedRoomId && (
              <div className="grid grid-cols-2 gap-1.5 p-1 rounded-2xl bg-white/[0.03] border border-white/5 shrink-0">
                <button
                  type="button"
                  onClick={() => starter.setLoungeMode('new')}
                  className={cn(
                    'flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-semibold transition-all',
                    starter.loungeMode === 'new'
                      ? 'bg-violet-600 text-white shadow-md shadow-violet-600/20'
                      : 'text-slate-400 hover:text-white'
                  )}
                >
                  <PlusCircle className="w-3.5 h-3.5" />
                  <span>Create New Lounge</span>
                </button>

                <button
                  type="button"
                  onClick={() => starter.setLoungeMode('existing')}
                  className={cn(
                    'flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-semibold transition-all',
                    starter.loungeMode === 'existing'
                      ? 'bg-violet-600 text-white shadow-md shadow-violet-600/20'
                      : 'text-slate-400 hover:text-white'
                  )}
                >
                  <FolderSync className="w-3.5 h-3.5" />
                  <span>Use Existing Lounge</span>
                </button>
              </div>
            )}

            {/* Lounge Configuration Section */}
            {fixedRoomId ? (
              <div className="p-3 rounded-2xl bg-white/[0.02] border border-white/5 space-y-1 shrink-0">
                <span className="text-[11px] font-semibold text-slate-400 block">Inviting to Lounge</span>
                <div className="flex items-center gap-2 text-xs font-semibold text-white">
                  <span>{fixedRoomName || 'Current Lounge'}</span>
                </div>
              </div>
            ) : starter.loungeMode === 'new' ? (
              <div className="p-3 rounded-2xl bg-white/[0.02] border border-white/5 space-y-3 shrink-0">
                <div>
                  <label className="text-[11px] font-semibold text-slate-400 block mb-1">
                    Lounge Name
                  </label>
                  <input
                    type="text"
                    value={starter.newRoomName}
                    onChange={(e) => starter.setNewRoomName(e.target.value)}
                    placeholder="Enter lounge name..."
                    maxLength={60}
                    className="w-full px-3 py-1.5 rounded-xl bg-white/[0.04] border border-white/10 text-white text-xs placeholder:text-slate-500 focus:outline-none focus:border-violet-500"
                  />
                </div>

                <div className="flex items-center justify-between gap-3">
                  <div>
                    <label className="text-[11px] font-semibold text-slate-400 block mb-1">
                      Visibility
                    </label>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => starter.setNewRoomVisibility('private')}
                        className={cn(
                          'flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all',
                          starter.newRoomVisibility === 'private'
                            ? 'bg-violet-600/30 text-violet-300 border border-violet-500/40'
                            : 'bg-white/5 text-slate-400'
                        )}
                      >
                        <Lock className="w-3 h-3" />
                        <span>Private (Invite Only)</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => starter.setNewRoomVisibility('public')}
                        className={cn(
                          'flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all',
                          starter.newRoomVisibility === 'public'
                            ? 'bg-violet-600/30 text-violet-300 border border-violet-500/40'
                            : 'bg-white/5 text-slate-400'
                        )}
                      >
                        <Globe className="w-3 h-3" />
                        <span>Public</span>
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="text-[11px] font-semibold text-slate-400 block mb-1">
                      Atmosphere
                    </label>
                    <select
                      value={starter.newRoomAtmosphere}
                      onChange={(e) =>
                        starter.setNewRoomAtmosphere(e.target.value as RoomAtmospherePreset)
                      }
                      className="px-2.5 py-1 rounded-lg bg-white/[0.04] border border-white/10 text-white text-xs focus:outline-none focus:border-violet-500"
                    >
                      {ATMOSPHERE_OPTIONS.map((opt) => (
                        <option key={opt.id} value={opt.id} className="bg-[#0e121e]">
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            ) : (
              /* Existing Lounge Selector */
              <div className="p-3 rounded-2xl bg-white/[0.02] border border-white/5 space-y-2 shrink-0">
                <label className="text-[11px] font-semibold text-slate-400 block">
                  Select an Active Owned Lounge
                </label>
                {starter.isLoadingMyRooms ? (
                  <div className="py-4 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin text-violet-400" />
                    <span>Loading your lounges...</span>
                  </div>
                ) : starter.eligibleRooms.length > 0 ? (
                  <div className="space-y-1.5 max-h-[120px] overflow-y-auto pr-1">
                    {starter.eligibleRooms.map((room) => {
                      const isSelected = starter.selectedRoomId === room.id;
                      return (
                        <button
                          key={room.id}
                          type="button"
                          onClick={() => starter.setSelectedRoomId(room.id)}
                          className={cn(
                            'w-full flex items-center justify-between p-2 rounded-xl text-left text-xs transition-all border',
                            isSelected
                              ? 'bg-violet-600/20 border-violet-500/40 text-white'
                              : 'bg-white/[0.02] border-white/5 text-slate-300 hover:bg-white/5'
                          )}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            {room.visibility === 'private' ? (
                              <Lock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                            ) : (
                              <Globe className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                            )}
                            <span className="font-semibold truncate">{room.name}</span>
                          </div>
                          <span className="text-[11px] text-slate-400 shrink-0">
                            {room.currentParticipantsCount}/{room.capacity}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="py-3 text-center text-xs text-slate-400 space-y-1">
                    <p>No eligible active lounges found.</p>
                    <button
                      type="button"
                      onClick={() => starter.setLoungeMode('new')}
                      className="text-violet-400 hover:text-violet-300 font-semibold underline"
                    >
                      Switch to create a new lounge
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Friend Selection Header & Search */}
            <div className="shrink-0 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-white uppercase tracking-wider">
                    Select Friends
                  </span>
                  <span
                    className={cn(
                      'px-2 py-0.5 rounded-full text-xs font-bold',
                      starter.selectedFriendIds.length >= 20
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                        : 'bg-violet-600/20 text-violet-300 border border-violet-500/30'
                    )}
                  >
                    {starter.selectedFriendIds.length}/20
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  {onlineFriendIds.length > 0 && (
                    <button
                      type="button"
                      onClick={() => starter.selectAllOnline(onlineFriendIds)}
                      className="text-[11px] font-semibold text-violet-400 hover:text-violet-300 transition-colors"
                    >
                      Select All Online
                    </button>
                  )}
                  {starter.selectedFriendIds.length > 0 && (
                    <button
                      type="button"
                      onClick={starter.clearSelection}
                      className="text-[11px] font-medium text-slate-500 hover:text-slate-300 transition-colors"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>

              {/* Search input */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={starter.searchQuery}
                  onChange={(e) => starter.setSearchQuery(e.target.value)}
                  placeholder="Search friends by name or username..."
                  className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-white/[0.03] border border-white/5 text-white text-xs placeholder:text-slate-500 focus:outline-none focus:border-violet-500"
                />
              </div>
            </div>

            {/* Friends Multi-Select List */}
            <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 min-h-[140px] max-h-[220px]">
              {filteredFriends.length > 0 ? (
                filteredFriends.map((friendship) => {
                  const friend = friendship.friend;
                  const isSelected = starter.selectedFriendIds.includes(friend.id);
                  const isMaxReached = starter.selectedFriendIds.length >= 20;
                  const isAlreadyInSelectedRoom =
                    starter.loungeMode === 'existing' &&
                    Boolean(starter.selectedRoomId) &&
                    friend.presence?.roomId === starter.selectedRoomId;
                  const isCheckDisabled =
                    (!isSelected && isMaxReached) || isAlreadyInSelectedRoom;

                  return (
                    <div
                      key={friend.id}
                      onClick={() => !isCheckDisabled && starter.toggleFriend(friend.id)}
                      className={cn(
                        'flex items-center justify-between p-2 rounded-xl transition-all cursor-pointer border select-none',
                        isSelected
                          ? 'bg-violet-950/30 border-violet-500/40'
                          : 'bg-white/[0.015] border-white/5 hover:bg-white/[0.04]',
                        isCheckDisabled && 'opacity-50 cursor-not-allowed'
                      )}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        {/* Custom Checkbox */}
                        <div
                          className={cn(
                            'w-4 h-4 rounded-md border flex items-center justify-center shrink-0 transition-all',
                            isSelected
                              ? 'bg-violet-600 border-violet-500 text-white'
                              : 'border-white/20 bg-white/5'
                          )}
                        >
                          {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                        </div>

                        <UserAvatar
                          name={friend.displayName || friend.username}
                          avatarUrl={friend.avatar}
                          size="sm"
                        />

                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-semibold text-slate-200 truncate">
                              {friend.displayName || friend.username}
                            </span>
                            {friend.displayName && (
                              <span className="text-[11px] text-slate-400 truncate">
                                @{friend.username}
                              </span>
                            )}
                          </div>
                          <div className="mt-0.5">
                            {isAlreadyInSelectedRoom ? (
                              <span className="inline-flex items-center text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 font-medium">
                                In this lounge
                              </span>
                            ) : (
                              <PresenceStatusBadge
                                presence={friend.presence}
                                className="scale-90 origin-left"
                              />
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="py-8 text-center text-xs text-slate-400">
                  No friends matched your search.
                </div>
              )}
            </div>

            {/* Dialog Footer Actions */}
            <div className="pt-3 border-t border-white/10 flex items-center justify-between gap-3 shrink-0">
              <button
                type="button"
                onClick={handleClose}
                disabled={starter.isSubmitting}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-white/5 transition-all"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={starter.startSessionAndInvite}
                disabled={starter.isSubmitting || starter.selectedFriendIds.length === 0}
                className={cn(
                  'flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold text-white transition-all shadow-lg active:scale-95',
                  starter.selectedFriendIds.length > 0 && !starter.isSubmitting
                    ? 'bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 shadow-violet-600/30'
                    : 'bg-white/10 text-slate-400 cursor-not-allowed shadow-none'
                )}
              >
                {starter.isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>
                      {starter.submissionStep === 'creating_room'
                        ? 'Creating Lounge...'
                        : 'Sending Invitations...'}
                    </span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>
                      {starter.loungeMode === 'new'
                        ? `Create Lounge & Invite (${starter.selectedFriendIds.length})`
                        : `Invite Friends (${starter.selectedFriendIds.length})`}
                    </span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
