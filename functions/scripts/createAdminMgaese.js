/**
 * One-shot: crea cuenta admin mgaese08@gmail.com en Auth + Firestore.
 * Uso (desde /functions, con sesión firebase login):
 *   node scripts/createAdminMgaese.js
 */
const admin = require("firebase-admin");
const crypto = require("crypto");

const EMAIL = "mgaese08@gmail.com";
const NOMBRE = "Admin AG";
const PUESTO = "Administrativo";
const PROJECT_ID = "agg1-b7f40";

async function main() {
  if (!admin.apps.length) {
    admin.initializeApp({ projectId: PROJECT_ID });
  }
  const auth = admin.auth();
  const db = admin.firestore();

  let user;
  let createdAuth = false;
  try {
    user = await auth.getUserByEmail(EMAIL);
    console.log("Auth ya existía:", user.uid);
  } catch (err) {
    if (err.code !== "auth/user-not-found") throw err;
    const password = crypto.randomBytes(18).toString("base64url");
    user = await auth.createUser({
      email: EMAIL,
      emailVerified: false,
      password,
      displayName: NOMBRE,
      disabled: false,
    });
    createdAuth = true;
    console.log("Auth creada:", user.uid);
  }

  await db.collection("usuarios").doc(user.uid).set(
    {
      nombre: NOMBRE,
      name: NOMBRE,
      correo: EMAIL,
      email: EMAIL,
      puesto: PUESTO,
      role: PUESTO,
      activo: true,
      creado: admin.firestore.FieldValue.serverTimestamp(),
      creadoPor: "bootstrap-script",
    },
    { merge: true },
  );
  console.log("Perfil usuarios/" + user.uid + " listo (activo, " + PUESTO + ")");

  try {
    const link = await auth.generatePasswordResetLink(EMAIL);
    console.log("\nLink para poner contraseña:\n" + link + "\n");
  } catch (err) {
    console.warn("No se pudo generar link de reset:", err.message);
    console.log("Usa 'Olvidé mi contraseña' en el login con", EMAIL);
  }

  console.log(createdAuth ? "Listo: cuenta nueva." : "Listo: cuenta autorizada/actualizada.");
}

main().catch((err) => {
  console.error("Error:", err.message || err);
  process.exit(1);
});
