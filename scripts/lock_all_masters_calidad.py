# -*- coding: utf-8 -*-
"""
Protección unificada en TODOS los masters AG:

- Técnicos editan: certificado, marca/modelo/serie, lecturas, ambiente,
  unidades/selectores EMP, alcance/división.
- Cliente / domicilio / correo / tel / instrumento / ID / fechas: BLOQUEADOS
  (fórmulas del historial; al cambiar cert vuelven solos).
- Contraseña Calidad: AG-Calidad-2026
- NO mueve botones (solo Locked/Protect).
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace", line_buffering=True)

import pythoncom
import win32com.client

FOLDER = Path(r"C:\Users\AG\Desktop\FORMATOS AG")
PASSWORD = "AG-Calidad-2026"
HIST = "obtenerDatosExcel"

# Por master: hoja de trabajo + celdas/rangos editables + celdas de cert + fórmulas a asegurar
MASTERS = [
    {
        "file": "Formato Vernier.xlsm",
        "calc": "Calculos",
        "portada": "Portada",
        "extra_lock_sheets": ["Resultados", "Patrones", "CMC"],
        "cert": ["D4", "E4", "F4"],
        "unlock": [
            "D4", "E4", "F4",
            "B12", "B13", "B14",  # marca / parte / serie
            "F12", "J12",  # alcance / unidad
            "F13", "J13", "F14", "J14", "F15", "J15",
            "H24",  # EMP CLIENTE/NORMA
            "C27:E40", "F27:H40",
        ],
        "layout": "vernier",
        "instrumento": "B11",
        "marca": "B12",
        "modelo": "B13",
        "serie": "B14",
        "id": "F11",
    },
    {
        "file": "Formato Indicador.xlsm",
        "calc": "CALCULOS",
        "portada": "PORTADA",
        "extra_lock_sheets": ["RESULTADOS", "Patrones", "CMC"],
        "cert": ["D4", "E4", "F4"],
        "unlock": [
            "D4", "E4", "F4",
            "B10", "B11", "B12",
            "F10", "J9", "J10",
            "F13", "J13", "F14", "J14",
            "H21",
            "C18:D22",
            "C25:E35", "C40:E50",
            "B25", "B40", "B26:B35", "B41:B50",
        ],
        "layout": "indicador",
        "instrumento": "B9",
        "marca": "B10",
        "modelo": "B11",
        "serie": "B12",
        "id": "F9",
    },
    {
        "file": "Formato Micrometro Exteriores.xlsm",
        "calc": "Calculos",
        "portada": "Portada",
        "extra_lock_sheets": ["Resultados", "Patrones", "CMC"],
        "cert": ["D4", "E4", "F4"],
        "unlock": [
            "D4", "E4", "F4",
            "B11", "B12", "B13",
            "J11", "F11", "G11", "J10",
            "H21",
            "J13",
            "F13", "J13", "F14", "J14", "F15", "J15",
            "C25:E40",
        ],
        "layout": "indicador",
        "instrumento": "B10",
        "marca": "B11",
        "modelo": "B12",
        "serie": "B13",
        "id": "F10",
    },
    {
        "file": "Formato Pin Gage.xlsm",
        "calc": "Calculos",
        "portada": "Portada",
        "extra_lock_sheets": ["Resultados", "Patrones", "CMC"],
        "cert": ["D4", "E4", "F4"],
        "unlock": [
            "D4", "E4", "F4",
            "B10", "B11", "B12",
            "F10", "J9", "J10",
            "F13", "J13", "F14", "J14",
            "H21",
            "C25:E45",
        ],
        "layout": "indicador",
        "instrumento": "B9",
        "marca": "B10",
        "modelo": "B11",
        "serie": "B12",
        "id": "F9",
    },
    {
        "file": "Formato Regla Flex.xlsm",
        "calc": "Calculos",
        "portada": "PORTADA",
        "extra_lock_sheets": ["Resultados", "RESULTADOS", "Patrones", "CMC"],
        "cert": ["D4", "E4", "F4"],
        "unlock": [
            "D4", "E4", "F4",
            "B10", "B11", "B12",
            "F10", "J9", "J10", "J11",
            "F13", "J13", "F14", "J14",
            "H21",
            "C25:E45",
        ],
        "layout": "indicador",
        "instrumento": "B9",
        "marca": "B10",
        "modelo": "B11",
        "serie": "B12",
        "id": "F9",
    },
    {
        "file": "Formato Multimetro.xlsm",
        "calc": "Calculos",
        "portada": "Portada",
        "extra_lock_sheets": ["Resultados", "Patrones", "CMC"],
        "cert": ["D4", "E4", "F4"],
        "unlock": [
            "D4", "E4", "F4",
            "B10", "B11", "B12",
            "F10", "J9", "J10",
            "F13", "J13", "F14", "J14",
            "H21",
            # lecturas: nominal/resolución/unidad + 3 lecturas
            "A18:A45", "C18:C45", "D18:D45", "E18:E45", "G18:G45", "I18:I45",
        ],
        "layout": "indicador",
        "instrumento": "B9",
        "marca": "B10",
        "modelo": "B11",
        "serie": "B12",
        "id": "F9",
    },
    {
        "file": "Formato Básculas y Balanzas.xlsm",
        "calc": "CALCULOS",
        "portada": "PORTADA",
        "extra_lock_sheets": ["RESULTADOS", "PATRONES", "Patrones"],
        "cert": ["D4", "E4", "F4"],
        "unlock": [
            "D4", "E4", "F4",
            "B10", "B11", "B12",
            "F10", "J9", "J10",
            "F13", "J13", "F14", "J14",
            "D37",  # EMP NORMA/CLIENTE
            # excentricidad / repetibilidad / linealidad
            "C24:C35", "G22:J32", "B18:C20", "A40:J55",
        ],
        "layout": "indicador",
        "instrumento": "B9",
        "marca": "B10",
        "modelo": "B11",
        "serie": "B12",
        "id": "F9",
    },
    {
        "file": "Formato Dinamometro Unificado.xlsm",
        "calc": "CALCULOS",
        "portada": "PORTADA",
        "extra_lock_sheets": ["RESULTADOS", "PATRONES", "Patrones"],
        "cert": ["D4", "E4", "F4"],
        "unlock": [
            "D4", "E4", "F4",
            "B10", "B11", "B12",
            "F10", "J9", "J10", "L17",
            "F13", "J13", "F14", "J14",
            "H21",
            "C25:E50", "B25:B50",
        ],
        "layout": "indicador",
        "instrumento": "B9",
        "marca": "B10",
        "modelo": "B11",
        "serie": "B12",
        "id": "F9",
    },
    {
        "file": "Formato master Presion.xlsm",
        "calc": "Calculos",
        "portada": "Portada",
        "extra_lock_sheets": ["Resultados", "Patrones", "CMC"],
        "cert": ["D4", "E4", "F4"],
        "unlock": [
            "D4", "E4", "F4",
            "B10", "B11", "B12",
            "F10", "J9", "J10", "J14", "K5",
            "B13", "F15", "L6", "L7",
            "F13", "F14",
            "C20:D22", "F20:G22",
            "A27:F38", "H27:K38",
        ],
        "layout": "indicador",
        "instrumento": "B9",
        "marca": "B10",
        "modelo": "B11",
        "serie": "B12",
        "id": "F9",
        "hist": "Historial",
    },
    {
        "file": "Formato Torque.xlsm",
        "calc": "Toma Datos",
        "portada": "Portada",
        "extra_lock_sheets": ["Resultados", "Patrones"],
        "cert": ["D2", "E2", "F2"],
        "unlock": [
            "D2", "E2", "F2",
            "C9", "C10", "C11",  # marca/modelo/serie
            "J9", "N8", "N9", "N11", "M2",
            "P2", "P5",
            "C21:G45",
        ],
        "layout": "torque",
        "instrumento": "B5",
        "marca": "C9",
        "modelo": "C10",
        "serie": "C11",
        "id": "F5",
    },
    {
        "file": "Formato Termohigrometro.xlsm",
        "calc": "Calculos",
        "portada": "Portada",
        "extra_lock_sheets": ["RESULTADOS", "Patrones", "CMC", "CMC (2)"],
        "cert": ["D4", "E4", "F4"],
        "unlock": [
            "D4", "E4", "F4",
            "B10", "B11", "B12",
            "F10", "J9", "J10",
            "F13", "J13", "F14", "J14",
            "N12", "N13", "N14",
            "C20:E29", "I20:K29",
            "C32:E45", "I32:K45",
            "L20:L45",
        ],
        "layout": "temp",
        "instrumento": "B9",
        "marca": "B10",
        "modelo": "B11",
        "serie": "B12",
        "id": "F9",
    },
    {
        "file": "Formato Termometro IR.xlsm",
        "calc": "Muestreo",
        "portada": "Portada",
        "extra_lock_sheets": ["Resultados", "MCM", "Hoja1"],
        "cert": ["D4", "E4", "F4"],
        "unlock": [
            "D4", "E4", "F4",
            "B9", "B10", "B11",
            "I9", "I10", "I11", "K11", "B13",
            "B21", "B22", "B24", "B25",
            "C30:E50", "O30:O50",
        ],
        "layout": "temp",
        "instrumento": "B8",
        "marca": "B9",
        "modelo": "B10",
        "serie": "B11",
        "id": "F8",
    },
    {
        "file": "Formato Hornos y Muflas.xlsm",
        "calc": "Calculos",
        "portada": "Portada",
        "extra_lock_sheets": ["Resultados", "Patrones", "HT", "Tp J", "Tp E", "Tp T", "Tp K"],
        "cert": ["D4", "E4", "F4"],
        "unlock": [
            "D4", "E4", "F4",
            "B10", "B11", "B12",
            "F10", "J9", "J10", "J11", "E18", "F18",
            "F13", "J13", "F14", "J14",
            "M12", "M13", "M14",
            # Lecturas IBC: valor generado, resolución, X1-X3, EMP
            "A20:B45", "D20:F45", "I20:I45",
        ],
        "layout": "temp",
        "instrumento": "B9",
        "marca": "B10",
        "modelo": "B11",
        "serie": "B12",
        "id": "F9",
    },

    {
        "file": "Formato Tiempo.xlsm",
        "calc": "Calculos",
        "portada": "Portada",
        "extra_lock_sheets": ["Resultados", "CMC", "SESGO o BIAS", "Histograma", "Calculo", "Hoja2"],
        "cert": ["G9", "H9", "I9"],
        "unlock": [
            "G9", "H9", "I9",
            "D16", "D17", "D18",
            "I16", "N15", "N17",
            "I19", "N19", "I20", "N20",
            "M28", "M29",
            "F19",
            "E23", "I22", "I23", "I24", "E25",
            "M22", "M23", "M24", "M25", "P22", "P23",
            "D49", "D50", "D51", "D53",
            "C62:E67", "G62:H67", "K62:K67",
            "Q10",  # Aprobó (Calibró P10 viene del historial)
            "M6",
        ],
        "layout": "tiempo",
        "instrumento": "D15",
        "marca": "D16",
        "modelo": "D17",
        "serie": "D18",
        "id": "I15",
        "calibro": "P10",
    },
]


def try_unprotect(ws) -> None:
    for pwd in (PASSWORD, "AG", "calidad", "1234", ""):
        try:
            if pwd:
                ws.Unprotect(Password=pwd)
            else:
                ws.Unprotect()
            return
        except Exception:
            continue


def try_protect(ws) -> None:
    try:
        ws.Protect(
            Password=PASSWORD,
            DrawingObjects=False,  # botones siguen clicables
            Contents=True,
            Scenarios=True,
            UserInterfaceOnly=True,
            AllowFormattingCells=False,
            AllowInsertingColumns=False,
            AllowInsertingRows=False,
            AllowDeletingColumns=False,
            AllowDeletingRows=False,
        )
    except Exception:
        try:
            ws.Protect(
                Password=PASSWORD,
                DrawingObjects=False,
                Contents=True,
                Scenarios=True,
                UserInterfaceOnly=True,
            )
        except Exception as e:
            print("    aviso protect", ws.Name, e)


def lock_all(ws) -> None:
    try:
        ws.Cells.Locked = True
    except Exception:
        pass


def unlock_range(ws, addr: str) -> None:
    """Desbloquea un rango. No reducir a MergeArea (rompe C25:E45 si hay merges)."""
    try:
        rng = ws.Range(addr)
    except Exception:
        return
    try:
        # Excel aplica Locked a todas las celdas del rango (incl. merges)
        rng.Locked = False
        return
    except Exception:
        pass
    # Fallback celda a celda
    try:
        for row in rng.Rows:
            for cell in row.Cells:
                try:
                    if cell.MergeCells:
                        cell.MergeArea.Locked = False
                    else:
                        cell.Locked = False
                except Exception:
                    continue
    except Exception:
        pass


def idx_formula(hist: str, col: str, cert_row: str = "4") -> str:
    if cert_row == "2":
        key = 'TRIM($D$2)&"-"&TEXT($E$2,"0000")&"-"&TEXT($F$2,"00")'
    elif cert_row == "g9":
        key = 'TRIM($G$9)&"-"&TEXT($H$9,"0000")&"-"&TEXT($I$9,"00")'
    else:
        key = 'TRIM($D$4)&"-"&TEXT($E$4,"0000")&"-"&TEXT($F$4,"00")'
    m = f"MATCH({key},{hist}!$B:$B,0)"
    return (
        f'=IFERROR(IF(OR(INDEX({hist}!${col}:${col},{m})="",'
        f'INDEX({hist}!${col}:${col},{m})=0),"",'
        f"INDEX({hist}!${col}:${col},{m})),\"\")"
    )


def ensure_historial_formulas(calc, cfg: dict) -> None:
    """Reafirma fórmulas de cliente/instrumento/fechas para que al cambiar cert vuelvan."""
    hist = cfg.get("hist", HIST)
    # ¿existe hoja historial?
    try:
        calc.Parent.Worksheets(hist)
    except Exception:
        print("    sin hoja", hist, "- no se reescriben fórmulas historial")
        return

    if cfg.get("layout") == "torque":
        cert_row = "2"
    elif cfg.get("layout") == "tiempo":
        cert_row = "g9"
    else:
        cert_row = "4"

    # Cliente / domicilio / contacto / correo / tel
    if cfg.get("layout") == "torque":
        mapping = []
    elif cfg.get("layout") == "tiempo":
        # Certificado en G9-H9-I9; cliente en D10/D11/D12/H10/H11
        mapping = [
            ("D10", "C"),
            ("D11", "N"),
            ("D12", "O"),
            ("H10", "P"),
            ("H11", "Q"),
        ]
        # Las fórmulas de Tiempo usan G9/H9/I9 (no D4); se reescriben abajo.
    elif cfg.get("layout") == "vernier":
        # Vernier: etiquetas en A6/A7/A9 y D6/D7 (no B5/E5 como Indicador)
        mapping = [
            ("B6", "C"),
            ("B7", "N"),
            ("B9", "O"),
            ("E6", "P"),
            ("E7", "Q"),
        ]
        # Limpiar celdas donde el layout Indicador dejaba datos flotando
        for addr in ("B5", "E5", "B10", "F10"):
            try:
                calc.Range(addr).ClearContents()
            except Exception:
                pass
    else:
        mapping = [
            ("B5", "C"),
            ("B6", "N"),
            ("B7", "O"),
            ("E5", "P"),
            ("E6", "Q"),
        ]

    for addr, col in mapping:
        try:
            calc.Range(addr).Formula = idx_formula(hist, col, cert_row)
            calc.Range(addr).Locked = True
        except Exception:
            pass

    # Instrumento fields
    for addr, col in (
        (cfg.get("instrumento"), "D"),
        (cfg.get("marca"), "E"),
        (cfg.get("modelo"), "F"),
        (cfg.get("serie"), "G"),
        (cfg.get("id"), "H"),
    ):
        if not addr:
            continue
        try:
            blank = '"No encontrado"' if col in ("D", "E") else '""'
            if cert_row == "2":
                key = 'TRIM($D$2)&"-"&TEXT($E$2,"0000")&"-"&TEXT($F$2,"00")'
            elif cert_row == "g9":
                key = 'TRIM($G$9)&"-"&TEXT($H$9,"0000")&"-"&TEXT($I$9,"00")'
            else:
                key = 'TRIM($D$4)&"-"&TEXT($E$4,"0000")&"-"&TEXT($F$4,"00")'
            m = f"MATCH({key},{hist}!$B:$B,0)"
            calc.Range(addr).Formula = (
                f'=IFERROR(IF(OR(INDEX({hist}!${col}:${col},{m})="",'
                f'INDEX({hist}!${col}:${col},{m})=0),{blank},'
                f"INDEX({hist}!${col}:${col},{m})),{blank})"
            )
            calc.Range(addr).Locked = True
        except Exception:
            pass

    # Fechas
    if cfg.get("layout") == "torque":
        return
    if cert_row == "g9":
        key = 'TRIM($G$9)&"-"&TEXT($H$9,"0000")&"-"&TEXT($I$9,"00")'
    else:
        key = 'TRIM($D$4)&"-"&TEXT($E$4,"0000")&"-"&TEXT($F$4,"00")'
    m = f"MATCH({key},{hist}!$B:$B,0)"
    try:
        if cfg.get("layout") == "tiempo":
            # Tiempo: M9 recepción, M10 calibración, M11 sugerida, M12 elaboración
            calc.Range("M9").Formula = (
                "=IFERROR("
                f'IF(INDEX({hist}!$M:$M,{m})="",'
                f'IF(UPPER(LEFT(INDEX({hist}!$K:$K,{m}),1))="S","Servicio en Sitio",""),'
                f"VALUE(INDEX({hist}!$M:$M,{m}))),"
                f'IF(IFERROR(UPPER(LEFT(INDEX({hist}!$K:$K,{m}),1)),"")="S","Servicio en Sitio",""))'
            )
            calc.Range("M10").Formula = f'=IFERROR(VALUE(INDEX({hist}!$I:$I,{m})),"")'
            calc.Range("M11").Formula = (
                f'=IFERROR(EDATE($M$10,IF(INDEX({hist}!$L:$L,{m})="6 meses",6,'
                f'IF(INDEX({hist}!$L:$L,{m})="3 meses",3,'
                f'IF(INDEX({hist}!$L:$L,{m})="24 meses",24,12)))),"")'
            )
            calc.Range("M12").Formula = "=TODAY()"
            date_cells = ("M9", "M10", "M11", "M12")
        elif cfg.get("layout") == "vernier":
            # Vernier: I4 recepción, I6 calibración, I7 sugerida, I9 elaboración
            calc.Range("I4").Formula = (
                "=IFERROR("
                f'IF(INDEX({hist}!$M:$M,{m})="",'
                f'IF(UPPER(LEFT(INDEX({hist}!$K:$K,{m}),1))="S","Servicio en Sitio",""),'
                f"VALUE(INDEX({hist}!$M:$M,{m}))),"
                f'IF(IFERROR(UPPER(LEFT(INDEX({hist}!$K:$K,{m}),1)),"")="S","Servicio en Sitio",""))'
            )
            calc.Range("I6").Formula = f'=IFERROR(VALUE(INDEX({hist}!$I:$I,{m})),"")'
            calc.Range("I7").Formula = (
                f'=IFERROR(EDATE($I$6,IF(INDEX({hist}!$L:$L,{m})="6 meses",6,'
                f'IF(INDEX({hist}!$L:$L,{m})="3 meses",3,'
                f'IF(INDEX({hist}!$L:$L,{m})="24 meses",24,12)))),"")'
            )
            calc.Range("I9").Formula = "=TODAY()"
            date_cells = ("I4", "I6", "I7", "I9")
        else:
            calc.Range("I4").Formula = (
                "=IFERROR("
                f'IF(INDEX({hist}!$M:$M,{m})="",'
                f'IF(UPPER(LEFT(INDEX({hist}!$K:$K,{m}),1))="S","Servicio en Sitio",""),'
                f"VALUE(INDEX({hist}!$M:$M,{m}))),"
                f'IF(IFERROR(UPPER(LEFT(INDEX({hist}!$K:$K,{m}),1)),"")="S","Servicio en Sitio",""))'
            )
            calc.Range("I5").Formula = f'=IFERROR(VALUE(INDEX({hist}!$I:$I,{m})),"")'
            calc.Range("I6").Formula = (
                f'=IFERROR(EDATE($I$5,IF(INDEX({hist}!$L:$L,{m})="6 meses",6,'
                f'IF(INDEX({hist}!$L:$L,{m})="3 meses",3,'
                f'IF(INDEX({hist}!$L:$L,{m})="24 meses",24,12)))),"")'
            )
            calc.Range("I7").Formula = "=TODAY()"
            date_cells = ("I4", "I5", "I6", "I7")
        for a in date_cells:
            rng = calc.Range(a)
            try:
                if rng.MergeCells:
                    rng.MergeArea.Locked = True
                else:
                    rng.Locked = True
            except Exception:
                pass
            try:
                rng.NumberFormatLocal = "aaaa-mmm-dd"
            except Exception:
                pass
    except Exception as e:
        print("    aviso fechas", e)

    # Calibró = técnico del certificado (historial col J)
    calibro = cfg.get("calibro")
    if calibro is None:
        if cfg.get("layout") == "vernier":
            calibro = "M13"
        elif cfg.get("layout") == "torque":
            calibro = None
        elif cfg.get("layout") == "tiempo":
            calibro = "P10"
        else:
            calibro = "M8"
    if calibro:
        try:
            rng = calc.Range(calibro)
            if rng.MergeCells:
                rng = rng.MergeArea
            rng.Formula = idx_formula(hist, "J", cert_row)
            rng.Locked = True
            try:
                rng.Validation.Delete()
            except Exception:
                pass
        except Exception as e:
            print("    aviso calibro", e)


def protect_sheet_full(ws) -> None:
    try_unprotect(ws)
    lock_all(ws)
    try_protect(ws)


def process_master(excel, cfg: dict) -> None:
    path = FOLDER / cfg["file"]
    if not path.exists():
        print("MISS", cfg["file"])
        return
    print(f"\n=== {cfg['file']} ===")
    wb = excel.Workbooks.Open(str(path), UpdateLinks=0, ReadOnly=False, IgnoreReadOnlyRecommended=True)
    if wb.ReadOnly:
        print("  RO - saltando")
        wb.Close(False)
        return

    calc = wb.Worksheets(cfg["calc"])
    try_unprotect(calc)

    # 1) Bloquear todo
    lock_all(calc)

    # 2) Reafirmar fórmulas historial (cliente/marca/fechas) y dejarlas Locked
    ensure_historial_formulas(calc, cfg)

    # 3) Desbloquear solo lo permitido (+ marca/modelo/serie siempre)
    for addr in cfg.get("unlock", []):
        unlock_range(calc, addr)
    for addr in cfg.get("cert", []):
        unlock_range(calc, addr)
    for key in ("marca", "modelo", "serie"):
        addr = cfg.get(key)
        if addr:
            unlock_range(calc, addr)

    # 4) Proteger Calculos (botones siguen activos; NO se mueven shapes)
    try_protect(calc)
    # conteo rápido de editables
    n_u = 0
    try:
        for r in range(1, 51):
            for c in range(1, 13):
                if not calc.Cells(r, c).Locked:
                    n_u += 1
    except Exception:
        pass
    print(f"  Calculos protegido; editables A1:L50 ≈ {n_u}")

    # 5) Portada y hojas extra: todo bloqueado
    for name in [cfg.get("portada")] + list(cfg.get("extra_lock_sheets") or []):
        if not name:
            continue
        try:
            ws = wb.Worksheets(name)
            protect_sheet_full(ws)
            print("  lock", name)
        except Exception:
            pass

    # 6) BD / historial very hidden + protect
    for name in ("obtenerDatosExcel", "Historial", "BD_Clientes", "BD_Patrones"):
        try:
            ws = wb.Worksheets(name)
            try_unprotect(ws)
            lock_all(ws)
            try:
                ws.Visible = 2
            except Exception:
                try:
                    ws.Visible = False
                except Exception:
                    pass
            try_protect(ws)
        except Exception:
            pass

    wb.Save()
    wb.Close(True)
    print("  Guardado")


def main() -> int:
    pythoncom.CoInitialize()
    excel = win32com.client.DispatchEx("Excel.Application")
    excel.Visible = False
    excel.DisplayAlerts = False
    excel.AskToUpdateLinks = False
    excel.EnableEvents = False
    try:
        for cfg in MASTERS:
            try:
                process_master(excel, cfg)
            except Exception as e:
                print("ERROR", cfg["file"], e)
                import traceback
                traceback.print_exc()
    finally:
        excel.Quit()
        pythoncom.CoUninitialize()
    print("\nListo. Contraseña Calidad: AG-Calidad-2026")
    print("Revisar > Proteger hoja / Desproteger hoja para Calidad.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
