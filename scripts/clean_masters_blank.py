# -*- coding: utf-8 -*-
"""
Deja los masters limpios: sin certificado (número/año), sin alcance,
sin lecturas de ejemplo. Conserva prefijos, unidades, fórmulas y botones.

Uso:
  python scripts/clean_masters_blank.py
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace", line_buffering=True)

import pythoncom
import win32com.client

FOLDER = Path(r"C:\Users\AG\Desktop\FORMATOS AG")
PWD = "AG-Calidad-2026"


def try_unprotect(ws) -> None:
    try:
        ws.Unprotect(PWD)
    except Exception:
        try:
            ws.Unprotect()
        except Exception:
            pass


def try_protect(ws) -> None:
    try:
        ws.Protect(Password=PWD, DrawingObjects=False, Contents=True, Scenarios=True)
    except Exception:
        pass


def clear_cell(ws, addr) -> None:
    """Borra valor; no toca si es fórmula."""
    r = ws.Range(addr)
    if r.MergeCells:
        r = r.MergeArea.Cells(1, 1)
    if r.HasFormula:
        return
    r.Value = None


def clear_numeric(ws, addr) -> None:
    """Borra solo números (deja textos/encabezados)."""
    rng = ws.Range(addr)
    for i in range(1, rng.Cells.Count + 1):
        cell = rng.Cells(i)
        if cell.MergeCells and cell.Address != cell.MergeArea.Cells(1, 1).Address:
            continue
        if cell.HasFormula:
            continue
        v = cell.Value
        if isinstance(v, (int, float)):
            cell.Value = None


def set_value(ws, addr, value) -> None:
    r = ws.Range(addr)
    if r.HasFormula:
        return
    r.Value = value


def get_excel():
    """Usa el Excel ya abierto si existe; si no, crea uno oculto."""
    try:
        excel = win32com.client.GetObject(Class="Excel.Application")
        print("Usando Excel ya abierto")
        return excel, True
    except Exception:
        excel = win32com.client.DispatchEx("Excel.Application")
        excel.Visible = False
        print("Excel nuevo (oculto)")
        return excel, False


def open_workbook(excel, path: Path):
    # Si ya está abierto en esta instancia, usarlo
    for i in range(1, excel.Workbooks.Count + 1):
        w = excel.Workbooks.Item(i)
        if path.name.lower() == w.Name.lower() or path.name.lower() in w.FullName.lower():
            if w.ReadOnly:
                raise RuntimeError(f"Solo lectura: {path.name}")
            print(f"  (ya abierto)")
            return w, True  # already_open
    wb = excel.Workbooks.Open(str(path.resolve()), UpdateLinks=0, ReadOnly=False)
    if wb.ReadOnly:
        wb.Close(False)
        raise RuntimeError(f"Solo lectura (ciérralo en Excel): {path.name}")
    return wb, False


def finish_wb(wb, already_open: bool) -> None:
    wb.Save()
    if not already_open:
        wb.Close(SaveChanges=True)


# ---------- Presión ----------
def clean_presion(excel) -> None:
    path = FOLDER / "Formato master Presion.xlsm"
    print(f"\n== {path.name} ==")
    wb, already = open_workbook(excel, path)
    try:
        calc = wb.Worksheets("Calculos")
        try_unprotect(calc)
        excel.EnableEvents = False
        excel.Calculation = -4135  # xlManual

        set_value(calc, "D4", "AGP")
        clear_cell(calc, "E4")
        set_value(calc, "F4", 26)
        clear_cell(calc, "F10")  # alcance
        clear_cell(calc, "J9")   # división
        set_value(calc, "J10", "psi")
        set_value(calc, "J14", "psi")
        set_value(calc, "L6", "POR CLASE")
        clear_cell(calc, "L7")
        clear_cell(calc, "N13")

        calc.Range("J11").Formula = '=IF(OR($F$10="",$F$10=0,$J$9=""),"",$J$9/$F$10*100)'
        calc.Range("L8").Formula = (
            '=IF($L$6="EQUIDISTANTES",IF(OR($L$7="",NOT(ISNUMBER($L$7))),8,MIN(11,MAX(1,$L$7))),'
            'IF(OR(J11="",NOT(ISNUMBER(J11))),"",IF(J11<=0.6,8,IF(J11<=2.5,5,3))))'
        )
        for row in range(28, 39):
            for col in ("A", "B", "C", "D", "E", "F"):
                calc.Range(f"{col}{row}").Formula = (
                    f'=IF(OR($L$8="",$L$8<=0),"",'
                    f'IF(ROW({col}{row})-ROW($A$28)+1>$L$8,"",'
                    f'IF($L$8=1,$F$10,'
                    f'IF(ROW({col}{row})=ROW($A$28),0,'
                    f'IF(ROW({col}{row})-ROW($A$28)+1=$L$8,$F$10,'
                    f'ROUND((ROW({col}{row})-ROW($A$28))*($F$10/($L$8-1))/$J$9,0)*$J$9)))))'
                )
            clear_numeric(calc, f"H{row}:K{row}")

        for addr in ("B9", "B10"):
            f = calc.Range(addr).Formula
            if isinstance(f, str) and "IFERROR" in f.upper() and not f.startswith('=IF(OR($E$4="",$F$4=""),"",'):
                idx = f.upper().find("IFERROR(")
                calc.Range(addr).Formula = '=IF(OR($E$4="",$F$4=""),"",' + f[idx:] + ")"

        excel.Calculation = -4105
        excel.Calculate()
        try_protect(calc)
        finish_wb(wb, already)
        print("  OK limpio (AGP / sin número / año 26 / sin alcance)")
    finally:
        excel.EnableEvents = True
        excel.Calculation = -4105


def clean_multimetro(excel) -> None:
    path = FOLDER / "Formato Multimetro.xlsm"
    print(f"\n== {path.name} ==")
    wb, already = open_workbook(excel, path)
    try:
        calc = wb.Worksheets("Calculos")
        try_unprotect(calc)
        excel.EnableEvents = False

        set_value(calc, "D4", "AGEL")
        clear_cell(calc, "E4")
        set_value(calc, "F4", 26)
        clear_numeric(calc, "A20:P120")

        excel.Calculate()
        try_protect(calc)
        finish_wb(wb, already)
        print("  OK limpio (AGEL / sin número / año 26 / lecturas en blanco)")
    finally:
        excel.EnableEvents = True


def clean_torque(excel) -> None:
    path = FOLDER / "Formato Torque.xlsm"
    print(f"\n== {path.name} ==")
    wb, already = open_workbook(excel, path)
    try:
        toma = wb.Worksheets("Toma Datos")
        try_unprotect(toma)
        excel.EnableEvents = False

        set_value(toma, "D2", "AGPT")
        clear_cell(toma, "E2")
        set_value(toma, "F2", 26)
        clear_cell(toma, "J9")
        clear_cell(toma, "F15")
        clear_cell(toma, "F16")
        clear_numeric(toma, "F17:N17")
        clear_numeric(toma, "F28:L35")
        clear_numeric(toma, "G28:H28")

        excel.Calculate()
        try_protect(toma)
        finish_wb(wb, already)
        print("  OK limpio (AGPT / sin número / año 26 / sin alcance / sin lecturas)")
    finally:
        excel.EnableEvents = True


def clean_masa(excel) -> None:
    path = FOLDER / "Formato Básculas y Balanzas.xlsm"
    print(f"\n== {path.name} ==")
    wb, already = open_workbook(excel, path)
    try:
        calc = wb.Worksheets("CALCULOS")
        try_unprotect(calc)
        excel.EnableEvents = False

        set_value(calc, "D4", "AGM")
        clear_cell(calc, "E4")
        set_value(calc, "F4", 26)
        set_value(calc, "D9", "BASCULA")
        clear_cell(calc, "F10")
        clear_cell(calc, "J9")
        set_value(calc, "J10", "kg")
        set_value(calc, "AK11", "kg")
        clear_numeric(calc, "B17:H19")
        clear_numeric(calc, "B24:H32")
        clear_numeric(calc, "C24:C34")
        clear_numeric(calc, "G22:H32")

        excel.Calculate()
        try_protect(calc)
        finish_wb(wb, already)
        print("  OK limpio (AGM / BASCULA / sin número / año 26 / sin alcance)")
    finally:
        excel.EnableEvents = True


def clean_indicador(excel) -> None:
    path = FOLDER / "Formato Indicador.xlsm"
    print(f"\n== {path.name} ==")
    wb, already = open_workbook(excel, path)
    try:
        calc = wb.Worksheets("CALCULOS")
        try_unprotect(calc)
        excel.EnableEvents = False

        set_value(calc, "D4", "AGD")
        clear_cell(calc, "E4")
        set_value(calc, "F4", 26)
        set_value(calc, "J10", "mm")
        clear_cell(calc, "F10")
        clear_cell(calc, "J9")
        clear_cell(calc, "J12")
        clear_numeric(calc, "B18:E20")
        clear_numeric(calc, "B26:E35")
        clear_numeric(calc, "B40:E50")
        clear_numeric(calc, "C26:E35")
        clear_numeric(calc, "C40:E50")

        excel.Calculate()
        try_protect(calc)
        finish_wb(wb, already)
        print("  OK limpio (AGD / mm / sin número / año 26 / sin alcance / sin lecturas)")
    finally:
        excel.EnableEvents = True


def main() -> int:
    missing = [
        n for n in (
            "Formato master Presion.xlsm",
            "Formato Multimetro.xlsm",
            "Formato Torque.xlsm",
            "Formato Básculas y Balanzas.xlsm",
            "Formato Indicador.xlsm",
        )
        if not (FOLDER / n).exists()
    ]
    if missing:
        print("Faltan:", missing)
        return 1

    pythoncom.CoInitialize()
    excel, was_running = get_excel()
    excel.DisplayAlerts = False
    quit_excel = not was_running
    try:
        clean_presion(excel)
        clean_multimetro(excel)
        clean_torque(excel)
        clean_masa(excel)
        clean_indicador(excel)
        print("\nLISTO: los masters quedaron en blanco (listos para un certificado nuevo).")
        return 0
    except Exception as exc:
        print(f"ERROR: {exc}")
        import traceback
        traceback.print_exc()
        return 1
    finally:
        if quit_excel:
            excel.Quit()
        pythoncom.CoUninitialize()


if __name__ == "__main__":
    raise SystemExit(main())
