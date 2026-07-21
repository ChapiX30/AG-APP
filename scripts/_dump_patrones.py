import win32com.client
from pathlib import Path

xlsm = r"C:\Users\AG\Desktop\FORMATOS AG\Formato master auto Presion_SIN_REF.xlsm"
out = Path(r"C:\Users\AG\Desktop\AGG\project\scripts\_patrones_excel_output.txt")

lines = []
lines.append("PATRONES SHEET A1:I40")
lines.append("="*80)

excel = win32com.client.Dispatch("Excel.Application")
excel.Visible = False
excel.DisplayAlerts = False
wb = excel.Workbooks.Open(xlsm, ReadOnly=True)
try:
    ws = wb.Worksheets("Patrones")
    for r in range(1, 41):
        row_vals = []
        for c in range(1, 10):  # A-I
            v = ws.Cells(r, c).Value
            if v is None:
                row_vals.append("")
            else:
                row_vals.append(str(v))
        col_letter = chr(64 + 1)  # A
        lines.append(f"R{r:02d}: " + " | ".join(row_vals))
finally:
    wb.Close(SaveChanges=False)
    excel.Quit()

out.write_text("\n".join(lines), encoding="utf-8")
print(f"Wrote {out}")
