import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type Space = 'work' | 'personal'

interface AppStore {
  space: Space
  setSpace: (s: Space) => void
}

export const useAppStore = create<AppStore>()(
  persist(
    (set) => ({
      space: 'work',
      setSpace: (space) => set({ space }),
    }),
    { name: 'meeting-assistant-store' },
  ),
)
