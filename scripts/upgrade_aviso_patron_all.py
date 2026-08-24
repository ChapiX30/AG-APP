# -*- coding: utf-8 -*-
"""
Aviso PRO de patrón vencido en TODOS los masters AG.

- Sustituye el texto plano \"Patrón Vencido\" por un mensaje accionable.
- Estiliza la celda (rojo, negrita, fondo suave).
- En Tiempo quita el aviso suelto de D2 (tapaba el layout) y deja uno limpio.
- No toca BD_Patrones ni el estatus de Presión (equipo vencido).
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace", line_buffering=True)

import pythoncom
import win32com.client

FOLDER = Path(r"C:\Users\AG\Desktop\FORMATOS AG")
PASSWORD = "AG-Calidad-2026"

# Mensaje único, corto y accionable (cabe en Portada)
MSG = "⚠ PATRÓN VENCIDO — Actualiza vigencia o cambia el patrón"
MSG_ESC = MSG.replace('"', '""')

# Variantes viejas a reemplazar dentro de fórmulas
OLD_MSGS = [
    "Patrón Vencido",
    "PATRÓN VENCIDO",
    "Patron Vencido",
    "Patón Vencido",
    "Patron vencido",
    "Patrón vencido",
]

RGB_FILL = 255 + 220 * 256 + 220 * 65536  # rojo suave
RGB_FONT = 153 + 27 * 256 + 27 * 65536    # rojo fuerte


def try_unprotect(ws) -> None:
    for pwd in (PASSWORD, "AG", "calidad", "1234", ""):
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
            AllowFormattingRows=True,
        )
    except Exception:
        try:
            ws.Protect(Password=PASSWORD, DrawingObjects=False, Contents=True, Scenarios=True)
        except Exception:
            pass


def style_aviso(rng) -> None:
    try:
        target = rng.MergeArea if rng.MergeCells else rng
        target.Font.Bold = True
        target.Font.Size = 10
        target.Font.Color = RGB_FONT
        target.Font.Name = "Calibri"
        target.Interior.Color = RGB_FILL
        target.HorizontalAlignment = -4131  # xlLeft
        target.VerticalAlignment = -4108    # xlCenter
        target.WrapText = True
    except Exception:
        pass


def replace_msg_in_formula(formula: str) -> str | None:
    if not formula or not formula.startswith("="):
        return None
    low = formula.lower()
    if "vencid" not in low:
        return None
    # No tocar avisos de equipo / fechas de Presión
    if "equipo vencido" in low or "esperando datos" in low:
        return None
    # Ya está limpio
    if f'"{MSG}"' in formula or f'"{MSG_ESC}"' in formula:
        return None

    import re

    def repl(m: re.Match) -> str:
        inner = m.group(1)
        il = inner.lower()
        if "vencid" in il and ("patr" in il or "⚠" in inner or "actualiza" in il):
            return f'"{MSG_ESC}"'
        return m.group(0)

    new = re.sub(r'"([^"]*)"', repl, formula)
    return new if new != formula else None


def clear_tiempo_d2(calc) -> None:
    """Quita el aviso suelto que se montaba arriba del título."""
    try:
        rng = calc.Range("D2")
        if rng.MergeCells:
            rng.MergeArea.UnMerge()
        area = calc.Range("D2:J4")
        # solo limpia D2; no destroza el título en D5
        calc.Range("D2").ClearContents()
        calc.Range("D2").Interior.Pattern = -4142  # xlNone
        calc.Range("D2").Font.Bold = False
        calc.Range("D2").Font.ColorIndex = -4105  # xlAutomatic
    except Exception:
        try:
            calc.Range("D2").ClearContents()
        except Exception:
            pass
    # Aviso limpio junto a la zona de fechas del patrón (I25 = vigencia)
    try:
        calc.Range("K2").Formula = f'=IF(AND(ISNUMBER(I25),I25<TODAY()),"{MSG_ESC}","")'
        style_aviso(calc.Range("K2"))
        calc.Range("K2").Locked = True
    except Exception as e:
        print("    aviso K2:", e)


def process_workbook(excel, path: Path) -> None:
    print(f"\n=== {path.name} ===")
    wb = excel.Workbooks.Open(str(path.resolve()), UpdateLinks=0, ReadOnly=False)
    updated = 0
    try:
        for i in range(1, wb.Worksheets.Count + 1):
            ws = wb.Worksheets.Item(i)
            name = str(ws.Name)
            # Saltar hojas de datos / recursos
            if name.startswith("BD_") or name in (
                "obtenerDatosExcel", "Historial", "AG_Recursos", "GUIA", "CMC", "CMC (2)",
            ):
                continue
            try:
                if ws.Visible == 2:
                    continue
            except Exception:
                pass

            try_unprotect(ws)
            try:
                used = ws.UsedRange
                rows = min(int(used.Rows.Count), 120)
                cols = min(int(used.Columns.Count), 25)
                base_r = int(used.Row)
                base_c = int(used.Column)
            except Exception:
                continue

            for r in range(base_r, base_r + rows):
                for c in range(base_c, base_c + cols):
                    cell = ws.Cells(r, c)
                    try:
                        formula = str(cell.Formula or "")
                    except Exception:
                        continue
                    new_f = replace_msg_in_formula(formula)
                    if new_f:
                        # Evitar reescribir celdas de área merge secundaria
                        try:
                            if cell.MergeCells and cell.Address != cell.MergeArea.Cells(1, 1).Address:
                                continue
                        except Exception:
                            pass
                        cell.Formula = new_f
                        style_aviso(cell)
                        updated += 1

            # Caso especial Tiempo
            if path.name.lower().startswith("formato tiempo") and name.lower() == "calculos":
                clear_tiempo_d2(ws)

            # Re-proteger hojas que ya tenían protección típica de calidad
            if name.lower() in ("portada", "calculos", "resultados", "toma datos") or name.upper() in (
                "PORTADA", "CALCULOS", "RESULTADOS",
            ):
                try_protect(ws)

        wb.Save()
        print(f"  celdas actualizadas: {updated}")
    finally:
        wb.Close(True)


def main() -> int:
    files = sorted(FOLDER.glob("Formato*.xlsm"))
    if not files:
        print("No hay masters")
        return 1

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

    ok = 0
    try:
        for path in files:
            try:
                process_workbook(excel, path)
                ok += 1
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
                excel.AskToUpdateLinks = False
                excel.EnableEvents = False
    finally:
        try:
            excel.Quit()
        except Exception:
            pass
        pythoncom.CoUninitialize()

    print(f"\nListo: {ok}/{len(files)} masters")
    print("Mensaje:", MSG)
    return 0 if ok == len(files) else 1


if __name__ == "__main__":
    raise SystemExit(main())
