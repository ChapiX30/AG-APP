import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { AppUpdate } from '../config/appUpdates';
import { APP_UPDATES } from '../config/appUpdates';
import { useAuth } from './useAuth';
import { mergeAppUpdates, subscribeAppNovedades } from '../utils/appNovedades';

type AppUpdatesContextValue = {
  allUpdates: AppUpdate[];
  loading: boolean;
};

const AppUpdatesContext = createContext<AppUpdatesContextValue>({
  allUpdates: APP_UPDATES,
  loading: true,
});

export function AppUpdatesProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  const [firestoreUpdates, setFirestoreUpdates] = useState<AppUpdate[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isAuthenticated) {
      setFirestoreUpdates([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const unsub = subscribeAppNovedades((rows) => {
      setFirestoreUpdates(rows);
      setLoading(false);
    });
    return () => {
      unsub();
      setFirestoreUpdates([]);
    };
  }, [isAuthenticated]);

  const allUpdates = useMemo(
    () => mergeAppUpdates(firestoreUpdates),
    [firestoreUpdates],
  );

  const value = useMemo(() => ({ allUpdates, loading }), [allUpdates, loading]);

  return (
    <AppUpdatesContext.Provider value={value}>{children}</AppUpdatesContext.Provider>
  );
}

export function useAppUpdates(): AppUpdatesContextValue {
  return useContext(AppUpdatesContext);
}
