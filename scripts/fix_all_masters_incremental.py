# -*- coding: utf-8 -*-
"""
Checada a fondo + correcciones en todos los masters AG:

1) Sync incremental (como Presión): al abrir / Actualizar solo agrega
   certificados que aún no están (ej. tienes 1-10 → solo sube 11-20).
2) Desactiva RefreshOnFileOpen / RefreshAll completo al abrir (abre rápido).
3) Centra y alinea botones en una sola fila.
4) Limpia número de certificado de ejemplo y deja unidad por defecto.
5) No toca lecturas ni bloques de incertidumbre/CMC.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace", line_buffering=True)

import pythoncom
import win32com.client

FOLDER = Path(r"C:\Users\AG\Desktop\FORMATOS AG")
PASSWORD = "AG-Calidad-2026"
API_KEY = "TU_CLAVE_SECRETA_AG_APP_2026"
API_BASE = (
    "https://us-central1-agg1-b7f40.cloudfunctions.net/obtenerDatosExcel"
    f"?key={API_KEY}"
)

# Orden visual de botones
BTN_ORDER = (
    "btn_GuardarCertificadoExcel",
    "btn_CambiarTipoInstrumento",
    "btn_CambiarUnidadIndicador",
    "btn_CambiarUnidadMicrometro",
    "btn_CambiarUnidadPinGage",
    "btn_CambiarUnidadReglaFlex",
    "btn_CambiarUnidadVernier",
    "btn_CambiarFormatoFecha",
    "btn_ConfigurarListaUnidades",
    "btn_RecalcularCertificado",
    "btn_IrAPortada",
)

MASTERS = [
    {
        "file": "Formato Básculas y Balanzas.xlsm",
        "calc": "CALCULOS",
        "hist": "obtenerDatosExcel",
        "prefixes": ["AGM"],
        "ui_module": "ModuloAG_MasaUI",
        "clear_e4": True,
        "unit_cell": "J10",
        "unit_default": "kg",
        "year_cell": "F4",
        "year_default": 26,
        "prefix_cell": "D4",
        "prefix_default": "AGM",
    },
    {
        "file": "Formato Dinamometro Unificado.xlsm",
        "calc": "CALCULOS",
        "hist": "obtenerDatosExcel",
        "prefixes": ["AGF", "AGFT"],
        "ui_module": "ModuloAG_FuerzaUI",
        "clear_e4": True,
        "unit_cell": "J10",
        "unit_default": "kg",
        "year_cell": "F4",
        "year_default": 26,
        "prefix_cell": "D4",
        "prefix_default": "AGF",
    },
    {
        "file": "Formato Indicador.xlsm",
        "calc": "CALCULOS",
        "hist": "obtenerDatosExcel",
        "prefixes": ["AGD"],
        "ui_module": "ModuloAG_IndicadorUI",
        "clear_e4": True,
        "unit_cell": "J10",
        "unit_default": "mm",
        "year_cell": "F4",
        "year_default": 26,
        "prefix_cell": "D4",
        "prefix_default": "AGD",
    },
    {
        "file": "Formato Micrometro Exteriores.xlsm",
        "calc": "Calculos",
        "hist": "obtenerDatosExcel",
        "prefixes": ["AGD"],
        "ui_module": "ModuloAG_MicrometroUI",
        "clear_e4": True,
        "unit_cell": "J11",
        "unit_default": "mm",
        "year_cell": "F4",
        "year_default": 26,
        "prefix_cell": "D4",
        "prefix_default": "AGD",
    },
    {
        "file": "Formato Multimetro.xlsm",
        "calc": "Calculos",
        "hist": "obtenerDatosExcel",
        "prefixes": ["AGEL"],
        "ui_module": "ModuloAG_MultiUI",
        "clear_e4": True,
        "unit_cell": None,
        "unit_default": None,
        "year_cell": "F4",
        "year_default": 26,
        "prefix_cell": "D4",
        "prefix_default": "AGEL",
    },
    {
        "file": "Formato Pin Gage.xlsm",
        "calc": "Calculos",
        "hist": "obtenerDatosExcel",
        "prefixes": ["AGD"],
        "ui_module": "ModuloAG_PinGageUI",
        "clear_e4": True,
        "unit_cell": "J10",
        "unit_default": "mm",
        "year_cell": "F4",
        "year_default": 26,
        "prefix_cell": "D4",
        "prefix_default": "AGD",
    },
    {
        "file": "Formato Regla Flex.xlsm",
        "calc": "Calculos",
        "hist": "obtenerDatosExcel",
        "prefixes": ["AGD"],
        "ui_module": "ModuloAG_ReglaFlexUI",
        "clear_e4": True,
        "unit_cell": "J10",
        "unit_default": "mm",
        "year_cell": "F4",
        "year_default": 26,
        "prefix_cell": "D4",
        "prefix_default": "AGD",
    },
    {
        "file": "Formato Torque.xlsm",
        "calc": "Toma Datos",
        "hist": "obtenerDatosExcel",
        "prefixes": ["AGPT"],
        "ui_module": "ModuloAG_Torque_UI",
        "clear_e4": True,
        "e4_cell": "E2",
        "unit_cell": None,
        "unit_default": None,
        "year_cell": "F2",
        "year_default": 26,
        "prefix_cell": "D2",
        "prefix_default": "AGPT",
    },
    {
        "file": "Formato Vernier.xlsm",
        "calc": "Calculos",
        "hist": "obtenerDatosExcel",
        "prefixes": ["AGD"],
        "ui_module": "ModuloAG_VernierUI",
        "clear_e4": True,
        "unit_cell": "J12",
        "unit_default": "mm",
        "year_cell": "F4",
        "year_default": 26,
        "prefix_cell": "D4",
        "prefix_default": "AGD",
    },
    {
        "file": "Formato Termohigrometro.xlsm",
        "calc": "Calculos",
        "hist": "obtenerDatosExcel",
        "prefixes": ["AGH"],
        "ui_module": "ModuloAG_TermoHUI",
        "clear_e4": True,
        "unit_cell": None,
        "unit_default": None,
        "year_cell": "F4",
        "year_default": 26,
        "prefix_cell": "D4",
        "prefix_default": "AGH",
    },
    {
        "file": "Formato Termometro IR.xlsm",
        "calc": "Muestreo",
        "hist": "obtenerDatosExcel",
        "prefixes": ["AGT"],
        "ui_module": "ModuloAG_TermoIRUI",
        "clear_e4": True,
        "unit_cell": "I10",
        "unit_default": "°C",
        "year_cell": "F4",
        "year_default": 26,
        "prefix_cell": "D4",
        "prefix_default": "AGT",
    },
    {
        "file": "Formato Hornos y Muflas.xlsm",
        "calc": "Calculos",
        "hist": "obtenerDatosExcel",
        "prefixes": ["AGT"],
        "ui_module": "ModuloAG_HornosUI",
        "clear_e4": True,
        "unit_cell": "J10",
        "unit_default": "°C",
        "year_cell": "F4",
        "year_default": 26,
        "prefix_cell": "D4",
        "prefix_default": "AGT",
    },
    {
        "file": "Formato Tiempo.xlsm",
        "calc": "Calculos",
        "hist": "obtenerDatosExcel",
        "prefixes": ["AGTI"],
        "ui_module": "ModuloAG_TiempoUI",
        "clear_e4": True,
        "e4_cell": "H9",
        "unit_cell": "N17",
        "unit_default": "s",
        "year_cell": "I9",
        "year_default": 26,
        "prefix_cell": "G9",
        "prefix_default": "AGTI",
        "number_cell": "H9",
    },
    {
        "file": "Formato master Presion.xlsm",
        "calc": "Calculos",
        "hist": "Historial",
        "prefixes": ["AGP"],
        "ui_module": "AG_Macros",
        "autosync_exists": True,
        "clear_e4": True,
        "unit_cell": "J10",
        "unit_default": "psi",
        "year_cell": "F4",
        "year_default": 26,
        "prefix_cell": "D4",
        "prefix_default": "AGP",
    },
]


def rgb(r: int, g: int, b: int) -> int:
    return r + g * 256 + b * 65536


def try_unprotect(ws) -> None:
    for pwd in (PASSWORD, ""):
        try:
            if pwd:
                ws.Unprotect(Password=pwd)
            else:
                ws.Unprotect()
            return
        except Exception:
            continue


def try_protect(ws) -> None:
    try:
        ws.Protect(
            Password=PASSWORD,
            DrawingObjects=False,
            Contents=True,
            Scenarios=True,
        )
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
        component = vb_project.VBComponents.Add(1)  # vbext_ct_StdModule
        component.Name = name
    code = component.CodeModule
    if code.CountOfLines:
        code.DeleteLines(1, code.CountOfLines)
    code.AddFromString(code_text)


def get_thisworkbook_code(vb_project):
    for index in range(1, vb_project.VBComponents.Count + 1):
        candidate = vb_project.VBComponents.Item(index)
        if candidate.Type == 100:  # vbext_ct_Document ThisWorkbook often
            if str(candidate.Name) == "ThisWorkbook":
                return candidate.CodeModule
    # fallback by name
    for index in range(1, vb_project.VBComponents.Count + 1):
        candidate = vb_project.VBComponents.Item(index)
        if str(candidate.Name) == "ThisWorkbook":
            return candidate.CodeModule
    raise RuntimeError("No ThisWorkbook")


def replace_or_add_proc(code_module, proc_name: str, new_proc: str) -> None:
    """Reemplaza un Sub/Function completo o lo agrega al final."""
    try:
        # vbext_pk_Proc = 0
        start = code_module.ProcStartLine(proc_name, 0)
        count = code_module.ProcCountLines(proc_name, 0)
        code_module.DeleteLines(start, count)
        code_module.InsertLines(start, new_proc.strip("\n") + "\n")
    except Exception:
        if code_module.CountOfLines:
            code_module.InsertLines(code_module.CountOfLines + 1, "\n" + new_proc.strip("\n") + "\n")
        else:
            code_module.AddFromString(new_proc.strip("\n") + "\n")


def patch_recalcular_in_module(vb_project, module_name: str) -> bool:
    """Cambia RecalcularCertificado para sync incremental en vez de RefreshAll."""
    component = None
    for index in range(1, vb_project.VBComponents.Count + 1):
        candidate = vb_project.VBComponents.Item(index)
        if str(candidate.Name) == module_name:
            component = candidate
            break
    if component is None:
        return False
    code = component.CodeModule
    if code.CountOfLines == 0:
        return False
    txt = code.Lines(1, code.CountOfLines)
    if "Sub RecalcularCertificado" in txt:
        block = txt.split("Sub RecalcularCertificado", 1)[1].split("End Sub", 1)[0]
        if "ActualizarHistorialDesdeApp" in block and "RefreshAll" not in block:
            return True

    new_recalc = '''
Sub RecalcularCertificado()
    On Error GoTo ErrorHandler
    Application.ScreenUpdating = False
    ' Solo certificados nuevos (no re-descarga lo que ya tienes)
    Call AG_AutoSync.ActualizarHistorialDesdeApp(False)
    On Error Resume Next
    ' Clientes/patrones: refresco puntual si hay consultas PQ
    Dim i As Long
    For i = 1 To ThisWorkbook.Connections.Count
        Dim nm As String
        nm = UCase$(CStr(ThisWorkbook.Connections.Item(i).Name))
        If InStr(1, nm, "CLIENTE") > 0 Or InStr(1, nm, "PATRON") > 0 Then
            ThisWorkbook.Connections.Item(i).Refresh
        End If
    Next i
    Application.CalculateUntilAsyncQueriesDone
    On Error GoTo ErrorHandler
    Application.Calculate
    Application.ScreenUpdating = True
    MsgBox "Historial (solo nuevos) + cálculos actualizados.", vbInformation, "Actualizado"
    Exit Sub
ErrorHandler:
    Application.ScreenUpdating = True
    MsgBox "No se pudo actualizar: " & Err.Description, vbExclamation, "Actualizar"
End Sub
'''
    replace_or_add_proc(code, "RecalcularCertificado", new_recalc)
    return True


def build_autosync_vba(hist_sheet: str, prefixes: list[str]) -> str:
    """VBA sync incremental al estilo Presión, con columnas 17 y varios prefijos."""
    # anio se agrega en runtime; aquí solo prefijo
    urls = [f"{API_BASE}&prefijo={p}&formato=csv" for p in prefixes]
    urls_vba = "\n".join(
        f'    urls({i}) = "{u}&anio=" & anioActual' for i, u in enumerate(urls)
    )

    return f'''
Option Explicit

Private Const CLAVE_HOJAS As String = "{PASSWORD}"
Private Const HIST_SHEET As String = "{hist_sheet}"
Private Const MAX_COL As Long = 16 ' A..Q (0..16) = 17 columnas

Public Function ActualizarHistorialDesdeApp(Optional ByVal mostrarResultado As Boolean = False) As Boolean
    Dim wsHist As Worksheet
    Dim existentes As Object
    Dim anioActual As String
    Dim i As Long, u As Long
    Dim ultimaFila As Long
    Dim agregados As Long
    Dim revisados As Long
    Dim actualizados As Long
    Dim cert As String
    Dim filaNueva As Long
    Dim urls(0 To {len(urls) - 1}) As String
    Dim textoCsv As String
    Dim lineas As Variant
    Dim campos As Variant
    Dim columna As Long
    Dim esEncabezado As Boolean
    Dim maxCampo As Long
    Dim filaExistente As Long

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
            If existentes.Exists(UCase$(cert)) Then
                filaExistente = existentes(UCase$(cert))
                maxCampo = UBound(campos)
                If maxCampo > MAX_COL Then maxCampo = MAX_COL
                If maxCampo >= 2 Then wsHist.Cells(filaExistente, 3).Value2 = campos(2)
                If maxCampo >= 13 Then
                    For columna = 13 To maxCampo
                        wsHist.Cells(filaExistente, columna + 1).Value2 = campos(columna)
                    Next columna
                    actualizados = actualizados + 1
                End If
                GoTo SiguienteLinea
            End If

            filaNueva = ultimaFila + 1
            maxCampo = UBound(campos)
            If maxCampo > MAX_COL Then maxCampo = MAX_COL
            For columna = 0 To maxCampo
                wsHist.Cells(filaNueva, columna + 1).Value2 = campos(columna)
            Next columna
            ' Si el CSV viejo trae solo 13 cols, completar N:Q desde BD_Clientes
            If maxCampo < 13 Then
                Call CompletarClienteDesdeBD(wsHist, filaNueva)
            End If
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
    Application.StatusBar = "Sync OK: +" & agregados & " nuevos (revisados " & revisados & " del " & anioActual & ")."
    If mostrarResultado Then
        MsgBox "Sincronización lista." & vbCrLf & vbCrLf & _
            "Certificados nuevos agregados: " & agregados & vbCrLf & _
            "Revisados del año " & anioActual & ": " & revisados & vbCrLf & _
            "Ya tenías: " & (existentes.Count - agregados) & vbCrLf & _
            "Datos de cliente actualizados: " & actualizados, _
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
        MsgBox "No se pudo actualizar el historial." & vbCrLf & _
            "Se conservaron los datos anteriores." & vbCrLf & vbCrLf & _
            Err.Description, vbExclamation, "Actualización AG"
    End If
    On Error GoTo 0

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
    On Error GoTo 0
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
    If http.Status <> 200 Then
        Err.Raise vbObjectError + 1267, , "Respuesta HTTP " & http.Status
    End If

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
        If AscW(Left$(DescargarTextoUtf8, 1)) = &HFEFF Then
            DescargarTextoUtf8 = Mid$(DescargarTextoUtf8, 2)
        End If
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
            If entreComillas And posicion < Len(linea) And _
                    Mid$(linea, posicion + 1, 1) = """" Then
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
    ' Recortar al último índice usado
    If columna < nCols Then ReDim Preserve resultado(0 To columna)
    SepararLineaCsv = resultado
End Function

Public Sub ActualizarHistorialManual()
    Call ActualizarHistorialDesdeApp(True)
End Sub
'''


WORKBOOK_OPEN = '''
Private Sub Workbook_Open()
    ' Abre rápido: NO hace RefreshAll.
    ' Solo agrega certificados NUEVOS del año en curso (ej. tenías 1-10 → solo 11-20).
    On Error Resume Next
    Application.StatusBar = "AG: buscando certificados nuevos..."
    Call AG_AutoSync.ActualizarHistorialDesdeApp(False)
    Application.StatusBar = False
    On Error GoTo 0
End Sub
'''


def disable_refresh_on_open(wb) -> int:
    n = 0
    for i in range(1, wb.Connections.Count + 1):
        conn = wb.Connections.Item(i)
        try:
            conn.RefreshWithRefreshAll = False
        except Exception:
            pass
        try:
            conn.OLEDBConnection.RefreshOnFileOpen = False
            conn.OLEDBConnection.BackgroundQuery = False
            n += 1
        except Exception:
            try:
                conn.ODBCConnection.RefreshOnFileOpen = False
                n += 1
            except Exception:
                pass
    return n


def unlink_historial_table(ws) -> None:
    """Convierte la tabla PQ a rango para poder hacer append VBA."""
    try:
        while ws.ListObjects.Count > 0:
            try:
                ws.ListObjects(1).Unlist()  # convierte a rango (rápido)
            except Exception:
                try:
                    ws.ListObjects(1).Unlink()
                except Exception:
                    break
    except Exception:
        pass


def align_buttons(ws) -> None:
    """Alinea botones btn_* en una sola fila, texto centrado."""
    buttons = []
    for i in range(1, ws.Shapes.Count + 1):
        sh = ws.Shapes.Item(i)
        name = str(sh.Name)
        if not name.startswith("btn_"):
            continue
        buttons.append(sh)
    if not buttons:
        return

    def sort_key(sh):
        name = str(sh.Name)
        try:
            return BTN_ORDER.index(name)
        except ValueError:
            return 100 + int(sh.Left)

    buttons.sort(key=sort_key)

    # Ancla: cerca del bloque de certificado (columna L aprox) o el leftmost actual si es razonable
    try:
        anchor_left = float(ws.Range("L1").Left)
    except Exception:
        anchor_left = 500.0
    # Si los botones ya están agrupados a la derecha (hojas muy anchas), conservar zona
    existing_lefts = [float(b.Left) for b in buttons]
    medianish = sorted(existing_lefts)[len(existing_lefts) // 2]
    if medianish > anchor_left + 400:
        start_left = min(existing_lefts)
    else:
        start_left = max(anchor_left, 420.0)

    top = 4.0
    gap = 6.0
    x = start_left
    for sh in buttons:
        w = max(float(sh.Width), 88.0)
        h = 26.0
        sh.Left = x
        sh.Top = top
        sh.Width = w
        sh.Height = h
        try:
            sh.TextFrame.HorizontalAlignment = -4108  # xlHAlignCenter
            sh.TextFrame.VerticalAlignment = -4108
        except Exception:
            try:
                sh.TextFrame2.TextRange.ParagraphFormat.Alignment = 2  # msoAlignCenter
            except Exception:
                pass
        x += w + gap


def clear_sample_cert(ws, cfg: dict) -> None:
    e4 = cfg.get("e4_cell", "E4")
    try:
        rng = ws.Range(e4)
        if rng.MergeCells:
            rng = rng.MergeArea.Cells(1, 1)
        if not rng.HasFormula:
            rng.Value = None
    except Exception:
        pass
    # prefijo / año
    for cell, val in (
        (cfg.get("prefix_cell"), cfg.get("prefix_default")),
        (cfg.get("year_cell"), cfg.get("year_default")),
    ):
        if not cell or val is None:
            continue
        try:
            r = ws.Range(cell)
            if r.MergeCells:
                r = r.MergeArea.Cells(1, 1)
            if not r.HasFormula:
                r.Value = val
        except Exception:
            pass
    ucell = cfg.get("unit_cell")
    udef = cfg.get("unit_default")
    if ucell and udef:
        try:
            r = ws.Range(ucell)
            if r.MergeCells:
                r = r.MergeArea.Cells(1, 1)
            if not r.HasFormula:
                r.Value = udef
        except Exception:
            pass


def find_file(name: str) -> Path | None:
    p = FOLDER / name
    if p.exists():
        return p
    # fuzzy for encoding issues
    key = name.lower().replace("á", "a").replace("é", "e")
    for f in FOLDER.glob("Formato*.xlsm"):
        if f.name.lower().replace("á", "a").replace("é", "e") == key:
            return f
    return None


def process_master(excel, cfg: dict) -> None:
    path = find_file(cfg["file"])
    if path is None:
        print(f"  SKIP no encontrado: {cfg['file']}")
        return
    print(f"\n== {path.name} ==")
    wb = excel.Workbooks.Open(str(path.resolve()), UpdateLinks=0, ReadOnly=False)
    if wb.ReadOnly:
        wb.Close(False)
        raise RuntimeError(f"Solo lectura: {path.name}")

    try:
        print("  abriendo hojas...")
        calc = wb.Worksheets(cfg["calc"])
        try_unprotect(calc)
        try:
            hist = wb.Worksheets(cfg["hist"])
            try_unprotect(hist)
            print("  desvinculando tabla historial...")
            unlink_historial_table(hist)
        except Exception as e:
            print(f"  aviso historial: {e}")

        print("  desactivando refresh al abrir...")
        n = disable_refresh_on_open(wb)
        print(f"  RefreshOnFileOpen desactivado en {n} conexiones")

        print("  escribiendo AG_AutoSync...")
        set_module(wb.VBProject, "AG_AutoSync", build_autosync_vba(cfg["hist"], cfg["prefixes"]))
        print("  AG_AutoSync OK")

        print("  Workbook_Open...")
        tw = get_thisworkbook_code(wb.VBProject)
        replace_or_add_proc(tw, "Workbook_Open", WORKBOOK_OPEN)
        print("  Workbook_Open incremental OK")

        if patch_recalcular_in_module(wb.VBProject, cfg["ui_module"]):
            print(f"  RecalcularCertificado -> incremental ({cfg['ui_module']})")
        else:
            print(f"  aviso: no se pudo parchear {cfg['ui_module']}")

        print("  alineando botones...")
        align_buttons(calc)
        print("  Botones alineados/centrados")

        if cfg.get("clear_e4"):
            clear_sample_cert(calc, cfg)
            print("  Certificado de ejemplo limpiado / unidad default")

        try_protect(calc)
        print("  guardando...")
        wb.Save()
        print("  Guardado OK")
    finally:
        wb.Close(SaveChanges=True)


def main() -> int:
    pythoncom.CoInitialize()
    excel = win32com.client.DispatchEx("Excel.Application")
    excel.Visible = False
    excel.DisplayAlerts = False
    excel.AskToUpdateLinks = False
    excel.EnableEvents = False
    try:
        excel.AutomationSecurity = 1  # msoAutomationSecurityLow — needed to edit VBA
    except Exception:
        pass

    errors = []
    for cfg in MASTERS:
        try:
            process_master(excel, cfg)
        except Exception as e:
            print(f"  ERROR: {e}")
            errors.append((cfg["file"], str(e)))

    excel.Quit()
    print("\n" + "=" * 60)
    if errors:
        print(f"Terminó con {len(errors)} error(es):")
        for f, e in errors:
            print(f"  - {f}: {e}")
        return 1
    print("Todos los masters actualizados.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
