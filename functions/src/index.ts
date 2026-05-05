import * as functions from "firebase-functions/v1";
import * as admin from "firebase-admin";

// 1. Intentamos leer la variable que configuraste en Vercel
const serviceAccountVar = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;

if (!admin.apps.length) {
  if (serviceAccountVar) {
    // 2. Si la variable existe (Producción), la usamos para autenticar
    admin.initializeApp({
      credential: admin.credential.cert(JSON.parse(serviceAccountVar))
    });
  } else {
    // 3. Si no hay variable (Local), inicializamos con credenciales por defecto
    // Esto requiere que hayas hecho 'firebase login' en tu terminal
    admin.initializeApp();
  }
}

const db = admin.firestore();