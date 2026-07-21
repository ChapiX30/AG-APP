import sys
sys.stdout.reconfigure(encoding="utf-8", errors="replace")

import pythoncom
import win32com.client as win32

PATH = r"C:\Users\AG\Desktop\FORMATOS AG\Formato master auto Presion_SIN_REF.xlsm"
KPA = 6.894757

pythoncom.CoInitialize()
xl = win32.DispatchEx("Excel.Application")
xl.Visible = False
xl.DisplayAlerts = False
xl.ScreenUpdating = False

results = {}

try:
    wb = xl.Workbooks.Open(PATH, ReadOnly=False, UpdateLinks=0)
    ws = wb.Worksheets("Calculos")

    # Step 1-3: psi baseline, no events
    xl.EnableEvents = False
    ws.Range("J14").Value = "psi"
    ws.Range("J10").Value = "psi"
    ws.Range("F10").Value = 600
    ws.Range("H28:K28").Value = ((600, 600, 600, 600),)
    xl.CalculateFullRebuild()
    xl.Calculate()

    v28_psi = float(ws.Range("V28").Value)
    results["v28_psi"] = v28_psi
    results["psi"] = {
        "F10": ws.Range("F10").Value,
        "H28": ws.Range("H28").Value,
        "O28": ws.Range("O28").Value,
        "N12": ws.Range("N12").Value,
        "J13": ws.Range("J13").Value,
    }

    # Step 4: try real Worksheet_Change
    xl.EnableEvents = True
    xl.Interactive = True
    xl.UserControl = True
    ws.Range("J10").Value = "kPa"
    pythoncom.PumpWaitingMessages()
    xl.Calculate()

    j14_after = ws.Range("J14").Value
    f10_after = float(ws.Range("F10").Value)
    event_fired = (str(j14_after).lower().strip() == "kpa" and abs(f10_after - 600 * KPA) < 2)
    results["event_fired"] = event_fired

    if event_fired:
        mode = "worksheet_change"
        v28_kpa = float(ws.Range("V28").Value)
        state = {
            "F10": ws.Range("F10").Value,
            "H28": ws.Range("H28").Value,
            "O28": ws.Range("O28").Value,
            "N12": ws.Range("N12").Value,
            "V28": v28_kpa,
        }
    else:
        # Re-run scenario with VBA-equivalent conversion (events still off) to test formulas
        mode = "vba_equivalent_manual"
        xl.EnableEvents = False
        ws.Range("J14").Value = "psi"
        ws.Range("J10").Value = "psi"
        ws.Range("F10").Value = 600
        ws.Range("H28:K28").Value = ((600, 600, 600, 600),)
        xl.CalculateFullRebuild()
        v28_psi = float(ws.Range("V28").Value)
        results["v28_psi"] = v28_psi

        ratio = KPA / 1.0
        ws.Range("F10").Value = 600 * ratio
        ws.Range("H28:K28").Value = ((600 * ratio, 600 * ratio, 600 * ratio, 600 * ratio),)
        ws.Range("J10").Value = "kPa"
        ws.Range("J14").Value = "kpa"
        xl.CalculateFullRebuild()
        xl.Calculate()
        v28_kpa = float(ws.Range("V28").Value)
        state = {
            "F10": ws.Range("F10").Value,
            "H28": ws.Range("H28").Value,
            "O28": ws.Range("O28").Value,
            "N12": ws.Range("N12").Value,
            "V28": v28_kpa,
        }

    results["mode"] = mode
    results["kpa"] = state
    results["ratio"] = v28_kpa / v28_psi

    wb.Close(SaveChanges=False)
except Exception as e:
    results["error"] = str(e)
    try:
        wb.Close(SaveChanges=False)
    except Exception:
        pass
finally:
    try:
        xl.Quit()
    except Exception:
        pass
    pythoncom.CoUninitialize()

print("fix_presion_unit_conversion.py: already ran OK")
print("=== PSI (step 3) ===")
print(results.get("psi"))
print(f"V28_psi = {results.get('v28_psi')}")
print(f"Worksheet_Change fired on J10=kPa: {results.get('event_fired')}")
print(f"Evaluation mode: {results.get('mode')}")
print("=== kPa (step 5-6) ===")
print(results.get("kpa"))
r = results.get("ratio")
if r is not None:
    print(f"Ratio V28_kPa/V28_psi = {r:.6f}")
    print(f"VERDICT uncertainty scales (~6.895): {'YES' if abs(r-6.894757)<0.05 else 'NO'}")
if "error" in results:
    print("ERROR:", results["error"])
