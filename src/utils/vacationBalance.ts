export const VACATION_PENDING_ESTADOS = [
  'pendiente_calidad',
  'pendiente_edgar',
  'pendiente_jorge',
] as const;

export type VacacionesSaldoYear = {
  diasAsignados?: number;
  actualizadoPor?: string;
  actualizadoEn?: string;
};

export type VacationBalance = {
  asignados: number;
  usados: number;
  pendientes: number;
  restantes: number;
};

export function getVacationYear(): number {
  return new Date().getFullYear();
}

export function getDiasAsignadosFromSaldo(
  saldo: Record<string, VacacionesSaldoYear> | undefined,
  year = getVacationYear(),
): number {
  return saldo?.[String(year)]?.diasAsignados ?? 0;
}

export function getSolicitudVacationYear(
  solicitud: { anio?: number; fechaInicio?: string },
  fallback = getVacationYear(),
): number {
  if (solicitud.anio != null && Number.isFinite(solicitud.anio)) return solicitud.anio;
  if (solicitud.fechaInicio && solicitud.fechaInicio.length >= 4) {
    const y = parseInt(solicitud.fechaInicio.slice(0, 4), 10);
    if (Number.isFinite(y)) return y;
  }
  return fallback;
}

export function computeVacationBalance(
  diasAsignados: number,
  solicitudes: { diasVacaciones: number; estado: string; anio?: number; fechaInicio?: string }[],
  year = getVacationYear(),
): VacationBalance {
  let usados = 0;
  let pendientes = 0;
  for (const s of solicitudes) {
    if (getSolicitudVacationYear(s, year) !== year) continue;
    if (s.estado === 'aprobada') usados += s.diasVacaciones;
    else if (VACATION_PENDING_ESTADOS.includes(s.estado as (typeof VACATION_PENDING_ESTADOS)[number])) {
      pendientes += s.diasVacaciones;
    }
  }
  return {
    asignados: diasAsignados,
    usados,
    pendientes,
    restantes: diasAsignados - usados - pendientes,
  };
}
