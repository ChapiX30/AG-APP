import * as admin from "firebase-admin";

/** Vigilante PJLA; cheerio y fetch solo al ejecutar la función. */
export async function runCheckPJLAUpdates(): Promise<void> {
    const fetch = require("node-fetch");
    const cheerio = require("cheerio");

    try {
        const db = admin.firestore();
        const col = db.collection("servicios");
        const updates: { title: string; url: string; category: string }[] = [];

        const res = await fetch("https://www.pjlabs.com/resources/pjla-updates");
        const html = await res.text();
        const $ = cheerio.load(html);

        $("a[href*=\"Update_\"], a[href*=\".pdf\"]").slice(0, 2).each((_: number, el: any) => {
            const href = $(el).attr("href") ?? "";
            const title = $(el).text().trim() || $(el).attr("title") || "Actualización PJLA";
            if (href && title) {
                updates.push({
                    title,
                    url: href.startsWith("http") ? href : `https://www.pjlabs.com${href}`,
                    category: href.includes("newsletter") ? "newsletter" : "update",
                });
            }
        });

        const resMx = await fetch("https://www.pjlabs.mx/news-events");
        const htmlMx = await resMx.text();
        const $mx = cheerio.load(htmlMx);

        $mx("a[href*=\".pdf\"]").slice(0, 2).each((_: number, el: any) => {
            const href = $mx(el).attr("href") ?? "";
            const title = $mx(el).text().trim();
            if (href && title) {
                updates.push({
                    title,
                    url: href.startsWith("http") ? href : `https://www.pjlabs.mx${href}`,
                    category: "newsletter",
                });
            }
        });

        let nuevos = 0;
        const hoy = new Date();
        const fechaString = hoy.toISOString().split("T")[0];

        for (const upd of updates) {
            const id = Buffer.from(upd.url).toString("base64").replace(/[/+=]/g, "_");
            const ref = col.doc(`pjla_${id}`);
            const doc = await ref.get();

            if (!doc.exists) {
                await ref.set({
                    elemento: `PJLA: ${upd.title}`,
                    titulo: `Actualización Normativa: ${upd.title}`,
                    cliente: "Perry Johnson Labs",
                    estado: "programado",
                    prioridad: "alta",
                    tipo: "actualizacion_norma",
                    fecha: fechaString,
                    horaInicio: "09:00",
                    horaFin: "10:00",
                    descripcion: `NUEVA actualización detectada en PJLA.\nURL: ${upd.url}`,
                    personas: [],
                    archivos: [upd.url],
                    esAlertaAutomatica: true,
                    fetchedAt: admin.firestore.Timestamp.now(),
                });
                nuevos++;
            }
        }

        console.log(`PJLA Watcher: Ejecución completada. ${nuevos} actualizaciones RECIENTES procesadas.`);
    } catch (err) {
        console.error("PJLA Watcher error:", err);
    }
}
