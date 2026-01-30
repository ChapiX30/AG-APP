package com.example.app;

import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.util.Base64;
import android.util.Log;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

// Imports del SDK Epson (Asegúrate de que estos coinciden con lo que te sugiere el IDE)
import com.epson.lwprint.sdk.LWPrint;
import com.epson.lwprint.sdk.LWPrintCallback;
import com.epson.lwprint.sdk.LWPrintDataProvider;
import com.epson.lwprint.sdk.LWPrintParameterKey;
import com.epson.lwprint.sdk.LWPrintTapeCut;
import com.epson.lwprint.sdk.LWPrintTapeWidth;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.util.HashMap;
import java.util.Map;

@CapacitorPlugin(name = "EpsonLabel")
public class EpsonLabelPlugin extends Plugin {

    private LWPrint printer;

    @Override
    public void load() {
        super.load();
        try {
            printer = new LWPrint(getActivity().getApplicationContext());
        } catch (Exception e) {
            Log.e("EpsonLabel", "Error init: " + e.getMessage());
        }
    }

    @PluginMethod
    public void printBase64(PluginCall call) {
        String base64Image = call.getString("base64");
        if (base64Image == null) {
            call.reject("Falta imagen base64");
            return;
        }

        new Thread(() -> {
            try {
                // 1. Decodificar Base64 a Bitmap
                byte[] decodedString = Base64.decode(base64Image, Base64.DEFAULT);
                Bitmap bitmap = BitmapFactory.decodeByteArray(decodedString, 0, decodedString.length);

                if (bitmap == null) {
                    call.reject("Error al decodificar imagen");
                    return;
                }

                // 2. Convertir Bitmap a InputStream (Formato PNG)
                ByteArrayOutputStream stream = new ByteArrayOutputStream();
                bitmap.compress(Bitmap.CompressFormat.PNG, 100, stream);
                final InputStream imageStream = new ByteArrayInputStream(stream.toByteArray());
                final int dataLength = stream.size();

                // 3. Configurar Parámetros
                Map<String, Object> printSettings = new HashMap<>();
                
                // === CORRECCIÓN DE CONSTANTES ===
                // Si estas líneas salen en ROJO, bórralas y escribe el punto "." de nuevo
                // para elegir la opción que te de la lista.
                
                // Ejemplo: Borra ".TapeWidth_24MM" y escribe "." -> Elige la opción correcta (ej: Width24)
                printSettings.put(LWPrintParameterKey.TapeWidth, LWPrintTapeWidth.TapeWidth_24MM);
                printSettings.put(LWPrintParameterKey.Copies, 1);
                // Ejemplo: Borra ".TapeCut_EachLabel" y escribe "." -> Elige la opción correcta
                printSettings.put(LWPrintParameterKey.TapeCut, LWPrintTapeCut.TapeCut_EachLabel);

                // 4. Implementar DataProvider (CORREGIDO)
                // He eliminado la línea .setBitmapImage() que daba error.
                LWPrintDataProvider dataProvider = new LWPrintDataProvider() {
                    @Override
                    public InputStream getInputStream() {
                        return imageStream;
                    }

                    @Override
                    public int getContentLength() {
                        return dataLength;
                    }
                    
                    // IMPORTANTE: Si aquí te sigue marcando error en "new LWPrintDataProvider()":
                    // 1. Haz clic sobre "LWPrintDataProvider"
                    // 2. Presiona ALT + ENTER
                    // 3. Elige "Implement methods"
                    // 4. Selecciona todos los que falten y dale OK.
                };

                // 5. Callback simple
                printer.setCallback(new LWPrintCallback() {
                    @Override
                    public void onChangePrintOperationPhase(LWPrint lWPrint, int phase) {
                        Log.d("EpsonLabel", "Fase: " + phase);
                    }
                    public void onChangeTapeFeedOperationPhase(LWPrint p, int i) {}
                    public void onAbortPrintOperation(LWPrint p, int e, int d) {}
                    public void onSuspendPrintOperation(LWPrint p, int i, int i1) {}
                    public void onAbortTapeFeedOperation(LWPrint p, int i, int i1) {}
                    public void onChangePrinterStatus(LWPrint p, int i, int i1) {}
                });

                // 6. Imprimir
                printer.doPrint(dataProvider, printSettings);
                call.resolve();

            } catch (Exception e) {
                e.printStackTrace();
                call.reject("Error Epson: " + e.getMessage());
            }
        }).start();
    }
}