#!/usr/bin/env python3
"""
Solo restaura botones en Calculos (no toca VBA si AG_Macros ya tiene las macros).
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

import pythoncom
import win32com.client

PATH = Path(r"C:\Users\AG\Desktop\FORMATOS AG\Formato master auto Presion_SIN_REF.xlsm")
ALT = Path(r"C:\Users\AG\Desktop\FORMATOS AG\Formato master auto Presion_SIN_REF_botones.xlsm")
MSO_ROUNDED = 5

MACROS = [
    ("Guardar certificado", "GuardarCertificadoExcel", (37, 99, 235)),
    ("Formato fecha", "CambiarFormatoFecha", (15, 118, 110)),
    ("Lista unidades", "ConfigurarListaUnidades", (124, 58, 237)),
    ("Recalcular", "RecalcularCertificado", (217, 119, 6)),
    ("Ir a Portada", "IrAPortada", (71, 85, 105)),
]


def rgb(r, g, b):
    return r + (g * 256) + (b * 65536)


def add_button(ws, left, top, width, height, caption, macro, color):
    shp = ws.Shapes.AddShape(MSO_ROUNDED, left, top, width, height)
    shp.Name = "btn_" + macro
    shp.OnAction = macro
    shp.Fill.ForeColor.RGB = color
    shp.Line.Visible = 0
    shp.TextFrame.Characters().Text = caption
    font = shp.TextFrame.Characters().Font
    font.Color = 0xFFFFFF
    font.Bold = True
    font.Size = 11
    font.Name = "Calibri"
    shp.TextFrame.HorizontalAlignment = -4108
    shp.TextFrame.VerticalAlignment = -4108
    return shp


def main() -> int:
    pythoncom.CoInitialize()
    excel = win32com.client.DispatchEx("Excel.Application")
    excel.Visible = False
    excel.DisplayAlerts = False
    excel.EnableEvents = False

    out = PATH
    try:
        wb = excel.Workbooks.Open(str(PATH.resolve()), UpdateLinks=0)
    except Exception as e:
        print("Cierra Excel y reintenta:", e)
        excel.Quit()
        pythoncom.CoUninitialize()
        return 2

    try:
        # Verificar macros (no recrear — evita nombre ambiguo)
        blob = ""
        for i in range(1, wb.VBProject.VBComponents.Count + 1):
            c = wb.VBProject.VBComponents.Item(i)
            if c.Type == 1 and c.CodeModule.CountOfLines:
                blob += c.CodeModule.Lines(1, c.CodeModule.CountOfLines) + "\n"
        missing = [m for _, m, _ in MACROS if f"Sub {m}" not in blob]
        if missing:
            print("Faltan macros en VBA:", missing)
            print("Corre antes scripts/restore_presion_buttons.py completo o fix ambiguous.")
            wb.Close(False)
            return 3
        print("Macros OK en AG_Macros (o equivalentes).")

        ws = wb.Sheets("Calculos")
        to_delete = []
        for i in range(1, ws.Shapes.Count + 1):
            shp = ws.Shapes(i)
            try:
                if str(shp.Name).startswith("btn_"):
                    to_delete.append(shp.Name)
            except Exception:
                pass
        for name in to_delete:
            ws.Shapes(name).Delete()
            print("Eliminado viejo", name)

        top, left = 8, 420
        w, h, gap = 130, 28, 8
        for i, (caption, macro, color) in enumerate(MACROS):
            ww = 110 if macro == "IrAPortada" else w
            add_button(ws, left + i * (w + gap), top, ww, h, caption, macro, rgb(*color))
            print(" +", caption, "->", macro)

        try:
            wb.Save()
            print("Guardado:", PATH.name)
        except Exception:
            wb.SaveAs(str(ALT.resolve()), FileFormat=52)  # xlOpenXMLWorkbookMacroEnabled
            print("Guardado como:", ALT.name)

        # Contar
        btns = [ws.Shapes(i).Name for i in range(1, ws.Shapes.Count + 1) if str(ws.Shapes(i).Name).startswith("btn_")]
        print("Botones:", btns)
    finally:
        wb.Close(SaveChanges=True)
        excel.Quit()
        pythoncom.CoUninitialize()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
