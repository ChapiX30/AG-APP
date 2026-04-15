package com.example.app; // ⚠️ Cambia por tu package name real

import android.Manifest;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Rect;
import android.graphics.RectF;
import android.graphics.Typeface;
import android.os.Build;
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
import com.epson.lwprint.sdk.LWPrintConnectionStatus;
import com.epson.lwprint.sdk.LWPrintDraw;
import com.epson.lwprint.sdk.LWPrintForApp;
import com.epson.lwprint.sdk.LWPrintParameterKey;
import com.epson.lwprint.sdk.LWPrintStatusError;
import com.epson.lwprint.sdk.LWPrintTapeWidth;

import java.util.HashMap;
import java.util.Map;
import java.util.Set;

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

    // ── Nombre exacto del dispositivo tal como aparece en Ajustes → Bluetooth
    // Usa findEpsonPrinters() para verificar el nombre correcto
    private static final String PRINTER_NAME = "EPSON LW-PX400";

    // ── Dimensiones de impresión (px a 180dpi)
    // 24mm → LWPrintTapeWidth.Normal_24mm = 6 → altura imprimible ~170px
    // 12mm → LWPrintTapeWidth.Normal_12mm = 4 → altura imprimible ~85px
    private static final int LABEL_WIDTH_24MM = 600;
    private static final int LABEL_HEIGHT_24MM = 170;
    private static final int LABEL_WIDTH_12MM = 600;
    private static final int LABEL_HEIGHT_12MM = 85;

    // =========================================================================
    // printLabel — método principal llamado desde React/Capacitor
    // =========================================================================
    @PluginMethod
    public void printLabel(final PluginCall call) {
        final String id = call.getString("id", "SIN-ID");
        final String fechaCal = call.getString("fechaCal", "N/A");
        final String fechaSug = call.getString("fechaSug", "N/A");
        final String certificado = call.getString("certificado", "PEND");
        final String calibro = call.getString("calibro", "AG");
        final String tapeSize = call.getString("tapeSize", "24mm");

        Log.d(TAG, "printLabel() → id=" + id + " cal=" + fechaCal
                + " sug=" + fechaSug + " cert=" + certificado
                + " tec=" + calibro + " tape=" + tapeSize);

        // Solicitar permiso BLUETOOTH_CONNECT en Android 12+
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            if (ActivityCompat.checkSelfPermission(getContext(),
                    Manifest.permission.BLUETOOTH_CONNECT) != PackageManager.PERMISSION_GRANTED) {
                requestPermissionForAlias("bluetoothConnect", call, "bluetoothPermissionCallback");
                return;
            }
        }

        // Imprimir en hilo separado para no bloquear el hilo principal
        new Thread(() -> executePrint(call, id, fechaCal, fechaSug, certificado, calibro, tapeSize)).start();
    }

    @PermissionCallback
    private void bluetoothPermissionCallback(PluginCall call) {
        if (getPermissionState("bluetoothConnect") == com.getcapacitor.PermissionState.GRANTED) {
            String id = call.getString("id", "SIN-ID");
            String fechaCal = call.getString("fechaCal", "N/A");
            String fechaSug = call.getString("fechaSug", "N/A");
            String certificado = call.getString("certificado", "PEND");
            String calibro = call.getString("calibro", "AG");
            String tapeSize = call.getString("tapeSize", "24mm");
            new Thread(() -> executePrint(call, id, fechaCal, fechaSug, certificado, calibro, tapeSize)).start();
        } else {
            call.reject("PERMISSION_DENIED",
                    "Permiso Bluetooth requerido. Ve a Ajustes → Apps → [TuApp] → Permisos → Bluetooth.");
        }
    }

    // =========================================================================
    // findEpsonPrinters — diagnóstico: lista dispositivos BT emparejados
    // =========================================================================
    @PluginMethod
    public void findEpsonPrinters(PluginCall call) {
        try {
            BluetoothAdapter btAdapter = BluetoothAdapter.getDefaultAdapter();
            if (btAdapter == null) {
                call.reject("NO_BLUETOOTH", "Este dispositivo no tiene Bluetooth.");
                return;
            }
            if (!btAdapter.isEnabled()) {
                call.reject("BT_DISABLED", "El Bluetooth está apagado. Actívalo en Ajustes.");
                return;
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                if (ActivityCompat.checkSelfPermission(getContext(),
                        Manifest.permission.BLUETOOTH_CONNECT) != PackageManager.PERMISSION_GRANTED) {
                    call.reject("PERMISSION_DENIED", "Necesitas permiso BLUETOOTH_CONNECT.");
                    return;
                }
            }

            Set<BluetoothDevice> pairedDevices = btAdapter.getBondedDevices();
            com.getcapacitor.JSArray deviceList = new com.getcapacitor.JSArray();
            String foundTarget = null;

            for (BluetoothDevice device : pairedDevices) {
                String name = device.getName();
                String address = device.getAddress();
                Log.d(TAG, "Dispositivo emparejado: " + name + " [" + address + "]");

                JSObject dev = new JSObject();
                dev.put("name", name != null ? name : "Sin nombre");
                dev.put("address", address != null ? address : "");
                dev.put("isEpson",
                        name != null && (name.contains("EPSON") || name.contains("epson") || name.contains("LW")));

                if (name != null && (name.contains("PX400") || name.equals(PRINTER_NAME))) {
                    dev.put("isTarget", true);
                    foundTarget = name + " [" + address + "]";
                }
                deviceList.put(dev);
            }

            JSObject result = new JSObject();
            result.put("devices", deviceList);
            result.put("total", pairedDevices.size());
            result.put("targetPrinter", PRINTER_NAME);
            result.put("targetFound", foundTarget != null);
            result.put("targetDevice", foundTarget != null ? foundTarget
                    : "NO ENCONTRADA — empareja la impresora en Ajustes → Bluetooth");
            call.resolve(result);

        } catch (Exception e) {
            Log.e(TAG, "Error en findEpsonPrinters: " + e.getMessage(), e);
            call.reject("ERROR", "Error: " + e.getMessage());
        }
    }

    // =========================================================================
    // executePrint — lógica de impresión usando LWPrintForApp (SDK oficial)
    // =========================================================================
    private void executePrint(final PluginCall call,
            final String id,
            final String fechaCal,
            final String fechaSug,
            final String certificado,
            final String calibro,
            final String tapeSize) {
        try {
            // 1. Verificar Bluetooth activo
            BluetoothAdapter btAdapter = BluetoothAdapter.getDefaultAdapter();
            if (btAdapter == null || !btAdapter.isEnabled()) {
                call.reject("BT_DISABLED", "El Bluetooth está apagado.");
                return;
            }

            // 2. Verificar que la impresora esté emparejada
            BluetoothDevice targetDevice = findPairedPrinter(btAdapter);
            if (targetDevice == null) {
                call.reject("PRINTER_NOT_FOUND",
                        "La impresora '" + PRINTER_NAME + "' no está emparejada.\n"
                                + "Ve a Ajustes → Bluetooth, enciende la impresora y emparéjala.");
                return;
            }
            Log.d(TAG, "Impresora encontrada: " + targetDevice.getName()
                    + " [" + targetDevice.getAddress() + "]");

            // 3. Crear instancia LWPrintForApp (wrapper simplificado del SDK)
            // Constructor: LWPrintForApp(Context)
            LWPrintForApp lwPrintForApp = new LWPrintForApp(getContext());

            // 4. Ancho de cinta — se pasa en el Map de parámetros
            // LWPrintTapeWidth.Normal_24mm = 6
            // LWPrintTapeWidth.Normal_12mm = 4
            int tapeWidthConst = tapeSize.equals("12mm")
                    ? LWPrintTapeWidth.Normal_12mm // = 4
                    : LWPrintTapeWidth.Normal_24mm; // = 6

            // 5. Callback de estado — setDelegate() confirmado en LWPrintForApp
            lwPrintForApp.setDelegate(new LWPrintCallback() {
                @Override
                public void onChangePrintOperationPhase(LWPrint printer, int phase) {
                    Log.d(TAG, "Fase de impresión: " + phase);
                }

                @Override
                public void onSuspendPrintOperation(LWPrint printer, int connectionStatus, int statusError) {
                    Log.e(TAG, "Impresión suspendida — conn=" + connectionStatus + " err=" + statusError);
                    call.reject("PRINT_SUSPENDED", buildFriendlyError(connectionStatus, statusError));
                }

                @Override
                public void onAbortPrintOperation(LWPrint printer, int connectionStatus, int statusError) {
                    Log.e(TAG, "Impresión abortada — conn=" + connectionStatus + " err=" + statusError);
                    call.reject("PRINT_ABORTED", buildFriendlyError(connectionStatus, statusError));
                }

                @Override
                public void onChangeTapeFeedOperationPhase(LWPrint printer, int phase) {
                    Log.d(TAG, "Fase feed cinta: " + phase);
                }

                @Override
                public void onAbortTapeFeedOperation(LWPrint printer, int connectionStatus, int statusError) {
                    Log.e(TAG, "Feed cinta abortado — conn=" + connectionStatus + " err=" + statusError);
                }
            });

            // 7. Crear bitmap de la etiqueta con Canvas
            final Bitmap labelBitmap = createLabelBitmap(
                    id, fechaCal, fechaSug, certificado, calibro, tapeSize);
            final int labelW = labelBitmap.getWidth();
            final int labelH = labelBitmap.getHeight();

            // 8. LWPrintDraw — define dimensiones y cómo dibujar
            LWPrintDraw drawDelegate = new LWPrintDraw() {
                @Override
                public int getNumberOfPages() {
                    return 1;
                }

                @Override
                public int getContentWidthForPage(int pageIndex) {
                    return labelW;
                }

                @Override
                public int getContentHeightForPage(int pageIndex) {
                    return labelH;
                }

                @Override
                public int getContentMarginForPage(int pageIndex) {
                    return 0;
                }

                @Override
                public void drawContent(Canvas canvas, int pageIndex) {
                    canvas.drawBitmap(labelBitmap, null, new Rect(0, 0, labelW, labelH), null);
                }
            };

            // 9. Parámetros de impresión
            Map<String, Object> params = new HashMap<>();
            params.put(LWPrintParameterKey.TapeWidth, tapeWidthConst);
            params.put(LWPrintParameterKey.Copies, 1);
            params.put(LWPrintParameterKey.TapeCut, 1); // corte automático

            // 10. doPrint(LWPrintDraw, Map, ArrayList) — conecta BT, imprime y desconecta
            Log.d(TAG, "Llamando doPrint()...");
            lwPrintForApp.doPrint(drawDelegate, params, new java.util.ArrayList<>());

            Log.d(TAG, "doPrint() ejecutado correctamente.");
            JSObject result = new JSObject();
            result.put("success", true);
            result.put("printer", targetDevice.getName());
            result.put("address", targetDevice.getAddress());
            call.resolve(result);

        } catch (Exception e) {
            Log.e(TAG, "Excepción en executePrint: " + e.getMessage(), e);
            call.reject("PRINT_ERROR", "Error de impresión: " + e.getMessage());
        }
    }

    // =========================================================================
    // createLabelBitmap — dibuja la etiqueta con Canvas de Android
    // =========================================================================
    private Bitmap createLabelBitmap(String id, String fechaCal, String fechaSug,
            String cert, String calibro, String tapeSize) {
        boolean is24mm = !tapeSize.equals("12mm");
        int W = is24mm ? LABEL_WIDTH_24MM : LABEL_WIDTH_12MM;
        int H = is24mm ? LABEL_HEIGHT_24MM : LABEL_HEIGHT_12MM;

        Bitmap bmp = Bitmap.createBitmap(W, H, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(bmp);
        canvas.drawColor(Color.WHITE);

        Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        paint.setColor(Color.BLACK);

        if (is24mm) {
            // Borde exterior
            paint.setStyle(Paint.Style.STROKE);
            paint.setStrokeWidth(3f);
            canvas.drawRect(1, 1, W - 1, H - 1, paint);
            paint.setStyle(Paint.Style.FILL);

            // ID grande centrado
            paint.setTextSize(52f);
            paint.setTypeface(Typeface.create(Typeface.DEFAULT, Typeface.BOLD));
            float idW = paint.measureText(id);
            canvas.drawText(id, (W - idW) / 2f, 60f, paint);

            // Línea divisoria
            paint.setStyle(Paint.Style.STROKE);
            paint.setStrokeWidth(2f);
            canvas.drawLine(10, 70, W - 10, 70, paint);
            paint.setStyle(Paint.Style.FILL);

            // Etiquetas CALIBRADO / VENCE
            paint.setTextSize(18f);
            paint.setTypeface(Typeface.create(Typeface.DEFAULT, Typeface.BOLD));
            canvas.drawText("CALIBRADO", 15, 91, paint);
            canvas.drawText("VENCE", W - 15 - paint.measureText("VENCE"), 91, paint);

            // Valores de fecha
            paint.setTextSize(24f);
            canvas.drawText(fechaCal, 15, 118, paint);
            canvas.drawText(fechaSug, W - 15 - paint.measureText(fechaSug), 118, paint);

            // Línea divisoria inferior
            paint.setStyle(Paint.Style.STROKE);
            paint.setStrokeWidth(2f);
            canvas.drawLine(10, 126, W - 10, 126, paint);
            paint.setStyle(Paint.Style.FILL);

            // Certificado
            paint.setTextSize(19f);
            paint.setTypeface(Typeface.create(Typeface.DEFAULT, Typeface.BOLD));
            canvas.drawText("CERT: " + cert, 15, 152, paint);

            // Badge técnico (fondo negro, texto blanco)
            String tecStr = "TEC: " + calibro.substring(0, Math.min(4, calibro.length()));
            float tecW = paint.measureText(tecStr);
            RectF badge = new RectF(W - tecW - 24, 133, W - 10, 158);
            canvas.drawRoundRect(badge, 4, 4, paint);
            paint.setColor(Color.WHITE);
            canvas.drawText(tecStr, W - tecW - 17, 152, paint);
            paint.setColor(Color.BLACK);

        } else {
            // 12mm — etiqueta compacta horizontal
            paint.setStyle(Paint.Style.STROKE);
            paint.setStrokeWidth(1.5f);
            canvas.drawRect(1, 1, W - 1, H - 1, paint);
            canvas.drawLine(80, 1, 80, H - 1, paint);
            paint.setStyle(Paint.Style.FILL);

            paint.setTextSize(28f);
            paint.setTypeface(Typeface.create(Typeface.DEFAULT, Typeface.BOLD));
            canvas.drawText(id, 88, 36, paint);

            paint.setTextSize(16f);
            paint.setTypeface(Typeface.MONOSPACE);
            canvas.drawText("CAL: " + fechaCal + "   VEN: " + fechaSug, 88, 63, paint);
        }

        return bmp;
    }

    // =========================================================================
    // Helpers
    // =========================================================================
    private BluetoothDevice findPairedPrinter(BluetoothAdapter btAdapter) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            if (ActivityCompat.checkSelfPermission(getContext(),
                    Manifest.permission.BLUETOOTH_CONNECT) != PackageManager.PERMISSION_GRANTED) {
                Log.e(TAG, "Permiso BLUETOOTH_CONNECT faltante en findPairedPrinter");
                return null;
            }
        }
        Set<BluetoothDevice> bonded = btAdapter.getBondedDevices();
        if (bonded == null)
            return null;

        for (BluetoothDevice d : bonded) {
            if (PRINTER_NAME.equals(d.getName()))
                return d;
        }
        // Fallback: búsqueda por nombre parcial
        for (BluetoothDevice d : bonded) {
            String n = d.getName();
            if (n != null && (n.contains("PX400") || n.contains("LW-PX"))) {
                Log.w(TAG, "Impresora encontrada por nombre parcial: " + n);
                return d;
            }
        }
        return null;
    }

    private String buildFriendlyError(int conn, int err) {
        String msg;
        switch (conn) {
            case LWPrintConnectionStatus.ConnectionFailed:
                msg = "No se pudo conectar. Verifica que la impresora esté encendida y cerca.";
                break;
            case LWPrintConnectionStatus.Disconnected:
                msg = "La impresora se desconectó durante la impresión.";
                break;
            case LWPrintConnectionStatus.DeviceBusy:
                msg = "La impresora está ocupada. Espera un momento y vuelve a intentar.";
                break;
            case LWPrintConnectionStatus.OtherUsing:
                msg = "Otra aplicación está usando la impresora.";
                break;
            default:
                msg = "Error de conexión (código " + conn + ").";
        }
        if (err == LWPrintStatusError.CutterError)
            msg += " Error en el cortador.";
        else if (err == LWPrintStatusError.InsufficientParameters)
            msg += " Parámetros de impresión insuficientes.";
        else if (err != LWPrintStatusError.NoError)
            msg += " Error del dispositivo (código " + err + ").";
        return msg;
    }
}