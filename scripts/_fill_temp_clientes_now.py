# -*- coding: utf-8 -*-
from __future__ import annotations

import json
import re
import sys
import unicodedata
import urllib.request
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace", line_buffering=True)

import pythoncom
import win32com.client

FOLDER = Path(r"C:\Users\AG\Desktop\FORMATOS AG")
PASSWORD = "AG-Calidad-2026"
API = (
    "https://us-central1-agg1-b7f40.cloudfunctions.net/obtenerDatosExcel"
    "?key=TU_CLAVE_SECRETA_AG_APP_2026&formato=clientes"
)

MASTERS = [
    ("Formato Hornos y Muflas.xlsm", "Calculos"),
    ("Formato Termohigrometro.xlsm", "Calculos"),
    ("Formato Termometro IR.xlsm", "Muestreo"),
]


def norm(texto: str) -> str:
    t = (texto or "").upper().strip()
    if "(" in t:
        t = t.split("(", 1)[0].strip()
    t = "".join(
        c for c in unicodedata.normalize("NFD", t) if unicodedata.category(c) != "Mn"
    )
    t = re.sub(r"[^A-Z0-9 ]+", " ", t)
    return re.sub(r"\s+", " ", t).strip()


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
    clientes = json.loads(urllib.request.urlopen(API, timeout=90).read().decode("utf-8"))
    by: dict[str, dict] = {}
    for c in clientes:
        nombre = str(c.get("Nombre") or "").strip()
        if not nombre:
            continue
        k = norm(nombre)
        if k and k not in by:
            by[k] = {
                "dom": c.get("Domicilio") or "",
                "con": c.get("Contacto") or "",
                "cor": c.get("Correo") or "",
                "tel": c.get("Telefono") or "",
            }
    print(f"Clientes index: {len(by)}")

    pythoncom.CoInitialize()
    excel = win32com.client.DispatchEx("Excel.Application")
    excel.Visible = False
    excel.DisplayAlerts = False
    excel.EnableEvents = False

    try:
        for fn, calc_name in MASTERS:
            path = FOLDER / fn
            wb = excel.Workbooks.Open(str(path), UpdateLinks=0, ReadOnly=False)
            hist = wb.Worksheets("obtenerDatosExcel")
            calc = wb.Worksheets(calc_name)
            hist.Visible = -1
            unprotect(hist)
            unprotect(calc)

            last = int(hist.Cells(hist.Rows.Count, 2).End(-4162).Row)
            print(f"\n{fn}: hist rows={last}")
            filled = 0
            miss = 0
            for r in range(2, last + 1):
                cli = str(hist.Cells(r, 3).Value or "").strip()
                if not cli:
                    continue
                k = norm(cli)
                m = by.get(k)
                if not m:
                    for kk, vv in by.items():
                        if len(kk) >= 8 and len(k) >= 8 and (
                            k.startswith(kk) or kk.startswith(k) or k in kk or kk in k
                        ):
                            m = vv
                            break
                if not m:
                    miss += 1
                    continue
                hist.Cells(r, 14).Value = m["dom"]
                hist.Cells(r, 15).Value = m["con"]
                hist.Cells(r, 16).Value = m["cor"]
                hist.Cells(r, 17).Value = m["tel"]
                filled += 1
            print(f"  filled={filled} miss={miss} sample N={hist.Cells(2, 14).Value!r}")

            hs = "obtenerDatosExcel"
            key = 'TRIM($D$4)&"-"&TEXT($E$4,"0000")&"-"&TEXT($F$4,"00")'
            mexp = f"MATCH({key},{hs}!$B:$B,0)"

            def fcol(col: str) -> str:
                return (
                    f'=IFERROR(IF(OR(INDEX({hs}!${col}:${col},{mexp})="",'
                    f'INDEX({hs}!${col}:${col},{mexp})=0),"",'
                    f"INDEX({hs}!${col}:${col},{mexp})),\"\")"
                )

            calc.Range("B5").Formula = fcol("C")
            calc.Range("B6").Formula = fcol("N")
            calc.Range("B7").Formula = fcol("O")
            calc.Range("E5").Formula = fcol("P")
            calc.Range("E6").Formula = fcol("Q")

            if "Termohigrometro" in fn:
                calc.Range("D4").Value = "AGH"
                calc.Range("E4").Value = 14
                calc.Range("F4").Value = 26
                excel.Calculate()
                print("  TEST AGH-0014-26:")
                print("   B5", calc.Range("B5").Value)
                print("   B6", calc.Range("B6").Value)
                print("   B7", calc.Range("B7").Value)
                print("   E5", calc.Range("E5").Value)
                print("   E6", calc.Range("E6").Value)
                calc.Range("E4").ClearContents()

            hist.Visible = 2
            calc.Protect(Password=PASSWORD, DrawingObjects=False, Contents=True, Scenarios=True)
            hist.Protect(Password=PASSWORD, DrawingObjects=False, Contents=True, Scenarios=True)
            wb.Save()
            wb.Close(True)
            print("  Guardado")
    finally:
        excel.Quit()
        pythoncom.CoUninitialize()
    print("\nDONE")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
