import * as functions from "firebase-functions/v1";
import * as admin from "firebase-admin";

// Intentamos leer la variable de entorno de Vercel
const serviceAccountVar = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;

if (!admin.apps.length) {
  if (serviceAccountVar) {
    // Si estamos en Vercel, usamos la variable (JSON puro)
    admin.initializeApp({
      credential: admin.credential.cert(JSON.parse(serviceAccountVar))
    });
  } else {
    // Si estás trabajando local, inicializa con las credenciales por defecto 
    // (Asegúrate de haber corrido 'firebase login' en tu terminal)
    admin.initializeApp();
  }
}

const db = admin.firestore();