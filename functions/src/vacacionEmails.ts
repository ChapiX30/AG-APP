import * as functions from "firebase-functions/v1";

/** Correos RH / administración (siempre en copia de avisos importantes). */
export const VACATION_RH_EMAILS = [
    "eseagmaster@gmail.com",
    "admin@ese-ag.mx",
];

export type VacationMailStep = "calidad" | "edgar" | "jorge";

function normalizeName(value: string): string {
    return value
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
}

function userEmail(data: FirebaseFirestore.DocumentData): string {
    return String(data.email || data.correo || "").trim().toLowerCase();
}

export function getRhEmailsFromConfig(): string[] {
    const cfg = (functions.config().vacaciones || {}) as Record<string, string>;
    const env = String(process.env.VACACIONES_RH_EMAILS || cfg.rh_emails || "").trim();
    const fromEnv = env
        ? env.split(/[,;]+/).map((e) => e.trim().toLowerCase()).filter(Boolean)
        : [];
    const merged = [...new Set([...VACATION_RH_EMAILS, ...fromEnv])];
    return merged;
}

export function resolveRhEmailsFromDoc(data: FirebaseFirestore.DocumentData): string[] {
    const list = data.correosRh;
    if (Array.isArray(list) && list.length > 0) {
        return [...new Set(list.map((e) => String(e).trim().toLowerCase()).filter(Boolean))];
    }
    const single = String(data.correoRh || data.destinatarioEmail || "").trim();
    if (single.includes(",") || single.includes(";")) {
        return [
            ...new Set(
                single
                    .split(/[,;]+/)
                    .map((e) => e.trim().toLowerCase())
                    .filter(Boolean),
            ),
        ];
    }
    if (single) return [single.toLowerCase()];
    return getRhEmailsFromConfig();
}

export function approverHintsForStep(step: VacationMailStep): string[] {
    switch (step) {
        case "calidad":
            return ["viridiana moreno", "viridiana"];
        case "edgar":
            return ["edgar amador", "edgar"];
        case "jorge":
            return ["jorge amador", "jorge"];
        default:
            return [];
    }
}

export function isCalidadApproverUser(data: FirebaseFirestore.DocumentData): boolean {
    const role = normalizeName(String(data.puesto || data.role || ""));
    const name = normalizeName(String(data.name || data.nombre || ""));
    return role.includes("calidad") || (name.includes("viridiana") && name.includes("moreno"));
}

function isEdgarUser(data: FirebaseFirestore.DocumentData): boolean {
    const name = normalizeName(String(data.name || data.nombre || ""));
    const email = userEmail(data);
    return (
        name === "edgar amador" ||
        (name.includes("edgar") && name.includes("amador")) ||
        (email.includes("edgar") && (email.includes("amador") || email.includes("eaaese")))
    );
}

function isJorgeUser(data: FirebaseFirestore.DocumentData): boolean {
    const name = normalizeName(String(data.name || data.nombre || ""));
    const email = userEmail(data);
    return (
        name === "jorge amador" ||
        (name.includes("jorge") && name.includes("amador")) ||
        email.includes("jorge")
    );
}

/** Solo el autorizador del paso actual (sin RH ni otros). */
export function collectApproverEmailsFromUsers(
    users: FirebaseFirestore.DocumentData[],
    step: VacationMailStep,
): string[] {
    const emails: string[] = [];

    for (const data of users) {
        const email = userEmail(data);
        if (!email) continue;

        if (step === "calidad") {
            if (isCalidadApproverUser(data) && !isEdgarUser(data) && !isJorgeUser(data)) {
                emails.push(email);
            }
            continue;
        }
        if (step === "edgar") {
            if (isEdgarUser(data) && !isJorgeUser(data)) emails.push(email);
            continue;
        }
        if (step === "jorge") {
            if (isJorgeUser(data) && !isEdgarUser(data)) emails.push(email);
        }
    }

    return [...new Set(emails)];
}

export function uniqueEmails(...groups: (string | string[])[]): string[] {
    const out: string[] = [];
    for (const g of groups) {
        const arr = Array.isArray(g) ? g : [g];
        for (const e of arr) {
            const x = String(e || "").trim().toLowerCase();
            if (x && x.includes("@")) out.push(x);
        }
    }
    return [...new Set(out)];
}
