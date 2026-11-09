import React from 'react';
import { Crown, Users, RefreshCw, AlertCircle, UserX } from 'lucide-react';
import { UserAvatar } from './user-avatar';
import { useRoomMembers } from '@/hooks/queries/use-room';
import { cn } from '@/lib/utils';

interface RoomMemberListProps {
  roomId: string;
  currentUserId?: string | null;
  onlineUserIds?: Set<string>;
  isHost?: boolean;
  onKickMember?: (userId: string, username: string) => void;
  className?: string;
}

export function RoomMemberList({
  roomId,
  currentUserId,
  onlineUserIds,
  isHost,
  onKickMember,
  className,
}: RoomMemberListProps) {
  const {
    data: members,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useRoomMembers(roomId);

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
          onClick={() => refetch()}
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
              onClick={() => refetch()}
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
              return new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime();
            })
            .map((m) => {
              const isCurrentUser = Boolean(currentUserId && m.userId === currentUserId);
              const username = m.user?.username ?? 'Member';
              const isOnline = onlineUserIds ? onlineUserIds.has(m.userId) : true;

              return (
                <div
                  key={m.id}
                  data-testid={`member-item-${m.userId}`}
                  className={cn(
                    'p-2.5 rounded-xl border flex items-center justify-between transition-colors',
                    isCurrentUser
                      ? 'bg-violet-950/30 border-violet-500/30 shadow-sm'
                      : 'bg-white/5 border-white/5 hover:bg-white/[0.07]'
                  )}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <UserAvatar
                      name={username}
                      avatarUrl={m.user?.avatar}
                      size="sm"
                      status={isOnline ? 'online' : 'offline'}
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-semibold text-slate-200 truncate">
                          {username}
                        </span>
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
                      </div>
                      <span className="text-[10px] text-slate-400 block truncate">
                        Joined{' '}
                        {new Date(m.joinedAt).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center pl-2 shrink-0 gap-1.5">
                    {isHost && m.role !== 'host' && onKickMember && (
                      <button
                        type="button"
                        onClick={() => onKickMember(m.userId, username)}
                        title={`Remove ${username} from room`}
                        className="p-1 rounded text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                      >
                        <UserX className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <span
                      className={cn(
                        'w-2 h-2 rounded-full',
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
    </div>
  );
}
