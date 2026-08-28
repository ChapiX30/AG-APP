# -*- coding: utf-8 -*-
"""
Convierte Formato Angle meter.xlsx → Formato Angle meter.xlsm.

Historial libre (todos los prefijos / equipos), cert D4-E4-F4 editable,
botones Guardar | Formato fecha | Actualizar | Ir a Portada,
AG_AutoSync incremental + Workbook_Open.
"""
from __future__ import annotations

import re
import shutil
import sys
import zipfile
from datetime import datetime
from io import BytesIO
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace", line_buffering=True)

import pythoncom
import win32com.client

FOLDER = Path(r"C:\Users\AG\Desktop\FORMATOS AG")
SOURCE = FOLDER / "Formato Angle meter.xlsx"
TARGET = FOLDER / "Formato Angle meter.xlsm"
PASSWORD = "AG-Calidad-2026"
MSO_ROUNDED = 5
XL_XLSM = 52
XL_VERY_HIDDEN = 2
API_KEY = "TU_CLAVE_SECRETA_AG_APP_2026"
API_BASE = (
    "https://us-central1-agg1-b7f40.cloudfunctions.net/obtenerDatosExcel"
    f"?key={API_KEY}"
)

HIST_SHEET = "obtenerDatosExcel"
CLIENTES_SHEET = "BD_Clientes"
PATRONES_SHEET = "BD_Patrones"
CALC_NAME = "Calculos"
PORTADA_NAME = "Portada"
PREFIX = "AGD"  # valor inicial en D4; el técnico puede cambiarlo
UI_MODULE = "ModuloAG_AngleMeterUI"

HIST_COLUMNS = [
    "Name", "certificado", "cliente", "equipo", "marca", "modelo", "serie", "id",
    "fecha", "tecnico", "lugarCalibracion", "frecuenciaCalibracion", "fechaRecepcion",
]
CLIENT_COLUMNS = ["Nombre", "Domicilio", "Contacto", "Correo", "Telefono"]
PATRON_COLUMNS = [
    "noControl", "descripcion", "marca", "modelo", "serie", "noCertificado",
    "fechaUltimaCalibracion", "fechaVencimiento", "estadoProceso", "statusVigencia",
    "laboratorio",
]

ANGLE_PATRON_IDS = ["AG-015"]


def m_list(values: list[str]) -> str:
    return "{" + ", ".join(f'"{v}"' for v in values) + "}"


def build_m_historial(prefixes: list[str] | None = None) -> str:
    prefixes = prefixes or ["AGD", "AGDT"]
    starts = " or ".join(
        f'Text.StartsWith(Text.Upper(Text.From([certificado])), "{p}-")' for p in prefixes
    )
    return f'''let
    Url = "{API_BASE}",
    Fuente = Json.Document(Web.Contents(Url)),
    HistorialLista = Fuente[historial],
    ClientesLista = Fuente[clientes],
    HistorialBase = Table.FromRecords(HistorialLista, {m_list(HIST_COLUMNS)}, MissingField.UseNull),
    HistorialPrefijo = Table.SelectRows(HistorialBase, each {starts}),
    ClientesBase = Table.FromRecords(ClientesLista, {m_list(CLIENT_COLUMNS)}, MissingField.UseNull),
    NormalizarNombre = (valor as any) as text =>
        let
            Texto = Text.Upper(Text.Trim(if valor = null then "" else Text.From(valor))),
            SinParentesis = if Text.Contains(Texto, "(") then Text.BeforeDelimiter(Texto, "(") else Texto,
            SinAcentos = List.Accumulate(
                {{{{"Á", "A"}}, {{"É", "E"}}, {{"Í", "I"}}, {{"Ó", "O"}}, {{"Ú", "U"}}, {{"Ü", "U"}}, {{"Ñ", "N"}}}},
                SinParentesis,
                (estado, par) => Text.Replace(estado, par{{0}}, par{{1}})
            ),
            Permitidos = Text.Select(SinAcentos, {{"A".."Z", "0".."9", " "}}),
            Compacto = Text.Combine(List.Select(Text.Split(Permitidos, " "), each _ <> ""), " ")
        in
            Compacto,
    HistorialClave = Table.AddColumn(HistorialPrefijo, "_clienteKey", each NormalizarNombre([cliente]), type text),
    ClientesClave = Table.AddColumn(ClientesBase, "_clienteKey", each NormalizarNombre([Nombre]), type text),
    ClientesUnicos = Table.Group(ClientesClave, {{"_clienteKey"}}, {{{{"ClienteRow", each Table.First(_), type record}}}}),
    Cruzado = Table.NestedJoin(HistorialClave, {{"_clienteKey"}}, ClientesUnicos, {{"_clienteKey"}}, "ClienteMatch", JoinKind.LeftOuter),
    ClienteRow = Table.AddColumn(Cruzado, "_clienteRow", each if Table.IsEmpty([ClienteMatch]) then null else [ClienteMatch]{{0}}[ClienteRow], type nullable record),
    Domicilio = Table.AddColumn(ClienteRow, "domicilio", each if [_clienteRow] = null then "" else Record.FieldOrDefault([_clienteRow], "Domicilio", ""), type text),
    Contacto = Table.AddColumn(Domicilio, "contacto", each if [_clienteRow] = null then "" else Record.FieldOrDefault([_clienteRow], "Contacto", ""), type text),
    Correo = Table.AddColumn(Contacto, "correo", each if [_clienteRow] = null then "" else Record.FieldOrDefault([_clienteRow], "Correo", ""), type text),
    Telefono = Table.AddColumn(Correo, "telefono", each if [_clienteRow] = null then "" else Record.FieldOrDefault([_clienteRow], "Telefono", ""), type text),
    Resultado = Table.SelectColumns(Telefono, {m_list(HIST_COLUMNS + ["domicilio", "contacto", "correo", "telefono"])})
in
    Resultado'''


M_CLIENTES = f'''let
    Url = "{API_BASE}&formato=clientes",
    Fuente = Json.Document(Web.Contents(Url)),
    Tabla = Table.FromRecords(Fuente, {m_list(CLIENT_COLUMNS)}, MissingField.UseNull),
    Limpio = Table.TransformColumns(
        Tabla,
        List.Transform({m_list(CLIENT_COLUMNS)}, each {{_, (v) => if v = null then "" else Text.Trim(Text.From(v)), type text}})
    )
in
    Limpio'''


def build_m_patrones() -> str:
    ids_or = " or ".join(f'id = "{i}"' for i in ANGLE_PATRON_IDS)
    return f'''let
    Url = "{API_BASE}&formato=patrones",
    Fuente = Json.Document(Web.Contents(Url)),
    Tabla = Table.FromRecords(Fuente, {m_list(PATRON_COLUMNS)}, MissingField.UseNull),
    SoloAngulo = Table.SelectRows(
        Tabla,
        each let
            id = Text.Upper(Text.Trim(if [noControl] = null then "" else Text.From([noControl])))
        in
            {ids_or}
    ),
    Fechas = Table.TransformColumns(
        SoloAngulo,
        {{
            {{"fechaUltimaCalibracion", each try Date.FromText(Text.Start(Text.From(_), 10)) otherwise null, type date}},
            {{"fechaVencimiento", each try Date.FromText(Text.Start(Text.From(_), 10)) otherwise null, type date}}
        }}
    )
in
    Fechas'''


def rgb(r, g, b):
    return r + g * 256 + b * 65536


def strip_sheet_protection(src: Path, dst: Path) -> int:
    removed = 0
    pattern = re.compile(
        rb"<sheetProtection\b[^>]*/>|<sheetProtection\b[\s\S]*?</sheetProtection>", re.I
    )
    with zipfile.ZipFile(src, "r") as zin:
        buf = BytesIO()
        with zipfile.ZipFile(buf, "w", compression=zipfile.ZIP_DEFLATED) as zout:
            for info in zin.infolist():
                data = zin.read(info.filename)
                if info.filename.startswith("xl/worksheets/") and info.filename.endswith(".xml"):
                    new_data, n = pattern.subn(b"", data)
                    if n:
                        removed += n
                        data = new_data
                zout.writestr(info, data)
        dst.write_bytes(buf.getvalue())
    return removed


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


def try_unmerge(ws, addr: str) -> None:
    try:
        rng = ws.Range(addr)
        if rng.MergeCells:
            rng.MergeArea.UnMerge()
    except Exception:
        pass


def unlock_cell(ws, addr: str) -> None:
    try:
        rng = ws.Range(addr)
        if rng.MergeCells:
            rng = rng.MergeArea.Cells(1, 1)
        rng.Locked = False
        rng.Interior.Color = rgb(255, 242, 204)
    except Exception:
        pass


def ensure_sheet(wb, name: str):
    try:
        return wb.Worksheets(name)
    except Exception:
        ws = wb.Worksheets.Add(After=wb.Worksheets(wb.Worksheets.Count))
        ws.Name = name[:31]
        return ws


def clear_sheet(ws) -> None:
    while ws.ListObjects.Count > 0:
        ws.ListObjects(1).Delete()
    ws.Cells.Clear()


def delete_query_if_exists(wb, name: str) -> None:
    try:
        wb.Queries.Item(name).Delete()
    except Exception:
        pass


def delete_connection_if_exists(wb, name: str) -> None:
    try:
        wb.Connections.Item(name).Delete()
    except Exception:
        pass


def seed_headers(ws, headers: list[str]) -> None:
    clear_sheet(ws)
    for c, h in enumerate(headers, 1):
        ws.Cells(1, c).Value = h


def load_query_to_sheet(wb, query_name: str, ws, table_name: str) -> None:
    clear_sheet(ws)
    conn_name = f"Query - {query_name}"
    delete_connection_if_exists(wb, conn_name)

    source = (
        "OLEDB;Provider=Microsoft.Mashup.OleDb.1;"
        f'Data Source=$Workbook$;Location="{query_name}";Extended Properties=""'
    )
    table = ws.ListObjects.Add(0, source, False, 1, ws.Range("A1"))
    query = table.QueryTable
    query.CommandType = 2
    query.CommandText = [f"SELECT * FROM [{query_name}]"]
    query.BackgroundQuery = False
    query.PreserveFormatting = True
    query.RefreshOnFileOpen = False  # sync incremental al abrir
    query.RefreshPeriod = 0
    query.Refresh(False)

    table.Name = table_name
    table.DisplayName = table_name

    connection = None
    try:
        connection = wb.Connections.Item(conn_name)
    except Exception:
        for index in range(1, wb.Connections.Count + 1):
            candidate = wb.Connections.Item(index)
            if query_name.lower() in str(candidate.Name).lower():
                connection = candidate
                break
    if connection is not None:
        connection.RefreshWithRefreshAll = False
        try:
            connection.OLEDBConnection.BackgroundQuery = False
            connection.OLEDBConnection.RefreshOnFileOpen = False
            connection.OLEDBConnection.RefreshPeriod = 0
        except Exception:
            pass


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


def add_button(ws, left, top, width, caption, macro, color) -> None:
    for i in range(ws.Shapes.Count, 0, -1):
        sh = ws.Shapes.Item(i)
        if str(sh.Name) == f"btn_{macro}":
            sh.Delete()
            break
    shape = ws.Shapes.AddShape(MSO_ROUNDED, left, top, width, 26)
    shape.Name = f"btn_{macro}"
    shape.OnAction = macro
    shape.Fill.ForeColor.RGB = color
    shape.Line.Visible = 0
    shape.Placement = 3
    shape.TextFrame.Characters().Text = caption
    font = shape.TextFrame.Characters().Font
    font.Color = 0xFFFFFF
    font.Bold = True
    font.Size = 9
    font.Name = "Calibri"
    shape.TextFrame.HorizontalAlignment = -4108
    shape.TextFrame.VerticalAlignment = -4108


def build_ui_vba() -> str:
    return f'''
Option Explicit

Private Const AG_PASSWORD As String = "{PASSWORD}"

Private Function CertificadoAG() As String
    With ThisWorkbook.Worksheets("{CALC_NAME}")
        CertificadoAG = Trim(CStr(.Range("D4").Value)) & "-" & _
                        Format(.Range("E4").Value, "0000") & "-" & _
                        Format(.Range("F4").Value, "00")
    End With
End Function

Sub GuardarCertificadoExcel()
    Dim ws As Worksheet
    Dim ruta As Variant
    Dim nombreArchivo As String
    Dim instrumento As String
    Dim idEquipo As String

    On Error GoTo ErrorHandler
    Set ws = ThisWorkbook.Worksheets("{CALC_NAME}")

    If Trim(CStr(ws.Range("D4").Value)) = "" Or _
       Trim(CStr(ws.Range("E4").Value)) = "" Or _
       Trim(CStr(ws.Range("F4").Value)) = "" Then
        MsgBox "El número de certificado está incompleto (D4-E4-F4).", vbCritical, "Validación"
        Exit Sub
    End If

    instrumento = Trim(CStr(ws.Range("B9").Value))
    idEquipo = Trim(CStr(ws.Range("F9").Value))
    If instrumento = "" Or instrumento = "No encontrado" Or idEquipo = "" Then
        MsgBox "Falta el instrumento o número de control. Revisa el certificado o pulsa Actualizar.", _
               vbCritical, "Validación"
        Exit Sub
    End If

    nombreArchivo = CertificadoAG() & " - " & instrumento & " - " & idEquipo
    nombreArchivo = Replace(nombreArchivo, "/", "-")
    nombreArchivo = Replace(nombreArchivo, "\\", "-")
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
        Title:="Guardar certificado Angle meter")

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
    Dim nf As String

    On Error GoTo Fallo
    Set ws = ThisWorkbook.Worksheets("{CALC_NAME}")
    ws.Unprotect Password:=AG_PASSWORD

    nf = LCase$(CStr(ws.Range("I5").NumberFormatLocal) & CStr(ws.Range("I5").NumberFormat))
    If InStr(1, nf, "dd") > 0 Or InStr(1, nf, "d") > 0 Then
        fmt = "aaaa-mmm"
        msg = "Formato de fecha: solo mes y año."
    Else
        fmt = "aaaa-mmm-dd"
        msg = "Formato de fecha: fecha completa."
    End If

    ws.Range("I5:I6").NumberFormatLocal = fmt
    ws.Range("I4").NumberFormatLocal = "aaaa-mmm-dd"
    ws.Range("I7").NumberFormatLocal = "aaaa-mmm-dd"

    On Error Resume Next
    ThisWorkbook.Worksheets("{PORTADA_NAME}").Unprotect Password:=AG_PASSWORD
    ThisWorkbook.Worksheets("{PORTADA_NAME}").Range("D32:D34").NumberFormatLocal = fmt
    ThisWorkbook.Worksheets("{PORTADA_NAME}").Protect Password:=AG_PASSWORD, DrawingObjects:=False, Contents:=True, Scenarios:=True
    On Error GoTo Fallo

    ws.Protect Password:=AG_PASSWORD, DrawingObjects:=False, Contents:=True, Scenarios:=True
    Application.Calculate
    MsgBox msg, vbInformation, "Fecha"
    Exit Sub
Fallo:
    On Error Resume Next
    ws.Protect Password:=AG_PASSWORD, DrawingObjects:=False, Contents:=True, Scenarios:=True
    MsgBox "No se pudo cambiar el formato de fecha: " & Err.Description, vbExclamation, "Fecha"
End Sub

Sub RecalcularCertificado()
    On Error GoTo ErrorHandler
    Application.ScreenUpdating = False
    Call AG_AutoSync.ActualizarHistorialDesdeApp(False)
    On Error Resume Next
    ThisWorkbook.Worksheets("{CLIENTES_SHEET}").ListObjects(1).Refresh
    ThisWorkbook.Worksheets("{PATRONES_SHEET}").ListObjects(1).Refresh
    On Error GoTo ErrorHandler
    Application.CalculateUntilAsyncQueriesDone
    Application.Calculate
    Application.ScreenUpdating = True
    MsgBox "Historial (solo nuevos) + cálculos actualizados para " & CertificadoAG(), _
           vbInformation, "Actualizado"
    Exit Sub
ErrorHandler:
    Application.ScreenUpdating = True
    MsgBox "No se pudo actualizar: " & Err.Description, vbExclamation, "Actualizar"
End Sub

Sub IrAPortada()
    ThisWorkbook.Worksheets("{PORTADA_NAME}").Activate
    ThisWorkbook.Worksheets("{PORTADA_NAME}").Range("A1").Select
End Sub
'''


def build_autosync_vba(prefixes: list[str] | None = None) -> str:
    """AutoSync AGD + AGDT, sin filtrar tipo de equipo."""
    prefixes = prefixes or ["AGD", "AGDT"]
    urls = [f"{API_BASE}&prefijo={p}&formato=csv" for p in prefixes]
    urls_vba = "\n".join(
        f'    urls({i}) = "{u}&anio=" & anioActual' for i, u in enumerate(urls)
    )
    return f'''
Option Explicit

Private Const CLAVE_HOJAS As String = "{PASSWORD}"
Private Const HIST_SHEET As String = "{HIST_SHEET}"
Private Const MAX_COL As Long = 16

Public Function ActualizarHistorialDesdeApp(Optional ByVal mostrarResultado As Boolean = False) As Boolean
    Dim wsHist As Worksheet
    Dim existentes As Object
    Dim anioActual As String
    Dim i As Long, u As Long
    Dim ultimaFila As Long
    Dim agregados As Long
    Dim revisados As Long
    Dim cert As String
    Dim filaNueva As Long
    Dim urls(0 To {len(urls) - 1}) As String
    Dim textoCsv As String
    Dim lineas As Variant
    Dim campos As Variant
    Dim columna As Long
    Dim esEncabezado As Boolean
    Dim maxCampo As Long

    On Error GoTo Fallo
    Application.StatusBar = "Buscando certificados nuevos..."
    Application.ScreenUpdating = False
    Application.EnableEvents = False

    anioActual = Format(Date, "yy")
{urls_vba}

    Set wsHist = ThisWorkbook.Worksheets(HIST_SHEET)
    Set existentes = CreateObject("Scripting.Dictionary")
    existentes.CompareMode = 1

    Call DesvincularTablaHistorial(wsHist)

    ultimaFila = wsHist.Cells(wsHist.Rows.Count, 2).End(xlUp).Row
    If ultimaFila < 1 Then ultimaFila = 1
    For i = 2 To ultimaFila
        cert = UCase$(Trim$(CStr(wsHist.Cells(i, 2).Value)))
        If Len(cert) > 0 Then
            If Not existentes.Exists(cert) Then existentes.Add cert, i
        End If
    Next i

    If ultimaFila = 1 And Len(Trim$(CStr(wsHist.Cells(1, 2).Value))) = 0 Then
        ultimaFila = 0
    End If

    On Error Resume Next
    wsHist.Unprotect Password:=CLAVE_HOJAS
    On Error GoTo Fallo

    For u = LBound(urls) To UBound(urls)
        textoCsv = DescargarTextoUtf8(urls(u))
        textoCsv = Replace(textoCsv, vbCrLf, vbLf)
        textoCsv = Replace(textoCsv, vbCr, vbLf)
        lineas = Split(textoCsv, vbLf)

        For i = LBound(lineas) To UBound(lineas)
            If Len(Trim$(CStr(lineas(i)))) = 0 Then GoTo SiguienteLinea
            campos = SepararLineaCsv(CStr(lineas(i)))
            cert = Trim$(CStr(campos(1)))
            esEncabezado = (LCase$(cert) = "certificado")

            If esEncabezado Then
                If ultimaFila = 0 Then
                    maxCampo = UBound(campos)
                    If maxCampo > MAX_COL Then maxCampo = MAX_COL
                    For columna = 0 To maxCampo
                        wsHist.Cells(1, columna + 1).Value2 = campos(columna)
                    Next columna
                    ultimaFila = 1
                End If
                GoTo SiguienteLinea
            End If

            If Right$(cert, 3) <> ("-" & anioActual) Then GoTo SiguienteLinea

            revisados = revisados + 1
            If existentes.Exists(UCase$(cert)) Then GoTo SiguienteLinea

            filaNueva = ultimaFila + 1
            maxCampo = UBound(campos)
            If maxCampo > MAX_COL Then maxCampo = MAX_COL
            For columna = 0 To maxCampo
                wsHist.Cells(filaNueva, columna + 1).Value2 = campos(columna)
            Next columna
            If maxCampo < 13 Then Call CompletarClienteDesdeBD(wsHist, filaNueva)
            ultimaFila = filaNueva
            existentes.Add UCase$(cert), filaNueva
            agregados = agregados + 1
SiguienteLinea:
        Next i
    Next u

    On Error Resume Next
    wsHist.Protect Password:=CLAVE_HOJAS, DrawingObjects:=False, Contents:=True, _
        Scenarios:=True, UserInterfaceOnly:=True, AllowFiltering:=True
    On Error GoTo 0

    ActualizarHistorialDesdeApp = True
    Application.Calculate
    Application.StatusBar = "Sync OK: +" & agregados & " nuevos."
    If mostrarResultado Then
        MsgBox "Sincronización lista." & vbCrLf & _
            "Nuevos: " & agregados & " | Revisados " & anioActual & ": " & revisados, _
            vbInformation, "Actualización AG"
    End If
    GoTo Salida

Fallo:
    ActualizarHistorialDesdeApp = False
    Application.StatusBar = "No se pudo actualizar; se conservaron los datos anteriores."
    On Error Resume Next
    wsHist.Protect Password:=CLAVE_HOJAS, DrawingObjects:=False, Contents:=True, _
        Scenarios:=True, UserInterfaceOnly:=True, AllowFiltering:=True
    If mostrarResultado Then
        MsgBox "No se pudo actualizar el historial." & vbCrLf & Err.Description, vbExclamation, "Actualización AG"
    End If

Salida:
    Application.EnableEvents = True
    Application.ScreenUpdating = True
End Function

Private Sub DesvincularTablaHistorial(ByVal wsHist As Worksheet)
    On Error Resume Next
    Dim i As Long
    For i = wsHist.ListObjects.Count To 1 Step -1
        wsHist.ListObjects(i).Unlist
    Next i
End Sub

Private Sub CompletarClienteDesdeBD(ByVal wsHist As Worksheet, ByVal fila As Long)
    Dim wsCli As Worksheet
    Dim cliente As String
    Dim r As Long
    Dim ultima As Long
    On Error Resume Next
    Set wsCli = ThisWorkbook.Worksheets("BD_Clientes")
    If wsCli Is Nothing Then Exit Sub
    cliente = UCase$(Trim$(CStr(wsHist.Cells(fila, 3).Value)))
    If Len(cliente) = 0 Then Exit Sub
    ultima = wsCli.Cells(wsCli.Rows.Count, 1).End(xlUp).Row
    For r = 2 To ultima
        If UCase$(Trim$(CStr(wsCli.Cells(r, 1).Value))) = cliente Then
            If Len(Trim$(CStr(wsHist.Cells(fila, 14).Value))) = 0 Then wsHist.Cells(fila, 14).Value2 = wsCli.Cells(r, 2).Value
            If Len(Trim$(CStr(wsHist.Cells(fila, 15).Value))) = 0 Then wsHist.Cells(fila, 15).Value2 = wsCli.Cells(r, 3).Value
            If Len(Trim$(CStr(wsHist.Cells(fila, 16).Value))) = 0 Then wsHist.Cells(fila, 16).Value2 = wsCli.Cells(r, 4).Value
            If Len(Trim$(CStr(wsHist.Cells(fila, 17).Value))) = 0 Then wsHist.Cells(fila, 17).Value2 = wsCli.Cells(r, 5).Value
            Exit Sub
        End If
    Next r
End Sub

Private Function DescargarTextoUtf8(ByVal url As String) As String
    Dim http As Object
    Dim flujo As Object
    Set http = CreateObject("MSXML2.ServerXMLHTTP.6.0")
    http.setTimeouts 8000, 8000, 20000, 90000
    http.Open "GET", url, False
    http.send
    If http.Status <> 200 Then Err.Raise vbObjectError + 1267, , "HTTP " & http.Status
    Set flujo = CreateObject("ADODB.Stream")
    flujo.Type = 1
    flujo.Open
    flujo.Write http.responseBody
    flujo.Position = 0
    flujo.Type = 2
    flujo.Charset = "utf-8"
    DescargarTextoUtf8 = flujo.ReadText
    flujo.Close
    If Len(DescargarTextoUtf8) > 0 Then
        If AscW(Left$(DescargarTextoUtf8, 1)) = &HFEFF Then DescargarTextoUtf8 = Mid$(DescargarTextoUtf8, 2)
    End If
End Function

Private Function SepararLineaCsv(ByVal linea As String) As Variant
    Dim resultado() As String
    Dim campo As String
    Dim posicion As Long
    Dim columna As Long
    Dim caracter As String
    Dim entreComillas As Boolean
    Dim nCols As Long
    nCols = MAX_COL
    ReDim resultado(0 To nCols)
    For posicion = 1 To Len(linea)
        caracter = Mid$(linea, posicion, 1)
        If caracter = """" Then
            If entreComillas And posicion < Len(linea) And Mid$(linea, posicion + 1, 1) = """" Then
                campo = campo & """"
                posicion = posicion + 1
            Else
                entreComillas = Not entreComillas
            End If
        ElseIf caracter = "," And Not entreComillas Then
            If columna <= nCols Then resultado(columna) = campo
            campo = ""
            columna = columna + 1
        Else
            campo = campo & caracter
        End If
    Next posicion
    If columna <= nCols Then resultado(columna) = campo
    If columna < nCols Then ReDim Preserve resultado(0 To columna)
    SepararLineaCsv = resultado
End Function

Public Sub ActualizarHistorialManual()
    Call ActualizarHistorialDesdeApp(True)
End Sub
'''


WORKBOOK_OPEN = '''
Option Explicit

Private Sub Workbook_Open()
    On Error Resume Next
    Application.StatusBar = "AG: buscando certificados nuevos..."
    Call AG_AutoSync.ActualizarHistorialDesdeApp(False)
    Application.StatusBar = False
    On Error GoTo 0
End Sub
'''


def find_calc_sheet(wb):
    for i in range(1, wb.Worksheets.Count + 1):
        ws = wb.Worksheets.Item(i)
        name = str(ws.Name).strip().lower()
        if name == "calculos":
            return ws
    raise RuntimeError("No se encontró la hoja Calculos")


def split_cert_cells(calc) -> None:
    """Parte el certificado (E4 o E4:F4) en D4/E4/F4."""
    for addr in ("A4", "D4", "E4", "F4", "I4"):
        try_unmerge(calc, addr)

    raw = str(calc.Range("E4").Value or "").strip()
    if not raw or "-" not in raw:
        raw = str(calc.Range("D4").Value or "").strip()

    parts = raw.replace(" ", "").split("-")
    if len(parts) >= 3 and parts[0].upper().startswith("AG"):
        calc.Range("D4").Value = parts[0].upper()
        try:
            calc.Range("E4").Value = int(re.sub(r"\D", "", parts[1]) or "0")
        except Exception:
            calc.Range("E4").ClearContents()
        try:
            calc.Range("F4").Value = int(re.sub(r"\D", "", parts[2]) or "26")
        except Exception:
            calc.Range("F4").Value = 26
    else:
        calc.Range("D4").Value = PREFIX
        calc.Range("E4").ClearContents()
        calc.Range("F4").Value = 26

    # Etiqueta en A4 (queda libre tras desmezclar A4:D4)
    try:
        label = str(calc.Range("A4").Value or "").strip()
        if not label or label.upper().startswith("AG"):
            calc.Range("A4").Value = "****No de Certificado:"
    except Exception:
        pass

    for addr in ("D4", "E4", "F4"):
        unlock_cell(calc, addr)


def wire_calc_formulas(calc) -> None:
    hs = HIST_SHEET
    key = 'TRIM($D$4)&"-"&TEXT($E$4,"0000")&"-"&TEXT($F$4,"00")'
    match = f"MATCH({key},{hs}!$B:$B,0)"

    def idx(col: str, blank: str = '""') -> str:
        return (
            f"=IFERROR(IF(OR(INDEX({hs}!${col}:${col},{match})=\"\","
            f"INDEX({hs}!${col}:${col},{match})=0),{blank},"
            f"INDEX({hs}!${col}:${col},{match})),{blank})"
        )

    # Cliente / domicilio / contacto / correo / tel
    calc.Range("B5").Formula = idx("C")
    calc.Range("B6").Formula = idx("N")
    calc.Range("B7").Formula = idx("O")
    calc.Range("E5").Formula = idx("P")
    calc.Range("E6").Formula = idx("Q")

    # Fechas
    calc.Range("I4").Formula = (
        "=IFERROR("
        f'IF(INDEX({hs}!$M:$M,{match})="",'
        f'IF(UPPER(LEFT(INDEX({hs}!$K:$K,{match}),1))="S","Servicio en Sitio",""),'
        f"VALUE(INDEX({hs}!$M:$M,{match}))),"
        f'IF(IFERROR(UPPER(LEFT(INDEX({hs}!$K:$K,{match}),1)),"")="S","Servicio en Sitio",""))'
    )
    calc.Range("I5").Formula = f'=IFERROR(VALUE(INDEX({hs}!$I:$I,{match})),"")'
    calc.Range("I6").Formula = (
        f'=IFERROR(EDATE($I$5,IF(INDEX({hs}!$L:$L,{match})="6 meses",6,'
        f'IF(INDEX({hs}!$L:$L,{match})="3 meses",3,'
        f'IF(INDEX({hs}!$L:$L,{match})="24 meses",24,12)))),"")'
    )
    calc.Range("I7").Formula = "=TODAY()"
    for addr in ("I4", "I5", "I6", "I7"):
        calc.Range(addr).NumberFormatLocal = "aaaa-mmm-dd"

    # Instrumento / marca / modelo (parte) / serie / id
    calc.Range("B9").Formula = idx("D", '"No encontrado"')
    calc.Range("B10").Formula = idx("E", '"No encontrado"')
    calc.Range("B11").Formula = idx("F")
    calc.Range("B12").Formula = idx("G")
    calc.Range("F9").Formula = idx("H")

    # Magnitud / unidad por defecto
    calc.Range("F11").Value = "Dimensional"
    if not str(calc.Range("J10").Value or "").strip():
        calc.Range("J10").Value = "°"

    # Lugar de calibración
    calc.Range("C14").Formula = (
        f'=IFERROR(IF(OR(UPPER(LEFT(INDEX({hs}!$K:$K,{match}),1))="L",'
        f'UPPER(INDEX({hs}!$K:$K,{match}))="LABORATORIO"),'
        f'"Instalaciones AG","Instalaciones de cliente."),"Instalaciones AG")'
    )

    # Calibró = técnico
    calc.Range("M8").Formula = idx("J")


def setup() -> Path:
    if not SOURCE.exists():
        raise FileNotFoundError(SOURCE)

    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup = FOLDER / "respaldos" / f"Formato Angle meter_backup_setup_{stamp}.xlsx"
    backup.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(SOURCE, backup)
    print("Respaldo:", backup.name)

    work = FOLDER / f"_work_angle_{stamp}.xlsx"
    n_prot = strip_sheet_protection(SOURCE, work)
    print(f"Protección quitada en {n_prot} hojas")

    pythoncom.CoInitialize()
    excel = win32com.client.DispatchEx("Excel.Application")
    excel.Visible = False
    excel.DisplayAlerts = False
    excel.AskToUpdateLinks = False
    excel.EnableEvents = False
    try:
        excel.AutomationSecurity = 1
    except Exception:
        pass

    try:
        wb = excel.Workbooks.Open(str(work.resolve()), UpdateLinks=0, ReadOnly=False)
        try:
            wb.Queries.FastCombine = True
        except Exception:
            pass

        for i in range(1, wb.Worksheets.Count + 1):
            try_unprotect(wb.Worksheets.Item(i))

        calc = find_calc_sheet(wb)
        old_name = str(calc.Name)
        if old_name.strip() != CALC_NAME:
            calc.Name = CALC_NAME
            print(f"Hoja renombrada: {old_name!r} → {CALC_NAME!r}")

        portada = wb.Worksheets(PORTADA_NAME)
        try_unprotect(calc)
        try_unprotect(portada)

        q_hist = "AG_API_Historial_Angle"
        q_cli = "AG_API_Clientes_Angle"
        q_pat = "AG_API_Patrones_Angle"
        for qn in (q_hist, q_cli, q_pat):
            delete_query_if_exists(wb, qn)

        print("Creando Power Query…")
        wb.Queries.Add(q_hist, build_m_historial(["AGD", "AGDT"]))
        wb.Queries.Add(q_cli, M_CLIENTES)
        wb.Queries.Add(q_pat, build_m_patrones())

        ws_hist = ensure_sheet(wb, HIST_SHEET)
        ws_cli = ensure_sheet(wb, CLIENTES_SHEET)
        ws_pat = ensure_sheet(wb, PATRONES_SHEET)
        try_unprotect(ws_hist)
        try_unprotect(ws_cli)
        try_unprotect(ws_pat)

        print("Cargando datos desde API (historial completo + clientes + AG-015)…")
        import json
        import urllib.request

        def _fetch(url: str):
            with urllib.request.urlopen(url, timeout=90) as resp:
                return json.load(resp)

        def _norm(valor: str) -> str:
            t = (valor or "").upper().strip()
            if "(" in t:
                t = t.split("(", 1)[0].strip()
            for a, b in (("Á", "A"), ("É", "E"), ("Í", "I"), ("Ó", "O"), ("Ú", "U"), ("Ü", "U"), ("Ñ", "N")):
                t = t.replace(a, b)
            t = re.sub(r"[^A-Z0-9 ]+", "", t)
            return re.sub(r"\s+", " ", t).strip()

        data = _fetch(API_BASE)
        clientes_raw = data.get("clientes") or []
        hist_raw = data.get("historial") or []
        patrones_raw = _fetch(API_BASE + "&formato=patrones")

        cli_by_key = {}
        cli_rows = []
        for c in clientes_raw:
            row = [c.get(h, "") or "" for h in CLIENT_COLUMNS]
            cli_rows.append(row)
            cli_by_key[_norm(str(c.get("Nombre") or ""))] = c

        hist_headers = HIST_COLUMNS + ["domicilio", "contacto", "correo", "telefono"]
        hist_rows = []
        for h in hist_raw:
            cert = str(h.get("certificado") or "").strip().upper()
            if not (cert.startswith("AGD-") or cert.startswith("AGDT-")):
                continue
            cli = cli_by_key.get(_norm(str(h.get("cliente") or "")), {})
            row = [h.get(k, "") or "" for k in HIST_COLUMNS]
            row += [
                cli.get("Domicilio", "") or "",
                cli.get("Contacto", "") or "",
                cli.get("Correo", "") or "",
                cli.get("Telefono", "") or "",
            ]
            hist_rows.append(row)

        pat_rows = []
        for p in patrones_raw:
            nid = str(p.get("noControl") or "").upper().strip()
            if nid in {i.upper() for i in ANGLE_PATRON_IDS}:
                pat_rows.append([p.get(k, "") or "" for k in PATRON_COLUMNS])

        def _write(ws, headers, rows):
            clear_sheet(ws)
            for c, h in enumerate(headers, 1):
                ws.Cells(1, c).Value = h
            for r, row in enumerate(rows, 2):
                for c, val in enumerate(row, 1):
                    ws.Cells(r, c).Value = val if val is not None else ""

        _write(ws_hist, hist_headers, hist_rows)
        _write(ws_cli, CLIENT_COLUMNS, cli_rows)
        _write(ws_pat, PATRON_COLUMNS, pat_rows)
        print(f"  historial={len(hist_rows)} clientes={len(cli_rows)} patrones={len(pat_rows)}")

        print("Cableando certificado y fechas…")
        split_cert_cells(calc)
        calc.Range("D4").Value = PREFIX
        calc.Range("E4").ClearContents()
        calc.Range("F4").Value = 26
        wire_calc_formulas(calc)
        try:
            calc.Range("D4").Validation.Delete()
        except Exception:
            pass
        calc.Range("D4").Validation.Add(
            Type=3, AlertStyle=1, Operator=1, Formula1="AGD,AGDT"
        )
        calc.Range("D4").Validation.IgnoreBlank = True
        calc.Range("D4").Validation.InCellDropdown = True

        try:
            portada.Range("J9").Formula = (
                f"={CALC_NAME}!D4&\"-\"&TEXT({CALC_NAME}!E4,\"0000\")&\"-\"&TEXT({CALC_NAME}!F4,\"00\")"
            )
            print("Portada J9 → cert D4-E4-F4")
        except Exception as e:
            print("aviso Portada cert:", e)

        print("Instalando macros…")
        set_module(wb.VBProject, UI_MODULE, build_ui_vba())
        set_module(wb.VBProject, "AG_AutoSync", build_autosync_vba(["AGD", "AGDT"]))
        tw = wb.VBProject.VBComponents("ThisWorkbook")
        twc = tw.CodeModule
        if twc.CountOfLines:
            twc.DeleteLines(1, twc.CountOfLines)
        twc.AddFromString(WORKBOOK_OPEN.strip() + "\n")

        print("Botones…")
        left = 520.0
        top = 2.0
        gap = 6.0
        buttons = [
            ("Guardar", "GuardarCertificadoExcel", 92, rgb(22, 163, 74)),
            ("Formato fecha", "CambiarFormatoFecha", 100, rgb(15, 118, 110)),
            ("Actualizar", "RecalcularCertificado", 88, rgb(37, 99, 235)),
            ("Ir a Portada", "IrAPortada", 92, rgb(75, 85, 99)),
        ]
        for caption, macro, width, color in buttons:
            add_button(calc, left, top, width, caption, macro, color)
            left += width + gap

        for ws in (ws_hist, ws_cli, ws_pat):
            try:
                ws.Visible = XL_VERY_HIDDEN
            except Exception:
                ws.Visible = False

        for ws in (calc, portada, ws_hist, ws_cli, ws_pat):
            try:
                try_unprotect(ws)
                ws.Protect(Password=PASSWORD, DrawingObjects=False, Contents=True, Scenarios=True)
            except Exception:
                pass

        if TARGET.exists():
            TARGET.unlink()
        wb.SaveAs(str(TARGET.resolve()), FileFormat=XL_XLSM)
        print("Guardado:", TARGET.name)
        wb.Close(True)
    finally:
        excel.Quit()
        pythoncom.CoUninitialize()

    try:
        work.unlink()
    except Exception:
        pass
    return TARGET


def main() -> int:
    print("=== Setup Formato Angle meter (AGD / ángulo) ===")
    try:
        path = setup()
        print("\nLISTO:", path)
        return 0
    except Exception as e:
        print("ERROR:", e)
        import traceback
        traceback.print_exc()
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
