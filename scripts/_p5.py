import sys
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
import openpyxl
path = r"C:\Users\AG\Desktop\FORMATOS AG\Formato master auto Presion_SIN_REF.xlsm"
wb = openpyxl.load_workbook(path, data_only=False)
wbv = openpyxl.load_workbook(path, data_only=True)
for addr in ["M5","N5","O5","P5","Q5","R5","M4","P4"]:
    print(addr, "stored", wb["Calculos"][addr].value, "disp", wbv["Calculos"][addr].value)
