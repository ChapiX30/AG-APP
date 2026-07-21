#!/usr/bin/env python3
"""Quita FactorUnidad / Worksheet_Change duplicados en Calculos (Hoja3)."""
from __future__ import annotations

import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

import pythoncom
import win32com.client

CANDIDATES = [
    Path(r"C:\Users\AG\Desktop\FORMATOS AG\Formato master auto Presion_SIN_REF.xlsm"),
    Path(r"C:\Users\AG\Desktop\FORMATOS AG\Formato master auto Presion_SIN_REF_unidades.xlsm"),
]

CLEAN_CODE = r'''
Private Sub Worksheet_Change(ByVal Target As Range)
    ' Unidad (J10): convierte F10, J9 y lecturas C28:K38.
    ' EMP en Patrones permanece en PSI; V/Y usan J13.
    If Intersect(Target, Range("J10")) Is Nothing Then Exit Sub

    On Error GoTo ErrorHandler
    Application.EnableEvents = False

    Dim unidad As String, prev As String
    Dim fNew As Double, fOld As Double, ratio As Double
    Dim r As Long, c As Long, v As Variant

    unidad = LCase(Trim(CStr(Range("J10").Value)))
    prev = LCase(Trim(CStr(Range("J14").Value)))
    If prev = "" Then prev = "psi"

    fNew = FactorUnidad(unidad)
    fOld = FactorUnidad(prev)
    If fOld = 0 Then fOld = 1
    ratio = fNew / fOld

    If ratio <> 1 Then
        If IsNumeric(Range("F10").Value) Then
            Range("F10").Value = CDbl(Range("F10").Value) * ratio
        End If
        If IsNumeric(Range("J9").Value) Then
            Range("J9").Value = CDbl(Range("J9").Value) * ratio
        End If
        For r = 28 To 38
            For c = 3 To 6
                If Not Cells(r, c).HasFormula Then
                    v = Cells(r, c).Value
                    If IsNumeric(v) Then
                        If CDbl(v) <> 0 Then Cells(r, c).Value = CDbl(v) * ratio
                    End If
                End If
            Next c
            For c = 8 To 11
                If Not Cells(r, c).HasFormula Then
                    v = Cells(r, c).Value
                    If IsNumeric(v) Then
                        If CDbl(v) <> 0 Then Cells(r, c).Value = CDbl(v) * ratio
                    End If
                End If
            Next c
        Next r
        If Not Range("N13").HasFormula Then
            If IsNumeric(Range("N13").Value) Then
                Range("N13").Value = CDbl(Range("N13").Value) * ratio
            End If
        End If
    End If

    Range("J14").Value = unidad

    On Error Resume Next
    Sheets("Patrones").Range("E4").Value = "Resultados en " & Range("J10").Value & " (EMP en psi; U/sesgo/lecturas convertidos)"
    Sheets("CMC").Range("I1").Value = Range("J10").Value
    On Error GoTo ErrorHandler

Salir:
    Application.EnableEvents = True
    Exit Sub

ErrorHandler:
    Application.EnableEvents = True
End Sub

Private Function FactorUnidad(ByVal u As String) As Double
    Select Case LCase(Trim(u))
        Case "psi": FactorUnidad = 1
        Case "kpa": FactorUnidad = 6.894757
        Case "mpa": FactorUnidad = 0.00689476
        Case "bar": FactorUnidad = 0.0689476
        Case "mbar": FactorUnidad = 68.94757
        Case "kg-cm2": FactorUnidad = 0.070307
        Case "inhg": FactorUnidad = 2.036021
        Case "inh2o": FactorUnidad = 27.6799
        Case "mmhg": FactorUnidad = 51.7149
        Case Else: FactorUnidad = 1
    End Select
End Function
'''


def clean_module(code) -> None:
    """Borra TODO el código del módulo y deja una sola copia limpia."""
    n = code.CountOfLines
    if n > 0:
        code.DeleteLines(1, n)
    code.AddFromString(CLEAN_CODE)


def process(path: Path) -> bool:
    print("Archivo:", path.name)
    pythoncom.CoInitialize()
    excel = win32com.client.DispatchEx("Excel.Application")
    excel.Visible = False
    excel.DisplayAlerts = False
    excel.EnableEvents = False
    try:
        wb = excel.Workbooks.Open(str(path.resolve()), UpdateLinks=0)
    except Exception as e:
        print("  No se pudo abrir (ciérralo en Excel):", e)
        excel.Quit()
        pythoncom.CoUninitialize()
        return False

    ok = False
    try:
        vbproj = wb.VBProject
        targets = []
        for i in range(1, vbproj.VBComponents.Count + 1):
            comp = vbproj.VBComponents.Item(i)
            name = comp.Name
            # Revisar módulos de hoja y estándar por si hay FactorUnidad duplicado
            try:
                txt = ""
                if comp.CodeModule.CountOfLines > 0:
                    txt = comp.CodeModule.Lines(1, comp.CodeModule.CountOfLines)
            except Exception:
                continue
            count = txt.lower().count("function factorunidad")
            if name == "Hoja3" or count > 0:
                targets.append((comp, count, name))

        for comp, count, name in targets:
            print(f"  Modulo {name}: FactorUnidad x{count}")
            if name == "Hoja3" or count > 1:
                clean_module(comp.CodeModule)
                print(f"  → limpiado {name} (1 Worksheet_Change + 1 FactorUnidad)")

        # Verificar
        for i in range(1, vbproj.VBComponents.Count + 1):
            comp = vbproj.VBComponents.Item(i)
            try:
                if comp.CodeModule.CountOfLines == 0:
                    continue
                txt = comp.CodeModule.Lines(1, comp.CodeModule.CountOfLines)
            except Exception:
                continue
            n = txt.lower().count("function factorunidad")
            if n:
                print(f"  Check {comp.Name}: FactorUnidad x{n}")
                if n > 1:
                    raise RuntimeError(f"Aún hay duplicados en {comp.Name}")

        wb.Save()
        print("  Guardado OK")
        ok = True
        wb.Close(True)
    except Exception as e:
        print("  Error:", e)
        try:
            wb.Close(False)
        except Exception:
            pass
    finally:
        excel.Quit()
        pythoncom.CoUninitialize()
    return ok


def main() -> int:
    any_ok = False
    for p in CANDIDATES:
        if not p.exists():
            continue
        if process(p):
            any_ok = True
    # También actualizar el script de fix para que no vuelva a acumular
    fix = Path(__file__).with_name("fix_presion_unit_conversion.py")
    if fix.exists():
        text = fix.read_text(encoding="utf-8")
        if "DeleteLines(1, n)" not in text and "CountOfLines" in text:
            print("(Revisa fix_presion_unit_conversion: debe borrar módulo completo antes de AddFromString)")
    if not any_ok:
        print("Cierra TODO Excel y vuelve a correr este script.")
        return 2
    print("Listo. Cierra el editor VBA, acepta el error si sigue abierto, y reabre el Excel.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
