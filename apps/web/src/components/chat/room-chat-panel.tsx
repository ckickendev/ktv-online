'use client';

import React, { useState, useRef, useEffect } from 'react';
import {
  Send,
  Trash2,
  Smile,
  ShieldAlert,
  ArrowDown,
  Info,
  Clock,
  Sparkles,
} from 'lucide-react';
import {
  ChatMessageDto,
  SUPPORTED_REACTION_EMOJIS,
  SupportedReactionEmoji,
} from '@ktv/contracts';
import { cn } from '@/lib/utils';

export interface RoomChatPanelProps {
  messages: ChatMessageDto[];
  isLoading: boolean;
  isSending: boolean;
  isHost: boolean;
  currentUserId?: string;
  isChatEnabled?: boolean;
  onSendMessage: (content: string) => Promise<boolean>;
  onDeleteMessage: (messageId: string) => Promise<boolean>;
  onAddReaction: (messageId: string, emoji: SupportedReactionEmoji) => void;
  onRemoveReaction: (messageId: string, emoji: SupportedReactionEmoji) => void;
}

export function RoomChatPanel({
  messages,
  isLoading,
  isSending,
  isHost,
  currentUserId,
  isChatEnabled = true,
  onSendMessage,
  onDeleteMessage,
  onAddReaction,
  onRemoveReaction,
}: RoomChatPanelProps) {
  const [inputText, setInputText] = useState('');
  const [activeReactionPickerMessageId, setActiveReactionPickerMessageId] = useState<string | null>(null);
  const [showScrollBottom, setShowScrollBottom] = useState(false);
  const [deleteConfirmMessageId, setDeleteConfirmMessageId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages if user is already near bottom
  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  };

  useEffect(() => {
    if (!showScrollBottom) {
      scrollToBottom('smooth');
    }
  }, [messages.length, showScrollBottom]);

  const handleScroll = () => {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    const isNearBottom = scrollHeight - scrollTop - clientHeight < 120;
    setShowScrollBottom(!isNearBottom);
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || isSending || (!isChatEnabled && !isHost)) return;

    const text = inputText;
    setInputText('');
    const success = await onSendMessage(text);
    if (!success) {
      setInputText(text); // restore if send failed
    } else {
      scrollToBottom('smooth');
    }
  };

  const handleReactionClick = (
    messageId: string,
    emoji: SupportedReactionEmoji,
    reactedUserIds: string[]
  ) => {
    const hasReacted = Boolean(currentUserId && reactedUserIds.includes(currentUserId));
    if (hasReacted) {
      onRemoveReaction(messageId, emoji);
    } else {
      onAddReaction(messageId, emoji);
    }
    setActiveReactionPickerMessageId(null);
  };

  const formatTimestamp = (isoDate: string) => {
    try {
      const d = new Date(isoDate);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-900/60 rounded-xl border border-slate-800/80 overflow-hidden relative">
      {/* Header Info */}
      <div className="px-4 py-2.5 bg-slate-800/40 border-b border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
        <div className="flex items-center gap-1.5 font-medium text-slate-300">
          <Sparkles className="w-3.5 h-3.5 text-pink-400" />
          <span>Lounge Chat</span>
        </div>
        <div className="flex items-center gap-2">
          {!isChatEnabled && (
            <span className="flex items-center gap-1 text-amber-400 font-medium">
              <ShieldAlert className="w-3.5 h-3.5" />
              Chat Disabled by Host
            </span>
          )}
          <span>{messages.length} messages</span>
        </div>
      </div>

      {/* Messages Viewport */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto p-4 space-y-3.5 scrollbar-thin scrollbar-thumb-slate-700/50"
      >
        {isLoading && (
          <div className="flex items-center justify-center py-8 text-slate-500 text-xs gap-2">
            <Clock className="w-4 h-4 animate-spin text-pink-500" />
            <span>Loading message history...</span>
          </div>
        )}

        {!isLoading && messages.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-center text-slate-500">
            <Info className="w-8 h-8 text-slate-600 mb-2" />
            <p className="text-sm font-medium text-slate-400">No messages yet</p>
            <p className="text-xs text-slate-500 mt-1">Be the first to say hello to the lounge!</p>
          </div>
        )}

        {messages.map((message) => {
          const isMe = currentUserId && message.senderId === currentUserId;
          const isSystem = message.messageType === 'system';
          const isMsgHost = message.senderRole === 'host';

          if (isSystem) {
            return (
              <div key={message.id} className="flex justify-center my-2">
                <div className="bg-slate-800/70 border border-slate-700/50 rounded-full px-3 py-1 text-xs text-pink-400/90 flex items-center gap-1.5 shadow-sm">
                  <Sparkles className="w-3 h-3 text-pink-400" />
                  <span>{message.content}</span>
                  <span className="text-[10px] text-slate-500 ml-1">
                    {formatTimestamp(message.createdAt)}
                  </span>
                </div>
              </div>
            );
          }

          return (
            <div
              key={message.id}
              className={cn(
                'group flex flex-col relative',
                isMe ? 'items-end' : 'items-start'
              )}
            >
              {/* Sender Name & Timestamp */}
              <div className="flex items-center gap-1.5 mb-1 px-1 text-[11px] text-slate-400">
                <span
                  className={cn(
                    'font-medium',
                    isMsgHost ? 'text-amber-400' : isMe ? 'text-pink-400' : 'text-slate-300'
                  )}
                >
                  {message.senderUsername}
                </span>
                {isMsgHost && (
                  <span className="bg-amber-500/10 text-amber-400 border border-amber-500/30 text-[9px] px-1 py-0.2 rounded font-semibold">
                    HOST
                  </span>
                )}
                <span className="text-slate-500 text-[10px]">
                  {formatTimestamp(message.createdAt)}
                </span>
              </div>

              {/* Message Bubble */}
              <div className="relative max-w-[85%] flex items-center gap-2">
                <div
                  className={cn(
                    'rounded-2xl px-3.5 py-2 text-sm leading-relaxed shadow-sm break-words',
                    message.isDeleted
                      ? 'bg-slate-800/40 text-slate-500 italic border border-slate-700/40'
                      : isMe
                      ? 'bg-gradient-to-br from-pink-600 to-rose-600 text-white rounded-tr-none'
                      : 'bg-slate-800/80 text-slate-200 border border-slate-700/60 rounded-tl-none'
                  )}
                >
                  {message.content}
                </div>

                {/* Host Moderation: Delete button */}
                {isHost && !message.isDeleted && (
                  <button
                    onClick={() => setDeleteConfirmMessageId(message.id)}
                    title="Delete message (Host)"
                    className="opacity-0 group-hover:opacity-100 transition-opacity p-1 text-slate-500 hover:text-red-400 rounded hover:bg-slate-800"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}

                {/* Reaction Picker Button */}
                {!message.isDeleted && (
                  <button
                    onClick={() =>
                      setActiveReactionPickerMessageId(
                        activeReactionPickerMessageId === message.id ? null : message.id
                      )
                    }
                    title="React"
                    className="opacity-0 group-hover:opacity-100 transition-opacity p-1 text-slate-400 hover:text-amber-400 rounded hover:bg-slate-800"
                  >
                    <Smile className="w-3.5 h-3.5" />
                  </button>
                )}

                {/* Emoji Reaction Popover */}
                {activeReactionPickerMessageId === message.id && (
                  <div
                    className={cn(
                      'absolute -top-10 z-20 bg-slate-800 border border-slate-700 rounded-full px-2 py-1 flex items-center gap-1 shadow-xl animate-in fade-in zoom-in-95',
                      isMe ? 'right-0' : 'left-0'
                    )}
                  >
                    {SUPPORTED_REACTION_EMOJIS.map((emoji) => (
                      <button
                        key={emoji}
                        onClick={() =>
                          handleReactionClick(
                            message.id,
                            emoji,
                            message.reactions.find((r) => r.emoji === emoji)?.userIds || []
                          )
                        }
                        className="p-1 hover:scale-125 transition-transform text-sm leading-none"
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Reaction Badges */}
              {message.reactions && message.reactions.length > 0 && !message.isDeleted && (
                <div className="flex flex-wrap gap-1 mt-1 px-1">
                  {message.reactions.map((reaction) => {
                    const hasMyReaction = Boolean(
                      currentUserId && reaction.userIds.includes(currentUserId)
                    );
                    return (
                      <button
                        key={reaction.emoji}
                        onClick={() =>
                          handleReactionClick(message.id, reaction.emoji, reaction.userIds)
                        }
                        className={cn(
                          'flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border transition-all text-slate-300',
                          hasMyReaction
                            ? 'bg-pink-500/20 border-pink-500/50 text-pink-300 font-semibold'
                            : 'bg-slate-800/80 border-slate-700 hover:bg-slate-700/80'
                        )}
                      >
                        <span>{reaction.emoji}</span>
                        <span className="text-[10px]">{reaction.count}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        <div ref={messagesEndRef} />
      </div>

      {/* Scroll to Bottom Button */}
      {showScrollBottom && (
        <button
          onClick={() => scrollToBottom('smooth')}
          className="absolute bottom-16 right-4 z-10 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 p-2 rounded-full shadow-lg transition-transform hover:scale-105"
        >
          <ArrowDown className="w-4 h-4 text-pink-400" />
        </button>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmMessageId && (
        <div className="absolute inset-0 bg-slate-950/80 z-30 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 max-w-xs w-full text-center space-y-3">
            <Trash2 className="w-8 h-8 text-red-400 mx-auto" />
            <h4 className="text-sm font-semibold text-slate-200">Delete Message?</h4>
            <p className="text-xs text-slate-400">
              As host, this message will be deleted for all participants.
            </p>
            <div className="flex gap-2 justify-center pt-1">
              <button
                onClick={() => setDeleteConfirmMessageId(null)}
                className="px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200 bg-slate-800 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  const id = deleteConfirmMessageId;
                  setDeleteConfirmMessageId(null);
                  await onDeleteMessage(id);
                }}
                className="px-3 py-1.5 text-xs text-white bg-red-600 hover:bg-red-500 rounded-lg font-medium"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Chat Input Form */}
      <form onSubmit={handleSend} className="p-3 bg-slate-800/40 border-t border-slate-800/80">
        {!isChatEnabled && !isHost ? (
          <div className="text-center py-2 text-xs text-slate-500 flex items-center justify-center gap-1.5">
            <ShieldAlert className="w-4 h-4 text-amber-500" />
            <span>Chat is currently disabled by the room host.</span>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Send a message to the lounge..."
              maxLength={1000}
              disabled={isSending}
              className="flex-1 bg-slate-950/80 border border-slate-700/80 rounded-xl px-3.5 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-pink-500 focus:border-pink-500 transition-all disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={!inputText.trim() || isSending}
              className="bg-gradient-to-r from-pink-600 to-rose-600 hover:from-pink-500 hover:to-rose-500 text-white p-2.5 rounded-xl shadow-md disabled:opacity-40 transition-all hover:scale-105 active:scale-95"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        )}
      </form>
    </div>
  );
}
