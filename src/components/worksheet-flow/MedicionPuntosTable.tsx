import React, { useEffect, useMemo, useRef, useState } from "react";
import { Plus, RefreshCw, Trash2 } from "lucide-react";
import {
  buildAlcanceResolucionSpec,
  calcDictamenPunto,
  formatMetrologyNumber,
  generatePuntosNominales,
  parseMedicionPairs,
  parseNumericToken,
  serializeMedicionPairs,
  type PuntoMedicion,
} from "../../utils/worksheetPuntosDictamen";

type Props = {
  alcance: string;
  resolucion: string;
  medicionPatron: string;
  medicionInstrumento: string;
  onChange: (patron: string, instrumento: string) => void;
};

function rowsEqual(a: PuntoMedicion[], b: PuntoMedicion[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((r, i) => r.patron === b[i].patron && r.instrumento === b[i].instrumento);
}

export const MedicionPuntosTable: React.FC<Props> = ({
  alcance,
  resolucion,
  medicionPatron,
  medicionInstrumento,
  onChange,
}) => {
  const [rows, setRows] = useState<PuntoMedicion[]>(() =>
    parseMedicionPairs(medicionPatron, medicionInstrumento)
  );
  const [empOverrideText, setEmpOverrideText] = useState("");
  const lastPushedRef = useRef(serializeMedicionPairs(rows));
  const lastAutoKeyRef = useRef("");
  const rowsRef = useRef(rows);
  rowsRef.current = rows;

  const spec = useMemo(
    () => buildAlcanceResolucionSpec(alcance, resolucion),
    [alcance, resolucion]
  );
  const empOverride = parseNumericToken(empOverrideText);

  useEffect(() => {
    const last = lastPushedRef.current;
    if (
      medicionPatron === last.medicionPatron &&
      medicionInstrumento === last.medicionInstrumento
    ) {
      return;
    }
    setRows(parseMedicionPairs(medicionPatron, medicionInstrumento));
    lastPushedRef.current = { medicionPatron, medicionInstrumento };
  }, [medicionPatron, medicionInstrumento]);

  const commit = (next: PuntoMedicion[]) => {
    rowsRef.current = next;
    setRows(next);
    const texts = serializeMedicionPairs(next);
    lastPushedRef.current = texts;
    onChange(texts.medicionPatron, texts.medicionInstrumento);
  };

  useEffect(() => {
    if (!spec) return;
    const key = `${spec.alcance}|${spec.resolucion}|${spec.nPuntos}`;
    const timer = window.setTimeout(() => {
      if (lastAutoKeyRef.current === key) return;
      const existing = rowsRef.current;
      const hasInst = existing.some((r) => parseNumericToken(r.instrumento) != null);
      const hasPatron = existing.some((r) => parseNumericToken(r.patron) != null);
      if (hasInst || (hasPatron && lastAutoKeyRef.current === "")) {
        lastAutoKeyRef.current = key;
        return;
      }
      lastAutoKeyRef.current = key;
      const generated: PuntoMedicion[] = generatePuntosNominales(spec).map((patron) => ({
        patron,
        instrumento: "",
      }));
      if (!rowsEqual(existing, generated)) commit(generated);
    }, 450);
    return () => window.clearTimeout(timer);
    // Solo al cambiar alcance/resolución; no al agregar filas.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spec?.alcance, spec?.resolucion, spec?.nPuntos]);

  const regenerar = () => {
    if (!spec) return;
    const generated: PuntoMedicion[] = generatePuntosNominales(spec).map((patron) => ({
      patron,
      instrumento: "",
    }));
    lastAutoKeyRef.current = `${spec.alcance}|${spec.resolucion}|${spec.nPuntos}`;
    commit(generated);
  };

  const updateCell = (index: number, field: keyof PuntoMedicion, value: string) => {
    commit(rowsRef.current.map((r, i) => (i === index ? { ...r, [field]: value } : r)));
  };

  const addRow = () => {
    commit([...rowsRef.current, { patron: "", instrumento: "" }]);
  };

  const removeRow = (index: number) => {
    commit(rowsRef.current.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <label className="text-xs font-semibold text-slate-600">
          EMP del cliente (opcional)
          <input
            type="text"
            inputMode="decimal"
            placeholder={spec ? String(spec.empAprox) : "Resolución"}
            value={empOverrideText}
            onChange={(e) => setEmpOverrideText(e.target.value)}
            className="mt-1 block w-40 p-2 border border-slate-300 rounded-lg text-sm font-semibold text-gray-900 bg-white"
          />
        </label>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={regenerar}
            disabled={!spec}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Regenerar puntos
          </button>
          <button
            type="button"
            onClick={addRow}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700"
          >
            <Plus className="w-3.5 h-3.5" /> Agregar punto
          </button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-slate-800 text-white text-[11px] uppercase tracking-wider">
            <tr>
              <th className="px-3 py-3 text-left font-bold w-10">#</th>
              <th className="px-3 py-3 text-left font-bold">Patrón</th>
              <th className="px-3 py-3 text-left font-bold">Instrumento</th>
              <th className="px-3 py-3 text-left font-bold">Error</th>
              <th className="px-3 py-3 text-left font-bold">U</th>
              <th className="px-3 py-3 text-left font-bold">|E|+U</th>
              <th className="px-3 py-3 text-left font-bold">Dictamen</th>
              <th className="px-3 py-3 w-12" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-slate-500 text-sm">
                  {spec
                    ? "Pulsa Regenerar puntos o Agregar punto."
                    : "Escribe alcance y resolución para generar la tabla."}
                </td>
              </tr>
            ) : (
              rows.map((row, index) => {
                const calc = calcDictamenPunto(row, spec, empOverride);
                const pass = calc.dictamen === "PASA";
                const fail = calc.dictamen === "NO PASA";
                return (
                  <tr key={index} className="border-t border-slate-100 hover:bg-slate-50/80">
                    <td className="px-3 py-2 text-slate-400 font-bold">{index + 1}</td>
                    <td className="px-2 py-1.5">
                      <input
                        type="text"
                        inputMode="decimal"
                        value={row.patron}
                        onChange={(e) => updateCell(index, "patron", e.target.value)}
                        className="w-full p-2 border border-slate-300 rounded-lg font-semibold text-gray-900 bg-slate-50"
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <input
                        type="text"
                        inputMode="decimal"
                        value={row.instrumento}
                        onChange={(e) => updateCell(index, "instrumento", e.target.value)}
                        className="w-full p-2 border border-indigo-200 rounded-lg font-semibold text-gray-900 bg-indigo-50/40"
                      />
                    </td>
                    <td className="px-3 py-2 font-mono text-slate-700">
                      {formatMetrologyNumber(calc.error, spec?.resolucion ?? null)}
                    </td>
                    <td className="px-3 py-2 font-mono text-slate-700">
                      {formatMetrologyNumber(calc.u, spec?.resolucion ?? null)}
                    </td>
                    <td className="px-3 py-2 font-mono text-slate-700">
                      {formatMetrologyNumber(calc.eMasU, spec?.resolucion ?? null)}
                    </td>
                    <td className="px-3 py-2">
                      {calc.dictamen ? (
                        <span
                          className={`inline-block text-[11px] font-extrabold px-2 py-1 rounded-full ${
                            pass
                              ? "bg-emerald-100 text-emerald-800"
                              : fail
                                ? "bg-red-100 text-red-800"
                                : "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {calc.dictamen}
                        </span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-2 py-1.5">
                      <button
                        type="button"
                        onClick={() => removeRow(index)}
                        className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                        title="Quitar punto"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
