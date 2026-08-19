import React, { useMemo, useState } from "react";
import * as XLSX from "xlsx";

type Props = {
  buffer: ArrayBuffer;
};

const MAX_ROWS = 400;

export const SpreadsheetViewer: React.FC<Props> = ({ buffer }) => {
  const workbook = useMemo(() => XLSX.read(buffer, { type: "array" }), [buffer]);
  const sheetNames = workbook.SheetNames;
  const [sheetName, setSheetName] = useState(sheetNames[0] || "");

  const { rows, totalRows } = useMemo(() => {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) return { rows: [] as string[][], totalRows: 0 };
    const raw = XLSX.utils.sheet_to_json<string[]>(sheet, {
      header: 1,
      defval: "",
    }) as string[][];
    const normalized = raw.map((row) =>
      row.map((cell) => (cell == null ? "" : String(cell)))
    );
    return { rows: normalized, totalRows: normalized.length };
  }, [workbook, sheetName]);

  if (!sheetNames.length) {
    return <p className="p-6 text-sm text-slate-500">El archivo no tiene hojas.</p>;
  }

  const headerRow = rows[0] ?? [];
  const bodyRows = rows.slice(1, MAX_ROWS + 1);
  const colCount = Math.max(
    headerRow.length,
    ...bodyRows.map((r) => r.length),
    1
  );
  const pad = (row: string[]) => {
    const next = [...row];
    while (next.length < colCount) next.push("");
    return next;
  };

  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-white" data-ag-no-swipe-back>
      <div className="flex flex-shrink-0 items-center gap-1 overflow-x-auto border-b border-slate-200 bg-slate-50 px-2 py-1.5">
        {sheetNames.map((name) => (
          <button
            key={name}
            type="button"
            onClick={() => setSheetName(name)}
            className={
              name === sheetName
                ? "rounded-md bg-white px-3 py-1.5 text-xs font-semibold text-[#2464A3] shadow-sm ring-1 ring-slate-200"
                : "rounded-md px-3 py-1.5 text-xs font-medium text-slate-500 hover:bg-white/80"
            }
          >
            {name}
          </button>
        ))}
        {totalRows > MAX_ROWS + 1 && (
          <span className="ml-auto flex-shrink-0 px-2 text-[11px] text-slate-400">
            {MAX_ROWS} de {Math.max(totalRows - 1, 0)} filas
          </span>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="min-w-full border-collapse text-[13px]">
          <thead className="sticky top-0 z-[1]">
            <tr className="bg-slate-50">
              {pad(headerRow).map((cell, i) => (
                <th
                  key={i}
                  className="whitespace-nowrap border-b border-r border-slate-200 px-3 py-2 text-left font-semibold text-slate-700"
                >
                  {cell || `Col ${i + 1}`}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {bodyRows.map((row, ri) => (
              <tr key={ri} className={ri % 2 ? "bg-slate-50/70" : "bg-white"}>
                {pad(row).map((cell, ci) => (
                  <td
                    key={ci}
                    className="whitespace-nowrap border-b border-r border-slate-100 px-3 py-1.5 text-slate-800"
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
