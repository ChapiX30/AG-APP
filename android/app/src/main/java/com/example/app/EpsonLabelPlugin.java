package com.example.app; // ⚠️ Recuerda verificar que sea tu package

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
    
    private LWPrintForApp activePrinter;

    @PluginMethod
    public void printLabel(final PluginCall call) {
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
        executePrint(call);
    }

    private void executePrint(final PluginCall call) {
        try {
            Log.d(TAG, "Iniciando rutina de impresión...");
            
            String id = call.getString("id", "SIN-ID");
            String fCal = call.getString("fechaCal", "N/A");
            String fSug = call.getString("fechaSug", "N/A");
            String cert = call.getString("certificado", "PEND");
            String tec = call.getString("calibro", "AG");
            String size = call.getString("tapeSize", "24mm");

            BluetoothAdapter btAdapter = BluetoothAdapter.getDefaultAdapter();
            if (btAdapter.isDiscovering()) {
                btAdapter.cancelDiscovery();
            }

            BluetoothDevice targetDevice = findPairedPrinter(btAdapter);
            if (targetDevice == null) {
                call.reject("PRINTER_NOT_FOUND", "La etiquetadora no está conectada o emparejada.");
                return;
            }

            // Usamos runOnUiThread para garantizar que el Servicio de Epson enganche bien
            getActivity().runOnUiThread(() -> {
                try {
                    activePrinter = new LWPrintForApp(getActivity());
                    
                    Map<String, String> printerInfo = new HashMap<>();
                    printerInfo.put("name", targetDevice.getName());
                    printerInfo.put("mac_address", targetDevice.getAddress());
                    printerInfo.put("address", targetDevice.getAddress());
                    printerInfo.put("type", "bluetooth");
                    
                    activePrinter.setPrinterInformation(printerInfo);

                    activePrinter.setCallback(new LWPrintCallback() {
                        @Override
                        public void onChangePrintOperationPhase(LWPrint l, int i) {
                            Log.w(TAG, "ESTADO EPSON: Fase avanzó -> " + i);
                        }
                        @Override
                        public void onChangeTapeFeedOperationPhase(LWPrint l, int i) {}
                        @Override
                        public void onSuspendPrintOperation(LWPrint l, int i, int i1) {
                            Log.e(TAG, "ESTADO EPSON: Suspendida. Código: " + i1);
                        }
                        @Override
                        public void onAbortPrintOperation(LWPrint l, int i, int i1) {
                            Log.e(TAG, "ESTADO EPSON: Abortada. Código: " + i1);
                        }
                        @Override
                        public void onAbortTapeFeedOperation(LWPrint l, int i, int i1) {}
                    });

                    final Bitmap labelBitmap = createLabelBitmap(id, fCal, fSug, cert, tec, size);

                    final Map<String, Object> params = new HashMap<>();
                    params.put(LWPrintParameterKey.TapeWidth, size.equals("12mm") ? LWPrintTapeWidth.Normal_12mm : LWPrintTapeWidth.Normal_24mm);
                    params.put(LWPrintParameterKey.Copies, 1);
                    params.put(LWPrintParameterKey.TapeCut, 1);

                    // Pequeña pausa para que el Servicio de Epson tenga tiempo de despertar
                    new Handler(Looper.getMainLooper()).postDelayed(() -> {
                        Log.d(TAG, "Llamando a doPrint...");
                        activePrinter.doPrint(labelBitmap, params);
                    }, 800);

                } catch (Exception ex) {
                    Log.e(TAG, "Error en hilo UI: " + ex.getMessage());
                }
            });

            JSObject res = new JSObject();
            res.put("success", true);
            call.resolve(res);

        } catch (Exception e) {
            Log.e(TAG, "CRASH: " + e.getMessage());
            call.reject("PRINT_CRASH", "Falló: " + e.getMessage());
        }
    }

    private Bitmap createLabelBitmap(String id, String fCal, String fSug, String cert, String tec, String size) {
        int W = 600;
        int H = size.equals("12mm") ? 85 : 170;
        Bitmap bmp = Bitmap.createBitmap(W, H, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(bmp);
        canvas.drawColor(Color.WHITE);
        Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        paint.setColor(Color.BLACK);
        
        if (!size.equals("12mm")) {
            paint.setStyle(Paint.Style.STROKE);
            paint.setStrokeWidth(3f);
            canvas.drawRect(1, 1, W - 1, H - 1, paint);
            paint.setStyle(Paint.Style.FILL);
            paint.setTextSize(50f);
            paint.setTypeface(Typeface.create(Typeface.DEFAULT, Typeface.BOLD));
            canvas.drawText(id, (W - paint.measureText(id)) / 2f, 60f, paint);
            canvas.drawLine(10, 70, W - 10, 70, paint);
            paint.setTextSize(22f);
            canvas.drawText("CAL: " + fCal, 20, 105, paint);
            canvas.drawText("VEN: " + fSug, 20, 140, paint);
            paint.setTextSize(18f);
            canvas.drawText("CERT: " + cert, 350, 155, paint);
        } else {
            paint.setTextSize(32f);
            paint.setTypeface(Typeface.create(Typeface.DEFAULT, Typeface.BOLD));
            canvas.drawText(id, 20, 45, paint);
            paint.setTextSize(18f);
            canvas.drawText("C: " + fCal + " V: " + fSug, 20, 75, paint);
        }
        return bmp;
    }

    private BluetoothDevice findPairedPrinter(BluetoothAdapter adapter) {
        Set<BluetoothDevice> bonded = adapter.getBondedDevices();
        if (bonded == null) return null;
        for (BluetoothDevice d : bonded) {
            String name = d.getName();
            if (PRINTER_NAME.equals(name) || (name != null && (name.contains("PX400") || name.contains("LW-")))) {
                return d;
            }
        }
        return null;
    }

    @PluginMethod
    public void findEpsonPrinters(PluginCall call) {
        call.resolve();
    }
}