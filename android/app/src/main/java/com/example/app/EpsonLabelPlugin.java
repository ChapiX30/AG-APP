package com.example.app; // ← Verifica que coincida con tu package name real

import android.Manifest;
import android.annotation.SuppressLint;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Typeface;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;

import androidx.core.app.ActivityCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import com.epson.lwprint.sdk.LWPrint;
import com.epson.lwprint.sdk.LWPrintCallback;
import com.epson.lwprint.sdk.LWPrintParameterKey;
import com.epson.lwprint.sdk.LWPrintPrintingPhase;
import com.epson.lwprint.sdk.LWPrintTapeWidth;

import java.util.HashMap;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@SuppressLint("MissingPermission")
@CapacitorPlugin(name = "EpsonLabel", permissions = {
        @Permission(alias = "bluetooth", strings = {
                Manifest.permission.BLUETOOTH,
                Manifest.permission.BLUETOOTH_ADMIN
        }),
        @Permission(alias = "bluetoothConnect", strings = {
                "android.permission.BLUETOOTH_CONNECT",
                "android.permission.BLUETOOTH_SCAN"
        })
})
public class EpsonLabelPlugin extends Plugin {

    private static final String TAG = "EpsonLabel";

    private LWPrint lwprint;
    private boolean isPrinting = false;
    private LWPrintCallback myPrintCallback;

    @Override
    public void load() {
        lwprint = new LWPrint(getContext());
        Log.d(TAG, "Plugin cargado (Bluetooth Mode Directo).");
    }

    @PluginMethod
    public void printLabel(final PluginCall call) {
        if (isPrinting) {
            call.reject("BUSY", "La impresora está ocupada. Intenta en unos segundos.");
            return;
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            if (ActivityCompat.checkSelfPermission(getContext(), Manifest.permission.BLUETOOTH_CONNECT) != PackageManager.PERMISSION_GRANTED) {
                requestPermissionForAlias("bluetoothConnect", call, "bluetoothPermissionCallback");
                return;
            }
        }

        executePrint(call);
    }

    @PermissionCallback
    private void bluetoothPermissionCallback(PluginCall call) {
        if (ActivityCompat.checkSelfPermission(getContext(), Manifest.permission.BLUETOOTH_CONNECT) == PackageManager.PERMISSION_GRANTED) {
            executePrint(call);
        } else {
            call.reject("PERMISSION_DENIED", "Permiso Bluetooth denegado.");
        }
    }

    private void executePrint(final PluginCall call) {
        isPrinting = true;
        call.setKeepAlive(true);

        // Temporizador de seguridad (15 seg)
        new Handler(Looper.getMainLooper()).postDelayed(() -> {
            if (isPrinting) {
                Log.w(TAG, "Liberando bloqueo por timeout de 15s.");
                isPrinting = false;
            }
        }, 15000);

        // Extracción blindada
        String rawId = call.getString("id");
        final String id = rawId != null ? rawId : "SIN-ID";
        String rawFCal = call.getString("fechaCal");
        final String fCal = rawFCal != null ? rawFCal : "N/A";
        String rawFSug = call.getString("fechaSug");
        final String fSug = rawFSug != null ? rawFSug : "N/A";
        String rawCert = call.getString("certificado");
        final String cert = rawCert != null ? rawCert : "PEND";
        String rawTec = call.getString("calibro");
        final String tec = rawTec != null ? rawTec : "AG";
        String rawSize = call.getString("tapeSize");
        final String size = rawSize != null ? rawSize : "24mm";

        BluetoothAdapter btAdapter = BluetoothAdapter.getDefaultAdapter();
        if (btAdapter == null || !btAdapter.isEnabled()) {
            failOnMainThread(call, "BT_DISABLED", "Enciende el Bluetooth de la tablet.");
            return;
        }

        BluetoothDevice targetDevice = null;
        Set<BluetoothDevice> bonded = btAdapter.getBondedDevices();
        if (bonded != null) {
            for (BluetoothDevice d : bonded) {
                String name = d.getName();
                if (name != null && (name.toUpperCase().contains("EPSON") || name.toUpperCase().contains("LW-600P") || name.toUpperCase().contains("PX400") || name.toUpperCase().contains("LW"))) {
                    targetDevice = d;
                    break;
                }
            }
        }

        if (targetDevice == null) {
            failOnMainThread(call, "PRINTER_NOT_FOUND", "No se encontró la etiquetadora vinculada.");
            return;
        }

        this.myPrintCallback = new LWPrintCallback() {
            @Override
            public void onChangePrintOperationPhase(LWPrint lw, int phase) {
                Log.d(TAG, "📡 FASE EPSON: " + phase);
                if (phase == LWPrintPrintingPhase.Complete) {
                    new Handler(Looper.getMainLooper()).post(() -> {
                        isPrinting = false;
                        JSObject res = new JSObject();
                        res.put("success", true);
                        call.resolve(res);
                        call.setKeepAlive(false);
                    });
                }
            }
            @Override
            public void onChangeTapeFeedOperationPhase(LWPrint lw, int phase) {}
            @Override
            public void onAbortPrintOperation(LWPrint lw, int errorStatus, int deviceStatus) {
                Log.e(TAG, "❌ ABORTADA. Código: " + deviceStatus);
                failOnMainThread(call, "PRINT_ABORTED", "Abortada. Revisa la cinta. Código: " + deviceStatus);
            }
            @Override
            public void onSuspendPrintOperation(LWPrint l, int err, int status) {
                l.cancelPrint();
                failOnMainThread(call, "PRINT_SUSPENDED", "Impresión suspendida.");
            }
            @Override
            public void onAbortTapeFeedOperation(LWPrint l, int err, int status) {}
        };

        lwprint.setCallback(this.myPrintCallback);

        final BluetoothDevice finalDevice = targetDevice;
        ExecutorService executor = Executors.newSingleThreadExecutor();
        executor.execute(() -> {
            try {
                Log.d(TAG, "1. Hilo de fondo iniciado. Configurando printerInfo...");
                Map<String, String> printerInfo = new HashMap<>();
                printerInfo.put("name", "LW-600P"); // El nombre verdadero
                printerInfo.put("product", "LW-600P");
                printerInfo.put("mac_address", finalDevice.getAddress());
                printerInfo.put("address", finalDevice.getAddress());
                printerInfo.put("type", "bluetooth");

                lwprint.setPrinterInformation(printerInfo);
                Log.d(TAG, "2. Información inyectada. Creando Bitmap...");

                // BYPASS GIGANTE: Nos saltamos fetchPrinterStatus() y vamos directo al tamaño
                int tapeWidth = "12mm".equals(size) ? LWPrintTapeWidth.Normal_12mm : LWPrintTapeWidth.Normal_24mm;
                int printableHeight = lwprint.getPrintableSizeFromTape(tapeWidth);
                int resolution = lwprint.getResolution();
                
                Bitmap bmp = createLabelBitmap(id, fCal, fSug, cert, tec, printableHeight, resolution);
                Log.d(TAG, "3. Bitmap generado. Configurando parámetros de impresión...");

                Map<String, Object> params = new HashMap<>();
                params.put(LWPrintParameterKey.Copies, 1);
                params.put(LWPrintParameterKey.TapeWidth, tapeWidth);

                Log.d(TAG, "4. ¡FUEGO! Disparando doPrint()...");
                lwprint.doPrint(bmp, params);
                Log.d(TAG, "5. Comando enviado a la cola del Bluetooth.");

            } catch (Exception e) {
                Log.e(TAG, "CRASH en hilo de fondo: " + e.getMessage());
                failOnMainThread(call, "PRINT_CRASH", e.getMessage());
            }
        });
    }

    private Bitmap createLabelBitmap(String id, String fCal, String fSug, String cert, String tec, int printableHeight, int resolution) {
        float mmToPixel = resolution / 25.4f;
        int width  = (int)(60f * mmToPixel); // 60mm de largo para seguridad del cabezal
        int height = printableHeight;

        // ARGB_8888 obligatorio para que la Epson no aborte en silencio
        Bitmap bmp = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(bmp);
        canvas.drawColor(Color.WHITE);

        Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        paint.setColor(Color.BLACK);
        float margin = 1f * mmToPixel;

        paint.setTypeface(Typeface.DEFAULT_BOLD);
        paint.setTextSize(height * 0.38f);
        canvas.drawText(id, margin, height * 0.42f, paint);

        paint.setStrokeWidth(2f);
        canvas.drawLine(margin, height * 0.47f, width - margin, height * 0.47f, paint);

        paint.setTypeface(Typeface.DEFAULT);
        paint.setTextSize(height * 0.20f);
        canvas.drawText("Cal: "   + fCal, margin, height * 0.66f, paint);
        canvas.drawText("Vence: " + fSug, margin, height * 0.87f, paint);

        paint.setTextSize(height * 0.17f);
        float col2 = width * 0.52f;
        canvas.drawText("C:" + cert, col2, height * 0.66f, paint);
        canvas.drawText("T:" + (tec.length() > 4 ? tec.substring(0, 4) : tec), col2, height * 0.87f, paint);

        return bmp;
    }

    private void failOnMainThread(PluginCall call, String code, String message) {
        new Handler(Looper.getMainLooper()).post(() -> {
            isPrinting = false;
            call.reject(code, message);
            call.setKeepAlive(false);
        });
    }
}