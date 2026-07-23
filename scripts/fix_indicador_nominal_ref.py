# -*- coding: utf-8 -*-
"""
Corrige Formato Indicador.xlsm:
- Nominal (B) del intervalo corto/largo sigue a REF (A = % del alcance).
- Al cambiar mm/in se restauran esas fórmulas y se limpian lecturas.
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace", line_buffering=True)

import pythoncom
import win32com.client

TARGET = Path(r"C:\Users\AG\Desktop\FORMATOS AG\Formato Indicador.xlsm")
PASSWORD = "AG-Calidad-2026"

VBA_CODE = r'''
Option Explicit

Private Const AG_PASSWORD As String = "AG-Calidad-2026"
Private Const MM_PER_IN As Double = 25.4

Private Function CertificadoDim() As String
    With ThisWorkbook.Worksheets("CALCULOS")
        CertificadoDim = Trim(CStr(.Range("D4").Value)) & "-" & _
                         Format(.Range("E4").Value, "0000") & "-" & _
                         Format(.Range("F4").Value, "00")
    End With
End Function

Private Sub RestaurarNominalesDesdeRef(ws As Worksheet)
    Dim r As Long
    For r = 26 To 35
        ws.Range("B" & r).Formula = "=A" & r
    Next r
    For r = 41 To 50
        ws.Range("B" & r).Formula = "=A" & r
    Next r
    ws.Range("B25").Value = 0
    ws.Range("B40").Value = 0
End Sub

Private Sub LimpiarLecturas(ws As Worksheet)
    Dim r As Long
    For r = 26 To 35
        ws.Range("C" & r & ":E" & r).ClearContents
    Next r
    For r = 40 To 50
        ws.Range("C" & r & ":E" & r).ClearContents
    Next r
    ws.Range("C18:E20").ClearContents
End Sub

Sub GuardarCertificadoExcel()
    Dim ws As Worksheet
    Dim ruta As Variant
    Dim nombreArchivo As String
    Dim instrumento As String
    Dim idEquipo As String
    Dim avisoPatron As String

    On Error GoTo ErrorHandler
    Set ws = ThisWorkbook.Worksheets("CALCULOS")

    If Trim(CStr(ws.Range("D4").Value)) = "" Or _
       Trim(CStr(ws.Range("E4").Value)) = "" Or _
       Trim(CStr(ws.Range("F4").Value)) = "" Then
        MsgBox "El número de certificado está incompleto (D4-E4-F4).", _
               vbCritical, "Validación"
        Exit Sub
    End If

    instrumento = Trim(CStr(ws.Range("B9").Value))
    idEquipo = Trim(CStr(ws.Range("F9").Value))
    If instrumento = "" Or instrumento = "No encontrado" Or idEquipo = "" Then
        MsgBox "Falta el instrumento o número de control. Revisa el certificado o pulsa Actualizar.", _
               vbCritical, "Validación"
        Exit Sub
    End If

    On Error Resume Next
    avisoPatron = CStr(ThisWorkbook.Worksheets("PORTADA").Range("E49").Value)
    On Error GoTo ErrorHandler
    If InStr(1, UCase(avisoPatron), "VENCIDO") > 0 Then
        If MsgBox("Un patrón aparece VENCIDO." & vbCrLf & "¿Deseas guardar de todos modos?", _
                  vbExclamation + vbYesNo, "Calidad") = vbNo Then Exit Sub
    End If

    nombreArchivo = CertificadoDim() & " - " & instrumento & " - " & idEquipo
    nombreArchivo = Replace(nombreArchivo, "/", "-")
    nombreArchivo = Replace(nombreArchivo, "\", "-")
    nombreArchivo = Replace(nombreArchivo, ":", "")
    nombreArchivo = Replace(nombreArchivo, "*", "")
    nombreArchivo = Replace(nombreArchivo, "?", "")
    nombreArchivo = Replace(nombreArchivo, """", "")
    nombreArchivo = Replace(nombreArchivo, "<", "")
    nombreArchivo = Replace(nombreArchivo, ">", "")
    nombreArchivo = Replace(nombreArchivo, "|", "")

    ruta = Application.GetSaveAsFilename( _
        InitialFileName:=nombreArchivo, _
        FileFilter:="Libro de Excel con macros (*.xlsm), *.xlsm", _
        Title:="Guardar certificado de indicador")

    If ruta = False Then Exit Sub

    Application.DisplayAlerts = False
    ThisWorkbook.SaveCopyAs CStr(ruta)
    Application.DisplayAlerts = True
    MsgBox "Certificado guardado:" & vbCrLf & CStr(ruta), vbInformation, "Listo"
    Exit Sub

ErrorHandler:
    Application.DisplayAlerts = True
    MsgBox "No se pudo guardar: " & Err.Description, vbCritical, "Error"
End Sub

Sub CambiarUnidadIndicador()
    Dim ws As Worksheet
    Dim unidad As String
    Dim alcance As Variant
    Dim divMin As Variant
    Dim emp As Variant

    Set ws = ThisWorkbook.Worksheets("CALCULOS")
    On Error Resume Next
    ws.Unprotect Password:=AG_PASSWORD
    On Error GoTo 0

    unidad = LCase(Trim(CStr(ws.Range("J10").Value)))
    alcance = ws.Range("F10").Value
    divMin = ws.Range("J9").Value
    emp = ws.Range("J12").Value

    If unidad = "mm" Then
        ws.Range("J10").Value = "in"
        If IsNumeric(alcance) Then ws.Range("F10").Value = CDbl(alcance) / MM_PER_IN
        If IsNumeric(divMin) Then ws.Range("J9").Value = CDbl(divMin) / MM_PER_IN
        If IsNumeric(emp) Then ws.Range("J12").Value = CDbl(emp) / MM_PER_IN
        RestaurarNominalesDesdeRef ws
        LimpiarLecturas ws
        MsgBox "Modo pulgadas (in)." & vbCrLf & _
               "Alcance/división/EMP convertidos ÷25.4." & vbCrLf & _
               "REF y Nominal se recalcularon; captura de nuevo las lecturas." & vbCrLf & _
               "Si el bloque real difiere del REF, edita la columna Nominal (B).", _
               vbInformation, "Unidad"
    Else
        ws.Range("J10").Value = "mm"
        If IsNumeric(alcance) Then ws.Range("F10").Value = CDbl(alcance) * MM_PER_IN
        If IsNumeric(divMin) Then ws.Range("J9").Value = CDbl(divMin) * MM_PER_IN
        If IsNumeric(emp) Then ws.Range("J12").Value = CDbl(emp) * MM_PER_IN
        RestaurarNominalesDesdeRef ws
        LimpiarLecturas ws
        MsgBox "Modo milímetros (mm)." & vbCrLf & _
               "Alcance/división/EMP convertidos ×25.4." & vbCrLf & _
               "REF y Nominal se recalcularon; captura de nuevo las lecturas." & vbCrLf & _
               "Si el bloque real difiere del REF, edita la columna Nominal (B).", _
               vbInformation, "Unidad"
    End If

    On Error Resume Next
    ws.Protect Password:=AG_PASSWORD, DrawingObjects:=False, Contents:=True, Scenarios:=True
    Application.Calculate
    On Error GoTo 0
End Sub

Sub RecalcularCertificado()
    On Error GoTo ErrorHandler
    Application.ScreenUpdating = False
    ThisWorkbook.RefreshAll
    Application.CalculateUntilAsyncQueriesDone
    ThisWorkbook.Worksheets("CALCULOS").Calculate
    ThisWorkbook.Worksheets("PORTADA").Calculate
    ThisWorkbook.Worksheets("RESULTADOS").Calculate
    Application.ScreenUpdating = True
    MsgBox "Datos y cálculos actualizados para " & CertificadoDim(), _
           vbInformation, "Actualizado"
    Exit Sub

ErrorHandler:
    Application.ScreenUpdating = True
    MsgBox "No se pudo actualizar: " & Err.Description, vbExclamation, "Actualizar"
End Sub

Sub IrAPortada()
    ThisWorkbook.Worksheets("PORTADA").Activate
    ThisWorkbook.Worksheets("PORTADA").Range("A1").Select
End Sub
'''


def set_module(vb_project, name: str, code_text: str) -> None:
    component = None
    for index in range(1, vb_project.VBComponents.Count + 1):
        candidate = vb_project.VBComponents.Item(index)
        if str(candidate.Name) == name:
            component = candidate
            break
    if component is None:
        component = vb_project.VBComponents.Add(1)
        component.Name = name
    code = component.CodeModule
    if code.CountOfLines:
        code.DeleteLines(1, code.CountOfLines)
    code.AddFromString(code_text)


def link_nominal_to_ref(calc) -> None:
    for row in range(26, 36):
        calc.Range(f"B{row}").Formula = f"=A{row}"
    for row in range(41, 51):
        calc.Range(f"B{row}").Formula = f"=A{row}"
    calc.Range("B25").Value = 0
    calc.Range("B40").Value = 0


def main() -> int:
    if not TARGET.exists():
        print(f"No existe {TARGET}")
        return 1

    pythoncom.CoInitialize()
    excel = win32com.client.DispatchEx("Excel.Application")
    excel.Visible = False
    excel.DisplayAlerts = False
    excel.EnableEvents = False
    wb = None
    try:
        print(f"Abriendo {TARGET.name}…")
        wb = excel.Workbooks.Open(str(TARGET.resolve()), UpdateLinks=0, ReadOnly=False)
        if wb.ReadOnly:
            raise RuntimeError("Archivo en solo lectura. Ciérralo en Excel.")

        calc = wb.Worksheets("CALCULOS")
        try:
            calc.Unprotect(PASSWORD)
        except Exception:
            calc.Unprotect()

        print("Enlazando Nominal (B) = REF (A)…")
        link_nominal_to_ref(calc)

        # Desbloquear B para que puedan ajustar el bloque real
        for row in list(range(26, 36)) + list(range(41, 51)):
            try:
                calc.Range(f"B{row}").Locked = False
            except Exception:
                pass

        print("Actualizando macro mm/in…")
        set_module(wb.VBProject, "ModuloAG_IndicadorUI", VBA_CODE)

        # Prueba rápida: in + alcance 1
        calc.Range("J10").Value = "in"
        calc.Range("F10").Value = 1
        excel.Calculate()
        print(
            f"  Prueba in/1 → A26={calc.Range('A26').Value} B26={calc.Range('B26').Value} "
            f"A50={calc.Range('A50').Value} B50={calc.Range('B50').Value}"
        )
        # Dejar en mm con alcance vacío-listo: restaurar mm y ejemplo razonable
        calc.Range("J10").Value = "mm"
        calc.Range("F10").Value = None
        link_nominal_to_ref(calc)

        calc.Protect(Password=PASSWORD, DrawingObjects=False, Contents=True, Scenarios=True)
        wb.Save()
        print("LISTO: Nominal sigue al alcance/unidad. Edita B solo si el bloque real ≠ REF.")
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
