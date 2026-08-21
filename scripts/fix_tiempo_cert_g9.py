# -*- coding: utf-8 -*-
"""
Corrige Formato Tiempo.xlsm:
- Certificado partido en G9 / H9 / I9 (no D4-E4-F4)
- Carga BD_Clientes y completa domicilio/contacto/correo/tel
- Actualiza fórmulas, VBA UI, AG_Recursos (PDF) y Portada
"""
from __future__ import annotations

import json
import re
import sys
import urllib.request
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace", line_buffering=True)

import pythoncom
import win32com.client

FOLDER = Path(r"C:\Users\AG\Desktop\FORMATOS AG")
PATH = FOLDER / "Formato Tiempo.xlsm"
PASSWORD = "AG-Calidad-2026"
API_KEY = "TU_CLAVE_SECRETA_AG_APP_2026"
API_BASE = (
    "https://us-central1-agg1-b7f40.cloudfunctions.net/obtenerDatosExcel"
    f"?key={API_KEY}"
)
HIST = "obtenerDatosExcel"
PREFIX = "AGTI"


def rgb(r, g, b):
    return r + g * 256 + b * 65536


def try_unprotect(ws) -> None:
    for pwd in (PASSWORD, ""):
        try:
            if pwd:
                ws.Unprotect(Password=pwd)
            else:
                ws.Unprotect()
            return
        except Exception:
            continue


def try_protect(ws) -> None:
    try:
        ws.Protect(
            Password=PASSWORD,
            DrawingObjects=False,
            Contents=True,
            Scenarios=True,
            UserInterfaceOnly=True,
        )
    except Exception:
        pass


def unlock(ws, addr: str) -> None:
    try:
        rng = ws.Range(addr)
        if rng.MergeCells:
            rng = rng.MergeArea
        rng.Locked = False
        rng.Interior.Color = rgb(255, 242, 204)
    except Exception:
        pass


def lock(ws, addr: str) -> None:
    try:
        rng = ws.Range(addr)
        if rng.MergeCells:
            rng = rng.MergeArea
        rng.Locked = True
    except Exception:
        pass


def set_module(vb_project, name: str, code_text: str) -> None:
    component = None
    for i in range(1, vb_project.VBComponents.Count + 1):
        c = vb_project.VBComponents.Item(i)
        if str(c.Name) == name:
            component = c
            break
    if component is None:
        component = vb_project.VBComponents.Add(1)
        component.Name = name
    code = component.CodeModule
    if code.CountOfLines:
        code.DeleteLines(1, code.CountOfLines)
    code.AddFromString(code_text)


def norm_name(s: str) -> str:
    s = (s or "").upper().strip()
    for a, b in (
        ("Á", "A"), ("É", "E"), ("Í", "I"), ("Ó", "O"), ("Ú", "U"), ("Ü", "U"), ("Ñ", "N"),
    ):
        s = s.replace(a, b)
    if "(" in s:
        s = s.split("(", 1)[0].strip()
    return " ".join(s.split())


def fetch_clientes() -> list[dict]:
    url = f"{API_BASE}&formato=clientes"
    with urllib.request.urlopen(url, timeout=90) as resp:
        data = json.load(resp)
    if isinstance(data, dict):
        data = data.get("clientes") or []
    return list(data or [])


KEY = 'TRIM($G$9)&"-"&TEXT($H$9,"0000")&"-"&TEXT($I$9,"00")'
MATCH = f"MATCH({KEY},{HIST}!$B:$B,0)"


def idx(col: str, blank: str = '""') -> str:
    return (
        f"=IFERROR(IF(OR(INDEX({HIST}!${col}:${col},{MATCH})=\"\","
        f"INDEX({HIST}!${col}:${col},{MATCH})=0),{blank},"
        f"INDEX({HIST}!${col}:${col},{MATCH})),{blank})"
    )


def idx_or_bd(col: str, bd_col: int) -> str:
    """Historial col N/O/P/Q; si vacío, busca en BD_Clientes por nombre (D10)."""
    return (
        f'=IFERROR(IF(OR(INDEX({HIST}!${col}:${col},{MATCH})="",'
        f'INDEX({HIST}!${col}:${col},{MATCH})=0),'
        f'IFERROR(VLOOKUP($D$10,BD_Clientes!$A:$E,{bd_col},FALSE),""),'
        f'INDEX({HIST}!${col}:${col},{MATCH})),'
        f'IFERROR(VLOOKUP($D$10,BD_Clientes!$A:$E,{bd_col},FALSE),""))'
    )


UI_VBA = f'''
Option Explicit

Private Const AG_PASSWORD As String = "{PASSWORD}"

Private Function CertificadoAG() As String
    With ThisWorkbook.Worksheets("Calculos")
        CertificadoAG = Trim(CStr(.Range("G9").Value)) & "-" & _
                        Format(.Range("H9").Value, "0000") & "-" & _
                        Format(.Range("I9").Value, "00")
    End With
End Function

Sub GuardarCertificadoExcel()
    Dim ws As Worksheet
    Dim ruta As Variant
    Dim nombreArchivo As String
    Dim instrumento As String
    Dim idEquipo As String

    On Error GoTo ErrorHandler
    Set ws = ThisWorkbook.Worksheets("Calculos")

    If Trim(CStr(ws.Range("G9").Value)) = "" Or _
       Trim(CStr(ws.Range("H9").Value)) = "" Or _
       Trim(CStr(ws.Range("I9").Value)) = "" Then
        MsgBox "El número de certificado está incompleto (G9-H9-I9).", vbCritical, "Validación"
        Exit Sub
    End If

    instrumento = Trim(CStr(ws.Range("D15").Value))
    idEquipo = Trim(CStr(ws.Range("I15").Value))
    If instrumento = "" Or instrumento = "No encontrado" Or idEquipo = "" Then
        MsgBox "Falta el instrumento o número de control. Revisa el certificado o pulsa Actualizar.", _
               vbCritical, "Validación"
        Exit Sub
    End If

    nombreArchivo = CertificadoAG() & " - " & instrumento & " - " & idEquipo
    nombreArchivo = Replace(nombreArchivo, "/", "-")
    nombreArchivo = Replace(nombreArchivo, "\\", "-")
    nombreArchivo = Replace(nombreArchivo, ":", "")
    nombreArchivo = Replace(nombreArchivo, "*", "")
    nombreArchivo = Replace(nombreArchivo, "?", "")
    nombreArchivo = Replace(nombreArchivo, """", "")
    nombreArchivo = Replace(nombreArchivo, "<", "")
    nombreArchivo = Replace(nombreArchivo, ">", "")
    nombreArchivo = Replace(nombreArchivo, "|", "")

    ruta = Application.GetSaveAsFilename( _
        InitialFileName:=nombreArchivo, _
        FileFilter:="Libro de Excel con macros (*.xlsm), *.xlsm", _
        Title:="Guardar certificado Tiempo")

    If ruta = False Then Exit Sub

    Application.DisplayAlerts = False
    ThisWorkbook.SaveCopyAs CStr(ruta)
    Application.DisplayAlerts = True
    MsgBox "Certificado guardado:" & vbCrLf & CStr(ruta), vbInformation, "Listo"
    Exit Sub

ErrorHandler:
    Application.DisplayAlerts = True
    MsgBox "No se pudo guardar: " & Err.Description, vbCritical, "Error"
End Sub

Sub CambiarFormatoFecha()
    Dim ws As Worksheet
    Dim fmt As String
    Dim msg As String
    Dim nf As String

    On Error GoTo Fallo
    Set ws = ThisWorkbook.Worksheets("Calculos")
    ws.Unprotect Password:=AG_PASSWORD

    nf = LCase$(CStr(ws.Range("M10").NumberFormatLocal) & CStr(ws.Range("M10").NumberFormat))
    If InStr(1, nf, "dd") > 0 Or InStr(1, nf, "d") > 0 Then
        fmt = "aaaa-mmm"
        msg = "Formato de fecha: solo mes y año."
    Else
        fmt = "aaaa-mmm-dd"
        msg = "Formato de fecha: fecha completa."
    End If

    ws.Range("M10:M11").NumberFormatLocal = fmt
    ws.Range("M9").NumberFormatLocal = "aaaa-mmm-dd"
    ws.Range("M12").NumberFormatLocal = "aaaa-mmm-dd"

    On Error Resume Next
    ThisWorkbook.Worksheets("Portada").Unprotect Password:=AG_PASSWORD
    ThisWorkbook.Worksheets("Portada").Range("D32:D34").NumberFormatLocal = fmt
    ThisWorkbook.Worksheets("Portada").Protect Password:=AG_PASSWORD, DrawingObjects:=False, Contents:=True, Scenarios:=True
    On Error GoTo Fallo

    ws.Protect Password:=AG_PASSWORD, DrawingObjects:=False, Contents:=True, Scenarios:=True
    Application.Calculate
    MsgBox msg, vbInformation, "Fecha"
    Exit Sub
Fallo:
    On Error Resume Next
    ws.Protect Password:=AG_PASSWORD, DrawingObjects:=False, Contents:=True, Scenarios:=True
    MsgBox "No se pudo cambiar el formato de fecha: " & Err.Description, vbExclamation, "Fecha"
End Sub

Sub RecalcularCertificado()
    On Error GoTo ErrorHandler
    Application.ScreenUpdating = False
    Call AG_AutoSync.ActualizarHistorialDesdeApp(False)
    On Error Resume Next
    ThisWorkbook.Worksheets("BD_Clientes").ListObjects(1).Refresh
    ThisWorkbook.Worksheets("BD_Patrones").ListObjects(1).Refresh
    On Error GoTo ErrorHandler
    Application.CalculateUntilAsyncQueriesDone
    Application.Calculate
    Application.ScreenUpdating = True
    MsgBox "Historial (solo nuevos) + cálculos actualizados para " & CertificadoAG(), _
           vbInformation, "Actualizado"
    Exit Sub
ErrorHandler:
    Application.ScreenUpdating = True
    MsgBox "No se pudo actualizar: " & Err.Description, vbExclamation, "Actualizar"
End Sub

Sub IrAPortada()
    ThisWorkbook.Worksheets("Portada").Activate
    ThisWorkbook.Worksheets("Portada").Range("A1").Select
End Sub
'''


def main() -> int:
    if not PATH.exists():
        print("No existe:", PATH)
        return 1

    print("Descargando clientes…")
    clientes = fetch_clientes()
    print("  ", len(clientes), "clientes")

    pythoncom.CoInitialize()
    excel = win32com.client.DispatchEx("Excel.Application")
    excel.Visible = False
    excel.DisplayAlerts = False
    excel.AskToUpdateLinks = False
    excel.EnableEvents = False

    try:
        wb = excel.Workbooks.Open(str(PATH.resolve()), UpdateLinks=0, ReadOnly=False)
        calc = wb.Worksheets("Calculos")
        port = wb.Worksheets("Portada")
        hist = wb.Worksheets(HIST)
        cli = wb.Worksheets("BD_Clientes")

        for ws in (calc, port, hist, cli):
            try:
                ws.Visible = True
            except Exception:
                pass
            try_unprotect(ws)

        # --- 1) Limpiar D4/E4/F4 (no van ahí) ---
        print("Moviendo certificado a G9/H9/I9…")
        for addr in ("C4", "D4", "E4", "F4"):
            try:
                calc.Range(addr).ClearContents()
                calc.Range(addr).Interior.ColorIndex = -4142  # xlNone
            except Exception:
                pass

        # Leer folio actual (G9 fórmula o H9/usuario)
        raw = ""
        g9f = str(calc.Range("G9").Formula or "")
        if g9f.startswith("="):
            # estaba concatenando desde D4
            d = str(calc.Range("D4").Value or "").strip()
            e = calc.Range("H9").Value if calc.Range("H9").Value not in (None, "") else None
            # try from previous split leftovers / Portada
            raw = str(port.Range("J9").Text or "").strip()
            if not raw or "0000" in raw:
                raw = ""
        if not raw:
            # si el usuario ya escribió en G9 como texto completo
            gv = str(calc.Range("G9").Value or "").strip()
            if "-" in gv and not g9f.startswith("="):
                raw = gv
        if not raw:
            hv = calc.Range("H9").Value
            iv = calc.Range("I9").Value
            gv = str(calc.Range("G9").Value or "").strip()
            if gv.upper().startswith("AG") and hv not in (None, ""):
                raw = f"{gv}-{int(hv):04d}-{int(iv or 26):02d}"

        # Si Portada/J9 o hist tienen el último usado
        if not raw or "0000" in raw:
            # busca último AGTI en historial con datos
            last = hist.Cells(hist.Rows.Count, 2).End(-4162).Row
            for r in range(last, 1, -1):
                c = str(hist.Cells(r, 2).Value or "")
                if c.upper().startswith("AGTI-"):
                    raw = c
                    break

        parts = raw.replace(" ", "").split("-") if raw else []
        if len(parts) >= 3 and parts[0].upper().startswith("AG"):
            pref = parts[0].upper()
            num = int(re.sub(r"\D", "", parts[1]) or "0")
            anio = int(re.sub(r"\D", "", parts[2]) or "26")
        else:
            pref, num, anio = PREFIX, None, 26

        calc.Range("G9").Value = pref
        if num is None:
            calc.Range("H9").ClearContents()
        else:
            calc.Range("H9").Value = num
        calc.Range("I9").Value = anio

        for addr in ("G9", "H9", "I9"):
            unlock(calc, addr)

        # --- 2) BD_Clientes ---
        print("Llenando BD_Clientes…")
        cli.Cells.Clear()
        headers = ["Nombre", "Domicilio", "Contacto", "Correo", "Telefono"]
        for c, h in enumerate(headers, 1):
            cli.Cells(1, c).Value = h
        for i, row in enumerate(clientes, 2):
            cli.Cells(i, 1).Value = row.get("Nombre") or row.get("nombre") or ""
            cli.Cells(i, 2).Value = row.get("Domicilio") or row.get("direccion") or ""
            cli.Cells(i, 3).Value = row.get("Contacto") or row.get("contacto") or ""
            cli.Cells(i, 4).Value = row.get("Correo") or row.get("email") or ""
            cli.Cells(i, 5).Value = row.get("Telefono") or row.get("telefono") or ""

        # mapa normalizado
        by_name = {}
        for row in clientes:
            nombre = row.get("Nombre") or row.get("nombre") or ""
            by_name[norm_name(nombre)] = row

        # enriquecer historial cols N-Q (14-17)
        print("Enriqueciendo historial con domicilio/contacto…")
        last = hist.Cells(hist.Rows.Count, 2).End(-4162).Row
        # asegurar encabezados
        for c, h in enumerate(
            ["Name", "certificado", "cliente", "equipo", "marca", "modelo", "serie", "id",
             "fecha", "tecnico", "lugarCalibracion", "frecuenciaCalibracion", "fechaRecepcion",
             "domicilio", "contacto", "correo", "telefono"],
            1,
        ):
            if not hist.Cells(1, c).Value:
                hist.Cells(1, c).Value = h

        filled = 0
        for r in range(2, last + 1):
            cliente = str(hist.Cells(r, 3).Value or "")
            if not cliente:
                continue
            info = by_name.get(norm_name(cliente))
            if not info:
                # soft match contains
                nn = norm_name(cliente)
                info = next((v for k, v in by_name.items() if nn in k or k in nn), None)
            if not info:
                continue
            hist.Cells(r, 14).Value = info.get("Domicilio") or info.get("direccion") or ""
            hist.Cells(r, 15).Value = info.get("Contacto") or info.get("contacto") or ""
            hist.Cells(r, 16).Value = info.get("Correo") or info.get("email") or ""
            hist.Cells(r, 17).Value = info.get("Telefono") or info.get("telefono") or ""
            filled += 1
        print(f"  historial enriquecido: {filled} filas")

        # --- 3) Fórmulas Calculos con G9/H9/I9 ---
        print("Cableando fórmulas…")
        calc.Range("D10").Formula = idx("C")
        calc.Range("D11").Formula = idx_or_bd("N", 2)
        calc.Range("D12").Formula = idx_or_bd("O", 3)
        calc.Range("H10").Formula = idx_or_bd("P", 4)
        calc.Range("H11").Formula = idx_or_bd("Q", 5)

        calc.Range("M9").Formula = (
            "=IFERROR("
            f'IF(INDEX({HIST}!$M:$M,{MATCH})="",'
            f'IF(UPPER(LEFT(INDEX({HIST}!$K:$K,{MATCH}),1))="S","Servicio en Sitio",""),'
            f"VALUE(INDEX({HIST}!$M:$M,{MATCH}))),"
            f'IF(IFERROR(UPPER(LEFT(INDEX({HIST}!$K:$K,{MATCH}),1)),"")="S","Servicio en Sitio",""))'
        )
        calc.Range("M10").Formula = f'=IFERROR(VALUE(INDEX({HIST}!$I:$I,{MATCH})),"")'
        calc.Range("M11").Formula = (
            f'=IFERROR(EDATE($M$10,IF(INDEX({HIST}!$L:$L,{MATCH})="6 meses",6,'
            f'IF(INDEX({HIST}!$L:$L,{MATCH})="3 meses",3,'
            f'IF(INDEX({HIST}!$L:$L,{MATCH})="24 meses",24,12)))),"")'
        )
        calc.Range("M12").Formula = "=TODAY()"
        for addr in ("M9", "M10", "M11", "M12"):
            calc.Range(addr).NumberFormatLocal = "aaaa-mmm-dd"
            lock(calc, addr)

        calc.Range("D15").Formula = idx("D", '"No encontrado"')
        calc.Range("D16").Formula = idx("E", '"No encontrado"')
        calc.Range("D17").Formula = idx("F")
        calc.Range("D18").Formula = idx("G")
        calc.Range("I15").Formula = idx("H")
        calc.Range("P10").Formula = idx("J")  # técnico / calibró

        for addr in ("D10", "D11", "D12", "H10", "H11", "D15", "I15", "P10"):
            lock(calc, addr)
        for addr in ("D16", "D17", "D18"):
            unlock(calc, addr)

        # C13: no mostrar FALSO
        calc.Range("C13").Formula = (
            '=IF(M12<M10,"La fecha de elaboración debe ser mayor o igual a la fecha de calibración",'
            'IF(AND(M9<>"",M9<>"Servicio en Sitio",M9<>"Servicio en sitio",ISNUMBER(M9),M9>M10),'
            '"La fecha de recepción debe ser menor o igual a la fecha de calibración",""))'
        )

        # --- 4) Portada ---
        print("Portada…")
        try_unprotect(port)
        port.Range("J9").Formula = (
            '=Calculos!G9&"-"&TEXT(Calculos!H9,"0000")&"-"&TEXT(Calculos!I9,"00")'
        )
        # etiquetas rotas con vínculo externo
        port.Range("B12").Value = "Cliente:"
        if "Manual AG" in str(port.Range("F14").Formula or ""):
            port.Range("F14").Value = "Ext:"
        port.Range("C12").Formula = "=Calculos!D10"
        port.Range("C13").Formula = "=Calculos!D11"
        port.Range("C14").Formula = "=Calculos!D12"
        port.Range("E14").Formula = "=Calculos!H11"
        port.Range("I14").Formula = "=Calculos!H10"
        port.Range("G14").Formula = "=Calculos!H12"

        # --- 5) VBA UI ---
        print("Actualizando macros…")
        set_module(wb.VBProject, "ModuloAG_TiempoUI", UI_VBA)

        # --- 6) AG_Recursos PDF config ---
        try:
            rec = wb.Worksheets("AG_Recursos")
            try_unprotect(rec)
            rec.Visible = True
            # filas 15-17 = prefijo/numero/anio
            for r in range(1, 40):
                k = str(rec.Cells(r, 1).Value or "")
                if k == "celda_cert_prefijo":
                    rec.Cells(r, 2).Value = "G9"
                elif k == "celda_cert_numero":
                    rec.Cells(r, 2).Value = "H9"
                elif k == "celda_cert_anio":
                    rec.Cells(r, 2).Value = "I9"
            print("  AG_Recursos → G9/H9/I9")
            rec.Visible = 2
        except Exception as e:
            print("  aviso AG_Recursos:", e)

        # --- 7) Proteger / ocultar ---
        for ws in (hist, cli):
            try_protect(ws)
            try:
                ws.Visible = 2
            except Exception:
                ws.Visible = False

        try_protect(calc)
        try_protect(port)

        excel.Calculate
        print("Prueba folio actual:", calc.Range("G9").Text, calc.Range("H9").Text, calc.Range("I9").Text)
        print("  cliente:", calc.Range("D10").Text)
        print("  domicilio:", calc.Range("D11").Text[:80] if calc.Range("D11").Text else "")
        print("  contacto:", calc.Range("D12").Text)
        print("  correo:", calc.Range("H10").Text)
        print("  tel:", calc.Range("H11").Text)
        print("  Portada J9:", port.Range("J9").Text)

        wb.Save()
        wb.Close(True)
        print("OK guardado")
        return 0
    except Exception as e:
        print("ERROR:", e)
        import traceback
        traceback.print_exc()
        return 1
    finally:
        excel.Quit()
        pythoncom.CoUninitialize()


if __name__ == "__main__":
    raise SystemExit(main())
