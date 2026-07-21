#!/usr/bin/env python3
"""Reemplaza la fórmula Power Query del master Presión y deja refresh al abrir."""
from __future__ import annotations

import sys
import time

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

import pythoncom
import win32com.client

PATH = r"C:\Users\AG\Desktop\FORMATOS AG\Formato master auto Presion.xlsm"

API_HIST = (
    "https://us-central1-agg1-b7f40.cloudfunctions.net/obtenerDatosExcel"
    "?key=TU_CLAVE_SECRETA_AG_APP_2026&prefijo=AGP&formato=tabla"
)

M_HISTORIAL = f"""let
    Url = \"{API_HIST}\",
    Fuente = Json.Document(Web.Contents(Url)),
    ATabla = Table.FromList(Fuente, Splitter.SplitByNothing(), null, null, ExtraValues.Error),
    Expandir = Table.ExpandRecordColumn(
        ATabla,
        \"Column1\",
        {{\"Name\", \"certificado\", \"cliente\", \"equipo\", \"marca\", \"modelo\", \"serie\", \"id\", \"fecha\", \"tecnico\", \"lugarCalibracion\", \"frecuenciaCalibracion\", \"fechaRecepcion\"}},
        {{\"Name\", \"certificado\", \"cliente\", \"equipo\", \"marca\", \"modelo\", \"serie\", \"id\", \"fecha\", \"tecnico\", \"lugarCalibracion\", \"frecuenciaCalibracion\", \"fechaRecepcion\"}}
    )
in
    Expandir"""

VBA_OPEN = """
Private Sub Workbook_Open()
    On Error Resume Next
    Application.ScreenUpdating = False
    ThisWorkbook.RefreshAll
    DoEvents
    Application.ScreenUpdating = True
End Sub
"""


def main() -> int:
    pythoncom.CoInitialize()
    excel = win32com.client.DispatchEx("Excel.Application")
    excel.Visible = True
    excel.DisplayAlerts = False
    excel.AskToUpdateLinks = False

    wb = excel.Workbooks.Open(PATH, UpdateLinks=0)
    try:
        try:
            wb.Queries.FastCombine = True
        except Exception:
            pass

        if wb.Queries.Count < 1:
            print("No hay consultas. Creando AG_API_Historial...")
            wb.Queries.Add("AG_API_Historial", M_HISTORIAL)
            qname = "AG_API_Historial"
        else:
            q = wb.Queries.Item(1)
            qname = q.Name
            print(f"Actualizando formula de: {qname}")
            q.Formula = M_HISTORIAL

        # Conexiones: refresh al abrir
        for i in range(1, wb.Connections.Count + 1):
            c = wb.Connections.Item(i)
            print(f"Conexion: {c.Name}")
            try:
                c.RefreshWithRefreshAll = True
            except Exception:
                pass
            try:
                c.OLEDBConnection.BackgroundQuery = False
                c.OLEDBConnection.RefreshOnFileOpen = True
                print("  RefreshOnFileOpen=True")
            except Exception as e:
                print(f"  OLEDB props: {e}")

        # VBA Workbook_Open
        try:
            comp = wb.VBProject.VBComponents.Item("ThisWorkbook")
            code = comp.CodeModule
            try:
                start = code.ProcStartLine("Workbook_Open", 0)
                count = code.ProcCountLines("Workbook_Open", 0)
                code.DeleteLines(start, count)
            except Exception:
                pass
            code.AddFromString(VBA_OPEN)
            print("Workbook_Open RefreshAll OK")
        except Exception as e:
            print(f"VBA (opcional): {e}")

        print("Refrescando (puede pedir permiso de privacidad web la 1a vez)...")
        wb.RefreshAll()
        try:
            excel.CalculateUntilAsyncQueriesDone()
        except Exception:
            pass
        time.sleep(12)

        ws = wb.Worksheets("obtenerDatosExcel_key=TU_CLAVE_")
        print("Muestra A1:B4:")
        for r in range(1, 5):
            print(" ", [ws.Cells(r, c).Value for c in range(1, 8)])

        if ws.ListObjects.Count:
            lo = ws.ListObjects(1)
            try:
                lo.Name = "AG_Historial"
            except Exception:
                pass
            print(f"Tabla {lo.Name} filas={lo.ListRows.Count}")

        wb.Save()
        print("GUARDADO. Cierra Excel y vuelve a abrir el master para probar.")
        return 0
    except Exception as e:
        print("ERROR:", e)
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
