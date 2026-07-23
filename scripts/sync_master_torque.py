#!/usr/bin/env python3
"""
Sincroniza Formato Torque.xlsm con la app (prefijo AGPT) usando Excel COM.

Evita openpyxl.save: este formato tiene hojas con comillas/dibujos y se corrompe.
NO modifica cálculos / incertidumbres / lecturas.

Uso:
  python scripts/sync_master_torque.py
  python scripts/sync_master_torque.py --solo-wire
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
import unicodedata
import urllib.request
from datetime import datetime
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

try:
    import pythoncom
    import win32com.client
except ImportError:
    print("Instala pywin32: pip install pywin32")
    sys.exit(1)

API_URL = (
    "https://us-central1-agg1-b7f40.cloudfunctions.net/obtenerDatosExcel"
    "?key=TU_CLAVE_SECRETA_AG_APP_2026"
)
DEFAULT_MASTER = Path(r"C:\Users\AG\Desktop\FORMATOS AG\Formato Torque.xlsm")

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
    "fechaUltimaCalibracion", "fechaVencimiento", "estadoProceso", "statusVigencia", "laboratorio",
]

# Certificado dividido: D2=prefijo (AGPT), E2=número, F2=año (como Presión)
CERT = 'TRIM($D$2)&"-"&TEXT($E$2,"0000")&"-"&TEXT($F$2,"00")'
MATCH = f"MATCH({CERT},{HIST_SHEET}!$B:$B,0)"


def idx(col: str, blank: str = '""') -> str:
    return f"=IFERROR(INDEX({HIST_SHEET}!${col}:${col},{MATCH}),{blank})"


F_CLIENTE = idx("C")
F_EQUIPO = idx("D", '"No encontrado"')
F_MARCA = idx("E", '"No encontrado"')
F_MODELO = idx("F")
F_SERIE = idx("G")
F_ID = idx("H")
F_FECHA_CAL = f"=IFERROR(VALUE(INDEX({HIST_SHEET}!$I:$I,{MATCH})),\"\")"
F_RECEPCION = (
    "=IFERROR("
    f'IF(INDEX({HIST_SHEET}!$M:$M,{MATCH})="",'
    f'IF(OR(UPPER(LEFT(INDEX({HIST_SHEET}!$K:$K,{MATCH}),1))="S"),"Servicio en Sitio",""),'
    f"VALUE(INDEX({HIST_SHEET}!$M:$M,{MATCH}))),"
    f'IF(OR(UPPER(LEFT(INDEX({HIST_SHEET}!$K:$K,{MATCH}),1))="S"),"Servicio en Sitio",""))'
)
F_TECNICO = idx("J")
F_DOMICILIO = idx("N")
F_CONTACTO = idx("O")
F_CORREO = idx("P")
F_TEL = idx("Q")
F_LUGAR_TXT = (
    f'=IFERROR(IF(OR(INDEX({HIST_SHEET}!$K:$K,{MATCH})="Laboratorio",'
    f'INDEX({HIST_SHEET}!$K:$K,{MATCH})="laboratorio"),"Instalaciones AG",'
    f'IF(OR(INDEX({HIST_SHEET}!$K:$K,{MATCH})="Sitio",'
    f'INDEX({HIST_SHEET}!$K:$K,{MATCH})="sitio"),"Instalaciones de Cliente","")),"")'
)
F_MESES = (
    f'=IFERROR(IF(INDEX({HIST_SHEET}!$L:$L,{MATCH})="6 meses",6,'
    f'IF(INDEX({HIST_SHEET}!$L:$L,{MATCH})="3 meses",3,'
    f'IF(INDEX({HIST_SHEET}!$L:$L,{MATCH})="24 meses",24,12))),12)'
)

PATRON_BLOCKS = [
    ("D2", "D3", "D5"),
    ("D10", "D11", "D14"),
    ("D19", "D20", "D22"),
    ("D27", "D29", "D31"),
    ("D34", "D35", "D37"),
]

# Solo patrones de torque (evita traer los 73 y alentar el Excel)
TORQUE_PATRON_KEYWORDS = ("TORSIONAL", "TORQ", "HIOS")
TORQUE_PATRON_IDS = {"AG-051", "AG-025", "AG-014", "AG-021", "AG-052", "AG-013", "AG-037"}


def es_patron_torque(p: dict) -> bool:
    if str(p.get("noControl") or "").strip().upper() in TORQUE_PATRON_IDS:
        return True
    desc = str(p.get("descripcion") or "").upper()
    return any(k in desc for k in TORQUE_PATRON_KEYWORDS)


def fetch_json(url: str) -> dict:
    req = urllib.request.Request(url, headers={"User-Agent": "AG-TorqueSync/1.0"})
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


def clear_sheet(ws) -> None:
    ws.Cells.ClearContents()


def write_table(ws, headers: list[str], rows: list[list]) -> None:
    clear_sheet(ws)
    for c, h in enumerate(headers, 1):
        ws.Cells(1, c).Value = h
    if not rows:
        return
    # Bulk write via COM array is faster
    n_rows = len(rows)
    n_cols = len(headers)
    start = ws.Range(ws.Cells(2, 1), ws.Cells(n_rows + 1, n_cols))
    start.Value = rows


def historial_rows(historial: list[dict]) -> list[list]:
    rows = []
    for r in historial:
        rows.append([r.get(h, "") for h in HIST_HEADERS])
    return rows


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


def patrones_rows(patrones: list[dict], cert_fb: dict[str, str]) -> list[list]:
    rows = []
    for p in patrones:
        no = str(p.get("noControl") or "").strip().upper()
        cert = str(p.get("noCertificado") or "").strip() or cert_fb.get(no, "")
        f_cal = parse_fecha(p.get("fechaUltimaCalibracion"))
        f_ven = parse_fecha(p.get("fechaVencimiento"))
        rows.append([
            no,
            str(p.get("descripcion") or "").strip(),
            str(p.get("marca") or "").strip(),
            str(p.get("modelo") or "").strip(),
            str(p.get("serie") or "").strip(),
            cert,
            f_cal,
            f_ven,
            str(p.get("estadoProceso") or "").strip(),
            str(p.get("statusVigencia") or "").strip(),
            str(p.get("laboratorio") or "").strip(),
        ])
    return rows


def collect_cert_fallback(pat_ws) -> dict[str, str]:
    out: dict[str, str] = {}
    for id_cell, cert_cell, _ in PATRON_BLOCKS:
        pid = str(pat_ws.Range(id_cell).Value or "").strip().upper()
        cert = pat_ws.Range(cert_cell).Value
        if pid and cert and not (isinstance(cert, str) and str(cert).startswith("=")):
            out[pid] = str(cert).strip()
    return out


def wire_patrones(ws) -> None:
    try:
        ws.Unprotect(Password="AG-Calidad-2026")
    except Exception:
        try:
            ws.Unprotect()
        except Exception:
            pass
    for id_cell, cert_cell, vence_cell in PATRON_BLOCKS:
        ws.Range(cert_cell).Formula = (
            f'=IFERROR(INDEX({PAT_SHEET}!$F:$F,MATCH(TRIM({id_cell}),{PAT_SHEET}!$A:$A,0)),"")'
        )
        ws.Range(vence_cell).Formula = (
            f'=IFERROR(INDEX({PAT_SHEET}!$H:$H,MATCH(TRIM({id_cell}),{PAT_SHEET}!$A:$A,0)),"")'
        )


def wire_toma_datos(ws) -> None:
    try:
        ws.Unprotect(Password="AG-Calidad-2026")
    except Exception:
        try:
            ws.Unprotect()
        except Exception:
            pass
    # Certificado partido: D2=prefijo, E2=número, F2=año (antes D2:E2 iban combinadas)
    try:
        if ws.Range("D2").MergeCells:
            ws.Range("D2").MergeArea.UnMerge()
    except Exception:
        try:
            ws.Range("D2:E2").UnMerge()
        except Exception:
            pass
    ws.Range("D2").Value = "AGPT"
    ws.Range("E2").Value = None
    ws.Range("F2").Value = 26
    ws.Range("C3").Formula = F_CLIENTE
    ws.Range("I3").Formula = F_CORREO
    ws.Range("C4").Formula = F_DOMICILIO
    ws.Range("I4").Formula = F_TEL
    ws.Range("C5").Formula = F_CONTACTO
    ws.Range("C8").Formula = F_EQUIPO
    ws.Range("C9").Formula = F_MARCA
    ws.Range("C10").Formula = F_MODELO
    ws.Range("C11").Formula = F_SERIE
    ws.Range("J8").Formula = F_ID
    ws.Range("P2").Formula = F_RECEPCION
    ws.Range("P3").Formula = F_FECHA_CAL
    ws.Range("L4").Formula = F_MESES
    ws.Range("P5").Formula = "=TODAY()"
    ws.Range("D12").Formula = F_LUGAR_TXT
    ws.Range("AI15").Formula = F_TECNICO


# Hojas que muestran el No. de certificado completo (antes ='Toma Datos'!D2)
CERT_DISPLAY_CELLS = [
    ("Portada", "J11"),
    ('Hoja de Resultados 5 Rep "CW"', "K11"),
    ('H. Res. punto fijo 5 Rep "CW"', "K11"),
    ("Hoja Resultados 5 Rep CW y CCW", "K11"),
    ("Hoja de Resultados 10 Rep", "P10"),
]
F_CERT_DISPLAY = (
    "='Toma Datos'!D2&\"-\"&TEXT('Toma Datos'!E2,\"0000\")&\"-\"&TEXT('Toma Datos'!F2,\"00\")"
)


def wire_cert_display(wb) -> None:
    """Portada/resultados suelen estar protegidas con otra clave; no bloquea el sync."""
    for sheet_name, cell in CERT_DISPLAY_CELLS:
        try:
            ws = wb.Worksheets(sheet_name)
        except Exception:
            print(f"  aviso: hoja no encontrada: {sheet_name}")
            continue
        try:
            ws.Unprotect(Password="AG-Calidad-2026")
        except Exception:
            try:
                ws.Unprotect()
            except Exception:
                pass
        try:
            ws.Range(cell).Formula = F_CERT_DISPLAY
        except Exception as exc:
            print(f"  aviso: no se pudo escribir {sheet_name}!{cell} (protegida?): {exc}")


def main() -> int:
    parser = argparse.ArgumentParser(description="Sync master Torque (Excel COM)")
    parser.add_argument("--archivo", type=Path, default=DEFAULT_MASTER)
    parser.add_argument("--prefijo", default="AGPT")
    parser.add_argument("--url", default=API_URL)
    parser.add_argument("--solo-sync", action="store_true")
    parser.add_argument("--solo-wire", action="store_true")
    args = parser.parse_args()

    if not args.archivo.exists():
        print(f"No existe: {args.archivo}")
        return 1

    historial: list[dict] = []
    clientes: list[dict] = []
    patrones: list[dict] = []

    if not args.solo_wire:
        url = args.url
        if args.prefijo:
            sep = "&" if "?" in url else "?"
            url = f"{url}{sep}prefijo={args.prefijo}"
        print(f"Descargando…\n  {url}")
        data = fetch_json(url)
        historial = data.get("historial") or []
        clientes = data.get("clientes") or []
        patrones = data.get("patrones") or []
        # Solo certificados del año en curso (ej. AGPT-0001-26) para no alentar el Excel
        yy = datetime.now().strftime("%y")
        historial = [
            h for h in historial
            if str(h.get("certificado") or "").strip().endswith(f"-{yy}")
        ]
        # Solo patrones de torque (no los 73 de todo el laboratorio)
        patrones = [p for p in patrones if es_patron_torque(p)]
        historial, n_join = enrich_historial(historial, clientes)
        print(f"  historial {len(historial)} (solo -{yy})  clientes {len(clientes)}  patrones {len(patrones)} (solo torque)")
        print(f"  clientes cruzados {n_join}/{len(historial)}")

    pythoncom.CoInitialize()
    excel = win32com.client.DispatchEx("Excel.Application")
    excel.Visible = False
    excel.DisplayAlerts = False
    excel.AskToUpdateLinks = False
    excel.ScreenUpdating = False

    wb = None
    try:
        print(f"Abriendo (Excel COM)…\n  {args.archivo}")
        wb = excel.Workbooks.Open(str(args.archivo.resolve()), UpdateLinks=0, ReadOnly=False)
        if wb.ReadOnly:
            raise RuntimeError("Abierto como solo lectura. Ciérralo en Excel e intenta de nuevo.")

        if not args.solo_wire:
            hist_ws = ensure_sheet(wb, HIST_SHEET)
            write_table(hist_ws, HIST_HEADERS, historial_rows(historial))

            cli_ws = ensure_sheet(wb, CLI_SHEET)
            write_table(cli_ws, CLIENTE_HEADERS, clientes_rows(clientes))

            pat_ws_src = wb.Worksheets("Patrones")
            cert_fb = collect_cert_fallback(pat_ws_src)
            pat_ws = ensure_sheet(wb, PAT_SHEET)
            write_table(pat_ws, PATRON_HEADERS, patrones_rows(patrones, cert_fb))
            print(f"  BD_Patrones {len(patrones)} (fallback cert {len(cert_fb)})")

        if not args.solo_sync:
            wire_toma_datos(wb.Worksheets("Toma Datos"))
            wire_patrones(wb.Worksheets("Patrones"))
            wire_cert_display(wb)
            print("Toma Datos + Patrones + hojas de resultados enlazados. Incertidumbres sin tocar.")

        try:
            wb.ForceFullCalculation = False
        except Exception:
            pass
        # CalculateFullRebuild cuelga este libro; basta con las hojas cableadas.
        try:
            wb.Worksheets("Toma Datos").Calculate()
            wb.Worksheets("Patrones").Calculate()
        except Exception:
            pass
        time.sleep(1)
        wb.Save()
        print(f"Guardado: {args.archivo}")
        print("")
        print("Uso: en Toma Datos pon D2=AGPT o AGPTT  E2=número  F2=año (ej. AGPT | 224 | 26)")
        return 0
    except Exception as e:
        print(f"ERROR: {e}")
        import traceback
        traceback.print_exc()
        return 1
    finally:
        if wb is not None:
            try:
                wb.Close(SaveChanges=False)
            except Exception:
                pass
        excel.ScreenUpdating = True
        excel.Quit()
        pythoncom.CoUninitialize()


if __name__ == "__main__":
    raise SystemExit(main())
