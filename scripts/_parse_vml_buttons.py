#!/usr/bin/env python3
import re
import sys
import zipfile
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

for fname in [
    "Formato master auto Presion.xlsm",
    "Formato master auto Presion_SIN_REF.xlsm",
]:
    path = Path(r"C:\Users\AG\Desktop\FORMATOS AG") / fname
    print("====", fname)
    z = zipfile.ZipFile(path)
    for n in z.namelist():
        low = n.lower()
        if "vml" not in low and "ctrl" not in low and "activex" not in low:
            continue
        data = z.read(n).decode("utf-8", "replace")
        macros = re.findall(r"FmlaMacro=\"([^\"]+)\"", data)
        labels = re.findall(r"<v:textbox[^>]*>\s*<div[^>]*>(.*?)</div>", data, re.S | re.I)
        if macros or "Button" in data or "Guardar" in data:
            print(" file", n)
            for m in macros:
                print("  macro:", m)
            for lab in labels:
                clean = re.sub(r"<[^>]+>", "", lab).strip()
                if clean:
                    print("  label:", clean[:80])
