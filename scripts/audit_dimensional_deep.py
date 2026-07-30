# -*- coding: utf-8 -*-
"""Pase profundo: busca #REF! en fórmulas y errores en rangos clave con/sin lecturas."""
from __future__ import annotations

import re
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace", line_buffering=True)

import pythoncom
import win32com.client

FOLDER = Path(r"C:\Users\AG\Desktop\FORMATOS AG")
PASSWORD = "AG-Calidad-2026"
XL_ERRORS = {
    -2146826246: "#DIV/0!",
    -2146826259: "#NAME?",
    -2146826281: "#REF!",
    -2146826252: "#VALUE!",
    -2146826265: "#NULL!",
    -2146826273: "#N/A",
    -2146826255: "#NUM!",
}


def err_name(val):
    if isinstance(val, int) and val in XL_ERRORS:
        return XL_ERRORS[val]
    return None


def try_unprotect(ws):
    for pwd in (PASSWORD, ""):
        try:
            ws.Unprotect(Password=pwd) if pwd else ws.Unprotect()
            return
        except Exception:
            continue


def scan_formula_text(ws, max_row=120, max_col=50):
    """Busca #REF! / nombres rotos en el texto de fórmulas."""
    bad = []
    used = ws.UsedRange
    if used is None:
        return bad
    rows = min(used.Rows.Count, max_row)
    cols = min(used.Columns.Count, max_col)
    formulas = used.Resize(rows, cols).Formula
    if not isinstance(formulas, tuple):
        formulas = ((formulas,),)
    base_r, base_c = used.Row, used.Column
    for i, row in enumerate(formulas):
        if not isinstance(row, tuple):
            row = (row,)
        for j, f in enumerate(row):
            if not isinstance(f, str) or not f.startswith("="):
                continue
            fu = f.upper()
            addr = ws.Cells(base_r + i, base_c + j).Address.replace("$", "")
            if "#REF!" in fu:
                bad.append((addr, "formula_tiene_#REF!", f[:160]))
            if re.search(r"[!]{2,}", f):
                bad.append((addr, "doble_bang", f[:160]))
    return bad


def scan_range_values(ws, addrs):
    out = []
    for addr in addrs:
        try:
            cell = ws.Range(addr)
            v = cell.Value
            name = err_name(v)
            if name:
                out.append((addr, name, str(cell.Formula)[:140]))
        except Exception as e:
            out.append((addr, f"EXC:{e}", ""))
    return out


def fill_readings_indicador(calc):
    for r in list(range(26, 36)) + list(range(40, 51)):
        b = calc.Range(f"B{r}").Value
        if isinstance(b, (int, float)):
            for col in ("C", "D", "E"):
                if r >= 40 or True:
                    # corto solo CDE; largo CDE
                    pass
            calc.Range(f"C{r}").Value = b
            calc.Range(f"D{r}").Value = b
            if r >= 40 or r <= 35:
                calc.Range(f"E{r}").Value = b
    for r in (18, 19, 20):
        b = calc.Range(f"B{r}").Value
        if isinstance(b, (int, float)):
            calc.Range(f"C{r}").Value = b
            calc.Range(f"D{r}").Value = b


def fill_readings_micro(calc):
    for r in range(25, 36):
        b = calc.Range(f"B{r}").Value
        if isinstance(b, (int, float)):
            calc.Range(f"C{r}").Value = b
            calc.Range(f"D{r}").Value = b
            calc.Range(f"E{r}").Value = b
    for r in (18, 19, 20):
        b = calc.Range(f"B{r}").Value
        if isinstance(b, (int, float)):
            calc.Range(f"C{r}").Value = b
            calc.Range(f"D{r}").Value = b


def check_indicador(excel):
    path = FOLDER / "Formato Indicador.xlsm"
    print(f"\n### DEEP {path.name}")
    wb = excel.Workbooks.Open(str(path.resolve()), UpdateLinks=0, ReadOnly=False)
    issues = []
    try:
        calc = wb.Worksheets("CALCULOS")
        port = wb.Worksheets("PORTADA")
        res = wb.Worksheets("RESULTADOS")
        try_unprotect(calc)

        for sheet in (calc, port, res, wb.Worksheets("Patrones"), wb.Worksheets("CMC")):
            for addr, kind, f in scan_formula_text(sheet):
                issues.append(f"{sheet.Name}!{addr} {kind}: {f}")

        for unit, alc in (("in", 1.0), ("mm", 25.4)):
            calc.Range("J10").Value = unit
            calc.Range("F10").Value = alc
            calc.Range("J9").Value = 0.0001 if unit == "in" else 0.01
            calc.Range("J12").Value = 0.0002 if unit == "in" else 0.01
            # limpiar lecturas primero
            for r in list(range(26, 36)) + list(range(40, 51)):
                calc.Range(f"C{r}:E{r}").ClearContents()
            calc.Range("C18:D20").ClearContents()
            excel.Calculate()

            # sin lecturas: dictamen insp vacío OK; promedio vacío OK
            # con lecturas:
            fill_readings_indicador(calc)
            excel.Calculate()

            checks = []
            # nominales
            checks += [
                ("B18", 0.2 * alc if unit == "in" else alc * 0.2),  # B18=B42=20% largo = F10*20%
            ]
            # Actually B18=B42, A42=F10*20%, B42=A42 so B18 = alc*0.2 for both units
            expected = {
                "B18": alc * 0.2,
                "B19": alc * 0.5,
                "B20": alc * 1.0,
                "B26": alc * 0.02,
                "B50": alc * 1.0,
                "A50": alc * 1.0,
            }
            for addr, exp in expected.items():
                v = calc.Range(addr).Value
                en = err_name(v)
                if en or abs(float(v) - exp) > 1e-6:
                    issues.append(f"[{unit}] {addr}={v} expected {exp} {en or ''}")

            for r in (18, 19, 20):
                g = calc.Range(f"G{r}").Value
                e = calc.Range(f"E{r}").Value
                if err_name(g) or g in (None, ""):
                    issues.append(f"[{unit}] Dictamen G{r}={g!r} form={calc.Range(f'G{r}').Formula}")
                if err_name(e):
                    issues.append(f"[{unit}] Promedio E{r}={e}")

            # incertidumbres con lecturas no deben ser DIV/0 en V
            for r in (26, 30, 35, 41, 45, 50):
                for col in ("V", "U", "G", "F"):
                    cell = f"{col}{r}"
                    v = calc.Range(cell).Value
                    en = err_name(v)
                    if en:
                        issues.append(f"[{unit}] {cell}={en} form={calc.Range(cell).Formula[:100]}")

            # Portada cert
            cert = port.Range("J9").Value
            if err_name(cert) or not cert:
                issues.append(f"[{unit}] Portada J9 cert={cert!r}")

            # RESULTADOS muestra patrón
            d25 = res.Range("D25").Value
            if err_name(d25):
                issues.append(f"[{unit}] RESULTADOS D25={d25}")

            print(f"  modo {unit} alc={alc}: B20={calc.Range('B20').Value} B50={calc.Range('B50').Value} G18={calc.Range('G18').Value}")

        return issues
    finally:
        wb.Close(SaveChanges=False)


def check_micro(excel):
    path = FOLDER / "Formato Micrometro Exteriores.xlsm"
    print(f"\n### DEEP {path.name}")
    wb = excel.Workbooks.Open(str(path.resolve()), UpdateLinks=0, ReadOnly=False)
    issues = []
    try:
        calc = wb.Worksheets("Calculos")
        port = wb.Worksheets("Portada")
        res = wb.Worksheets("Resultados")
        try_unprotect(calc)

        for sheet in (calc, port, res, wb.Worksheets("Patrones"), wb.Worksheets("CMC")):
            for addr, kind, f in scan_formula_text(sheet):
                issues.append(f"{sheet.Name}!{addr} {kind}: {f}")

        for unit, alc in (("in", 1.0), ("mm", 25.0)):
            calc.Range("J11").Value = unit
            calc.Range("G11").Value = alc
            calc.Range("F11").Value = 0
            calc.Range("J10").Value = 0.00005 if unit == "in" else 0.001
            calc.Range("J13").Value = 0.0002 if unit == "in" else 0.004
            for r in range(25, 36):
                calc.Range(f"C{r}:E{r}").ClearContents()
            calc.Range("C18:D20").ClearContents()
            excel.Calculate()
            fill_readings_micro(calc)
            excel.Calculate()

            expected = {
                "B18": alc * 0.2,  # =B27
                "B19": alc * 0.5,  # =B30
                "B20": alc * 1.0,  # =B35
                "B27": alc * 0.2,
                "B35": alc,
            }
            for addr, exp in expected.items():
                v = calc.Range(addr).Value
                en = err_name(v)
                if en or abs(float(v) - exp) > 1e-6:
                    issues.append(f"[{unit}] {addr}={v} expected {exp} {en or ''}")

            for r in (18, 19, 20):
                g = calc.Range(f"G{r}").Value
                if err_name(g) or g in (None, ""):
                    issues.append(f"[{unit}] Dictamen G{r}={g!r} form={calc.Range(f'G{r}').Formula}")

            for r in (25, 27, 30, 35):
                for col in ("V", "U", "G", "N", "P"):
                    cell = f"{col}{r}"
                    v = calc.Range(cell).Value
                    en = err_name(v)
                    if en:
                        issues.append(f"[{unit}] {cell}={en} form={str(calc.Range(cell).Formula)[:100]}")

            cert = port.Range("J9").Value
            if err_name(cert) or not cert:
                issues.append(f"[{unit}] Portada J9={cert!r}")

            print(f"  modo {unit} alc={alc}: B20={calc.Range('B20').Value} B35={calc.Range('B35').Value} G18={calc.Range('G18').Value} N27={calc.Range('N27').Value}")

        return issues
    finally:
        wb.Close(SaveChanges=False)


def main():
    pythoncom.CoInitialize()
    excel = win32com.client.DispatchEx("Excel.Application")
    excel.Visible = False
    excel.DisplayAlerts = False
    excel.EnableEvents = False
    all_issues = []
    try:
        all_issues += [("Indicador", x) for x in check_indicador(excel)]
        all_issues += [("Micrometro", x) for x in check_micro(excel)]
    finally:
        excel.Quit()
        pythoncom.CoUninitialize()

    print("\n" + "#" * 60)
    if not all_issues:
        print("DEEP OK: sin fallas en Indicador ni Micrómetro (mm e in, con lecturas).")
        return 0
    print(f"DEEP FALLAS: {len(all_issues)}")
    for src, msg in all_issues:
        print(f"  [{src}] {msg}")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
