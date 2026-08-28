# -*- coding: utf-8 -*-
"""Angle meter: historial AGD+AGDT, dropdown D4, AutoSync sin filtro de equipo."""
from __future__ import annotations

import json
import re
import sys
import urllib.request
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace", line_buffering=True)
sys.path.insert(0, str(Path(__file__).resolve().parent))

import pythoncom
import win32com.client

import setup_master_angle_meter as setup

PATH = Path(r"C:\Users\AG\Desktop\FORMATOS AG\Formato Angle meter.xlsm")
PASSWORD = setup.PASSWORD
API = setup.API_BASE
HIST_HEADERS = setup.HIST_COLUMNS + ["domicilio", "contacto", "correo", "telefono"]


def try_unprotect(ws) -> None:
    for pwd in (PASSWORD, ""):
        try:
            if pwd:
                ws.Unprotect(Password=pwd)
            else:
                ws.Unprotect()
            return
        except Exception:
            continue


def norm_name(valor: str) -> str:
    t = (valor or "").upper().strip()
    if "(" in t:
        t = t.split("(", 1)[0].strip()
    for a, b in (("Á", "A"), ("É", "E"), ("Í", "I"), ("Ó", "O"), ("Ú", "U"), ("Ü", "U"), ("Ñ", "N")):
        t = t.replace(a, b)
    t = re.sub(r"[^A-Z0-9 ]+", "", t)
    return re.sub(r"\s+", " ", t).strip()


def main() -> int:
    print("Descargando AGD + AGDT…")
    with urllib.request.urlopen(API, timeout=90) as resp:
        data = json.load(resp)
    clientes_raw = data.get("clientes") or []
    hist_raw = data.get("historial") or []
    cli_by_key = {norm_name(str(c.get("Nombre") or "")): c for c in clientes_raw}

    hist_rows = []
    for h in hist_raw:
        cert = str(h.get("certificado") or "").strip().upper()
        if not (cert.startswith("AGD-") or cert.startswith("AGDT-")):
            continue
        cli = cli_by_key.get(norm_name(str(h.get("cliente") or "")), {})
        row = [h.get(k, "") or "" for k in setup.HIST_COLUMNS]
        row += [
            cli.get("Domicilio", "") or "",
            cli.get("Contacto", "") or "",
            cli.get("Correo", "") or "",
            cli.get("Telefono", "") or "",
        ]
        hist_rows.append(row)
    print("Filas:", len(hist_rows))

    pythoncom.CoInitialize()
    excel = win32com.client.DispatchEx("Excel.Application")
    excel.Visible = False
    excel.DisplayAlerts = False
    excel.EnableEvents = False
    try:
        wb = excel.Workbooks.Open(str(PATH.resolve()), UpdateLinks=0, ReadOnly=False)
        setup.set_module(wb.VBProject, "AG_AutoSync", setup.build_autosync_vba(["AGD", "AGDT"]))

        ws = wb.Worksheets("obtenerDatosExcel")
        try_unprotect(ws)
        while ws.ListObjects.Count > 0:
            ws.ListObjects(1).Delete()
        ws.Cells.Clear()
        ncols = len(HIST_HEADERS)
        ws.Range(ws.Cells(1, 1), ws.Cells(1, ncols)).Value = [HIST_HEADERS]
        if hist_rows:
            block = [
                [(v if v is not None else "") for v in row] + [""] * (ncols - len(row))
                for row in hist_rows
            ]
            ws.Range(ws.Cells(2, 1), ws.Cells(1 + len(block), ncols)).Value = block
        try:
            ws.Visible = 2
            ws.Protect(Password=PASSWORD, DrawingObjects=False, Contents=True, Scenarios=True)
        except Exception as e:
            print("aviso hist", e)

        calc = wb.Worksheets("Calculos")
        try_unprotect(calc)
        calc.Range("D4").Value = "AGD"
        calc.Range("F4").Value = 26
        try:
            calc.Range("D4").Validation.Delete()
        except Exception:
            pass
        calc.Range("D4").Validation.Add(Type=3, AlertStyle=1, Operator=1, Formula1="AGD,AGDT")
        calc.Range("D4").Validation.IgnoreBlank = True
        calc.Range("D4").Validation.InCellDropdown = True
        calc.Range("D4").Locked = False

        calc.Range("E4").Value = 465
        excel.Calculate()
        print("Prueba AGD-0465-26:", calc.Range("B5").Value, "|", calc.Range("B9").Value)
        calc.Range("D4").Value = "AGDT"
        calc.Range("E4").Value = 1
        excel.Calculate()
        print("Prueba AGDT-0001-26:", calc.Range("B5").Value, "|", calc.Range("B9").Value)
        calc.Range("D4").Value = "AGD"
        calc.Range("E4").ClearContents()
        calc.Protect(Password=PASSWORD, DrawingObjects=False, Contents=True, Scenarios=True)

        wb.Save()
        wb.Close(True)
        print("OK")
        return 0
    except Exception as e:
        print("ERROR:", e)
        import traceback
        traceback.print_exc()
        return 1
    finally:
        excel.Quit()
        pythoncom.CoUninitialize()


if __name__ == "__main__":
    raise SystemExit(main())
