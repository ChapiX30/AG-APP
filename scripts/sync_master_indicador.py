# -*- coding: utf-8 -*-
"""
Sincroniza Formato Indicador.xlsm con la app (prefijo AGD).

Respaldo cuando Power Query no puede conectar. No toca lecturas ni
incertidumbres: solo refresca obtenerDatosExcel / BD_Clientes / BD_Patrones.

Uso:
  python scripts/sync_master_indicador.py
  python scripts/sync_master_indicador.py --archivo "C:\\...\\Formato Indicador.xlsm"
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import unicodedata
import urllib.request
from datetime import datetime
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

import pythoncom
import win32com.client

API_URL = (
    "https://us-central1-agg1-b7f40.cloudfunctions.net/obtenerDatosExcel"
    "?key=TU_CLAVE_SECRETA_AG_APP_2026"
)
DEFAULT_MASTER = Path(r"C:\Users\AG\Desktop\FORMATOS AG\Formato Indicador.xlsm")
PASSWORD = "AG-Calidad-2026"
XL_VERY_HIDDEN = 2

HIST_SHEET = "obtenerDatosExcel"
CLI_SHEET = "BD_Clientes"
PAT_SHEET = "BD_Patrones"

HIST_HEADERS = [
    "Name", "certificado", "cliente", "equipo", "marca", "modelo", "serie", "id",
    "fecha", "tecnico", "lugarCalibracion", "frecuenciaCalibracion", "fechaRecepcion",
    "domicilio", "contacto", "correo", "telefono",
]
CLIENTE_HEADERS = ["Nombre", "Domicilio", "Contacto", "Correo", "Telefono"]
PATRON_HEADERS = [
    "noControl", "descripcion", "marca", "modelo", "serie", "noCertificado",
    "fechaUltimaCalibracion", "fechaVencimiento", "estadoProceso", "statusVigencia",
    "laboratorio",
]
DIM_IDS = {"AG-001", "AG-002", "AG-041", "AG-059"}


def fetch_json(url: str) -> dict:
    req = urllib.request.Request(url, headers={"User-Agent": "AG-IndicadorSync/1.0"})
    with urllib.request.urlopen(req, timeout=180) as resp:
        return json.loads(resp.read().decode("utf-8"))


def norm_cliente(name: str) -> str:
    s = str(name or "").strip().upper()
    s = "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")
    s = re.sub(r"\([^)]*\)", " ", s)
    s = re.sub(r"[^A-Z0-9]+", " ", s)
    s = re.sub(
        r"\b(S A DE C V|SA DE CV|S DE RL DE CV|S DE R L DE C V|SAPI DE CV|SA|CV)\b",
        " ",
        s,
    )
    return re.sub(r"\s+", " ", s).strip()


def cliente_fields(c: dict) -> dict[str, str]:
    return {
        "Nombre": str(c.get("Nombre") or c.get("nombre") or "").strip(),
        "Domicilio": str(c.get("Domicilio") or c.get("direccion") or "").strip(),
        "Contacto": str(c.get("Contacto") or c.get("contacto") or "").strip(),
        "Correo": str(c.get("Correo") or c.get("email") or "").strip(),
        "Telefono": str(c.get("Telefono") or c.get("telefono") or "").strip(),
    }


def enrich_historial(historial: list[dict], clientes: list[dict]):
    by_exact: dict[str, dict] = {}
    by_norm: dict[str, dict] = {}
    for raw in clientes:
        c = cliente_fields(raw)
        if not c["Nombre"]:
            continue
        by_exact.setdefault(c["Nombre"].upper(), c)
        by_norm.setdefault(norm_cliente(c["Nombre"]), c)

    def lookup(nombre: str):
        key = str(nombre or "").strip().upper()
        if not key:
            return None
        if key in by_exact:
            return by_exact[key]
        nk = norm_cliente(nombre)
        if nk and nk in by_norm:
            return by_norm[nk]
        if nk:
            for cand_k, cand in by_norm.items():
                if cand_k.startswith(nk) or nk.startswith(cand_k):
                    return cand
        return None

    matched = 0
    out = []
    for row in historial:
        r = dict(row)
        already = any(str(r.get(k) or "").strip() for k in ("domicilio", "contacto", "correo", "telefono"))
        if not already:
            hit = lookup(str(r.get("cliente") or ""))
            if hit:
                r.update({
                    "domicilio": hit["Domicilio"],
                    "contacto": hit["Contacto"],
                    "correo": hit["Correo"],
                    "telefono": hit["Telefono"],
                })
                matched += 1
            else:
                for k in ("domicilio", "contacto", "correo", "telefono"):
                    r.setdefault(k, "")
        else:
            matched += 1
        if r.get("cliente"):
            r["cliente"] = str(r["cliente"]).strip()
        out.append(r)
    return out, matched


def es_patron_dim(p: dict) -> bool:
    no = str(p.get("noControl") or "").strip().upper()
    if no in DIM_IDS:
        return True
    desc = str(p.get("descripcion") or "").upper()
    return "BLOQUE" in desc or "DIMENSION" in desc


def parse_fecha(raw):
    if raw is None or raw == "":
        return None
    if hasattr(raw, "year"):
        return raw
    s = str(raw).strip()[:10]
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%Y/%m/%d"):
        try:
            return datetime.strptime(s, fmt)
        except ValueError:
            continue
    return None


def ensure_sheet(wb, name: str):
    try:
        return wb.Worksheets(name)
    except Exception:
        ws = wb.Worksheets.Add(After=wb.Worksheets(wb.Worksheets.Count))
        ws.Name = name[:31]
        return ws


def write_table(ws, headers: list[str], rows: list[list]) -> None:
    try:
        ws.Unprotect(Password=PASSWORD)
    except Exception:
        pass
    ws.Cells.ClearContents()
    for c, h in enumerate(headers, 1):
        ws.Cells(1, c).Value = h
    if rows:
        ws.Range(ws.Cells(2, 1), ws.Cells(len(rows) + 1, len(headers))).Value = rows


def historial_rows(historial: list[dict]) -> list[list]:
    return [[r.get(h, "") for h in HIST_HEADERS] for r in historial]


def clientes_rows(clientes: list[dict]) -> list[list]:
    seen: set[str] = set()
    rows = []
    for raw in clientes:
        c = cliente_fields(raw)
        if not c["Nombre"] or c["Nombre"].upper() in seen:
            continue
        seen.add(c["Nombre"].upper())
        rows.append([c["Nombre"], c["Domicilio"], c["Contacto"], c["Correo"], c["Telefono"]])
    return rows


def patrones_rows(patrones: list[dict]) -> list[list]:
    rows = []
    for p in patrones:
        rows.append([
            str(p.get("noControl") or "").strip().upper(),
            str(p.get("descripcion") or "").strip(),
            str(p.get("marca") or "").strip(),
            str(p.get("modelo") or "").strip(),
            str(p.get("serie") or "").strip(),
            str(p.get("noCertificado") or "").strip(),
            parse_fecha(p.get("fechaUltimaCalibracion")),
            parse_fecha(p.get("fechaVencimiento")),
            str(p.get("estadoProceso") or "").strip(),
            str(p.get("statusVigencia") or "").strip(),
            str(p.get("laboratorio") or "").strip(),
        ])
    return rows


def main() -> int:
    parser = argparse.ArgumentParser(description="Sync master Indicador")
    parser.add_argument("--archivo", type=Path, default=DEFAULT_MASTER)
    parser.add_argument("--prefijo", default="AGD")
    parser.add_argument("--url", default=API_URL)
    args = parser.parse_args()

    if not args.archivo.exists():
        print(f"No existe: {args.archivo}")
        return 1

    url = args.url
    if args.prefijo:
        sep = "&" if "?" in url else "?"
        url = f"{url}{sep}prefijo={args.prefijo}"
    print(f"Descargando…\n  {url}")
    data = fetch_json(url)
    historial = data.get("historial") or []
    clientes = data.get("clientes") or []
    patrones = [p for p in (data.get("patrones") or []) if es_patron_dim(p)]
    historial, n_join = enrich_historial(historial, clientes)
    print(f"  historial {len(historial)}  clientes {len(clientes)}  patrones dim {len(patrones)}")
    print(f"  clientes cruzados {n_join}/{len(historial)}")

    pythoncom.CoInitialize()
    excel = win32com.client.DispatchEx("Excel.Application")
    excel.Visible = False
    excel.DisplayAlerts = False
    excel.AskToUpdateLinks = False
    excel.EnableEvents = False
    wb = None
    try:
        print(f"Abriendo…\n  {args.archivo}")
        wb = excel.Workbooks.Open(str(args.archivo.resolve()), UpdateLinks=0, ReadOnly=False)
        if wb.ReadOnly:
            raise RuntimeError("Abierto como solo lectura. Ciérralo en Excel e intenta de nuevo.")

        write_table(ensure_sheet(wb, HIST_SHEET), HIST_HEADERS, historial_rows(historial))
        write_table(ensure_sheet(wb, CLI_SHEET), CLIENTE_HEADERS, clientes_rows(clientes))
        write_table(ensure_sheet(wb, PAT_SHEET), PATRON_HEADERS, patrones_rows(patrones))

        for sheet_name in (HIST_SHEET, CLI_SHEET, PAT_SHEET):
            wb.Worksheets(sheet_name).Visible = XL_VERY_HIDDEN

        try:
            wb.Worksheets("CALCULOS").Calculate()
        except Exception:
            pass
        wb.Save()
        print(f"Guardado: {args.archivo}")
        print("Uso: en CALCULOS pon D4=AGD  E4=número  F4=año (ej. AGD | 450 | 26)")
        print("Unidad: J10 = mm o in (botón mm/in)")
        return 0
    except Exception as exc:
        print(f"ERROR: {exc}")
        import traceback
        traceback.print_exc()
        return 1
    finally:
        if wb is not None:
            try:
                wb.Close(SaveChanges=False)
            except Exception:
                pass
        excel.Quit()
        pythoncom.CoUninitialize()


if __name__ == "__main__":
    raise SystemExit(main())
