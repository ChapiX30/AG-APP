import { doc, setDoc, updateDoc } from 'firebase/firestore';
import { db } from './firebase';

export type FcmPlatform = 'web' | 'android';

const STORAGE_KEY: Record<FcmPlatform, string> = {
  web: 'fcmToken',
  android: 'fcmTokenAndroid',
};

/** Guarda token FCM sin borrar tokens de otros dispositivos (web + tablets). */
export async function registerFcmToken(
  uid: string,
  email: string | null,
  token: string,
  platform: FcmPlatform
): Promise<void> {
  if (!uid || !token) return;

  const storageKey = STORAGE_KEY[platform];
  const prev = localStorage.getItem(storageKey);
  const now = new Date().toISOString();

  const updates: Record<string, unknown> = {
    [`fcmTokens.${token}`]: true,
    fcmToken: token,
    email: email || null,
    lastTokenUpdate: now,
    [`lastTokenUpdate_${platform}`]: now,
  };

  if (prev && prev !== token) {
    updates[`fcmTokens.${prev}`] = false;
  }

  const ref = doc(db, 'usuarios', uid);
  try {
    await updateDoc(ref, updates);
  } catch {
    const fcmTokens: Record<string, boolean> = { [token]: true };
    if (prev && prev !== token) fcmTokens[prev] = false;
    await setDoc(
      ref,
      {
        fcmTokens,
        fcmToken: token,
        email: email || null,
        lastTokenUpdate: now,
        [`lastTokenUpdate_${platform}`]: now,
      },
      { merge: true }
    );
  }

  localStorage.setItem(storageKey, token);
}
