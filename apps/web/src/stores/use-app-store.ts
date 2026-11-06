import { create } from 'zustand';

interface AppState {
  sidebarOpen: boolean;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  
  // Audio & microphone controls
  isMuted: boolean;
  toggleMute: () => void;
  volume: number;
  setVolume: (val: number) => void;
  
  // Current active room placeholder state
  activeRoomId: string | null;
  setActiveRoomId: (id: string | null) => void;
}

export const useAppStore = create<AppState>((set) => ({
  sidebarOpen: false,
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),

  isMuted: false,
  toggleMute: () => set((state) => ({ isMuted: !state.isMuted })),
  volume: 80,
  setVolume: (volume) => set({ volume }),

  activeRoomId: null,
  setActiveRoomId: (activeRoomId) => set({ activeRoomId }),
}));
