'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Play,
  Pause,
  SkipForward,
  Plus,
  Send,
  Users,
  LogOut,
  Crown,
  Disc3,
  Sliders,
  MessageSquare,
  ListMusic,
  Share2,
  AlertCircle,
  LogIn,
  CheckCircle2,
  Settings,
  Sparkles,
  Lock,
} from 'lucide-react';
import { RoomStatusBadge } from '@/components/shared/room-status-badge';
import { EmptyState } from '@/components/shared/empty-state';
import { LoadingState } from '@/components/shared/loading-state';
import { RoomMemberList } from '@/components/shared/room-member-list';
import { LeaveRoomDialog } from '@/components/rooms/leave-room-dialog';
import {
  useRoom,
  useMyRoomMembership,
  useJoinRoom,
  useLeaveRoom,
} from '@/hooks/queries/use-room';
import { useAuth } from '@/hooks/use-auth';
import { useAppStore } from '@/stores/use-app-store';

export default function RoomDetailPage() {
  const params = useParams();
  const router = useRouter();
  const roomId = params?.roomId as string;

  const { isAuthenticated, user: currentUser } = useAuth();
  const { data: room, isLoading: isRoomLoading, isError: isRoomError, error: roomError } = useRoom(roomId);
  const {
    data: myMembership,
  } = useMyRoomMembership(roomId, { enabled: isAuthenticated });

  const joinMutation = useJoinRoom();
  const leaveMutation = useLeaveRoom();

  const [isLeaveDialogOpen, setIsLeaveDialogOpen] = useState(false);
  const [joinErrorMessage, setJoinErrorMessage] = useState<string | null>(null);
  const [leaveErrorMessage, setLeaveErrorMessage] = useState<string | null>(null);

  const { isMuted, toggleMute, volume, setVolume } = useAppStore();
  const [isPlaying, setIsPlaying] = useState(true);
  const [activeTab, setActiveTab] = useState<'queue' | 'chat'>('queue');
  const [chatMessage, setChatMessage] = useState('');
  const [reverbMode, setReverbMode] = useState<'Studio' | 'Hall' | 'Club' | 'Off'>('Studio');

  // Simulated queue data for stage experience
  const [queue] = useState([
    { id: '1', title: 'Blinding Lights', artist: 'The Weeknd', requestedBy: 'MiaSingz', duration: '3:20', isCurrent: true },
    { id: '2', title: 'Cruel Summer', artist: 'Taylor Swift', requestedBy: 'Alex Singer', duration: '2:58', isCurrent: false },
    { id: '3', title: 'Bohemian Rhapsody', artist: 'Queen', requestedBy: 'RockLegend99', duration: '5:55', isCurrent: false },
  ]);

  // Simulated chat messages
  const [messages, setMessages] = useState([
    { id: 'm1', sender: 'System', text: 'Welcome to Virtual VIP Lounge! Have fun singing!', isSystem: true },
    { id: 'm2', sender: 'RockLegend99', text: 'Pitch is incredible on this track! 🔥', isSystem: false },
    { id: 'm3', sender: 'Elena_Pop', text: 'Cheering from the lounge! 👏🎤', isSystem: false },
  ]);

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatMessage.trim()) return;
    setMessages((prev) => [
      ...prev,
      {
        id: `m-${Date.now()}`,
        sender: currentUser?.username ?? 'Alex Singer',
        text: chatMessage.trim(),
        isSystem: false,
      },
    ]);
    setChatMessage('');
  };

  const handleJoin = async () => {
    setJoinErrorMessage(null);
    try {
      await joinMutation.mutateAsync(roomId);
    } catch (err: unknown) {
      const errorMsg =
        err instanceof Error
          ? err.message
          : 'Unable to join lounge. Please check availability and try again.';
      setJoinErrorMessage(errorMsg);
    }
  };

  const handleLeaveConfirm = async () => {
    setLeaveErrorMessage(null);
    try {
      await leaveMutation.mutateAsync(roomId);
      setIsLeaveDialogOpen(false);
    } catch (err: unknown) {
      const errorMsg =
        err instanceof Error ? err.message : 'Unable to leave lounge. Please try again.';
      setLeaveErrorMessage(errorMsg);
    }
  };

  if (isRoomLoading) {
    return (
      <div className="flex-1 flex items-center justify-center py-20 bg-[#07090f]">
        <LoadingState message="Connecting to karaoke lounge & audio channels..." />
      </div>
    );
  }

  if (isRoomError || !room) {
    return (
      <div className="flex-1 flex items-center justify-center py-20 bg-[#07090f]">
        <EmptyState
          icon={AlertCircle}
          title="Lounge Not Found"
          description={
            roomError instanceof Error
              ? roomError.message
              : 'The requested karaoke lounge could not be loaded or has been closed.'
          }
          action={{
            label: 'Back to Lounges',
            onClick: () => {
              router.push('/rooms');
            },
          }}
        />
      </div>
    );
  }

  const isMember = Boolean(myMembership?.isMember);
  const isHost = isMember && myMembership?.role === 'host';
  const isClosed = room.status === 'closed';
  const isFull = (room.currentParticipantsCount ?? 0) >= room.capacity;
  const isPrivate = room.visibility === 'private';

  return (
    <div className="flex-1 flex flex-col bg-[#07090f] overflow-hidden">
      {/* Room Header */}
      <div className="border-b border-white/10 bg-[#0b0e19] px-4 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link
              href="/rooms"
              className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white transition-colors"
              title="Back to Lounges"
            >
              <LogOut className="w-4 h-4" />
            </Link>

            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-bold text-white text-base tracking-tight">{room.name}</h1>
                <RoomStatusBadge status={room.status} />
                {isPrivate && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-md">
                    <Lock className="w-3 h-3" />
                    Private
                  </span>
                )}
                <span className="hidden sm:inline-block text-[11px] font-semibold text-cyan-400 uppercase tracking-wide bg-cyan-500/10 border border-cyan-500/20 px-2 py-0.5 rounded-md">
                  {room.category}
                </span>
              </div>
              <p className="text-xs text-slate-400 hidden md:block">{room.description}</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Participant count */}
            <div
              data-testid="room-capacity-counter"
              className="flex items-center gap-1.5 text-xs text-slate-300 px-3 py-1.5 rounded-lg bg-white/5 border border-white/5"
            >
              <Users className="w-3.5 h-3.5 text-violet-400" />
              <span className="font-semibold text-white">{room.currentParticipantsCount ?? 0}</span>
              <span className="text-slate-500">/</span>
              <span>{room.capacity}</span>
              {isFull && (
                <span className="ml-1 text-[10px] font-bold uppercase text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded">
                  Full
                </span>
              )}
            </div>

            {/* Host Controls or Member Leave Button */}
            {isMember ? (
              <div className="flex items-center gap-2">
                {isHost ? (
                  <div className="flex items-center gap-2">
                    <span
                      data-testid="host-status-indicator"
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-amber-500/10 text-amber-300 border border-amber-500/30"
                    >
                      <Crown className="w-3.5 h-3.5 fill-amber-300" />
                      Host
                    </span>
                    <Link
                      href="/my-rooms"
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-medium border border-white/10 transition-colors"
                      title="Manage Lounge"
                    >
                      <Settings className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Settings</span>
                    </Link>
                  </div>
                ) : (
                  <button
                    type="button"
                    data-testid="leave-room-button"
                    onClick={() => setIsLeaveDialogOpen(true)}
                    disabled={leaveMutation.isPending}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 text-xs font-medium border border-rose-500/30 transition-colors disabled:opacity-50"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Leave Lounge</span>
                  </button>
                )}
              </div>
            ) : null}

            {/* Share / Invite */}
            <button
              onClick={() => {
                if (typeof window !== 'undefined') {
                  navigator.clipboard?.writeText(window.location.href);
                }
              }}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-medium border border-white/10 transition-colors"
              title="Copy link to invite friends"
            >
              <Share2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Invite</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Lounge Viewport */}
      <div className="flex-1 max-w-7xl w-full mx-auto p-4 grid grid-cols-1 lg:grid-cols-12 gap-4 overflow-y-auto">
        {/* Left: Real Member Roster (Col 3) */}
        <div className="lg:col-span-3 flex flex-col">
          <RoomMemberList
            roomId={roomId}
            currentUserId={currentUser?.id}
            className="h-full"
          />
        </div>

        {/* Center: Stage / Audio & Participation Banner (Col 6) */}
        <div className="lg:col-span-6 flex flex-col gap-4">
          {/* Participation Callout if NOT an active member */}
          {!isMember && (
            <div
              data-testid="join-lounge-banner"
              className="glass-panel p-5 rounded-2xl border border-violet-500/30 bg-gradient-to-br from-violet-950/40 via-[#0e121e] to-cyan-950/20 space-y-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-cyan-400" />
                    <h2 className="text-sm font-bold text-white tracking-wide">
                      Welcome to {room.name}
                    </h2>
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Step onto the stage to sing, queue favorite tracks, and join fellow singers in
                    real time.
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <span className="text-xs font-semibold text-slate-300 block">
                    Capacity: {room.currentParticipantsCount ?? 0}/{room.capacity}
                  </span>
                  <span className="text-[10px] text-slate-500">
                    Host: {room.host?.username ?? 'Lounge Host'}
                  </span>
                </div>
              </div>

              {joinErrorMessage && (
                <div
                  data-testid="join-error-alert"
                  className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/25 text-xs text-rose-300 flex items-center gap-2"
                >
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                  <span>{joinErrorMessage}</span>
                </div>
              )}

              {/* Action based on state */}
              {isClosed ? (
                <div
                  data-testid="room-closed-notice"
                  className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300 flex items-center justify-between"
                >
                  <span>This lounge is closed and is no longer accepting new singers.</span>
                  <Link
                    href="/rooms"
                    className="text-xs font-semibold text-amber-400 hover:underline ml-2 shrink-0"
                  >
                    Browse Lounges
                  </Link>
                </div>
              ) : isFull ? (
                <div
                  data-testid="room-full-notice"
                  className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300 flex items-center justify-between"
                >
                  <span>This lounge is currently at full capacity ({room.capacity}/{room.capacity}).</span>
                  <button
                    disabled
                    data-testid="join-room-button-disabled"
                    className="px-4 py-2 rounded-xl bg-white/5 text-slate-500 text-xs font-semibold cursor-not-allowed border border-white/5"
                  >
                    Lounge Full
                  </button>
                </div>
              ) : !isAuthenticated ? (
                <div className="flex items-center justify-between pt-1">
                  <span className="text-xs text-slate-400">
                    Sign in to participate and step onto the stage.
                  </span>
                  <Link
                    href={`/login?redirect=/rooms/${roomId}`}
                    data-testid="join-login-button"
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-violet-600 to-cyan-500 hover:from-violet-500 hover:to-cyan-400 text-white text-xs font-semibold shadow-lg shadow-violet-600/25 transition-all"
                  >
                    <LogIn className="w-3.5 h-3.5" />
                    <span>Sign in to Join</span>
                  </Link>
                </div>
              ) : (
                <div className="flex items-center justify-between pt-1">
                  <div className="text-xs text-slate-400 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Slot available for you</span>
                  </div>
                  <button
                    type="button"
                    data-testid="join-room-button"
                    onClick={handleJoin}
                    disabled={joinMutation.isPending}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-cyan-500 hover:from-violet-500 hover:to-cyan-400 text-white text-xs font-semibold shadow-lg shadow-violet-600/25 transition-all disabled:opacity-50"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>{joinMutation.isPending ? 'Joining Stage...' : 'Join Lounge'}</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {leaveErrorMessage && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/25 text-xs text-rose-300 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{leaveErrorMessage}</span>
            </div>
          )}

          {/* Virtual Karaoke Stage Screen */}
          <div className="relative rounded-2xl bg-[#030408] border border-violet-500/20 overflow-hidden shadow-2xl flex-1 min-h-[340px] flex flex-col justify-between p-6">
            {/* Screen Top Status */}
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse" />
                <span className="text-rose-400 font-bold uppercase tracking-wider text-[11px]">
                  ON AIR
                </span>
                <span className="text-slate-400">&bull; Pitch: +0 &bull; Key: C Minor</span>
              </div>
              <span className="text-slate-400 text-[11px]">Sync Audio Engine: 44.1 kHz</span>
            </div>

            {/* Central Lyrics Display Simulation */}
            <div className="my-auto text-center space-y-4 py-8">
              <p className="text-xs sm:text-sm font-medium text-slate-400 transition-opacity">
                I said, ooh, I&apos;m blinded by the lights
              </p>
              <div className="inline-block p-3 rounded-2xl bg-gradient-to-r from-violet-600/20 via-cyan-500/20 to-violet-600/20 border border-violet-500/30">
                <p className="text-lg sm:text-2xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-violet-300 via-white to-cyan-300 tracking-wide">
                  No, I can&apos;t sleep until I feel your touch
                </p>
              </div>
              <p className="text-xs sm:text-sm font-medium text-slate-400 transition-opacity">
                I said, ooh, I&apos;m drowning in the night
              </p>
            </div>

            {/* Screen Bottom: Track Progress & Audio Bars */}
            <div>
              <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
                <div className="flex items-center gap-2">
                  <Disc3 className="w-4 h-4 text-violet-400 animate-spin" />
                  <span className="font-semibold text-slate-200">Blinding Lights</span>
                  <span>- The Weeknd</span>
                </div>
                <span>01:42 / 03:20</span>
              </div>

              {/* Progress bar */}
              <div className="w-full bg-white/10 rounded-full h-1.5 overflow-hidden">
                <div className="bg-gradient-to-r from-violet-500 to-cyan-400 h-1.5 rounded-full w-[52%]" />
              </div>
            </div>
          </div>

          {/* Voice Controls & Reverb Panel */}
          <div className="glass-panel p-4 rounded-2xl border border-white/5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-4">
              {/* Mic & Volume */}
              <div className="flex items-center gap-3">
                <button
                  onClick={toggleMute}
                  className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all shadow-md ${
                    isMuted
                      ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-600/20'
                      : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/20'
                  }`}
                >
                  {isMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                  <span>{isMuted ? 'Muted' : 'Mic Active'}</span>
                </button>

                {/* Volume slider */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setVolume(volume === 0 ? 80 : 0)}
                    className="text-slate-400 hover:text-white"
                  >
                    {volume === 0 ? (
                      <VolumeX className="w-4 h-4" />
                    ) : (
                      <Volume2 className="w-4 h-4 text-cyan-400" />
                    )}
                  </button>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={volume}
                    onChange={(e) => setVolume(Number(e.target.value))}
                    className="w-20 sm:w-28 h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-violet-500"
                  />
                  <span className="text-[11px] text-slate-400 w-6">{volume}%</span>
                </div>
              </div>

              {/* Playback simulation controls */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsPlaying(!isPlaying)}
                  className="p-2 rounded-xl bg-white/10 hover:bg-white/15 text-white transition-colors"
                >
                  {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                </button>
                <button
                  onClick={() => alert('Skipping to next song in queue (Sprint 3)')}
                  className="p-2 rounded-xl bg-white/10 hover:bg-white/15 text-slate-300 hover:text-white transition-colors"
                >
                  <SkipForward className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Reverb mode selectors */}
            <div className="flex items-center justify-between pt-2 border-t border-white/5 text-xs text-slate-400">
              <span className="flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5 text-violet-400" />
                <span>Reverb Presets:</span>
              </span>

              <div className="flex items-center gap-1">
                {(['Studio', 'Hall', 'Club', 'Off'] as const).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => setReverbMode(mode)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors ${
                      reverbMode === mode
                        ? 'bg-violet-600 text-white'
                        : 'bg-white/5 text-slate-400 hover:text-white'
                    }`}
                  >
                    {mode}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Right: Song Queue & Live Chat Tabs (Col 3) */}
        <div className="lg:col-span-3 flex flex-col glass-panel rounded-2xl p-4 border border-white/5 min-h-[400px]">
          {/* Tabs */}
          <div className="flex items-center gap-2 p-1 rounded-xl bg-black/40 border border-white/5 mb-4">
            <button
              onClick={() => setActiveTab('queue')}
              className={`flex-1 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                activeTab === 'queue'
                  ? 'bg-violet-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <ListMusic className="w-3.5 h-3.5" />
              <span>Queue ({queue.length})</span>
            </button>
            <button
              onClick={() => setActiveTab('chat')}
              className={`flex-1 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                activeTab === 'chat'
                  ? 'bg-violet-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span>Lounge Chat</span>
            </button>
          </div>

          {/* Queue Tab Content */}
          {activeTab === 'queue' && (
            <div className="flex-1 flex flex-col justify-between">
              <div className="space-y-2 overflow-y-auto">
                {queue.map((item, idx) => (
                  <div
                    key={item.id}
                    className={`p-2.5 rounded-xl border flex items-center justify-between text-xs ${
                      item.isCurrent
                        ? 'bg-violet-950/30 border-violet-500/30 text-white'
                        : 'bg-white/5 border-white/5 text-slate-300'
                    }`}
                  >
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-bold text-violet-400">#{idx + 1}</span>
                        <p className="font-semibold truncate max-w-[140px]">{item.title}</p>
                      </div>
                      <p className="text-[10px] text-slate-400">
                        {item.artist} &bull; by {item.requestedBy}
                      </p>
                    </div>
                    <span className="text-[10px] text-slate-500">{item.duration}</span>
                  </div>
                ))}
              </div>

              <button
                onClick={() => alert('Search & Song Selection modal scheduled for Sprint 3')}
                className="mt-4 w-full py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
              >
                <Plus className="w-4 h-4 text-violet-400" />
                <span>Add Song to Queue</span>
              </button>
            </div>
          )}

          {/* Chat Tab Content */}
          {activeTab === 'chat' && (
            <div className="flex-1 flex flex-col justify-between">
              <div className="space-y-2.5 overflow-y-auto max-h-[300px] pr-1">
                {messages.map((m) => (
                  <div
                    key={m.id}
                    className={`p-2 rounded-xl text-xs ${
                      m.isSystem
                        ? 'bg-cyan-500/10 border border-cyan-500/20 text-cyan-300 text-[11px]'
                        : 'bg-white/5 border border-white/5 text-slate-200'
                    }`}
                  >
                    {!m.isSystem && (
                      <p className="text-[10px] font-bold text-violet-400 mb-0.5">{m.sender}</p>
                    )}
                    <p className="break-words leading-relaxed">{m.text}</p>
                  </div>
                ))}
              </div>

              {/* Chat Form */}
              <form onSubmit={handleSendMessage} className="mt-4 flex items-center gap-2">
                <input
                  type="text"
                  value={chatMessage}
                  onChange={(e) => setChatMessage(e.target.value)}
                  placeholder="Cheer or chat..."
                  className="flex-1 px-3 py-2 rounded-xl bg-[#0e121e] border border-white/10 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-violet-500"
                />
                <button
                  type="submit"
                  className="p-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white transition-colors"
                >
                  <Send className="w-3.5 h-3.5" />
                </button>
              </form>
            </div>
          )}
        </div>
      </div>

      {/* Leave Room Confirmation Dialog */}
      <LeaveRoomDialog
        isOpen={isLeaveDialogOpen}
        isPending={leaveMutation.isPending}
        roomName={room.name}
        onClose={() => setIsLeaveDialogOpen(false)}
        onConfirm={handleLeaveConfirm}
      />
    </div>
  );
}
