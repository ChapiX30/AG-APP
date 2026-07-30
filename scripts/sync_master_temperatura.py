# -*- coding: utf-8 -*-
"""Dispara AG_AutoSync.ActualizarHistorialDesdeApp en un master de temperatura."""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace", line_buffering=True)

import pythoncom
import win32com.client


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--archivo", required=True)
    args = parser.parse_args()
    path = Path(args.archivo)
    if not path.exists():
        print("No existe:", path)
        return 1

    pythoncom.CoInitialize()
    excel = win32com.client.DispatchEx("Excel.Application")
    excel.Visible = False
    excel.DisplayAlerts = False
    excel.AskToUpdateLinks = False
    try:
        wb = excel.Workbooks.Open(str(path.resolve()), UpdateLinks=0, ReadOnly=False)
        excel.Run("AG_AutoSync.ActualizarHistorialManual")
        wb.Save()
        wb.Close(True)
        print("OK:", path.name)
        return 0
    except Exception as e:
        print("ERROR:", e)
        return 1
    finally:
        excel.Quit()
        pythoncom.CoUninitialize()


if __name__ == "__main__":
    raise SystemExit(main())
