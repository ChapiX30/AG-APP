#!/usr/bin/env python3
"""Busca y elimina TODAS las definiciones duplicadas de GuardarCertificadoExcel."""
from __future__ import annotations

import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

import pythoncom
import win32com.client

PATH = Path(r"C:\Users\AG\Desktop\FORMATOS AG\Formato master auto Presion_SIN_REF.xlsm")

VBA_ALL = r'''
Option Explicit

Public Sub GuardarCertificadoExcel()
    Dim ruta As Variant
    Dim nombreArchivo As String
    Dim certificado As String
    Dim instrumento As String
    Dim idEquipo As String
    Dim parte1 As String, parte2 As String, parte3 As String
    Dim avisoPatron As String

    On Error GoTo ErrorHandler

    If Sheets("Calculos").Range("D4").Value = "" Or Sheets("Calculos").Range("E4").Value = "" Or Sheets("Calculos").Range("F4").Value = "" Then
        MsgBox "El numero de certificado esta incompleto (D4-E4-F4).", vbCritical, "Validacion"
        Exit Sub
    End If

    If Sheets("Calculos").Range("B9").Value = "" Or Sheets("Calculos").Range("B9").Value = "No encontrado" Or Sheets("Calculos").Range("F9").Value = "" Then
        MsgBox "Falta instrumento o ID. Revisa el certificado o la hoja Historial.", vbCritical, "Validacion"
        Exit Sub
    End If

    On Error Resume Next
    avisoPatron = CStr(Sheets("Portada").Range("E48").Value)
    On Error GoTo ErrorHandler
    If InStr(1, UCase(avisoPatron), "VENCIDO") > 0 Then
        If MsgBox("El patron aparece VENCIDO." & vbCrLf & "Deseas guardar de todos modos?", vbExclamation + vbYesNo, "Calidad") = vbNo Then Exit Sub
    End If

    If IsDate(Sheets("Calculos").Range("I5").Value) Then
        If Sheets("Calculos").Range("I5").Value > Date Then
            MsgBox "La fecha de calibracion es mayor a hoy. Revisa I5.", vbExclamation, "Fecha"
        End If
    End If

    parte1 = CStr(Sheets("Calculos").Range("D4").Value)
    parte2 = Format(Sheets("Calculos").Range("E4").Value, "0000")
    parte3 = CStr(Sheets("Calculos").Range("F4").Value)
    certificado = parte1 & "-" & parte2 & "-" & parte3
    instrumento = CStr(Sheets("Calculos").Range("B9").Value)
    idEquipo = CStr(Sheets("Calculos").Range("F9").Value)

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

    ruta = Application.GetSaveAsFilename(InitialFileName:=nombreArchivo, FileFilter:="Libro de Excel (*.xlsm), *.xlsm", Title:="Guardar certificado")
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

Public Sub CambiarFormatoFecha()
    On Error Resume Next
    With Sheets("Calculos").Range("K5")
        If .Value = "Completa" Then .Value = "Solo Mes" Else .Value = "Completa"
        MsgBox "Formato de fecha: " & .Value, vbInformation, "Fecha"
    End With
End Sub

Public Sub ConfigurarListaUnidades()
    On Error Resume Next
    With Sheets("Calculos").Range("J10").Validation
        .Delete
        .Add Type:=xlValidateList, AlertStyle:=xlValidAlertStop, Operator:=xlBetween, Formula1:="psi,kPa,bar,mbar,kg-cm2,inHg,inH2O,mmHg,MPa"
        .IgnoreBlank = True
        .InCellDropdown = True
    End With
    MsgBox "Lista de unidades lista en J10.", vbInformation, "Unidades"
End Sub

Public Sub RecalcularCertificado()
    On Error Resume Next
    Application.ScreenUpdating = False
    Application.CalculateFull
    Sheets("Calculos").Calculate
    Sheets("Portada").Calculate
    Application.ScreenUpdating = True
    MsgBox "Calculos actualizados.", vbInformation, "Actualizado"
End Sub

Public Sub IrAPortada()
    On Error Resume Next
    Sheets("Portada").Activate
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
        print("CIERRA Excel por completo y reintenta:", e)
        excel.Quit()
        pythoncom.CoUninitialize()
        return 2

    vb = wb.VBProject

    print("=== ANTES: todos los componentes ===")
    for i in range(1, vb.VBComponents.Count + 1):
        comp = vb.VBComponents.Item(i)
        n = 0
        try:
            n = comp.CodeModule.CountOfLines
        except Exception:
            pass
        text = ""
        try:
            if n:
                text = comp.CodeModule.Lines(1, n)
        except Exception:
            pass
        hits = text.count("Sub GuardarCertificadoExcel") + text.count("Function GuardarCertificadoExcel")
        print(f"  [{comp.Type}] {comp.Name} lines={n} GuardarHits={hits}")
        if hits:
            # mostrar lineas
            for line in text.splitlines():
                if "GuardarCertificadoExcel" in line:
                    print("   ->", line.strip())

    # 1) Vaciar codigo de TODOS los componentes document/sheet/modules que tengan el Sub
    # 2) Luego poner el codigo solo en AG_Macros
    for i in range(1, vb.VBComponents.Count + 1):
        comp = vb.VBComponents.Item(i)
        try:
            code = comp.CodeModule
            n = code.CountOfLines
            if n <= 0:
                continue
            text = code.Lines(1, n)
        except Exception:
            continue

        if "GuardarCertificadoExcel" in text or "CambiarFormatoFecha" in text or "ConfigurarListaUnidades" in text or "RecalcularCertificado" in text or "IrAPortada" in text:
            # Vaciar modulo estandar por completo
            if comp.Type == 1:
                code.DeleteLines(1, code.CountOfLines)
                print("Vaciado modulo:", comp.Name)
            else:
                # En hojas/ThisWorkbook: borrar solo los Subs publicos conflictivos si existen
                for proc in (
                    "GuardarCertificadoExcel",
                    "CambiarFormatoFecha",
                    "ConfigurarListaUnidades",
                    "RecalcularCertificado",
                    "IrAPortada",
                ):
                    try:
                        # 0 = vbext_pk_Proc
                        start = code.ProcStartLine(proc, 0)
                        count = code.ProcCountLines(proc, 0)
                        code.DeleteLines(start, count)
                        print(f"Borrado {proc} de {comp.Name}")
                    except Exception:
                        pass

    # Eliminar modulos estandar vacios (excepto uno AG_Macros)
    remove_names = []
    for i in range(1, vb.VBComponents.Count + 1):
        comp = vb.VBComponents.Item(i)
        if comp.Type != 1:
            continue
        n = comp.CodeModule.CountOfLines
        if n == 0 or comp.Name != "AG_Macros":
            remove_names.append(comp.Name)

    for name in remove_names:
        try:
            vb.VBComponents.Remove(vb.VBComponents.Item(name))
            print("Removed", name)
        except Exception as e:
            print("No remove", name, e)

    # Crear/llenar AG_Macros
    ag = None
    for i in range(1, vb.VBComponents.Count + 1):
        if vb.VBComponents.Item(i).Name == "AG_Macros":
            ag = vb.VBComponents.Item(i)
            break
    if ag is None:
        ag = vb.VBComponents.Add(1)
        ag.Name = "AG_Macros"
    if ag.CodeModule.CountOfLines:
        ag.CodeModule.DeleteLines(1, ag.CodeModule.CountOfLines)
    ag.CodeModule.AddFromString(VBA_ALL)
    print("AG_Macros escrito")

    print("=== DESPUES ===")
    total = 0
    for i in range(1, vb.VBComponents.Count + 1):
        comp = vb.VBComponents.Item(i)
        n = comp.CodeModule.CountOfLines if True else 0
        try:
            n = comp.CodeModule.CountOfLines
            text = comp.CodeModule.Lines(1, n) if n else ""
        except Exception:
            text = ""
            n = 0
        hits = text.count("Sub GuardarCertificadoExcel")
        total += hits
        if n or hits:
            print(f"  {comp.Name} lines={n} GuardarHits={hits}")

    print("TOTAL GuardarCertificadoExcel defs:", total)

    # Botones: OnAction con ruta de libro unica
    ws = wb.Sheets("Calculos")
    for i in range(1, ws.Shapes.Count + 1):
        shp = ws.Shapes(i)
        try:
            if str(shp.Name).startswith("btn_"):
                macro = shp.Name.replace("btn_", "")
                # Forzar nombre calificado del libro
                shp.OnAction = f"'Formato master auto Presion_SIN_REF.xlsm'!{macro}"
                print("OnAction", shp.Name, "->", shp.OnAction)
        except Exception as e:
            print("btn err", e)

    wb.Save()
    wb.Close(True)
    excel.Quit()
    pythoncom.CoUninitialize()
    print("LISTO")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
