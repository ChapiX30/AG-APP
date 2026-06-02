import { addMonths, format, isValid, parse, parseISO } from 'date-fns';

export type CertificadoExtractResult = {
  laboratorio?: string;
  noCertificado?: string;
  fechaCalibracion?: string;
  fechaVencimiento?: string;
  confianza: number;
  metodo: 'regex' | 'gemini' | 'regex+gemini';
  textoMuestra?: string;
};

const DATE_PATTERNS = [
  /(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/g,
  /(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/g,
];

function toIsoDate(raw: string): string | undefined {
  const s = raw.trim();
  const formats = ['dd/MM/yyyy', 'd/M/yyyy', 'yyyy-MM-dd', 'dd-MM-yyyy', 'MM/dd/yyyy'];
  for (const f of formats) {
    try {
      const d = parse(s, f, new Date());
      if (isValid(d)) return format(d, 'yyyy-MM-dd');
    } catch {
      /* next */
    }
  }
  try {
    const d = parseISO(s);
    if (isValid(d)) return format(d, 'yyyy-MM-dd');
  } catch {
    /* ignore */
  }
  return undefined;
}

function extractDatesFromText(text: string): string[] {
  const found: string[] = [];
  for (const re of DATE_PATTERNS) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const iso = toIsoDate(m[0]);
      if (iso) found.push(iso);
    }
  }
  return [...new Set(found)].sort();
}

function pickLab(text: string): string | undefined {
  const patterns = [
    /(?:laboratorio|lab\.?\s*de\s*calibraci[oó]n|calibrado\s+en|realizado\s+por|performed\s+by|issued\s+by|emisor)[:\s]+([^\n\r]{3,90})/i,
    /(?:nombre\s+del\s+laboratorio)[:\s]+([^\n\r]{3,90})/i,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m?.[1]) {
      const lab = m[1].replace(/\s{2,}/g, ' ').trim().slice(0, 80);
      if (lab.length >= 3) return lab;
    }
  }
  return undefined;
}

function pickCertNumber(text: string): string | undefined {
  const patterns = [
    /(?:certificado|certificate|informe|reporte|oficio)\s*(?:n[oº°]\.?|no\.?|#)?[:\s]*([A-Z0-9][A-Z0-9\-\/\.]{2,48})/i,
    /(?:n[oº°]\.\s*de\s*certificado)[:\s]*([A-Z0-9][A-Z0-9\-\/\.]{2,48})/i,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m?.[1]) return m[1].trim();
  }
  return undefined;
}

function pickVencimiento(text: string, dates: string[]): string | undefined {
  const labeled = [
    /(?:v[aá]lido\s+hasta|valid\s+until|vigencia\s+hasta|pr[oó]xima\s+calibraci[oó]n|fecha\s+de\s+vencimiento|expires?|vence)[:\s]+(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4})/i,
    /(?:v[aá]lido\s+hasta|valid\s+until)[:\s]+(\d{4}[\/\-.]\d{1,2}[\/\-.]\d{1,2})/i,
  ];
  for (const re of labeled) {
    const m = text.match(re);
    if (m?.[1]) {
      const iso = toIsoDate(m[1]);
      if (iso) return iso;
    }
  }
  if (dates.length >= 2) return dates[dates.length - 1];
  if (dates.length === 1) return dates[0];
  return undefined;
}

function pickCalibracion(text: string, dates: string[]): string | undefined {
  const labeled = [
    /(?:fecha\s+de\s+calibraci[oó]n|calibration\s+date|fecha\s+del\s+servicio|date\s+of\s+calibration)[:\s]+(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4})/i,
    /(?:fecha\s+de\s+calibraci[oó]n|calibration\s+date)[:\s]+(\d{4}[\/\-.]\d{1,2}[\/\-.]\d{1,2})/i,
  ];
  for (const re of labeled) {
    const m = text.match(re);
    if (m?.[1]) {
      const iso = toIsoDate(m[1]);
      if (iso) return iso;
    }
  }
  if (dates.length >= 2) return dates[0];
  return undefined;
}

export function parseCertificadoText(text: string, frecuenciaMeses = 12): CertificadoExtractResult {
  const normalized = text.replace(/\s+/g, ' ').trim();
  const dates = extractDatesFromText(normalized);
  const laboratorio = pickLab(normalized);
  const noCertificado = pickCertNumber(normalized);
  let fechaCalibracion = pickCalibracion(normalized, dates);
  let fechaVencimiento = pickVencimiento(normalized, dates);

  if (fechaCalibracion && !fechaVencimiento && frecuenciaMeses > 0) {
    try {
      const base = parseISO(fechaCalibracion);
      if (isValid(base)) {
        fechaVencimiento = format(addMonths(base, frecuenciaMeses), 'yyyy-MM-dd');
      }
    } catch {
      /* ignore */
    }
  }

  let confianza = 0;
  if (laboratorio) confianza += 35;
  if (noCertificado) confianza += 25;
  if (fechaVencimiento) confianza += 25;
  if (fechaCalibracion) confianza += 15;

  return {
    laboratorio,
    noCertificado,
    fechaCalibracion,
    fechaVencimiento,
    confianza: Math.min(100, confianza),
    metodo: 'regex',
    textoMuestra: normalized.slice(0, 280),
  };
}

async function extractPdfText(file: File): Promise<string> {
  const pdfjs = await import('pdfjs-dist');
  const pdfjsWorker = (await import('pdfjs-dist/build/pdf.worker.min.js?url')).default;
  pdfjs.GlobalWorkerOptions.workerSrc = pdfjsWorker;

  const buffer = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: buffer }).promise;
  const parts: string[] = [];
  const maxPages = Math.min(doc.numPages, 6);
  for (let i = 1; i <= maxPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const line = content.items
      .map((item) => ('str' in item ? String(item.str) : ''))
      .join(' ');
    parts.push(line);
  }
  return parts.join('\n');
}

async function extractWithGemini(file: File, frecuenciaMeses: number): Promise<CertificadoExtractResult | null> {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY as string | undefined;
  if (!apiKey?.trim()) return null;

  try {
    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        resolve(result.split(',')[1] || '');
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

    const mime = file.type || (file.name.endsWith('.pdf') ? 'application/pdf' : 'image/jpeg');
    const prompt =
      'Extrae de este certificado de calibración metrológica en JSON estricto: ' +
      '{"laboratorio":"","noCertificado":"","fechaCalibracion":"yyyy-MM-dd","fechaVencimiento":"yyyy-MM-dd"}. ' +
      `Si falta vencimiento, suma ${frecuenciaMeses} meses a fecha de calibración. Solo JSON, sin markdown.`;

    const result = await model.generateContent([
      { text: prompt },
      { inlineData: { mimeType: mime, data: base64 } },
    ]);
    const raw = result.response.text().trim();
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const parsed = JSON.parse(jsonMatch[0]) as Record<string, string>;
    return {
      laboratorio: parsed.laboratorio?.trim(),
      noCertificado: parsed.noCertificado?.trim(),
      fechaCalibracion: parsed.fechaCalibracion ? toIsoDate(parsed.fechaCalibracion) : undefined,
      fechaVencimiento: parsed.fechaVencimiento ? toIsoDate(parsed.fechaVencimiento) : undefined,
      confianza: 90,
      metodo: 'gemini',
    };
  } catch (err) {
    console.warn('[certificadoExtract] Gemini no disponible:', err);
    return null;
  }
}

/** Lee PDF o imagen y devuelve datos para el formulario de recepción. */
export async function extractPatronCertificadoFromFile(
  file: File,
  frecuenciaMeses = 12,
): Promise<CertificadoExtractResult> {
  let text = '';
  const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');

  if (isPdf) {
    try {
      text = await extractPdfText(file);
    } catch (err) {
      console.warn('[certificadoExtract] PDF text:', err);
    }
  }

  let result = text.length > 40
    ? parseCertificadoText(text, frecuenciaMeses)
    : { confianza: 0, metodo: 'regex' as const };

  if (result.confianza < 55) {
    const gemini = await extractWithGemini(file, frecuenciaMeses);
    if (gemini) {
      result = {
        ...result,
        ...gemini,
        confianza: Math.max(result.confianza, gemini.confianza),
        metodo: result.confianza > 0 ? 'regex+gemini' : 'gemini',
      };
    }
  } else if (import.meta.env.VITE_GEMINI_API_KEY) {
    const gemini = await extractWithGemini(file, frecuenciaMeses);
    if (gemini) {
      result = {
        laboratorio: gemini.laboratorio || result.laboratorio,
        noCertificado: gemini.noCertificado || result.noCertificado,
        fechaCalibracion: gemini.fechaCalibracion || result.fechaCalibracion,
        fechaVencimiento: gemini.fechaVencimiento || result.fechaVencimiento,
        confianza: Math.max(result.confianza, gemini.confianza),
        metodo: 'regex+gemini',
      };
    }
  }

  return result;
}
