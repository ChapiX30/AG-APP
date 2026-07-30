# -*- coding: utf-8 -*-
"""
Convierte Formato Dinamometro Unificado.xlsx en master sincronizado (.xlsm):

- Power Query (refresca al abrir): obtenerDatosExcel (historial AGF/AGFT + cliente),
  BD_Clientes, BD_Patrones (pesas + celda de carga AG-040). Hojas muy ocultas.
- CALCULOS enlazado al historial: D4=AGF / E4=número / F4=año llena cliente,
  instrumento, fechas y técnico automáticamente.
- Macros + botones en CALCULOS: Guardar, Actualizar, Ir a Portada.
- Certificados/vigencias de patrones enlazados a BD_Patrones.

No toca incertidumbres, lecturas, CMC ni el selector de unidad kg/lb/N.
"""
from __future__ import annotations

import re
import shutil
import sys
import time
import zipfile
from datetime import datetime
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace", line_buffering=True)

import pythoncom
import win32com.client

SOURCE = Path(r"C:\Users\AG\Desktop\FORMATOS AG\Formato Dinamometro Unificado.xlsx")
TARGET = Path(r"C:\Users\AG\Desktop\FORMATOS AG\Formato Dinamometro Unificado.xlsm")
PASSWORD = "AG-Calidad-2026"
MSO_ROUNDED = 5
XL_XLSM = 52
XL_VERY_HIDDEN = 2

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

# Pesas + celda de carga usadas en dinamómetro / fuerza
FUERZA_IDS = [
    "AG-017", "AG-018", "AG-019", "AG-020", "AG-022", "AG-023", "AG-040",
]


def m_list(values: list[str]) -> str:
    return "{" + ", ".join(f'"{v}"' for v in values) + "}"


M_HISTORIAL = f'''let
    Url = "{API_BASE}",
    Fuente = Json.Document(Web.Contents(Url)),
    HistorialLista = Fuente[historial],
    ClientesLista = Fuente[clientes],
    HistorialBase = Table.FromRecords(HistorialLista, {m_list(HIST_COLUMNS)}, MissingField.UseNull),
    HistorialAGF = Table.SelectRows(
        HistorialBase,
        each
            Text.StartsWith(Text.Upper(Text.From([certificado])), "AGF-")
            or Text.StartsWith(Text.Upper(Text.From([certificado])), "AGFT-")
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
        HistorialAGF, "_clienteKey", each NormalizarNombre([cliente]), type text
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
    SoloFuerza = Table.SelectRows(
        Tabla,
        each let
            d = Text.Upper(if [descripcion] = null then "" else Text.From([descripcion])),
            id = Text.Upper(Text.Trim(if [noControl] = null then "" else Text.From([noControl])))
        in
            Text.Contains(d, "MASA") or Text.Contains(d, "PESA")
            or Text.Contains(d, "CELDA") or Text.Contains(d, "CARGA")
            or Text.Contains(d, "FUERZA") or Text.Contains(d, "DINAM")
            or List.Contains({m_list(FUERZA_IDS)}, id)
    ),
    Fechas = Table.TransformColumns(
        SoloFuerza,
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
    "E7": None,
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
        f'IF(INDEX({HS}!$L:$L,{MATCH})="24 meses",24,12)))),"")'
    ),
    "I7": "=TODAY()",
    "B9": idx("D", '"No encontrado"'),
    "B10": idx("E", '"No encontrado"'),
    "B11": idx("F"),
    "B12": idx("G"),
    "F9": idx("H"),
    "S4": idx("K"),
    "C14": (
        '=IF(OR($S$4="Laboratorio",$S$4="laboratorio"),"Instalaciones AG",'
        'IF(OR($S$4="Sitio",$S$4="sitio"),"Instalaciones de Cliente",'
        'IF($I$4="Servicio en Sitio",$B$5,"Lab. Mecánica")))'
    ),
    # Calibró (K17) = técnico del certificado. Aprobó (L17) se deja manual.
    "K17": idx("J"),
}

F_CERT_PORTADA = (
    '=CALCULOS!D4&"-"&TEXT(CALCULOS!E4,"0000")&"-"&TEXT(CALCULOS!F4,"00")'
)

# (hoja, celda ID, cert, vigencia)
PATRON_BLOCKS = [
    ("PATRONES", "D1", "D2", "D4"),      # AG-020 parte 1
    ("PATRONES", "D6", "D7", "D9"),      # AG-020 parte 2
    ("PATRONES", "D13", "D14", "D16"),   # AG-017
    ("PATRONES", "D18", "D19", "D21"),   # AG-018
    ("PATRONES", "D23", "D24", "D26"),   # AG-019
    ("PATRONES", "D28", "D29", "D31"),   # AG-022
    ("PATRONES", "D33", "D34", "D36"),   # AG-023
    ("PATRONES", "D191", "D192", "D194"),  # AG-040 celda
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
            # Si ya era fórmula (=D3+365), conservar como texto de respaldo vacío
            fallback = '""'
        vig_idx = patron_lookup(id_cell, "H")
        ws.Range(vig_cell).Formula = (
            f'=IF(IFERROR({vig_idx},"")="",{fallback},{vig_idx})'
        )
        wired += 1
    return wired


VBA_CODE = r'''
Option Explicit

Private Const AG_PASSWORD As String = "AG-Calidad-2026"

Private Function CertificadoFuerza() As String
    With ThisWorkbook.Worksheets("CALCULOS")
        CertificadoFuerza = Trim(CStr(.Range("D4").Value)) & "-" & _
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
    Dim avisoPatron As String

    On Error GoTo ErrorHandler
    Set ws = ThisWorkbook.Worksheets("CALCULOS")

    If Trim(CStr(ws.Range("D4").Value)) = "" Or _
       Trim(CStr(ws.Range("E4").Value)) = "" Or _
       Trim(CStr(ws.Range("F4").Value)) = "" Then
        MsgBox "El número de certificado está incompleto (D4-E4-F4)." & vbCrLf & _
               "Ejemplo: AGF | 52 | 26", vbCritical, "Validación"
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
    avisoPatron = CStr(ThisWorkbook.Worksheets("PORTADA").Range("E47").Value)
    On Error GoTo ErrorHandler
    If InStr(1, UCase(avisoPatron), "VENCIDO") > 0 Then
        If MsgBox("Un patrón aparece VENCIDO." & vbCrLf & "¿Deseas guardar de todos modos?", _
                  vbExclamation + vbYesNo, "Calidad") = vbNo Then Exit Sub
    End If

    nombreArchivo = CertificadoFuerza() & " - " & instrumento & " - " & idEquipo
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
        Title:="Guardar certificado de dinamómetro")

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

Sub RecalcularCertificado()
    On Error GoTo ErrorHandler
    Application.ScreenUpdating = False
    ThisWorkbook.RefreshAll
    Application.CalculateUntilAsyncQueriesDone
    ThisWorkbook.Worksheets("CALCULOS").Calculate
    ThisWorkbook.Worksheets("PORTADA").Calculate
    ThisWorkbook.Worksheets("RESULTADOS").Calculate
    Application.ScreenUpdating = True
    MsgBox "Datos y cálculos actualizados para " & CertificadoFuerza(), _
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


def strip_sheet_protection(xlsx: Path) -> None:
    tmp = xlsx.with_suffix(".unprot.xlsx")
    with zipfile.ZipFile(xlsx, "r") as zin, zipfile.ZipFile(
        tmp, "w", compression=zipfile.ZIP_DEFLATED
    ) as zout:
        for info in zin.infolist():
            data = zin.read(info.filename)
            if info.filename.startswith("xl/worksheets/sheet") and info.filename.endswith(".xml"):
                txt = data.decode("utf-8")
                txt = re.sub(r"<sheetProtection[^>]*/>", "", txt)
                txt = re.sub(
                    r"<sheetProtection[^>]*>.*?</sheetProtection>", "", txt, flags=re.S
                )
                data = txt.encode("utf-8")
            zout.writestr(info, data)
    tmp.replace(xlsx)


def update_guia(wb) -> None:
    try:
        ws = wb.Worksheets("GUIA")
    except Exception:
        return
    # Append sync section at end
    last = ws.Cells(ws.Rows.Count, 1).End(-4162).Row  # xlUp
    start = last + 2
    lines = [
        "SINCRONIZACION CON LA APP (certificados y patrones)",
        "- Al abrir el archivo, Power Query refresca historial AGF/AGFT, clientes y patrones.",
        "- En CALCULOS captura: D4=AGF (o AGFT)  E4=numero  F4=año  -> ej. AGF | 52 | 26",
        "- Con eso se llenan solo: cliente, domicilio, contacto, instrumento, fechas y tecnico.",
        "- Boton Actualizar: fuerza el refresco si la red fallo al abrir.",
        "- Boton Guardar: exporta copia del certificado con nombre automatico.",
        "- Respaldo offline: carpeta 'Actualizar masters' -> Actualizar master Dinamometro.bat",
        "- Los certificados/vigencias de patrones se toman de BD_Patrones (app).",
        "- Unidad de trabajo (J10), lecturas e incertidumbres NO las toca la sincronizacion.",
    ]
    for i, line in enumerate(lines):
        ws.Range(f"A{start + i}").Value = line
        if i == 0:
            ws.Range(f"A{start + i}").Font.Bold = True


def main() -> int:
    source = TARGET if TARGET.exists() else SOURCE
    if not source.exists():
        print(f"No existe {SOURCE} ni {TARGET}")
        return 1

    backup = source.with_name(
        f"{source.stem}_backup_setup_{datetime.now():%Y%m%d_%H%M%S}{source.suffix}"
    )
    shutil.copy2(source, backup)
    print(f"Respaldo: {backup.name}")

    # Si es xlsx, quitar proteccion XML por si acaso
    work = Path(str(backup).replace(backup.suffix, f"_work{backup.suffix}"))
    shutil.copy2(source, work)
    if work.suffix.lower() == ".xlsx":
        strip_sheet_protection(work)

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
            raise RuntimeError("Excel abrió el archivo como solo lectura. Ciérralo e intenta otra vez.")
        try:
            wb.Queries.FastCombine = True
        except Exception:
            pass

        calc = wb.Worksheets("CALCULOS")
        portada = wb.Worksheets("PORTADA")
        for sheet_name in ("CALCULOS", "PORTADA", "PATRONES", "RESULTADOS", "GUIA", "CMC"):
            try:
                wb.Worksheets(sheet_name).Unprotect(Password=PASSWORD)
            except Exception:
                try:
                    wb.Worksheets(sheet_name).Unprotect()
                except Exception:
                    pass

        query_defs = (
            ("AG_API_Historial_Fuerza", M_HISTORIAL, HIST_SHEET, "AG_Historial"),
            ("AG_API_Clientes_Fuerza", M_CLIENTES, CLIENTES_SHEET, "AG_Clientes"),
            ("AG_API_Patrones_Fuerza", M_PATRONES, PATRONES_SHEET, "AG_Patrones"),
        )
        print("Creando consultas Power Query…")
        for query_name, _, _, _ in query_defs:
            delete_query_if_exists(wb, query_name)
            delete_connection_if_exists(wb, f"Query - {query_name}")
        for query_name, formula, sheet_name, table_name in query_defs:
            print(f"  {query_name} -> {sheet_name}")
            wb.Queries.Add(query_name, formula)
            ws = ensure_sheet(wb, sheet_name)
            load_query_to_sheet(wb, query_name, ws, table_name)

        print("Cableando CALCULOS al historial…")
        for ref in ("C4", "E4", "A4"):
            try:
                if calc.Range(ref).MergeCells:
                    calc.Range(ref).MergeArea.UnMerge()
            except Exception:
                pass

        calc.Range("A4").Value = "No. de Certificado:"
        calc.Range("C4").Value = ""
        calc.Range("D4").Value = "AGF"
        calc.Range("E4").Value = 1
        calc.Range("F4").Value = 26
        for ref in ("D4", "E4", "F4"):
            calc.Range(ref).Locked = False
            calc.Range(ref).Interior.Color = rgb(255, 242, 204)
        try:
            calc.Range("D4").Validation.Delete()
        except Exception:
            pass
        calc.Range("D4").Validation.Add(
            Type=3, AlertStyle=1, Operator=1, Formula1="AGF,AGFT"
        )
        calc.Range("D4").Validation.IgnoreBlank = True
        calc.Range("D4").Validation.InCellDropdown = True

        for addr, formula in CALC_FORMULAS.items():
            rng = calc.Range(addr)
            if formula is None:
                try:
                    rng.MergeArea.ClearContents()
                except Exception:
                    rng.ClearContents()
            else:
                rng.Formula = formula

        # Aprobó permanece manual (Calidad); no lo pisa el historial
        calc.Range("L17").Value = "Viridiana Moreno"
        calc.Range("L17").Locked = False
        try:
            calc.Range("K17").Validation.Delete()
        except Exception:
            pass
        calc.Range("K17").Locked = True

        calc.Range("S4").Font.Size = 8
        calc.Range("S4").Font.Color = rgb(150, 150, 150)

        try:
            calc.Range("B5").Validation.Delete()
        except Exception:
            pass

        portada.Range("J9").Formula = F_CERT_PORTADA

        n_wired = wire_patron_blocks(wb)
        print(f"Bloques de patrones enlazados a BD_Patrones: {n_wired}")

        print("Instalando macros y botones…")
        try:
            set_module(wb.VBProject, "ModuloAG_FuerzaUI", VBA_CODE)
        except Exception as exc:
            raise RuntimeError(
                "Excel bloqueó el acceso al proyecto VBA. Activa: Archivo > Opciones > "
                "Centro de confianza > Configuración > Configuración de macros > "
                "Confiar en el acceso al modelo de objetos VBA."
            ) from exc

        old_buttons = [
            str(calc.Shapes(i).Name)
            for i in range(1, calc.Shapes.Count + 1)
            if str(calc.Shapes(i).Name).startswith("btn_")
        ]
        for name in old_buttons:
            calc.Shapes(name).Delete()

        buttons = (
            ("Guardar", "GuardarCertificadoExcel", 92, rgb(37, 99, 235)),
            ("Actualizar", "RecalcularCertificado", 88, rgb(217, 119, 6)),
            ("Ir a Portada", "IrAPortada", 88, rgb(71, 85, 105)),
        )
        left = float(calc.Range("R1").Left) + 6
        top = 4.0
        gap = 5.0
        for caption, macro, width, color in buttons:
            add_button(calc, left, top, width, caption, macro, color)
            left += width + gap
        print("  Botones: Guardar, Actualizar, Ir a Portada")

        update_guia(wb)

        for sheet_name in (HIST_SHEET, CLIENTES_SHEET, PATRONES_SHEET):
            wb.Worksheets(sheet_name).Visible = XL_VERY_HIDDEN
        print("Hojas muy ocultas: obtenerDatosExcel, BD_Clientes, BD_Patrones")

        try:
            wb.ForceFullCalculation = False
            wb.FullCalculationOnLoad = True
        except Exception:
            pass
        excel.CalculateUntilAsyncQueriesDone()
        excel.Calculate()
        time.sleep(1)

        calc.Protect(Password=PASSWORD, DrawingObjects=False, Contents=True, Scenarios=True)
        portada.Protect(Password=PASSWORD, DrawingObjects=False, Contents=True, Scenarios=True)
        wb.Worksheets("PATRONES").Protect(
            Password=PASSWORD, DrawingObjects=False, Contents=True, Scenarios=True
        )
        try:
            wb.Worksheets("RESULTADOS").Protect(
                Password=PASSWORD, DrawingObjects=False, Contents=True, Scenarios=True
            )
        except Exception:
            pass

        wb.SaveAs(str(TARGET.resolve()), FileFormat=XL_XLSM)
        print(f"Guardado: {TARGET.name}")

        if not bool(wb.HasVBProject):
            raise RuntimeError("El archivo se guardó sin proyecto VBA.")
        found = {
            str(calc.Shapes(i).Name)
            for i in range(1, calc.Shapes.Count + 1)
            if str(calc.Shapes(i).Name).startswith("btn_")
        }
        if len(found) != 3:
            raise RuntimeError(f"Se esperaban 3 botones y hay {len(found)}.")

        muestra = [
            ("Certificado", "PORTADA J9", portada.Range("J9").Value),
            ("Cliente", "CALCULOS B5", calc.Range("B5").Value),
            ("Instrumento", "CALCULOS B9", calc.Range("B9").Value),
            ("No. Control", "CALCULOS F9", calc.Range("F9").Value),
            ("Calibró", "CALCULOS K17", calc.Range("K17").Value),
            ("Aprobó", "CALCULOS L17", calc.Range("L17").Value),
            ("Queries", "count", wb.Queries.Count),
        ]
        for etiqueta, origen, valor in muestra:
            print(f"  {etiqueta} ({origen}): {valor}")

        wb.Close(SaveChanges=True)
        wb = None

        # Retirar xlsx unificado si el xlsm quedó bien (dejar respaldo)
        if SOURCE.exists() and TARGET.exists():
            SOURCE.unlink()
            print(f"Retirado el .xlsx: {SOURCE.name} (respaldo: {backup.name})")
        print("LISTO.")
        return 0
    except Exception as exc:
        print(f"ERROR: {exc}")
        import traceback
        traceback.print_exc()
        print(f"Respaldo intacto: {backup}")
        return 1
    finally:
        if wb is not None:
            try:
                wb.Close(SaveChanges=False)
            except Exception:
                pass
        excel.Quit()
        pythoncom.CoUninitialize()
        if work.exists() and work != TARGET:
            try:
                work.unlink()
            except Exception:
                pass


if __name__ == "__main__":
    raise SystemExit(main())
