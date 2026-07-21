#!/usr/bin/env python3
"""Corrige Fecha de Recepcion (I4) vs Lugar (C14) en master Presion."""
from __future__ import annotations

import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
import openpyxl
from openpyxl.styles import Font

PATH = Path(r"C:\Users\AG\Desktop\FORMATOS AG\Formato master auto Presion_clase.xlsm")

F_LUGAR = (
    '=IFERROR(VLOOKUP($D$4 & "-" & TEXT($E$4,"0000") & "-" & $F$4,'
    'AG_Historial[[certificado]:[lugarCalibracion]],10,FALSE),"")'
)

F_RECEPCION = (
    '=IFERROR('
    'IF(VLOOKUP($D$4 & "-" & TEXT($E$4,"0000") & "-" & $F$4,'
    'AG_Historial[[certificado]:[fechaRecepcion]],12,FALSE)="",'
    'IF(OR(K4="Sitio",K4="sitio"),"Servicio en Sitio",""),'
    'VALUE(VLOOKUP($D$4 & "-" & TEXT($E$4,"0000") & "-" & $F$4,'
    'AG_Historial[[certificado]:[fechaRecepcion]],12,FALSE))),'
    'IF(OR(K4="Sitio",K4="sitio"),"Servicio en Sitio",""))'
)

F_C14 = (
    '=IF(OR(K4="Laboratorio",K4="laboratorio"),"Instalaciones AG",'
    'IF(OR(K4="Sitio",K4="sitio"),"Instalaciones de Cliente",""))'
)


def main() -> int:
    if not PATH.exists():
        print("No existe", PATH)
        return 1
    try:
        wb = openpyxl.load_workbook(PATH, keep_vba=True)
    except PermissionError:
        print("Cierra el Excel e intenta de nuevo.")
        return 1

    calc = wb["Calculos"]
    calc["H4"].value = "Fecha de Recepción:"
    calc["I4"].value = F_RECEPCION
    calc["K4"].value = F_LUGAR
    calc["L4"].value = "<- Lugar (Sitio/Lab)"
    calc["L4"].font = Font(italic=True, size=8, color="888888")
    calc["C14"].value = F_C14

    try:
        wb.save(PATH)
        print("Guardado:", PATH)
    except PermissionError:
        alt = PATH.with_name(PATH.stem + "_recepcion" + PATH.suffix)
        wb.save(alt)
        print("Abierto. Guardado como:", alt)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
