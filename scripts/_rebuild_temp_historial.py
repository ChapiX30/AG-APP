# -*- coding: utf-8 -*-
"""Reconstruye historial (CSV) + BD_Clientes y completa domicilio/contacto."""
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
PASSWORD = "AG-Calidad-2026"
API_BASE = (
    "https://us-central1-agg1-b7f40.cloudfunctions.net/obtenerDatosExcel"
    "?key=TU_CLAVE_SECRETA_AG_APP_2026"
)

MASTERS = [
    {"file": "Formato Hornos y Muflas.xlsm", "calc": "Calculos", "prefixes": ["AGT"]},
    {"file": "Formato Termohigrometro.xlsm", "calc": "Calculos", "prefixes": ["AGH"]},
    {"file": "Formato Termometro IR.xlsm", "calc": "Muestreo", "prefixes": ["AGT"]},
]

HIST_HEADERS = [
    "Name", "certificado", "cliente", "equipo", "marca", "modelo", "serie", "id",
    "fecha", "tecnico", "lugarCalibracion", "frecuenciaCalibracion", "fechaRecepcion",
    "domicilio", "contacto", "correo", "telefono",
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


def fetch_clientes() -> list[dict]:
    data = json.loads(download(f"{API_BASE}&formato=clientes"))
    return data if isinstance(data, list) else []


def fetch_historial_rows(prefixes: list[str]) -> list[list[str]]:
    """Descarga CSV por prefijo (todos los años que traiga el endpoint)."""
    seen = set()
    rows: list[list[str]] = []
    for pref in prefixes:
        # sin anio = todos; con anio actual también
        for extra in ("", "&anio=26", "&anio=25", "&anio=24"):
            url = f"{API_BASE}&prefijo={pref}&formato=csv{extra}"
            try:
                text = download(url)
            except Exception as e:
                print("  aviso CSV", pref, extra, e)
                continue
            reader = csv.reader(io.StringIO(text))
            for i, cols in enumerate(reader):
                if not cols or len(cols) < 2:
                    continue
                cert = (cols[1] or "").strip()
                if i == 0 and cert.lower() == "certificado":
                    continue
                if not cert or cert.upper() in seen:
                    continue
                seen.add(cert.upper())
                # pad to 17 cols
                while len(cols) < 17:
                    cols.append("")
                rows.append(cols[:17])
    return rows


def build_client_index(clientes: list[dict]) -> dict[str, dict]:
    by: dict[str, dict] = {}
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


def match_client(by: dict[str, dict], cliente: str) -> dict | None:
    k = norm(cliente)
    if k in by:
        return by[k]
    for kk, vv in by.items():
        if len(kk) >= 8 and len(k) >= 8 and (
            k.startswith(kk) or kk.startswith(k) or k in kk or kk in k
        ):
            return vv
    return None


def write_sheet_rows(ws, headers: list[str], rows: list[list]) -> None:
    unprotect(ws)
    try:
        while ws.ListObjects.Count > 0:
            ws.ListObjects(1).Unlist
    except Exception:
        pass
    ws.Cells.Clear()
    for c, h in enumerate(headers, 1):
        ws.Cells(1, c).Value = h
    for r, row in enumerate(rows, 2):
        for c, val in enumerate(row, 1):
            ws.Cells(r, c).Value = val if val != "" else None


def wire_formulas(calc) -> None:
    hs = "obtenerDatosExcel"
    key = 'TRIM($D$4)&"-"&TEXT($E$4,"0000")&"-"&TEXT($F$4,"00")'
    m = f"MATCH({key},{hs}!$B:$B,0)"

    def fcol(col: str) -> str:
        return (
            f'=IFERROR(IF(OR(INDEX({hs}!${col}:${col},{m})="",'
            f'INDEX({hs}!${col}:${col},{m})=0),"",'
            f"INDEX({hs}!${col}:${col},{m})),\"\")"
        )

    calc.Range("B5").Formula = fcol("C")
    calc.Range("B6").Formula = fcol("N")
    calc.Range("B7").Formula = fcol("O")
    calc.Range("E5").Formula = fcol("P")
    calc.Range("E6").Formula = fcol("Q")

    # Fechas también
    calc.Range("I4").Formula = (
        "=IFERROR("
        f'IF(INDEX({hs}!$M:$M,{m})="",'
        f'IF(UPPER(LEFT(INDEX({hs}!$K:$K,{m}),1))="S","Servicio en Sitio",""),'
        f"VALUE(INDEX({hs}!$M:$M,{m}))),"
        f'IF(IFERROR(UPPER(LEFT(INDEX({hs}!$K:$K,{m}),1)),"")="S","Servicio en Sitio",""))'
    )
    calc.Range("I5").Formula = f'=IFERROR(VALUE(INDEX({hs}!$I:$I,{m})),"")'
    calc.Range("I6").Formula = (
        f'=IFERROR(EDATE($I$5,IF(INDEX({hs}!$L:$L,{m})="6 meses",6,'
        f'IF(INDEX({hs}!$L:$L,{m})="3 meses",3,'
        f'IF(INDEX({hs}!$L:$L,{m})="24 meses",24,12)))),"")'
    )
    calc.Range("I7").Formula = "=TODAY()"


def main() -> int:
    print("Descargando clientes…")
    clientes = fetch_clientes()
    by = build_client_index(clientes)
    print(f"  {len(clientes)} clientes, {len(by)} keys")

    # Cache historial por prefijo
    hist_cache: dict[str, list[list[str]]] = {}

    pythoncom.CoInitialize()
    excel = win32com.client.DispatchEx("Excel.Application")
    excel.Visible = False
    excel.DisplayAlerts = False
    excel.EnableEvents = False

    try:
        for cfg in MASTERS:
            path = FOLDER / cfg["file"]
            print(f"\n=== {path.name} ===")
            pref_key = ",".join(cfg["prefixes"])
            if pref_key not in hist_cache:
                print(f"  Descargando historial {cfg['prefixes']}…")
                hist_cache[pref_key] = fetch_historial_rows(cfg["prefixes"])
                print(f"  {len(hist_cache[pref_key])} certificados")

            rows = []
            filled = 0
            for cols in hist_cache[pref_key]:
                row = list(cols)
                while len(row) < 17:
                    row.append("")
                m = match_client(by, str(row[2] or ""))
                if m:
                    row[13] = m["dom"]
                    row[14] = m["con"]
                    row[15] = m["cor"]
                    row[16] = m["tel"]
                    filled += 1
                rows.append(row)

            wb = excel.Workbooks.Open(str(path), UpdateLinks=0, ReadOnly=False)
            hist = wb.Worksheets("obtenerDatosExcel")
            cli = wb.Worksheets("BD_Clientes")
            calc = wb.Worksheets(cfg["calc"])
            hist.Visible = -1
            cli.Visible = -1
            unprotect(hist)
            unprotect(cli)
            unprotect(calc)

            # BD_Clientes
            cli_rows = []
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
            write_sheet_rows(cli, ["Nombre", "Domicilio", "Contacto", "Correo", "Telefono"], cli_rows)
            write_sheet_rows(hist, HIST_HEADERS, rows)
            print(f"  Historial escrito: {len(rows)} (con domicilio: {filled})")
            print(f"  Clientes escritos: {len(cli_rows)}")

            wire_formulas(calc)

            # Prueba Termohigrometro
            if "Termohigrometro" in cfg["file"] and rows:
                # buscar un AGH-*-26
                sample = next((r for r in rows if str(r[1]).startswith("AGH-") and str(r[1]).endswith("-26")), rows[0])
                parts = str(sample[1]).split("-")
                calc.Range("D4").Value = parts[0]
                calc.Range("E4").Value = int(re.sub(r"\D", "", parts[1]) or 0)
                calc.Range("F4").Value = int(re.sub(r"\D", "", parts[2]) or 26)
                excel.Calculate()
                print("  TEST", sample[1])
                print("   Cliente", calc.Range("B5").Value)
                print("   Dom", calc.Range("B6").Value)
                print("   Contacto", calc.Range("B7").Value)
                print("   Correo", calc.Range("E5").Value)
                print("   Tel", calc.Range("E6").Value)
                print("   Fecha cal", calc.Range("I5").Value)
                calc.Range("E4").ClearContents()

            hist.Visible = 2
            cli.Visible = 2
            calc.Protect(Password=PASSWORD, DrawingObjects=False, Contents=True, Scenarios=True)
            hist.Protect(Password=PASSWORD, DrawingObjects=False, Contents=True, Scenarios=True)
            cli.Protect(Password=PASSWORD, DrawingObjects=False, Contents=True, Scenarios=True)
            wb.Save()
            wb.Close(True)
            print("  Guardado")
    finally:
        excel.Quit()
        pythoncom.CoUninitialize()

    print("\nListo.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
