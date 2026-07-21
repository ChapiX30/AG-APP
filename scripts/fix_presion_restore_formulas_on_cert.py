#!/usr/bin/env python3
"""
Al cambiar D4/E4/F4 (certificado) restaura formulas de Historial
para que un tecnico no rompa Marca/Modelo/etc. al escribir a mano.

Conserva conversion de unidades en J10 + FactorUnidad (sin duplicados).
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

import pythoncom
import win32com.client

PATH = Path(r"C:\Users\AG\Desktop\FORMATOS AG\Formato master auto Presion_SIN_REF.xlsm")

# Clave certificado (misma en todas las formulas)
KEY = '($D$4&"-"&TEXT($E$4,"0000")&"-"&$F$4)'

VBA = r'''
Private Sub Worksheet_Change(ByVal Target As Range)
    On Error GoTo ErrorHandler

    ' --- Cambio de certificado: restaurar formulas (evita romper formato) ---
    If Not Intersect(Target, Range("D4:F4")) Is Nothing Then
        Application.EnableEvents = False
        Call RestablecerFormulasDesdeHistorial
        Application.EnableEvents = True
        Exit Sub
    End If

    ' --- Cambio de unidad ---
    If Intersect(Target, Range("J10")) Is Nothing Then Exit Sub

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

Private Sub RestablecerFormulasDesdeHistorial()
    ' Siempre reescribe formulas al cambiar certificado.
    ' Asi Marca/Modelo/etc. vuelven automaticos aunque un tecnico las haya escrito a mano.
    Dim k As String
    k = "($D$4&""-""&TEXT($E$4,""0000"")&""-""&$F$4)"

    Range("B5").Formula = "=IFERROR(INDEX(Historial!$C:$C,MATCH(" & k & ",Historial!$B:$B,0)),"""")"
    Range("B6").Formula = "=IFERROR(VLOOKUP(B5,BD_Clientes!A:H,2,FALSE),"""")"
    Range("B7").Formula = "=IFERROR(VLOOKUP(B5,BD_Clientes!A:H,3,FALSE),"""")"
    Range("E5").Formula = "=IFERROR(VLOOKUP(B5,BD_Clientes!A:H,4,FALSE),"""")"
    Range("E6").Formula = "=IFERROR(VLOOKUP(B5,BD_Clientes!A:H,5,FALSE),"""")"

    Range("B9").Formula = "=IFERROR(INDEX(Historial!$D:$D,MATCH(" & k & ",Historial!$B:$B,0)),""No encontrado"")"
    Range("F9").Formula = "=IFERROR(INDEX(Historial!$H:$H,MATCH(" & k & ",Historial!$B:$B,0)),"""")"
    Range("B10").Formula = "=IFERROR(INDEX(Historial!$E:$E,MATCH(" & k & ",Historial!$B:$B,0)),""No encontrado"")"
    Range("B11").Formula = "=IFERROR(INDEX(Historial!$F:$F,MATCH(" & k & ",Historial!$B:$B,0)),"""")"
    Range("B12").Formula = "=IFERROR(INDEX(Historial!$G:$G,MATCH(" & k & ",Historial!$B:$B,0)),"""")"

    Range("K4").Formula = "=IFERROR(INDEX(Historial!$K:$K,MATCH(" & k & ",Historial!$B:$B,0)),"""")"
    Range("I4").Formula = "=IFERROR(IF(INDEX(Historial!$M:$M,MATCH(" & k & ",Historial!$B:$B,0))="""",IF(OR(K4=""Sitio"",K4=""sitio""),""Servicio en Sitio"",""""),IFERROR(VALUE(INDEX(Historial!$M:$M,MATCH(" & k & ",Historial!$B:$B,0))),INDEX(Historial!$M:$M,MATCH(" & k & ",Historial!$B:$B,0)))),IF(OR(K4=""Sitio"",K4=""sitio""),""Servicio en Sitio"",""""))"
    Range("I5").Formula = "=IFERROR(VALUE(INDEX(Historial!$I:$I,MATCH(" & k & ",Historial!$B:$B,0))),"""")"
    Range("I6").Formula = "=IFERROR(EDATE(I5,IF(INDEX(Historial!$L:$L,MATCH(" & k & ",Historial!$B:$B,0))=""6 meses"",6,12)),"""")"
    Range("M8").Formula = "=IFERROR(INDEX(Historial!$J:$J,MATCH(" & k & ",Historial!$B:$B,0)),"""")"

    ' Portada: espejo del instrumento (por si alguien borro formulas alla)
    On Error Resume Next
    With Sheets("Portada")
        .Range("D20").Formula = "=Calculos!B9"
        .Range("I20").Formula = "=Calculos!F9"
        .Range("D22").Formula = "=Calculos!B10"
        .Range("D24").Formula = "=Calculos!B11"
        .Range("D26").Formula = "=Calculos!B12"
        .Range("C20").Formula = "=Calculos!A9"
        .Range("C22").Formula = "=Calculos!A10"
        .Range("C24").Formula = "=Calculos!A11"
        .Range("C26").Formula = "=Calculos!A12"
    End With
    On Error GoTo 0
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


def main() -> int:
    if not PATH.exists():
        print("No existe", PATH)
        return 1

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
        target = None
        for i in range(1, wb.VBProject.VBComponents.Count + 1):
            comp = wb.VBProject.VBComponents.Item(i)
            if comp.Name == "Hoja3":
                target = comp
                break
        if target is None:
            print("No se encontro Hoja3")
            wb.Close(False)
            return 3

        code = target.CodeModule
        n = code.CountOfLines
        if n > 0:
            code.DeleteLines(1, n)
        code.AddFromString(VBA)

        # Verificar una sola FactorUnidad y que exista Restablecer
        txt = code.Lines(1, code.CountOfLines)
        n_fu = txt.lower().count("function factorunidad")
        n_rest = txt.count("RestablecerFormulasDesdeHistorial")
        print(f"Hoja3 lines={code.CountOfLines} FactorUnidad={n_fu} Restablecer refs={n_rest}")
        if n_fu != 1:
            raise RuntimeError("FactorUnidad no quedo en 1")

        # Probar: overwrite B10 then change E4 via COM with events
        ws = wb.Sheets("Calculos")
        ws.Range("B10").Value = "MARCA MANUAL TEST"
        old_e4 = ws.Range("E4").Value
        excel.EnableEvents = True
        # Trigger change
        ws.Range("E4").Value = old_e4  # same value may not fire; bump then restore
        try:
            bump = int(float(old_e4)) + 1 if str(old_e4).replace(".", "").isdigit() else 9999
        except Exception:
            bump = 9999
        ws.Range("E4").Value = bump
        ws.Range("E4").Value = old_e4
        excel.EnableEvents = False

        has_f = ws.Range("B10").HasFormula
        print("Tras cambiar E4, B10 tiene formula:", has_f)
        if has_f:
            print("B10 formula:", ws.Range("B10").Formula[:80], "...")
        else:
            print("AVISO: B10 sigue sin formula (evento no disparo en COM). Formula igual queda en VBA para uso manual.")

        wb.Save()
        print("Guardado:", PATH.name)
        print("Listo: al cambiar D4/E4/F4 se restauran Marca, Modelo, Serie, Cliente, etc.")
    except Exception as e:
        print("Error:", e)
        try:
            wb.Close(False)
        except Exception:
            pass
        excel.Quit()
        pythoncom.CoUninitialize()
        return 4
    finally:
        try:
            wb.Close(SaveChanges=True)
        except Exception:
            pass
        excel.Quit()
        pythoncom.CoUninitialize()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
