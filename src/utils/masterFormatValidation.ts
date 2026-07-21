import * as XLSX from 'xlsx';
import { collection, getDocs } from 'firebase/firestore';
import { db } from './firebase';
import { COLLECTION_PATRONES } from './patronLink';
import {
  getPatronUrgency,
  isPatronEstadoCritico,
  type PatronCalibracionRow,
  type PatronUrgency,
} from './patronCalibracion';
import { getPatronFechaVencimientoEfectiva } from './patronPartes';

/**
 * Validación automática de formatos master antes de subirlos:
 * - Verifica que el archivo sea legible y de un tipo permitido.
 * - Si es Excel, detecta los patrones (códigos AG-###) referenciados dentro del
 *   archivo y los cruza contra el inventario `patronesCalibracion`:
 *   existencia, vigencia de calibración, estado operativo y si el número de
 *   certificado vigente aparece en el archivo (proxy de "master actualizado").
 */

export type CheckStatus = 'pass' | 'warn' | 'fail' | 'info';

export interface CheckResult {
  id: string;
  label: string;
  status: CheckStatus;
  detail?: string;
}

export interface PatronCheckResult {
  noControl: string;
  descripcion?: string;
  existe: boolean;
  urgencia: PatronUrgency | null;
  fechaVencimiento?: string;
  estadoProceso?: string;
  estadoCritico: boolean;
  certificadoEncontrado: boolean | null; // null = no hay certificado registrado para comparar
  noCertificado?: string;
}

export interface MasterValidationReport {
  overall: 'pass' | 'warn' | 'fail';
  isExcel: boolean;
  checks: CheckResult[];
  patrones: PatronCheckResult[];
  hojas: string[];
}

const EXCEL_EXTENSIONS = ['.xlsx', '.xlsm', '.xls', '.xlsb'];
const ALLOWED_EXTENSIONS = [...EXCEL_EXTENSIONS, '.pdf', '.doc', '.docx'];
const MAX_SIZE_WARN = 50 * 1024 * 1024; // 50 MB

function getExtension(name: string): string {
  const idx = name.lastIndexOf('.');
  return idx >= 0 ? name.slice(idx).toLowerCase() : '';
}

/** Solo alfanuméricos en mayúsculas, para comparar certificados sin importar formato. */
function normalizeToken(value: string): string {
  return value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
}

/** Extrae códigos de patrón tipo AG-008 / AG 52 / AG052 y los canoniza a AG-###. */
function extractPatronCodes(text: string): Set<string> {
  const codes = new Set<string>();
  const regex = /\bAG[\s-]?0*(\d{1,3})\b/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    codes.add(`AG-${match[1].padStart(3, '0')}`);
  }
  return codes;
}

function canonicalNoControl(noControl: string): string {
  const m = (noControl || '').trim().match(/^AG[\s-]?0*(\d{1,3})$/i);
  return m ? `AG-${m[1].padStart(3, '0')}` : (noControl || '').trim().toUpperCase();
}

interface ExcelScan {
  ok: boolean;
  error?: string;
  sheetNames: string[];
  fullText: string;
  normalizedText: string;
  patronCodes: Set<string>;
}

async function scanExcel(file: File): Promise<ExcelScan> {
  try {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array', cellFormula: false, cellHTML: false });
    const parts: string[] = [];
    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      if (!sheet) continue;
      for (const key of Object.keys(sheet)) {
        if (key.startsWith('!')) continue;
        const cell = sheet[key] as XLSX.CellObject;
        const value = cell.w ?? cell.v;
        if (value === undefined || value === null) continue;
        parts.push(String(value));
      }
    }
    const fullText = parts.join('\n');
    return {
      ok: true,
      sheetNames: workbook.SheetNames,
      fullText,
      normalizedText: normalizeToken(fullText),
      patronCodes: extractPatronCodes(fullText),
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      sheetNames: [],
      fullText: '',
      normalizedText: '',
      patronCodes: new Set(),
    };
  }
}

async function loadPatrones(): Promise<Map<string, PatronCalibracionRow>> {
  const snapshot = await getDocs(collection(db, COLLECTION_PATRONES));
  const map = new Map<string, PatronCalibracionRow>();
  snapshot.docs.forEach(d => {
    const data = { id: d.id, ...d.data() } as PatronCalibracionRow;
    if (data.noControl) map.set(canonicalNoControl(data.noControl), data);
  });
  return map;
}

/** Certificados registrados del patrón (principal + partes). */
function getPatronCertificados(patron: PatronCalibracionRow): string[] {
  const certs: string[] = [];
  const main = (patron as Record<string, unknown>).noCertificado;
  if (typeof main === 'string' && main.trim()) certs.push(main.trim());
  for (const parte of patron.partesCalibracion ?? []) {
    if (parte.noCertificado?.trim()) certs.push(parte.noCertificado.trim());
  }
  return certs;
}

export async function validateMasterFile(file: File): Promise<MasterValidationReport> {
  const checks: CheckResult[] = [];
  const patrones: PatronCheckResult[] = [];
  const ext = getExtension(file.name);
  const isExcel = EXCEL_EXTENSIONS.includes(ext);
  let hojas: string[] = [];

  // --- Checks básicos de archivo ---
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    checks.push({
      id: 'tipo',
      label: 'Tipo de archivo',
      status: 'fail',
      detail: `Extensión "${ext || 'desconocida'}" no permitida. Usa Excel, PDF o Word.`,
    });
  } else {
    checks.push({
      id: 'tipo',
      label: 'Tipo de archivo',
      status: 'pass',
      detail: `${ext.toUpperCase().replace('.', '')} permitido`,
    });
  }

  checks.push(
    file.size > MAX_SIZE_WARN
      ? { id: 'tamano', label: 'Tamaño del archivo', status: 'warn', detail: 'Archivo mayor a 50 MB; revisa que no incluya datos innecesarios.' }
      : { id: 'tamano', label: 'Tamaño del archivo', status: 'pass', detail: `${(file.size / 1024 / 1024).toFixed(1)} MB` },
  );

  if (!isExcel) {
    checks.push({
      id: 'patrones',
      label: 'Verificación de patrones',
      status: 'info',
      detail: 'No aplica: la verificación contra el programa de calibración solo se ejecuta en archivos Excel.',
    });
    return finalizeReport(checks, patrones, hojas, isExcel);
  }

  // --- Lectura del Excel ---
  const scan = await scanExcel(file);
  if (!scan.ok) {
    checks.push({
      id: 'lectura',
      label: 'Integridad del archivo',
      status: 'fail',
      detail: `No se pudo leer el Excel (¿archivo dañado o protegido?): ${scan.error}`,
    });
    return finalizeReport(checks, patrones, hojas, isExcel);
  }
  hojas = scan.sheetNames;
  checks.push({
    id: 'lectura',
    label: 'Integridad del archivo',
    status: 'pass',
    detail: `Excel legible · ${scan.sheetNames.length} hoja(s)`,
  });

  const hojaPatrones = scan.sheetNames.find(n => /patr[oó]n/i.test(n));
  checks.push(
    hojaPatrones
      ? { id: 'hoja-patrones', label: 'Hoja de patrones', status: 'pass', detail: `Hoja "${hojaPatrones}" detectada` }
      : { id: 'hoja-patrones', label: 'Hoja de patrones', status: 'info', detail: 'No se encontró una hoja llamada "Patrones"; se analizará todo el libro.' },
  );

  // --- Cruce contra inventario ---
  if (scan.patronCodes.size === 0) {
    checks.push({
      id: 'patrones',
      label: 'Patrones referenciados',
      status: 'warn',
      detail: 'No se detectó ningún código de patrón (AG-###) dentro del archivo.',
    });
    return finalizeReport(checks, patrones, hojas, isExcel);
  }

  let inventario: Map<string, PatronCalibracionRow>;
  try {
    inventario = await loadPatrones();
  } catch {
    checks.push({
      id: 'patrones',
      label: 'Patrones referenciados',
      status: 'warn',
      detail: 'No se pudo consultar el programa de calibración (sin conexión o sin permisos). Verifica manualmente la vigencia.',
    });
    return finalizeReport(checks, patrones, hojas, isExcel);
  }

  const codesOrdenados = Array.from(scan.patronCodes).sort();
  let vencidos = 0;
  let porVencer = 0;
  let desconocidos = 0;
  let criticos = 0;
  let certsDesactualizados = 0;

  for (const code of codesOrdenados) {
    const patron = inventario.get(code);
    if (!patron) {
      desconocidos++;
      patrones.push({
        noControl: code,
        existe: false,
        urgencia: null,
        estadoCritico: false,
        certificadoEncontrado: null,
      });
      continue;
    }

    const urgencia = getPatronUrgency(patron);
    const estadoCritico = isPatronEstadoCritico(patron.estadoProceso);
    if (urgencia === 'vencido') vencidos++;
    else if (urgencia === 'urgente7' || urgencia === 'proximo30') porVencer++;
    if (estadoCritico) criticos++;

    const certificados = getPatronCertificados(patron);
    let certificadoEncontrado: boolean | null = null;
    if (certificados.length) {
      certificadoEncontrado = certificados.some(cert => {
        const token = normalizeToken(cert);
        return token.length >= 5 && scan.normalizedText.includes(token);
      });
      if (!certificadoEncontrado) certsDesactualizados++;
    }

    patrones.push({
      noControl: code,
      descripcion: patron.descripcion || patron.nombre,
      existe: true,
      urgencia,
      fechaVencimiento: getPatronFechaVencimientoEfectiva(patron) || undefined,
      estadoProceso: patron.estadoProceso,
      estadoCritico,
      certificadoEncontrado,
      noCertificado: certificados[0],
    });
  }

  checks.push({
    id: 'patrones',
    label: 'Patrones referenciados',
    status: 'pass',
    detail: `${codesOrdenados.length} patrón(es) detectado(s) en el archivo`,
  });

  checks.push(
    vencidos > 0
      ? { id: 'vigencia', label: 'Vigencia de calibración', status: 'fail', detail: `${vencidos} patrón(es) con calibración VENCIDA. El master no debe publicarse hasta recalibrar o actualizar.` }
      : porVencer > 0
        ? { id: 'vigencia', label: 'Vigencia de calibración', status: 'warn', detail: `${porVencer} patrón(es) vencen en 30 días o menos.` }
        : { id: 'vigencia', label: 'Vigencia de calibración', status: 'pass', detail: 'Todos los patrones detectados están vigentes.' },
  );

  if (desconocidos > 0) {
    checks.push({
      id: 'inventario',
      label: 'Registro en programa de calibración',
      status: 'warn',
      detail: `${desconocidos} código(s) no existen en el inventario de patrones.`,
    });
  } else {
    checks.push({
      id: 'inventario',
      label: 'Registro en programa de calibración',
      status: 'pass',
      detail: 'Todos los patrones detectados están registrados.',
    });
  }

  if (criticos > 0) {
    checks.push({
      id: 'estado',
      label: 'Estado operativo',
      status: 'warn',
      detail: `${criticos} patrón(es) en mantenimiento, con falla o en calibración externa.`,
    });
  } else {
    checks.push({
      id: 'estado',
      label: 'Estado operativo',
      status: 'pass',
      detail: 'Sin patrones en estado crítico.',
    });
  }

  const conCert = patrones.filter(p => p.certificadoEncontrado !== null).length;
  if (conCert > 0) {
    checks.push(
      certsDesactualizados > 0
        ? { id: 'certificados', label: 'Certificados actualizados', status: 'warn', detail: `${certsDesactualizados} patrón(es) cuyo certificado vigente NO aparece en el archivo; el master podría estar desactualizado.` }
        : { id: 'certificados', label: 'Certificados actualizados', status: 'pass', detail: 'Los números de certificado vigentes aparecen en el archivo.' },
    );
  }

  return finalizeReport(checks, patrones, hojas, isExcel);
}

function finalizeReport(
  checks: CheckResult[],
  patrones: PatronCheckResult[],
  hojas: string[],
  isExcel: boolean,
): MasterValidationReport {
  const overall = checks.some(c => c.status === 'fail')
    ? 'fail'
    : checks.some(c => c.status === 'warn')
      ? 'warn'
      : 'pass';
  return { overall, isExcel, checks, patrones, hojas };
}

/** Resumen compacto para guardar en el documento Firestore del formato. */
export function buildValidationSummary(report: MasterValidationReport) {
  return {
    estado: report.overall,
    fecha: new Date().toISOString(),
    patronesDetectados: report.patrones.map(p => p.noControl),
    detalles: report.checks
      .filter(c => c.status !== 'pass')
      .map(c => `${c.label}: ${c.detail || c.status}`),
  };
}
