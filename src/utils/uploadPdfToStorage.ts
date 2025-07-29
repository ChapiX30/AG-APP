// src/utils/uploadPdfToStorage.ts

import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { storage } from "./firebase"; // Ajusta la ruta según tu proyecto

/**
 * Sube un archivo PDF a Firebase Storage y retorna la URL de descarga
 * @param {Blob | File} file - El archivo PDF generado (Blob o File)
 * @param {string} userEmail - (Opcional) correo o identificador para crear la carpeta
 * @param {string} fileName - Nombre para el archivo (ej: "HojaTrabajo-AGD-0001-25.pdf")
 */
export async function uploadPdfToStorage(file: Blob | File, userEmail: string, fileName: string) {
    // Puedes organizar por usuario (carpeta) o por fecha
    const path = `worksheets/${userEmail}/${fileName}`;
    const pdfRef = ref(storage, path);

    // Sube el archivo PDF
    await uploadBytes(pdfRef, file);

    // Obtiene la URL de descarga (opcional, por si la quieres mostrar/guardar)
    const url = await getDownloadURL(pdfRef);
    return url;
}
