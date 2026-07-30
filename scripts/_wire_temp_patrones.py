# -*- coding: utf-8 -*-
"""
Carga BD_Patrones desde la app y enlaza cert/vigencia en hoja Patrones
(Termohigrómetro, Hornos; IR solo catálogo).
"""
from __future__ import annotations

import json
import sys
import urllib.request
from datetime import datetime
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace", line_buffering=True)

import pythoncom
import win32com.client

FOLDER = Path(r"C:\Users\AG\Desktop\FORMATOS AG")
PASSWORD = "AG-Calidad-2026"
API = (
    "https://us-central1-agg1-b7f40.cloudfunctions.net/obtenerDatosExcel"
    "?key=TU_CLAVE_SECRETA_AG_APP_2026&formato=patrones"
)

COLS = [
    "noControl",
    "descripcion",
    "marca",
    "modelo",
    "serie",
    "noCertificado",
    "fechaUltimaCalibracion",
    "fechaVencimiento",
    "estadoProceso",
    "statusVigencia",
    "laboratorio",
]

# (archivo, bloques: (id_cell, cert_cell, vig_cell))
MASTERS = [
    {
        "file": "Formato Termohigrometro.xlsm",
        "patrones_sheet": "Patrones",
        "blocks": [("D4", "D5", "D7"), ("H4", "H5", "H7")],
    },
    {
        "file": "Formato Hornos y Muflas.xlsm",
        "patrones_sheet": "Patrones",
        "blocks": [("E4", "E5", "E7")],
    },
    {
        "file": "Formato Termometro IR.xlsm",
        "patrones_sheet": None,  # no hoja Patrones; solo BD_Patrones
        "blocks": [],
    },
]


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


def fetch_patrones() -> list[dict]:
    req = urllib.request.Request(API, headers={"User-Agent": "AG-Formatos/1.0"})
    with urllib.request.urlopen(req, timeout=120) as r:
        data = json.loads(r.read().decode("utf-8"))
    if not isinstance(data, list):
        raise RuntimeError("API patrones inválida")
    return data


def parse_date(val):
    if val is None or val == "":
        return None
    if hasattr(val, "year"):
        return val
    s = str(val).strip()
    if not s:
        return None
    for fmt in ("%Y-%m-%d", "%Y-%m-%dT%H:%M:%S", "%d/%m/%Y", "%Y/%m/%d"):
        try:
            return datetime.strptime(s[:19].replace("Z", ""), fmt if "T" not in fmt else "%Y-%m-%dT%H:%M:%S")
        except Exception:
            continue
    try:
        return datetime.strptime(s[:10], "%Y-%m-%d")
    except Exception:
        return s


def write_bd_patrones(ws, patrones: list[dict]) -> int:
    unprotect(ws)
    try:
        while ws.ListObjects.Count > 0:
            ws.ListObjects(1).Unlist
    except Exception:
        pass
    ws.Cells.Clear()
    for c, h in enumerate(COLS, 1):
        ws.Cells(1, c).Value = h
    row = 2
    for p in patrones:
        pid = str(p.get("noControl") or "").strip()
        if not pid or pid in ("*", "**"):
            continue
        ws.Cells(row, 1).Value = pid
        ws.Cells(row, 2).Value = p.get("descripcion") or ""
        ws.Cells(row, 3).Value = p.get("marca") or ""
        ws.Cells(row, 4).Value = p.get("modelo") or ""
        ws.Cells(row, 5).Value = p.get("serie") or ""
        ws.Cells(row, 6).Value = p.get("noCertificado") or ""
        ult = parse_date(p.get("fechaUltimaCalibracion"))
        vig = parse_date(p.get("fechaVencimiento"))
        if ult is not None:
            ws.Cells(row, 7).Value = ult
        if vig is not None:
            ws.Cells(row, 8).Value = vig
            try:
                ws.Cells(row, 8).NumberFormatLocal = "aaaa-mmm-dd"
            except Exception:
                pass
        ws.Cells(row, 9).Value = p.get("estadoProceso") or ""
        ws.Cells(row, 10).Value = p.get("statusVigencia") or ""
        ws.Cells(row, 11).Value = p.get("laboratorio") or ""
        row += 1
    return row - 2


def wire_block(ws, id_cell: str, cert_cell: str, vig_cell: str) -> None:
    """Enlaza cert (F) y vigencia (H) de BD_Patrones según ID."""
    pid = str(ws.Range(id_cell).Value or "").strip()
    if not pid:
        return

    cur_cert = str(ws.Range(cert_cell).Value or "").strip().replace('"', '""')
    # Si ya es fórmula a BD_Patrones, no duplicar fallback raro
    try:
        if ws.Range(cert_cell).HasFormula and "BD_Patrones" in str(ws.Range(cert_cell).Formula):
            pass
        else:
            ws.Range(cert_cell).Formula = (
                f'=IF(IFERROR(INDEX(BD_Patrones!$F:$F,MATCH(TRIM(${id_cell}),BD_Patrones!$A:$A,0)),"")="",'
                f'"{cur_cert}",'
                f"INDEX(BD_Patrones!$F:$F,MATCH(TRIM(${id_cell}),BD_Patrones!$A:$A,0)))"
            )
    except Exception as e:
        print("   aviso cert", id_cell, e)

    # Vigencia
    cur_vig = ws.Range(vig_cell).Value
    if cur_vig is not None and hasattr(cur_vig, "year"):
        fallback = f"DATE({cur_vig.year},{cur_vig.month},{cur_vig.day})"
    elif ws.Range(vig_cell).HasFormula and "BD_Patrones" not in str(ws.Range(vig_cell).Formula or ""):
        # conservar fórmula local como fallback (sin el =)
        fallback = ws.Range(vig_cell).Formula[1:]
    else:
        fallback = '""'

    try:
        ws.Range(vig_cell).Formula = (
            f'=IF(IFERROR(INDEX(BD_Patrones!$H:$H,MATCH(TRIM(${id_cell}),BD_Patrones!$A:$A,0)),"")="",'
            f"{fallback},"
            f"INDEX(BD_Patrones!$H:$H,MATCH(TRIM(${id_cell}),BD_Patrones!$A:$A,0)))"
        )
        ws.Range(vig_cell).NumberFormatLocal = "aaaa-mmm-dd"
    except Exception as e:
        print("   aviso vig", id_cell, e)

    print(f"   cableado {id_cell}={pid} → {cert_cell}/{vig_cell}")


def main() -> int:
    print("Descargando patrones de la app…")
    patrones = fetch_patrones()
    print(f"  {len(patrones)} patrones")

    pythoncom.CoInitialize()
    excel = win32com.client.DispatchEx("Excel.Application")
    excel.Visible = False
    excel.DisplayAlerts = False
    excel.EnableEvents = False

    try:
        for cfg in MASTERS:
            path = FOLDER / cfg["file"]
            if not path.exists():
                print("MISS", path.name)
                continue
            print(f"\n=== {path.name} ===")
            wb = excel.Workbooks.Open(str(path), UpdateLinks=0, ReadOnly=False)
            bd = wb.Worksheets("BD_Patrones")
            try:
                bd.Visible = -1
            except Exception:
                pass
            n = write_bd_patrones(bd, patrones)
            print(f"  BD_Patrones: {n} filas")

            if cfg["patrones_sheet"]:
                try:
                    ps = wb.Worksheets(cfg["patrones_sheet"])
                    unprotect(ps)
                    for id_c, cert_c, vig_c in cfg["blocks"]:
                        wire_block(ps, id_c, cert_c, vig_c)
                    # test TermoH
                    if "Termohigrometro" in cfg["file"]:
                        excel.Calculate()
                        print("  TEST D4", ps.Range("D4").Value)
                        print("  D5 cert", ps.Range("D5").Value, ps.Range("D5").Formula[:60])
                        print("  D7 vig", ps.Range("D7").Value)
                    try:
                        ps.Protect(
                            Password=PASSWORD,
                            DrawingObjects=False,
                            Contents=True,
                            Scenarios=True,
                        )
                    except Exception:
                        pass
                except Exception as e:
                    print("  aviso Patrones:", e)

            try:
                bd.Visible = 2
            except Exception:
                pass
            try:
                bd.Protect(
                    Password=PASSWORD,
                    DrawingObjects=False,
                    Contents=True,
                    Scenarios=True,
                )
            except Exception:
                pass
            wb.Save()
            wb.Close(True)
            print("  Guardado")
    finally:
        excel.Quit()
        pythoncom.CoUninitialize()

    print("\nListo: patrones/vigencias desde la app.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
