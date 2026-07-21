#!/usr/bin/env python3
"""Elimina macros VBA duplicados (nombre ambiguo GuardarCertificadoExcel)."""
from __future__ import annotations

import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

import pythoncom
import win32com.client

PATH = Path(r"C:\Users\AG\Desktop\FORMATOS AG\Formato master auto Presion_SIN_REF.xlsm")

VBA_ALL = r'''
Option Explicit

Sub GuardarCertificadoExcel()
    Dim ruta As Variant
    Dim nombreArchivo As String
    Dim certificado As String
    Dim instrumento As String
    Dim idEquipo As String
    Dim parte1 As String, parte2 As String, parte3 As String
    Dim avisoPatron As String

    On Error GoTo ErrorHandler

    If Range("D4").Value = "" Or Range("E4").Value = "" Or Range("F4").Value = "" Then
        MsgBox "El numero de certificado esta incompleto (D4-E4-F4).", vbCritical, "Validacion"
        Exit Sub
    End If

    If Range("B9").Value = "" Or Range("B9").Value = "No encontrado" Or Range("F9").Value = "" Then
        MsgBox "Falta instrumento o ID. Revisa el certificado o la hoja Historial.", vbCritical, "Validacion"
        Exit Sub
    End If

    On Error Resume Next
    avisoPatron = CStr(Sheets("Portada").Range("E48").Value)
    On Error GoTo ErrorHandler
    If InStr(1, UCase(avisoPatron), "VENCIDO") > 0 Then
        If MsgBox("El patron aparece VENCIDO." & vbCrLf & "Deseas guardar de todos modos?", _
                  vbExclamation + vbYesNo, "Calidad") = vbNo Then Exit Sub
    End If

    If IsDate(Range("I5").Value) Then
        If Range("I5").Value > Date Then
            MsgBox "La fecha de calibracion es mayor a hoy. Revisa I5.", vbExclamation, "Fecha"
        End If
    End If

    parte1 = CStr(Range("D4").Value)
    parte2 = Format(Range("E4").Value, "0000")
    parte3 = CStr(Range("F4").Value)
    certificado = parte1 & "-" & parte2 & "-" & parte3
    instrumento = CStr(Range("B9").Value)
    idEquipo = CStr(Range("F9").Value)

    nombreArchivo = certificado & " - " & instrumento & " - " & idEquipo
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
        FileFilter:="Libro de Excel (*.xlsm), *.xlsm", _
        Title:="Guardar certificado")

    If ruta = False Then
        MsgBox "Guardado cancelado.", vbInformation, "Certificado"
        Exit Sub
    End If

    Application.DisplayAlerts = False
    ThisWorkbook.SaveCopyAs CStr(ruta)
    Application.DisplayAlerts = True
    MsgBox "Certificado guardado:" & vbCrLf & ruta, vbInformation, "Listo"
    Exit Sub

ErrorHandler:
    Application.DisplayAlerts = True
    MsgBox "No se pudo guardar: " & Err.Description, vbCritical, "Error"
End Sub

Sub CambiarFormatoFecha()
    On Error Resume Next
    If Range("K5").Value = "Completa" Then
        Range("K5").Value = "Solo Mes"
    Else
        Range("K5").Value = "Completa"
    End If
    MsgBox "Formato de fecha: " & Range("K5").Value, vbInformation, "Fecha"
End Sub

Sub ConfigurarListaUnidades()
    On Error Resume Next
    With Sheets("Calculos").Range("J10").Validation
        .Delete
        .Add Type:=xlValidateList, AlertStyle:=xlValidAlertStop, Operator:=xlBetween, _
             Formula1:="psi,kPa,bar,mbar,kg-cm2,inHg,inH2O,mmHg,MPa"
        .IgnoreBlank = True
        .InCellDropdown = True
    End With
    MsgBox "Lista de unidades lista en J10 (desplegable).", vbInformation, "Unidades"
End Sub

Sub RecalcularCertificado()
    On Error Resume Next
    Application.ScreenUpdating = False
    Application.CalculateFull
    Sheets("Calculos").Calculate
    Sheets("Portada").Calculate
    Application.ScreenUpdating = True
    MsgBox "Calculos actualizados para certificado " & _
           Range("D4").Value & "-" & Format(Range("E4").Value, "0000") & "-" & Range("F4").Value, _
           vbInformation, "Actualizado"
End Sub

Sub IrAPortada()
    On Error Resume Next
    Sheets("Portada").Activate
    Sheets("Portada").Range("A1").Select
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
        vb = wb.VBProject
        # Eliminar TODOS los modulos estandar (type 1) y dejar uno solo limpio
        to_remove = []
        for i in range(1, vb.VBComponents.Count + 1):
            comp = vb.VBComponents.Item(i)
            if comp.Type == 1:  # std module
                to_remove.append(comp.Name)
                print("Eliminar modulo:", comp.Name)

        for name in to_remove:
            try:
                vb.VBComponents.Remove(vb.VBComponents.Item(name))
            except Exception as e:
                # Si no se puede remove, vaciar codigo
                try:
                    code = vb.VBComponents.Item(name).CodeModule
                    if code.CountOfLines:
                        code.DeleteLines(1, code.CountOfLines)
                    print("Vaciado:", name, e)
                except Exception as e2:
                    print("No se pudo quitar", name, e2)

        # Crear un solo modulo con todos los macros
        new = vb.VBComponents.Add(1)
        new.Name = "AG_Macros"
        new.CodeModule.AddFromString(VBA_ALL)
        print("Creado AG_Macros unico")

        # Reasignar botones por si acaso
        ws = wb.Sheets("Calculos")
        mapping = {
            "btn_GuardarCertificadoExcel": "GuardarCertificadoExcel",
            "btn_CambiarFormatoFecha": "CambiarFormatoFecha",
            "btn_ConfigurarListaUnidades": "ConfigurarListaUnidades",
            "btn_RecalcularCertificado": "RecalcularCertificado",
            "btn_IrAPortada": "IrAPortada",
        }
        for i in range(1, ws.Shapes.Count + 1):
            shp = ws.Shapes(i)
            try:
                if shp.Name in mapping:
                    shp.OnAction = mapping[shp.Name]
                    print("Boton", shp.Name, "->", mapping[shp.Name])
            except Exception:
                pass

        wb.Save()
        print("LISTO. Ya no debe haber nombre ambiguo.")
    finally:
        wb.Close(SaveChanges=True)
        excel.Quit()
        pythoncom.CoUninitialize()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
