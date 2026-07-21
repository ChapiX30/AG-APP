#!/usr/bin/env python3
"""
Restaura y mejora botones en Calculos del master Presion_SIN_REF.
Macros: Guardar, Formato fecha, Unidades, Recalcular.
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

import pythoncom
import win32com.client

PATH = Path(r"C:\Users\AG\Desktop\FORMATOS AG\Formato master auto Presion_SIN_REF.xlsm")

# msoShapeRoundedRectangle = 5
MSO_ROUNDED = 5

VBA_GUARDAR = r'''
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

    ' Aviso de patron (Portada E48) - no bloquear por caracteres raros
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
'''

VBA_FECHA = r'''
Sub CambiarFormatoFecha()
    On Error Resume Next
    If Range("K5").Value = "Completa" Then
        Range("K5").Value = "Solo Mes"
    Else
        Range("K5").Value = "Completa"
    End If
    MsgBox "Formato de fecha: " & Range("K5").Value, vbInformation, "Fecha"
End Sub
'''

VBA_UNIDADES = r'''
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
'''

VBA_RECALC = r'''
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
'''

VBA_PORTADA = r'''
Sub IrAPortada()
    On Error Resume Next
    Sheets("Portada").Activate
    Sheets("Portada").Range("A1").Select
End Sub
'''


def set_module(vbproj, name: str, code_text: str) -> None:
    comp = None
    for i in range(1, vbproj.VBComponents.Count + 1):
        if vbproj.VBComponents.Item(i).Name == name:
            comp = vbproj.VBComponents.Item(i)
            break
    if comp is None:
        # vbext_ct_StdModule = 1
        comp = vbproj.VBComponents.Add(1)
        comp.Name = name
    code = comp.CodeModule
    if code.CountOfLines > 0:
        code.DeleteLines(1, code.CountOfLines)
    code.AddFromString(code_text)


def add_button(ws, left, top, width, height, caption, macro, color_rgb):
    shp = ws.Shapes.AddShape(MSO_ROUNDED, left, top, width, height)
    shp.Name = "btn_" + macro
    shp.OnAction = macro
    shp.Fill.ForeColor.RGB = color_rgb
    shp.Line.Visible = 0  # msoFalse
    shp.TextFrame.Characters().Text = caption
    font = shp.TextFrame.Characters().Font
    font.Color = 0xFFFFFF
    font.Bold = True
    font.Size = 11
    font.Name = "Calibri"
    shp.TextFrame.HorizontalAlignment = -4108  # xlCenter
    shp.TextFrame.VerticalAlignment = -4108
    try:
        shp.TextFrame2.WordArtFormat = 0
    except Exception:
        pass
    return shp


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
        # Macros mejorados
        vb = wb.VBProject
        set_module(vb, "Modulo1", VBA_GUARDAR)
        # Excel may use Módulo1 with accent - update existing modules by content
        for i in range(1, vb.VBComponents.Count + 1):
            comp = vb.VBComponents.Item(i)
            if comp.Type != 1:
                continue
            name = comp.Name
            code = comp.CodeModule
            text = code.Lines(1, code.CountOfLines) if code.CountOfLines else ""
            if "GuardarCertificadoExcel" in text or name in ("Modulo1", "Módulo1", "Module1"):
                if code.CountOfLines:
                    code.DeleteLines(1, code.CountOfLines)
                code.AddFromString(VBA_GUARDAR)
                print("Actualizado", name, "-> GuardarCertificadoExcel")
            elif "CambiarFormatoFecha" in text or name in ("Modulo2", "Módulo2"):
                if code.CountOfLines:
                    code.DeleteLines(1, code.CountOfLines)
                code.AddFromString(VBA_FECHA)
                print("Actualizado", name, "-> CambiarFormatoFecha")
            elif "ConfigurarListaUnidades" in text or name in ("Modulo3", "Módulo3"):
                if code.CountOfLines:
                    code.DeleteLines(1, code.CountOfLines)
                code.AddFromString(VBA_UNIDADES)
                print("Actualizado", name, "-> ConfigurarListaUnidades")

        # Asegurar macros nuevos
        have = []
        for i in range(1, vb.VBComponents.Count + 1):
            c = vb.VBComponents.Item(i)
            if c.Type == 1 and c.CodeModule.CountOfLines:
                have.append(c.CodeModule.Lines(1, c.CodeModule.CountOfLines))
        blob = "\n".join(have)
        if "Sub RecalcularCertificado" not in blob:
            set_module(vb, "ModuloAG_UI", VBA_RECALC + "\n" + VBA_PORTADA)
            print("Agregado ModuloAG_UI")
        else:
            # refresh ModuloAG_UI
            for i in range(1, vb.VBComponents.Count + 1):
                c = vb.VBComponents.Item(i)
                if c.Name == "ModuloAG_UI":
                    c.CodeModule.DeleteLines(1, c.CodeModule.CountOfLines)
                    c.CodeModule.AddFromString(VBA_RECALC + "\n" + VBA_PORTADA)

        ws = wb.Sheets("Calculos")

        # Quitar botones previos nuestros
        to_delete = []
        for i in range(1, ws.Shapes.Count + 1):
            shp = ws.Shapes(i)
            try:
                if str(shp.Name).startswith("btn_"):
                    to_delete.append(shp.Name)
            except Exception:
                pass
        for name in to_delete:
            ws.Shapes(name).Delete()

        # Colores RGB Access BGR for Excel COM: RGB(r,g,b) = r + g*256 + b*65536
        def rgb(r, g, b):
            return r + (g * 256) + (b * 65536)

        # Posicion cerca del encabezado (puntos Excel)
        top = 8
        left = 420
        w, h, gap = 130, 28, 8

        add_button(ws, left, top, w, h, "Guardar certificado", "GuardarCertificadoExcel", rgb(37, 99, 235))
        add_button(ws, left + (w + gap), top, w, h, "Formato fecha", "CambiarFormatoFecha", rgb(15, 118, 110))
        add_button(ws, left + 2 * (w + gap), top, w, h, "Lista unidades", "ConfigurarListaUnidades", rgb(124, 58, 237))
        add_button(ws, left + 3 * (w + gap), top, w, h, "Recalcular", "RecalcularCertificado", rgb(217, 119, 6))
        add_button(ws, left + 4 * (w + gap), top, 110, h, "Ir a Portada", "IrAPortada", rgb(71, 85, 105))

        print("Botones creados en Calculos")
        wb.Save()
        print("LISTO:", PATH.name)
    finally:
        wb.Close(SaveChanges=True)
        excel.Quit()
        pythoncom.CoUninitialize()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
