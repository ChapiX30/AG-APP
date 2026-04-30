package com.example.app;

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
import com.epson.lwprint.sdk.LWPrintPrintSpeed;
import com.epson.lwprint.sdk.LWPrintStatusError;
import com.epson.lwprint.sdk.LWPrintTapeCut;
import com.epson.lwprint.sdk.LWPrintTapeWidth;

import java.util.HashMap;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@SuppressLint("MissingPermission")
@CapacitorPlugin(name = "EpsonLabel", permissions = {
        @Permission(alias = "bluetooth", strings = { Manifest.permission.BLUETOOTH, Manifest.permission.BLUETOOTH_ADMIN }),
        @Permission(alias = "bluetoothConnect", strings = { "android.permission.BLUETOOTH_CONNECT", "android.permission.BLUETOOTH_SCAN" })
})
public class EpsonLabelPlugin extends Plugin {

    private static final String TAG = "EpsonLabel";
    private LWPrint lwprint;
    private boolean isPrinting = false;

    @Override
    public void load() {
        new Handler(Looper.getMainLooper()).post(() -> {
            lwprint = new LWPrint(getContext());
            Log.d(TAG, "Motor Epson V1.7.0 inicializado.");
        });
    }

    @PluginMethod
    public void printLabel(final PluginCall call) {
        if (isPrinting) {
            call.reject("BUSY", "Impresora ocupada.");
            return;
        }
        executePrint(call);
    }

    private void executePrint(final PluginCall call) {
        isPrinting = true;
        call.setKeepAlive(true);

        // Timeout de seguridad: Si en 35s no termina, liberamos el plugin.
        new Handler(Looper.getMainLooper()).postDelayed(() -> {
            if (isPrinting) {
                isPrinting = false;
                if (lwprint != null) lwprint.cancelPrint();
                call.reject("TIMEOUT", "La impresora no respondió la Fase 4.");
            }
        }, 35000);

        // Datos del equipo de metrología
        final String id = call.getString("id", "PENDIENTE");
        final String fCal = call.getString("fechaCal", "N/A");
        final String fSug = call.getString("fechaSug", "N/A");
        final String cert = call.getString("certificado", "N/A");
        final String tec = call.getString("calibro", "A.G");
        final String tapeReq = call.getString("tapeSize", "24mm");

        BluetoothAdapter btAdapter = BluetoothAdapter.getDefaultAdapter();
        BluetoothDevice device = null;
        Set<BluetoothDevice> paired = btAdapter.getBondedDevices();
        for (BluetoothDevice d : paired) {
            String name = d.getName();
            if (name != null && (name.contains("PX400") || name.contains("600P") || name.contains("EPSON"))) {
                device = d;
                break;
            }
        }

        if (device == null) {
            failOnMainThread(call, "NOT_FOUND", "No se encontró la PX400 vinculada.");
            return;
        }

        final BluetoothDevice finalDevice = device;
        lwprint.setCallback(new LWPrintCallback() {
            @Override
            public void onChangePrintOperationPhase(LWPrint lw, int phase) {
                Log.d(TAG, "Fase: " + phase);
                if (phase == 4) { // Complete
                    isPrinting = false;
                    JSObject res = new JSObject();
                    res.put("success", true);
                    call.resolve(res);
                }
            }
            @Override public void onAbortPrintOperation(LWPrint lw, int err, int stat) {
                failOnMainThread(call, "ABORTED", "Error: " + err + " Status: " + stat);
            }
            @Override public void onSuspendPrintOperation(LWPrint lw, int err, int stat) {
                lw.cancelPrint();
                failOnMainThread(call, "SUSPENDED", "Suspendida.");
            }
            @Override public void onChangeTapeFeedOperationPhase(LWPrint lw, int p) {}
            @Override public void onAbortTapeFeedOperation(LWPrint lw, int e, int s) {}
        });

        ExecutorService executor = Executors.newSingleThreadExecutor();
        executor.execute(() -> {
            try {
                // Mapa de dispositivo blindado (Identity Bypass)
                Map<String, String> info = new HashMap<>();
                info.put("name", finalDevice.getName()); // Nombre real Bluetooth (PX400)
                info.put("product", "LW-600P");          // Driver interno
                info.put("host", finalDevice.getAddress());
                info.put("type", "2");                   // Bluetooth
                info.put("macaddress", finalDevice.getAddress());
                // Keys vacías obligatorias para evitar NullPointerException en el SDK
                info.put("usbmdl", ""); info.put("port", ""); info.put("domain", "");
                info.put("deviceclass", ""); info.put("devicestatus", "");

                lwprint.setPrinterInformation(info);

                // Detección de hardware
                Map<String, Integer> status = lwprint.fetchPrinterStatus();
                int hWidth = lwprint.getTapeWidthFromStatus(status);
                int tapeWidth = (hWidth != 0) ? hWidth : 
                               ("12mm".equals(tapeReq) ? LWPrintTapeWidth.Normal_12mm : LWPrintTapeWidth.Normal_24mm);

                int height = lwprint.getPrintableSizeFromTape(tapeWidth);
                int res = lwprint.getResolution();
                
                // Imagen RGB_565 sólida para asegurar impresión térmica
                Bitmap bmp = createLabel(id, fCal, fSug, cert, tec, height, res);

                Map<String, Object> params = new HashMap<>();
                params.put(LWPrintParameterKey.Copies, 1);
                params.put(LWPrintParameterKey.TapeCut, LWPrintTapeCut.EachLabel);
                params.put(LWPrintParameterKey.PrintSpeed, LWPrintPrintSpeed.PrintSpeedHigh);
                params.put(LWPrintParameterKey.TapeWidth, tapeWidth);

                lwprint.doPrint(bmp, params);
            } catch (Exception e) {
                failOnMainThread(call, "CRASH", e.getMessage());
            }
        });
    }

    private Bitmap createLabel(String id, String cal, String ven, String cert, String tec, int h, int res) {
        float px = res / 25.4f;
        Bitmap bmp = Bitmap.createBitmap((int)(60 * px), h, Bitmap.Config.RGB_565);
        Canvas c = new Canvas(bmp);
        c.drawColor(Color.WHITE);
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        p.setColor(Color.BLACK);
        
        p.setTypeface(Typeface.DEFAULT_BOLD);
        p.setTextSize(h * 0.4f);
        c.drawText(id, 5, h * 0.42f, p);
        
        p.setStrokeWidth(2f);
        c.drawLine(5, h * 0.48f, (60 * px) - 5, h * 0.48f, p);
        
        p.setTypeface(Typeface.DEFAULT);
        p.setTextSize(h * 0.18f);
        c.drawText("Cal: " + cal, 5, h * 0.7f, p);
        c.drawText("Vence: " + ven, 5, h * 0.9f, p);
        c.drawText("Cert: " + cert, (60 * px) * 0.55f, h * 0.7f, p);
        c.drawText("Tec: " + tec, (60 * px) * 0.55f, h * 0.9f, p);
        
        return bmp;
    }

    private void failOnMainThread(PluginCall call, String code, String msg) {
        new Handler(Looper.getMainLooper()).post(() -> {
            isPrinting = false;
            call.reject(code, msg);
        });
    }
}