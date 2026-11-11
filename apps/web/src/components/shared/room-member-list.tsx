import React, { useState } from 'react';
import { Crown, Users, RefreshCw, AlertCircle, UserX, Mic, MicOff, Mic2, Shield, VolumeX } from 'lucide-react';
import { UserAvatar } from './user-avatar';
import { UserProfileModal } from '../profile/user-profile-modal';
import { useRoomMembers } from '@/hooks/queries/use-room';
import { cn } from '@/lib/utils';
import { RoomMembershipDto } from '@ktv/contracts';
import { VoiceParticipantInfo } from '@/features/voice/types/voice.types';

interface RoomMemberListProps {
  roomId: string;
  currentUserId?: string | null;
  onlineUserIds?: Set<string>;
  isHost?: boolean;
  isModerator?: boolean;
  onKickMember?: (userId: string, username: string) => void;
  onMuteMember?: (userId: string, username: string, isMuted: boolean) => void;
  onUpdateRole?: (userId: string, username: string, newRole: 'moderator' | 'member') => void;
  onTransferHost?: (userId: string, username: string, displayName?: string | null) => void;
  className?: string;
  members?: RoomMembershipDto[];
  onRefresh?: () => void;
  voiceParticipants?: VoiceParticipantInfo[];
  currentSingerName?: string | null;
  currentSingerUserId?: string | null;
}

export function RoomMemberList({
  roomId,
  currentUserId,
  onlineUserIds,
  isHost,
  isModerator,
  onKickMember,
  onMuteMember,
  onUpdateRole,
  onTransferHost,
  className,
  members: propMembers,
  onRefresh: propOnRefresh,
  voiceParticipants,
  currentSingerName,
  currentSingerUserId,
}: RoomMemberListProps) {
  const queryResult = useRoomMembers(roomId, { enabled: !propMembers });
  const members = propMembers ?? queryResult.data;
  const isLoading = propMembers ? false : queryResult.isLoading;
  const isError = propMembers ? false : queryResult.isError;
  const error = propMembers ? null : queryResult.error;
  const isFetching = propMembers ? false : queryResult.isFetching;

  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  const handleRefresh = () => {
    if (propOnRefresh) {
      propOnRefresh();
    } else {
      queryResult.refetch();
    }
  };

  return (
    <div
      data-testid="room-member-list"
      className={cn(
        'glass-panel rounded-2xl p-4 border border-white/5 flex flex-col',
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-white/5 mb-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-violet-500/10 border border-violet-500/20 text-violet-400">
            <Users className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-semibold text-white tracking-wide uppercase">
                Members in Lounge
              </h3>
              {members && (
                <span
                  data-testid="member-count-badge"
                  className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-violet-500/20 text-violet-300 border border-violet-500/30"
                >
                  {members.length}
                </span>
              )}
            </div>
            {onlineUserIds ? (
              <p className="text-[10px] text-emerald-400 font-medium">
                {onlineUserIds.size} connected now
              </p>
            ) : (
              <p className="text-[10px] text-slate-400">Server snapshot</p>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={handleRefresh}
          disabled={isFetching}
          data-testid="refresh-members-button"
          title="Refresh member list"
          aria-label="Refresh member list"
          className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-colors border border-white/5 disabled:opacity-50"
        >
          <RefreshCw
            className={cn('w-3.5 h-3.5', isFetching && 'animate-spin text-cyan-400')}
          />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto pr-1 space-y-2 min-h-[140px]">
        {isLoading && (
          <div data-testid="member-list-loading" className="space-y-2 py-2">
            {[1, 2, 3].map((n) => (
              <div
                key={n}
                className="p-2.5 rounded-xl border border-white/5 bg-white/5 flex items-center justify-between animate-pulse"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-full bg-white/10" />
                  <div className="space-y-1">
                    <div className="w-20 h-3 rounded bg-white/10" />
                    <div className="w-12 h-2 rounded bg-white/5" />
                  </div>
                </div>
                <div className="w-10 h-3 rounded bg-white/10" />
              </div>
            ))}
          </div>
        )}

        {isError && (
          <div
            data-testid="member-list-error"
            className="flex flex-col items-center justify-center py-6 px-3 text-center space-y-2"
          >
            <AlertCircle className="w-6 h-6 text-rose-400" />
            <p className="text-xs text-rose-300">
              {error instanceof Error ? error.message : 'Failed to load member roster'}
            </p>
            <button
              type="button"
              onClick={handleRefresh}
              className="text-xs text-cyan-400 hover:text-cyan-300 underline font-medium pt-1"
            >
              Try again
            </button>
          </div>
        )}

        {!isLoading && !isError && (!members || members.length === 0) && (
          <div
            data-testid="member-list-empty"
            className="flex flex-col items-center justify-center py-8 px-3 text-center text-slate-400 space-y-2"
          >
            <Users className="w-7 h-7 text-slate-500 opacity-60" />
            <p className="text-xs font-medium text-slate-300">No members currently in lounge</p>
            <p className="text-[11px] text-slate-500 max-w-[200px]">
              Be the first to step up onto the lounge stage!
            </p>
          </div>
        )}

        {!isLoading &&
          !isError &&
          members &&
          members.length > 0 &&
          members
            .slice()
            .sort((a, b) => {
              if (a.role === 'host' && b.role !== 'host') return -1;
              if (b.role === 'host' && a.role !== 'host') return 1;
              if (a.role === 'moderator' && b.role !== 'moderator') return -1;
              if (b.role === 'moderator' && a.role !== 'moderator') return 1;
              return new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime();
            })
            .map((m) => {
              const isCurrentUser = Boolean(currentUserId && m.userId === currentUserId);
              const username = m.user?.username ?? 'Member';
              const displayName = m.user?.displayName || username;
              const isOnline = onlineUserIds ? onlineUserIds.has(m.userId) : true;
              const userSessions = voiceParticipants
                ? voiceParticipants.filter((p) => p.userId === m.userId)
                : [];
              const isInVoice = userSessions.length > 0;
              const isSpeaking = userSessions.some((p) => p.isSpeaking);
              const isMutedInVoice = isInVoice && userSessions.every((p) => p.isMuted);
              const sessionCount = userSessions.length;

              const isSinger = Boolean(
                (currentSingerUserId && m.userId === currentSingerUserId) ||
                (currentSingerName && (username === currentSingerName || displayName === currentSingerName))
              );

              // Permissions
              const canMute = Boolean(
                !isCurrentUser &&
                ((isHost && m.role !== 'host') || (isModerator && m.role === 'member'))
              );
              const canKick = Boolean(
                !isCurrentUser &&
                ((isHost && m.role !== 'host') || (isModerator && m.role === 'member'))
              );
              const canChangeRole = Boolean(isHost && !isCurrentUser && m.role !== 'host');
              const canTransfer = Boolean(isHost && !isCurrentUser);

              return (
                <div
                  key={m.id}
                  data-testid={`member-item-${m.userId}`}
                  className={cn(
                    'p-2.5 rounded-xl border flex items-center justify-between transition-colors gap-2',
                    isSinger
                      ? 'bg-fuchsia-950/30 border-fuchsia-500/40 shadow-sm shadow-fuchsia-950/40'
                      : isCurrentUser
                      ? 'bg-violet-950/30 border-violet-500/30 shadow-sm'
                      : 'bg-white/5 border-white/5 hover:bg-white/[0.07]'
                  )}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <button
                      type="button"
                      onClick={() => setSelectedUserId(m.userId)}
                      className="relative shrink-0 text-left transition-transform hover:scale-105"
                      title={`View ${displayName}'s profile`}
                    >
                      <UserAvatar
                        name={displayName}
                        avatarUrl={m.user?.avatar}
                        size="sm"
                        status={isOnline ? 'online' : 'offline'}
                        className={cn(
                          isSpeaking && 'ring-2 ring-emerald-400 animate-pulse'
                        )}
                      />
                      {isSpeaking && (
                        <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-400 ring-2 ring-black animate-pulse" />
                      )}
                    </button>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <button
                          type="button"
                          onClick={() => setSelectedUserId(m.userId)}
                          className="text-xs font-semibold text-slate-200 hover:text-white hover:underline truncate text-left"
                          title={`View ${displayName}'s profile`}
                        >
                          {displayName}
                        </button>
                        {m.user?.displayName && (
                          <span className="text-[10px] text-slate-400 truncate">
                            @{m.user.username}
                          </span>
                        )}
                        {isCurrentUser && (
                          <span className="text-[10px] text-cyan-400 font-medium">(You)</span>
                        )}
                        {m.role === 'host' && (
                          <span
                            data-testid="host-badge"
                            className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-amber-500/10 text-amber-300 border border-amber-500/30 shrink-0"
                            title="Lounge Host"
                          >
                            <Crown className="w-2.5 h-2.5 fill-amber-300" />
                            Host
                          </span>
                        )}
                        {m.role === 'moderator' && (
                          <span
                            data-testid="moderator-badge"
                            className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-sky-500/15 text-sky-300 border border-sky-500/30 shrink-0"
                            title="Lounge Moderator"
                          >
                            <Shield className="w-2.5 h-2.5 fill-sky-300" />
                            Mod
                          </span>
                        )}
                        {m.isMuted && (
                          <span
                            data-testid="member-muted-badge"
                            className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-rose-500/15 text-rose-300 border border-rose-500/30 shrink-0"
                            title="Microphone muted by room moderation"
                          >
                            <MicOff className="w-2.5 h-2.5 text-rose-300" />
                            Muted
                          </span>
                        )}
                        {isSinger && (
                          <span
                            className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-fuchsia-500/20 text-fuchsia-300 border border-fuchsia-500/30 shrink-0"
                            title="Currently singing on stage"
                          >
                            <Mic2 className="w-2.5 h-2.5" />
                            Singing
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-[10px] text-slate-400 truncate">
                        <span>
                          Joined{' '}
                          {new Date(m.joinedAt).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                        {isInVoice && (
                          <span className="text-emerald-400/90 font-medium flex items-center gap-0.5">
                            &bull; In Voice
                            {sessionCount > 1 && ` (${sessionCount} tabs)`}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center pl-1 shrink-0 gap-1">
                    {/* Voice indicator for member */}
                    {isInVoice && (
                      <span
                        title={isMutedInVoice ? 'Muted in voice lounge' : isSpeaking ? 'Speaking in voice' : 'Listening in voice'}
                        className="p-1 rounded-md bg-white/5"
                      >
                        {isMutedInVoice ? (
                          <MicOff className="w-3 h-3 text-rose-400" />
                        ) : (
                          <Mic className={cn('w-3 h-3', isSpeaking ? 'text-emerald-400 animate-pulse' : 'text-slate-400')} />
                        )}
                      </span>
                    )}

                    {/* Moderation: Mute / Unmute */}
                    {canMute && onMuteMember && (
                      <button
                        type="button"
                        data-testid={`mute-member-btn-${m.userId}`}
                        onClick={() => onMuteMember(m.userId, username, !m.isMuted)}
                        title={m.isMuted ? `Unmute ${displayName}` : `Mute ${displayName}`}
                        className={cn(
                          'p-1 rounded transition-colors',
                          m.isMuted
                            ? 'text-rose-400 hover:text-emerald-400 hover:bg-emerald-500/10'
                            : 'text-slate-400 hover:text-rose-400 hover:bg-rose-500/10'
                        )}
                      >
                        {m.isMuted ? <VolumeX className="w-3.5 h-3.5" /> : <MicOff className="w-3.5 h-3.5" />}
                      </button>
                    )}

                    {/* Moderation: Promote/Demote Moderator (Host only) */}
                    {canChangeRole && onUpdateRole && (
                      <button
                        type="button"
                        data-testid={`role-member-btn-${m.userId}`}
                        onClick={() =>
                          onUpdateRole(
                            m.userId,
                            username,
                            m.role === 'moderator' ? 'member' : 'moderator'
                          )
                        }
                        title={
                          m.role === 'moderator'
                            ? `Demote ${displayName} to Member`
                            : `Promote ${displayName} to Moderator`
                        }
                        className={cn(
                          'p-1 rounded transition-colors',
                          m.role === 'moderator'
                            ? 'text-sky-400 hover:text-slate-400 hover:bg-white/10'
                            : 'text-slate-400 hover:text-sky-400 hover:bg-sky-500/10'
                        )}
                      >
                        <Shield className={cn('w-3.5 h-3.5', m.role === 'moderator' && 'fill-sky-400/40')} />
                      </button>
                    )}

                    {/* Moderation: Transfer Host (Host only) */}
                    {canTransfer && onTransferHost && (
                      <button
                        type="button"
                        data-testid={`transfer-host-btn-${m.userId}`}
                        onClick={() => onTransferHost(m.userId, username, displayName)}
                        title={`Transfer Host ownership to ${displayName}`}
                        className="p-1 rounded text-slate-400 hover:text-amber-400 hover:bg-amber-500/10 transition-colors"
                      >
                        <Crown className="w-3.5 h-3.5" />
                      </button>
                    )}

                    {/* Moderation: Kick Member (Host or Moderator) */}
                    {canKick && onKickMember && (
                      <button
                        type="button"
                        data-testid={`kick-member-btn-${m.userId}`}
                        onClick={() => onKickMember(m.userId, username)}
                        title={`Remove ${displayName} from lounge`}
                        className="p-1 rounded text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                      >
                        <UserX className="w-3.5 h-3.5" />
                      </button>
                    )}

                    <span
                      className={cn(
                        'w-2 h-2 rounded-full ml-0.5',
                        isOnline
                          ? 'bg-emerald-400 ring-2 ring-emerald-500/20'
                          : 'bg-slate-500 opacity-60'
                      )}
                      title={isOnline ? 'Online in lounge' : 'Offline (seat reserved)'}
                    />
                  </div>
                </div>
              );
            })}
      </div>

      <div className="pt-3 border-t border-white/5 mt-3 text-[10px] text-slate-500 text-center">
        {onlineUserIds ? 'Live Presence Connected' : 'Refreshed snapshot • Non-realtime'}
      </div>

      <UserProfileModal
        userId={selectedUserId}
        isOpen={Boolean(selectedUserId)}
        onClose={() => setSelectedUserId(null)}
      />
    </div>
  );
}
