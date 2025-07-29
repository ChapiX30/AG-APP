// src/utils/uploadPdfToDrive.ts
import { gapi } from 'gapi-script';

// Inicializa el cliente de Google API
export function initGoogleDriveClient(clientId: string) {
    return new Promise<void>((resolve, reject) => {
        function start() {
            gapi.client.init({
                apiKey: "", // No es obligatorio para Drive, pero puedes poner tu API Key si quieres
                clientId,
                discoveryDocs: ["https://www.googleapis.com/discovery/v1/apis/drive/v3/rest"],
                scope: "https://www.googleapis.com/auth/drive.file",
            }).then(() => resolve(), reject);
        }
        gapi.load('client:auth2', start);
    });
}

export async function signInToGoogleDrive() {
    await gapi.auth2.getAuthInstance().signIn();
}

export async function uploadPdfToDrive(pdfBlob: Blob, fileName: string) {
    const accessToken = gapi.auth.getToken().access_token;
    const metadata = {
        name: fileName,
        mimeType: 'application/pdf',
    };

    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', pdfBlob);

    const response = await fetch(
        "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id",
        {
            method: "POST",
            headers: new Headers({ Authorization: "Bearer " + accessToken }),
            body: form,
        }
    );
    if (!response.ok) throw new Error("Error subiendo el archivo a Drive");
    return await response.json();
}
