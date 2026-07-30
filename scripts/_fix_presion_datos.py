# -*- coding: utf-8 -*-
"""
Arregla Formato master Presion:
- Completa Historial (AGP) desde API + domicilio/contacto/correo/tel
- Reafirma fórmulas en Calculos
- Protege con COM (rápido)

IMPORTANTE: no usar openpyxl.save() sobre este .xlsm — borra los botones/shapes.
Todo el I/O del workbook va por Excel COM.
"""
from __future__ import annotations

import csv
import io
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
TARGET = FOLDER / "Formato master Presion.xlsm"
PASSWORD = "AG-Calidad-2026"
API = (
    "https://us-central1-agg1-b7f40.cloudfunctions.net/obtenerDatosExcel"
    "?key=TU_CLAVE_SECRETA_AG_APP_2026"
)

HEADERS = [
    "Name", "certificado", "cliente", "equipo", "marca", "modelo", "serie", "id",
    "fecha", "tecnico", "lugarCalibracion", "frecuenciaCalibracion", "fechaRecepcion",
    "domicilio", "contacto", "correo", "telefono",
]

UNLOCK = [
    "D4", "E4", "F4",
    "B10", "B11", "B12",
    "F10", "J9", "J10", "J14", "K5",
    "B13", "F15", "L6", "L7",
    "F13", "F14",
    "C20:D22", "F20:G22",
    "A27:F38", "H27:K38",
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


def download(url: str) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": "AG-Formatos/1.0"})
    with urllib.request.urlopen(req, timeout=120) as r:
        raw = r.read()
    if raw.startswith(b"\xef\xbb\xbf"):
        raw = raw[3:]
    return raw.decode("utf-8", errors="replace")


def fetch_clientes():
    return json.loads(download(f"{API}&formato=clientes"))


def fetch_agp_rows():
    seen = set()
    rows = []
    for extra in ("", "&anio=26", "&anio=25", "&anio=24"):
        url = f"{API}&prefijo=AGP&formato=csv{extra}"
        try:
            text = download(url)
        except Exception as e:
            print("  aviso CSV", extra, e)
            continue
        for i, cols in enumerate(csv.reader(io.StringIO(text))):
            if not cols or len(cols) < 2:
                continue
            cert = (cols[1] or "").strip()
            if i == 0 and cert.lower() == "certificado":
                continue
            if not cert.upper().startswith("AGP-"):
                continue
            key = cert.upper()
            if key in seen:
                continue
            seen.add(key)
            while len(cols) < 17:
                cols.append("")
            rows.append([(c if c is not None else "") for c in cols[:17]])
    return rows


def client_index(clientes):
    by = {}
    for c in clientes:
        nombre = str(c.get("Nombre") or "").strip()
        if not nombre:
            continue
        k = norm(nombre)
        if k and k not in by:
            by[k] = {
                "dom": c.get("Domicilio") or c.get("direccion") or "",
                "con": c.get("Contacto") or c.get("contacto") or "",
                "cor": c.get("Correo") or c.get("email") or "",
                "tel": c.get("Telefono") or c.get("telefono") or "",
            }
    return by


def match_cli(by, cliente):
    k = norm(cliente)
    if k in by:
        return by[k]
    for kk, vv in by.items():
        if len(kk) >= 8 and len(k) >= 8 and (
            k.startswith(kk) or kk.startswith(k) or k in kk or kk in k
        ):
            return vv
    return None


def idx(col: str, blank: str = '""') -> str:
    key = 'TRIM($D$4)&"-"&TEXT($E$4,"0000")&"-"&TEXT($F$4,"00")'
    m = f"MATCH({key},Historial!$B:$B,0)"
    return (
        f'=IFERROR(IF(OR(INDEX(Historial!${col}:${col},{m})="",'
        f'INDEX(Historial!${col}:${col},{m})=0),{blank},'
        f"INDEX(Historial!${col}:${col},{m})),{blank})"
    )


def write_block(ws, start_row: int, rows: list[list]) -> None:
    if not rows:
        return
    n_cols = max(len(r) for r in rows)
    n_rows = len(rows)
    data = []
    for r in rows:
        padded = list(r) + [""] * (n_cols - len(r))
        data.append([("" if v is None else v) for v in padded[:n_cols]])
    end_row = start_row + n_rows - 1
    ws.Range(ws.Cells(start_row, 1), ws.Cells(end_row, n_cols)).Value = data


def main() -> int:
    print("Descargando clientes y AGP…")
    clientes = fetch_clientes()
    by = client_index(clientes)
    agp = fetch_agp_rows()
    print(f"  clientes={len(clientes)} agp={len(agp)}")

    filled = 0
    for row in agp:
        if not (row[13] and row[15] and row[16]):
            m = match_cli(by, str(row[2] or ""))
            if m:
                row[13] = row[13] or m["dom"]
                row[14] = row[14] or m["con"]
                row[15] = row[15] or m["cor"]
                row[16] = row[16] or m["tel"]
                filled += 1
    print(f"  join cliente en {filled} filas AGP")

    pythoncom.CoInitialize()
    excel = win32com.client.DispatchEx("Excel.Application")
    excel.Visible = False
    excel.DisplayAlerts = False
    excel.AskToUpdateLinks = False
    excel.EnableEvents = False
    excel.ScreenUpdating = False
    try:
        excel.AutomationSecurity = 3
    except Exception:
        pass

    print("Abriendo workbook (COM)…")
    wb = excel.Workbooks.Open(
        str(TARGET),
        UpdateLinks=0,
        ReadOnly=False,
        IgnoreReadOnlyRecommended=True,
        Notify=False,
        AddToMru=False,
    )
    print("  abierto OK; shapes=", wb.Worksheets("Calculos").Shapes.Count)
    try:
        excel.Calculation = -4135
    except Exception:
        pass

    calc = wb.Worksheets("Calculos")
    hist = wb.Worksheets("Historial")
    try:
        cli = wb.Worksheets("BD_Clientes")
    except Exception:
        cli = None

    unprotect(calc)
    unprotect(hist)
    if cli:
        unprotect(cli)

    if cli is not None:
        try:
            while cli.ListObjects.Count > 0:
                cli.ListObjects(1).Unlist
        except Exception:
            pass
        cli.Cells.Clear()
        cli_rows = [["Nombre", "Domicilio", "Contacto", "Correo", "Telefono"]]
        for c in clientes:
            nombre = c.get("Nombre") or ""
            if not str(nombre).strip():
                continue
            cli_rows.append([
                nombre,
                c.get("Domicilio") or c.get("direccion") or "",
                c.get("Contacto") or c.get("contacto") or "",
                c.get("Correo") or c.get("email") or "",
                c.get("Telefono") or c.get("telefono") or "",
            ])
        write_block(cli, 1, cli_rows)
        print(f"  BD_Clientes: {len(cli_rows)-1}")

    try:
        while hist.ListObjects.Count > 0:
            hist.ListObjects(1).Unlist
    except Exception:
        pass

    last = int(hist.Cells(hist.Rows.Count, 2).End(-4162).Row)
    keep = []
    if last >= 2:
        block = hist.Range(hist.Cells(2, 1), hist.Cells(last, 17)).Value
        if block is not None:
            for row in block:
                cert = str(row[1] or "").strip()
                if not cert or cert.upper().startswith("AGP-"):
                    continue
                keep.append([("" if v is None else v) for v in row])
    print(f"  Historial keep non-AGP: {len(keep)} + AGP: {len(agp)}")

    hist.Cells.Clear()
    write_block(hist, 1, [HEADERS] + keep + agp)

    calc.Range("B5").Formula = idx("C")
    calc.Range("B6").Formula = idx("N")
    calc.Range("B7").Formula = idx("O")
    calc.Range("E5").Formula = idx("P")
    calc.Range("E6").Formula = idx("Q")
    calc.Range("B9").Formula = idx("D", '"No encontrado"')
    calc.Range("B10").Formula = idx("E", '"No encontrado"')
    calc.Range("B11").Formula = idx("F")
    calc.Range("B12").Formula = idx("G")
    calc.Range("F9").Formula = idx("H")

    key = 'TRIM($D$4)&"-"&TEXT($E$4,"0000")&"-"&TEXT($F$4,"00")'
    m = f"MATCH({key},Historial!$B:$B,0)"
    calc.Range("I4").Formula = (
        "=IFERROR("
        f'IF(INDEX(Historial!$M:$M,{m})="",'
        f'IF(UPPER(LEFT(INDEX(Historial!$K:$K,{m}),1))="S","Servicio en Sitio",""),'
        f"VALUE(INDEX(Historial!$M:$M,{m}))),"
        f'IF(IFERROR(UPPER(LEFT(INDEX(Historial!$K:$K,{m}),1)),"")="S","Servicio en Sitio",""))'
    )
    calc.Range("I5").Formula = f'=IFERROR(VALUE(INDEX(Historial!$I:$I,{m})),"")'
    calc.Range("I6").Formula = (
        f'=IFERROR(EDATE($I$5,IF(INDEX(Historial!$L:$L,{m})="6 meses",6,'
        f'IF(INDEX(Historial!$L:$L,{m})="3 meses",3,'
        f'IF(INDEX(Historial!$L:$L,{m})="24 meses",24,12)))),"")'
    )
    calc.Range("I7").Formula = "=TODAY()"

    calc.Cells.Locked = True
    for a in UNLOCK:
        try:
            rng = calc.Range(a)
            if rng.MergeCells:
                rng.MergeArea.Locked = False
            else:
                rng.Locked = False
        except Exception:
            pass

    # NO tocar botones / shapes
    print("  shapes (intactos):", calc.Shapes.Count)

    try:
        hist.Visible = 2
    except Exception:
        pass
    if cli:
        try:
            cli.Visible = 2
        except Exception:
            pass
    for ws in (calc, hist):
        try:
            ws.Protect(
                Password=PASSWORD,
                DrawingObjects=False,
                Contents=True,
                Scenarios=True,
                UserInterfaceOnly=True,
            )
        except Exception:
            pass
    if cli:
        try:
            cli.Protect(
                Password=PASSWORD,
                DrawingObjects=False,
                Contents=True,
                Scenarios=True,
                UserInterfaceOnly=True,
            )
        except Exception:
            pass

    try:
        excel.Calculation = -4105
    except Exception:
        pass
    excel.ScreenUpdating = True
    wb.Save()
    wb.Close(True)
    excel.Quit()
    pythoncom.CoUninitialize()
    print("\nListo Presión (botones intactos).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
