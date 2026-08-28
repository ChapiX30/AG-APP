# -*- coding: utf-8 -*-
"""Rellena historial/clientes/patrones del Angle meter desde la API (sin OLEDB)."""
from __future__ import annotations

import json
import re
import sys
import urllib.request
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace", line_buffering=True)

import pythoncom
import win32com.client

PATH = Path(r"C:\Users\AG\Desktop\FORMATOS AG\Formato Angle meter.xlsm")
PASSWORD = "AG-Calidad-2026"
API = "https://us-central1-agg1-b7f40.cloudfunctions.net/obtenerDatosExcel?key=TU_CLAVE_SECRETA_AG_APP_2026"

ANGLE_RE = re.compile(
    r"ANGLE|ANGULO|ÁNGULO|PROTRACT|GONIO|INCLINO|NIVEL DIGITAL|DIGITAL LEVEL|"
    r"DIGITAL PROTRACTOR|MEDIDOR DE ANG|MEDIDOR DE ÁNG|DUAL AXIS",
    re.I,
)

HIST_HEADERS = [
    "Name", "certificado", "cliente", "equipo", "marca", "modelo", "serie", "id",
    "fecha", "tecnico", "lugarCalibracion", "frecuenciaCalibracion", "fechaRecepcion",
    "domicilio", "contacto", "correo", "telefono",
]
CLIENT_HEADERS = ["Nombre", "Domicilio", "Contacto", "Correo", "Telefono"]
PATRON_HEADERS = [
    "noControl", "descripcion", "marca", "modelo", "serie", "noCertificado",
    "fechaUltimaCalibracion", "fechaVencimiento", "estadoProceso", "statusVigencia",
    "laboratorio",
]


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


def clear_sheet(ws) -> None:
    while ws.ListObjects.Count > 0:
        ws.ListObjects(1).Delete()
    ws.Cells.Clear()


def write_table(ws, headers: list[str], rows: list[list]) -> None:
    clear_sheet(ws)
    for c, h in enumerate(headers, 1):
        ws.Cells(1, c).Value = h
    for r, row in enumerate(rows, 2):
        for c, val in enumerate(row, 1):
            ws.Cells(r, c).Value = val if val is not None else ""


def fetch_json(url: str):
    with urllib.request.urlopen(url, timeout=90) as resp:
        return json.load(resp)


def main() -> int:
    print("Descargando API…")
    data = fetch_json(API)
    clientes_raw = data.get("clientes") or []
    hist_raw = data.get("historial") or []
    patrones_raw = fetch_json(API + "&formato=patrones")

    cli_by_key = {}
    clientes_rows = []
    for c in clientes_raw:
        row = [c.get(h, "") or "" for h in CLIENT_HEADERS]
        clientes_rows.append(row)
        cli_by_key[norm_name(str(c.get("Nombre") or ""))] = c

    hist_rows = []
    for h in hist_raw:
        cert = str(h.get("certificado") or "")
        if not cert.upper().startswith("AGD-"):
            continue
        equipo = str(h.get("equipo") or "")
        if not ANGLE_RE.search(equipo):
            continue
        cli = cli_by_key.get(norm_name(str(h.get("cliente") or "")), {})
        row = [h.get(k, "") or "" for k in HIST_HEADERS[:13]]
        row += [
            cli.get("Domicilio", "") or "",
            cli.get("Contacto", "") or "",
            cli.get("Correo", "") or "",
            cli.get("Telefono", "") or "",
        ]
        hist_rows.append(row)

    pat_rows = []
    for p in patrones_raw:
        nid = str(p.get("noControl") or "").upper().strip()
        desc = str(p.get("descripcion") or "").upper()
        if nid == "AG-015" or ("ANGLE" in desc and any(k in desc for k in ("ANGLE", "BLOCK", "PROTRACT", "GONIO"))):
            pat_rows.append([p.get(k, "") or "" for k in PATRON_HEADERS])

    print(f"Historial ángulo: {len(hist_rows)} | Clientes: {len(clientes_rows)} | Patrones: {len(pat_rows)}")

    pythoncom.CoInitialize()
    excel = win32com.client.DispatchEx("Excel.Application")
    excel.Visible = False
    excel.DisplayAlerts = False
    excel.EnableEvents = False
    try:
        wb = excel.Workbooks.Open(str(PATH.resolve()), UpdateLinks=0, ReadOnly=False)
        for name, headers, rows in (
            ("obtenerDatosExcel", HIST_HEADERS, hist_rows),
            ("BD_Clientes", CLIENT_HEADERS, clientes_rows),
            ("BD_Patrones", PATRON_HEADERS, pat_rows),
        ):
            ws = wb.Worksheets(name)
            try_unprotect(ws)
            write_table(ws, headers, rows)
            print("Escrito", name, "filas", 1 + len(rows))
            try:
                ws.Visible = 2  # xlVeryHidden
                ws.Protect(Password=PASSWORD, DrawingObjects=False, Contents=True, Scenarios=True)
            except Exception as e:
                print("aviso", name, e)

        # Reafirmar cableado y probar un cert
        calc = wb.Worksheets("Calculos")
        try_unprotect(calc)
        calc.Range("D4").Value = "AGD"
        calc.Range("E4").Value = 465
        calc.Range("F4").Value = 26
        excel.Calculate()
        print("Prueba AGD-0465-26:")
        print("  Cliente:", calc.Range("B5").Value)
        print("  Dom:", (calc.Range("B6").Value or "")[:70])
        print("  Instr:", calc.Range("B9").Value)
        print("  ID:", calc.Range("F9").Value)
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
