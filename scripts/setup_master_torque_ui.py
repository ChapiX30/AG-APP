#!/usr/bin/env python3
"""Convierte el master Torque a XLSM, oculta hojas técnicas y agrega botones."""
from __future__ import annotations

import shutil
import sys
from datetime import datetime
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace", line_buffering=True)

import pythoncom
import win32com.client


SOURCE = Path(r"C:\Users\AG\Desktop\FORMATOS AG\Formato Torque.xlsx")
TARGET = Path(r"C:\Users\AG\Desktop\FORMATOS AG\Formato Torque.xlsm")
PASSWORD = "AG-Calidad-2026"
MSO_ROUNDED = 5
XL_OPEN_XML_WORKBOOK_MACRO_ENABLED = 52
XL_SHEET_VERY_HIDDEN = 2


VBA_CODE = r'''
Option Explicit

Private Const AG_PASSWORD As String = "AG-Calidad-2026"

Private Function CertificadoTorque() As String
    With ThisWorkbook.Worksheets("Toma Datos")
        CertificadoTorque = Trim(CStr(.Range("D2").Value)) & "-" & _
                            Format(.Range("E2").Value, "0000") & "-" & _
                            Format(.Range("F2").Value, "00")
    End With
End Function

Sub GuardarCertificadoExcel()
    Dim ws As Worksheet
    Dim ruta As Variant
    Dim nombreArchivo As String
    Dim instrumento As String
    Dim idEquipo As String

    On Error GoTo ErrorHandler
    Set ws = ThisWorkbook.Worksheets("Toma Datos")

    If Trim(CStr(ws.Range("D2").Value)) = "" Or _
       Trim(CStr(ws.Range("E2").Value)) = "" Or _
       Trim(CStr(ws.Range("F2").Value)) = "" Then
        MsgBox "El número de certificado está incompleto (D2-E2-F2).", _
               vbCritical, "Validación"
        Exit Sub
    End If

    instrumento = Trim(CStr(ws.Range("C8").Value))
    idEquipo = Trim(CStr(ws.Range("J8").Value))
    If instrumento = "" Or instrumento = "No encontrado" Or idEquipo = "" Then
        MsgBox "Falta el instrumento o número de control. Revisa el certificado.", _
               vbCritical, "Validación"
        Exit Sub
    End If

    nombreArchivo = CertificadoTorque() & " - " & instrumento & " - " & idEquipo
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
        Title:="Guardar certificado de torque")

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

Sub CambiarFormatoFecha()
    Dim ws As Worksheet
    Dim fmt As String
    Dim msg As String
    Set ws = ThisWorkbook.Worksheets("Toma Datos")

    On Error Resume Next
    ws.Unprotect Password:=AG_PASSWORD
    If Val(ws.Range("M2").Value) = 1 Then
        ws.Range("M2").Value = 2
        ' Solo mes y año: 2026-jul (usar NumberFormatLocal; NumberFormat convierte "aaaa" mal)
        fmt = "aaaa-mmm"
        msg = "Formato de fecha: solo mes y año."
    Else
        ws.Range("M2").Value = 1
        ' Completa: 2026-jul-23
        fmt = "aaaa-mmm-dd"
        msg = "Formato de fecha: fecha completa."
    End If
    ws.Range("P2:P5").NumberFormatLocal = fmt
    ws.Range("Q2:Q5").NumberFormatLocal = "aaaa-mmm"
    ws.Protect Password:=AG_PASSWORD, DrawingObjects:=False, Contents:=True, Scenarios:=True
    Application.Calculate
    On Error GoTo 0
    MsgBox msg, vbInformation, "Fecha"
End Sub

Sub ConfigurarListaUnidades()
    Dim ws As Worksheet
    Set ws = ThisWorkbook.Worksheets("Toma Datos")

    On Error Resume Next
    ws.Unprotect Password:=AG_PASSWORD
    With ws.Range("N9").Validation
        .Delete
        .Add Type:=xlValidateList, AlertStyle:=xlValidAlertStop, _
             Operator:=xlBetween, Formula1:="=$P$9:$P$12"
        .IgnoreBlank = True
        .InCellDropdown = True
    End With
    ws.Range("N9").Locked = False
    ws.Protect Password:=AG_PASSWORD, DrawingObjects:=False, Contents:=True, Scenarios:=True
    ws.Activate
    ws.Range("N9").Select
    MsgBox "Lista de unidades lista en N9.", vbInformation, "Unidades"
    On Error GoTo 0
End Sub

Sub RecalcularCertificado()
    On Error GoTo ErrorHandler
    Application.ScreenUpdating = False
    ThisWorkbook.RefreshAll
    Application.CalculateUntilAsyncQueriesDone
    ThisWorkbook.Worksheets("Toma Datos").Calculate
    ThisWorkbook.Worksheets("Patrones").Calculate
    ThisWorkbook.Worksheets("Portada").Calculate
    Application.ScreenUpdating = True
    MsgBox "Datos y cálculos actualizados para " & CertificadoTorque(), _
           vbInformation, "Actualizado"
    Exit Sub

ErrorHandler:
    Application.ScreenUpdating = True
    MsgBox "No se pudo actualizar: " & Err.Description, vbExclamation, "Actualizar"
End Sub

Sub IrAPortada()
    ThisWorkbook.Worksheets("Portada").Activate
    ThisWorkbook.Worksheets("Portada").Range("A1").Select
End Sub
'''


def rgb(red: int, green: int, blue: int) -> int:
    return red + green * 256 + blue * 65536


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


def add_button(ws, left: float, top: float, width: float, caption: str, macro: str, color: int) -> None:
    shape = ws.Shapes.AddShape(MSO_ROUNDED, left, top, width, 25)
    shape.Name = f"btn_{macro}"
    shape.OnAction = macro
    shape.Fill.ForeColor.RGB = color
    shape.Line.Visible = 0
    shape.Placement = 3  # xlFreeFloating
    shape.Locked = True
    shape.TextFrame.Characters().Text = caption
    font = shape.TextFrame.Characters().Font
    font.Color = 0xFFFFFF
    font.Bold = True
    font.Size = 9
    font.Name = "Calibri"
    shape.TextFrame.HorizontalAlignment = -4108
    shape.TextFrame.VerticalAlignment = -4108


def main() -> int:
    if not SOURCE.exists() and not TARGET.exists():
        print(f"No existe {SOURCE} ni {TARGET}")
        return 1

    source = TARGET if TARGET.exists() else SOURCE
    backup = source.with_name(
        f"{source.stem}_backup_pre_botones_{datetime.now():%Y%m%d_%H%M%S}{source.suffix}"
    )
    shutil.copy2(source, backup)
    print(f"Respaldo: {backup.name}")

    pythoncom.CoInitialize()
    excel = win32com.client.DispatchEx("Excel.Application")
    excel.Visible = False
    excel.DisplayAlerts = False
    excel.AskToUpdateLinks = False
    excel.EnableEvents = False
    workbook = None

    try:
        workbook = excel.Workbooks.Open(str(source.resolve()), UpdateLinks=0, ReadOnly=False)
        if workbook.ReadOnly:
            raise RuntimeError("Excel abrió el master como solo lectura. Ciérralo e intenta otra vez.")

        workbook.Worksheets("obtenerDatosExcel").Visible = XL_SHEET_VERY_HIDDEN
        workbook.Worksheets("BD_Clientes").Visible = XL_SHEET_VERY_HIDDEN
        print("Hojas muy ocultas: obtenerDatosExcel, BD_Clientes")

        try:
            vb_project = workbook.VBProject
            set_module(vb_project, "ModuloAG_Torque_UI", VBA_CODE)
        except Exception as exc:
            raise RuntimeError(
                "Excel bloqueó el acceso al proyecto VBA. Activa: "
                "Archivo > Opciones > Centro de confianza > Configuración > "
                "Configuración de macros > Confiar en el acceso al modelo de objetos VBA."
            ) from exc

        ws = workbook.Worksheets("Toma Datos")
        try:
            ws.Unprotect(Password=PASSWORD)
        except Exception:
            pass

        old_buttons = []
        for index in range(1, ws.Shapes.Count + 1):
            shape = ws.Shapes(index)
            if str(shape.Name).startswith("btn_"):
                old_buttons.append(str(shape.Name))
        for name in old_buttons:
            ws.Shapes(name).Delete()

        buttons = (
            ("Guardar", "GuardarCertificadoExcel", 92, rgb(37, 99, 235)),
            ("Formato fecha", "CambiarFormatoFecha", 92, rgb(15, 118, 110)),
            ("Unidades", "ConfigurarListaUnidades", 82, rgb(124, 58, 237)),
            ("Actualizar", "RecalcularCertificado", 88, rgb(217, 119, 6)),
            ("Ir a Portada", "IrAPortada", 88, rgb(71, 85, 105)),
        )
        left = 405
        top = 3
        gap = 5
        for caption, macro, width, color in buttons:
            add_button(ws, left, top, width, caption, macro, color)
            left += width + gap

        ws.Protect(
            Password=PASSWORD,
            DrawingObjects=False,
            Contents=True,
            Scenarios=True,
        )

        if source.suffix.lower() == ".xlsm":
            workbook.Save()
        else:
            workbook.SaveAs(str(TARGET.resolve()), FileFormat=XL_OPEN_XML_WORKBOOK_MACRO_ENABLED)
        print(f"Master con macros: {TARGET}")
        print("Botones creados: Guardar, Formato fecha, Unidades, Actualizar, Ir a Portada")

        # Verificación antes de cerrar.
        if not bool(workbook.HasVBProject):
            raise RuntimeError("El archivo se guardó sin proyecto VBA.")
        if workbook.Worksheets("obtenerDatosExcel").Visible != XL_SHEET_VERY_HIDDEN:
            raise RuntimeError("obtenerDatosExcel no quedó muy oculta.")
        if workbook.Worksheets("BD_Clientes").Visible != XL_SHEET_VERY_HIDDEN:
            raise RuntimeError("BD_Clientes no quedó muy oculta.")

        found = {
            str(ws.Shapes(index).Name)
            for index in range(1, ws.Shapes.Count + 1)
            if str(ws.Shapes(index).Name).startswith("btn_")
        }
        if len(found) != 5:
            raise RuntimeError(f"Se esperaban 5 botones y se encontraron {len(found)}.")

        workbook.Close(SaveChanges=True)
        workbook = None

        # Evita que quede un segundo master sin botones con el mismo nombre base.
        if SOURCE.exists() and TARGET.exists():
            SOURCE.unlink()
            print(f"Retirado master anterior sin macros: {SOURCE.name}")

        print("Verificación OK.")
        return 0
    except Exception as exc:
        print(f"ERROR: {exc}")
        import traceback

        traceback.print_exc()
        print(f"Respaldo intacto: {backup}")
        return 1
    finally:
        if workbook is not None:
            try:
                workbook.Close(SaveChanges=False)
            except Exception:
                pass
        excel.Quit()
        pythoncom.CoUninitialize()


if __name__ == "__main__":
    raise SystemExit(main())
