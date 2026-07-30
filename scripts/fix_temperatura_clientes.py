# -*- coding: utf-8 -*-
"""
Arregla domicilio/contacto/correo/tel en masters de temperatura:
1) Carga BD_Clientes desde la API
2) Completa columnas N:Q del historial por nombre de cliente
3) Fórmulas que no muestren 0 cuando el dato está vacío
"""
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
API_CLIENTES = (
    "https://us-central1-agg1-b7f40.cloudfunctions.net/obtenerDatosExcel"
    "?key=TU_CLAVE_SECRETA_AG_APP_2026&formato=clientes"
)

MASTERS = [
    {"file": "Formato Hornos y Muflas.xlsm", "calc": "Calculos"},
    {"file": "Formato Termohigrometro.xlsm", "calc": "Calculos"},
    {"file": "Formato Termometro IR.xlsm", "calc": "Muestreo"},
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


def fetch_clientes() -> list[dict]:
    with urllib.request.urlopen(API_CLIENTES, timeout=90) as r:
        data = json.loads(r.read().decode("utf-8"))
    if not isinstance(data, list):
        raise RuntimeError("API clientes no devolvió lista")
    return data


def text_or_blank(formula_index: str) -> str:
    """Evita que INDEX de celda vacía muestre 0."""
    return (
        f'=IFERROR(IF(OR(INDEX({formula_index})="",INDEX({formula_index})=0),"",'
        f"INDEX({formula_index})),\"\")"
    )


def wire_client_formulas(calc) -> None:
    hs = "obtenerDatosExcel"
    key = 'TRIM($D$4)&"-"&TEXT($E$4,"0000")&"-"&TEXT($F$4,"00")'
    m = f"MATCH({key},{hs}!$B:$B,0)"

    def idx(col: str) -> str:
        return f"{hs}!${col}:${col},{m}"

    calc.Range("B5").Formula = (
        f'=IFERROR(IF(OR(INDEX({idx("C")})="",INDEX({idx("C")})=0),"",INDEX({idx("C")})),"")'
    )
    calc.Range("B6").Formula = (
        f'=IFERROR(IF(OR(INDEX({idx("N")})="",INDEX({idx("N")})=0),"",INDEX({idx("N")})),"")'
    )
    calc.Range("B7").Formula = (
        f'=IFERROR(IF(OR(INDEX({idx("O")})="",INDEX({idx("O")})=0),"",INDEX({idx("O")})),"")'
    )
    calc.Range("E5").Formula = (
        f'=IFERROR(IF(OR(INDEX({idx("P")})="",INDEX({idx("P")})=0),"",INDEX({idx("P")})),"")'
    )
    calc.Range("E6").Formula = (
        f'=IFERROR(IF(OR(INDEX({idx("Q")})="",INDEX({idx("Q")})=0),"",INDEX({idx("Q")})),"")'
    )


def fill_bd_clientes(ws, clientes: list[dict]) -> int:
    try_unprotect(ws)
    try:
        while ws.ListObjects.Count > 0:
            ws.ListObjects(1).Unlist
    except Exception:
        pass
    ws.Cells.Clear()
    headers = ["Nombre", "Domicilio", "Contacto", "Correo", "Telefono"]
    for c, h in enumerate(headers, 1):
        ws.Cells(1, c).Value = h
    row = 2
    for cli in clientes:
        nombre = cli.get("Nombre") or cli.get("nombre") or ""
        if not str(nombre).strip():
            continue
        ws.Cells(row, 1).Value = nombre
        ws.Cells(row, 2).Value = cli.get("Domicilio") or cli.get("direccion") or ""
        ws.Cells(row, 3).Value = cli.get("Contacto") or cli.get("contacto") or ""
        ws.Cells(row, 4).Value = cli.get("Correo") or cli.get("email") or ""
        ws.Cells(row, 5).Value = cli.get("Telefono") or cli.get("telefono") or ""
        row += 1
    return row - 2


def complete_historial_nq(ws_hist, clientes: list[dict]) -> int:
    try_unprotect(ws_hist)
    # mapa normalizado -> datos
    by_norm: dict[str, dict] = {}
    for cli in clientes:
        nombre = str(cli.get("Nombre") or cli.get("nombre") or "").strip()
        if not nombre:
            continue
        key = norm(nombre)
        if key and key not in by_norm:
            by_norm[key] = {
                "dom": cli.get("Domicilio") or cli.get("direccion") or "",
                "con": cli.get("Contacto") or cli.get("contacto") or "",
                "cor": cli.get("Correo") or cli.get("email") or "",
                "tel": cli.get("Telefono") or cli.get("telefono") or "",
                "nombre": nombre,
            }

    last = ws_hist.Cells(ws_hist.Rows.Count, 2).End(-4162).Row
    filled = 0
    for r in range(2, last + 1):
        cliente = str(ws_hist.Cells(r, 3).Value or "").strip()
        if not cliente:
            continue
        key = norm(cliente)
        match = by_norm.get(key)
        if match is None:
            # intento parcial: empieza igual
            for k, v in by_norm.items():
                if key.startswith(k) or k.startswith(key) or key in k or k in key:
                    if len(k) >= 8 and len(key) >= 8:
                        match = v
                        break
        if match is None:
            continue
        # Solo llena si vacío
        if not str(ws_hist.Cells(r, 14).Value or "").strip():
            ws_hist.Cells(r, 14).Value = match["dom"]
        if not str(ws_hist.Cells(r, 15).Value or "").strip():
            ws_hist.Cells(r, 15).Value = match["con"]
        if not str(ws_hist.Cells(r, 16).Value or "").strip():
            ws_hist.Cells(r, 16).Value = match["cor"]
        if not str(ws_hist.Cells(r, 17).Value or "").strip():
            ws_hist.Cells(r, 17).Value = match["tel"]
        filled += 1
    return filled


def protect(ws) -> None:
    try:
        ws.Protect(Password=PASSWORD, DrawingObjects=False, Contents=True, Scenarios=True)
    except Exception:
        pass


def main() -> int:
    print("Descargando clientes…")
    clientes = fetch_clientes()
    print(f"  {len(clientes)} clientes")

    pythoncom.CoInitialize()
    excel = win32com.client.DispatchEx("Excel.Application")
    excel.Visible = False
    excel.DisplayAlerts = False
    excel.AskToUpdateLinks = False
    excel.EnableEvents = False

    try:
        for cfg in MASTERS:
            path = FOLDER / cfg["file"]
            if not path.exists():
                print("MISS", path.name)
                continue
            print(f"\n=== {path.name} ===")
            wb = excel.Workbooks.Open(str(path), UpdateLinks=0, ReadOnly=False)
            calc = wb.Worksheets(cfg["calc"])
            hist = wb.Worksheets("obtenerDatosExcel")
            cli = wb.Worksheets("BD_Clientes")
            try_unprotect(calc)
            try:
                hist.Visible = -1
            except Exception:
                pass
            try:
                cli.Visible = -1
            except Exception:
                pass
            try_unprotect(hist)
            try_unprotect(cli)

            n_cli = fill_bd_clientes(cli, clientes)
            print(f"  BD_Clientes: {n_cli}")
            n_fill = complete_historial_nq(hist, clientes)
            print(f"  Historial N:Q completados: {n_fill}")
            wire_client_formulas(calc)
            print("  Fórmulas cliente OK (sin ceros)")

            # volver a ocultar
            try:
                hist.Visible = 2
                cli.Visible = 2
            except Exception:
                pass
            protect(calc)
            protect(hist)
            protect(cli)
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
