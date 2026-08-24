# -*- coding: utf-8 -*-
"""Arregla avisos de patrón solo en celdas conocidas (rápido, incluye Torque)."""
from __future__ import annotations

import re
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

# archivo -> [(hoja, celda), ...]
TARGETS = {
    "Formato Básculas y Balanzas.xlsm": [("PORTADA", "E54")],
    "Formato Dinamometro Unificado.xlsm": [("PORTADA", "E47")],
    "Formato Hornos y Muflas.xlsm": [("Portada", "E46")],
    "Formato Indicador.xlsm": [("PORTADA", "E49")],
    "Formato Micrometro Exteriores.xlsm": [("Portada", "E54")],
    "Formato Multimetro.xlsm": [("Portada", "D46")],
    "Formato Pin Gage.xlsm": [("Portada", "E46")],
    "Formato Regla Flex.xlsm": [
        ("PORTADA", "E35"),
        ("Calculos", "A1"),
        ("Patrones", "C8"),
        ("Patrones", "C22"),
    ],
    "Formato Termohigrometro.xlsm": [("Portada", "F49")],
    "Formato Termometro IR.xlsm": [("Portada", "D46")],
    "Formato Tiempo.xlsm": [("Portada", "E47"), ("Calculos", "K2")],
    "Formato Torque.xlsm": [
        ("Portada", "D64"),
        ("Toma Datos", "B78"),
        ("Patrones", "A8"),
        ("Patrones", "A17"),
        ("Patrones", "A25"),
        ("Patrones", "A33"),
        ("Patrones", "A39"),
        ("Patrones", "A45"),
        ("Patrones", "A51"),
        ("Patrones", "D53"),
    ],
    "Formato Vernier.xlsm": [("Portada", "E54")],
}


def unprotect(ws) -> None:
    for pwd in (PASSWORD, "AG", "calidad", "1234", "torque", "Torque", ""):
        try:
            if pwd:
                ws.Unprotect(Password=pwd)
            else:
                ws.Unprotect()
            return
        except Exception:
            continue


def protect(ws) -> None:
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


def style(cell) -> None:
    t = cell.MergeArea if cell.MergeCells else cell
    t.Font.Bold = True
    t.Font.Size = 10
    t.Font.Color = RGB_FONT
    t.Interior.Color = RGB_FILL
    t.WrapText = True


def fix_formula(formula: str) -> str | None:
    if not formula.startswith("="):
        return None
    if "vencid" not in formula.lower() and "Actualiza vigencia" not in formula:
        # Tiempo K2 may need set from scratch
        return None

    def repl(m: re.Match) -> str:
        inner = m.group(1)
        low = inner.lower()
        if "vencid" in low or "actualiza vigencia" in low or "⚠" in inner:
            # Mantener sufijos tipo "5.6 Nm" en Torque D53
            extra = ""
            m2 = re.search(r"(Vencido|VENCIDO)(\s+[\d.]+\s*Nm.*)$", inner, re.I)
            if m2:
                extra = m2.group(2)
                return f'"{MSG_ESC}{extra}"'
            return f'"{MSG_ESC}"'
        return m.group(0)

    new = re.sub(r'"([^"]*)"', repl, formula)
    return new if new != formula else None


def main() -> int:
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

    try:
        for fname, cells in TARGETS.items():
            path = FOLDER / fname
            if not path.exists():
                # encoding variants for Básculas
                alts = list(FOLDER.glob("Formato*Balanzas.xlsm")) + list(FOLDER.glob("Formato*sculas*.xlsm"))
                path = alts[0] if alts and "Balanzas" in fname else None
                if path is None:
                    print("SKIP missing", fname)
                    continue
            print(f"\n=== {path.name} ===")
            wb = excel.Workbooks.Open(str(path.resolve()), UpdateLinks=0)
            try:
                for sheet, addr in cells:
                    try:
                        ws = wb.Worksheets(sheet)
                    except Exception:
                        print("  no sheet", sheet)
                        continue
                    unprotect(ws)
                    cell = ws.Range(addr)
                    f = str(cell.Formula or "")
                    if path.name.lower().startswith("formato tiempo") and addr == "K2":
                        cell.Formula = f'=IF(AND(ISNUMBER(I25),I25<TODAY()),"{MSG_ESC}","")'
                        style(cell)
                        print("  set", sheet, addr)
                        protect(ws)
                        continue
                    new_f = fix_formula(f)
                    if new_f:
                        cell.Formula = new_f
                        style(cell)
                        print("  fix", sheet, addr)
                    elif "Actualiza vigencia" in f and "⚠ ⚠" not in f:
                        style(cell)
                        print("  ok ", sheet, addr)
                    else:
                        # forzar si aún tiene texto viejo simple
                        if f.startswith("=") and "vencid" in f.lower():
                            new_f2 = re.sub(
                                r'"(Patr[oó]n Vencido|PATRÓN VENCIDO|Patón Vencido)([^"]*)"',
                                lambda m: f'"{MSG_ESC}{m.group(2)}"',
                                f,
                                flags=re.I,
                            )
                            if new_f2 != f:
                                cell.Formula = new_f2
                                style(cell)
                                print("  force", sheet, addr)
                            else:
                                print("  skip", sheet, addr, f[:60])
                        else:
                            print("  skip", sheet, addr)
                    protect(ws)

                if path.name.lower().startswith("formato tiempo"):
                    calc = wb.Worksheets("Calculos")
                    unprotect(calc)
                    try:
                        if calc.Range("D2").MergeCells:
                            calc.Range("D2").MergeArea.UnMerge()
                    except Exception:
                        pass
                    calc.Range("D2").ClearContents()
                    calc.Range("D2").Interior.Pattern = -4142
                    protect(calc)
                    print("  cleared Calculos!D2")

                wb.Save()
            finally:
                wb.Close(True)
    finally:
        excel.Quit()
        pythoncom.CoUninitialize()
    print("\nListo. Mensaje:", MSG)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
