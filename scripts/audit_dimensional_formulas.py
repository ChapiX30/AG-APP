# -*- coding: utf-8 -*-
"""
Auditoría de fórmulas en masters dimensionales (Indicador + Micrómetro).
Reporta #DIV/0!, #N/A!, #REF!, #VALUE!, #NAME?, #NUM! y revisa puntos críticos.
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace", line_buffering=True)

import pythoncom
import win32com.client

FOLDER = Path(r"C:\Users\AG\Desktop\FORMATOS AG")
PASSWORD = "AG-Calidad-2026"

XL_ERRORS = {
    -2146826246: "#DIV/0!",
    -2146826259: "#NAME?",
    -2146826281: "#REF!",
    -2146826252: "#VALUE!",
    -2146826265: "#NULL!",
    -2146826273: "#N/A",
    -2146826255: "#NUM!",
}

MASTERS = [
    {
        "path": FOLDER / "Formato Indicador.xlsm",
        "calc": "CALCULOS",
        "portada": "PORTADA",
        "resultados": "RESULTADOS",
        "unit_cell": "J10",
        "alcance_cell": "F10",
        "alcance_min": None,
        "div_cell": "J9",
        "emp_cell": "J12",
        "sample_mm": 25.4,
        "sample_in": 1.0,
        "check_nominals": [
            # (label, addr, expected_when_in_1)
            ("insp 20%", "B18", 0.2),
            ("insp 50%", "B19", 0.5),
            ("insp 100%", "B20", 1.0),
            ("corto 2%", "A26", 0.02),
            ("corto 2% nom", "B26", 0.02),
            ("largo 100%", "A50", 1.0),
            ("largo 100% nom", "B50", 1.0),
        ],
        "critical_formulas": {
            "B20": "=B50",
            "A24": "=$J$10",
            "B26": "=A26",
            "B50": "=A50",
        },
        "scan_sheets": ["CALCULOS", "PORTADA", "RESULTADOS", "Patrones", "CMC"],
        "ignore_error_prefixes": [
            # celdas de incertidumbre que dependen de lecturas vacías en STDEV
        ],
        "allow_div0_cols_when_no_readings": True,
    },
    {
        "path": FOLDER / "Formato Micrometro Exteriores.xlsm",
        "calc": "Calculos",
        "portada": "Portada",
        "resultados": "Resultados",
        "unit_cell": "J11",
        "alcance_cell": "G11",
        "alcance_min": "F11",
        "div_cell": "J10",
        "emp_cell": "J13",
        "sample_mm": 25.0,
        "sample_in": 1.0,
        "check_nominals": [
            ("insp 20%", "B18", 0.2),
            ("insp 50%", "B19", 0.5),
            ("insp 100%", "B20", 1.0),
            ("pt 20% nom", "B27", 0.2),
            ("pt 100% nom", "B35", 1.0),
        ],
        "critical_formulas": {
            "A24": "=$J$11",
            "B35": "=G11",
        },
        "scan_sheets": ["Calculos", "Portada", "Resultados", "Patrones", "CMC"],
        "allow_div0_cols_when_no_readings": True,
    },
]


def err_name(val) -> str | None:
    if isinstance(val, int) and val in XL_ERRORS:
        return XL_ERRORS[val]
    return None


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


def scan_sheet_errors(ws, max_row: int = 200, max_col: int = 40) -> list[tuple[str, str, str]]:
    """Devuelve lista (addr, error, formula)."""
    found = []
    used = ws.UsedRange
    if used is None:
        return found
    rows = min(used.Rows.Count, max_row)
    cols = min(used.Columns.Count, max_col)
    base_r = used.Row
    base_c = used.Column
    # Leer valores en bloque es más rápido
    vals = used.Resize(rows, cols).Value
    formulas = used.Resize(rows, cols).Formula
    if not isinstance(vals, tuple):
        vals = ((vals,),)
        formulas = ((formulas,),)
    for i, row in enumerate(vals):
        if not isinstance(row, tuple):
            row = (row,)
        frow = formulas[i] if isinstance(formulas[i], tuple) else (formulas[i],)
        for j, val in enumerate(row):
            name = err_name(val)
            if not name:
                continue
            r = base_r + i
            c = base_c + j
            addr = ws.Cells(r, c).Address.replace("$", "")
            f = frow[j] if j < len(frow) else ""
            if isinstance(f, str) and f.startswith("="):
                found.append((addr, name, f[:160]))
            elif name:
                found.append((addr, name, str(f)[:160]))
    return found


def classify_div0(addr: str, formula: str, master_name: str) -> str:
    """Marca si el DIV/0 es esperado (lecturas vacías) o real."""
    f = formula.upper()
    # STDEV / SQRT de lecturas vacías
    if "STDEV" in f or "DESVEST" in f:
        return "esperado_sin_lecturas"
    if "SQRT(" in f and ("L" in addr or "U" in addr or "T" in addr or "V" in addr or "K" in addr):
        # cadena de incertidumbre
        if any(x in f for x in ("STDEV", "K", "L", "T", "U")):
            return "esperado_sin_lecturas"
    # VLOOKUP sin match exacto a veces N/A
    if "VLOOKUP" in f and "#N/A" in formula:
        return "vlookup"
    return "revisar"


def audit_master(excel, cfg: dict) -> dict:
    path: Path = cfg["path"]
    report = {
        "file": path.name,
        "ok": True,
        "issues": [],
        "warnings": [],
        "errors_raw": [],
        "nominal_ok": [],
        "nominal_fail": [],
        "critical_fail": [],
    }
    if not path.exists():
        report["ok"] = False
        report["issues"].append("Archivo no existe")
        return report

    print(f"\n{'='*60}\nAuditando {path.name}\n{'='*60}")
    wb = excel.Workbooks.Open(str(path.resolve()), UpdateLinks=0, ReadOnly=False)
    try:
        calc = wb.Worksheets(cfg["calc"])
        try_unprotect(calc)

        # Escenario limpio: in + alcance 1 (el caso que más ha fallado)
        calc.Range(cfg["unit_cell"]).Value = "in"
        calc.Range(cfg["alcance_cell"]).Value = cfg["sample_in"]
        if cfg.get("alcance_min"):
            calc.Range(cfg["alcance_min"]).Value = 0
        # EMP / división razonables en in
        if cfg["div_cell"]:
            try:
                calc.Range(cfg["div_cell"]).Value = 0.0001
            except Exception:
                pass
        if cfg["emp_cell"]:
            try:
                calc.Range(cfg["emp_cell"]).Value = 0.0002
            except Exception:
                pass

        excel.Calculate()

        # Críticas
        for addr, expected in cfg.get("critical_formulas", {}).items():
            got = str(calc.Range(addr).Formula or "").replace(" ", "")
            exp = expected.replace(" ", "")
            if got.upper() != exp.upper():
                report["critical_fail"].append(f"{addr}: got {calc.Range(addr).Formula!r} expected {expected!r}")
                report["ok"] = False

        # Nominales
        for label, addr, expected in cfg.get("check_nominals", []):
            val = calc.Range(addr).Value
            ename = err_name(val)
            if ename:
                report["nominal_fail"].append(f"{label} {addr}={ename}")
                report["ok"] = False
                continue
            try:
                num = float(val)
            except (TypeError, ValueError):
                report["nominal_fail"].append(f"{label} {addr}={val!r} (no numérico)")
                report["ok"] = False
                continue
            if abs(num - expected) > 1e-6:
                report["nominal_fail"].append(f"{label} {addr}={num} expected {expected}")
                report["ok"] = False
            else:
                report["nominal_ok"].append(f"{label} {addr}={num}")

        # Dictámenes inspección (con lecturas = nominal)
        for r in (18, 19, 20):
            try:
                b = calc.Range(f"B{r}").Value
                if isinstance(b, (int, float)):
                    calc.Range(f"C{r}").Value = b
                    calc.Range(f"D{r}").Value = b
            except Exception:
                pass
        excel.Calculate()
        for r in (18, 19, 20):
            g = calc.Range(f"G{r}").Value
            e = calc.Range(f"E{r}").Value
            ge = err_name(g)
            ee = err_name(e)
            if ee:
                report["issues"].append(f"Promedio E{r}={ee} form={calc.Range(f'E{r}').Formula}")
                report["ok"] = False
            if ge:
                report["issues"].append(f"Dictamen G{r}={ge} form={calc.Range(f'G{r}').Formula}")
                report["ok"] = False
            elif g in (None, ""):
                report["issues"].append(f"Dictamen G{r} vacío form={calc.Range(f'G{r}').Formula}")
                report["ok"] = False
            else:
                report["warnings"].append(f"Dictamen G{r}={g}")

        # Escaneo de errores en hojas
        for sheet_name in cfg["scan_sheets"]:
            try:
                ws = wb.Worksheets(sheet_name)
            except Exception:
                report["warnings"].append(f"Hoja ausente: {sheet_name}")
                continue
            errs = scan_sheet_errors(ws)
            for addr, name, formula in errs:
                kind = classify_div0(addr, formula, path.name)
                entry = f"{sheet_name}!{addr} {name} [{kind}] {formula}"
                report["errors_raw"].append(entry)
                if name == "#DIV/0!" and kind == "esperado_sin_lecturas" and cfg.get("allow_div0_cols_when_no_readings"):
                    report["warnings"].append(entry)
                elif name == "#REF!":
                    report["issues"].append(entry)
                    report["ok"] = False
                elif name == "#NAME?":
                    report["issues"].append(entry)
                    report["ok"] = False
                elif name == "#N/A" and "VLOOKUP" in formula.upper():
                    # VLOOKUP approx con tablas puede dar N/A en puntos extremos sin lecturas
                    report["warnings"].append(entry)
                elif name == "#DIV/0!":
                    # Dictamen / promedio no deberían
                    if addr.startswith("G") or addr.startswith("E") and int(addr[1:] or "0") < 40:
                        if "IFERROR" not in formula.upper() and "IF(" not in formula.upper():
                            report["issues"].append(entry)
                            report["ok"] = False
                        else:
                            report["warnings"].append(entry)
                    else:
                        report["warnings"].append(entry)
                else:
                    report["warnings"].append(entry)

        # Escenario mm también
        calc.Range(cfg["unit_cell"]).Value = "mm"
        calc.Range(cfg["alcance_cell"]).Value = cfg["sample_mm"]
        if cfg.get("alcance_min"):
            calc.Range(cfg["alcance_min"]).Value = 0
        excel.Calculate()
        # 100% debe = alcance
        if "Indicador" in path.name:
            a50 = calc.Range("A50").Value
            b50 = calc.Range("B50").Value
            if abs(float(a50 or 0) - cfg["sample_mm"]) > 1e-6 or abs(float(b50 or 0) - cfg["sample_mm"]) > 1e-6:
                report["issues"].append(f"mm 100%: A50={a50} B50={b50} expected {cfg['sample_mm']}")
                report["ok"] = False
            else:
                report["nominal_ok"].append(f"mm 100% A50/B50={a50}")
        else:
            b35 = calc.Range("B35").Value
            if abs(float(b35 or 0) - cfg["sample_mm"]) > 1e-6:
                report["issues"].append(f"mm 100%: B35={b35} expected {cfg['sample_mm']}")
                report["ok"] = False
            else:
                report["nominal_ok"].append(f"mm 100% B35={b35}")

        # No guardar cambios de prueba
        return report
    finally:
        wb.Close(SaveChanges=False)


def main() -> int:
    pythoncom.CoInitialize()
    excel = win32com.client.DispatchEx("Excel.Application")
    excel.Visible = False
    excel.DisplayAlerts = False
    excel.AskToUpdateLinks = False
    excel.EnableEvents = False
    results = []
    try:
        for cfg in MASTERS:
            results.append(audit_master(excel, cfg))
    finally:
        excel.Quit()
        pythoncom.CoUninitialize()

    print("\n" + "#" * 60)
    print("RESUMEN")
    print("#" * 60)
    all_ok = True
    for r in results:
        status = "OK" if r["ok"] else "FALLAS"
        if not r["ok"]:
            all_ok = False
        print(f"\n## {r['file']}: {status}")
        if r["critical_fail"]:
            print("  Críticas mal:")
            for x in r["critical_fail"]:
                print("   -", x)
        if r["nominal_fail"]:
            print("  Nominales mal:")
            for x in r["nominal_fail"]:
                print("   -", x)
        if r["issues"]:
            print("  Issues:")
            for x in r["issues"][:40]:
                print("   -", x)
        print(f"  Nominales OK: {len(r['nominal_ok'])}  Warnings: {len(r['warnings'])}  Raw errors: {len(r['errors_raw'])}")
        # mostrar warnings no esperados
        real_warn = [w for w in r["warnings"] if "esperado_sin_lecturas" not in w]
        if real_warn:
            print("  Warnings relevantes:")
            for x in real_warn[:30]:
                print("   -", x)

    return 0 if all_ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
