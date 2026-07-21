#!/usr/bin/env python3
"""Inspecciona VBA ThisWorkbook / modulos por MsgBox Error."""
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

import pythoncom
import win32com.client

PATH = r"C:\Users\AG\Desktop\FORMATOS AG\Formato master auto Presion.xlsm"

pythoncom.CoInitialize()
excel = win32com.client.DispatchEx("Excel.Application")
excel.Visible = False
excel.DisplayAlerts = False
excel.EnableEvents = False  # no correr Workbook_Open al abrir
wb = excel.Workbooks.Open(PATH, UpdateLinks=0, ReadOnly=True)

try:
    vbproj = wb.VBProject
    for i in range(1, vbproj.VBComponents.Count + 1):
        comp = vbproj.VBComponents.Item(i)
        try:
            code = comp.CodeModule
            lines = code.CountOfLines
        except Exception:
            continue
        if lines <= 0:
            continue
        text = code.Lines(1, lines)
        if any(k in text for k in ("Workbook_Open", "MsgBox", "RefreshAll", "Error", "Patr")):
            print(f"\n===== {comp.Name} type={comp.Type} lines={lines} =====")
            print(text[:4000])
except Exception as e:
    print("VBProject error:", e)
    print("Activa acceso a VBA en Centro de confianza")

wb.Close(False)
excel.Quit()
pythoncom.CoUninitialize()
