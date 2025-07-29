// src/utils/firebase.ts
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyCOsmnfM950uNrUnCjQsRtAc2jiUESYxqI",
  authDomain: "agg1-b7f40.firebaseapp.com",
  projectId: "agg1-b7f40",
  storageBucket: "agg1-b7f40.firebasestorage.app",
  messagingSenderId: "985878845659",
  appId: "1:985878845659:web:6639e7da9d82ffcaae94fe",
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
