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

// ✅ Imports correctos del SDK real
import com.epson.lwprint.sdk.LWPrint;
import com.epson.lwprint.sdk.LWPrintCallback;
import com.epson.lwprint.sdk.LWPrintDiscoverPrinter;
import com.epson.lwprint.sdk.LWPrintParameterKey;
import com.epson.lwprint.sdk.LWPrintPrintingPhase;
import com.epson.lwprint.sdk.LWPrintStatusError;
import com.epson.lwprint.sdk.LWPrintTapeCut;
import com.epson.lwprint.sdk.LWPrintTapeWidth;

import java.util.HashMap;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@SuppressWarnings({"deprecation"})
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

    // ✅ Una sola instancia de LWPrint (igual que el sample oficial)
    private LWPrint lwprint;
    private boolean isPrinting = false;

    // ─────────────────────────────────────────────────
    // INICIALIZACIÓN — se ejecuta al cargar el plugin
    // ─────────────────────────────────────────────────
    @Override
    public void load() {
        // ✅ Crear instancia con el Context (igual que el sample)
        lwprint = new LWPrint(getContext());
        Log.d(TAG, "LWPrint instanciado correctamente");
    }

    // ─────────────────────────────────────────────────
    // ENTRY POINT — llamado desde React/TypeScript
    // ─────────────────────────────────────────────────
    @PluginMethod
    public void printLabel(final PluginCall call) {

        if (isPrinting) {
            call.reject("BUSY", "La impresora está ocupada, espera a que termine");
            return;
        }

        // Verificar permisos en Android 12+
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            if (ActivityCompat.checkSelfPermission(
                    getContext(), Manifest.permission.BLUETOOTH_CONNECT)
                    != PackageManager.PERMISSION_GRANTED) {
                requestPermissionForAlias("bluetoothConnect", call, "bluetoothPermissionCallback");
                return;
            }
        }

        executePrint(call);
    }

    @PermissionCallback
    private void bluetoothPermissionCallback(PluginCall call) {
        if (ActivityCompat.checkSelfPermission(
                getContext(), Manifest.permission.BLUETOOTH_CONNECT)
                == PackageManager.PERMISSION_GRANTED) {
            executePrint(call);
        } else {
            call.reject("PERMISSION_DENIED", "Permisos Bluetooth denegados por el usuario");
        }
    }

    // ─────────────────────────────────────────────────
    // LÓGICA PRINCIPAL DE IMPRESIÓN
    // ─────────────────────────────────────────────────
    private void executePrint(final PluginCall call) {

        isPrinting = true;
        call.setKeepAlive(true);

        final String id   = call.getString("id", "SIN-ID");
        final String fCal = call.getString("fechaCal", "N/A");
        final String fSug = call.getString("fechaSug", "N/A");
        final String cert = call.getString("certificado", "PEND");
        final String tec  = call.getString("calibro", "AG");
        final String size = call.getString("tapeSize", "24mm");

        Log.d(TAG, "🚀 executePrint → id=" + id + " size=" + size);

        // Verificar Bluetooth
        BluetoothAdapter btAdapter = BluetoothAdapter.getDefaultAdapter();
        if (btAdapter == null || !btAdapter.isEnabled()) {
            isPrinting = false;
            call.reject("BT_DISABLED", "Bluetooth está desactivado");
            call.setKeepAlive(false);
            return;
        }

        // Buscar impresora pareada
        final BluetoothDevice targetDevice = findPairedPrinter(btAdapter);
        if (targetDevice == null) {
            isPrinting = false;
            call.reject("PRINTER_NOT_FOUND",
                "No se encontró la impresora. Verifícala en Ajustes → Bluetooth del teléfono.");
            call.setKeepAlive(false);
            return;
        }

        Log.d(TAG, "✅ Impresora encontrada: " + targetDevice.getName()
                + " [" + targetDevice.getAddress() + "]");

        // ✅ Registrar callback ANTES de imprimir (igual que el sample)
        lwprint.setCallback(new LWPrintCallback() {

            @Override
            public void onChangePrintOperationPhase(LWPrint lw, int phase) {
                Log.d(TAG, "📡 Fase: " + phase);

                // ✅ Usar la constante real del SDK, no un número hardcodeado
                if (phase == LWPrintPrintingPhase.Complete) {
                    Log.d(TAG, "✅ Impresión completada");
                    new Handler(Looper.getMainLooper()).post(() -> {
                        JSObject res = new JSObject();
                        res.put("success", true);
                        call.resolve(res);
                        call.setKeepAlive(false);
                        isPrinting = false;
                    });
                }
            }

            @Override
            public void onChangeTapeFeedOperationPhase(LWPrint lw, int phase) {
                Log.d(TAG, "📡 TapeFeed fase: " + phase);
            }

            @Override
            public void onAbortPrintOperation(LWPrint lw, int errorStatus, int deviceStatus) {
                // ❌ Error fatal — no se puede recuperar
                Log.e(TAG, "❌ Abort: errorStatus=" + errorStatus
                        + " deviceStatus=0x" + Integer.toHexString(deviceStatus));
                new Handler(Looper.getMainLooper()).post(() -> {
                    call.reject("PRINT_ABORTED",
                        "Error de impresión (0x" + Integer.toHexString(deviceStatus) + "). "
                        + "Verifica que la impresora esté encendida y con cinta.");
                    call.setKeepAlive(false);
                    isPrinting = false;
                });
            }

            @Override
            public void onSuspendPrintOperation(LWPrint lw, int errorStatus, int deviceStatus) {
                // ⚠️ Error recuperable (cubierta abierta, sin cinta, etc.)
                Log.w(TAG, "⚠️ Suspend: errorStatus=" + errorStatus
                        + " deviceStatus=0x" + Integer.toHexString(deviceStatus));
                // Cancelar en lugar de pedir reintento
                lw.cancelPrint();
                new Handler(Looper.getMainLooper()).post(() -> {
                    call.reject("PRINT_SUSPENDED",
                        "Impresión detenida (0x" + Integer.toHexString(deviceStatus) + "). "
                        + "Revisa la cinta o la cubierta de la impresora.");
                    call.setKeepAlive(false);
                    isPrinting = false;
                });
            }

            @Override
            public void onAbortTapeFeedOperation(LWPrint lw, int errorStatus, int deviceStatus) {
                Log.e(TAG, "❌ AbortTapeFeed: " + deviceStatus);
                new Handler(Looper.getMainLooper()).post(() -> {
                    call.reject("TAPE_FEED_ERROR",
                        "Error al cortar la cinta (0x" + Integer.toHexString(deviceStatus) + ").");
                    call.setKeepAlive(false);
                    isPrinting = false;
                });
            }
        });

        // ✅ Ejecutar en hilo secundario (el SDK bloquea mientras imprime)
        ExecutorService executor = Executors.newSingleThreadExecutor();
        executor.execute(() -> {
            try {
                // ── Paso 1: Configurar printerInfo con las keys correctas del SDK ──
                Map<String, String> printerInfo = new HashMap<>();
                printerInfo.put(LWPrintDiscoverPrinter.PRINTER_INFO_NAME,
                        targetDevice.getName());
                printerInfo.put(LWPrintDiscoverPrinter.PRINTER_INFO_PRODUCT,
                        targetDevice.getName());
                printerInfo.put(LWPrintDiscoverPrinter.PRINTER_INFO_HOST,
                        targetDevice.getAddress());
                printerInfo.put(LWPrintDiscoverPrinter.PRINTER_INFO_PORT, "");
                printerInfo.put(LWPrintDiscoverPrinter.PRINTER_INFO_TYPE,
                        LWPrintDiscoverPrinter.PRINTER_TYPE_BLUETOOTH);
                printerInfo.put(LWPrintDiscoverPrinter.PRINTER_INFO_USBMDL, "");
                printerInfo.put(LWPrintDiscoverPrinter.PRINTER_INFO_DOMAIN, "");
                printerInfo.put(LWPrintDiscoverPrinter.PRINTER_INFO_SERIAL_NUMBER, "");
                printerInfo.put(LWPrintDiscoverPrinter.PRINTER_INFO_DEVICE_CLASS, "");
                printerInfo.put(LWPrintDiscoverPrinter.PRINTER_INFO_DEVICE_STATUS, "");

                lwprint.setPrinterInformation(printerInfo);
                Log.d(TAG, "📡 printerInfo configurado");

                // ── Paso 2: Obtener estado de la impresora ──
                Map<String, Integer> lwStatus = lwprint.fetchPrinterStatus();
                Log.d(TAG, "📡 fetchPrinterStatus → " + (lwStatus != null ? lwStatus.toString() : "null"));

                if (lwStatus == null || lwStatus.isEmpty()) {
                    failOnMainThread(call, "CONNECT_FAILED",
                        "No se pudo conectar a la impresora. ¿Está encendida?");
                    return;
                }

                int deviceError = lwprint.getDeviceErrorFromStatus(lwStatus);
                if (deviceError == LWPrintStatusError.ConnectionFailed) {
                    failOnMainThread(call, "CONNECT_FAILED",
                        "Conexión rechazada por la impresora.");
                    return;
                }

                // ── Paso 3: Determinar ancho real de cinta ──
                int tapeWidth = lwprint.getTapeWidthFromStatus(lwStatus);
                Log.d(TAG, "📏 tapeWidth detectado: " + tapeWidth);

                if (tapeWidth == LWPrintTapeWidth.None || tapeWidth == LWPrintTapeWidth.Unknown) {
                    // Fallback al parámetro recibido desde React
                    tapeWidth = size.equals("12mm")
                            ? LWPrintTapeWidth.Normal_12mm
                            : LWPrintTapeWidth.Normal_24mm;
                    Log.d(TAG, "⚠️ tapeWidth no detectado, usando fallback: " + tapeWidth);
                }

                // ── Paso 4: Obtener dimensiones reales para el bitmap ──
                int printableHeight = lwprint.getPrintableSizeFromTape(tapeWidth);
                int resolution      = lwprint.getResolution();
                Log.d(TAG, "📐 printableHeight=" + printableHeight + " resolution=" + resolution);

                // ── Paso 5: Construir el bitmap de la etiqueta ──
                Bitmap labelBitmap = createLabelBitmap(
                        id, fCal, fSug, cert, tec,
                        printableHeight, resolution
                );

                // ── Paso 6: Parámetros de impresión ──
                Map<String, Object> params = new HashMap<>();
                params.put(LWPrintParameterKey.Copies, 1);
                params.put(LWPrintParameterKey.TapeCut, LWPrintTapeCut.EachLabel);
                params.put(LWPrintParameterKey.HalfCut, lwprint.isSupportHalfCut());
                params.put(LWPrintParameterKey.PrintSpeed, false);
                params.put(LWPrintParameterKey.Density, 0);
                params.put(LWPrintParameterKey.TapeWidth, tapeWidth);

                // ── Paso 7: ¡Imprimir! ──
                Log.d(TAG, "🖨️ Llamando doPrint...");
                lwprint.doPrint(labelBitmap, params);
                // El resultado llega de forma asíncrona en el callback de arriba

            } catch (Exception e) {
                Log.e(TAG, "💥 Excepción al imprimir", e);
                failOnMainThread(call, "PRINT_CRASH", "Error inesperado: " + e.getMessage());
            }
        });
    }

    // ─────────────────────────────────────────────────
    // BITMAP — dimensiones reales del SDK
    // ─────────────────────────────────────────────────
    private Bitmap createLabelBitmap(
            String id, String fCal, String fSug,
            String cert, String tec,
            int printableHeight, int resolution) {

        // Convertir 40mm a pixels según el DPI real de la impresora
        float mmToPixel = resolution / 25.4f;
        int width  = (int)(40f * mmToPixel);
        int height = printableHeight;

        Log.d(TAG, "🖼️ Bitmap: " + width + "x" + height + " px");

        Bitmap bmp = Bitmap.createBitmap(width, height, Bitmap.Config.RGB_565);
        Canvas canvas = new Canvas(bmp);
        canvas.drawColor(Color.WHITE);

        Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        paint.setColor(Color.BLACK);

        float margin = 1f * mmToPixel; // 1mm de margen

        // ID — texto grande
        paint.setTypeface(Typeface.DEFAULT_BOLD);
        paint.setTextSize(height * 0.38f);
        canvas.drawText(id, margin, height * 0.42f, paint);

        // Línea separadora
        paint.setStrokeWidth(2f);
        canvas.drawLine(margin, height * 0.47f, width - margin, height * 0.47f, paint);

        // Fechas
        paint.setTypeface(Typeface.DEFAULT);
        paint.setTextSize(height * 0.20f);
        canvas.drawText("Cal: " + fCal,    margin, height * 0.66f, paint);
        canvas.drawText("Vence: " + fSug,  margin, height * 0.87f, paint);

        // Cert y Técnico (columna derecha)
        paint.setTextSize(height * 0.17f);
        float col2 = width * 0.52f;
        canvas.drawText("C:" + cert, col2, height * 0.66f, paint);
        canvas.drawText("T:" + (tec.length() > 4 ? tec.substring(0, 4) : tec),
                col2, height * 0.87f, paint);

        return bmp;
    }

    // ─────────────────────────────────────────────────
    // DETECCIÓN DE IMPRESORA PAREADA
    // ─────────────────────────────────────────────────
    private BluetoothDevice findPairedPrinter(BluetoothAdapter adapter) {

        Set<BluetoothDevice> bonded = adapter.getBondedDevices();
        if (bonded == null || bonded.isEmpty()) {
            Log.w(TAG, "⚠️ No hay dispositivos Bluetooth pareados");
            return null;
        }

        for (BluetoothDevice d : bonded) {
            String name = d.getName();
            Log.d(TAG, "🔍 Dispositivo pareado: " + name + " [" + d.getAddress() + "]");

            if (name != null && (
                    name.toUpperCase().contains("EPSON") ||
                    name.toUpperCase().contains("LW-PX") ||
                    name.toUpperCase().contains("LW") ||
                    name.toUpperCase().contains("LABELWORKS"))) {
                Log.d(TAG, "✅ Impresora Epson encontrada: " + name);
                return d;
            }
        }

        Log.w(TAG, "❌ Ningún dispositivo pareado coincide con Epson/LW");
        return null;
    }

    // ─────────────────────────────────────────────────
    // HELPERS
    // ─────────────────────────────────────────────────
    private void failOnMainThread(PluginCall call, String code, String message) {
        isPrinting = false;
        new Handler(Looper.getMainLooper()).post(() -> {
            call.reject(code, message);
            call.setKeepAlive(false);
        });
    }
}