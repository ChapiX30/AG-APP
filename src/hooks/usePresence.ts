import { useCallback, useEffect } from 'react';
import { differenceInMinutes, isValid } from 'date-fns';
import { doc, serverTimestamp, setDoc, Timestamp } from 'firebase/firestore';
import { db } from '../utils/firebase';

/** How often the current client writes lastActive while the tab is visible. */
export const PRESENCE_HEARTBEAT_MS = 60_000;

/** A user is considered in-app if lastActive is within this window. */
export const PRESENCE_ONLINE_MINUTES = 3;

export function isUserOnline(
  lastActive: Timestamp | Date | null | undefined,
  now: Date = new Date()
): boolean {
  if (!lastActive) return false;
  const date =
    lastActive instanceof Timestamp
      ? lastActive.toDate()
      : lastActive instanceof Date
        ? lastActive
        : null;
  if (!date || !isValid(date)) return false;
  return differenceInMinutes(now, date) <= PRESENCE_ONLINE_MINUTES;
}

/** Writes lastActive to Firestore while the user has the app open (any screen). */
export function usePresence(uid: string | undefined) {
  const ping = useCallback(async () => {
    if (!uid || document.visibilityState !== 'visible') return;
    try {
      await setDoc(doc(db, 'usuarios', uid), { lastActive: serverTimestamp() }, { merge: true });
    } catch {
      /* offline or permission — ignore */
    }
  }, [uid]);

  useEffect(() => {
    if (!uid) return;

    void ping();
    const intervalId = window.setInterval(() => void ping(), PRESENCE_HEARTBEAT_MS);

    const onVisible = () => {
      if (document.visibilityState === 'visible') void ping();
    };
    const onFocus = () => void ping();

    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onFocus);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onFocus);
    };
  }, [uid, ping]);
}
