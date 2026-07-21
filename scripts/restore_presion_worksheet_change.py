#!/usr/bin/env python3
"""Restaura Worksheet_Change de Calculos sin AG_Historial (causa del error al cambiar E4)."""
from __future__ import annotations

import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

import pythoncom
import win32com.client

PATH = Path(r"C:\Users\AG\Desktop\FORMATOS AG\Formato master auto Presion_SIN_REF.xlsm")

VBA_CHANGE = r'''
Private Sub Worksheet_Change(ByVal Target As Range)
    ' Solo reacciona a Unidad (J10).
    ' Certificado D4/E4/F4: las formulas INDEX/MATCH a Historial se recalculan solas.
    If Intersect(Target, Range("J10")) Is Nothing Then Exit Sub

    On Error GoTo ErrorHandler
    Application.EnableEvents = False

    Dim unidad As String
    Dim factor As Double
    Dim i As Integer

    unidad = LCase(CStr(Range("J10").Value))

    Select Case unidad
        Case "psi": factor = 1
        Case "kpa": factor = 6.894757
        Case "bar": factor = 0.0689476
        Case "mbar": factor = 68.94757
        Case "kg-cm2": factor = 0.070307
        Case "inhg": factor = 2.036021
        Case "inh2o": factor = 27.6799
        Case "mmhg": factor = 51.7149
        Case "mpa": factor = 0.00689476
        Case Else: factor = 1
    End Select

    ' Vacío vs presión (kPa / inHg)
    If unidad = "kpa" Or unidad = "inhg" Then
        If IsNumeric(Range("F10").Value) Then
            If Range("F10").Value > 0 Then Range("F10").Value = Range("F10").Value * -1
        End If
    Else
        If IsNumeric(Range("F10").Value) Then
            If Range("F10").Value < 0 Then Range("F10").Value = Abs(Range("F10").Value)
        End If
    End If

    ' Conversion puntos base AG-008 en Patrones (psi -> unidad)
    Dim valBaseNominal As Variant, valBaseIncert As Variant
    valBaseNominal = Array(100, 200, 300, 400, 500, 600, 700, 800, 900, 1000)
    valBaseIncert = Array(0.058, 0.058, 0.059, 0.059, 0.06, 0.09, 0.063, 0.065, 0.073, 0.081)

    For i = 0 To 9
        Sheets("Patrones").Cells(5 + i, 5).Value = valBaseNominal(i) * factor
        Sheets("Patrones").Cells(5 + i, 7).Value = valBaseIncert(i) * factor
        Sheets("Patrones").Cells(5 + i, 8).Value = 0.375 * factor
    Next i

    Sheets("Patrones").Range("E4").Value = "Resultados en " & Range("J10").Value
    On Error Resume Next
    Sheets("CMC").Range("I1").Value = Range("J10").Value
    On Error GoTo ErrorHandler

Salir:
    Application.EnableEvents = True
    Exit Sub

ErrorHandler:
    Application.EnableEvents = True
    ' Sin MsgBox molesto; el cambio de certificado no debe interrumpirse
End Sub
'''


def main() -> int:
    pythoncom.CoInitialize()
    excel = win32com.client.DispatchEx("Excel.Application")
    excel.Visible = False
    excel.DisplayAlerts = False
    excel.EnableEvents = False

    try:
        wb = excel.Workbooks.Open(str(PATH.resolve()), UpdateLinks=0)
    except Exception as e:
        print("Cierra Excel y reintenta:", e)
        excel.Quit()
        pythoncom.CoUninitialize()
        return 2

    try:
        # Hoja3 = Calculos code-behind
        vbproj = wb.VBProject
        target = None
        for i in range(1, vbproj.VBComponents.Count + 1):
            comp = vbproj.VBComponents.Item(i)
            if comp.Name in ("Hoja3", "Calculos") or (
                comp.Type == 100 and "Calculos" in str(getattr(comp, "Properties", ""))
            ):
                # Prefer sheet code name Hoja3
                if comp.Name == "Hoja3":
                    target = comp
                    break
        if target is None:
            for i in range(1, vbproj.VBComponents.Count + 1):
                if vbproj.VBComponents.Item(i).Name == "Hoja3":
                    target = vbproj.VBComponents.Item(i)
                    break
        if target is None:
            print("No se encontro modulo Hoja3")
            wb.Close(False)
            return 3

        code = target.CodeModule
        if code.CountOfLines > 0:
            code.DeleteLines(1, code.CountOfLines)
        code.AddFromString(VBA_CHANGE)
        print("Worksheet_Change restaurado (sin AG_Historial)")
        wb.Save()
        print("Guardado:", PATH.name)
    finally:
        wb.Close(SaveChanges=True)
        excel.Quit()
        pythoncom.CoUninitialize()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
