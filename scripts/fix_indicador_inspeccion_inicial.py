# -*- coding: utf-8 -*-
"""Reaplica y verifica B20 en Formato Indicador.xlsm."""
from __future__ import annotations

import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace", line_buffering=True)

import pythoncom
import win32com.client

TARGET = Path(r"C:\Users\AG\Desktop\FORMATOS AG\Formato Indicador.xlsm")
PASSWORD = "AG-Calidad-2026"


def main() -> int:
    if not TARGET.exists():
        print(f"No existe: {TARGET}")
        return 1

    pythoncom.CoInitialize()
    # Preferir Excel ya abierto (así editamos la misma instancia que ve el usuario)
    was_running = False
    try:
        excel = win32com.client.GetObject(Class="Excel.Application")
        was_running = True
        print("Usando Excel ya abierto")
    except Exception:
        excel = win32com.client.DispatchEx("Excel.Application")
        excel.Visible = False
        print("Excel nuevo (oculto)")

    excel.DisplayAlerts = False
    excel.EnableEvents = False
    wb = None
    already_open = False
    try:
        for i in range(1, excel.Workbooks.Count + 1):
            w = excel.Workbooks.Item(i)
            if TARGET.name.lower() in str(w.Name).lower() or TARGET.name.lower() in str(w.FullName).lower():
                wb = w
                already_open = True
                print(f"Libro ya abierto: {w.FullName}")
                break

        if wb is None:
            wb = excel.Workbooks.Open(str(TARGET.resolve()), UpdateLinks=0, ReadOnly=False)
            print(f"Abierto: {TARGET}")

        if wb.ReadOnly:
            raise RuntimeError(
                "El archivo está en SOLO LECTURA. Ciérralo en Excel (sin guardar la copia vieja) e intenta de nuevo."
            )

        calc = wb.Worksheets("CALCULOS")
        try:
            calc.Unprotect(PASSWORD)
        except Exception:
            try:
                calc.Unprotect()
            except Exception:
                pass

        print("Estado actual B18/B19/B20:")
        for r in (18, 19, 20):
            print(f"  B{r} formula={calc.Range(f'B{r}').Formula!r} value={calc.Range(f'B{r}').Value!r}")

        calc.Range("B18").Formula = "=B42"
        calc.Range("B19").Formula = "=B45"
        calc.Range("B20").Formula = "=B50"
        for r, vrow in ((18, 42), (19, 45), (20, 50)):
            calc.Range(f"G{r}").Formula = (
                f'=IF(OR(C{r}="",D{r}=""),"",'
                f'IF(ABS(F{r})+(V{vrow})>H{vrow},"RECHAZADO","ACEPTADO"))'
            )

        # Forzar recálculo visible
        j10 = calc.Range("J10").Value
        f10 = calc.Range("F10").Value
        excel.Calculate()
        print(f"Con J10={j10!r} F10={f10!r}:")
        print(
            f"  B18={calc.Range('B18').Value} B19={calc.Range('B19').Value} "
            f"B20={calc.Range('B20').Value} B50={calc.Range('B50').Value}"
        )
        print(f"  B20 formula ahora: {calc.Range('B20').Formula!r}")

        try:
            calc.Protect(Password=PASSWORD, DrawingObjects=False, Contents=True, Scenarios=True)
        except Exception:
            pass

        wb.Save()
        print(f"Guardado: {wb.FullName}")
        if not already_open:
            wb.Close(SaveChanges=True)
            wb = None
        return 0
    except Exception as exc:
        print(f"ERROR: {exc}")
        import traceback
        traceback.print_exc()
        return 1
    finally:
        if wb is not None and not already_open:
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
