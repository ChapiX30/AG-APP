import { getFunctions, httpsCallable } from 'firebase/functions';
import { app } from './firebaseApp';

type GetPatronCertificadoUrlRequest = { patronId: string };
type GetPatronCertificadoUrlResponse = { url: string; expiresInSeconds: number };

let functionsInstance: ReturnType<typeof getFunctions> | null = null;

function getFns() {
  if (!functionsInstance) {
    functionsInstance = getFunctions(app, 'us-central1');
  }
  return functionsInstance;
}

/** URL firmada de corta duración; no persistir ni registrar en consola. */
export async function fetchPatronCertificadoSignedUrl(patronId: string): Promise<string> {
  const callable = httpsCallable<GetPatronCertificadoUrlRequest, GetPatronCertificadoUrlResponse>(
    getFns(),
    'getPatronCertificadoUrl'
  );
  const result = await callable({ patronId });
  const url = result.data?.url;
  if (!url) {
    throw new Error('No se pudo obtener el enlace del certificado.');
  }
  return url;
}
