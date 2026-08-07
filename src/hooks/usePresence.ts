import { useCallback, useEffect, useRef } from 'react';
import { differenceInMinutes, isValid } from 'date-fns';
import { doc, serverTimestamp, setDoc, Timestamp } from 'firebase/firestore';
import { db } from '../utils/firebase';

/** How often the current client writes lastActive while the tab is visible. */
export const PRESENCE_HEARTBEAT_MS = 120_000;

/** A user is considered in-app if lastActive is within this window ( > heartbeat). */
export const PRESENCE_ONLINE_MINUTES = 5;

/** Screens that count as "busy" in the Personal widget. */
const BUSY_SCREEN_ACTIVITY: Record<string, 'consecutivos' | 'hoja'> = {
  consecutivos: 'consecutivos',
  'magnitude-detail': 'consecutivos',
  'work-sheet': 'hoja',
};

export type PresenceActivity = 'consecutivos' | 'hoja' | null;

export function presenceActivityFromScreen(screen?: string | null): PresenceActivity {
  if (!screen) return null;
  return BUSY_SCREEN_ACTIVITY[screen] ?? null;
}

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

/**
 * Writes lastActive (+ optional presenceActivity) to Firestore while the user
 * has the app open. Activity clears when leaving busy screens or on unmount.
 */
export function usePresence(uid: string | undefined, currentScreen?: string | null) {
  const activity = presenceActivityFromScreen(currentScreen);
  const activityRef = useRef<PresenceActivity>(activity);
  activityRef.current = activity;

  const ping = useCallback(async () => {
    if (!uid || document.visibilityState !== 'visible') return;
    try {
      await setDoc(
        doc(db, 'usuarios', uid),
        {
          lastActive: serverTimestamp(),
          presenceActivity: activityRef.current,
        },
        { merge: true }
      );
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
      void setDoc(
        doc(db, 'usuarios', uid),
        { presenceActivity: null },
        { merge: true }
      ).catch(() => {
        /* ignore */
      });
    };
  }, [uid, ping]);

  // Push activity immediately when navigating to/from busy screens.
  useEffect(() => {
    if (!uid) return;
    void ping();
  }, [uid, activity, ping]);
}
