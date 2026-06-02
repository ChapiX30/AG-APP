import * as functions from "firebase-functions/v1";
import * as admin from "firebase-admin";

const SIGNED_URL_TTL_MS = 15 * 60 * 1000;

const VIEW_ROLE_TOKENS = [
    "calidad",
    "quality",
    "admin",
    "gerente",
    "manager",
    "metrologo",
    "tecnico",
    "logistica",
];

const QUALITY_EMAIL_ALLOWLIST = ["eaaese07@gmail.com"];

/** Alineado con certificateAccess.ts (cliente): minúsculas sin acentos. */
function normalizeRoleText(puesto?: string, role?: string): string {
    return `${puesto || ""} ${role || ""}`
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
}

function canViewPatronCertificate(puesto: string, role: string, email: string): boolean {
    const normalizedEmail = (email || "").toLowerCase();
    if (QUALITY_EMAIL_ALLOWLIST.includes(normalizedEmail)) return true;
    const text = normalizeRoleText(puesto, role);
    return VIEW_ROLE_TOKENS.some((token) => text.includes(token));
}

function extractStoragePathFromDownloadUrl(url: string): string | null {
    try {
        const parsed = new URL(url);
        const match = parsed.pathname.match(/\/o\/(.+)$/);
        if (!match?.[1]) return null;
        return decodeURIComponent(match[1]);
    } catch {
        return null;
    }
}

function isPatronCertificateStoragePath(storagePath: string): boolean {
    const parts = storagePath.split("/").filter(Boolean);
    if (parts.length < 3 || parts.length > 4) return false;
    return parts[0] === "calibraciones" || parts[0] === "certificados";
}

function resolveCertificatePath(
    patronId: string,
    data: FirebaseFirestore.DocumentData | undefined
): string | null {
    const storagePath = typeof data?.certificadoStoragePath === "string"
        ? data.certificadoStoragePath.trim()
        : "";
    if (storagePath) {
        return storagePath;
    }
    const legacyUrl = typeof data?.certificadoUrl === "string" ? data.certificadoUrl.trim() : "";
    if (!legacyUrl) return null;
    return extractStoragePathFromDownloadUrl(legacyUrl);
}

export const getPatronCertificadoUrl = functions.https.onCall(async (data, context) => {
    if (!context.auth?.uid) {
        throw new functions.https.HttpsError("unauthenticated", "Debe iniciar sesión.");
    }

    const patronId = typeof data?.patronId === "string" ? data.patronId.trim() : "";
    if (!patronId) {
        throw new functions.https.HttpsError("invalid-argument", "patronId requerido.");
    }

    const db = admin.firestore();
    const userSnap = await db.collection("usuarios").doc(context.auth.uid).get();
    if (!userSnap.exists) {
        throw new functions.https.HttpsError("permission-denied", "Perfil de usuario no encontrado.");
    }

    const userData = userSnap.data() || {};
    const email = (context.auth.token.email || userData.email || "").toString();
    if (!canViewPatronCertificate(userData.puesto, userData.role, email)) {
        throw new functions.https.HttpsError("permission-denied", "Sin permiso para ver certificados.");
    }

    const patronSnap = await db.collection("patronesCalibracion").doc(patronId).get();
    if (!patronSnap.exists) {
        throw new functions.https.HttpsError("not-found", "Patrón no encontrado.");
    }

    const storagePath = resolveCertificatePath(patronId, patronSnap.data());
    if (!storagePath || !isPatronCertificateStoragePath(storagePath)) {
        throw new functions.https.HttpsError("failed-precondition", "No hay certificado asociado.");
    }

    const bucket = admin.storage().bucket();
    const file = bucket.file(storagePath);
    const [exists] = await file.exists();
    if (!exists) {
        throw new functions.https.HttpsError("not-found", "Archivo de certificado no encontrado.");
    }

    const expiresAt = Date.now() + SIGNED_URL_TTL_MS;
    const [url] = await file.getSignedUrl({
        action: "read",
        expires: expiresAt,
    });

    await db.collection("certificadoAccesos").add({
        patronId,
        storagePath,
        userId: context.auth.uid,
        userEmail: email,
        action: "view",
        at: admin.firestore.FieldValue.serverTimestamp(),
    });

    return {
        url,
        expiresInSeconds: Math.floor(SIGNED_URL_TTL_MS / 1000),
    };
});
