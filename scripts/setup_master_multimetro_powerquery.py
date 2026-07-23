#!/usr/bin/env python3
"""
Configura Formato Multimetro.xlsx para sincronizarse automáticamente al abrir.

Power Query actualiza:
- obtenerDatosExcel: hojas de trabajo AGEL + datos completos del cliente
- BD_Clientes: catálogo de clientes
- BD_Patrones: catálogo de patrones

No modifica cálculos, CMC, lecturas ni incertidumbres.
Requisito: Excel instalado y Formato Multimetro.xlsx cerrado.
"""

from __future__ import annotations

import shutil
import sys
import time
from datetime import datetime
from pathlib import Path

try:
    import pythoncom
    import win32com.client
except ImportError:
    print("Instala pywin32: pip install pywin32")
    sys.exit(1)


MASTER = Path(r"C:\Users\AG\Desktop\FORMATOS AG\Formato Multimetro.xlsm")
API_BASE = (
    "https://us-central1-agg1-b7f40.cloudfunctions.net/obtenerDatosExcel"
    "?key=TU_CLAVE_SECRETA_AG_APP_2026"
)

HIST_SHEET = "obtenerDatosExcel"
CLIENTES_SHEET = "BD_Clientes"
PATRONES_SHEET = "BD_Patrones"

HIST_COLUMNS = [
    "Name",
    "certificado",
    "cliente",
    "equipo",
    "marca",
    "modelo",
    "serie",
    "id",
    "fecha",
    "tecnico",
    "lugarCalibracion",
    "frecuenciaCalibracion",
    "fechaRecepcion",
]
CLIENT_COLUMNS = ["Nombre", "Domicilio", "Contacto", "Correo", "Telefono"]
PATRON_COLUMNS = [
    "noControl",
    "descripcion",
    "marca",
    "modelo",
    "serie",
    "noCertificado",
    "fechaUltimaCalibracion",
    "fechaVencimiento",
    "estadoProceso",
    "statusVigencia",
    "laboratorio",
]


def m_list(values: list[str]) -> str:
    return "{" + ", ".join(f'"{value}"' for value in values) + "}"


M_HISTORIAL = f'''let
    Url = "{API_BASE}",
    Fuente = Json.Document(Web.Contents(Url)),
    HistorialLista = Fuente[historial],
    ClientesLista = Fuente[clientes],
    HistorialBase = Table.FromRecords(HistorialLista, {m_list(HIST_COLUMNS)}, MissingField.UseNull),
    HistorialAGEL = Table.SelectRows(
        HistorialBase,
        each Text.StartsWith(Text.Upper(Text.From([certificado])), "AGEL-")
    ),
    ClientesBase = Table.FromRecords(ClientesLista, {m_list(CLIENT_COLUMNS)}, MissingField.UseNull),
    NormalizarNombre = (valor as any) as text =>
        let
            Texto = Text.Upper(Text.Trim(if valor = null then "" else Text.From(valor))),
            SinParentesis = if Text.Contains(Texto, "(") then Text.BeforeDelimiter(Texto, "(") else Texto,
            SinAcentos = List.Accumulate(
                {{{{"Á", "A"}}, {{"É", "E"}}, {{"Í", "I"}}, {{"Ó", "O"}}, {{"Ú", "U"}}, {{"Ü", "U"}}, {{"Ñ", "N"}}}},
                SinParentesis,
                (estado, par) => Text.Replace(estado, par{{0}}, par{{1}})
            ),
            Permitidos = Text.Select(SinAcentos, {{"A".."Z", "0".."9", " "}}),
            Compacto = Text.Combine(List.Select(Text.Split(Permitidos, " "), each _ <> ""), " ")
        in
            Compacto,
    HistorialClave = Table.AddColumn(
        HistorialAGEL, "_clienteKey", each NormalizarNombre([cliente]), type text
    ),
    ClientesClave = Table.AddColumn(
        ClientesBase, "_clienteKey", each NormalizarNombre([Nombre]), type text
    ),
    ClientesUnicos = Table.Group(
        ClientesClave,
        {{"_clienteKey"}},
        {{{{"ClienteRow", each Table.First(_), type record}}}}
    ),
    Cruzado = Table.NestedJoin(
        HistorialClave, {{"_clienteKey"}},
        ClientesUnicos, {{"_clienteKey"}},
        "ClienteMatch", JoinKind.LeftOuter
    ),
    ClienteRow = Table.AddColumn(
        Cruzado,
        "_clienteRow",
        each if Table.IsEmpty([ClienteMatch]) then null else [ClienteMatch]{{0}}[ClienteRow],
        type nullable record
    ),
    Domicilio = Table.AddColumn(
        ClienteRow, "domicilio",
        each if [_clienteRow] = null then "" else Record.FieldOrDefault([_clienteRow], "Domicilio", ""),
        type text
    ),
    Contacto = Table.AddColumn(
        Domicilio, "contacto",
        each if [_clienteRow] = null then "" else Record.FieldOrDefault([_clienteRow], "Contacto", ""),
        type text
    ),
    Correo = Table.AddColumn(
        Contacto, "correo",
        each if [_clienteRow] = null then "" else Record.FieldOrDefault([_clienteRow], "Correo", ""),
        type text
    ),
    Telefono = Table.AddColumn(
        Correo, "telefono",
        each if [_clienteRow] = null then "" else Record.FieldOrDefault([_clienteRow], "Telefono", ""),
        type text
    ),
    Resultado = Table.SelectColumns(
        Telefono,
        {m_list(HIST_COLUMNS + ["domicilio", "contacto", "correo", "telefono"])}
    )
in
    Resultado'''

M_CLIENTES = f'''let
    Url = "{API_BASE}&formato=clientes",
    Fuente = Json.Document(Web.Contents(Url)),
    Tabla = Table.FromRecords(Fuente, {m_list(CLIENT_COLUMNS)}, MissingField.UseNull),
    Limpio = Table.TransformColumns(
        Tabla,
        List.Transform(
            {m_list(CLIENT_COLUMNS)},
            each {{_, (v) => if v = null then "" else Text.Trim(Text.From(v)), type text}}
        )
    )
in
    Limpio'''

M_PATRONES = f'''let
    Url = "{API_BASE}&formato=patrones",
    Fuente = Json.Document(Web.Contents(Url)),
    Tabla = Table.FromRecords(Fuente, {m_list(PATRON_COLUMNS)}, MissingField.UseNull),
    Fechas = Table.TransformColumns(
        Tabla,
        {{
            {{"fechaUltimaCalibracion", each try Date.FromText(Text.Start(Text.From(_), 10)) otherwise null, type date}},
            {{"fechaVencimiento", each try Date.FromText(Text.Start(Text.From(_), 10)) otherwise null, type date}}
        }}
    )
in
    Fechas'''


def delete_query_if_exists(wb, name: str) -> None:
    try:
        wb.Queries.Item(name).Delete()
    except Exception:
        pass


def delete_connection_if_exists(wb, name: str) -> None:
    try:
        wb.Connections.Item(name).Delete()
    except Exception:
        pass


def ensure_sheet(wb, name: str):
    try:
        return wb.Worksheets(name)
    except Exception:
        ws = wb.Worksheets.Add()
        ws.Name = name[:31]
        return ws


def clear_sheet(ws) -> None:
    while ws.ListObjects.Count > 0:
        ws.ListObjects(1).Delete()
    ws.Cells.Clear()


def load_query_to_sheet(wb, query_name: str, ws, table_name: str) -> None:
    clear_sheet(ws)
    conn_name = f"Query - {query_name}"
    delete_connection_if_exists(wb, conn_name)

    source = (
        "OLEDB;Provider=Microsoft.Mashup.OleDb.1;"
        f'Data Source=$Workbook$;Location="{query_name}";Extended Properties=""'
    )
    table = ws.ListObjects.Add(0, source, False, 1, ws.Range("A1"))
    query = table.QueryTable
    query.CommandType = 2
    query.CommandText = [f"SELECT * FROM [{query_name}]"]
    query.BackgroundQuery = False
    query.PreserveFormatting = True
    query.RefreshOnFileOpen = True
    query.RefreshPeriod = 0
    query.Refresh(False)

    table.Name = table_name
    table.DisplayName = table_name

    # Algunas versiones de Excel crean la conexión con nombre localizado o
    # no la exponen hasta guardar. QueryTable.RefreshOnFileOpen ya garantiza
    # el refresco; configurar la conexión es una mejora adicional.
    connection = None
    try:
        connection = wb.Connections.Item(conn_name)
    except Exception:
        for index in range(1, wb.Connections.Count + 1):
            candidate = wb.Connections.Item(index)
            if query_name.lower() in str(candidate.Name).lower():
                connection = candidate
                break

    if connection is not None:
        connection.RefreshWithRefreshAll = True
        try:
            connection.OLEDBConnection.BackgroundQuery = False
            connection.OLEDBConnection.RefreshOnFileOpen = True
            connection.OLEDBConnection.RefreshPeriod = 0
        except Exception:
            pass


def configure_calculation(excel, wb) -> None:
    # Al terminar cada actualización, las fórmulas INDEX/MATCH se recalculan.
    try:
        excel.Calculation = -4105  # xlCalculationAutomatic
    except Exception:
        pass
    try:
        wb.ForceFullCalculation = True
        wb.FullCalculationOnLoad = True
    except Exception:
        pass


def main() -> int:
    if not MASTER.exists():
        print(f"No existe: {MASTER}")
        return 1

    backup = MASTER.with_name(
        f"{MASTER.stem}_backup_auto_{datetime.now():%Y%m%d_%H%M%S}{MASTER.suffix}"
    )
    shutil.copy2(MASTER, backup)
    print(f"Respaldo: {backup.name}")

    pythoncom.CoInitialize()
    excel = win32com.client.DispatchEx("Excel.Application")
    excel.Visible = False
    excel.DisplayAlerts = False
    excel.AskToUpdateLinks = False

    wb = None
    try:
        print(f"Abriendo: {MASTER.name}")
        wb = excel.Workbooks.Open(str(MASTER.resolve()), UpdateLinks=0, ReadOnly=False)
        if wb.ReadOnly:
            raise RuntimeError("Excel abrió el archivo como solo lectura. Ciérralo e intenta otra vez.")

        try:
            wb.Queries.FastCombine = True
        except Exception:
            pass

        query_defs = (
            ("AG_API_Historial_Multimetro", M_HISTORIAL, HIST_SHEET, "AG_Historial"),
            ("AG_API_Clientes_Multimetro", M_CLIENTES, CLIENTES_SHEET, "AG_Clientes"),
            ("AG_API_Patrones_Multimetro", M_PATRONES, PATRONES_SHEET, "AG_Patrones"),
        )

        print("Creando consultas automáticas...")
        for query_name, _, _, _ in query_defs:
            delete_query_if_exists(wb, query_name)
            delete_connection_if_exists(wb, f"Query - {query_name}")

        for query_name, formula, sheet_name, table_name in query_defs:
            print(f"  {query_name} -> {sheet_name}")
            wb.Queries.Add(query_name, formula)
            ws = ensure_sheet(wb, sheet_name)
            load_query_to_sheet(wb, query_name, ws, table_name)

        configure_calculation(excel, wb)
        excel.CalculateUntilAsyncQueriesDone()
        excel.CalculateFullRebuild()
        time.sleep(2)

        wb.Save()
        print("Guardado con actualización automática al abrir.")
        return 0
    except Exception as exc:
        print(f"ERROR: {exc}")
        import traceback

        traceback.print_exc()
        print(f"El respaldo quedó intacto: {backup}")
        return 1
    finally:
        if wb is not None:
            try:
                wb.Close(SaveChanges=False)
            except Exception:
                pass
        excel.Quit()
        pythoncom.CoUninitialize()


if __name__ == "__main__":
    raise SystemExit(main())
