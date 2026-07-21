#!/usr/bin/env python3
"""
Protege el master de Presión y deja editables solo las entradas del técnico.

La protección evita cambios accidentales; las macros conservan permiso para
modificar celdas protegidas mediante UserInterfaceOnly=True en Workbook_Open.
"""
from __future__ import annotations

import sys
import traceback
from pathlib import Path

import pythoncom
import win32com.client

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

PATH = Path(r"C:\Users\AG\Desktop\FORMATOS AG\Formato master auto Presion_SIN_REF.xlsm")
PASSWORD = "AG-Calidad-2026"

# Entradas autorizadas en Calculos.
# Se incluyen certificado, tipo y mínimo de vacío porque son necesarios para operar.
UNLOCKED_RANGES = (
    "D4:F4",        # Número de certificado
    "B10:C10",      # Marca
    "B11:C11",      # Modelo / No. de parte
    "B12:C12",      # Serie
    "F10:G10",      # Alcance
    "J9",           # División mínima / EMP base
    "J10",          # Unidad
    "B13:C13",      # Analógico (1) / Digital (2)
    "N13",          # Rango mínimo para vacío
    "C14",          # Lugar donde se calibró
    "F15:G15",      # EMP de acuerdo a
    "C28:F38",      # Lecturas del instrumento
    "H28:K38",      # Lecturas del patrón
    "Q28",          # EMP (Q29:Q38 se propaga por fórmula)
)

INPUT_FILL = 0xCCFFFF  # amarillo claro en BGR para Excel COM

WORKBOOK_OPEN_CODE = f'''
Private Sub Workbook_Open()
    ' La opción UserInterfaceOnly no se guarda al cerrar; se reactiva aquí.
    On Error Resume Next
    Dim ws As Worksheet
    For Each ws In ThisWorkbook.Worksheets
        ' Orden: Password, DrawingObjects, Contents, Scenarios, UserInterfaceOnly
        ' DrawingObjects:=False deja clicables los botones de macro.
        ws.Protect Password:="{PASSWORD}", DrawingObjects:=False, Contents:=True, Scenarios:=True, UserInterfaceOnly:=True
        ws.EnableSelection = xlNoSelection
    Next ws
    Sheets("Calculos").EnableSelection = xlUnlockedCells
    ThisWorkbook.Protect Password:="{PASSWORD}", Structure:=True, Windows:=False
    On Error GoTo 0
End Sub
'''


def replace_or_add_procedure(code, proc_name: str, proc_code: str) -> None:
    """Reemplaza un procedimiento VBA sin duplicar nombres."""
    try:
        start = code.ProcStartLine(proc_name, 0)
        count = code.ProcCountLines(proc_name, 0)
        code.DeleteLines(start, count)
    except Exception:
        pass
    code.AddFromString(proc_code)


def ensure_location_restore(hoja3_code) -> None:
    """Hace que C14 vuelva a su fórmula al cambiar el certificado."""
    if hoja3_code.CountOfLines == 0:
        raise RuntimeError("Hoja3 no contiene el controlador Worksheet_Change")

    text = hoja3_code.Lines(1, hoja3_code.CountOfLines)
    formula_line = (
        '    Range("C14").Formula = '
        '"=IF(OR(K4=""Laboratorio"",K4=""laboratorio""),'
        '""Instalaciones AG"",IF(OR(K4=""Sitio"",K4=""sitio""),'
        '""Instalaciones de Cliente"",""""))"'
    )

    # Si ya existe una restauración de C14, no duplicarla.
    if 'Range("C14").Formula' in text:
        return

    marker = '    Range("M8").Formula = '
    pos = text.find(marker)
    if pos < 0:
        raise RuntimeError("No se encontró RestablecerFormulasDesdeHistorial en Hoja3")

    line_end = text.find("\n", pos)
    if line_end < 0:
        line_end = len(text)
    new_text = text[: line_end + 1] + formula_line + "\n" + text[line_end + 1 :]

    hoja3_code.DeleteLines(1, hoja3_code.CountOfLines)
    hoja3_code.AddFromString(new_text)


def add_or_replace_name(wb, name: str, refers_to: str) -> None:
    try:
        wb.Names(name).Delete()
    except Exception:
        pass
    wb.Names.Add(Name=name, RefersTo=refers_to)


def configure_location_lists(wb, calc) -> None:
    """Crea listas dependientes para C14 según K4 (Sitio/Laboratorio)."""
    config_name = "_ConfigProteccion"
    try:
        cfg = wb.Worksheets(config_name)
    except Exception:
        cfg = wb.Worksheets.Add(After=wb.Worksheets(wb.Worksheets.Count))
        cfg.Name = config_name

    cfg.Cells.Clear()
    # Una sola opción válida, calculada según el origen de K4.
    # La validación usa un nombre porque Excel no admite referencias directas
    # a otra hoja en una lista.
    cfg.Range("A1").Formula = (
        '=IF(OR(Calculos!$K$4="Sitio",Calculos!$K$4="sitio"),'
        '"Instalaciones de Cliente","Instalaciones AG")'
    )
    cfg.Visible = 2  # xlSheetVeryHidden

    add_or_replace_name(
        wb,
        "LugarPermitido",
        f"='{config_name}'!$A$1:$A$1",
    )

    target = calc.Range("C14")
    target.Validation.Delete()
    target.Validation.Add(
        Type=3,  # xlValidateList
        AlertStyle=1,  # xlValidAlertStop
        Operator=1,
        Formula1="=LugarPermitido",
    )
    target.Validation.IgnoreBlank = True
    target.Validation.InCellDropdown = True
    target.Validation.ShowError = True
    target.Validation.ErrorTitle = "Lugar no permitido"
    target.Validation.ErrorMessage = (
        "El lugar debe corresponder a Sitio o Laboratorio según la hoja de trabajo."
    )

    target.Formula = (
        '=IF(OR(K4="Laboratorio",K4="laboratorio"),"Instalaciones AG",'
        'IF(OR(K4="Sitio",K4="sitio"),"Instalaciones de Cliente",""))'
    )


def configure_input_validations(calc) -> None:
    """Asegura listas de las entradas principales."""
    # Unidad
    unit = calc.Range("J10")
    unit.Validation.Delete()
    unit.Validation.Add(
        Type=3,
        AlertStyle=1,
        Operator=1,
        Formula1="psi,kPa,bar,mbar,kg-cm2,inHg,inH2O,mmHg,MPa",
    )
    unit.Validation.IgnoreBlank = False
    unit.Validation.InCellDropdown = True
    unit.Validation.ShowError = True
    unit.Validation.ErrorTitle = "Unidad no válida"

    # EMP de acuerdo a: NORMA / FABRICANTE / CLIENTE
    emp_source = calc.Range("F15")
    emp_source.Validation.Delete()
    emp_source.Validation.Add(
        Type=3,
        AlertStyle=1,
        Operator=1,
        Formula1="NORMA,FABRICANTE,CLIENTE",
    )
    emp_source.Validation.IgnoreBlank = False
    emp_source.Validation.InCellDropdown = True
    emp_source.Validation.ShowError = True
    emp_source.Validation.ErrorTitle = "Origen del EMP no válido"

    # Analógico / digital usa 1/2 porque J12 depende de B13.
    tipo = calc.Range("B13")
    tipo.Validation.Delete()
    tipo.Validation.Add(
        Type=3,
        AlertStyle=1,
        Operator=1,
        Formula1="1,2",
    )
    tipo.Validation.IgnoreBlank = False
    tipo.Validation.InCellDropdown = True
    tipo.Validation.ShowInput = True
    tipo.Validation.InputTitle = "Tipo de instrumento"
    tipo.Validation.InputMessage = "1 = Analógico; 2 = Digital"


def configure_protection(wb) -> None:
    calc = wb.Worksheets("Calculos")

    # Quitar protección previa para poder configurar.
    try:
        wb.Unprotect(PASSWORD)
    except Exception:
        pass
    for i in range(1, wb.Worksheets.Count + 1):
        ws = wb.Worksheets(i)
        try:
            ws.Unprotect(PASSWORD)
        except Exception:
            pass

    # Todas las hojas/celdas bloqueadas por defecto.
    for i in range(1, wb.Worksheets.Count + 1):
        ws = wb.Worksheets(i)
        # Excel puede rechazar el formato de las 17 mil millones de celdas;
        # UsedRange cubre toda el área operativa y el resto ya es Locked=True
        # por defecto en un libro nuevo.
        ws.UsedRange.Locked = True
        ws.UsedRange.FormulaHidden = False

    # Solo entradas permitidas.
    for ref in UNLOCKED_RANGES:
        rng = calc.Range(ref)
        rng.Locked = False
        # Facilita al técnico identificar dónde sí puede capturar.
        rng.Interior.Color = INPUT_FILL

    configure_location_lists(wb, calc)
    configure_input_validations(calc)

    # C14 debe seguir desbloqueada después de recrear la validación.
    calc.Range("C14").Locked = False

    # Protección de hojas: VBA sí puede modificar celdas bloqueadas.
    for i in range(1, wb.Worksheets.Count + 1):
        ws = wb.Worksheets(i)
        # Orden VBA: Password, DrawingObjects, Contents, Scenarios, UserInterfaceOnly
        # DrawingObjects=False deja clicables los botones de macro.
        ws.Protect(PASSWORD, False, True, True, True)
        ws.EnableSelection = -4142  # xlNoSelection
    calc.EnableSelection = 1  # xlUnlockedCells

    wb.Protect(Password=PASSWORD, Structure=True, Windows=False)


def configure_vba(wb) -> None:
    vbproj = wb.VBProject
    this_book = None
    hoja3 = None
    for i in range(1, vbproj.VBComponents.Count + 1):
        comp = vbproj.VBComponents.Item(i)
        if comp.Name == "ThisWorkbook":
            this_book = comp
        elif comp.Name == "Hoja3":
            hoja3 = comp

    if this_book is None or hoja3 is None:
        raise RuntimeError("No se encontraron ThisWorkbook y Hoja3")

    # Reescribir ThisWorkbook completo evita dejar un Workbook_Open viejo.
    code = this_book.CodeModule
    if code.CountOfLines > 0:
        code.DeleteLines(1, code.CountOfLines)
    code.AddFromString(WORKBOOK_OPEN_CODE)
    ensure_location_restore(hoja3.CodeModule)


def verify(wb) -> None:
    calc = wb.Worksheets("Calculos")
    errors: list[str] = []

    for ref in UNLOCKED_RANGES:
        if bool(calc.Range(ref).Locked):
            errors.append(f"{ref} sigue bloqueado")

    if not calc.ProtectContents:
        errors.append("Calculos no está protegido")
    # DrawingObjects:=True sigue permitiendo OnAction de botones; solo impide moverlos.
    if not wb.ProtectStructure:
        errors.append("La estructura del libro no está protegida")

    # Las fórmulas críticas deben quedar bloqueadas.
    for ref in ("B5", "B9", "I4", "I5", "I6", "N28", "O28", "V28", "Y28"):
        if not bool(calc.Range(ref).Locked):
            errors.append(f"{ref} debería estar bloqueado")

    # Botones deben seguir presentes y con macro.
    expected = {
        "btn_GuardarCertificadoExcel",
        "btn_CambiarFormatoFecha",
        "btn_ConfigurarListaUnidades",
        "btn_RecalcularCertificado",
        "btn_IrAPortada",
    }
    found = set()
    for i in range(1, calc.Shapes.Count + 1):
        shp = calc.Shapes(i)
        if str(shp.Name) in expected and str(shp.OnAction):
            found.add(str(shp.Name))
    missing = expected - found
    if missing:
        errors.append(f"Faltan botones: {sorted(missing)}")

    if errors:
        raise RuntimeError("; ".join(errors))

    print("Protección verificada.")
    print("Entradas desbloqueadas:", ", ".join(UNLOCKED_RANGES))
    print("Botones verificados:", len(found))


def main() -> int:
    if not PATH.exists():
        print("No existe:", PATH)
        return 1

    pythoncom.CoInitialize()
    excel = win32com.client.DispatchEx("Excel.Application")
    excel.Visible = False
    excel.DisplayAlerts = False
    excel.EnableEvents = False

    wb = None
    saved = False
    try:
        wb = excel.Workbooks.Open(str(PATH.resolve()), UpdateLinks=0)
        configure_vba(wb)
        configure_protection(wb)
        verify(wb)
        wb.Save()
        saved = True
        print("Guardado:", PATH.name)
        print("Contraseña de protección:", PASSWORD)
        return 0
    except Exception as exc:
        print("ERROR:", exc)
        traceback.print_exc()
        if wb is not None:
            try:
                wb.Close(False)
            except Exception:
                pass
        return 2
    finally:
        if wb is not None:
            try:
                wb.Close(saved)
            except Exception:
                pass
        excel.Quit()
        pythoncom.CoUninitialize()


if __name__ == "__main__":
    raise SystemExit(main())
