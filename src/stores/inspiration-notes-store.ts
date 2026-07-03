import { create } from "zustand"
import { useWikiStore } from "@/stores/wiki-store"
import {
  loadInspirationNotes,
  saveInspirationNotes,
  type InspirationNote,
} from "@/lib/inspiration-notes"

interface InspirationNotesState {
  notes: InspirationNote[]
  activeNoteId: string | null
  panelOpen: boolean
  loaded: boolean

  setPanelOpen: (open: boolean) => void
  setActiveNote: (id: string | null) => void
  loadFromDisk: () => Promise<void>
  saveToDisk: () => Promise<void>
  addNote: (content: string) => string
  updateNote: (id: string, content: string) => void
  deleteNote: (id: string) => void
}

function getProjectPath(): string | null {
  return useWikiStore.getState().project?.path ?? null
}

export const useInspirationNotesStore = create<InspirationNotesState>((set, get) => ({
  notes: [],
  activeNoteId: null,
  panelOpen: false,
  loaded: false,

  setPanelOpen: (open) => set({ panelOpen: open }),

  setActiveNote: (id) => set({ activeNoteId: id }),

  loadFromDisk: async () => {
    const projectPath = getProjectPath()
    if (!projectPath) {
      set({ notes: [], loaded: true })
      return
    }
    try {
      const notes = await loadInspirationNotes(projectPath)
      set({ notes, loaded: true })
    } catch {
      set({ loaded: true })
    }
  },

  saveToDisk: async () => {
    const projectPath = getProjectPath()
    if (!projectPath) return
    try {
      await saveInspirationNotes(projectPath, get().notes)
    } catch {
      // Ignore save errors silently
    }
  },

  addNote: (content) => {
    const trimmed = content.trim()
    const now = Date.now()
    const note: InspirationNote = {
      id: crypto.randomUUID(),
      createdAt: now,
      updatedAt: now,
      content: trimmed,
    }
    set((s) => ({ notes: [note, ...s.notes], activeNoteId: note.id }))
    void get().saveToDisk()
    return note.id
  },

  updateNote: (id, content) => {
    set((s) => ({
      notes: s.notes.map((note) =>
        note.id === id ? { ...note, content, updatedAt: Date.now() } : note,
      ),
    }))
    void get().saveToDisk()
  },

  deleteNote: (id) => {
    set((s) => ({
      notes: s.notes.filter((note) => note.id !== id),
      activeNoteId: s.activeNoteId === id ? null : s.activeNoteId,
    }))
    void get().saveToDisk()
  },
}))
