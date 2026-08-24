# -*- coding: utf-8 -*-
"""Repara avisos de patrón (quita duplicados) y completa Torque."""
from __future__ import annotations

import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace", line_buffering=True)

import pythoncom
import win32com.client

FOLDER = Path(r"C:\Users\AG\Desktop\FORMATOS AG")
PASSWORD = "AG-Calidad-2026"
MSG = "⚠ PATRÓN VENCIDO — Actualiza vigencia o cambia el patrón"
MSG_ESC = MSG.replace('"', '""')

RGB_FILL = 255 + 220 * 256 + 220 * 65536
RGB_FONT = 153 + 27 * 256 + 27 * 65536

# Textos rotos / viejos dentro de comillas en fórmulas
BROKEN = [
    '⚠ ⚠ PATRÓN VENCIDO — Actualiza vigencia o cambia el patrón — Actualiza vigencia o cambia el patrón',
    '⚠ ⚠ PATRÓN VENCIDO — Actualiza vigencia o cambia el patrón — Actualiza vigencia o cambia el p',
]


def try_unprotect(ws) -> None:
    for pwd in (PASSWORD, "AG", "calidad", "1234", "torque", "Torque", ""):
        try:
            if pwd:
                ws.Unprotect(Password=pwd)
            else:
                ws.Unprotect()
            return
        except Exception:
            continue


def try_protect(ws) -> None:
    try:
        ws.Protect(
            Password=PASSWORD,
            DrawingObjects=False,
            Contents=True,
            Scenarios=True,
            UserInterfaceOnly=True,
            AllowFormattingCells=True,
        )
    except Exception:
        pass


def style(rng) -> None:
    try:
        t = rng.MergeArea if rng.MergeCells else rng
        t.Font.Bold = True
        t.Font.Size = 10
        t.Font.Color = RGB_FONT
        t.Interior.Color = RGB_FILL
        t.WrapText = True
    except Exception:
        pass


def normalize_formula(formula: str) -> str | None:
    if not formula.startswith("=") or "vencid" not in formula.lower():
        return None
    if "equipo vencido" in formula.lower() or "esperando datos" in formula.lower():
        return None

    new = formula
    # Colapsar cualquier variante que ya mencione el aviso nuevo
    if "Actualiza vigencia" in new or "PATRÓN VENCIDO" in new or "Patrón Vencido" in new or "Patron Vencido" in new or "Patón Vencido" in new:
        # Reemplazar contenidos entre comillas que sean avisos de patrón
        import re

        def repl(m: re.Match) -> str:
            inner = m.group(1)
            low = inner.lower()
            if "vencid" in low and ("patr" in low or "⚠" in inner or "actualiza" in low):
                return f'"{MSG_ESC}"'
            return m.group(0)

        new2 = re.sub(r'"([^"]*)"', repl, new)
        if new2 != formula:
            return new2
    return None


def process(path: Path, excel) -> int:
    print(f"\n=== {path.name} ===")
    wb = excel.Workbooks.Open(str(path.resolve()), UpdateLinks=0)
    n = 0
    try:
        for i in range(1, wb.Worksheets.Count + 1):
            ws = wb.Worksheets.Item(i)
            name = str(ws.Name)
            if name.startswith("BD_") or name in ("obtenerDatosExcel", "Historial", "AG_Recursos", "GUIA"):
                continue
            try:
                if ws.Visible == 2:
                    continue
            except Exception:
                pass
            try_unprotect(ws)
            try:
                used = ws.UsedRange
                rows = min(int(used.Rows.Count), 130)
                cols = min(int(used.Columns.Count), 25)
                br, bc = int(used.Row), int(used.Column)
            except Exception:
                continue
            for r in range(br, br + rows):
                for c in range(bc, bc + cols):
                    cell = ws.Cells(r, c)
                    try:
                        f = str(cell.Formula or "")
                    except Exception:
                        continue
                    new_f = normalize_formula(f)
                    if not new_f:
                        continue
                    try:
                        if cell.MergeCells and cell.Address != cell.MergeArea.Cells(1, 1).Address:
                            continue
                    except Exception:
                        pass
                    try_unprotect(ws)
                    cell.Formula = new_f
                    style(cell)
                    n += 1
                    print(f"  {name}!{cell.Address.replace('$','')}")
            if name.lower() in ("portada", "calculos", "resultados", "toma datos", "patrones") or name.upper() in (
                "PORTADA", "CALCULOS", "RESULTADOS",
            ):
                try_protect(ws)
        # Tiempo: asegurar D2 limpio + K2
        if path.name.lower().startswith("formato tiempo"):
            calc = wb.Worksheets("Calculos")
            try_unprotect(calc)
            try:
                if calc.Range("D2").MergeCells:
                    calc.Range("D2").MergeArea.UnMerge()
            except Exception:
                pass
            calc.Range("D2").ClearContents()
            calc.Range("D2").Interior.Pattern = -4142
            calc.Range("K2").Formula = f'=IF(AND(ISNUMBER(I25),I25<TODAY()),"{MSG_ESC}","")'
            style(calc.Range("K2"))
            try_protect(calc)
        wb.Save()
    finally:
        wb.Close(True)
    print(f"  reparadas: {n}")
    return n


def main() -> int:
    files = sorted(FOLDER.glob("Formato*.xlsm"))
    pythoncom.CoInitialize()
    excel = win32com.client.DispatchEx("Excel.Application")
    excel.Visible = False
    excel.DisplayAlerts = False
    excel.AskToUpdateLinks = False
    excel.EnableEvents = False
    try:
        excel.AutomationSecurity = 1
    except Exception:
        pass
    total = 0
    try:
        for path in files:
            try:
                total += process(path, excel)
            except Exception as e:
                print("ERROR", path.name, e)
                import traceback
                traceback.print_exc()
                try:
                    excel.Quit()
                except Exception:
                    pass
                excel = win32com.client.DispatchEx("Excel.Application")
                excel.Visible = False
                excel.DisplayAlerts = False
                excel.EnableEvents = False
    finally:
        try:
            excel.Quit()
        except Exception:
            pass
        pythoncom.CoUninitialize()
    print("\nTotal reparadas:", total)
    print("Mensaje final:", MSG)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
