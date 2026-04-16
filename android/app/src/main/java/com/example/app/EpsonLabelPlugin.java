package com.example.app; // ⚠️ Ajusta a tu package real

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
import com.epson.lwprint.sdk.LWPrintForApp;
import com.epson.lwprint.sdk.LWPrintParameterKey;
import com.epson.lwprint.sdk.LWPrintTapeWidth;

import java.util.HashMap;
import java.util.Map;
import java.util.Set;

/**
 * ═══════════════════════════════════════════════════════════════════
 * FIXES APLICADOS (v4) — cinta LC-6SBE / SM24X Black Matt Silver 24mm
 *
 * Dimensiones confirmadas desde la app oficial Epson:
 *   Longitud de etiqueta : 40mm  → BITMAP_W = 284px  (40 × 180/25.4)
 *   Ancho de cinta       : 24mm
 *   Márgenes             :  1mm cada lado → área imprimible = 22mm
 *   Área imprimible      : 22mm  → BITMAP_H_24 = 156px  (22 × 180/25.4)
 *
 * FIX 1 — TapeWidth = 0 (AutoTapeWidth)
 *   La impresora detecta el tipo de cinta por RFID. Evita rechazo en Fase 3.
 *
 * FIX 2 — BITMAP_W corregido de 696 → 284px
 *   696px equivale a ~98mm de etiqueta — la impresora rechazaba silenciosamente
 *   porque el bitmap era casi 2.5× más largo de lo esperado.
 *
 * FIX 3 — BITMAP_H_24 corregido de 120 → 156px
 *   Calculado desde el área imprimible real (22mm) a 180 DPI.
 *
 * FIX 4 — Bitmap mutable: copy(..., true)
 *   El SDK LWPrint requiere un bitmap mutable.
 *
 * FIX 5 — Timeout extendido: 45s log + 5s rechazo
 *   Permite que onSuspend/onAbort lleguen con el err real antes de rechazar.
 *   Si ves err=7 → el BITMAP_H sigue sin coincidir, ajusta ±4px.
 * ═══════════════════════════════════════════════════════════════════
 */
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
    private static final String PRINTER_NAME = "EPSON LW-PX400";

    // ═══════════════════════════════════════════════════════════════
    // Dimensiones confirmadas con app oficial Epson (historial de impresión)
    //   40mm largo × 24mm ancho, márgenes 1mm c/lado → área imprimible 22mm
    //   LW-PX400 resolución: 180 DPI = 7.0866 px/mm
    //
    //   BITMAP_W    = 40mm × 7.0866 = 283.4 → 284px
    //   BITMAP_H_24 = 22mm × 7.0866 = 155.9 → 156px
    //   BITMAP_H_12 = 10mm × 7.0866 =  70.9 →  71px  (12mm - 2mm márgenes)
    // ═══════════════════════════════════════════════════════════════
    private static final int BITMAP_W    = 284;
    private static final int BITMAP_H_24 = 156;
    private static final int BITMAP_H_12 =  71;

    private LWPrintForApp activePrinter;
    private final Handler timeoutHandler = new Handler(Looper.getMainLooper());
    private int lastPhase = 0;

    @PluginMethod
    public void printLabel(final PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            if (ActivityCompat.checkSelfPermission(getContext(),
                    Manifest.permission.BLUETOOTH_CONNECT)
                    != PackageManager.PERMISSION_GRANTED) {
                requestPermissionForAlias("bluetoothConnect", call,
                        "bluetoothPermissionCallback");
                return;
            }
        }
        getActivity().runOnUiThread(() -> executePrint(call));
    }

    @PermissionCallback
    private void bluetoothPermissionCallback(PluginCall call) {
        getActivity().runOnUiThread(() -> executePrint(call));
    }

    private void executePrint(final PluginCall call) {
        try {
            Log.d(TAG, "PASO 1: executePrint en UI thread");

            final String id   = call.getString("id",          "SIN-ID");
            final String fCal = call.getString("fechaCal",    "N/A");
            final String fSug = call.getString("fechaSug",    "N/A");
            final String cert = call.getString("certificado", "PEND");
            final String tec  = call.getString("calibro",     "AG");
            final String size = call.getString("tapeSize",    "24mm");
            final boolean is24 = !size.equals("12mm");

            BluetoothAdapter btAdapter = BluetoothAdapter.getDefaultAdapter();
            BluetoothDevice  targetDevice = findPairedPrinter(btAdapter);

            if (targetDevice == null) {
                call.reject("PRINTER_NOT_FOUND",
                        "La etiquetadora no está emparejada.");
                return;
            }
            Log.d(TAG, "PASO 2: Impresora → " + targetDevice.getName()
                    + "  MAC: " + targetDevice.getAddress());

            activePrinter = new LWPrintForApp(getActivity());

            Map<String, String> info = new HashMap<>();
            info.put("name",        targetDevice.getName());
            info.put("address",     targetDevice.getAddress());
            info.put("mac_address", targetDevice.getAddress());
            info.put("type",        "bluetooth");
            activePrinter.setPrinterInformation(info);
            Log.d(TAG, "PASO 3: printerInfo inyectada");

            activePrinter.setCallback(new LWPrintCallback() {
                @Override
                public void onChangePrintOperationPhase(LWPrint lw, int phase) {
                    lastPhase = phase;
                    Log.d(TAG, ">>> FASE: " + phase);
                    if (phase == 4) {
                        timeoutHandler.removeCallbacksAndMessages(null);
                        Log.d(TAG, "IMPRESIÓN COMPLETADA ✅");
                        JSObject res = new JSObject();
                        res.put("success", true);
                        call.resolve(res);
                    }
                }

                @Override
                public void onChangeTapeFeedOperationPhase(LWPrint lw, int phase) {}

                @Override
                public void onSuspendPrintOperation(LWPrint lw, int phase, int err) {
                    timeoutHandler.removeCallbacksAndMessages(null);
                    Log.e(TAG, "SUSPENDIDA fase=" + phase + " err=" + err + describeError(err));
                    call.reject("PRINT_SUSPENDED",
                            "Suspendida. Fase=" + phase + " err=" + err + describeError(err));
                }

                @Override
                public void onAbortPrintOperation(LWPrint lw, int phase, int err) {
                    timeoutHandler.removeCallbacksAndMessages(null);
                    Log.e(TAG, "ABORTADA fase=" + phase + " err=" + err + describeError(err));
                    call.reject("PRINT_ABORTED",
                            "Abortada. Fase=" + phase + " err=" + err + describeError(err));
                }

                @Override
                public void onAbortTapeFeedOperation(LWPrint lw, int phase, int err) {
                    Log.e(TAG, "TapeFeed abortado fase=" + phase + " err=" + err);
                }
            });

            // ── Bitmap ───────────────────────────────────────────────────────
            Bitmap bmp = createLabelBitmap(id, fCal, fSug, cert, tec, is24);
            Log.d(TAG, "PASO 4: Bitmap W=" + bmp.getWidth()
                    + " H=" + bmp.getHeight() + " config=" + bmp.getConfig());

            // ── Parámetros de impresión ──────────────────────────────────────
            // TapeWidth = 0 → AutoTapeWidth: la impresora detecta la cinta por RFID
            Map<String, Object> params = new HashMap<>();
            params.put(LWPrintParameterKey.TapeWidth, 0);
            params.put(LWPrintParameterKey.Copies, 1);

            Log.d(TAG, "PASO 5: doPrint... TapeWidth=" + params.get(LWPrintParameterKey.TapeWidth)
                    + " W=" + BITMAP_W + " H=" + (is24 ? BITMAP_H_24 : BITMAP_H_12));
            activePrinter.doPrint(bmp, params);
            Log.d(TAG, "PASO 6: doPrint lanzado, esperando callbacks...");

            // ── Timeout de diagnóstico (FIX 5) ───────────────────────────────
            // A los 45s solo loguea — NO rechaza todavía.
            // Espera 5s más para capturar onSuspend/onAbort con el err real.
            timeoutHandler.postDelayed(() -> {
                Log.e(TAG, "⏱ TIMEOUT — sigue en fase " + lastPhase
                        + " después de 45s. W=" + BITMAP_W
                        + " H=" + (is24 ? BITMAP_H_24 : BITMAP_H_12)
                        + " TapeWidth=" + params.get(LWPrintParameterKey.TapeWidth)
                        + " — esperando 5s más por onSuspend/onAbort...");

                timeoutHandler.postDelayed(() -> {
                    Log.e(TAG, "⏱ TIMEOUT FINAL — sin respuesta después de 50s. "
                            + "Última fase=" + lastPhase);
                    call.reject("PRINT_TIMEOUT",
                            "Sin respuesta de la impresora después de 50s. "
                            + "Última fase=" + lastPhase
                            + " W=" + BITMAP_W
                            + " H=" + (is24 ? BITMAP_H_24 : BITMAP_H_12));
                }, 5_000);

            }, 45_000);

        } catch (Exception e) {
            Log.e(TAG, "CRASH: " + Log.getStackTraceString(e));
            call.reject("PRINT_CRASH", "Error: " + e.getMessage());
        }
    }

    /**
     * Reglas del bitmap para el SDK Epson LWPrint:
     *
     * 1. Config = RGB_565 (sin alpha — ARGB_8888 causa congelado en fase 3)
     * 2. Fondo BLANCO PURO (no transparente)
     * 3. WIDTH  = longitud de etiqueta en px a 180 DPI (40mm → 284px)
     * 4. HEIGHT = área imprimible de la cinta en px a 180 DPI (22mm → 156px)
     *            (NO el alto total físico — los márgenes de 1mm c/lado no se imprimen)
     * 5. Bitmap MUTABLE (copy con true)
     *
     * Layout 24mm (284 × 156 px):
     *   [0  –  52]  ID grande centrado
     *   [52 –  58]  línea separadora
     *   [58 –  90]  CAL: fecha calibración
     *   [90 – 120]  VEN: fecha vencimiento
     *   [120– 156]  CERT texto + TEC badge invertido
     */
    private Bitmap createLabelBitmap(String id, String fCal, String fSug,
                                     String cert, String tec, boolean is24) {
        final int W = BITMAP_W;
        final int H = is24 ? BITMAP_H_24 : BITMAP_H_12;

        // Paso 1 — dibujar en ARGB_8888 (Canvas necesita esto para texto)
        Bitmap argb = Bitmap.createBitmap(W, H, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(argb);
        canvas.drawColor(Color.WHITE);

        Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        paint.setColor(Color.BLACK);

        if (is24) {
            // ── 24mm (284 × 156) ────────────────────────────────────────────

            // Borde exterior
            paint.setStyle(Paint.Style.STROKE);
            paint.setStrokeWidth(2f);
            canvas.drawRect(1, 1, W - 1, H - 1, paint);
            paint.setStyle(Paint.Style.FILL);

            // ID grande centrado
            paint.setTextSize(36f);
            paint.setTypeface(Typeface.create(Typeface.DEFAULT, Typeface.BOLD));
            float idX = (W - paint.measureText(id)) / 2f;
            canvas.drawText(id, idX, 44f, paint);

            // Línea separadora
            paint.setStyle(Paint.Style.STROKE);
            paint.setStrokeWidth(1.5f);
            canvas.drawLine(8, 52, W - 8, 52, paint);
            paint.setStyle(Paint.Style.FILL);

            // Fechas
            paint.setTypeface(Typeface.DEFAULT);
            paint.setTextSize(17f);
            canvas.drawText("CAL: " + fCal,  8,  76, paint);
            canvas.drawText("VEN: " + fSug,  8, 100, paint);

            // CERT texto pequeño
            paint.setTextSize(14f);
            canvas.drawText("CERT: " + cert, 8, 122, paint);

            // TEC badge (rectángulo negro, texto blanco) — esquina inferior derecha
            String tecStr = tec.substring(0, Math.min(4, tec.length()));
            paint.setTextSize(14f);
            float badgeW = paint.measureText(tecStr) + 12f;
            float badgeL = W - badgeW - 6f;
            float badgeT = 108f;
            float badgeR = W - 6f;
            float badgeB = 130f;
            paint.setStyle(Paint.Style.FILL);
            canvas.drawRoundRect(badgeL, badgeT, badgeR, badgeB, 3, 3, paint);
            paint.setColor(Color.WHITE);
            canvas.drawText(tecStr, badgeL + 6f, 125f, paint);
            paint.setColor(Color.BLACK);

        } else {
            // ── 12mm (284 × 71) ─────────────────────────────────────────────

            paint.setTextSize(24f);
            paint.setTypeface(Typeface.create(Typeface.DEFAULT, Typeface.BOLD));
            canvas.drawText(id, 8, 28, paint);

            paint.setStyle(Paint.Style.STROKE);
            paint.setStrokeWidth(1f);
            canvas.drawLine(8, 34, W - 8, 34, paint);
            paint.setStyle(Paint.Style.FILL);

            paint.setTypeface(Typeface.DEFAULT);
            paint.setTextSize(15f);
            canvas.drawText("C:" + fCal + "  V:" + fSug, 8, 56, paint);
        }

        // Paso 2 — convertir a RGB_565 (elimina canal alpha, requerido por SDK)
        // true = mutable, requerido por el SDK LWPrint
        Bitmap rgb565 = argb.copy(Bitmap.Config.RGB_565, true);
        argb.recycle();
        return rgb565;
    }

    // ─────────────────────────────────────────────────────────────────────────
    private BluetoothDevice findPairedPrinter(BluetoothAdapter adapter) {
        if (adapter == null) return null;
        Set<BluetoothDevice> bonded = adapter.getBondedDevices();
        if (bonded == null) return null;
        for (BluetoothDevice d : bonded) {
            String name = d.getName();
            if (name == null) continue;
            if (PRINTER_NAME.equals(name)
                    || name.contains("PX400")
                    || name.contains("LW-")) {
                return d;
            }
        }
        return null;
    }

    /**
     * Códigos de error conocidos del SDK Epson LWPrint.
     * Aparecen en onSuspendPrintOperation / onAbortPrintOperation.
     *
     * err=7 → BITMAP_H o BITMAP_W no coincide con la cinta montada.
     *         Si ocurre, ajusta BITMAP_H_24 en ±4px y reintenta.
     */
    private String describeError(int err) {
        switch (err) {
            case 1:  return " [Sin cinta o tapa abierta]";
            case 2:  return " [Batería baja]";
            case 3:  return " [Cortador atorado]";
            case 4:  return " [Impresora ocupada]";
            case 5:  return " [Temperatura alta]";
            case 6:  return " [Tapa abierta]";
            case 7:  return " [Cinta incorrecta — BITMAP_H o BITMAP_W no coincide con la cinta]";
            case 8:  return " [Error de comunicación Bluetooth]";
            case 10: return " [Memoria insuficiente en impresora]";
            default: return " [Error desconocido]";
        }
    }

    @PluginMethod
    public void findEpsonPrinters(PluginCall call) {
        call.resolve();
    }
}