# -*- coding: utf-8 -*-
import sys
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
import win32com.client
import pythoncom

PASSWORD = "AG-Calidad-2026"
path = r"C:\Users\AG\Desktop\FORMATOS AG\Formato Vernier.xlsm"

pythoncom.CoInitialize()
excel = win32com.client.DispatchEx("Excel.Application")
excel.Visible = False
excel.DisplayAlerts = False
wb = excel.Workbooks.Open(path, UpdateLinks=0, ReadOnly=False)
calc = wb.Worksheets("Calculos")
for pwd in (PASSWORD, ""):
    try:
        if pwd:
            calc.Unprotect(Password=pwd)
        else:
            calc.Unprotect()
        break
    except Exception:
        continue

hs = "obtenerDatosExcel"
key = 'TRIM($D$4)&"-"&TEXT($E$4,"0000")&"-"&TEXT($F$4,"00")'
m = f"MATCH({key},{hs}!$B:$B,0)"

calc.Range("I4").Formula = (
    "=IFERROR("
    f'IF(INDEX({hs}!$M:$M,{m})="",'
    f'IF(UPPER(LEFT(INDEX({hs}!$K:$K,{m}),1))="S","Servicio en Sitio",""),'
    f"VALUE(INDEX({hs}!$M:$M,{m}))),"
    f'IF(IFERROR(UPPER(LEFT(INDEX({hs}!$K:$K,{m}),1)),"")="S","Servicio en Sitio",""))'
)
try:
    calc.Range("I5").ClearContents()
except Exception:
    pass
calc.Range("I6").Formula = f'=IFERROR(VALUE(INDEX({hs}!$I:$I,{m})),"")'
calc.Range("I7").Formula = (
    f'=IFERROR(EDATE($I$6,IF(INDEX({hs}!$L:$L,{m})="6 meses",6,'
    f'IF(INDEX({hs}!$L:$L,{m})="3 meses",3,'
    f'IF(INDEX({hs}!$L:$L,{m})="24 meses",24,12)))),"")'
)
calc.Range("I9").Formula = "=TODAY()"

for a in ("I4", "I6", "I7", "I9"):
    rng = calc.Range(a)
    try:
        if rng.MergeCells:
            rng.MergeArea.Locked = True
        else:
            rng.Locked = True
        rng.NumberFormatLocal = "aaaa-mmm-dd"
    except Exception as e:
        print("lock", a, e)

for a in ("D4", "E4", "F4", "J12", "F12", "F13", "J13", "F14", "J14", "C25:E35"):
    try:
        r = calc.Range(a)
        if r.MergeCells:
            r.MergeArea.Locked = False
        else:
            r.Locked = False
    except Exception:
        pass

calc.Protect(
    Password=PASSWORD,
    DrawingObjects=False,
    Contents=True,
    Scenarios=True,
    UserInterfaceOnly=True,
)
print("I4", calc.Range("I4").Formula[:50])
print("I6", calc.Range("I6").Formula[:50])
print("I7", calc.Range("I7").Formula[:50])
print("I9", calc.Range("I9").Formula)
wb.Save()
wb.Close(True)
excel.Quit()
print("OK Vernier dates fixed")
