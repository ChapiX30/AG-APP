# -*- coding: utf-8 -*-
"""Corrige mapeo de fórmulas Vernier (layout distinto al Indicador)."""
from __future__ import annotations

import sys

sys.stdout.reconfigure(encoding="utf-8", errors="replace", line_buffering=True)

import pythoncom
import win32com.client

PATH = r"C:\Users\AG\Desktop\FORMATOS AG\Formato Vernier.xlsm"
PASSWORD = "AG-Calidad-2026"
HS = "obtenerDatosExcel"

KEY = 'TRIM($D$4)&"-"&TEXT($E$4,"0000")&"-"&TEXT($F$4,"00")'
M = f"MATCH({KEY},{HS}!$B:$B,0)"


def idx(col: str, blank: str = '""') -> str:
    return (
        f'=IFERROR(IF(OR(INDEX({HS}!${col}:${col},{M})="",'
        f'INDEX({HS}!${col}:${col},{M})=0),{blank},'
        f"INDEX({HS}!${col}:${col},{M})),{blank})"
    )


def unprotect(ws) -> None:
    for pwd in (PASSWORD, ""):
        try:
            if pwd:
                ws.Unprotect(Password=pwd)
            else:
                ws.Unprotect()
            return
        except Exception:
            continue


def main() -> int:
    pythoncom.CoInitialize()
    excel = win32com.client.DispatchEx("Excel.Application")
    excel.Visible = False
    excel.DisplayAlerts = False
    excel.EnableEvents = False
    try:
        excel.AutomationSecurity = 3
    except Exception:
        pass

    wb = excel.Workbooks.Open(
        PATH, UpdateLinks=0, ReadOnly=False, IgnoreReadOnlyRecommended=True, Notify=False
    )
    calc = wb.Worksheets("Calculos")
    unprotect(calc)

    # Limpiar fórmulas flotantes / duplicadas (layout Vernier)
    for addr in ("B5", "E5", "B10", "F10"):
        calc.Range(addr).ClearContents()

    # Bloque cliente — celdas junto a etiquetas Vernier
    calc.Range("B6").Formula = idx("C")  # Cliente
    calc.Range("B7").Formula = idx("N")  # Domicilio
    calc.Range("B9").Formula = idx("O")  # Contacto
    calc.Range("E6").Formula = idx("P")  # Correo
    calc.Range("E7").Formula = idx("Q")  # Tel

    # Instrumento
    calc.Range("B11").Formula = idx("D", '"No encontrado"')
    calc.Range("B12").Formula = idx("E", '"No encontrado"')
    calc.Range("B13").Formula = idx("F")
    calc.Range("B14").Formula = idx("G")
    calc.Range("F11").Formula = idx("H")

    # Fechas Vernier (ya correctas, reafirmar)
    calc.Range("I4").Formula = (
        "=IFERROR("
        f'IF(INDEX({HS}!$M:$M,{M})="",'
        f'IF(UPPER(LEFT(INDEX({HS}!$K:$K,{M}),1))="S","Servicio en Sitio",""),'
        f"VALUE(INDEX({HS}!$M:$M,{M}))),"
        f'IF(IFERROR(UPPER(LEFT(INDEX({HS}!$K:$K,{M}),1)),"")="S","Servicio en Sitio",""))'
    )
    calc.Range("I6").Formula = f'=IFERROR(VALUE(INDEX({HS}!$I:$I,{M})),"")'
    calc.Range("I7").Formula = (
        f'=IFERROR(EDATE($I$6,IF(INDEX({HS}!$L:$L,{M})="6 meses",6,'
        f'IF(INDEX({HS}!$L:$L,{M})="3 meses",3,'
        f'IF(INDEX({HS}!$L:$L,{M})="24 meses",24,12)))),"")'
    )
    calc.Range("I9").Formula = "=TODAY()"

    calc.Cells.Locked = True
    for a in ("B6", "B7", "B9", "E6", "E7", "B11", "F11", "I4", "I6", "I7", "I9"):
        try:
            calc.Range(a).Locked = True
        except Exception:
            pass

    for a in (
        "D4", "E4", "F4",
        "B12", "B13", "B14",
        "F12", "J12", "J11",
        "F13", "J13", "F14", "J14", "F15", "J15", "F16", "J16",
        "H24",
        "C27:E40", "F27:H40",
    ):
        try:
            calc.Range(a).Locked = False
        except Exception:
            pass

    calc.Range("D4").Value = "AGD"
    calc.Range("E4").Value = 630
    calc.Range("F4").Value = 26
    excel.Calculate()
    print("TEST AGD-0630-26")
    for a in (
        "B5", "B6", "B7", "B9", "E5", "E6", "E7",
        "B10", "B11", "B12", "B13", "B14", "F10", "F11",
    ):
        print(f"  {a}: {repr(calc.Range(a).Value)[:75]}")

    calc.Protect(
        Password=PASSWORD,
        DrawingObjects=False,
        Contents=True,
        Scenarios=True,
        UserInterfaceOnly=True,
    )
    wb.Save()
    wb.Close(True)
    excel.Quit()
    pythoncom.CoUninitialize()
    print("OK Vernier")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
