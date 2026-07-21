import re
import sys
import json
from pathlib import Path

import fitz
import pdfplumber

PDFS = [
    r"C:\Users\AG\Downloads\AG-034 Transductor de presión 17362_MMI-CC-P-0012-2025.pdf",
    r"C:\Users\AG\Downloads\AG-052 MANOMETRO 1000 psi 1-23207.pdf",
    r"C:\Users\AG\Downloads\AG-008 Digital Pressure Alta - 1-24842.pdf",
]
OUT = Path(r"C:\Users\AG\Desktop\AGG\project\scripts\_cert_extract_output.txt")

def extract_with_fitz(path):
    doc = fitz.open(path)
    pages = []
    for i, page in enumerate(doc):
        text = page.get_text("text")
        tables = []
        try:
            found = page.find_tables()
            if found and found.tables:
                for t in found.tables:
                    tables.append(t.extract())
        except Exception as e:
            tables.append([["TABLE_ERR", str(e)]])
        pages.append({"page": i+1, "text": text, "tables": tables})
    doc.close()
    return pages

def extract_with_pdfplumber(path):
    pages = []
    with pdfplumber.open(path) as pdf:
        for i, page in enumerate(pdf.pages):
            text = page.extract_text() or ""
            tables = page.extract_tables() or []
            pages.append({"page": i+1, "text": text, "tables": tables})
    return pages

def guess_meta(text):
    meta = {}
    patterns = {
        "cert_no": r"(?i)(?:certificado|certificate|no\.?\s*cert|cert\.?\s*no|informe|report)\s*[:\.]?\s*([A-Z0-9\-\/\.]+)",
        "equipo": r"(?i)(?:equipo|instrumento|device|identificaci[oó]n|id\.?\s*equipo|serial|serie)\s*[:\.]?\s*([^\n\r]{3,80})",
        "fecha": r"(?i)(?:fecha|date)\s*(?:de\s*)?(?:calibraci[oó]n|calibration|emis[ií]on|issue)?\s*[:\.]?\s*(\d{1,2}[\-/\.]\d{1,2}[\-/\.]\d{2,4}|\d{4}[\-/\.]\d{1,2}[\-/\.]\d{1,2})",
    }
    for k, pat in patterns.items():
        m = re.search(pat, text)
        if m:
            meta[k] = m.group(1).strip()
    # broader cert patterns
    for pat in [
        r"(MMI-CC-P-\d{4}-\d{4})",
        r"(1-\d{5})",
        r"(AG-\d{3})",
    ]:
        m = re.search(pat, text)
        if m and "cert_hint" not in meta:
            meta["cert_hint"] = m.group(1)
    units = set(re.findall(r"\b(psi|kPa|bar|mbar|MPa|inH2O|mmHg|Pa)\b", text, re.I))
    meta["units"] = sorted({u.lower() if u.lower()=='kpa' else u for u in units})
    return meta

def numeric_rows_from_tables(tables):
    rows_out = []
    for ti, table in enumerate(tables):
        if not table:
            continue
        for ri, row in enumerate(table):
            if not row:
                continue
            cells = [("" if c is None else str(c).strip()) for c in row]
            joined = " | ".join(cells)
            nums = re.findall(r"-?\d+(?:[.,]\d+)?(?:[eE][+-]?\d+)?", joined)
            if len(nums) >= 2:
                rows_out.append({"table": ti+1, "row": ri+1, "cells": cells, "nums": nums})
    return rows_out

lines = []
lines.append("="*100)
lines.append("PDF CALIBRATION EXTRACTION")
lines.append("="*100)

for pdf in PDFS:
    p = Path(pdf)
    lines.append("")
    lines.append("#"*100)
    lines.append(f"FILE: {p.name}")
    lines.append(f"EXISTS: {p.exists()} SIZE: {p.stat().st_size if p.exists() else 'N/A'}")
    lines.append("#"*100)
    if not p.exists():
        continue

    fitz_pages = extract_with_fitz(str(p))
    plumb_pages = extract_with_pdfplumber(str(p))
    full_text = "\n".join(pg["text"] for pg in fitz_pages)
    meta = guess_meta(full_text)
    lines.append(f"META: {json.dumps(meta, ensure_ascii=False)}")

    lines.append("\n--- FULL TEXT (fitz) ---")
    lines.append(full_text)

    lines.append("\n--- TABLES (fitz find_tables) ---")
    for pg in fitz_pages:
        lines.append(f"\n[Page {pg['page']}]")
        for ti, table in enumerate(pg["tables"]):
            lines.append(f"  Table {ti+1}:")
            for row in table:
                lines.append("    " + " | ".join("" if c is None else str(c).strip() for c in row))

    lines.append("\n--- TABLES (pdfplumber) ---")
    for pg in plumb_pages:
        lines.append(f"\n[Page {pg['page']}]")
        for ti, table in enumerate(pg["tables"]):
            lines.append(f"  Table {ti+1}:")
            for row in table:
                lines.append("    " + " | ".join("" if c is None else str(c).strip() for c in row))

    all_tables = []
    for pg in plumb_pages:
        all_tables.extend(pg["tables"])
    for pg in fitz_pages:
        all_tables.extend(pg["tables"])

    nr = numeric_rows_from_tables(all_tables)
    lines.append("\n--- NUMERIC ROW CANDIDATES ---")
    for r in nr:
        lines.append(json.dumps(r, ensure_ascii=False))

OUT.write_text("\n".join(lines), encoding="utf-8")
print(f"Wrote {OUT} ({OUT.stat().st_size} bytes)")
