import re, os, win32com.client as w
script = r'C:\Users\AG\Desktop\AGG\project\scripts\fix_presion_restore_formulas_on_cert.py'
text = open(script, encoding='utf-8').read()
paths = re.findall(r'r"([^"]+\.xlsm)"', text)
xlsm = next((p for p in paths if os.path.isfile(p)), paths[0] if paths else None)
print('Workbook:', xlsm)
xl = w.Dispatch('Excel.Application')
xl.Visible = False
xl.DisplayAlerts = False
wb = xl.Workbooks.Open(xlsm)
code = wb.VBProject.VBComponents('Hoja3').CodeModule
src = code.Lines(1, code.CountOfLines)
print('--- Hoja3 verification ---')
print('Line count:', code.CountOfLines)
print('Contains RestablecerFormulasDesdeHistorial:', 'RestablecerFormulasDesdeHistorial' in src)
print('RestablecerFormulasDesdeHistorial occurrences:', src.count('RestablecerFormulasDesdeHistorial'))
fu_fn = len(re.findall(r'^\s*(Public\s+)?(Function|Sub)\s+FactorUnidad\b', src, re.M|re.I))
print('FactorUnidad Function/Sub definitions:', fu_fn)
print('FactorUnidad total mentions:', src.count('FactorUnidad'))
xl.EnableEvents = True
ws = wb.Worksheets('Calculos')
ws.Range('B10').Value = 'XXX'
e4 = ws.Range('E4').Value
try:
    e4n = float(e4) + 1
except (TypeError, ValueError):
    e4n = 1
ws.Range('E4').Value = e4n
ws.Range('E4').Value = e4
b10 = ws.Range('B10')
print('--- EnableEvents simulation ---')
print('B10 value after test:', b10.Value)
print('B10.HasFormula:', b10.HasFormula)
if b10.HasFormula:
    print('B10.Formula (first 120 chars):', str(b10.Formula)[:120])
wb.Close(False)
xl.Quit()
