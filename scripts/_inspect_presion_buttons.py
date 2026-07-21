#!/usr/bin/env python3
"""Inspecciona botones/shapes y macros en masters Presion."""
from __future__ import annotations

import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

import pythoncom
import win32com.client

FILES = [
    Path(r"C:\Users\AG\Desktop\FORMATOS AG\Formato master auto Presion.xlsm"),
    Path(r"C:\Users\AG\Desktop\FORMATOS AG\Formato master auto Presion_SIN_REF.xlsm"),
]


def inspect(path: Path) -> None:
    print(f"\n========== {path.name} ==========")
    if not path.exists():
        print("no existe")
        return
    pythoncom.CoInitialize()
    excel = win32com.client.DispatchEx("Excel.Application")
    excel.Visible = False
    excel.DisplayAlerts = False
    excel.EnableEvents = False
    try:
        wb = excel.Workbooks.Open(str(path.resolve()), UpdateLinks=0, ReadOnly=True)
    except Exception as e:
        print("Open fail:", e)
        excel.Quit()
        pythoncom.CoUninitialize()
        return

    try:
        for i in range(1, wb.Sheets.Count + 1):
            sh = wb.Sheets(i)
            try:
                sc = sh.Shapes.Count
            except Exception:
                sc = 0
            if sc:
                print(f"Sheet {sh.Name}: {sc} shapes")
                for s in range(1, sc + 1):
                    shp = sh.Shapes(s)
                    try:
                        print(
                            f"  - {shp.Name} type={shp.Type} "
                            f"onAction={getattr(shp, 'OnAction', '')} "
                            f"text={shp.TextFrame.Characters().Text[:40] if shp.TextFrame.HasText else ''}"
                        )
                    except Exception as e:
                        print(f"  - shape {s} {shp.Name} ({e})")
            # Buttons collection (Forms)
            try:
                btns = sh.Buttons()
                if btns.Count:
                    print(f"  Form buttons: {btns.Count}")
                    for b in range(1, btns.Count + 1):
                        btn = btns.Item(b)
                        print(f"    {btn.Name} OnAction={btn.OnAction} Caption={btn.Text}")
            except Exception:
                pass

        print("VBA procs:")
        try:
            for i in range(1, wb.VBProject.VBComponents.Count + 1):
                comp = wb.VBProject.VBComponents.Item(i)
                code = comp.CodeModule
                n = code.CountOfLines
                if n <= 0:
                    continue
                text = code.Lines(1, n)
                for line in text.splitlines():
                    if line.strip().startswith("Sub ") or line.strip().startswith("Function "):
                        print(f"  [{comp.Name}] {line.strip()}")
        except Exception as e:
            print(" VBA:", e)
    finally:
        wb.Close(False)
        excel.Quit()
        pythoncom.CoUninitialize()


def main():
    for p in FILES:
        inspect(p)


if __name__ == "__main__":
    main()
