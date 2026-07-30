# -*- coding: utf-8 -*-
"""
Une Formato pin gage mm + in en Formato Pin Gage.xlsm (master profesional):

- Base: mm (260 puntos; Patron ya tiene columnas mm + in).
- Selector mm/in en J10; división J9; incremento J11; nominal inicial A18.
- VLOOKUPs duales con IFERROR (corrige bugs del xlsx in: col1 / rango I:L).
- Lecturas robustas (AVERAGE/STDEV/dictamen sin #DIV/0! / #N/A).
- Power Query AGD + clientes + patrones (AG-010 micrometro patrón).
- Certificado D4=AGD / E4=número / F4=año.
- Macros: Guardar, mm/in, Actualizar, Ir a Portada.
- Repara celdas rotas en Resultados (D→H, I→L).
"""
from __future__ import annotations

import re
import shutil
import sys
import time
import zipfile
from datetime import datetime
from io import BytesIO
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace", line_buffering=True)

import pythoncom
import win32com.client

FOLDER = Path(r"C:\Users\AG\Desktop\FORMATOS AG")
SOURCE_MM = FOLDER / "Formato pin gage mm.XLSX"
SOURCE_IN = FOLDER / "Formato pin gage in.XLSX"
TARGET = FOLDER / "Formato Pin Gage.xlsm"
PASSWORD = "AG-Calidad-2026"
MSO_ROUNDED = 5
XL_XLSM = 52
XL_VERY_HIDDEN = 2

ROW_FIRST = 18
ROW_LAST = 277  # inclusive; plantilla mm

API_BASE = (
    "https://us-central1-agg1-b7f40.cloudfunctions.net/obtenerDatosExcel"
    "?key=TU_CLAVE_SECRETA_AG_APP_2026"
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

DIM_IDS = [
    "AG-001", "AG-002", "AG-004", "AG-006", "AG-007", "AG-010", "AG-012",
    "AG-029", "AG-030", "AG-041", "AG-059",
]


def m_list(values: list[str]) -> str:
    return "{" + ", ".join(f'"{v}"' for v in values) + "}"


M_HISTORIAL = f'''let
    Url = "{API_BASE}",
    Fuente = Json.Document(Web.Contents(Url)),
    HistorialLista = Fuente[historial],
    ClientesLista = Fuente[clientes],
    HistorialBase = Table.FromRecords(HistorialLista, {m_list(HIST_COLUMNS)}, MissingField.UseNull),
    HistorialAGD = Table.SelectRows(
        HistorialBase,
        each Text.StartsWith(Text.Upper(Text.From([certificado])), "AGD-")
    ),
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
    HistorialClave = Table.AddColumn(
        HistorialAGD, "_clienteKey", each NormalizarNombre([cliente]), type text
    ),
    ClientesClave = Table.AddColumn(
        ClientesBase, "_clienteKey", each NormalizarNombre([Nombre]), type text
    ),
    ClientesUnicos = Table.Group(
        ClientesClave,
        {{"_clienteKey"}},
        {{{{"ClienteRow", each Table.First(_), type record}}}}
    ),
    Cruzado = Table.NestedJoin(
        HistorialClave, {{"_clienteKey"}},
        ClientesUnicos, {{"_clienteKey"}},
        "ClienteMatch", JoinKind.LeftOuter
    ),
    ClienteRow = Table.AddColumn(
        Cruzado,
        "_clienteRow",
        each if Table.IsEmpty([ClienteMatch]) then null else [ClienteMatch]{{0}}[ClienteRow],
        type nullable record
    ),
    Domicilio = Table.AddColumn(
        ClienteRow, "domicilio",
        each if [_clienteRow] = null then "" else Record.FieldOrDefault([_clienteRow], "Domicilio", ""),
        type text
    ),
    Contacto = Table.AddColumn(
        Domicilio, "contacto",
        each if [_clienteRow] = null then "" else Record.FieldOrDefault([_clienteRow], "Contacto", ""),
        type text
    ),
    Correo = Table.AddColumn(
        Contacto, "correo",
        each if [_clienteRow] = null then "" else Record.FieldOrDefault([_clienteRow], "Correo", ""),
        type text
    ),
    Telefono = Table.AddColumn(
        Correo, "telefono",
        each if [_clienteRow] = null then "" else Record.FieldOrDefault([_clienteRow], "Telefono", ""),
        type text
    ),
    Resultado = Table.SelectColumns(
        Telefono,
        {m_list(HIST_COLUMNS + ["domicilio", "contacto", "correo", "telefono"])}
    )
in
    Resultado'''

M_CLIENTES = f'''let
    Url = "{API_BASE}&formato=clientes",
    Fuente = Json.Document(Web.Contents(Url)),
    Tabla = Table.FromRecords(Fuente, {m_list(CLIENT_COLUMNS)}, MissingField.UseNull),
    Limpio = Table.TransformColumns(
        Tabla,
        List.Transform(
            {m_list(CLIENT_COLUMNS)},
            each {{_, (v) => if v = null then "" else Text.Trim(Text.From(v)), type text}}
        )
    )
in
    Limpio'''

M_PATRONES = f'''let
    Url = "{API_BASE}&formato=patrones",
    Fuente = Json.Document(Web.Contents(Url)),
    Tabla = Table.FromRecords(Fuente, {m_list(PATRON_COLUMNS)}, MissingField.UseNull),
    SoloDim = Table.SelectRows(
        Tabla,
        each let
            d = Text.Upper(if [descripcion] = null then "" else Text.From([descripcion])),
            id = Text.Upper(Text.Trim(if [noControl] = null then "" else Text.From([noControl])))
        in
            Text.Contains(d, "BLOQUE") or Text.Contains(d, "GAUGE")
            or Text.Contains(d, "MICROM") or Text.Contains(d, "PIN")
            or List.Contains({m_list(DIM_IDS)}, id)
    ),
    Fechas = Table.TransformColumns(
        SoloDim,
        {{
            {{"fechaUltimaCalibracion", each try Date.FromText(Text.Start(Text.From(_), 10)) otherwise null, type date}},
            {{"fechaVencimiento", each try Date.FromText(Text.Start(Text.From(_), 10)) otherwise null, type date}}
        }}
    )
in
    Fechas'''

HS = HIST_SHEET
CERT_KEY = 'TRIM($D$4)&"-"&TEXT($E$4,"0000")&"-"&TEXT($F$4,"00")'
MATCH = f"MATCH({CERT_KEY},{HS}!$B:$B,0)"


def idx(col: str, blank: str = '""') -> str:
    return f"=IFERROR(INDEX({HS}!${col}:${col},{MATCH}),{blank})"


CALC_FORMULAS = {
    "B5": idx("C"),
    "E5": idx("P"),
    "B6": idx("N"),
    "E6": idx("Q"),
    "B7": idx("O"),
    "E7": '=""',
    "B9": idx("D", '"No encontrado"'),
    "F9": idx("H"),
    "B10": idx("E", '"No encontrado"'),
    "B11": idx("F"),
    "B12": idx("G"),
    "I4": (
        "=IFERROR("
        f'IF(INDEX({HS}!$M:$M,{MATCH})="",'
        f'IF(UPPER(LEFT(INDEX({HS}!$K:$K,{MATCH}),1))="S","Servicio en Sitio",""),'
        f"VALUE(INDEX({HS}!$M:$M,{MATCH}))),"
        f'IF(IFERROR(UPPER(LEFT(INDEX({HS}!$K:$K,{MATCH}),1)),"")="S","Servicio en Sitio",""))'
    ),
    "I5": f'=IFERROR(VALUE(INDEX({HS}!$I:$I,{MATCH})),"")',
    "I6": (
        f'=IFERROR(EDATE($I$5,IF(INDEX({HS}!$L:$L,{MATCH})="6 meses",6,'
        f'IF(INDEX({HS}!$L:$L,{MATCH})="3 meses",3,'
        f'IF(INDEX({HS}!$L:$L,{MATCH})="24 meses",24,'
        f'IF(OR(INDEX({HS}!$L:$L,{MATCH})="12 meses",'
        f'INDEX({HS}!$L:$L,{MATCH})="1 año"),12,12))))),"")'
    ),
    "I7": "=TODAY()",
    "AH4": idx("K"),
    "C14": (
        '=IF(OR($AH$4="Laboratorio",$AH$4="laboratorio"),"Instalaciones AG",'
        'IF(OR($AH$4="Sitio",$AH$4="sitio",UPPER(LEFT($AH$4,1))="S"),'
        '"Instalaciones de Cliente",'
        'IF(OR($I$4="Servicio en Sitio",$I$4="Servicio en sitio"),'
        '"Instalaciones de Cliente","Instalaciones AG")))'
    ),
    "M8": idx("J"),  # Calibró — Portada A53 lee Calculos!M8
    # Resumen patrón unificado desde hoja Patron (tabla de errores)
    "M4": "=Patron!B4",
    "N4": "=Patron!D4",
    "O4": "=Patron!D5",
    "P4": "=Patron!B5",
    "Q4": "=Patron!B6",
    "R4": "=Patron!B7",
    "S4": "=Patron!D7",
}

F_CERT = '=Calculos!D4&"-"&TEXT(Calculos!E4,"0000")&"-"&TEXT(Calculos!F4,"00")'

PATRON_BLOCKS = [
    ("Patron", "D4", "D5", "D7"),
    ("Patrones", "D4", "D5", "D7"),
]


def patron_lookup(id_cell: str, col: str) -> str:
    return (
        f"INDEX({PATRONES_SHEET}!${col}:${col},"
        f"MATCH(TRIM(${id_cell[0]}${id_cell[1:]}),{PATRONES_SHEET}!$A:$A,0))"
    )


def wire_patron_blocks(wb) -> int:
    wired = 0
    for sheet_name, id_cell, cert_cell, vig_cell in PATRON_BLOCKS:
        ws = wb.Worksheets(sheet_name)
        pid = str(ws.Range(id_cell).Value or "").strip()
        if not pid:
            continue
        cur_cert = str(ws.Range(cert_cell).Value or "").strip().replace('"', '""')
        cert_idx = patron_lookup(id_cell, "F")
        ws.Range(cert_cell).Formula = (
            f'=IF(IFERROR({cert_idx},"")="","{cur_cert}",{cert_idx})'
        )
        cur_vig = ws.Range(vig_cell).Value
        if cur_vig is not None and hasattr(cur_vig, "year"):
            fallback = f"DATE({cur_vig.year},{cur_vig.month},{cur_vig.day})"
        else:
            fallback = '""'
            try:
                if ws.Range(vig_cell).HasFormula:
                    fallback_formula = ws.Range(vig_cell).Formula
                    vig_idx = patron_lookup(id_cell, "H")
                    ws.Range(vig_cell).Formula = (
                        f'=IF(IFERROR({vig_idx},"")="",{fallback_formula[1:]},{vig_idx})'
                    )
                    wired += 1
                    continue
            except Exception:
                pass
        vig_idx = patron_lookup(id_cell, "H")
        ws.Range(vig_cell).Formula = (
            f'=IF(IFERROR({vig_idx},"")="",{fallback},{vig_idx})'
        )
        wired += 1
    return wired


VBA_CODE = r'''
Option Explicit

Private Const AG_PASSWORD As String = "AG-Calidad-2026"
Private Const MM_PER_IN As Double = 25.4
Private Const ROW_FIRST As Long = 18
Private Const ROW_LAST As Long = 277

Private Function CertificadoDim() As String
    With ThisWorkbook.Worksheets("Calculos")
        CertificadoDim = Trim(CStr(.Range("D4").Value)) & "-" & _
                         Format(.Range("E4").Value, "0000") & "-" & _
                         Format(.Range("F4").Value, "00")
    End With
End Function

Private Sub LimpiarLecturas(ws As Worksheet)
    ws.Range("C" & ROW_FIRST & ":G" & ROW_LAST).ClearContents
End Sub

Private Sub ConvertirEmp(ws As Worksheet, factor As Double)
    Dim r As Long
    Dim v As Variant
    For r = ROW_FIRST To ROW_LAST
        v = ws.Range("J" & r).Value
        If IsNumeric(v) Then
            On Error Resume Next
            If Not ws.Range("J" & r).HasFormula Then
                ws.Range("J" & r).Value = CDbl(v) * factor
            End If
            On Error GoTo 0
        End If
    Next r
End Sub

Sub GuardarCertificadoExcel()
    Dim ws As Worksheet
    Dim ruta As Variant
    Dim nombreArchivo As String
    Dim instrumento As String
    Dim idEquipo As String
    Dim avisoPatron As String

    On Error GoTo ErrorHandler
    Set ws = ThisWorkbook.Worksheets("Calculos")

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
    avisoPatron = CStr(ThisWorkbook.Worksheets("Portada").Range("E46").Value)
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
        Title:="Guardar certificado de pin gage")

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

Sub CambiarUnidadPinGage()
    Dim ws As Worksheet
    Dim unidad As String
    Dim divMin As Variant
    Dim incremento As Variant
    Dim nominal0 As Variant

    Set ws = ThisWorkbook.Worksheets("Calculos")
    On Error Resume Next
    ws.Unprotect Password:=AG_PASSWORD
    On Error GoTo 0

    unidad = LCase(Trim(CStr(ws.Range("J10").Value)))
    divMin = ws.Range("J9").Value
    incremento = ws.Range("J11").Value
    nominal0 = ws.Range("A18").Value

    If unidad = "mm" Then
        ws.Range("J10").Value = "in"
        If IsNumeric(divMin) Then ws.Range("J9").Value = CDbl(divMin) / MM_PER_IN
        If IsNumeric(incremento) Then ws.Range("J11").Value = CDbl(incremento) / MM_PER_IN
        If IsNumeric(nominal0) Then
            On Error Resume Next
            If Not ws.Range("A18").HasFormula Then
                ws.Range("A18").Value = CDbl(nominal0) / MM_PER_IN
            End If
            On Error GoTo 0
        End If
        ConvertirEmp ws, 1# / MM_PER_IN
        LimpiarLecturas ws
        MsgBox "Modo pulgadas (in)." & vbCrLf & _
               "División / incremento / nominal inicial / EMP ÷25.4." & vbCrLf & _
               "Captura de nuevo las lecturas X1-X5.", _
               vbInformation, "Unidad"
    Else
        ws.Range("J10").Value = "mm"
        If IsNumeric(divMin) Then ws.Range("J9").Value = CDbl(divMin) * MM_PER_IN
        If IsNumeric(incremento) Then ws.Range("J11").Value = CDbl(incremento) * MM_PER_IN
        If IsNumeric(nominal0) Then
            On Error Resume Next
            If Not ws.Range("A18").HasFormula Then
                ws.Range("A18").Value = CDbl(nominal0) * MM_PER_IN
            End If
            On Error GoTo 0
        End If
        ConvertirEmp ws, MM_PER_IN
        LimpiarLecturas ws
        MsgBox "Modo milímetros (mm)." & vbCrLf & _
               "División / incremento / nominal inicial / EMP ×25.4." & vbCrLf & _
               "Captura de nuevo las lecturas X1-X5.", _
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
    ThisWorkbook.Worksheets("Calculos").Calculate
    ThisWorkbook.Worksheets("Portada").Calculate
    ThisWorkbook.Worksheets("Resultados").Calculate
    Application.ScreenUpdating = True
    MsgBox "Datos y cálculos actualizados para " & CertificadoDim(), _
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
    shape.Placement = 3
    shape.Locked = True
    shape.TextFrame.Characters().Text = caption
    font = shape.TextFrame.Characters().Font
    font.Color = 0xFFFFFF
    font.Bold = True
    font.Size = 9
    font.Name = "Calibri"
    shape.TextFrame.HorizontalAlignment = -4108
    shape.TextFrame.VerticalAlignment = -4108


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


def load_query_to_sheet(wb, query_name: str, ws, table_name: str) -> bool:
    """Carga PQ a hoja. Si falla la red, deja encabezados y retorna False."""
    clear_sheet(ws)
    conn_name = f"Query - {query_name}"
    delete_connection_if_exists(wb, conn_name)
    source = (
        "OLEDB;Provider=Microsoft.Mashup.OleDb.1;"
        f'Data Source=$Workbook$;Location="{query_name}";Extended Properties=""'
    )
    try:
        table = ws.ListObjects.Add(0, source, False, 1, ws.Range("A1"))
        query = table.QueryTable
        query.CommandType = 2
        query.CommandText = [f"SELECT * FROM [{query_name}]"]
        query.BackgroundQuery = False
        query.PreserveFormatting = True
        query.RefreshOnFileOpen = True
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
            connection.RefreshWithRefreshAll = True
            try:
                connection.OLEDBConnection.BackgroundQuery = False
                connection.OLEDBConnection.RefreshOnFileOpen = True
                connection.OLEDBConnection.RefreshPeriod = 0
            except Exception:
                pass
        return True
    except Exception as exc:
        print(f"  (aviso) Refresh PQ falló ({exc}). Se dejan encabezados; usa sync/bat.")
        try:
            while ws.ListObjects.Count > 0:
                ws.ListObjects(1).Delete()
        except Exception:
            pass
        ws.Cells.Clear()
        headers = {
            HIST_SHEET: [
                "Name", "certificado", "cliente", "equipo", "marca", "modelo", "serie", "id",
                "fecha", "tecnico", "lugarCalibracion", "frecuenciaCalibracion", "fechaRecepcion",
                "domicilio", "contacto", "correo", "telefono",
            ],
            CLIENTES_SHEET: CLIENT_COLUMNS,
            PATRONES_SHEET: PATRON_COLUMNS,
        }.get(str(ws.Name), ["col1"])
        for c, h in enumerate(headers, 1):
            ws.Cells(1, c).Value = h
        return False


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
        try:
            ws.Range(addr).Interior.Color = rgb(255, 242, 204)
        except Exception:
            pass


def strip_sheet_protection(src: Path, dst: Path) -> int:
    removed = 0
    pattern = re.compile(
        rb"<sheetProtection\b[^>]*/>|<sheetProtection\b[\s\S]*?</sheetProtection>",
        re.I,
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


def apply_dual_unit_fixes(calc) -> None:
    """Fórmulas duales mm/in + lecturas robustas en bloque (A1 relativo)."""
    calc.Range("J10").Value = "mm"

    # Al asignar Formula a un rango, Excel ajusta refs relativas (A18→A19…)
    calc.Range(f"O{ROW_FIRST}:O{ROW_LAST}").Formula = (
        '=IF($J$10="mm",'
        "IFERROR(VLOOKUP(A18,Patron!$E$6:$H$16,2,TRUE),0),"
        "IFERROR(VLOOKUP(A18*25.4,Patron!$E$6:$H$16,2,TRUE)/25.4,0))"
    )
    calc.Range(f"Q{ROW_FIRST}:Q{ROW_LAST}").Formula = (
        '=IF($J$10="mm",'
        "IFERROR(VLOOKUP(A18,Patron!$E$6:$H$16,4,TRUE),0),"
        "IFERROR(VLOOKUP(A18*25.4,Patron!$E$6:$H$16,4,TRUE)/25.4,0))"
    )
    calc.Range(f"H{ROW_FIRST}:H{ROW_LAST}").Formula = (
        '=IF(COUNT(C18:G18)<1,"",AVERAGE(C18:G18))'
    )
    calc.Range(f"I{ROW_FIRST}:I{ROW_LAST}").Formula = (
        '=IF(H18="","",H18-A18)'
    )
    calc.Range(f"M{ROW_FIRST}:M{ROW_LAST}").Formula = (
        "=IFERROR(STDEV(C18:G18),0)"
    )
    calc.Range(f"K{ROW_FIRST}:K{ROW_LAST}").Formula = (
        '=IFERROR(IF(ABS(I18)>J18,"RECHAZADO","ACEPTADO"),"")'
    )
    calc.Range(f"L{ROW_FIRST}:L{ROW_LAST}").Formula = (
        '=IFERROR(IF(ABS(I18)+X18>J18,"RECHAZADO","ACEPTADO"),'
        'IF(ABS(I18)>J18,"RECHAZADO","ACEPTADO"))'
    )

    calc.Range("B18").Formula = "=A18"
    # A19=A18+$J$11, A20=A19+$J$11…  (J11 = R11C10 absoluto)
    calc.Range(f"A{ROW_FIRST + 1}:A{ROW_LAST}").FormulaR1C1 = "=R[-1]C+R11C10"
    calc.Range(f"B{ROW_FIRST}:B{ROW_LAST}").FormulaR1C1 = "=RC1"


def fix_resultados(res) -> int:
    """Corrige D→H e I→L donde estaban mal (C / K)."""
    fixed = 0
    # Pares conocidos del análisis + barrido genérico
    import re as _re
    pat_a = _re.compile(r"Calculos!A(\d+)", _re.I)
    for row in range(28, 400):
        c_val = res.Range(f"C{row}").Formula
        if not c_val or not isinstance(c_val, str):
            continue
        m = pat_a.search(c_val)
        if not m:
            continue
        n = m.group(1)
        d = res.Range(f"D{row}").Formula
        i = res.Range(f"I{row}").Formula
        if isinstance(d, str) and f"Calculos!C{n}" in d.replace("$", ""):
            res.Range(f"D{row}").Formula = f"=Calculos!H{n}"
            fixed += 1
        if isinstance(i, str) and f"Calculos!K{n}" in i.replace("$", ""):
            res.Range(f"I{row}").Formula = f"=Calculos!L{n}"
            fixed += 1
    return fixed


def fix_patron_inch_formulas(patron) -> None:
    """Asegura columnas in derivadas (I:L) y corrige K6 si apunta a F7."""
    try:
        k6 = str(patron.Range("K6").Formula or "")
        if "F7" in k6:
            patron.Range("K6").Formula = "=F6/$L$2"
    except Exception:
        pass
    # Rellenar I6:L16 si faltan
    for row in range(6, 17):
        for col, formula in (
            ("I", f"=H{row}/$L$2"),
            ("J", f"=E{row}/$L$2"),
            ("K", f"=F{row}/$L$2"),
            ("L", f"=G{row}/$L$2"),
        ):
            cell = patron.Range(f"{col}{row}")
            if cell.Value is None and not cell.HasFormula:
                cell.Formula = formula


def main() -> int:
    src_mm = SOURCE_MM if SOURCE_MM.exists() else FOLDER / "Formato pin gage mm.xlsx"
    src_in = SOURCE_IN if SOURCE_IN.exists() else FOLDER / "Formato pin gage in.xlsx"
    if not src_mm.exists():
        print(f"No existe: {SOURCE_MM}")
        return 1

    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    work = FOLDER / f"_tmp_pin_gage_{stamp}.xlsx"
    backup_mm = FOLDER / f"Formato pin gage mm_backup_setup_{stamp}.xlsx"
    shutil.copy2(src_mm, backup_mm)
    print(f"Respaldo mm: {backup_mm.name}")
    if src_in.exists():
        backup_in = FOLDER / f"Formato pin gage in_backup_setup_{stamp}.xlsx"
        shutil.copy2(src_in, backup_in)
        print(f"Respaldo in: {backup_in.name}")

    n_prot = strip_sheet_protection(src_mm, work)
    print(f"Trabajo: {work.name} (protección quitada en {n_prot} hojas)")

    pythoncom.CoInitialize()
    excel = win32com.client.DispatchEx("Excel.Application")
    excel.Visible = False
    excel.DisplayAlerts = False
    excel.AskToUpdateLinks = False
    excel.EnableEvents = False
    wb = None

    try:
        print(f"Abriendo: {work.name}")
        wb = excel.Workbooks.Open(str(work.resolve()), UpdateLinks=0, ReadOnly=False)
        if wb.ReadOnly:
            raise RuntimeError("Solo lectura")
        try:
            wb.Queries.FastCombine = True
        except Exception:
            pass

        calc = wb.Worksheets("Calculos")
        portada = wb.Worksheets("Portada")
        resultados = wb.Worksheets("Resultados")
        patron = wb.Worksheets("Patron")
        patrones = wb.Worksheets("Patrones")
        for ws in (calc, portada, resultados, patron, patrones):
            try_unprotect(ws)
        try:
            try_unprotect(wb.Worksheets("CMC"))
        except Exception:
            pass

        print("Corrigiendo hoja Patron (columnas in)…")
        fix_patron_inch_formulas(patron)

        query_defs = (
            ("AG_API_Historial_PinGage", M_HISTORIAL, HIST_SHEET, "AG_Historial"),
            ("AG_API_Clientes_PinGage", M_CLIENTES, CLIENTES_SHEET, "AG_Clientes"),
            ("AG_API_Patrones_PinGage", M_PATRONES, PATRONES_SHEET, "AG_Patrones"),
        )
        print("Creando Power Query…")
        for query_name, _, _, _ in query_defs:
            delete_query_if_exists(wb, query_name)
            delete_connection_if_exists(wb, f"Query - {query_name}")
        for query_name, formula, sheet_name, table_name in query_defs:
            print(f"  {query_name} -> {sheet_name}")
            wb.Queries.Add(query_name, formula)
            load_query_to_sheet(wb, query_name, ensure_sheet(wb, sheet_name), table_name)

        print("Cableando certificado e historial…")
        for ref in ("A4", "B4", "C4", "D4", "E4", "F4"):
            try_unmerge(calc, ref)
        calc.Range("A4").Value = "****No. DE CERTIFICADO:"
        try:
            calc.Range("A4:C4").Merge()
        except Exception:
            pass
        calc.Range("D4").Value = "AGD"
        calc.Range("E4").Value = 816
        calc.Range("F4").Value = 24

        for ref in ("D4", "E4", "F4", "J10", "J9", "J11", "A18", "F10", "I5"):
            unlock_cell(calc, ref)
        # lecturas + EMP
        for row in range(ROW_FIRST, ROW_LAST + 1):
            for col in ("C", "D", "E", "F", "G", "J"):
                unlock_cell(calc, f"{col}{row}")

        for addr, formula in CALC_FORMULAS.items():
            calc.Range(addr).Formula = formula

        calc.Range("AH4").Font.Size = 8
        calc.Range("AH4").Font.Color = rgb(150, 150, 150)

        portada.Range("J9").Formula = F_CERT
        try:
            resultados.Range("J10").Formula = "=Portada!J9"
        except Exception:
            pass

        print("Aplicando fórmulas duales mm/in (filas 18-277)…")
        apply_dual_unit_fixes(calc)

        print("Reparando Resultados…")
        n_fix = fix_resultados(resultados)
        print(f"  Celdas Resultados corregidas: {n_fix}")

        n_wired = wire_patron_blocks(wb)
        print(f"Patrones enlazados: {n_wired}")

        print("Macros y botones…")
        try:
            set_module(wb.VBProject, "ModuloAG_PinGageUI", VBA_CODE)
        except Exception as exc:
            raise RuntimeError("Activa confianza al modelo de objetos VBA.") from exc

        old = [
            str(calc.Shapes(i).Name)
            for i in range(1, calc.Shapes.Count + 1)
            if str(calc.Shapes(i).Name).startswith("btn_")
        ]
        for name in old:
            calc.Shapes(name).Delete()

        buttons = (
            ("Guardar", "GuardarCertificadoExcel", 92, rgb(37, 99, 235)),
            ("mm / in", "CambiarUnidadPinGage", 88, rgb(124, 58, 237)),
            ("Actualizar", "RecalcularCertificado", 88, rgb(217, 119, 6)),
            ("Ir a Portada", "IrAPortada", 88, rgb(71, 85, 105)),
        )
        left = float(calc.Range("Y1").Left) + 6
        top = 4.0
        for caption, macro, width, color in buttons:
            add_button(calc, left, top, width, caption, macro, color)
            left += width + 5

        for sheet_name in (HIST_SHEET, CLIENTES_SHEET, PATRONES_SHEET):
            wb.Worksheets(sheet_name).Visible = XL_VERY_HIDDEN

        excel.CalculateUntilAsyncQueriesDone()
        excel.Calculate()
        time.sleep(1)

        # Prueba mm
        calc.Range("J10").Value = "mm"
        calc.Range("J9").Value = 0.001
        calc.Range("J11").Value = 0.02
        calc.Range("A18").Value = 5.2
        for col in ("C", "D", "E", "F", "G"):
            calc.Range(f"{col}18").Value = 5.2
        excel.Calculate()
        print(
            f"  Prueba mm: A19={calc.Range('A19').Value} "
            f"O18={calc.Range('O18').Value} Q18={calc.Range('Q18').Value} "
            f"L18={calc.Range('L18').Text}"
        )

        # Prueba in
        calc.Range("J10").Value = "in"
        calc.Range("J9").Value = 0.001 / 25.4
        calc.Range("J11").Value = 0.001
        calc.Range("A18").Value = 0.061
        for col in ("C", "D", "E", "F", "G"):
            calc.Range(f"{col}18").Value = 0.061
        excel.Calculate()
        print(
            f"  Prueba in: A19={calc.Range('A19').Value} "
            f"O18={calc.Range('O18').Value} Q18={calc.Range('Q18').Value} "
            f"L18={calc.Range('L18').Text}"
        )

        # Dejar listo en mm con demo limpia parcial (clean formal después)
        calc.Range("J10").Value = "mm"
        calc.Range("J9").Value = 0.001
        calc.Range("J11").Value = 0.02
        calc.Range("A18").Value = 5.2
        calc.Range(f"C{ROW_FIRST}:G{ROW_LAST}").ClearContents()

        calc.Protect(Password=PASSWORD, DrawingObjects=False, Contents=True, Scenarios=True)
        portada.Protect(Password=PASSWORD, DrawingObjects=False, Contents=True, Scenarios=True)
        patron.Protect(Password=PASSWORD, DrawingObjects=False, Contents=True, Scenarios=True)

        if TARGET.exists():
            TARGET.unlink()
        wb.SaveAs(str(TARGET.resolve()), FileFormat=XL_XLSM)
        print(f"Guardado: {TARGET.name}")

        if not bool(wb.HasVBProject):
            raise RuntimeError("Sin VBA")
        found = {
            str(calc.Shapes(i).Name)
            for i in range(1, calc.Shapes.Count + 1)
            if str(calc.Shapes(i).Name).startswith("btn_")
        }
        if len(found) != 4:
            raise RuntimeError(f"Botones: {found}")

        print(f"  Cert Portada: {portada.Range('J9').Value}")
        print(f"  Unidad: {calc.Range('J10').Value}")

        wb.Close(SaveChanges=True)
        wb = None

        for src in (src_mm, src_in):
            if src.exists():
                try:
                    src.unlink()
                    print(f"Retirado: {src.name}")
                except Exception as exc:
                    print(f"  (aviso) No se pudo retirar {src.name}: {exc}")

        print("LISTO: Formato Pin Gage.xlsm")
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
        try:
            excel.Quit()
        except Exception:
            pass
        pythoncom.CoUninitialize()
        if work.exists():
            try:
                work.unlink()
            except Exception:
                pass


if __name__ == "__main__":
    raise SystemExit(main())
