# -*- coding: utf-8 -*-
"""Arregla Dictamen de Inspección Inicial para que sí muestre ACEPTADO/RECHAZADO."""
from __future__ import annotations

import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace", line_buffering=True)

import pythoncom
import win32com.client

TARGET = Path(r"C:\Users\AG\Desktop\FORMATOS AG\Formato Indicador.xlsm")
PASSWORD = "AG-Calidad-2026"


def main() -> int:
    pythoncom.CoInitialize()
    try:
        excel = win32com.client.GetObject(Class="Excel.Application")
        was_running = True
        print("Usando Excel ya abierto")
    except Exception:
        excel = win32com.client.DispatchEx("Excel.Application")
        excel.Visible = False
        was_running = False
        print("Excel nuevo")

    excel.DisplayAlerts = False
    wb = None
    already = False
    try:
        for i in range(1, excel.Workbooks.Count + 1):
            w = excel.Workbooks.Item(i)
            if TARGET.name.lower() in str(w.Name).lower():
                wb, already = w, True
                break
        if wb is None:
            wb = excel.Workbooks.Open(str(TARGET.resolve()), UpdateLinks=0, ReadOnly=False)

        if wb.ReadOnly:
            raise RuntimeError("Solo lectura. Ciérralo en Excel e intenta de nuevo.")

        calc = wb.Worksheets("CALCULOS")
        try:
            calc.Unprotect(PASSWORD)
        except Exception:
            try:
                calc.Unprotect()
            except Exception:
                pass

        print("Diagnóstico:")
        for r, vrow in ((18, 42), (19, 45), (20, 50)):
            print(
                f"  E{r}={calc.Range(f'E{r}').Value!r} F{r}={calc.Range(f'F{r}').Value!r} "
                f"V{vrow}={calc.Range(f'V{vrow}').Value!r} H{vrow}={calc.Range(f'H{vrow}').Value!r} "
                f"G{r}={calc.Range(f'G{r}').Formula!r} => {calc.Range(f'G{r}').Value!r}"
            )

        # Promedio / Err sólidos
        for r in (18, 19, 20):
            calc.Range(f"E{r}").Formula = f'=IF(COUNT(C{r}:D{r})<1,"",AVERAGE(C{r}:D{r}))'
            calc.Range(f"F{r}").Formula = f'=IF(E{r}="","",B{r}-E{r})'

        # Dictamen: si V/H del largo aún fallan, usa 0 en U y EMP de J12 como respaldo
        # Criterio original: |Err| + Uexpandida > EMP → RECHAZADO
        calc.Range("G18").Formula = (
            '=IF(E18="","",'
            'IF(ABS(F18)+IFERROR(V42,0)>IFERROR(H42,$J$12),"RECHAZADO","ACEPTADO"))'
        )
        calc.Range("G19").Formula = (
            '=IF(E19="","",'
            'IF(ABS(F19)+IFERROR(V45,0)>IFERROR(H45,$J$12),"RECHAZADO","ACEPTADO"))'
        )
        calc.Range("G20").Formula = (
            '=IF(E20="","",'
            'IF(ABS(F20)+IFERROR(V50,0)>IFERROR(H50,$J$12),"RECHAZADO","ACEPTADO"))'
        )

        excel.Calculate()
        print("Después:")
        for r in (18, 19, 20):
            print(
                f"  E{r}={calc.Range(f'E{r}').Value!r} F{r}={calc.Range(f'F{r}').Value!r} "
                f"G{r}={calc.Range(f'G{r}').Value!r} form={calc.Range(f'G{r}').Formula!r}"
            )

        try:
            calc.Protect(Password=PASSWORD, DrawingObjects=False, Contents=True, Scenarios=True)
        except Exception:
            pass
        wb.Save()
        print("Guardado")
        if not already:
            wb.Close(SaveChanges=True)
            wb = None
        return 0
    except Exception as exc:
        print("ERROR:", exc)
        import traceback
        traceback.print_exc()
        return 1
    finally:
        if wb is not None and not already:
            try:
                wb.Close(SaveChanges=True)
            except Exception:
                pass
        if not was_running:
            try:
                excel.Quit()
            except Exception:
                pass
        pythoncom.CoUninitialize()


if __name__ == "__main__":
    raise SystemExit(main())
