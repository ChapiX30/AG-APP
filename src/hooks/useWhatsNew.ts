import { useCallback, useEffect, useState } from 'react';
import type { AppUpdate } from '../config/appUpdates';
import { getNextPendingUpdate, markUpdateSeen } from '../utils/appUpdatesStorage';

export function useWhatsNew(
  uid: string | undefined,
  user?: { role?: string; puesto?: string } | null,
  allUpdates?: AppUpdate[],
) {
  const [update, setUpdate] = useState<AppUpdate | null>(null);

  useEffect(() => {
    if (!uid) {
      setUpdate(null);
      return;
    }
    setUpdate(getNextPendingUpdate(uid, user, allUpdates));
  }, [uid, user?.role, user?.puesto, allUpdates]);

  const dismiss = useCallback(() => {
    if (!uid || !update) return;
    markUpdateSeen(uid, update.id);
    setUpdate(getNextPendingUpdate(uid, user, allUpdates));
  }, [uid, update, user, allUpdates]);

  return { update, dismiss };
}
