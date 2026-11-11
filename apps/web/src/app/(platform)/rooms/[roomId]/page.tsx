'use client';

import React, { useState, useCallback } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  Mic,
  Users,
  LogOut,
  Crown,
  MessageSquare,
  ListMusic,
  Share2,
  AlertCircle,
  LogIn,
  CheckCircle2,
  Settings,
  Sparkles,
  Lock,
  Activity,
  X,
  PhoneCall,
  MicOff,
  Paintbrush,
  Info,
} from 'lucide-react';
import { RoomStatusBadge } from '@/components/shared/room-status-badge';
import { EmptyState } from '@/components/shared/empty-state';
import { LoadingState } from '@/components/shared/loading-state';
import { RoomMemberList } from '@/components/shared/room-member-list';
import { LeaveRoomDialog } from '@/components/rooms/leave-room-dialog';
import { RoomChatPanel } from '@/components/chat/room-chat-panel';
import { RoomActivityTimeline } from '@/components/chat/room-activity-timeline';
import { KickMemberDialog } from '@/components/rooms/kick-member-dialog';
import { RoomIdentityDialog } from '@/components/rooms/room-identity-dialog';
import { RoomCustomizationDialog } from '@/components/rooms/room-customization-dialog';
import {
  useJoinRoom,
  useLeaveRoom,
} from '@/hooks/queries/use-room';
import { useUpdateRoom } from '@/hooks/queries/use-room-mutations';
import { useKickMember } from '@/hooks/queries/use-chat';
import { useAuth } from '@/hooks/use-auth';
import { useRoomState } from '@/hooks/use-room-state';
import { useRoomChat } from '@/hooks/use-room-chat';
import { useVoiceClient, VoiceControls } from '@/features/voice';
import { useRoomAtmosphere } from '@/features/rooms/atmosphere';
import {
  useKaraoke,
  useStageReactions,
  useVirtualGifts,
  KaraokePlayer,
  RoomSongQueue,
  SongSearchDialog,
  GiftSelectorDialog,
} from '@/features/karaoke';
import { cn } from '@/lib/utils';

export default function RoomDetailPage() {
  const params = useParams();
  const router = useRouter();
  const roomId = params?.roomId as string;

  const { isAuthenticated, user: currentUser } = useAuth();
  const {
    room,
    host,
    members,
    onlineUserIds,
    totalOnline,
    viewer,
    version: roomStateVersion,
    syncStatus,
    connectionStatus,
    isLoading: isRoomLoading,
    isError: isRoomError,
    errorMessage: roomErrorMessage,
    roomClosedNotice,
    isKicked: stateIsKicked,
    kickedReason: stateKickedReason,
    refreshState,
  } = useRoomState(roomId, { enabled: Boolean(roomId) });

  const joinMutation = useJoinRoom();
  const leaveMutation = useLeaveRoom();

  const [isLeaveDialogOpen, setIsLeaveDialogOpen] = useState(false);
  const [joinErrorMessage, setJoinErrorMessage] = useState<string | null>(null);
  const [leaveErrorMessage, setLeaveErrorMessage] = useState<string | null>(null);

  // Room Identity & Atmosphere Customization Dialogs
  const [isIdentityOpen, setIsIdentityOpen] = useState(false);
  const [isCustomizationOpen, setIsCustomizationOpen] = useState(false);
  const updateRoomMutation = useUpdateRoom();
  const atmosphere = useRoomAtmosphere({ authoritativePreset: room?.atmospherePreset });

  // Desktop sidebar active tab (default to queue for instant entertainment focus)
  const [activeTab, setActiveTab] = useState<'queue' | 'chat' | 'people' | 'activities'>('queue');

  // Mobile dedicated slide-over drawer / sheet state
  const [mobileDrawer, setMobileDrawer] = useState<'queue' | 'chat' | 'people' | 'activities' | null>(null);

  const {
    messages: chatMessages,
    activities,
    isLoadingMessages,
    isSending: isSendingChatMessage,
    isKicked,
    kickedReason,
    sendMessage,
    deleteMessage,
    addReaction,
    removeReaction,
  } = useRoomChat(roomId, { enabled: isAuthenticated });

  const voice = useVoiceClient({
    roomId,
    enabled: Boolean(
      roomId &&
        isAuthenticated &&
        viewer?.isMember &&
        room?.status !== 'closed' &&
        !stateIsKicked &&
        !isKicked
    ),
  });

  const [kickTarget, setKickTarget] = useState<{ userId: string; username: string } | null>(null);
  const kickMutation = useKickMember(roomId);

  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const isMember = Boolean(viewer?.isMember);
  const isHost = isMember && viewer?.role === 'host';
  const karaoke = useKaraoke(roomId, {
    enabled: Boolean(roomId),
    currentUserId: currentUser?.id,
    isHost,
    isMember,
    roomStatus: room?.status,
  });

  // Real-time Stage Audience Reactions (Sprint 3.3)
  const stageReactions = useStageReactions(roomId, {
    enabled: Boolean(
      roomId &&
        isAuthenticated &&
        viewer?.isMember &&
        room?.status !== 'closed' &&
        !stateIsKicked &&
        !isKicked
    ),
    currentUserId: currentUser?.id,
  });

  // Real-time Virtual Gifts & Performer Appreciation (Sprint 3.4)
  const [isGiftSelectorOpen, setIsGiftSelectorOpen] = useState(false);
  const virtualGifts = useVirtualGifts(roomId, {
    enabled: Boolean(
      roomId &&
        isAuthenticated &&
        viewer?.isMember &&
        room?.status !== 'closed' &&
        !stateIsKicked &&
        !isKicked
    ),
    currentUserId: currentUser?.id,
  });

  // Authoritative LiveKit Voice speaking & connection detection for stage performer
  const currentSingerId = karaoke.currentSinger?.id || karaoke.currentSingerId;
  const currentSingerParticipant = voice.participants.find(
    (p) => p.userId === currentSingerId
  );
  const isSingerSpeaking = Boolean(
    (voice.isConnected && currentUser?.id === currentSingerId && voice.isSpeaking) ||
      currentSingerParticipant?.isSpeaking
  );
  const isSingerVoiceConnected = Boolean(
    (voice.isConnected && currentUser?.id === currentSingerId) ||
      currentSingerParticipant
  );
  const isSingerMuted = Boolean(
    (voice.isConnected && currentUser?.id === currentSingerId && voice.isMuted) ||
      currentSingerParticipant?.isMuted
  );

  const handleOpenEqModal = useCallback(() => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('ktv_open_audio_settings'));
    }
  }, []);

  const handleJoin = async () => {
    setJoinErrorMessage(null);
    try {
      await joinMutation.mutateAsync(roomId);
      refreshState();
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
      await voice.leaveVoice();
      await leaveMutation.mutateAsync(roomId);
      setIsLeaveDialogOpen(false);
      refreshState();
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
            roomErrorMessage || 'The requested karaoke lounge could not be loaded or has been closed.'
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

  const isClosed = room.status === 'closed' || Boolean(roomClosedNotice);
  const isFull = (room.currentParticipantsCount ?? 0) >= room.capacity;
  const isPrivate = room.visibility === 'private';
  const effectiveIsKicked = isKicked || stateIsKicked;
  const effectiveKickedReason = kickedReason || stateKickedReason;
  const totalQueueCount = (karaoke.currentItem ? 1 : 0) + (karaoke.queue?.items?.length || 0);

  return (
    <div
      className={cn(
        'flex-1 flex flex-col overflow-x-hidden min-h-screen text-slate-100 transition-colors duration-500 relative',
        atmosphere.activeConfig.styles.rootBackground
      )}
    >
      {/* Ambient Atmosphere Spotlight Glow */}
      <div
        className={cn(
          'absolute top-0 left-0 right-0 h-[450px] pointer-events-none transition-opacity duration-700 z-0',
          atmosphere.activeConfig.styles.ambientGlow
        )}
      />

      {/* Zone 1: Persistent Room Header & Voice Lounge Bar */}
      <header className="border-b border-white/10 bg-[#0b0e19]/95 backdrop-blur-md px-3 sm:px-5 py-2.5 sticky top-0 z-30 shadow-md">
        <div className="max-w-[1600px] mx-auto flex flex-wrap items-center justify-between gap-3">
          {/* Left: Lounge Info & Identity */}
          <div className="flex items-center gap-2.5 min-w-0">
            <Link
              href="/rooms"
              className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white transition-colors shrink-0"
              title="Back to Lounges"
            >
              <LogOut className="w-4 h-4" />
            </Link>

            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  data-testid="room-identity-info-trigger"
                  onClick={() => setIsIdentityOpen(true)}
                  className="font-bold text-white text-sm sm:text-base tracking-tight truncate max-w-[180px] sm:max-w-xs md:max-w-md hover:text-violet-300 transition-colors flex items-center gap-1.5 text-left"
                  title="View Lounge Identity & Details"
                >
                  <span className="truncate">{room.name}</span>
                  <Info className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                </button>
                <RoomStatusBadge status={room.status} />
                {isPrivate && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded-md shrink-0">
                    <Lock className="w-2.5 h-2.5" />
                    Private
                  </span>
                )}
                <span className="hidden sm:inline-block text-[10px] font-semibold text-cyan-400 uppercase tracking-wide bg-cyan-500/10 border border-cyan-500/20 px-1.5 py-0.5 rounded-md shrink-0">
                  {room.category}
                </span>
                <button
                  type="button"
                  data-testid="header-atmosphere-badge"
                  onClick={() => setIsIdentityOpen(true)}
                  className={cn(
                    'hidden xs:inline-flex items-center gap-1 text-[10px] font-semibold border px-2 py-0.5 rounded-full shrink-0 transition-transform active:scale-95',
                    atmosphere.activeConfig.styles.badgeClass
                  )}
                  title={`Lounge Atmosphere: ${atmosphere.activeConfig.name}`}
                >
                  <Sparkles className="w-2.5 h-2.5" />
                  <span>{atmosphere.activeConfig.name}</span>
                </button>
              </div>
              {room.description && (
                <p className="text-[11px] text-slate-400 hidden md:block truncate max-w-sm">
                  {room.description}
                </p>
              )}
            </div>
          </div>

          {/* Right: Telemetry, Persistent Voice Bar & Lounge Controls */}
          <div className="flex items-center gap-2 sm:gap-2.5 flex-wrap">
            {/* Participant Capacity Counter */}
            <div
              data-testid="room-capacity-counter"
              className="flex items-center gap-1 text-xs text-slate-300 px-2.5 py-1.5 rounded-lg bg-white/5 border border-white/5"
              title={`Occupancy: ${room.currentParticipantsCount ?? 0} of ${room.capacity}`}
            >
              <Users className="w-3.5 h-3.5 text-violet-400 shrink-0" />
              <span className="font-semibold text-white">{room.currentParticipantsCount ?? 0}</span>
              <span className="text-slate-500">/</span>
              <span>{room.capacity}</span>
              {isFull && (
                <span className="ml-1 text-[9px] font-bold uppercase text-amber-400 bg-amber-500/15 px-1 py-0.2 rounded">
                  Full
                </span>
              )}
            </div>

            {/* Realtime Socket Sync Status Pill */}
            <div
              data-testid="realtime-status-pill"
              className={cn(
                'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors',
                syncStatus === 'synced' && connectionStatus === 'connected' && 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
                (syncStatus === 'initializing' || connectionStatus === 'connecting') && 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30',
                (syncStatus === 'reconnecting' || connectionStatus === 'reconnecting') && 'bg-amber-500/10 text-amber-400 border-amber-500/30 animate-pulse',
                syncStatus === 'desynchronized' && 'bg-amber-500/10 text-amber-300 border-amber-500/30 animate-pulse',
                (connectionStatus === 'disconnected' || connectionStatus === 'error') &&
                  'bg-white/5 text-slate-400 border-white/5'
              )}
              title={`Realtime presence: ${connectionStatus} (v${roomStateVersion}, ${syncStatus})`}
            >
              <span
                className={cn(
                  'w-2 h-2 rounded-full shrink-0',
                  syncStatus === 'synced' && connectionStatus === 'connected' && 'bg-emerald-400 shadow-sm shadow-emerald-400/50',
                  (syncStatus === 'initializing' || connectionStatus === 'connecting') && 'bg-cyan-400 animate-ping',
                  (syncStatus === 'reconnecting' || connectionStatus === 'reconnecting') && 'bg-amber-400 animate-bounce',
                  syncStatus === 'desynchronized' && 'bg-amber-400 animate-pulse',
                  (connectionStatus === 'disconnected' || connectionStatus === 'error') && 'bg-slate-500'
                )}
              />
              <span className="hidden sm:inline capitalize">
                {syncStatus === 'desynchronized' ? 'Re-syncing...' : connectionStatus}
              </span>
              {connectionStatus === 'connected' && <span>({totalOnline})</span>}
            </div>

            {/* LiveKit Voice Header Badge */}
            {voice.isConnected && (
              <div
                data-testid="header-voice-indicator"
                className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                title={`LiveKit Voice: connected (${voice.participants.length} in voice)`}
              >
                <Mic className={cn('w-3.5 h-3.5', voice.isSpeaking && 'animate-pulse text-emerald-300')} />
                <span>Voice ({voice.participants.length})</span>
              </div>
            )}

            {/* Persistent Voice Controls Bar (Workstream G) */}
            <VoiceControls
              variant="bar"
              connectionState={voice.connectionState}
              isConnected={voice.isConnected}
              isConnecting={voice.isConnecting}
              isMuted={voice.isMuted}
              isSpeaking={voice.isSpeaking}
              errorMessage={voice.errorMessage}
              audioDevices={voice.audioDevices}
              activeDeviceId={voice.activeDeviceId}
              isRoomMember={isMember}
              onJoinVoice={voice.joinVoice}
              onLeaveVoice={voice.leaveVoice}
              onToggleMute={voice.toggleMute}
              onSwitchDevice={voice.switchDevice}
              audioInputDevices={voice.audioInputDevices}
              activeAudioInputId={voice.activeAudioInputId}
              permissionState={voice.permissionState}
              capturePreferences={voice.capturePreferences}
              onUpdateCapturePreferences={voice.updateCapturePreferences}
              audioOutputDevices={voice.audioOutputDevices}
              activeAudioOutputId={voice.activeAudioOutputId}
              isOutputSelectionSupported={voice.isOutputSelectionSupported}
              onSwitchAudioInputDevice={voice.switchAudioInputDevice}
              onSwitchAudioOutputDevice={voice.switchAudioOutputDevice}
            />

            {/* Host Controls or Member Leave Room Button */}
            {isMember ? (
              <div className="flex items-center gap-1.5">
                {isHost ? (
                  <div className="flex items-center gap-1.5">
                    <span
                      data-testid="host-status-indicator"
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold bg-amber-500/10 text-amber-300 border border-amber-500/30"
                    >
                      <Crown className="w-3.5 h-3.5 fill-amber-300" />
                      Host
                    </span>
                    <button
                      type="button"
                      data-testid="customize-atmosphere-button"
                      onClick={() => setIsCustomizationOpen(true)}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-violet-600/20 hover:bg-violet-600/30 text-violet-200 text-xs font-semibold border border-violet-500/30 transition-all active:scale-95"
                      title="Customize Lounge Atmosphere"
                    >
                      <Paintbrush className="w-3.5 h-3.5" />
                      <span className="hidden md:inline">Vibe</span>
                    </button>
                    <Link
                      href="/my-rooms"
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-medium border border-white/10 transition-colors"
                      title="Manage Lounge"
                    >
                      <Settings className="w-3.5 h-3.5" />
                      <span className="hidden md:inline">Settings</span>
                    </Link>
                  </div>
                ) : (
                  <button
                    type="button"
                    data-testid="leave-room-button"
                    onClick={() => setIsLeaveDialogOpen(true)}
                    disabled={leaveMutation.isPending}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 text-xs font-medium border border-rose-500/30 transition-colors disabled:opacity-50"
                    title="Leave karaoke room"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Leave Lounge</span>
                  </button>
                )}
              </div>
            ) : null}

            {/* Share / Invite Button */}
            <button
              onClick={() => {
                if (typeof window !== 'undefined') {
                  navigator.clipboard?.writeText(window.location.href);
                }
              }}
              className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white transition-colors border border-white/5"
              title="Copy link to invite friends"
            >
              <Share2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </header>

      {/* Room Closed Notification Alert */}
      {roomClosedNotice && (
        <div className="max-w-[1600px] w-full mx-auto px-4 pt-3">
          <div
            data-testid="room-closed-alert"
            className="p-3.5 rounded-2xl border border-rose-500/30 bg-rose-950/40 flex items-center justify-between gap-3 text-rose-200 shadow-lg shadow-rose-950/50"
          >
            <div className="flex items-center gap-2.5">
              <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
              <div>
                <h4 className="text-xs sm:text-sm font-semibold text-white">Lounge Closed</h4>
                <p className="text-xs text-rose-300">{roomClosedNotice}</p>
              </div>
            </div>
            <button
              onClick={() => router.push('/rooms')}
              className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold transition-colors shrink-0"
            >
              Back to Lounges
            </button>
          </div>
        </div>
      )}

      {/* Kicked by Host Notification Banner */}
      {effectiveIsKicked && (
        <div className="bg-rose-500/20 border-b border-rose-500/40 px-4 py-2.5 flex items-center justify-between text-xs text-rose-200">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>
              <strong>Removed by Host:</strong> {effectiveKickedReason || 'You were removed from this room by the host.'}
            </span>
          </div>
          <button
            onClick={() => router.push('/rooms')}
            className="px-3 py-1 bg-rose-600 hover:bg-rose-500 text-white rounded-lg font-semibold transition-colors"
          >
            Return to Lobby
          </button>
        </div>
      )}

      {/* Main Lounge Viewport (Desktop 3-Zone Composition: Stage ~68% Width + Sidebar ~32% Width) */}
      <main className="flex-1 max-w-[1600px] w-full mx-auto p-3 sm:p-4 flex flex-col lg:grid lg:grid-cols-12 gap-4 pb-24 lg:pb-4 min-h-0">
        {/* Zone 2: Main Karaoke Stage Area (Col 8) — Greatest Visual Weight */}
        <div className="lg:col-span-8 flex flex-col gap-3 min-h-0">
          {/* Guest / Non-member Step Onto Stage Callout */}
          {!isMember && (
            <div
              data-testid="join-lounge-banner"
              className="glass-panel p-4 sm:p-5 rounded-2xl border border-violet-500/30 bg-gradient-to-br from-violet-950/40 via-[#0e121e] to-cyan-950/20 space-y-3 shadow-xl shadow-violet-950/30"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-cyan-400" />
                    <h2 className="text-sm sm:text-base font-bold text-white tracking-wide">
                      Welcome to {room.name}
                    </h2>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed max-w-xl">
                    Step up to the mic, queue your favorite tracks, and sing along with friends in real time.
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <span className="text-xs font-semibold text-slate-300 block">
                    Capacity: {room.currentParticipantsCount ?? 0}/{room.capacity}
                  </span>
                  <span className="text-[10px] text-slate-400">
                    Host: {host?.username ?? 'Lounge Host'}
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

              {/* Action based on room capacity and status */}
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

          {/* Realtime Server-Authoritative Karaoke Stage & Player */}
          <KaraokePlayer
            playback={karaoke.playback}
            currentPositionMs={karaoke.currentPositionMs}
            isCurrentSinger={karaoke.isCurrentSinger}
            isNextUpSinger={karaoke.isNextUpSinger}
            currentSingerName={karaoke.currentSingerName}
            currentSinger={karaoke.currentSinger}
            currentRequester={karaoke.currentRequester}
            nextUpItem={karaoke.nextUpItem}
            nextSinger={karaoke.nextSinger}
            nextRequester={karaoke.nextRequester}
            performerState={karaoke.currentPerformerState}
            isSingerSpeaking={isSingerSpeaking}
            isSingerVoiceConnected={isSingerVoiceConnected}
            isSingerMuted={isSingerMuted}
            canControlPlayback={karaoke.canControlPlayback}
            isMutating={karaoke.isMutating}
            onPlay={karaoke.play}
            onPause={karaoke.pause}
            onSkip={karaoke.skip}
            onStop={karaoke.stop}
            onSeek={karaoke.seek}
            onOpenSearch={() => setIsSearchOpen(true)}
            onOpenEqSettings={handleOpenEqModal}
            atmosphereStyles={atmosphere.activeConfig.styles}
            onSendReaction={stageReactions.sendReaction}
            activeReactions={stageReactions.particles}
            prefersReducedMotion={stageReactions.prefersReducedMotion}
            activeGifts={virtualGifts.activeGifts}
            onOpenGiftSelector={() => setIsGiftSelectorOpen(true)}
          />
        </div>

        {/* Zone 3: Supporting Lounge Sidebar (Col 4 on Desktop, Drawer on Mobile) */}
        <aside
          className={cn(
            'hidden lg:flex lg:col-span-4 flex-col glass-panel rounded-3xl p-4 min-h-[580px] h-full shadow-2xl transition-all duration-300',
            atmosphere.activeConfig.styles.panelBackground,
            atmosphere.activeConfig.styles.panelBorder
          )}
        >
          {/* Navigation Tabs */}
          <nav aria-label="Lounge sidebar tabs" className="flex items-center gap-1 p-1 rounded-2xl bg-black/50 border border-white/5 mb-3.5 shrink-0">
            <button
              type="button"
              onClick={() => setActiveTab('queue')}
              className={cn(
                'flex-1 py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all',
                activeTab === 'queue'
                  ? 'bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-md shadow-violet-950/50'
                  : 'text-slate-400 hover:text-white'
              )}
            >
              <ListMusic className="w-3.5 h-3.5" />
              <span>Queue ({totalQueueCount})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('chat')}
              className={cn(
                'flex-1 py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all',
                activeTab === 'chat'
                  ? 'bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-md shadow-violet-950/50'
                  : 'text-slate-400 hover:text-white'
              )}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span>Chat ({chatMessages.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('people')}
              className={cn(
                'flex-1 py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all',
                activeTab === 'people'
                  ? 'bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-md shadow-violet-950/50'
                  : 'text-slate-400 hover:text-white'
              )}
            >
              <Users className="w-3.5 h-3.5" />
              <span>People ({members?.length || 0})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('activities')}
              className={cn(
                'p-2 rounded-xl text-xs font-semibold flex items-center justify-center transition-all',
                activeTab === 'activities'
                  ? 'bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-md shadow-violet-950/50'
                  : 'text-slate-400 hover:text-white'
              )}
              title="Room Activity Feed"
            >
              <Activity className="w-3.5 h-3.5" />
            </button>
          </nav>

          {/* Active Tab Panel Body */}
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            {activeTab === 'queue' && (
              <div className="flex-1 flex flex-col min-h-0 h-full">
                <RoomSongQueue
                  queue={karaoke.queue}
                  currentItem={karaoke.currentItem}
                  currentUserId={currentUser?.id}
                  isHost={Boolean(isHost)}
                  canAddSongs={karaoke.canAddSongs}
                  isMutating={karaoke.isMutating}
                  onRemove={karaoke.removeFromQueue}
                  onReorder={karaoke.reorderQueue}
                  onOpenSearch={() => setIsSearchOpen(true)}
                  className="h-full"
                />
              </div>
            )}

            {activeTab === 'chat' && (
              <div className="flex-1 flex flex-col min-h-0 h-full">
                <RoomChatPanel
                  messages={chatMessages}
                  isLoading={isLoadingMessages}
                  isSending={isSendingChatMessage}
                  isHost={isHost}
                  currentUserId={currentUser?.id}
                  isChatEnabled={room.isChatEnabled !== false}
                  onSendMessage={sendMessage}
                  onDeleteMessage={deleteMessage}
                  onAddReaction={addReaction}
                  onRemoveReaction={removeReaction}
                />
              </div>
            )}

            {activeTab === 'people' && (
              <div className="flex-1 flex flex-col min-h-0 h-full">
                <RoomMemberList
                  roomId={roomId}
                  currentUserId={currentUser?.id}
                  members={members}
                  onlineUserIds={onlineUserIds}
                  isHost={isHost}
                  onKickMember={(userId, username) => setKickTarget({ userId, username })}
                  onRefresh={refreshState}
                  voiceParticipants={voice.participants}
                  currentSingerName={karaoke.currentSingerName}
                  currentSingerUserId={karaoke.currentItem?.requestedBy.id}
                  className="h-full border-0 bg-transparent p-0"
                />
              </div>
            )}

            {activeTab === 'activities' && (
              <div className="flex-1 flex flex-col min-h-0 h-full">
                <RoomActivityTimeline activities={activities} />
              </div>
            )}
          </div>
        </aside>
      </main>

      {/* Mobile Fixed Bottom Navigation Dock (Workstream B Mobile Architecture) */}
      <nav aria-label="Mobile lounge dock" className="lg:hidden fixed bottom-0 inset-x-0 bg-[#0b0e19]/95 backdrop-blur-xl border-t border-white/10 px-3 py-2 z-30 flex items-center justify-around pb-[max(0.5rem,env(safe-area-inset-bottom))] shadow-2xl">
        {/* Quick Mic Mute / Voice Connect */}
        <button
          type="button"
          onClick={voice.isConnected ? voice.toggleMute : voice.joinVoice}
          disabled={!isMember || voice.isConnecting}
          className={cn(
            'flex flex-col items-center gap-1 p-1.5 rounded-xl text-[10px] font-semibold transition-all',
            voice.isConnected
              ? voice.isMuted
                ? 'text-rose-400'
                : voice.isSpeaking
                ? 'text-emerald-300 animate-pulse'
                : 'text-emerald-400'
              : 'text-slate-400'
          )}
        >
          {voice.isConnected ? (
            voice.isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />
          ) : (
            <PhoneCall className="w-5 h-5" />
          )}
          <span>{voice.isConnected ? (voice.isMuted ? 'Muted' : 'Speaking') : 'Voice'}</span>
        </button>

        {/* Queue Drawer Button */}
        <button
          type="button"
          onClick={() => setMobileDrawer('queue')}
          className="flex flex-col items-center gap-1 p-1.5 text-slate-300 relative text-[10px] font-semibold"
        >
          <div className="relative">
            <ListMusic className="w-5 h-5" />
            {totalQueueCount > 0 && (
              <span className="absolute -top-1 -right-2 px-1 min-w-[14px] h-[14px] rounded-full bg-violet-600 text-white text-[9px] font-bold flex items-center justify-center">
                {totalQueueCount}
              </span>
            )}
          </div>
          <span>Queue</span>
        </button>

        {/* Chat Drawer Button */}
        <button
          type="button"
          onClick={() => setMobileDrawer('chat')}
          className="flex flex-col items-center gap-1 p-1.5 text-slate-300 relative text-[10px] font-semibold"
        >
          <div className="relative">
            <MessageSquare className="w-5 h-5" />
            {chatMessages.length > 0 && (
              <span className="absolute -top-1 -right-2 px-1 min-w-[14px] h-[14px] rounded-full bg-cyan-500 text-black text-[9px] font-bold flex items-center justify-center">
                {chatMessages.length}
              </span>
            )}
          </div>
          <span>Chat</span>
        </button>

        {/* People Drawer Button */}
        <button
          type="button"
          onClick={() => setMobileDrawer('people')}
          className="flex flex-col items-center gap-1 p-1.5 text-slate-300 relative text-[10px] font-semibold"
        >
          <div className="relative">
            <Users className="w-5 h-5" />
            {members && (
              <span className="absolute -top-1 -right-2 px-1 min-w-[14px] h-[14px] rounded-full bg-slate-700 text-white text-[9px] font-bold flex items-center justify-center">
                {members.length}
              </span>
            )}
          </div>
          <span>People</span>
        </button>

        {/* Activity Drawer Button */}
        <button
          type="button"
          onClick={() => setMobileDrawer('activities')}
          className="flex flex-col items-center gap-1 p-1.5 text-slate-300 text-[10px] font-semibold"
        >
          <Activity className="w-5 h-5" />
          <span>Activity</span>
        </button>
      </nav>

      {/* Mobile Slide-Over / Bottom Sheet Drawer */}
      {mobileDrawer && (
        <div className="lg:hidden fixed inset-0 z-50 flex flex-col justify-end">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/75 backdrop-blur-sm transition-opacity"
            onClick={() => setMobileDrawer(null)}
          />

          {/* Drawer Panel */}
          <div className="relative w-full max-h-[85vh] bg-[#0c1020] border-t border-white/15 rounded-t-3xl shadow-2xl flex flex-col p-4 z-10 animate-in slide-in-from-bottom duration-200 pb-[max(1rem,env(safe-area-inset-bottom))]">
            {/* Drawer Header & Handle */}
            <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-3 shrink-0">
              <div className="flex items-center gap-2">
                <span className="w-8 h-1 rounded-full bg-white/20 mx-auto block mb-1" />
                <h3 className="text-sm font-bold text-white capitalize flex items-center gap-1.5">
                  {mobileDrawer === 'queue' && <ListMusic className="w-4 h-4 text-violet-400" />}
                  {mobileDrawer === 'chat' && <MessageSquare className="w-4 h-4 text-cyan-400" />}
                  {mobileDrawer === 'people' && <Users className="w-4 h-4 text-emerald-400" />}
                  {mobileDrawer === 'activities' && <Activity className="w-4 h-4 text-amber-400" />}
                  <span>{mobileDrawer === 'people' ? 'People in Lounge' : mobileDrawer}</span>
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setMobileDrawer(null)}
                className="p-1 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300"
                title="Close drawer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Drawer Content Body */}
            <div className="flex-1 overflow-y-auto min-h-[300px]">
              {mobileDrawer === 'queue' && (
                <RoomSongQueue
                  queue={karaoke.queue}
                  currentItem={karaoke.currentItem}
                  currentUserId={currentUser?.id}
                  isHost={Boolean(isHost)}
                  canAddSongs={karaoke.canAddSongs}
                  isMutating={karaoke.isMutating}
                  onRemove={karaoke.removeFromQueue}
                  onReorder={karaoke.reorderQueue}
                  onOpenSearch={() => {
                    setMobileDrawer(null);
                    setIsSearchOpen(true);
                  }}
                />
              )}

              {mobileDrawer === 'chat' && (
                <RoomChatPanel
                  messages={chatMessages}
                  isLoading={isLoadingMessages}
                  isSending={isSendingChatMessage}
                  isHost={isHost}
                  currentUserId={currentUser?.id}
                  isChatEnabled={room.isChatEnabled !== false}
                  onSendMessage={sendMessage}
                  onDeleteMessage={deleteMessage}
                  onAddReaction={addReaction}
                  onRemoveReaction={removeReaction}
                />
              )}

              {mobileDrawer === 'people' && (
                <RoomMemberList
                  roomId={roomId}
                  currentUserId={currentUser?.id}
                  members={members}
                  onlineUserIds={onlineUserIds}
                  isHost={isHost}
                  onKickMember={(userId, username) => {
                    setMobileDrawer(null);
                    setKickTarget({ userId, username });
                  }}
                  onRefresh={refreshState}
                  voiceParticipants={voice.participants}
                  currentSingerName={karaoke.currentSingerName}
                  currentSingerUserId={karaoke.currentItem?.requestedBy.id}
                  className="border-0 bg-transparent p-0"
                />
              )}

              {mobileDrawer === 'activities' && (
                <RoomActivityTimeline activities={activities} />
              )}
            </div>
          </div>
        </div>
      )}

      {/* Leave Room Confirmation Dialog */}
      <LeaveRoomDialog
        isOpen={isLeaveDialogOpen}
        isPending={leaveMutation.isPending}
        roomName={room.name}
        onClose={() => setIsLeaveDialogOpen(false)}
        onConfirm={handleLeaveConfirm}
      />

      {/* Kick Member Confirmation Dialog */}
      <KickMemberDialog
        isOpen={Boolean(kickTarget)}
        targetUsername={kickTarget?.username || ''}
        isKicking={kickMutation.isPending}
        onConfirm={async (reason) => {
          if (kickTarget) {
            await kickMutation.mutateAsync({ userId: kickTarget.userId, reason });
            setKickTarget(null);
          }
        }}
        onCancel={() => setKickTarget(null)}
      />

      {/* Song Search & Queue Dialog */}
      <SongSearchDialog
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        onSelectSong={karaoke.addToQueue}
        isAddingSong={karaoke.isMutating}
        queueLength={karaoke.queue?.items?.length || 0}
        maxQueueSize={karaoke.queue?.maxQueueSize || 50}
      />

      {/* Room Identity & Lounge Info Dialog */}
      <RoomIdentityDialog
        room={room}
        host={host}
        totalOnline={totalOnline}
        voiceParticipantsCount={voice.participants.length}
        isOpen={isIdentityOpen}
        isHost={isHost}
        onClose={() => setIsIdentityOpen(false)}
        onOpenCustomization={() => setIsCustomizationOpen(true)}
      />

      {/* Host Room Customization Dialog */}
      {isHost && (
        <RoomCustomizationDialog
          room={room}
          stateVersion={roomStateVersion}
          isOpen={isCustomizationOpen}
          isSaving={updateRoomMutation.isPending}
          onClose={() => {
            atmosphere.clearPreview();
            setIsCustomizationOpen(false);
          }}
          onSave={async (updateData) => {
            await updateRoomMutation.mutateAsync({ roomId, data: updateData });
            refreshState();
          }}
          onPreviewPreset={atmosphere.setPreviewPreset}
          onResetPreview={atmosphere.clearPreview}
        />
      )}

      {/* Virtual Gift Selector Dialog (Sprint 3.4) */}
      <GiftSelectorDialog
        isOpen={isGiftSelectorOpen}
        onClose={() => setIsGiftSelectorOpen(false)}
        currentPerformer={karaoke.currentSinger}
        currentSongTitle={karaoke.currentItem?.song?.title}
        isCurrentSinger={karaoke.isCurrentSinger}
        isSending={virtualGifts.isSending}
        sendError={virtualGifts.sendError}
        onSendGift={virtualGifts.sendGift}
        onClearError={virtualGifts.clearError}
      />
    </div>
  );
}
