import sys
from pathlib import Path
import pythoncom
import win32com.client

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

CANDIDATES = [
    Path(r"C:\Users\AG\Desktop\FORMATOS AG\Formato master auto Presion_SIN_REF.xlsm"),
    Path(r"C:\Users\AG\Desktop\FORMATOS AG\Formato master auto Presion_SIN_REF_unidades.xlsm"),
]
NEEDLE = "Function FactorUnidad"

def verify(path: Path) -> None:
    print(f"=== {path.name} ===")
    if not path.exists():
        print("  MISSING")
        return
    pythoncom.CoInitialize()
    excel = win32com.client.DispatchEx("Excel.Application")
    excel.Visible = False
    excel.DisplayAlerts = False
    try:
        wb = excel.Workbooks.Open(str(path.resolve()), UpdateLinks=0, ReadOnly=True)
    except Exception as e:
        print(f"  OPEN FAILED (Excel lock?): {e}")
        excel.Quit()
        pythoncom.CoUninitialize()
        return
    try:
        vbproj = wb.VBProject
        found = False
        for i in range(1, vbproj.VBComponents.Count + 1):
            comp = vbproj.VBComponents.Item(i)
            if comp.Name != "Hoja3":
                continue
            found = True
            cm = comp.CodeModule
            nlines = cm.CountOfLines
            txt = cm.Lines(1, nlines) if nlines else ""
            count_exact = txt.count(NEEDLE)
            count_ci = txt.lower().count("function factorunidad")
            print(f"  Hoja3 CodeModule lines: {nlines}")
            print(f"  count('Function FactorUnidad') exact: {count_exact}")
            print(f"  count('function factorunidad') ci: {count_ci}")
            print(f"  PASS exact-once: {count_exact == 1}")
        if not found:
            print("  Hoja3 module NOT FOUND")
        wb.Close(False)
    finally:
        excel.Quit()
        pythoncom.CoUninitialize()

for p in CANDIDATES:
    verify(p)
