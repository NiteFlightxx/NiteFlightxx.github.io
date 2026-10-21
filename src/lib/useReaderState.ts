import { useEffect, useState } from 'react';
import { readReaderState, READER_STATE_EVENT, type ReaderState } from './readerState';

/** Deterministic SSR output; browser-only state is read after mount. */
export function useReaderState(): ReaderState {
  const [reader, setReader] = useState<ReaderState>({
    favorites: [], recents: [], progress: {}, expandedFolders: [], searchHistory: [], fontScale: 1,
  });
  useEffect(() => {
    const sync = () => setReader(readReaderState());
    sync();
    window.addEventListener(READER_STATE_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(READER_STATE_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);
  return reader;
}
