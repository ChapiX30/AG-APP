# -*- coding: utf-8 -*-
"""Restaura Promedio y Dictamen de Inspección Inicial."""
from __future__ import annotations

import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace", line_buffering=True)

import pythoncom
import win32com.client

TARGET = Path(r"C:\Users\AG\Desktop\FORMATOS AG\Formato Indicador.xlsm")
PASSWORD = "AG-Calidad-2026"


def get_excel():
    try:
        excel = win32com.client.GetObject(Class="Excel.Application")
        print("Usando Excel ya abierto")
        return excel, True
    except Exception:
        excel = win32com.client.DispatchEx("Excel.Application")
        excel.Visible = False
        print("Excel nuevo (oculto)")
        return excel, False


def main() -> int:
    pythoncom.CoInitialize()
    excel, was_running = get_excel()
    excel.DisplayAlerts = False
    excel.EnableEvents = False
    wb = None
    already = False
    try:
        for i in range(1, excel.Workbooks.Count + 1):
            w = excel.Workbooks.Item(i)
            if TARGET.name.lower() in str(w.Name).lower():
                wb = w
                already = True
                print(f"Ya abierto: {w.FullName}")
                break
        if wb is None:
            wb = excel.Workbooks.Open(str(TARGET.resolve()), UpdateLinks=0, ReadOnly=False)

        if wb.ReadOnly:
            raise RuntimeError("Solo lectura: ciérralo en Excel e intenta otra vez.")

        calc = wb.Worksheets("CALCULOS")
        try:
            calc.Unprotect(PASSWORD)
        except Exception:
            try:
                calc.Unprotect()
            except Exception:
                pass

        print("Antes (filas 18-20):")
        for r in (18, 19, 20):
            print(
                f"  B{r}={calc.Range(f'B{r}').Formula!r} "
                f"E{r}={calc.Range(f'E{r}').Formula!r} "
                f"F{r}={calc.Range(f'F{r}').Formula!r} "
                f"G{r}={calc.Range(f'G{r}').Formula!r}"
            )

        # Restaurar cadenas de Inspección Inicial
        calc.Range("B18").Formula = "=B42"
        calc.Range("B19").Formula = "=B45"
        calc.Range("B20").Formula = "=B50"

        for r in (18, 19, 20):
            calc.Range(f"E{r}").Formula = f"=IF(COUNT(C{r}:D{r})=0,\"\",AVERAGE(C{r}:D{r}))"
            calc.Range(f"F{r}").Formula = f'=IF(E{r}="","",B{r}-E{r})'

        # Dictamen: no tumbarse si V/H del intervalo largo aún dan error
        calc.Range("G18").Formula = (
            '=IF(E18="","",IFERROR(IF(ABS(F18)+N(V42)>N(H42),"RECHAZADO","ACEPTADO"),""))'
        )
        calc.Range("G19").Formula = (
            '=IF(E19="","",IFERROR(IF(ABS(F19)+N(V45)>N(H45),"RECHAZADO","ACEPTADO"),""))'
        )
        calc.Range("G20").Formula = (
            '=IF(E20="","",IFERROR(IF(ABS(F20)+N(V50)>N(H50),"RECHAZADO","ACEPTADO"),""))'
        )

        excel.Calculate()
        print("Después:")
        for r in (18, 19, 20):
            print(
                f"  E{r}={calc.Range(f'E{r}').Formula!r} => {calc.Range(f'E{r}').Value!r} | "
                f"F={calc.Range(f'F{r}').Value!r} G={calc.Range(f'G{r}').Value!r}"
            )

        try:
            calc.Protect(Password=PASSWORD, DrawingObjects=False, Contents=True, Scenarios=True)
        except Exception:
            pass

        wb.Save()
        print(f"Guardado: {wb.FullName}")
        if not already:
            wb.Close(SaveChanges=True)
            wb = None
        return 0
    except Exception as exc:
        print(f"ERROR: {exc}")
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
