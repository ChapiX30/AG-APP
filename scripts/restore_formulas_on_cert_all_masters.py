#!/usr/bin/env python3
"""
Al cambiar el folio del certificado, restaura las fórmulas de
instrumento / marca / modelo / serie (y cabecera relacionada)
en Torque, Multímetro y Básculas.

Presión ya tiene RestablecerFormulasDesdeHistorial.
"""
from __future__ import annotations

import shutil
import sys
from datetime import datetime
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace", line_buffering=True)

import pythoncom
import win32com.client

FOLDER = Path(r"C:\Users\AG\Desktop\FORMATOS AG")
PASSWORD = "AG-Calidad-2026"


def esc(formula: str) -> str:
    """Excel formula -> VBA string literal contents (quotes doubled)."""
    return formula.replace('"', '""')


def set_sheet_code(wb, code_name: str, full_code: str) -> None:
    target = None
    for i in range(1, wb.VBProject.VBComponents.Count + 1):
        c = wb.VBProject.VBComponents.Item(i)
        if str(c.Name) == code_name:
            target = c
            break
    if target is None:
        raise RuntimeError(f"No se encontró módulo de hoja {code_name}")
    code = target.CodeModule
    if code.CountOfLines:
        code.DeleteLines(1, code.CountOfLines)
    code.AddFromString(full_code)


def try_unprotect(ws) -> None:
    try:
        ws.Unprotect(Password=PASSWORD)
    except Exception:
        try:
            ws.Unprotect()
        except Exception:
            pass


def try_protect(ws) -> None:
    try:
        ws.Protect(
            Password=PASSWORD,
            DrawingObjects=False,
            Contents=True,
            Scenarios=True,
        )
    except Exception:
        pass


# ---------- TORQUE (Toma Datos / Hoja4) — certificado D2:F2 ----------
TORQUE_FORMULAS = {
    "C3": '=IFERROR(INDEX(obtenerDatosExcel!$C:$C,MATCH(TRIM($D$2)&"-"&TEXT($E$2,"0000")&"-"&TEXT($F$2,"00"),obtenerDatosExcel!$B:$B,0)),"")',
    "I3": '=IFERROR(INDEX(obtenerDatosExcel!$P:$P,MATCH(TRIM($D$2)&"-"&TEXT($E$2,"0000")&"-"&TEXT($F$2,"00"),obtenerDatosExcel!$B:$B,0)),"")',
    "C4": '=IFERROR(INDEX(obtenerDatosExcel!$N:$N,MATCH(TRIM($D$2)&"-"&TEXT($E$2,"0000")&"-"&TEXT($F$2,"00"),obtenerDatosExcel!$B:$B,0)),"")',
    "I4": '=IFERROR(INDEX(obtenerDatosExcel!$Q:$Q,MATCH(TRIM($D$2)&"-"&TEXT($E$2,"0000")&"-"&TEXT($F$2,"00"),obtenerDatosExcel!$B:$B,0)),"")',
    "C5": '=IFERROR(INDEX(obtenerDatosExcel!$O:$O,MATCH(TRIM($D$2)&"-"&TEXT($E$2,"0000")&"-"&TEXT($F$2,"00"),obtenerDatosExcel!$B:$B,0)),"")',
    "C8": '=IF(OR($E$2="",$F$2=""),"",IFERROR(INDEX(obtenerDatosExcel!$D:$D,MATCH(TRIM($D$2)&"-"&TEXT($E$2,"0000")&"-"&TEXT($F$2,"00"),obtenerDatosExcel!$B:$B,0)),"No encontrado"))',
    "C9": '=IF(OR($E$2="",$F$2=""),"",IFERROR(INDEX(obtenerDatosExcel!$E:$E,MATCH(TRIM($D$2)&"-"&TEXT($E$2,"0000")&"-"&TEXT($F$2,"00"),obtenerDatosExcel!$B:$B,0)),"No encontrado"))',
    "C10": '=IF(OR($E$2="",$F$2=""),"",IFERROR(INDEX(obtenerDatosExcel!$F:$F,MATCH(TRIM($D$2)&"-"&TEXT($E$2,"0000")&"-"&TEXT($F$2,"00"),obtenerDatosExcel!$B:$B,0)),""))',
    "C11": '=IF(OR($E$2="",$F$2=""),"",IFERROR(INDEX(obtenerDatosExcel!$G:$G,MATCH(TRIM($D$2)&"-"&TEXT($E$2,"0000")&"-"&TEXT($F$2,"00"),obtenerDatosExcel!$B:$B,0)),""))',
    "J8": '=IF(OR($E$2="",$F$2=""),"",IFERROR(INDEX(obtenerDatosExcel!$H:$H,MATCH(TRIM($D$2)&"-"&TEXT($E$2,"0000")&"-"&TEXT($F$2,"00"),obtenerDatosExcel!$B:$B,0)),""))',
    "P2": '=IFERROR(IF(INDEX(obtenerDatosExcel!$M:$M,MATCH(TRIM($D$2)&"-"&TEXT($E$2,"0000")&"-"&TEXT($F$2,"00"),obtenerDatosExcel!$B:$B,0))="",IF(OR(UPPER(LEFT(INDEX(obtenerDatosExcel!$K:$K,MATCH(TRIM($D$2)&"-"&TEXT($E$2,"0000")&"-"&TEXT($F$2,"00"),obtenerDatosExcel!$B:$B,0)),1))="S"),"Servicio en Sitio",""),VALUE(INDEX(obtenerDatosExcel!$M:$M,MATCH(TRIM($D$2)&"-"&TEXT($E$2,"0000")&"-"&TEXT($F$2,"00"),obtenerDatosExcel!$B:$B,0)))),IF(OR(UPPER(LEFT(INDEX(obtenerDatosExcel!$K:$K,MATCH(TRIM($D$2)&"-"&TEXT($E$2,"0000")&"-"&TEXT($F$2,"00"),obtenerDatosExcel!$B:$B,0)),1))="S"),"Servicio en Sitio",""))',
    "P3": '=IFERROR(VALUE(INDEX(obtenerDatosExcel!$I:$I,MATCH(TRIM($D$2)&"-"&TEXT($E$2,"0000")&"-"&TEXT($F$2,"00"),obtenerDatosExcel!$B:$B,0))),"")',
    "L4": '=IFERROR(IF(INDEX(obtenerDatosExcel!$L:$L,MATCH(TRIM($D$2)&"-"&TEXT($E$2,"0000")&"-"&TEXT($F$2,"00"),obtenerDatosExcel!$B:$B,0))="6 meses",6,IF(INDEX(obtenerDatosExcel!$L:$L,MATCH(TRIM($D$2)&"-"&TEXT($E$2,"0000")&"-"&TEXT($F$2,"00"),obtenerDatosExcel!$B:$B,0))="3 meses",3,IF(INDEX(obtenerDatosExcel!$L:$L,MATCH(TRIM($D$2)&"-"&TEXT($E$2,"0000")&"-"&TEXT($F$2,"00"),obtenerDatosExcel!$B:$B,0))="24 meses",24,12))),12)',
    "D12": '=IFERROR(IF(OR(INDEX(obtenerDatosExcel!$K:$K,MATCH(TRIM($D$2)&"-"&TEXT($E$2,"0000")&"-"&TEXT($F$2,"00"),obtenerDatosExcel!$B:$B,0))="Laboratorio",INDEX(obtenerDatosExcel!$K:$K,MATCH(TRIM($D$2)&"-"&TEXT($E$2,"0000")&"-"&TEXT($F$2,"00"),obtenerDatosExcel!$B:$B,0))="laboratorio"),"Instalaciones AG",IF(OR(INDEX(obtenerDatosExcel!$K:$K,MATCH(TRIM($D$2)&"-"&TEXT($E$2,"0000")&"-"&TEXT($F$2,"00"),obtenerDatosExcel!$B:$B,0))="Sitio",INDEX(obtenerDatosExcel!$K:$K,MATCH(TRIM($D$2)&"-"&TEXT($E$2,"0000")&"-"&TEXT($F$2,"00"),obtenerDatosExcel!$B:$B,0))="sitio"),"Instalaciones de Cliente","")),"")',
    "AI15": '=IFERROR(INDEX(obtenerDatosExcel!$J:$J,MATCH(TRIM($D$2)&"-"&TEXT($E$2,"0000")&"-"&TEXT($F$2,"00"),obtenerDatosExcel!$B:$B,0)),"")',
}


def build_restore_vba(cert_range: str, formulas: dict[str, str], password: str = PASSWORD) -> str:
    lines = [
        "Private Sub Worksheet_Change(ByVal Target As Range)",
        "    On Error GoTo ErrorHandler",
        f'    If Intersect(Target, Range("{cert_range}")) Is Nothing Then Exit Sub',
        "    Application.EnableEvents = False",
        "    Call RestablecerFormulasDesdeCertificado",
        "    Application.EnableEvents = True",
        "    Exit Sub",
        "ErrorHandler:",
        "    Application.EnableEvents = True",
        "End Sub",
        "",
        "Private Sub RestablecerFormulasDesdeCertificado()",
        "    On Error Resume Next",
        f'    Me.Unprotect Password:="{password}"',
    ]
    for addr, formula in formulas.items():
        lines.append(f'    Range("{addr}").Formula = "{esc(formula)}"')
    lines += [
        f'    Me.Protect Password:="{password}", DrawingObjects:=False, Contents:=True, Scenarios:=True',
        "    On Error GoTo 0",
        "End Sub",
        "",
    ]
    return "\n".join(lines)


# ---------- MULTIMETRO (Calculos / Hoja3) — certificado D4:F4 ----------
MULTI_FORMULAS = {
    "B5": '=IFERROR(INDEX(obtenerDatosExcel!$C:$C,MATCH($D$4 & "-" & TEXT($E$4,"0000") & "-" & $F$4,obtenerDatosExcel!$B:$B,0)),"")',
    "E5": '=IFERROR(INDEX(obtenerDatosExcel!$P:$P,MATCH($D$4 & "-" & TEXT($E$4,"0000") & "-" & $F$4,obtenerDatosExcel!$B:$B,0)),"")',
    "B6": '=IFERROR(INDEX(obtenerDatosExcel!$N:$N,MATCH($D$4 & "-" & TEXT($E$4,"0000") & "-" & $F$4,obtenerDatosExcel!$B:$B,0)),"")',
    "E6": '=IFERROR(INDEX(obtenerDatosExcel!$Q:$Q,MATCH($D$4 & "-" & TEXT($E$4,"0000") & "-" & $F$4,obtenerDatosExcel!$B:$B,0)),"")',
    "B7": '=IFERROR(INDEX(obtenerDatosExcel!$O:$O,MATCH($D$4 & "-" & TEXT($E$4,"0000") & "-" & $F$4,obtenerDatosExcel!$B:$B,0)),"")',
    "B9": '=IF(OR($E$4="",$F$4=""),"",IFERROR(INDEX(obtenerDatosExcel!$D:$D,MATCH(D4 & "-" & TEXT(E4,"0000") & "-" & F4,obtenerDatosExcel!$B:$B,0)),"No encontrado"))',
    "B10": '=IF(OR($E$4="",$F$4=""),"",IFERROR(INDEX(obtenerDatosExcel!$E:$E,MATCH(D4 & "-" & TEXT(E4,"0000") & "-" & F4,obtenerDatosExcel!$B:$B,0)),"No encontrado"))',
    "B11": '=IFERROR(INDEX(obtenerDatosExcel!$F:$F,MATCH($D$4 & "-" & TEXT($E$4,"0000") & "-" & $F$4,obtenerDatosExcel!$B:$B,0)),"")',
    "B12": '=IFERROR(INDEX(obtenerDatosExcel!$G:$G,MATCH($D$4 & "-" & TEXT($E$4,"0000") & "-" & $F$4,obtenerDatosExcel!$B:$B,0)),"")',
    "F9": '=IFERROR(INDEX(obtenerDatosExcel!$H:$H,MATCH($D$4 & "-" & TEXT($E$4,"0000") & "-" & $F$4,obtenerDatosExcel!$B:$B,0)),"")',
    "I4": '=IFERROR(IF(INDEX(obtenerDatosExcel!$M:$M,MATCH($D$4 & "-" & TEXT($E$4,"0000") & "-" & $F$4,obtenerDatosExcel!$B:$B,0))="",IF(OR(UPPER(LEFT(K4,1))="S"),"Servicio en Sitio",""),VALUE(INDEX(obtenerDatosExcel!$M:$M,MATCH($D$4 & "-" & TEXT($E$4,"0000") & "-" & $F$4,obtenerDatosExcel!$B:$B,0)))),IF(OR(UPPER(LEFT(K4,1))="S"),"Servicio en Sitio",""))',
    "I5": '=IFERROR(VALUE(INDEX(obtenerDatosExcel!$I:$I,MATCH($D$4 & "-" & TEXT($E$4,"0000") & "-" & $F$4,obtenerDatosExcel!$B:$B,0))),"")',
    "I6": '=IFERROR(EDATE(I5, IF(INDEX(obtenerDatosExcel!$L:$L,MATCH($D$4 & "-" & TEXT($E$4,"0000") & "-" & $F$4,obtenerDatosExcel!$B:$B,0))="6 meses", 6, 12)), "")',
    "K4": '=IFERROR(INDEX(obtenerDatosExcel!$K:$K,MATCH($D$4 & "-" & TEXT($E$4,"0000") & "-" & $F$4,obtenerDatosExcel!$B:$B,0)),"")',
    "C14": '=IF(OR(K4="Laboratorio",K4="laboratorio"),"Instalaciones AG",IF(OR(K4="Sitio",K4="sitio"),"Instalaciones de Cliente",""))',
    "M8": '=IFERROR(INDEX(obtenerDatosExcel!$J:$J,MATCH($D$4 & "-" & TEXT($E$4,"0000") & "-" & $F$4,obtenerDatosExcel!$B:$B,0)),"")',
}


# ---------- BASCULAS (CALCULOS / Hoja4) — cert D4:F4 + keep J10 unit convert ----------
MASA_FORMULAS = {
    "B5": '=IFERROR(INDEX(obtenerDatosExcel!$C:$C,MATCH(TRIM($D$4)&"-"&TEXT($E$4,"0000")&"-"&TEXT($F$4,"00"),obtenerDatosExcel!$B:$B,0)),"")',
    "E5": '=IFERROR(INDEX(obtenerDatosExcel!$P:$P,MATCH(TRIM($D$4)&"-"&TEXT($E$4,"0000")&"-"&TEXT($F$4,"00"),obtenerDatosExcel!$B:$B,0)),"")',
    "B6": '=IFERROR(INDEX(obtenerDatosExcel!$N:$N,MATCH(TRIM($D$4)&"-"&TEXT($E$4,"0000")&"-"&TEXT($F$4,"00"),obtenerDatosExcel!$B:$B,0)),"")',
    "E6": '=IFERROR(INDEX(obtenerDatosExcel!$Q:$Q,MATCH(TRIM($D$4)&"-"&TEXT($E$4,"0000")&"-"&TEXT($F$4,"00"),obtenerDatosExcel!$B:$B,0)),"")',
    "B7": '=IFERROR(INDEX(obtenerDatosExcel!$O:$O,MATCH(TRIM($D$4)&"-"&TEXT($E$4,"0000")&"-"&TEXT($F$4,"00"),obtenerDatosExcel!$B:$B,0)),"")',
    "B9": '=IF(OR($E$4="",$F$4=""),"",IFERROR(INDEX(obtenerDatosExcel!$D:$D,MATCH(TRIM($D$4)&"-"&TEXT($E$4,"0000")&"-"&TEXT($F$4,"00"),obtenerDatosExcel!$B:$B,0)),"No encontrado"))',
    "B10": '=IF(OR($E$4="",$F$4=""),"",IFERROR(INDEX(obtenerDatosExcel!$E:$E,MATCH(TRIM($D$4)&"-"&TEXT($E$4,"0000")&"-"&TEXT($F$4,"00"),obtenerDatosExcel!$B:$B,0)),"No encontrado"))',
    "B11": '=IFERROR(INDEX(obtenerDatosExcel!$F:$F,MATCH(TRIM($D$4)&"-"&TEXT($E$4,"0000")&"-"&TEXT($F$4,"00"),obtenerDatosExcel!$B:$B,0)),"")',
    "B12": '=IFERROR(INDEX(obtenerDatosExcel!$G:$G,MATCH(TRIM($D$4)&"-"&TEXT($E$4,"0000")&"-"&TEXT($F$4,"00"),obtenerDatosExcel!$B:$B,0)),"")',
    "F9": '=IFERROR(INDEX(obtenerDatosExcel!$H:$H,MATCH(TRIM($D$4)&"-"&TEXT($E$4,"0000")&"-"&TEXT($F$4,"00"),obtenerDatosExcel!$B:$B,0)),"")',
    "I4": '=IFERROR(IF(INDEX(obtenerDatosExcel!$M:$M,MATCH(TRIM($D$4)&"-"&TEXT($E$4,"0000")&"-"&TEXT($F$4,"00"),obtenerDatosExcel!$B:$B,0))="",IF(UPPER(LEFT(INDEX(obtenerDatosExcel!$K:$K,MATCH(TRIM($D$4)&"-"&TEXT($E$4,"0000")&"-"&TEXT($F$4,"00"),obtenerDatosExcel!$B:$B,0)),1))="S","Servicio en Sitio",""),VALUE(INDEX(obtenerDatosExcel!$M:$M,MATCH(TRIM($D$4)&"-"&TEXT($E$4,"0000")&"-"&TEXT($F$4,"00"),obtenerDatosExcel!$B:$B,0)))),IF(IFERROR(UPPER(LEFT(INDEX(obtenerDatosExcel!$K:$K,MATCH(TRIM($D$4)&"-"&TEXT($E$4,"0000")&"-"&TEXT($F$4,"00"),obtenerDatosExcel!$B:$B,0)),1)),"")="S","Servicio en Sitio",""))',
    "I5": '=IFERROR(VALUE(INDEX(obtenerDatosExcel!$I:$I,MATCH(TRIM($D$4)&"-"&TEXT($E$4,"0000")&"-"&TEXT($F$4,"00"),obtenerDatosExcel!$B:$B,0))),"")',
    "I6": '=IFERROR(EDATE($I$5,IF(INDEX(obtenerDatosExcel!$L:$L,MATCH(TRIM($D$4)&"-"&TEXT($E$4,"0000")&"-"&TEXT($F$4,"00"),obtenerDatosExcel!$B:$B,0))="6 meses",6,IF(INDEX(obtenerDatosExcel!$L:$L,MATCH(TRIM($D$4)&"-"&TEXT($E$4,"0000")&"-"&TEXT($F$4,"00"),obtenerDatosExcel!$B:$B,0))="3 meses",3,IF(INDEX(obtenerDatosExcel!$L:$L,MATCH(TRIM($D$4)&"-"&TEXT($E$4,"0000")&"-"&TEXT($F$4,"00"),obtenerDatosExcel!$B:$B,0))="24 meses",24,12)))),"")',
    "S4": '=IFERROR(INDEX(obtenerDatosExcel!$K:$K,MATCH(TRIM($D$4)&"-"&TEXT($E$4,"0000")&"-"&TEXT($F$4,"00"),obtenerDatosExcel!$B:$B,0)),"")',
    "C14": '=IF(OR($S$4="Laboratorio",$S$4="laboratorio"),"Instalaciones AG",IF(OR($S$4="Sitio",$S$4="sitio"),"Instalaciones de Cliente",""))',
    "Q12": '=IFERROR(INDEX(obtenerDatosExcel!$J:$J,MATCH(TRIM($D$4)&"-"&TEXT($E$4,"0000")&"-"&TEXT($F$4,"00"),obtenerDatosExcel!$B:$B,0)),"")',
}


def build_masa_vba() -> str:
    restore_lines = [
        "Private Sub RestablecerFormulasDesdeCertificado()",
        "    On Error Resume Next",
        f'    Me.Unprotect Password:="{PASSWORD}"',
    ]
    for addr, formula in MASA_FORMULAS.items():
        restore_lines.append(f'    Range("{addr}").Formula = "{esc(formula)}"')
    restore_lines += [
        f'    Me.Protect Password:="{PASSWORD}", DrawingObjects:=False, Contents:=True, Scenarios:=True',
        "    On Error GoTo 0",
        "End Sub",
        "",
    ]
    change = f'''
Private Sub Worksheet_Change(ByVal Target As Range)
    On Error GoTo ErrorHandler

    ' --- Cambio de certificado: restaurar instrumento/marca/modelo/serie ---
    If Not Intersect(Target, Range("D4:F4")) Is Nothing Then
        Application.EnableEvents = False
        Call RestablecerFormulasDesdeCertificado
        Application.EnableEvents = True
        Exit Sub
    End If

    If Intersect(Target, Range("J10")) Is Nothing Then Exit Sub

    Application.EnableEvents = False

    Dim unidad As String, prev As String
    Dim fNew As Double, fOld As Double, ratio As Double
    Dim r As Long, c As Long

    unidad = LCase(Trim(CStr(Range("J10").Value)))
    prev = LCase(Trim(CStr(Range("AK11").Value)))
    If prev = "" Then
        If UCase(Trim(CStr(Range("D9").Value))) = "BALANZA" Then
            prev = "g"
        Else
            prev = "kg"
        End If
    End If

    fNew = FactorUnidadMasa(unidad)
    fOld = FactorUnidadMasa(prev)
    If fOld = 0 Then fOld = 1
    ratio = fNew / fOld

    If Abs(ratio - 1) > 0.0000000001 Then
        Call EscalarSiNumero(Range("F10"), ratio)
        Call EscalarSiNumero(Range("J9"), ratio)
        Call EscalarSiNumero(Range("K42"), ratio)

        For r = 17 To 19
            Call EscalarSiNumero(Cells(r, 2), ratio)
            Call EscalarSiNumero(Cells(r, 3), ratio)
        Next r

        For r = 24 To 35
            Call EscalarSiNumero(Cells(r, 3), ratio)
        Next r

        For r = 23 To 32
            For c = 7 To 10
                Call EscalarSiNumero(Cells(r, c), ratio)
            Next c
        Next r

        For r = 42 To 61
            For c = 5 To 8
                Call EscalarSiNumero(Cells(r, c), ratio)
            Next c
        Next r
    End If

    Range("AK11").Value = unidad

Salir:
    Application.EnableEvents = True
    Exit Sub

ErrorHandler:
    Application.EnableEvents = True
End Sub

Private Sub EscalarSiNumero(ByVal celda As Range, ByVal ratio As Double)
    Dim v As Variant
    On Error Resume Next
    If celda.MergeCells Then
        If celda.Address <> celda.MergeArea.Cells(1, 1).Address Then Exit Sub
    End If
    If celda.HasFormula Then Exit Sub
    v = celda.Value
    If IsNumeric(v) Then
        If CDbl(v) <> 0 Then celda.Value = CDbl(v) * ratio
    End If
    On Error GoTo 0
End Sub

Private Function FactorUnidadMasa(ByVal u As String) As Double
    Select Case LCase(Trim(u))
        Case "kg": FactorUnidadMasa = 1
        Case "g": FactorUnidadMasa = 1000
        Case "mg": FactorUnidadMasa = 1000000
        Case "lb": FactorUnidadMasa = 2.20462262
        Case "oz": FactorUnidadMasa = 35.27396195
        Case Else: FactorUnidadMasa = 1
    End Select
End Function
'''.lstrip()
    return change + "\n".join(restore_lines)


def test_restore(excel, wb, sheet_name: str, instrument_cell: str, cert_cell: str) -> bool:
    """Overwrite instrument, bump cert, check formula restored."""
    ws = wb.Worksheets(sheet_name)
    try_unprotect(ws)
    excel.EnableEvents = True
    ws.Range(instrument_cell).Value = "MANUAL_TEST_XYZ"
    old = ws.Range(cert_cell).Value
    try:
        bump = int(float(old)) + 1 if old not in (None, "") else 9999
    except Exception:
        bump = 9999
    ws.Range(cert_cell).Value = bump
    # put back so formulas match a real cert if possible
    ws.Range(cert_cell).Value = old if old not in (None, "") else bump
    excel.EnableEvents = False
    ok = bool(ws.Range(instrument_cell).HasFormula)
    print(f"  test {sheet_name}!{instrument_cell} HasFormula={ok} val={ws.Range(instrument_cell).Value!r}")
    try_protect(ws)
    return ok


def patch_file(excel, path: Path, code_name: str, vba: str, sheet: str, inst: str, cert: str) -> bool:
    backup = path.with_name(f"{path.stem}_backup_restore_{datetime.now():%Y%m%d_%H%M%S}{path.suffix}")
    shutil.copy2(path, backup)
    print(f"\n=== {path.name} ===")
    print(f"  respaldo: {backup.name}")
    wb = excel.Workbooks.Open(str(path.resolve()), UpdateLinks=0, ReadOnly=False)
    try:
        if wb.ReadOnly:
            raise RuntimeError("Solo lectura — cierra el archivo en Excel")
        set_sheet_code(wb, code_name, vba)
        text = ""
        for i in range(1, wb.VBProject.VBComponents.Count + 1):
            c = wb.VBProject.VBComponents.Item(i)
            if str(c.Name) == code_name:
                text = c.CodeModule.Lines(1, c.CodeModule.CountOfLines)
                break
        if "RestablecerFormulasDesdeCertificado" not in text:
            raise RuntimeError("VBA no quedó instalado")
        ok = test_restore(excel, wb, sheet, inst, cert)
        wb.Save()
        print(f"  guardado OK (evento disparó: {ok})")
        return ok
    finally:
        wb.Close(SaveChanges=False)


def main() -> int:
    targets = [
        (
            FOLDER / "Formato Torque.xlsm",
            "Hoja4",
            build_restore_vba("D2:F2", TORQUE_FORMULAS),
            "Toma Datos",
            "C8",
            "E2",
        ),
        (
            FOLDER / "Formato Multimetro.xlsm",
            "Hoja3",
            build_restore_vba("D4:F4", MULTI_FORMULAS),
            "Calculos",
            "B9",
            "E4",
        ),
        (
            FOLDER / "Formato Básculas y Balanzas.xlsm",
            "Hoja4",
            build_masa_vba(),
            "CALCULOS",
            "B9",
            "E4",
        ),
    ]

    for path, *_ in targets:
        if not path.exists():
            print(f"No existe: {path}")
            return 1

    # Presión: solo verificar
    presion = FOLDER / "Formato master Presion.xlsm"
    pythoncom.CoInitialize()
    excel = win32com.client.DispatchEx("Excel.Application")
    excel.Visible = False
    excel.DisplayAlerts = False
    excel.AskToUpdateLinks = False
    excel.EnableEvents = False

    results = []
    try:
        if presion.exists():
            wb = excel.Workbooks.Open(str(presion.resolve()), UpdateLinks=0, ReadOnly=True)
            found = False
            for i in range(1, wb.VBProject.VBComponents.Count + 1):
                c = wb.VBProject.VBComponents.Item(i)
                if c.CodeModule.CountOfLines and "RestablecerFormulasDesdeHistorial" in c.CodeModule.Lines(
                    1, min(c.CodeModule.CountOfLines, 500)
                ):
                    found = True
                    break
            wb.Close(False)
            print(f"\n=== {presion.name} ===")
            print(f"  ya tiene RestablecerFormulasDesdeHistorial: {found}")
            results.append(("Presion", found))

        for path, code_name, vba, sheet, inst, cert in targets:
            ok = patch_file(excel, path, code_name, vba, sheet, inst, cert)
            results.append((path.name, ok))

        print("\nResumen:")
        for name, ok in results:
            print(f"  {name}: {'OK' if ok else 'REVISAR'}")
        return 0 if all(ok for _, ok in results) else 2
    except Exception as exc:
        print(f"ERROR: {exc}")
        import traceback

        traceback.print_exc()
        return 1
    finally:
        excel.Quit()
        pythoncom.CoUninitialize()


if __name__ == "__main__":
    raise SystemExit(main())
