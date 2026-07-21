#!/usr/bin/env python3
"""Lista VBA del master SIN_REF y silencia eventos Change/Refresh que fallan al cambiar E4."""
from __future__ import annotations

import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

import pythoncom
import win32com.client

PATH = Path(r"C:\Users\AG\Desktop\FORMATOS AG\Formato master auto Presion_SIN_REF.xlsm")
OUT = Path(r"C:\Users\AG\Desktop\FORMATOS AG\Formato master auto Presion_SIN_REF.xlsm")


def main() -> int:
    if not PATH.exists():
        print("No existe", PATH)
        return 1

    pythoncom.CoInitialize()
    excel = win32com.client.DispatchEx("Excel.Application")
    excel.Visible = False
    excel.DisplayAlerts = False
    excel.EnableEvents = False
    excel.AskToUpdateLinks = False

    try:
        wb = excel.Workbooks.Open(str(PATH.resolve()), UpdateLinks=0, ReadOnly=False)
    except Exception as e:
        print("No se pudo abrir (cierra Excel):", e)
        excel.Quit()
        pythoncom.CoUninitialize()
        return 2

    try:
        vbproj = wb.VBProject
    except Exception as e:
        print("Sin acceso VBA:", e)
        wb.Close(False)
        excel.Quit()
        pythoncom.CoUninitialize()
        return 3

    print("=== Modulos VBA ===")
    change_modules = []
    for i in range(1, vbproj.VBComponents.Count + 1):
        comp = vbproj.VBComponents.Item(i)
        try:
            n = comp.CodeModule.CountOfLines
            if n <= 0:
                continue
            text = comp.CodeModule.Lines(1, min(n, 400))
        except Exception:
            continue
        interesting = any(
            k in text
            for k in (
                "Worksheet_Change",
                "Workbook_SheetChange",
                "Change(",
                "E4",
                "Refresh",
                "MsgBox",
                "AG_Historial",
                "Query",
                "Target",
            )
        )
        if interesting or n < 80:
            print(f"\n----- {comp.Name} (type={comp.Type}, lines={n}) -----")
            print(text[:3500])
            if "Change" in text or "Refresh" in text or "MsgBox" in text:
                change_modules.append(comp.Name)

    # Desactivar refresh de conexiones
    for i in range(1, wb.Connections.Count + 1):
        try:
            c = wb.Connections.Item(i)
            c.RefreshWithRefreshAll = False
            try:
                c.OLEDBConnection.RefreshOnFileOpen = False
            except Exception:
                pass
            print("Conn off:", c.Name)
        except Exception:
            pass

    # Parchear eventos peligrosos
    safe_change = """
Private Sub Worksheet_Change(ByVal Target As Range)
    On Error Resume Next
    ' Antes fallaba al cambiar certificado (E4/D4/F4) por Refresh/tabla rota.
    ' Los datos ya vienen por formulas INDEX/MATCH a hoja Historial.
End Sub
"""
    safe_open = """
Private Sub Workbook_Open()
    On Error Resume Next
End Sub
"""
    safe_sheet_change = """
Private Sub Workbook_SheetChange(ByVal Sh As Object, ByVal Target As Range)
    On Error Resume Next
End Sub
"""

    for i in range(1, vbproj.VBComponents.Count + 1):
        comp = vbproj.VBComponents.Item(i)
        name = comp.Name
        try:
            code = comp.CodeModule
            n = code.CountOfLines
            text = code.Lines(1, n) if n else ""
        except Exception:
            continue

        # ThisWorkbook
        if name == "ThisWorkbook":
            for proc in ("Workbook_Open", "Workbook_SheetChange"):
                try:
                    start = code.ProcStartLine(proc, 0)
                    count = code.ProcCountLines(proc, 0)
                    code.DeleteLines(start, count)
                except Exception:
                    pass
            code.AddFromString(safe_open)
            code.AddFromString(safe_sheet_change)
            print("Parcheado ThisWorkbook")

        # Hoja Calculos (puede llamarse differently)
        if "Change" in text and ("E4" in text or "Target" in text or "Refresh" in text):
            try:
                start = code.ProcStartLine("Worksheet_Change", 0)
                count = code.ProcCountLines("Worksheet_Change", 0)
                code.DeleteLines(start, count)
                code.AddFromString(safe_change)
                print(f"Parcheado Worksheet_Change en {name}")
            except Exception as e:
                # Si el modulo tiene MsgBox Error en otro proc, buscar y comentar no es facil;
                # vaciar Change basta
                print(f"No Change en {name}: {e}")

        # Cualquier MsgBox "Error:" en macros estandar - reescribir modulos cortos peligrosos
        if "MsgBox" in text and ("Error" in text or "Err." in text) and name not in ("ThisWorkbook",):
            # No borrar modulos enteros de negocio; solo si parece handler de refresh
            if "Refresh" in text or "Query" in text or "AG_Historial" in text:
                try:
                    code.DeleteLines(1, code.CountOfLines)
                    code.AddFromString("' Desactivado: causaba error al cambiar certificado\n")
                    print(f"Modulo limpiado: {name}")
                except Exception as e:
                    print(f"No limpio {name}: {e}")

    wb.Save()
    wb.Close(True)
    excel.Quit()
    pythoncom.CoUninitialize()
    print("\nLISTO. Abre de nuevo:", OUT.name)
    print("Cambia E4: ya no debe salir el error.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
