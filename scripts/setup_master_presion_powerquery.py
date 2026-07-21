#!/usr/bin/env python3
"""
Engancha Power Query al 100 en Formato master auto Presion.xlsm:
- Consulta AG_API_Historial → tabla AG_Historial (hojas de trabajo AGP)
- Consulta AG_API_Clientes  → hoja BD_Clientes
- Actualizar al abrir el archivo

Requisito: Excel instalado, archivo cerrado.
"""

from __future__ import annotations

import sys
import time
from pathlib import Path

try:
    import win32com.client
    import pythoncom
except ImportError:
    print("Instala pywin32: pip install pywin32")
    sys.exit(1)

MASTER = Path(r"C:\Users\AG\Desktop\FORMATOS AG\Formato master auto Presion.xlsm")
OUT = Path(r"C:\Users\AG\Desktop\FORMATOS AG\Formato master auto Presion.xlsm")

API_HIST = (
    "https://us-central1-agg1-b7f40.cloudfunctions.net/obtenerDatosExcel"
    "?key=TU_CLAVE_SECRETA_AG_APP_2026&prefijo=AGP&formato=tabla"
)
API_CLI = (
    "https://us-central1-agg1-b7f40.cloudfunctions.net/obtenerDatosExcel"
    "?key=TU_CLAVE_SECRETA_AG_APP_2026&formato=clientes"
)

M_HISTORIAL = f'''let
    Url = "{API_HIST}",
    Fuente = Json.Document(Web.Contents(Url)),
    ATabla = Table.FromList(Fuente, Splitter.SplitByNothing(), null, null, ExtraValues.Error),
    Expandir = Table.ExpandRecordColumn(
        ATabla,
        "Column1",
        {{"Name", "certificado", "cliente", "equipo", "marca", "modelo", "serie", "id", "fecha", "tecnico", "lugarCalibracion", "frecuenciaCalibracion"}},
        {{"Name", "certificado", "cliente", "equipo", "marca", "modelo", "serie", "id", "fecha", "tecnico", "lugarCalibracion", "frecuenciaCalibracion"}}
    )
in
    Expandir'''

M_CLIENTES = f'''let
    Url = "{API_CLI}",
    Fuente = Json.Document(Web.Contents(Url)),
    ATabla = Table.FromList(Fuente, Splitter.SplitByNothing(), null, null, ExtraValues.Error),
    Expandir = Table.ExpandRecordColumn(
        ATabla,
        "Column1",
        {{"Nombre", "Domicilio", "Contacto", "Correo", "Telefono"}},
        {{"Nombre", "Domicilio", "Contacto", "Correo", "Telefono"}}
    )
in
    Expandir'''

HIST_SHEET = "obtenerDatosExcel_key=TU_CLAVE_"
CLIENTES_SHEET = "BD_Clientes"


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
        ws = wb.Worksheets.Add()
        ws.Name = name[:31]
        return ws


def clear_sheet(ws) -> None:
    ws.Cells.Clear()
    # quitar ListObjects viejos
    while ws.ListObjects.Count > 0:
        try:
            ws.ListObjects(1).Delete()
        except Exception:
            break


def load_query_to_sheet(wb, excel, query_name: str, ws, table_name: str) -> None:
    clear_sheet(ws)
    conn_name = f"Query - {query_name}"
    delete_connection_if_exists(wb, conn_name)

    # Conexión Mashup → hoja (patrón Excel 365 / 2021)
    source = (
        f'OLEDB;Provider=Microsoft.Mashup.OleDb.1;'
        f'Data Source=$Workbook$;Location="{query_name}";Extended Properties=""'
    )
    lo = ws.ListObjects.Add(
        0,  # xlSrcQuery / SourceType
        source,
        False,  # LinkSource
        1,  # xlYes headers
        ws.Range("A1"),
    )
    qt = lo.QueryTable
    qt.CommandType = 2  # xlCmdSql
    qt.CommandText = [f"SELECT * FROM [{query_name}]"]
    qt.BackgroundQuery = False
    qt.Refresh(False)

    # Nombrar tabla como espera el master (VLOOKUP AG_Historial)
    try:
        lo.Name = table_name
        lo.DisplayName = table_name
    except Exception as e:
        print(f"  Aviso al renombrar tabla a {table_name}: {e}")

    # Refresco al abrir / con Refresh All
    try:
        conn = wb.Connections.Item(conn_name)
        conn.RefreshWithRefreshAll = True
        try:
            conn.OLEDBConnection.BackgroundQuery = False
            conn.OLEDBConnection.RefreshOnFileOpen = True
        except Exception:
            pass
    except Exception as e:
        print(f"  Aviso conexion {conn_name}: {e}")


def add_workbook_open_refresh(wb) -> None:
    """VBA: al abrir, RefreshAll (por si el usuario no tiene auto-refresh de PQ)."""
    vba = r'''
Private Sub Workbook_Open()
    On Error Resume Next
    Application.ScreenUpdating = False
    ThisWorkbook.RefreshAll
    Application.ScreenUpdating = True
    On Error GoTo 0
End Sub
'''
    try:
        vbproj = wb.VBProject
    except Exception as e:
        print(f"  No se pudo editar VBA (confianza en macros): {e}")
        print("  Activa: Archivo > Opciones > Centro de confianza > ... acceso al modelo de objetos VBA")
        return

    # ThisWorkbook module
    try:
        component = None
        for comp in vbproj.VBComponents:
            if comp.Type == 100:  # vbext_ct_Document ThisWorkbook
                if comp.Name == "ThisWorkbook":
                    component = comp
                    break
        if component is None:
            component = vbproj.VBComponents.Item("ThisWorkbook")

        code = component.CodeModule
        # Quitar Workbook_Open previo si existe
        try:
            start = code.ProcStartLine("Workbook_Open", 0)  # vbext_pk_Proc
            count = code.ProcCountLines("Workbook_Open", 0)
            code.DeleteLines(start, count)
        except Exception:
            pass
        code.AddFromString(vba)
        print("  Workbook_Open -> RefreshAll OK")
    except Exception as e:
        print(f"  Aviso VBA Workbook_Open: {e}")


def main() -> int:
    if not MASTER.exists():
        print(f"No existe: {MASTER}")
        return 1

    pythoncom.CoInitialize()
    excel = win32com.client.DispatchEx("Excel.Application")
    excel.Visible = True  # por si Excel pide permiso de privacidad/web la 1a vez
    excel.DisplayAlerts = False
    excel.AskToUpdateLinks = False

    # Ignorar niveles de privacidad en esta sesión (evita bloqueo Web+hoja)
    try:
        excel.Application.AutomationSecurity = 1  # msoAutomationSecurityLow
    except Exception:
        pass

    print(f"Abriendo: {MASTER}")
    wb = excel.Workbooks.Open(str(MASTER.resolve()), UpdateLinks=0, ReadOnly=False)

    try:
        # Preferencia de privacidad del libro (Excel 2016+)
        try:
            wb.Queries.FastCombine = True  # combina sin avisar privacidad
        except Exception:
            pass

        print("Creando consultas Power Query...")
        for name in ("AG_API_Historial", "AG_API_Clientes"):
            delete_query_if_exists(wb, name)
            delete_connection_if_exists(wb, f"Query - {name}")

        wb.Queries.Add("AG_API_Historial", M_HISTORIAL)
        wb.Queries.Add("AG_API_Clientes", M_CLIENTES)

        hist_ws = ensure_sheet(wb, HIST_SHEET)
        cli_ws = ensure_sheet(wb, CLIENTES_SHEET)

        print("Cargando historial AGP en hoja + tabla AG_Historial...")
        load_query_to_sheet(wb, excel, "AG_API_Historial", hist_ws, "AG_Historial")

        print("Cargando clientes en BD_Clientes...")
        load_query_to_sheet(wb, excel, "AG_API_Clientes", cli_ws, "BD_Clientes_API")
        # Mantener nombre de hoja BD_Clientes; VLOOKUP usa BD_Clientes!A:H (rango), no hace falta tabla

        print("Configurando RefreshAll al abrir...")
        add_workbook_open_refresh(wb)

        # Forzar un RefreshAll final
        try:
            wb.RefreshAll()
            excel.CalculateUntilAsyncQueriesDone()
            time.sleep(2)
        except Exception as e:
            print(f"  Aviso RefreshAll: {e}")

        dest = str(OUT.resolve())
        print(f"Guardando: {dest}")
        wb.Save()
        print("LISTO: Power Query enganchado.")
        print("Uso: abre el Excel (habilita macros/contenido) -> espera refresco -> D4=AGP E4=num F4=anio")
        return 0
    except Exception as e:
        print(f"ERROR: {e}")
        import traceback
        traceback.print_exc()
        return 1
    finally:
        try:
            wb.Close(SaveChanges=True)
        except Exception:
            pass
        excel.Quit()
        pythoncom.CoUninitialize()


if __name__ == "__main__":
    raise SystemExit(main())
