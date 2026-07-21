import sys
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
import pythoncom
import win32com.client
from pathlib import Path

path = Path(r"C:\Users\AG\Desktop\FORMATOS AG\Formato master auto Presion_SIN_REF.xlsm")
pythoncom.CoInitialize()
excel = win32com.client.DispatchEx("Excel.Application")
excel.Visible = False
excel.DisplayAlerts = False
try:
    wb = excel.Workbooks.Open(str(path.resolve()), UpdateLinks=0, ReadOnly=True)
    for name in ["Hoja3", "Calculos", "Portada", "Hoja2"]:
        try:
            for i in range(1, wb.VBProject.VBComponents.Count + 1):
                comp = wb.VBProject.VBComponents.Item(i)
                if comp.Name == name:
                    cm = comp.CodeModule
                    if cm.CountOfLines > 0:
                        print(f"\n===== VBComponent {name} ({cm.CountOfLines} lines) =====")
                        print(cm.Lines(1, min(cm.CountOfLines, 80)))
        except Exception as e:
            print(name, e)
    wb.Close(False)
finally:
    excel.Quit()
    pythoncom.CoUninitialize()
