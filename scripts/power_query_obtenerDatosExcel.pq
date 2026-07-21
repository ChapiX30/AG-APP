let
    // Pega esto en Excel: Datos → Obtener datos → Desde otras orígenes → Consulta en blanco → Editor avanzado
    // Actualiza al abrir el libro (Propiedades de consulta → Actualizar al abrir el archivo)

    Url = "https://us-central1-agg1-b7f40.cloudfunctions.net/obtenerDatosExcel?key=TU_CLAVE_SECRETA_AG_APP_2026&prefijo=AGP&formato=tabla",
    Fuente = Json.Document(Web.Contents(Url)),
    Tabla = Table.FromList(Fuente, Splitter.SplitByNothing(), null, null, ExtraValues.Error),
    Expandir = Table.ExpandRecordColumn(
        Tabla,
        "Column1",
        {
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
            "fechaRecepcion"
        }
    )
in
    Expandir
