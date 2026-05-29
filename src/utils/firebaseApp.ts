import { initializeApp, getApp, getApps } from 'firebase/app';
import { firebaseConfig } from './firebase';

/** Instancia compartida para Functions sin duplicar initializeApp. */
export const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
