export interface RecentEntry {
  slug: string;
  title: string;
  url: string;
  category?: string;
  visitedAt: number;
}

export interface ReaderState {
  favorites: string[];
  recents: RecentEntry[];
  progress: Record<string, number>;
  expandedFolders: string[];
  searchHistory: string[];
  fontScale: number;
}

export const READER_STATE_KEY = 'nite.reader-state.v1';
export const READER_STATE_EVENT = 'nite:reader-state';

const DEFAULT_STATE: ReaderState = {
  favorites: [],
  recents: [],
  progress: {},
  expandedFolders: [],
  searchHistory: [],
  fontScale: 1,
};

export function readReaderState(): ReaderState {
  if (typeof window === 'undefined') return { ...DEFAULT_STATE };
  try {
    const parsed = JSON.parse(localStorage.getItem(READER_STATE_KEY) ?? '{}') as Partial<ReaderState>;
    return {
      favorites: Array.isArray(parsed.favorites) ? parsed.favorites : [],
      recents: Array.isArray(parsed.recents) ? parsed.recents.slice(0, 24) : [],
      progress: parsed.progress && typeof parsed.progress === 'object' ? parsed.progress : {},
      expandedFolders: Array.isArray(parsed.expandedFolders) ? parsed.expandedFolders : [],
      searchHistory: Array.isArray(parsed.searchHistory) ? parsed.searchHistory.slice(0, 8) : [],
      fontScale: typeof parsed.fontScale === 'number' ? parsed.fontScale : 1,
    };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

export function writeReaderState(next: ReaderState): ReaderState {
  if (typeof window === 'undefined') return next;
  try {
    localStorage.setItem(READER_STATE_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent(READER_STATE_EVENT, { detail: next }));
  } catch {
    // Private browsing and quota errors should never block reading.
  }
  return next;
}

export function updateReaderState(update: (state: ReaderState) => ReaderState): ReaderState {
  return writeReaderState(update(readReaderState()));
}

export function clearReaderState(): ReaderState {
  return writeReaderState({ ...DEFAULT_STATE });
}
