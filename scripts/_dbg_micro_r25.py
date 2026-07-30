# -*- coding: utf-8 -*-
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace", line_buffering=True)
import pythoncom
import win32com.client

XL_ERRORS = {
    -2146826246: "#DIV/0!",
    -2146826259: "#NAME?",
    -2146826281: "#REF!",
    -2146826252: "#VALUE!",
    -2146826265: "#NULL!",
    -2146826273: "#N/A",
    -2146826255: "#NUM!",
}

def en(v):
    return XL_ERRORS.get(v, v) if isinstance(v, int) and v in XL_ERRORS else v

pythoncom.CoInitialize()
excel = win32com.client.DispatchEx("Excel.Application")
excel.Visible = False
excel.DisplayAlerts = False
wb = excel.Workbooks.Open(
    str(Path(r"C:\Users\AG\Desktop\FORMATOS AG\Formato Micrometro Exteriores.xlsm").resolve()),
    UpdateLinks=0, ReadOnly=False,
)
calc = wb.Worksheets("Calculos")
try:
    calc.Unprotect("AG-Calidad-2026")
except Exception:
    pass

calc.Range("J11").Value = "mm"
calc.Range("G11").Value = 25
calc.Range("F11").Value = 0
for r in range(25, 36):
    b = calc.Range(f"B{r}").Value
    if isinstance(b, (int, float)):
        calc.Range(f"C{r}").Value = b
        calc.Range(f"D{r}").Value = b
        calc.Range(f"E{r}").Value = b
excel.Calculate()

print("Row 25 chain:")
for col in list("ABCDEFGHIJKLMNOPQRSTUVW"):
    cell = f"{col}25"
    print(f"  {cell}: val={en(calc.Range(cell).Value)!r} form={calc.Range(cell).Formula!r}"[:180])

print("\nRow 26 for compare:")
for col in list("NOPQRSTUV"):
    cell = f"{col}26"
    print(f"  {cell}: val={en(calc.Range(cell).Value)!r} form={calc.Range(cell).Formula!r}"[:160])

wb.Close(False)
excel.Quit()
pythoncom.CoUninitialize()
