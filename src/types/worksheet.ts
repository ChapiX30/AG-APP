export interface WorksheetState {
  lugarCalibracion: "Sitio" | "Laboratorio" | "";
  frecuenciaCalibracion: string;
  fecha: string;
  fechaRecepcion: string;
  certificado: string;
  nombre: string;
  cliente: string;
  id: string;
  equipo: string;
  marca: string;
  modelo: string;
  numeroSerie: string;
  magnitud: string;
  unidad: string[];
  alcance: string;
  resolucion: string;
  medicionPatron: string;
  medicionInstrumento: string;
  excentricidad: string;
  linealidad: string;
  repetibilidad: string;
  notas: string;
  tempAmbiente: string | number;
  humedadRelativa: string | number;
  idBlocked: boolean;
  idErrorMessage: string;
  permitirExcepcion: boolean;
  isMasterData: boolean;
  fieldsLocked: boolean;
  condicionEquipo: "buenas" | "dano" | "";
  descripcionDano: string;
  fotoEquipoBase64: string;
  fotoEquipoURL: string;
}

export interface BackgroundSaveJob {
  id: string;
  state: WorksheetState;
  electricalValues: Record<string, { patron: string; instrumento: string }>;
  localExc: { p1: string; p2: string; p3: string; p4: string; p5: string };
  user: { id?: string; name?: string; email?: string } | null;
  worksheetId?: string;
  /** Magnitud original del consecutivo (colección consecutivos) */
  magnitudConsecutivo?: string;
}
