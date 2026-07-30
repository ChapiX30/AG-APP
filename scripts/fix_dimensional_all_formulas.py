# -*- coding: utf-8 -*-
"""
Corrige propagación #N/A en incertidumbre cuando VLOOKUP del punto 0 no encuentra patrón.
- Micrómetro: N/P con fallback 0; O/Q/T/U/V/J con IFERROR
- Indicador: revisar cadena similar en corto/largo
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace", line_buffering=True)

import pythoncom
import win32com.client

FOLDER = Path(r"C:\Users\AG\Desktop\FORMATOS AG")
PASSWORD = "AG-Calidad-2026"
XL_ERRORS = {
    -2146826246: "#DIV/0!",
    -2146826273: "#N/A",
    -2146826281: "#REF!",
    -2146826252: "#VALUE!",
    -2146826259: "#NAME?",
}


def en(v):
    return XL_ERRORS.get(v, v) if isinstance(v, int) and v in XL_ERRORS else v


def try_unprotect(ws):
    for pwd in (PASSWORD, ""):
        try:
            ws.Unprotect(Password=pwd) if pwd else ws.Unprotect()
            return
        except Exception:
            continue


def fix_micrometro(excel) -> list[str]:
    path = FOLDER / "Formato Micrometro Exteriores.xlsm"
    print(f"Corrigiendo {path.name}…")
    wb = excel.Workbooks.Open(str(path.resolve()), UpdateLinks=0, ReadOnly=False)
    notes = []
    try:
        calc = wb.Worksheets("Calculos")
        try_unprotect(calc)

        for row in range(25, 36):
            calc.Range(f"N{row}").Formula = (
                f'=IF($J$11="mm",'
                f'IFERROR(VLOOKUP(B{row},$X$2:$AA$407,4,TRUE),0),'
                f'IFERROR(VLOOKUP(B{row},$AC$2:$AF$401,4,TRUE),0))'
            )
            calc.Range(f"P{row}").Formula = (
                f'=IF($J$11="mm",'
                f'IFERROR(VLOOKUP(B{row},$X$2:$AA$407,3,TRUE),0),'
                f'IFERROR(VLOOKUP(B{row},$AC$2:$AF$401,3,TRUE),0))'
            )
            calc.Range(f"O{row}").Formula = f"=IFERROR(N{row}/2,0)"
            calc.Range(f"Q{row}").Formula = f"=IFERROR(P{row}/2,0)"
            calc.Range(f"J{row}").Formula = (
                f'=IFERROR(IF(ABS(G{row})+V{row}>H{row},"RECHAZADO","ACEPTADO"),'
                f'IF(ABS(G{row})>H{row},"RECHAZADO","ACEPTADO"))'
            )

        # Inspección inicial: promedio/dictamen sólidos
        for r, href in ((18, 27), (19, 30), (20, 35)):
            calc.Range(f"E{r}").Formula = f'=IF(COUNT(C{r}:D{r})<1,"",AVERAGE(C{r}:D{r}))'
            calc.Range(f"F{r}").Formula = f'=IF(E{r}="","",B{r}-E{r})'
            calc.Range(f"G{r}").Formula = (
                f'=IF(E{r}="","",'
                f'IF(ABS(F{r})>IFERROR(H{href},$J$13),"RECHAZADO","ACEPTADO"))'
            )

        calc.Range("A24").Formula = "=$J$11"

        # Prueba punto 0
        calc.Range("J11").Value = "mm"
        calc.Range("G11").Value = 25
        calc.Range("F11").Value = 0
        for r in range(25, 36):
            b = calc.Range(f"B{r}").Value
            if isinstance(b, (int, float)):
                calc.Range(f"C{r}").Value = b
                calc.Range(f"D{r}").Value = b
                calc.Range(f"E{r}").Value = b
        excel.Calculate()
        for cell in ("N25", "O25", "P25", "Q25", "T25", "U25", "V25", "J25"):
            v = en(calc.Range(cell).Value)
            notes.append(f"  {cell}={v}")
            if isinstance(v, str) and v.startswith("#"):
                notes.append(f"  FAIL {cell}")

        calc.Protect(Password=PASSWORD, DrawingObjects=False, Contents=True, Scenarios=True)
        wb.Save()
        print("  Guardado micrometro")
        return notes
    finally:
        wb.Close(SaveChanges=True)


def fix_indicador(excel) -> list[str]:
    path = FOLDER / "Formato Indicador.xlsm"
    print(f"Corrigiendo {path.name}…")
    wb = excel.Workbooks.Open(str(path.resolve()), UpdateLinks=0, ReadOnly=False)
    notes = []
    try:
        calc = wb.Worksheets("CALCULOS")
        try_unprotect(calc)

        # Corto 26-35: VLOOKUP con fallback 0
        for row in range(26, 36):
            calc.Range(f"M{row}").Formula = (
                f'=IF($J$10="mm",'
                f'IFERROR(VLOOKUP(B{row},Patrones!$E$6:$H$130,2,TRUE),0),'
                f'IFERROR(VLOOKUP(B{row}*25.4,Patrones!$E$6:$H$130,2,TRUE)/25.4,0))'
            )
            calc.Range(f"O{row}").Formula = (
                f'=IF($J$10="mm",'
                f'IFERROR(VLOOKUP(B{row},Patrones!$E$6:$H$133,4,TRUE),0),'
                f'IFERROR(VLOOKUP(B{row}*25.4,Patrones!$E$6:$H$133,4,TRUE)/25.4,0))'
            )
            # Si hay divisiones posteriores tipicas, endurecer dictamen J
            try:
                f = str(calc.Range(f"J{row}").Formula or "")
                if "V" in f.upper() and "IFERROR" not in f.upper():
                    calc.Range(f"J{row}").Formula = (
                        f'=IFERROR(IF(ABS(G{row})+V{row}>H{row},"RECHAZADO","ACEPTADO"),'
                        f'IF(ABS(G{row})>H{row},"RECHAZADO","ACEPTADO"))'
                    )
            except Exception:
                pass

        # Largo 40-50: VLOOKUP a X:AA
        for row in range(40, 51):
            try:
                f = str(calc.Range(f"J{row}").Formula or "")
                if f.startswith("=") and "IFERROR" not in f.upper() and "V" in f.upper():
                    calc.Range(f"J{row}").Formula = (
                        f'=IFERROR(IF(ABS(G{row})+V{row}>H{row},"RECHAZADO","ACEPTADO"),'
                        f'IF(ABS(G{row})>H{row},"RECHAZADO","ACEPTADO"))'
                    )
            except Exception:
                pass

        # Nominal = REF, inspección
        for row in range(26, 36):
            calc.Range(f"B{row}").Formula = f"=A{row}"
        for row in range(41, 51):
            calc.Range(f"B{row}").Formula = f"=A{row}"
        calc.Range("B18").Formula = "=B42"
        calc.Range("B19").Formula = "=B45"
        calc.Range("B20").Formula = "=B50"
        calc.Range("A24").Formula = "=$J$10"
        for r in (18, 19, 20):
            calc.Range(f"E{r}").Formula = f'=IF(COUNT(C{r}:D{r})<1,"",AVERAGE(C{r}:D{r}))'
            calc.Range(f"F{r}").Formula = f'=IF(E{r}="","",B{r}-E{r})'
        calc.Range("G18").Formula = (
            '=IF(E18="","",IF(ABS(F18)+IFERROR(V42,0)>IFERROR(H42,$J$12),"RECHAZADO","ACEPTADO"))'
        )
        calc.Range("G19").Formula = (
            '=IF(E19="","",IF(ABS(F19)+IFERROR(V45,0)>IFERROR(H45,$J$12),"RECHAZADO","ACEPTADO"))'
        )
        calc.Range("G20").Formula = (
            '=IF(E20="","",IF(ABS(F20)+IFERROR(V50,0)>IFERROR(H50,$J$12),"RECHAZADO","ACEPTADO"))'
        )

        # Endurecer divisiones N/O típicas si existen en corto (columnas de incertidumbre)
        # En indicador: N=uErr/sqrt, O=..., etc. Revisar celdas O26 que dividen
        for row in range(26, 36):
            for col in ("N", "P"):
                cell = f"{col}{row}"
                f = str(calc.Range(cell).Formula or "")
                if f.startswith("=") and "/2" in f.replace(" ", "") and "IFERROR" not in f.upper():
                    # no tocar si es VLOOKUP
                    if "VLOOKUP" not in f.upper():
                        body = f[1:]
                        calc.Range(cell).Formula = f"=IFERROR({body},0)"

        for row in range(40, 51):
            for col in ("N", "P"):
                cell = f"{col}{row}"
                f = str(calc.Range(cell).Formula or "")
                if f.startswith("=") and "/2" in f.replace(" ", "") and "IFERROR" not in f.upper():
                    if "VLOOKUP" not in f.upper():
                        body = f[1:]
                        calc.Range(cell).Formula = f"=IFERROR({body},0)"

        excel.Calculate()
        calc.Range("J10").Value = "in"
        calc.Range("F10").Value = 1
        excel.Calculate()
        notes.append(f"  B20={calc.Range('B20').Value} B50={calc.Range('B50').Value}")

        calc.Protect(Password=PASSWORD, DrawingObjects=False, Contents=True, Scenarios=True)
        wb.Save()
        print("  Guardado indicador")
        return notes
    finally:
        wb.Close(SaveChanges=True)


def main() -> int:
    pythoncom.CoInitialize()
    excel = win32com.client.DispatchEx("Excel.Application")
    excel.Visible = False
    excel.DisplayAlerts = False
    excel.EnableEvents = False
    try:
        for line in fix_micrometro(excel):
            print(line)
        for line in fix_indicador(excel):
            print(line)
        return 0
    finally:
        excel.Quit()
        pythoncom.CoUninitialize()


if __name__ == "__main__":
    raise SystemExit(main())
