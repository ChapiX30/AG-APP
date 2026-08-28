# -*- coding: utf-8 -*-
"""Parche: carga Power Query a BD_Clientes / BD_Patrones / historial en Angle meter."""
from __future__ import annotations

import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace", line_buffering=True)

import pythoncom
import win32com.client

PATH = Path(r"C:\Users\AG\Desktop\FORMATOS AG\Formato Angle meter.xlsm")
PASSWORD = "AG-Calidad-2026"


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


def delete_connection_if_exists(wb, name: str) -> None:
    try:
        wb.Connections.Item(name).Delete()
    except Exception:
        pass


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
    query.RefreshOnFileOpen = False
    query.RefreshPeriod = 0
    query.Refresh(False)
    table.Name = table_name
    table.DisplayName = table_name
    try:
        connection = wb.Connections.Item(conn_name)
        connection.RefreshWithRefreshAll = False
        connection.OLEDBConnection.RefreshOnFileOpen = False
    except Exception:
        pass


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
        wb = excel.Workbooks.Open(str(PATH.resolve()), UpdateLinks=0, ReadOnly=False)
        for name, qn, tn in (
            ("obtenerDatosExcel", "AG_API_Historial_Angle", "TablaHistorialAngle"),
            ("BD_Clientes", "AG_API_Clientes_Angle", "TablaClientesAngle"),
            ("BD_Patrones", "AG_API_Patrones_Angle", "TablaPatronesAngle"),
        ):
            ws = wb.Worksheets(name)
            try_unprotect(ws)
            print("Cargando", name, "…")
            load_query_to_sheet(wb, qn, ws, tn)
            last = ws.Cells(ws.Rows.Count, 1).End(-4162).Row
            print("  filas:", last)

        # Historial como valores para AutoSync incremental
        ws_hist = wb.Worksheets("obtenerDatosExcel")
        while ws_hist.ListObjects.Count > 0:
            ws_hist.ListObjects(1).Unlist

        for name in ("obtenerDatosExcel", "BD_Clientes", "BD_Patrones", "Calculos"):
            try:
                ws = wb.Worksheets(name)
                try_unprotect(ws)
                ws.Visible = 2 if name != "Calculos" else -1  # very hidden / visible
                if name != "Calculos":
                    ws.Protect(Password=PASSWORD, DrawingObjects=False, Contents=True, Scenarios=True)
            except Exception as e:
                print("aviso protect", name, e)

        # Dejar historial very hidden
        try:
            wb.Worksheets("obtenerDatosExcel").Visible = 2
            wb.Worksheets("BD_Clientes").Visible = 2
            wb.Worksheets("BD_Patrones").Visible = 2
        except Exception:
            pass

        wb.Save()
        wb.Close(True)
        print("OK")
        return 0
    except Exception as e:
        print("ERROR:", e)
        import traceback
        traceback.print_exc()
        return 1
    finally:
        excel.Quit()
        pythoncom.CoUninitialize()


if __name__ == "__main__":
    raise SystemExit(main())
