# -*- coding: utf-8 -*-
"""
Convierte los 3 formatos de temperatura a masters AG (.xlsm):

- TERMOHIGROMETRO (4).xlsx → Formato Termohigrometro.xlsm (AGH)
- Formato Termometro IR.xlsx → Formato Termometro IR.xlsm (AGT)
- Formato Hornos y muflas comparación directa.xlsx → Formato Hornos y Muflas.xlsm (AGT)

Incluye: Power Query (historial/clientes/patrones), cert D4-E4-F4,
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

# Filtro amplio para patrones térmicos / humedad / IR
TEMP_KEYWORDS = [
    "TERMO", "TEMPERATURA", "HUMEDAD", "HIGRO", "BLACKBODY", "CUERPO NEGRO",
    "TERMOPAR", "RTD", "PT100", "BAÑO", "HORNO", "MUFLA", "IR",
]


def m_list(values: list[str]) -> str:
    return "{" + ", ".join(f'"{v}"' for v in values) + "}"


def build_m_historial(prefixes: list[str]) -> str:
    starts = " or ".join(
        f'Text.StartsWith(Text.Upper(Text.From([certificado])), "{p}-")' for p in prefixes
    )
    return f'''let
    Url = "{API_BASE}",
    Fuente = Json.Document(Web.Contents(Url)),
    HistorialLista = Fuente[historial],
    ClientesLista = Fuente[clientes],
    HistorialBase = Table.FromRecords(HistorialLista, {m_list(HIST_COLUMNS)}, MissingField.UseNull),
    HistorialFiltrado = Table.SelectRows(HistorialBase, each {starts}),
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
    HistorialClave = Table.AddColumn(HistorialFiltrado, "_clienteKey", each NormalizarNombre([cliente]), type text),
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
    contains = " or ".join(
        f'Text.Contains(d, "{k}")' for k in TEMP_KEYWORDS
    )
    return f'''let
    Url = "{API_BASE}&formato=patrones",
    Fuente = Json.Document(Web.Contents(Url)),
    Tabla = Table.FromRecords(Fuente, {m_list(PATRON_COLUMNS)}, MissingField.UseNull),
    SoloTemp = Table.SelectRows(
        Tabla,
        each let
            d = Text.Upper(if [descripcion] = null then "" else Text.From([descripcion])),
            id = Text.Upper(Text.Trim(if [noControl] = null then "" else Text.From([noControl])))
        in
            {contains}
    ),
    Fechas = Table.TransformColumns(
        SoloTemp,
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


def load_query_to_sheet(wb, query_name: str, ws, table_name: str, do_refresh: bool = True) -> None:
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
    query.RefreshOnFileOpen = False
    query.RefreshPeriod = 0
    if do_refresh:
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


def seed_headers(ws, headers: list[str]) -> None:
    clear_sheet(ws)
    for c, h in enumerate(headers, 1):
        ws.Cells(1, c).Value = h


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
    # delete existing same name
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


def build_ui_vba(cfg: dict) -> str:
    calc = cfg["calc"]
    portada = cfg["portada"]
    inst = cfg["instrumento_cell"]
    ideq = cfg["id_cell"]
    title = cfg["save_title"]
    return f'''
Option Explicit

Private Const AG_PASSWORD As String = "AG-Calidad-2026"

Private Function CertificadoAG() As String
    With ThisWorkbook.Worksheets("{calc}")
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
    Set ws = ThisWorkbook.Worksheets("{calc}")

    If Trim(CStr(ws.Range("D4").Value)) = "" Or _
       Trim(CStr(ws.Range("E4").Value)) = "" Or _
       Trim(CStr(ws.Range("F4").Value)) = "" Then
        MsgBox "El número de certificado está incompleto (D4-E4-F4).", vbCritical, "Validación"
        Exit Sub
    End If

    instrumento = Trim(CStr(ws.Range("{inst}").Value))
    idEquipo = Trim(CStr(ws.Range("{ideq}").Value))
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
        Title:="{title}")

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
    Set ws = ThisWorkbook.Worksheets("{calc}")
    ws.Unprotect Password:=AG_PASSWORD

    nf = LCase$(CStr(ws.Range("I5").NumberFormatLocal) & CStr(ws.Range("I5").NumberFormat))
    If InStr(1, nf, "dd") > 0 Or InStr(1, nf, "d") > 0 Then
        fmt = "aaaa-mmm"
        msg = "Formato de fecha: solo mes y año."
    Else
        fmt = "aaaa-mmm-dd"
        msg = "Formato de fecha: fecha completa."
    End If

    ' Solo calibración (I5) y sugerida (I6). Recepción/Elaboración no cambian.
    ws.Range("I5:I6").NumberFormatLocal = fmt
    ws.Range("I4").NumberFormatLocal = "aaaa-mmm-dd"
    ws.Range("I7").NumberFormatLocal = "aaaa-mmm-dd"

    On Error Resume Next
    ThisWorkbook.Worksheets("{portada}").Unprotect Password:=AG_PASSWORD
    ThisWorkbook.Worksheets("{portada}").Range("I5:I6").NumberFormatLocal = fmt
    ThisWorkbook.Worksheets("{portada}").Protect Password:=AG_PASSWORD, DrawingObjects:=False, Contents:=True, Scenarios:=True
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
    ThisWorkbook.Worksheets("{portada}").Activate
    ThisWorkbook.Worksheets("{portada}").Range("A1").Select
End Sub
'''.replace("{CLIENTES_SHEET}", CLIENTES_SHEET).replace("{PATRONES_SHEET}", PATRONES_SHEET)


def build_autosync_vba(prefixes: list[str]) -> str:
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
    Application.StatusBar = "Buscando certificados nuevos (solo faltantes)..."
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


def wire_calc_formulas(calc, cfg: dict) -> None:
    hs = HIST_SHEET
    key = 'TRIM($D$4)&"-"&TEXT($E$4,"0000")&"-"&TEXT($F$4,"00")'
    match = f"MATCH({key},{hs}!$B:$B,0)"

    def idx(col: str, blank: str = '""') -> str:
        return f"=IFERROR(INDEX({hs}!${col}:${col},{match}),{blank})"

    # Cliente / contacto
    calc.Range("B5").Formula = idx("C")
    calc.Range("B6").Formula = idx("N")
    calc.Range("B7").Formula = idx("O")
    calc.Range("E5").Formula = idx("P")
    calc.Range("E6").Formula = idx("Q")

    # Fechas: recepción, calibración, sugerida, elaboración
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

    # Instrumento / marca / modelo / serie / id
    calc.Range(cfg["instrumento_cell"]).Formula = idx("D", '"No encontrado"')
    calc.Range(cfg["marca_cell"]).Formula = idx("E", '"No encontrado"')
    calc.Range(cfg["modelo_cell"]).Formula = idx("F")
    calc.Range(cfg["serie_cell"]).Formula = idx("G")
    calc.Range(cfg["id_cell"]).Formula = idx("H")


def split_cert_cells(calc, prefix_default: str) -> None:
    """Parte E4 'AGH-0063-24' en D4/E4/F4 si hace falta."""
    try_unmerge(calc, "D4")
    try_unmerge(calc, "E4")
    try_unmerge(calc, "F4")
    raw = str(calc.Range("E4").Value or "").strip()
    # Also check if already split
    d4 = str(calc.Range("D4").Value or "").strip()
    if d4.upper().startswith("AG") and len(d4) <= 5:
        calc.Range("E4").ClearContents()
        calc.Range("D4").Value = d4.upper()
        calc.Range("F4").Value = 26
        return

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
        calc.Range("D4").Value = prefix_default
        calc.Range("E4").ClearContents()
        calc.Range("F4").Value = 26

    for addr in ("D4", "E4", "F4"):
        unlock_cell(calc, addr)


def setup_one(cfg: dict, excel) -> Path:
    src: Path = cfg["source"]
    target: Path = cfg["target"]
    print(f"\n=== {src.name} → {target.name} ===")
    if not src.exists():
        raise FileNotFoundError(src)

    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup = FOLDER / f"{src.stem}_backup_setup_{stamp}{src.suffix}"
    shutil.copy2(src, backup)
    print("  Respaldo:", backup.name)

    work = FOLDER / f"_work_{cfg['id']}_{stamp}.xlsx"
    n_prot = strip_sheet_protection(src, work)
    print(f"  Protección quitada en {n_prot} hojas")

    wb = excel.Workbooks.Open(str(work.resolve()), UpdateLinks=0, ReadOnly=False)
    try:
        wb.Queries.FastCombine = True
    except Exception:
        pass

    # Unprotect all sheets
    for i in range(1, wb.Worksheets.Count + 1):
        try_unprotect(wb.Worksheets.Item(i))

    calc = wb.Worksheets(cfg["calc"])
    portada = wb.Worksheets(cfg["portada"])
    try_unprotect(calc)
    try_unprotect(portada)

    # Power Query
    q_hist = f"AG_API_Historial_{cfg['id']}"
    q_cli = f"AG_API_Clientes_{cfg['id']}"
    q_pat = f"AG_API_Patrones_{cfg['id']}"
    for qn in (q_hist, q_cli, q_pat):
        delete_query_if_exists(wb, qn)

    print("  Creando Power Query…")
    wb.Queries.Add(q_hist, build_m_historial(cfg["prefixes"]))
    wb.Queries.Add(q_cli, M_CLIENTES)
    wb.Queries.Add(q_pat, build_m_patrones())

    ws_hist = ensure_sheet(wb, HIST_SHEET)
    ws_cli = ensure_sheet(wb, CLIENTES_SHEET)
    ws_pat = ensure_sheet(wb, PATRONES_SHEET)
    try_unprotect(ws_hist)
    try_unprotect(ws_cli)
    try_unprotect(ws_pat)

    print("  Sembrando hojas de datos (historial se llena al abrir con AutoSync)…")
    seed_headers(ws_hist, HIST_COLUMNS + ["domicilio", "contacto", "correo", "telefono"])
    seed_headers(ws_cli, CLIENT_COLUMNS)
    seed_headers(ws_pat, PATRON_COLUMNS)
    # Queries quedan definidas para refrescar después desde Excel si se necesita

    print("  Cableando certificado y fechas…")
    split_cert_cells(calc, cfg["prefixes"][0])
    wire_calc_formulas(calc, cfg)

    # Portada cert formula if there's a typical cell — best effort on I9 / common
    for addr in ("I9", "E9", "D9", "B4"):
        try:
            v = str(portada.Range(addr).Formula or portada.Range(addr).Value or "")
            if "E4" in v or "certificado" in v.lower() or "Certificado" in str(portada.Range(addr).Value or ""):
                pass
        except Exception:
            pass
    # Force common Portada cert link if cell linked to old E4
    try:
        # Many templates use Portada!I9 = Calculos!E4
        f = str(portada.Range("I9").Formula or "")
        if "E4" in f or f == "" or "AGT" in str(portada.Range("I9").Value or "") or "AGH" in str(portada.Range("I9").Value or ""):
            portada.Range("I9").Formula = (
                f"={cfg['calc']}!D4&\"-\"&TEXT({cfg['calc']}!E4,\"0000\")&\"-\"&TEXT({cfg['calc']}!F4,\"00\")"
            )
            print("  Portada I9 → cert D4-E4-F4")
    except Exception as e:
        print("  aviso Portada cert:", e)

    print("  Instalando macros…")
    set_module(wb.VBProject, cfg["ui_module"], build_ui_vba(cfg))
    set_module(wb.VBProject, "AG_AutoSync", build_autosync_vba(cfg["prefixes"]))
    # ThisWorkbook
    tw = wb.VBProject.VBComponents("ThisWorkbook")
    twc = tw.CodeModule
    if twc.CountOfLines:
        twc.DeleteLines(1, twc.CountOfLines)
    twc.AddFromString(WORKBOOK_OPEN.strip() + "\n")

    # Botones
    print("  Botones…")
    left = 420.0
    top = 4.0
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

    # VeryHide data sheets
    for ws in (ws_hist, ws_cli, ws_pat):
        try:
            ws.Visible = XL_VERY_HIDDEN
        except Exception:
            ws.Visible = False

    # Protect
    for ws in (calc, portada, ws_hist, ws_cli, ws_pat):
        try:
            try_unprotect(ws)
            ws.Protect(Password=PASSWORD, DrawingObjects=False, Contents=True, Scenarios=True)
        except Exception:
            pass

    if target.exists():
        target.unlink()
    wb.SaveAs(str(target.resolve()), FileFormat=XL_XLSM)
    print("  Guardado:", target.name)
    wb.Close(True)

    try:
        work.unlink()
    except Exception:
        pass
    return target


FORMATS = [
    {
        "id": "TermoH",
        "source": FOLDER / "TERMOHIGROMETRO (4).xlsx",
        "target": FOLDER / "Formato Termohigrometro.xlsm",
        "calc": "Calculos",
        "portada": "Portada",
        "prefixes": ["AGH"],
        "ui_module": "ModuloAG_TermoHUI",
        "instrumento_cell": "B9",
        "marca_cell": "B10",
        "modelo_cell": "B11",
        "serie_cell": "B12",
        "id_cell": "F9",
        "save_title": "Guardar certificado Termohigrómetro",
    },
    {
        "id": "TermoIR",
        "source": FOLDER / "Formato Termometro IR.xlsx",
        "target": FOLDER / "Formato Termometro IR.xlsm",
        "calc": "Muestreo",
        "portada": "Portada",
        "prefixes": ["AGT"],
        "ui_module": "ModuloAG_TermoIRUI",
        "instrumento_cell": "B8",
        "marca_cell": "B9",
        "modelo_cell": "B10",
        "serie_cell": "B11",
        "id_cell": "F8",
        "save_title": "Guardar certificado Termómetro IR",
    },
    {
        "id": "Hornos",
        "source": FOLDER / "Formato Hornos y muflas comparación directa.xlsx",
        "target": FOLDER / "Formato Hornos y Muflas.xlsm",
        "calc": "Calculos",
        "portada": "Portada",
        "prefixes": ["AGT"],
        "ui_module": "ModuloAG_HornosUI",
        "instrumento_cell": "B9",
        "marca_cell": "B10",
        "modelo_cell": "B11",
        "serie_cell": "B12",
        "id_cell": "F9",
        "save_title": "Guardar certificado Hornos y Muflas",
    },
]


def main() -> int:
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

    ok = []
    try:
        for cfg in FORMATS:
            try:
                setup_one(cfg, excel)
                ok.append(cfg["target"].name)
            except Exception as e:
                print("ERROR", cfg["id"], e)
                import traceback
                traceback.print_exc()
    finally:
        excel.Quit()
        pythoncom.CoUninitialize()

    print("\n=== LISTO ===")
    for name in ok:
        print(" ", name)
    return 0 if len(ok) == 3 else 1


if __name__ == "__main__":
    raise SystemExit(main())
