package com.example.app;

import android.Manifest;
import android.annotation.SuppressLint;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.RectF;
import android.graphics.Typeface;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import com.epson.lwprint.sdk.LWPrint;
import com.epson.lwprint.sdk.LWPrintCallback;
import com.epson.lwprint.sdk.LWPrintDiscoverConnectionType;
import com.epson.lwprint.sdk.LWPrintDiscoverPrinter;
import com.epson.lwprint.sdk.LWPrintDiscoverPrinterCallback;
import com.epson.lwprint.sdk.LWPrintParameterKey;
import com.epson.lwprint.sdk.LWPrintPrintingPhase;
import com.epson.lwprint.sdk.LWPrintStatusError;
import com.epson.lwprint.sdk.LWPrintTapeCut;
import com.epson.lwprint.sdk.LWPrintTapeWidth;

import java.io.InputStream;
import java.util.ArrayList;
import java.util.EnumSet;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

@SuppressLint("MissingPermission")
@CapacitorPlugin(name = "EpsonLabel", permissions = {
        @Permission(alias = "bluetooth", strings = {
                Manifest.permission.BLUETOOTH,
                Manifest.permission.BLUETOOTH_ADMIN,
                Manifest.permission.ACCESS_FINE_LOCATION
        }),
        @Permission(alias = "bluetoothConnect", strings = {
                "android.permission.BLUETOOTH_CONNECT",
                "android.permission.BLUETOOTH_SCAN"
        })
})
public class EpsonLabelPlugin extends Plugin {

    private static final String TAG = "EpsonLabel";
    private static final String TARGET_PRINTER = "LW-PX400";
    private static final int DISCOVERY_TIMEOUT_FULL_MS = 12000;
    private static final int DISCOVERY_TIMEOUT_QUICK_MS = 5000;

    /** Cinta 24mm: etiqueta 40mm de largo × 24mm de ancho, margen 1mm. */
    private static final float LABEL_LENGTH_MM_24 = 40f;
    private static final float TAPE_WIDTH_MM_24 = 24f;
    private static final float LABEL_LENGTH_MM_12 = 40f;
    private static final float TAPE_WIDTH_MM_12 = 12f;
    private static final float LABEL_MARGIN_SIDE_MM = 1f;
    /** La PX400 no imprime hasta el borde: reserva extra arriba/abajo. */
    private static final float LABEL_SAFE_TOP_MM = 2.4f;
    private static final float LABEL_SAFE_BOTTOM_MM = 2.4f;
    /** Cinta 12mm — logo tamaño normal pegado a la izquierda + datos. */
    private static final float LABEL_SAFE_TOP_MM_12 = 0.8f;
    private static final float LABEL_SAFE_BOTTOM_MM_12 = 0.8f;
    private static final float LABEL_MARGIN_SIDE_MM_12 = 0.5f;
    /** Mismo tamaño de logo que antes; solo alineado al borde izquierdo. */
    private static final float LABEL_LOGO_COL_MM_12 = 9.5f;
    private static final float LABEL_HEADER_H_MM_12 = 2.0f;
    private static final float LABEL_PT_HEADER_12 = 5f;
    private static final float LABEL_PT_ROW_12 = 5.8f;
    private static final float LABEL_PT_FORM_12 = 4.8f;
    private static final float LABEL_PT_MIN_12 = 4.5f;
    private static final String LABEL_FORM_CODE = "AG-CAL-F14-00";
    /** Tamaños alineados con la plantilla Epson (Source Sans Pro). */
    private static final float LABEL_PT_FOOTER = 5f;
    private static final float LABEL_PT_BODY = 7f;
    private static final float LABEL_PT_ID = 8f;
    private static final float LABEL_PT_HEADER = 9f;
    private static final float LABEL_PT_MIN = 5f;
    private static final int LABEL_PRINT_DENSITY = 0;
    /** 12mm: casi como 24mm; un pelín más suave sin quedar tenue. */
    private static final int LABEL_PRINT_DENSITY_12 = 0;
    private static final int LABEL_BINARIZE_THRESHOLD = 200;
    /** Un poco más sólido que 175, sin empastar como 200. */
    private static final int LABEL_BINARIZE_THRESHOLD_12 = 188;

    private LWPrint lwprint;
    /** Impresora lista para imprimir (como Label Editor Mobile: se configura una vez por sesión). */
    private Map<String, String> cachedPrinterInfo;
    private boolean isPrinting = false;
    private String pendingPermissionMethod = "printLabel";
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private final ExecutorService printExecutor = Executors.newSingleThreadExecutor();
    private Typeface fontRegular;
    private Typeface fontBold;
    private Typeface fontItalic;

    private enum LabelFontStyle {
        REGULAR,
        BOLD,
        ITALIC
    }

    @Override
    public void load() {
        mainHandler.post(() -> {
            lwprint = new LWPrint(getContext());
            Log.d(TAG, "Motor Epson LWPrint V1.7.0 inicializado.");
        });
    }

    @PluginMethod
    public void findEpsonPrinters(PluginCall call) {
        if (!ensureBluetoothPermissions(call, "findEpsonPrinters")) {
            return;
        }
        printExecutor.execute(() -> resolvePrinterList(call));
    }

    /** Prepara la impresora seleccionada (descubrimiento + caché), como "Printer Setting" en Epson. */
    @PluginMethod
    public void preparePrinter(PluginCall call) {
        if (!ensureBluetoothPermissions(call, "preparePrinter")) {
            return;
        }
        printExecutor.execute(() -> executePreparePrinter(call));
    }

    @PluginMethod
    public void printLabel(final PluginCall call) {
        if (isPrinting) {
            call.reject("BUSY", "Impresora ocupada. Espera a que termine el trabajo anterior.");
            return;
        }
        if (!ensureBluetoothPermissions(call, "printLabel")) {
            return;
        }
        printExecutor.execute(() -> executePrint(call));
    }

    @PermissionCallback
    private void bluetoothPermissionsCallback(PluginCall call) {
        if (!hasBluetoothPermissions()) {
            fail(call, "PERMISSION_DENIED",
                    "Se necesitan permisos de Bluetooth. Ve a Ajustes → Apps → AG → Permisos y activa Dispositivos cercanos.");
            return;
        }

        if ("findEpsonPrinters".equals(pendingPermissionMethod)) {
            printExecutor.execute(() -> resolvePrinterList(call));
        } else if ("preparePrinter".equals(pendingPermissionMethod)) {
            printExecutor.execute(() -> executePreparePrinter(call));
        } else {
            printExecutor.execute(() -> executePrint(call));
        }
    }

    private boolean ensureBluetoothPermissions(PluginCall call, String methodName) {
        if (hasBluetoothPermissions()) {
            return true;
        }
        pendingPermissionMethod = methodName;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            requestPermissionForAlias("bluetoothConnect", call, "bluetoothPermissionsCallback");
        } else {
            requestPermissionForAlias("bluetooth", call, "bluetoothPermissionsCallback");
        }
        return false;
    }

    private boolean hasBluetoothPermissions() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            return getPermissionState("bluetoothConnect") == PermissionState.GRANTED;
        }
        return getPermissionState("bluetooth") == PermissionState.GRANTED
                && ContextCompat.checkSelfPermission(getContext(), Manifest.permission.ACCESS_FINE_LOCATION)
                == PackageManager.PERMISSION_GRANTED;
    }

    private void resolvePrinterList(PluginCall call) {
        BluetoothAdapter adapter = BluetoothAdapter.getDefaultAdapter();
        if (adapter == null) {
            fail(call, "NO_BLUETOOTH", "Este dispositivo no tiene Bluetooth.");
            return;
        }
        if (!adapter.isEnabled()) {
            fail(call, "BT_OFF", "Activa Bluetooth en Ajustes del teléfono.");
            return;
        }

        List<Map<String, String>> discovered = discoverPrinters();
        JSArray devices = new JSArray();
        Map<String, String> targetInfo = null;

        for (Map<String, String> printer : discovered) {
            String name = printer.get(LWPrintDiscoverPrinter.PRINTER_INFO_NAME);
            String address = getPrinterAddress(printer);
            boolean isEpson = isEpsonPrinterName(name, printer);
            boolean isTarget = isTargetPrinter(name, printer);
            BluetoothDevice bonded = findBondedDeviceByAddress(adapter, address);
            String alias = bonded != null ? getDeviceAlias(bonded) : "";
            String serial = printer.get(LWPrintDiscoverPrinter.PRINTER_INFO_SERIAL_NUMBER);

            JSObject entry = new JSObject();
            entry.put("name", name != null ? name : "");
            entry.put("address", address);
            entry.put("macAddress", address);
            entry.put("deviceId", formatDeviceId(address));
            entry.put("serialNumber", serial != null && !serial.isEmpty() ? serial : address);
            entry.put("alias", alias);
            entry.put("isEpson", isEpson);
            entry.put("isTarget", isTarget);
            devices.put(entry);

            if (isTarget && targetInfo == null) {
                targetInfo = printer;
            }
        }

        if (targetInfo == null) {
            for (Map<String, String> printer : discovered) {
                String name = printer.get(LWPrintDiscoverPrinter.PRINTER_INFO_NAME);
                if (isEpsonPrinterName(name, printer)) {
                    targetInfo = printer;
                    break;
                }
            }
        }

        if (targetInfo != null) {
            cachePrinterInfo(targetInfo);
        }

        JSObject result = new JSObject();
        result.put("devices", devices);
        result.put("total", discovered.size());
        result.put("targetPrinter", TARGET_PRINTER);
        result.put("targetFound", targetInfo != null && isTargetPrinter(
                targetInfo.get(LWPrintDiscoverPrinter.PRINTER_INFO_NAME), targetInfo));
        result.put("targetDevice", targetInfo != null
                ? targetInfo.get(LWPrintDiscoverPrinter.PRINTER_INFO_NAME) : "");
        call.resolve(result);
    }

    private void executePreparePrinter(PluginCall call) {
        BluetoothAdapter adapter = BluetoothAdapter.getDefaultAdapter();
        if (adapter == null) {
            fail(call, "NO_BLUETOOTH", "Este dispositivo no tiene Bluetooth.");
            return;
        }
        if (!adapter.isEnabled()) {
            fail(call, "BT_OFF", "Activa Bluetooth en Ajustes del teléfono.");
            return;
        }

        String preferredAddress = call.getString("printerAddress");
        Map<String, String> printerInfo = findPrinterInfoWithDiscovery(
                adapter, preferredAddress, DISCOVERY_TIMEOUT_FULL_MS);
        if (printerInfo == null) {
            fail(call, "NOT_FOUND",
                    "No se encontró la impresora. Enciéndela, emparejala en Bluetooth y vuelve a intentar.");
            return;
        }

        cachePrinterInfo(printerInfo);
        String address = getPrinterAddress(printerInfo);
        String name = printerInfo.get(LWPrintDiscoverPrinter.PRINTER_INFO_NAME);

        JSObject result = new JSObject();
        result.put("ready", true);
        result.put("address", address);
        result.put("name", name != null ? name : TARGET_PRINTER);
        mainHandler.post(() -> call.resolve(result));
    }

    private void executePrint(final PluginCall call) {
        if (lwprint == null) {
            fail(call, "SDK_NOT_READY", "El motor de impresión aún no está listo. Cierra y abre la app.");
            return;
        }

        BluetoothAdapter btAdapter = BluetoothAdapter.getDefaultAdapter();
        if (btAdapter == null) {
            fail(call, "NO_BLUETOOTH", "Este dispositivo no tiene Bluetooth.");
            return;
        }
        if (!btAdapter.isEnabled()) {
            fail(call, "BT_OFF", "Activa Bluetooth en Ajustes del teléfono.");
            return;
        }

        Map<String, String> printerInfo = resolvePrinterInfoForPrint(btAdapter, call.getString("printerAddress"));
        if (printerInfo == null) {
            fail(call, "NOT_FOUND",
                    "No se encontró la impresora seleccionada. Enciéndela, emparejala en Bluetooth y vuelve a intentar.");
            return;
        }

        final Map<String, String> initialPrinterInfo = printerInfo;

        isPrinting = true;
        call.setKeepAlive(true);

        mainHandler.postDelayed(() -> {
            if (isPrinting) {
                isPrinting = false;
                lwprint.cancelPrint();
                fail(call, "TIMEOUT", "La impresora no respondió. Verifica que esté encendida, con cinta y cerca del teléfono.");
            }
        }, 45000);

        final String id = call.getString("id", "PENDIENTE");
        final String fCal = call.getString("fechaCal", "N/A");
        final String fSug = call.getString("fechaSug", "N/A");
        final String cert = call.getString("certificado", "N/A");
        final String tec = formatTechnicianCode(call.getString("calibro", "AG"));
        final String tapeReq = call.getString("tapeSize", "24mm");
        final int copies = Math.max(1, Math.min(call.getInt("copies", 1), 9));

        final Map<String, String> activePrinterInfo;
        final Map<String, Integer> status;
        try {
            Map<String, String> connectedInfo = initialPrinterInfo;
            lwprint.setPrinterInformation(connectedInfo);

            Map<String, Integer> printerStatus = lwprint.fetchPrinterStatus();
            int deviceError = lwprint.getDeviceErrorFromStatus(printerStatus);
            if (printerStatus == null || printerStatus.isEmpty()
                    || deviceError == LWPrintStatusError.ConnectionFailed) {
                clearPrinterCache();
                Log.d(TAG, "Conexión falló; redescubriendo impresora...");
                connectedInfo = findPrinterInfoWithDiscovery(
                        btAdapter, call.getString("printerAddress"), DISCOVERY_TIMEOUT_QUICK_MS);
                if (connectedInfo == null) {
                    fail(call, "CONNECT_FAILED", "No se pudo conectar con la impresora. Revisa Bluetooth y que esté encendida.");
                    return;
                }
                cachePrinterInfo(connectedInfo);
                lwprint.setPrinterInformation(connectedInfo);
                printerStatus = lwprint.fetchPrinterStatus();
                deviceError = lwprint.getDeviceErrorFromStatus(printerStatus);
                if (printerStatus == null || printerStatus.isEmpty()
                        || deviceError == LWPrintStatusError.ConnectionFailed) {
                    clearPrinterCache();
                    fail(call, "CONNECT_FAILED", "No se pudo conectar con la impresora. Revisa Bluetooth y que esté encendida.");
                    return;
                }
            }

            cachePrinterInfo(connectedInfo);
            activePrinterInfo = connectedInfo;
            status = printerStatus;
        } catch (Exception e) {
            Log.e(TAG, "Error al conectar", e);
            fail(call, "CONNECT_FAILED", e.getMessage() != null ? e.getMessage() : "No se pudo conectar con la impresora.");
            return;
        }

        final String deviceName = activePrinterInfo.get(LWPrintDiscoverPrinter.PRINTER_INFO_NAME);
        final String deviceAddress = getPrinterAddress(activePrinterInfo);

        lwprint.setCallback(new LWPrintCallback() {
            @Override
            public void onChangePrintOperationPhase(LWPrint lw, int phase) {
                Log.d(TAG, "Fase impresión: " + phase);
                if (phase == LWPrintPrintingPhase.Complete) {
                    isPrinting = false;
                    JSObject res = new JSObject();
                    res.put("success", true);
                    res.put("printer", deviceName != null ? deviceName : TARGET_PRINTER);
                    res.put("address", deviceAddress);
                    call.resolve(res);
                }
            }

            @Override
            public void onAbortPrintOperation(LWPrint lw, int err, int stat) {
                if (err == LWPrintStatusError.ConnectionFailed) {
                    clearPrinterCache();
                }
                fail(call, "ABORTED", describeAbort(err, stat));
            }

            @Override
            public void onSuspendPrintOperation(LWPrint lw, int err, int stat) {
                lw.cancelPrint();
                if (err == LWPrintStatusError.ConnectionFailed) {
                    clearPrinterCache();
                }
                fail(call, "SUSPENDED", describeAbort(err, stat));
            }

            @Override
            public void onChangeTapeFeedOperationPhase(LWPrint lw, int phase) {}

            @Override
            public void onAbortTapeFeedOperation(LWPrint lw, int err, int stat) {}
        });

        try {
            int tapeWidth = lwprint.getTapeWidthFromStatus(status);
            if (tapeWidth == LWPrintTapeWidth.None || tapeWidth == LWPrintTapeWidth.Unknown) {
                tapeWidth = "12mm".equals(tapeReq) ? LWPrintTapeWidth.Normal_12mm : LWPrintTapeWidth.Normal_24mm;
            }

            int height = lwprint.getPrintableSizeFromTape(tapeWidth);
            int res = lwprint.getResolution();
            Bitmap bmp = createLabel(id, fCal, fSug, cert, tec, height, res, tapeReq);
            boolean smallTape = "12mm".equals(tapeReq);
            Bitmap printBmp = binarizeLabelForThermal(bmp,
                    smallTape ? LABEL_BINARIZE_THRESHOLD_12 : LABEL_BINARIZE_THRESHOLD);
            if (printBmp != bmp) {
                bmp.recycle();
                bmp = printBmp;
            }

            Map<String, Object> params = new HashMap<>();
            params.put(LWPrintParameterKey.Copies, copies);
            params.put(LWPrintParameterKey.TapeCut, LWPrintTapeCut.EachLabel);
            params.put(LWPrintParameterKey.HalfCut, lwprint.isSupportHalfCut());
            params.put(LWPrintParameterKey.PrintSpeed, false);
            params.put(LWPrintParameterKey.Density, smallTape ? LABEL_PRINT_DENSITY_12 : LABEL_PRINT_DENSITY);
            params.put(LWPrintParameterKey.TapeWidth, tapeWidth);

            Log.d(TAG, "Imprimiendo en " + deviceName + " cinta=" + tapeWidth);
            lwprint.doPrint(bmp, params);
        } catch (Exception e) {
            Log.e(TAG, "Error al imprimir", e);
            fail(call, "CRASH", e.getMessage() != null ? e.getMessage() : "Error inesperado al imprimir.");
        }
    }

    private Map<String, String> resolvePrinterInfoForPrint(BluetoothAdapter adapter, String preferredAddress) {
        if (cachedPrinterInfo != null && matchesPrinterAddress(cachedPrinterInfo, preferredAddress)) {
            Log.d(TAG, "Impresión: reutilizando impresora en caché");
            return copyPrinterInfo(cachedPrinterInfo);
        }

        try {
            Map<String, String> current = lwprint.getPrinterInformation();
            if (current != null && !current.isEmpty() && matchesPrinterAddress(current, preferredAddress)) {
                Log.d(TAG, "Impresión: reutilizando getPrinterInformation()");
                cachePrinterInfo(current);
                return copyPrinterInfo(current);
            }
        } catch (Exception e) {
            Log.w(TAG, "getPrinterInformation: " + e.getMessage());
        }

        Log.d(TAG, "Impresión: descubriendo impresora (sin caché válida)");
        Map<String, String> discovered = findPrinterInfoWithDiscovery(
                adapter, preferredAddress, DISCOVERY_TIMEOUT_FULL_MS);
        if (discovered != null) {
            cachePrinterInfo(discovered);
        }
        return discovered;
    }

    private Map<String, String> findPrinterInfoWithDiscovery(
            BluetoothAdapter adapter, String preferredAddress, int timeoutMs) {
        List<Map<String, String>> discovered = discoverPrinters(timeoutMs);
        if (preferredAddress != null && !preferredAddress.trim().isEmpty()) {
            String wanted = preferredAddress.trim().toUpperCase(Locale.ROOT);
            for (Map<String, String> printer : discovered) {
                if (wanted.equals(getPrinterAddress(printer).toUpperCase(Locale.ROOT))) {
                    return printer;
                }
            }
            BluetoothDevice bonded = findBondedDeviceByAddress(adapter, preferredAddress.trim());
            if (bonded != null && isEpsonPrinterName(safeName(bonded), null)) {
                return buildPrinterInfoFromBondedDevice(bonded);
            }
            return null;
        }
        return pickTargetFromDiscovered(adapter, discovered);
    }

    private Map<String, String> pickTargetFromDiscovered(
            BluetoothAdapter adapter, List<Map<String, String>> discovered) {
        for (Map<String, String> printer : discovered) {
            String name = printer.get(LWPrintDiscoverPrinter.PRINTER_INFO_NAME);
            if (isTargetPrinter(name, printer)) {
                return printer;
            }
        }
        for (Map<String, String> printer : discovered) {
            String name = printer.get(LWPrintDiscoverPrinter.PRINTER_INFO_NAME);
            if (isEpsonPrinterName(name, printer)) {
                return printer;
            }
        }

        BluetoothDevice bonded = findBestBondedPrinter(adapter.getBondedDevices());
        return bonded != null ? buildPrinterInfoFromBondedDevice(bonded) : null;
    }

    private void cachePrinterInfo(Map<String, String> info) {
        if (info == null || info.isEmpty()) {
            return;
        }
        cachedPrinterInfo = new HashMap<>(info);
        Log.d(TAG, "Impresora cacheada: " + getPrinterAddress(info));
    }

    private void clearPrinterCache() {
        cachedPrinterInfo = null;
    }

    private boolean matchesPrinterAddress(Map<String, String> info, String preferredAddress) {
        if (info == null) {
            return false;
        }
        if (preferredAddress == null || preferredAddress.trim().isEmpty()) {
            return true;
        }
        return preferredAddress.trim().equalsIgnoreCase(getPrinterAddress(info));
    }

    private Map<String, String> copyPrinterInfo(Map<String, String> info) {
        return info == null ? null : new HashMap<>(info);
    }

    private List<Map<String, String>> discoverPrinters() {
        return discoverPrinters(DISCOVERY_TIMEOUT_FULL_MS);
    }

    private List<Map<String, String>> discoverPrinters(int timeoutMs) {
        final List<Map<String, String>> found = new ArrayList<>();
        final AtomicReference<LWPrintDiscoverPrinter> discoverRef = new AtomicReference<>();
        final CountDownLatch started = new CountDownLatch(1);

        mainHandler.post(() -> {
            try {
                EnumSet<LWPrintDiscoverConnectionType> flags = EnumSet.of(
                        LWPrintDiscoverConnectionType.ConnectionTypeBluetooth,
                        LWPrintDiscoverConnectionType.ConnectionTypeBLE
                );
                LWPrintDiscoverPrinter discover = new LWPrintDiscoverPrinter(null, null, flags);
                discoverRef.set(discover);
                discover.setCallback(new LWPrintDiscoverPrinterCallback() {
                    @Override
                    public void onFindPrinter(LWPrintDiscoverPrinter discoverPrinter, Map<String, String> printer) {
                        if (printer == null) return;
                        synchronized (found) {
                            for (Map<String, String> existing : found) {
                                if (getPrinterAddress(existing).equals(getPrinterAddress(printer))) {
                                    return;
                                }
                            }
                            found.add(new HashMap<>(printer));
                        }
                        Log.d(TAG, "Impresora encontrada: " + printer.get(LWPrintDiscoverPrinter.PRINTER_INFO_NAME));
                    }

                    @Override
                    public void onRemovePrinter(LWPrintDiscoverPrinter discoverPrinter, Map<String, String> printer) {}
                });
                discover.startDiscover(getContext());
            } catch (Exception e) {
                Log.e(TAG, "Error en descubrimiento: " + e.getMessage());
            } finally {
                started.countDown();
            }
        });

        try {
            started.await(3, TimeUnit.SECONDS);
            Thread.sleep(timeoutMs);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }

        final CountDownLatch stopped = new CountDownLatch(1);
        mainHandler.post(() -> {
            LWPrintDiscoverPrinter discover = discoverRef.get();
            if (discover != null) {
                discover.stopDiscover();
            }
            stopped.countDown();
        });

        try {
            stopped.await(2, TimeUnit.SECONDS);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }

        synchronized (found) {
            if (found.isEmpty()) {
                BluetoothAdapter adapter = BluetoothAdapter.getDefaultAdapter();
                if (adapter != null) {
                    for (BluetoothDevice device : adapter.getBondedDevices()) {
                        if (isEpsonPrinterName(safeName(device), null)) {
                            found.add(buildPrinterInfoFromBondedDevice(device));
                        }
                    }
                }
            }
            return new ArrayList<>(found);
        }
    }

    private Map<String, String> buildPrinterInfoFromBondedDevice(BluetoothDevice device) {
        Map<String, String> info = new HashMap<>();
        String name = safeName(device);
        String address = device.getAddress();

        info.put(LWPrintDiscoverPrinter.PRINTER_INFO_NAME, name);
        info.put(LWPrintDiscoverPrinter.PRINTER_INFO_PRODUCT, TARGET_PRINTER);
        info.put(LWPrintDiscoverPrinter.PRINTER_INFO_USBMDL, "");
        info.put(LWPrintDiscoverPrinter.PRINTER_INFO_HOST, address);
        info.put(LWPrintDiscoverPrinter.PRINTER_INFO_PORT, "");
        info.put(LWPrintDiscoverPrinter.PRINTER_INFO_TYPE, "1");
        info.put(LWPrintDiscoverPrinter.PRINTER_INFO_DOMAIN, "");
        info.put(LWPrintDiscoverPrinter.PRINTER_INFO_SERIAL_NUMBER, address);

        String deviceClass = "";
        if (device.getBluetoothClass() != null) {
            deviceClass = String.valueOf(device.getBluetoothClass().getDeviceClass());
        }
        info.put(LWPrintDiscoverPrinter.PRINTER_INFO_DEVICE_CLASS, deviceClass);
        info.put(LWPrintDiscoverPrinter.PRINTER_INFO_DEVICE_STATUS, "");
        return info;
    }

    private BluetoothDevice findBondedDeviceByAddress(BluetoothAdapter adapter, String address) {
        if (adapter == null || address == null || address.isEmpty()) {
            return null;
        }
        String wanted = address.toUpperCase(Locale.ROOT);
        for (BluetoothDevice device : adapter.getBondedDevices()) {
            if (wanted.equals(device.getAddress().toUpperCase(Locale.ROOT))) {
                return device;
            }
        }
        return null;
    }

    private String getDeviceAlias(BluetoothDevice device) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            try {
                String alias = device.getAlias();
                if (alias != null && !alias.trim().isEmpty()) {
                    return alias.trim();
                }
            } catch (Exception ignored) {
            }
        }
        return "";
    }

    private String formatDeviceId(String address) {
        if (address == null || address.isEmpty()) {
            return "";
        }
        String compact = address.replace(":", "").toUpperCase(Locale.ROOT);
        if (compact.length() <= 6) {
            return compact;
        }
        return compact.substring(compact.length() - 6);
    }

    private BluetoothDevice findBestBondedPrinter(Set<BluetoothDevice> paired) {
        BluetoothDevice fallback = null;
        for (BluetoothDevice device : paired) {
            String name = safeName(device);
            if (isTargetPrinter(name, null)) {
                return device;
            }
            if (fallback == null && isEpsonPrinterName(name, null)) {
                fallback = device;
            }
        }
        return fallback;
    }

    private String getPrinterAddress(Map<String, String> printer) {
        String serial = printer.get(LWPrintDiscoverPrinter.PRINTER_INFO_SERIAL_NUMBER);
        if (serial != null && !serial.isEmpty()) {
            return serial;
        }
        String host = printer.get(LWPrintDiscoverPrinter.PRINTER_INFO_HOST);
        return host != null ? host : "";
    }

    private boolean isTargetPrinter(String name, Map<String, String> printer) {
        if (name != null) {
            String upper = name.toUpperCase(Locale.ROOT);
            if (upper.contains("PX400") || upper.contains("LW-PX400")) {
                return true;
            }
        }
        if (printer != null) {
            String product = printer.get(LWPrintDiscoverPrinter.PRINTER_INFO_PRODUCT);
            if (product != null && product.toUpperCase(Locale.ROOT).contains("PX400")) {
                return true;
            }
        }
        return false;
    }

    private boolean isEpsonPrinterName(String name, Map<String, String> printer) {
        if (name != null && !name.isEmpty()) {
            String upper = name.toUpperCase(Locale.ROOT);
            if (upper.contains("PX400") || upper.contains("LW-PX") || upper.contains("600P")
                    || upper.contains("EPSON") || upper.contains("LABELWORKS")) {
                return true;
            }
        }
        if (printer != null) {
            String product = printer.get(LWPrintDiscoverPrinter.PRINTER_INFO_PRODUCT);
            return product != null && product.toUpperCase(Locale.ROOT).contains("LW");
        }
        return false;
    }

    private String safeName(BluetoothDevice device) {
        try {
            String name = device.getName();
            return name != null ? name : device.getAddress();
        } catch (SecurityException e) {
            return device.getAddress();
        }
    }

    private String describeAbort(int err, int stat) {
        return String.format(Locale.ROOT,
                "Impresión cancelada (error=%d, status=%d). Revisa cinta, tapa y baterías.",
                err, stat);
    }

    private String formatTechnicianCode(String tec) {
        if (tec == null || tec.trim().isEmpty()) {
            return "AG";
        }
        return tec.replace(".", "").replace(" ", "").trim().toUpperCase(Locale.ROOT);
    }

    private Bitmap prepareLogoForThermal(Bitmap source) {
        int width = source.getWidth();
        int height = source.getHeight();
        Bitmap output = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888);
        int[] pixels = new int[width * height];
        source.getPixels(pixels, 0, width, 0, 0, width, height);
        for (int i = 0; i < pixels.length; i++) {
            int color = pixels[i];
            if (Color.alpha(color) < 16) {
                pixels[i] = Color.TRANSPARENT;
                continue;
            }
            int r = Color.red(color);
            int g = Color.green(color);
            int b = Color.blue(color);
            int luminance = (r * 299 + g * 587 + b * 114) / 1000;
            pixels[i] = luminance < 205 ? Color.BLACK : Color.WHITE;
        }
        output.setPixels(pixels, 0, width, 0, 0, width, height);
        return output;
    }

    /**
     * Fuerza blanco/negro puro. Los grises del suavizado de fuente salen
     * borrados o raros en la LW-PX400 (sobre todo el 6, 8, 9…).
     */
    private Bitmap binarizeLabelForThermal(Bitmap source, int luminanceThreshold) {
        int width = source.getWidth();
        int height = source.getHeight();
        Bitmap output = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888);
        int[] pixels = new int[width * height];
        source.getPixels(pixels, 0, width, 0, 0, width, height);
        int threshold = Math.max(1, Math.min(254, luminanceThreshold));
        for (int i = 0; i < pixels.length; i++) {
            int color = pixels[i];
            if (Color.alpha(color) < 128) {
                pixels[i] = Color.WHITE;
                continue;
            }
            int luminance = (Color.red(color) * 299 + Color.green(color) * 587 + Color.blue(color) * 114) / 1000;
            // Umbral más bajo → menos bordes grises pasan a negro → tipografía más fina.
            pixels[i] = luminance < threshold ? Color.BLACK : Color.WHITE;
        }
        output.setPixels(pixels, 0, width, 0, 0, width, height);
        return output;
    }

    /** Tamaño en px enteros: evita tipografía a medias píxeles (números borrosos). */
    private float snapThermalTextSize(float sizePx) {
        return Math.max(1f, Math.round(sizePx));
    }

    private Bitmap loadLogoBitmap() {
        try (InputStream is = getContext().getAssets().open("lab_logo.png")) {
            return BitmapFactory.decodeStream(is);
        } catch (Exception e) {
            Log.w(TAG, "No se pudo cargar lab_logo.png: " + e.getMessage());
            return null;
        }
    }

    private void ensureLabelFonts() {
        if (fontRegular != null) {
            return;
        }
        fontRegular = loadLabelFont("SourceSansPro-Regular.ttf", Typeface.SANS_SERIF);
        fontBold = loadLabelFont("SourceSansPro-Bold.ttf", Typeface.create(Typeface.SANS_SERIF, Typeface.BOLD));
        fontItalic = loadLabelFont("SourceSansPro-Italic.ttf", Typeface.create(Typeface.SANS_SERIF, Typeface.ITALIC));
    }

    private Typeface loadLabelFont(String fileName, Typeface fallback) {
        try {
            return Typeface.createFromAsset(getContext().getAssets(), "fonts/" + fileName);
        } catch (Exception e) {
            Log.w(TAG, "Fuente " + fileName + " no disponible: " + e.getMessage());
            return fallback;
        }
    }

    private Typeface pickLabelFont(LabelFontStyle style) {
        ensureLabelFonts();
        switch (style) {
            case BOLD:
                return fontBold;
            case ITALIC:
                return fontItalic;
            case REGULAR:
            default:
                return fontRegular;
        }
    }

    private float ptToPx(float pt, int res) {
        return pt * res / 72f;
    }

    private float drawFittedText(
            Canvas canvas,
            String text,
            float x,
            float y,
            float maxWidth,
            float startSize,
            float minSize,
            Paint paint
    ) {
        float size = startSize;
        paint.setTextSize(size);
        while (size > minSize && paint.measureText(text) > maxWidth) {
            size *= 0.92f;
            paint.setTextSize(size);
        }
        canvas.drawText(text, x, y, paint);
        return size;
    }

    private float drawCrispFittedText(
            Canvas canvas,
            String text,
            float x,
            float y,
            float maxWidth,
            float startSize,
            float minSize,
            LabelFontStyle style,
            boolean reinforce
    ) {
        Paint crisp = new Paint();
        crisp.setColor(Color.BLACK);
        crisp.setStyle(Paint.Style.FILL);
        crisp.setAntiAlias(false);
        crisp.setFilterBitmap(false);
        crisp.setDither(false);
        crisp.setSubpixelText(false);
        crisp.setLinearText(false);
        crisp.setHinting(Paint.HINTING_ON);
        crisp.setTextAlign(Paint.Align.LEFT);
        crisp.setTypeface(pickLabelFont(style));
        crisp.setFakeBoldText(reinforce);

        float size = snapThermalTextSize(startSize);
        float minPx = snapThermalTextSize(minSize);
        crisp.setTextSize(size);
        while (size > minPx && crisp.measureText(text) > maxWidth) {
            size = Math.max(minPx, size - 1f);
            crisp.setTextSize(size);
        }

        float rx = Math.round(x);
        float ry = Math.round(y);
        canvas.drawText(text, rx, ry, crisp);
        if (reinforce) {
            canvas.drawText(text, rx + 1f, ry, crisp);
        }
        return size;
    }

    /** Texto alineado al borde derecho (p. ej. AG-CAL-F14-00 en 12 mm). */
    private float drawRightAlignedFittedText(
            Canvas canvas,
            String text,
            float right,
            float y,
            float maxWidth,
            float startSize,
            float minSize,
            LabelFontStyle style
    ) {
        Paint crisp = new Paint();
        crisp.setColor(Color.BLACK);
        crisp.setStyle(Paint.Style.FILL);
        crisp.setAntiAlias(false);
        crisp.setFilterBitmap(false);
        crisp.setDither(false);
        crisp.setSubpixelText(false);
        crisp.setLinearText(false);
        crisp.setHinting(Paint.HINTING_ON);
        crisp.setTextAlign(Paint.Align.RIGHT);
        crisp.setTypeface(pickLabelFont(style));

        float size = snapThermalTextSize(startSize);
        float minPx = snapThermalTextSize(minSize);
        crisp.setTextSize(size);
        while (size > minPx && crisp.measureText(text) > maxWidth) {
            size = Math.max(minPx, size - 1f);
            crisp.setTextSize(size);
        }

        canvas.drawText(text, Math.round(right), Math.round(y), crisp);
        return size;
    }

    private void drawStretchedHeaderText(
            Canvas canvas,
            String text,
            float left,
            float right,
            float baselineY,
            Paint paint
    ) {
        if (text.isEmpty()) {
            return;
        }
        if (text.length() == 1) {
            canvas.drawText(text, left, baselineY, paint);
            return;
        }

        float available = right - left;
        float charsW = 0f;
        for (int i = 0; i < text.length(); i++) {
            charsW += paint.measureText(String.valueOf(text.charAt(i)));
        }
        float gap = (available - charsW) / (text.length() - 1);

        float x = left;
        for (int i = 0; i < text.length(); i++) {
            String ch = String.valueOf(text.charAt(i));
            canvas.drawText(ch, x, baselineY, paint);
            x += paint.measureText(ch) + gap;
        }
    }

    /** Encabezado invertido a todo el ancho: franja negra con CALIBRADO en blanco. */
    private float drawThermalHeader(
            Canvas canvas,
            int widthPx,
            float areaTop,
            float pxPerMm,
            int res,
            Paint paint,
            boolean smallTape
    ) {
        float side = LABEL_MARGIN_SIDE_MM * pxPerMm;
        float headerH = (smallTape ? LABEL_HEADER_H_MM_12 : 3.8f) * pxPerMm;
        float top = areaTop;
        float bottom = top + headerH;

        paint.setStyle(Paint.Style.FILL);
        paint.setColor(Color.BLACK);
        canvas.drawRect(0f, top, widthPx, bottom, paint);

        Paint headerText = new Paint(Paint.ANTI_ALIAS_FLAG);
        headerText.setColor(Color.WHITE);
        headerText.setStyle(Paint.Style.FILL);
        headerText.setTypeface(pickLabelFont(LabelFontStyle.BOLD));
        headerText.setTextAlign(Paint.Align.LEFT);
        float headerTextSize = ptToPx(smallTape ? LABEL_PT_HEADER_12 : LABEL_PT_HEADER, res);
        headerText.setTextSize(headerTextSize);

        float maxHeaderTextW = widthPx - (side * 2f);
        float minHeaderSize = smallTape ? LABEL_PT_MIN_12 : 5f;
        while (headerTextSize > minHeaderSize && headerText.measureText("CALIBRADO") > maxHeaderTextW) {
            headerTextSize *= 0.95f;
            headerText.setTextSize(headerTextSize);
        }

        Paint.FontMetrics headerFm = headerText.getFontMetrics();
        float textMidY = top + (headerH / 2f);
        float baseline = textMidY - ((headerFm.ascent + headerFm.descent) / 2f);
        drawStretchedHeaderText(canvas, "CALIBRADO", side, widthPx - side, baseline, headerText);

        paint.setStyle(Paint.Style.FILL);
        paint.setColor(Color.BLACK);
        return bottom + ((smallTape ? 0.12f : 0.25f) * pxPerMm);
    }

    private void drawFooterCode(
            Canvas canvas,
            float bodyBottom,
            float areaBottom,
            float pxPerMm,
            float footerSizePx,
            boolean smallTape
    ) {
        Paint footerPaint = new Paint();
        footerPaint.setColor(Color.BLACK);
        footerPaint.setStyle(Paint.Style.FILL);
        footerPaint.setAntiAlias(false);
        footerPaint.setSubpixelText(false);
        footerPaint.setTypeface(pickLabelFont(LabelFontStyle.ITALIC));
        footerPaint.setTextAlign(Paint.Align.LEFT);
        footerPaint.setTextSize(footerSizePx);

        Paint.FontMetrics fm = footerPaint.getFontMetrics();
        float padBelowBody = smallTape ? 0.35f : 0.75f;
        float padAboveEdge = smallTape ? 0.25f : 0.7f;
        float footerBottom = Math.min(bodyBottom + (padBelowBody * pxPerMm), areaBottom - (padAboveEdge * pxPerMm));
        float baseline = Math.round(footerBottom - fm.descent);
        float x = Math.round(LABEL_MARGIN_SIDE_MM * pxPerMm);
        canvas.drawText(LABEL_FORM_CODE, x, baseline, footerPaint);
    }

    private float drawBaselineFromTop(Paint paint, float topY, float textSize) {
        paint.setTextSize(textSize);
        Paint.FontMetrics fm = paint.getFontMetrics();
        return topY - fm.ascent;
    }

    private Bitmap createLabel(
            String id,
            String cal,
            String ven,
            String cert,
            String tec,
            int tapeHeightPx,
            int res,
            String tapeReq
    ) {
        if ("12mm".equals(tapeReq)) {
            return createLabel12mm(id, cal, ven, cert, tec, res);
        }
        return createLabel24mm(id, cal, ven, cert, tec, res);
    }

    /** Franja CALIBRADO solo sobre el panel derecho (como plantilla Epson 40×12). */
    private float drawContentHeaderBand(
            Canvas canvas,
            float left,
            float right,
            float top,
            float pxPerMm,
            int res,
            Paint paint
    ) {
        float headerH = LABEL_HEADER_H_MM_12 * pxPerMm;
        paint.setStyle(Paint.Style.FILL);
        paint.setColor(Color.BLACK);
        canvas.drawRect(left, top, right, top + headerH, paint);

        Paint headerText = new Paint(Paint.ANTI_ALIAS_FLAG);
        headerText.setColor(Color.WHITE);
        headerText.setStyle(Paint.Style.FILL);
        headerText.setTypeface(pickLabelFont(LabelFontStyle.BOLD));
        headerText.setTextAlign(Paint.Align.LEFT);
        float headerTextSize = ptToPx(LABEL_PT_HEADER_12, res);
        headerText.setTextSize(headerTextSize);
        float pad = 0.35f * pxPerMm;
        float maxW = (right - left) - (pad * 2f);
        while (headerTextSize > LABEL_PT_MIN_12 && headerText.measureText("CALIBRADO") > maxW) {
            headerTextSize *= 0.95f;
            headerText.setTextSize(headerTextSize);
        }
        Paint.FontMetrics fm = headerText.getFontMetrics();
        float baseline = top + (headerH / 2f) - ((fm.ascent + fm.descent) / 2f);
        drawStretchedHeaderText(canvas, "CALIBRADO", left + pad, right - pad, baseline, headerText);

        paint.setColor(Color.BLACK);
        return top + headerH;
    }

    /** Etiqueta 40×12 mm: logo pegado a la izquierda + datos en 2 columnas (letra fina). */
    private Bitmap createLabel12mm(String id, String cal, String ven, String cert, String tec, int res) {
        float pxPerMm = res / 25.4f;
        float safeTop = LABEL_SAFE_TOP_MM_12 * pxPerMm;
        float safeBottom = LABEL_SAFE_BOTTOM_MM_12 * pxPerMm;

        ensureLabelFonts();
        float rowSize = ptToPx(LABEL_PT_ROW_12, res);
        float formSize = ptToPx(LABEL_PT_FORM_12, res);
        float minTextSize = ptToPx(LABEL_PT_MIN_12, res);

        int widthPx = Math.round(LABEL_LENGTH_MM_12 * pxPerMm);
        int heightPx = Math.round(TAPE_WIDTH_MM_12 * pxPerMm);

        Bitmap bmp = Bitmap.createBitmap(widthPx, heightPx, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(bmp);
        canvas.drawColor(Color.WHITE);

        Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        paint.setColor(Color.BLACK);
        paint.setStyle(Paint.Style.FILL);

        float areaTop = safeTop;
        float areaBottom = heightPx - safeBottom;
        float side = LABEL_MARGIN_SIDE_MM_12 * pxPerMm;
        float logoColW = LABEL_LOGO_COL_MM_12 * pxPerMm;
        float gap = 0.55f * pxPerMm;
        float contentLeft = side + logoColW + gap;
        float contentRight = widthPx - side;

        Bitmap logo = loadLogoBitmap();
        if (logo != null) {
            Bitmap logoPrint = prepareLogoForThermal(logo);
            float areaH = areaBottom - areaTop;
            // Tamaño normal del logo; solo pegado al borde izquierdo (sin reducir).
            float scale = Math.min(logoColW / logoPrint.getWidth(), areaH / logoPrint.getHeight());
            float scaledW = logoPrint.getWidth() * scale;
            float scaledH = logoPrint.getHeight() * scale;
            float left = side;
            float top = areaTop + (areaH - scaledH) / 2f;
            canvas.drawBitmap(logoPrint, null, new RectF(left, top, left + scaledW, top + scaledH), paint);
            if (logoPrint != logo) {
                logoPrint.recycle();
            }
        }

        float bodyTop = drawContentHeaderBand(canvas, contentLeft, contentRight, areaTop, pxPerMm, res, paint);
        bodyTop += 0.08f * pxPerMm;
        float bodyH = areaBottom - bodyTop;
        float rowH = bodyH / 3f;
        // Columna der más a la derecha → CALIBRÓ / Cert no se pegan a las fechas.
        float splitX = contentLeft + ((contentRight - contentLeft) * 0.58f);
        float colGap = 0.35f * pxPerMm;
        float leftColW = splitX - contentLeft - colGap;
        float rightColW = contentRight - splitX;

        float row0Top = bodyTop;
        float row1Top = bodyTop + rowH;
        float row2Top = bodyTop + (rowH * 2f);

        float y0 = drawBaselineFromTop(paint, row0Top + (rowH * 0.05f), rowSize);
        drawCrispFittedText(canvas, "ID: " + id, contentLeft, y0, leftColW, rowSize, minTextSize, LabelFontStyle.REGULAR, false);
        drawRightAlignedFittedText(canvas, "Cert: " + cert, contentRight, y0, rightColW, rowSize, minTextSize, LabelFontStyle.REGULAR);

        float y1 = drawBaselineFromTop(paint, row1Top + (rowH * 0.05f), rowSize);
        drawCrispFittedText(canvas, "F.CAL: " + cal, contentLeft, y1, leftColW, rowSize, minTextSize, LabelFontStyle.REGULAR, false);
        drawRightAlignedFittedText(canvas, "CALIBRÓ: " + tec, contentRight, y1, rightColW, rowSize, minTextSize, LabelFontStyle.REGULAR);

        float y2 = drawBaselineFromTop(paint, row2Top + (rowH * 0.05f), rowSize);
        drawCrispFittedText(canvas, "F.SUG: " + ven, contentLeft, y2, leftColW, rowSize, minTextSize, LabelFontStyle.REGULAR, false);
        drawRightAlignedFittedText(
                canvas,
                LABEL_FORM_CODE,
                contentRight,
                y2,
                rightColW,
                formSize,
                minTextSize,
                LabelFontStyle.REGULAR
        );

        return bmp;
    }

    private Bitmap createLabel24mm(String id, String cal, String ven, String cert, String tec, int res) {
        float pxPerMm = res / 25.4f;
        float safeTop = LABEL_SAFE_TOP_MM * pxPerMm;
        float safeBottom = LABEL_SAFE_BOTTOM_MM * pxPerMm;

        ensureLabelFonts();
        float idSize = ptToPx(LABEL_PT_ID, res);
        float rowSize = ptToPx(LABEL_PT_BODY, res);
        float footerSize = ptToPx(LABEL_PT_FOOTER, res);
        float minTextSize = ptToPx(LABEL_PT_MIN, res);

        int widthPx = Math.round(LABEL_LENGTH_MM_24 * pxPerMm);
        int heightPx = Math.round(TAPE_WIDTH_MM_24 * pxPerMm);

        Bitmap bmp = Bitmap.createBitmap(widthPx, heightPx, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(bmp);
        canvas.drawColor(Color.WHITE);

        Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        paint.setColor(Color.BLACK);
        paint.setStyle(Paint.Style.FILL);

        float areaTop = safeTop;
        float areaBottom = heightPx - safeBottom;
        float footerReserve = 2.4f * pxPerMm;

        float bodyTop = drawThermalHeader(canvas, widthPx, areaTop, pxPerMm, res, paint, false);
        float bodyBottom = areaBottom - footerReserve;
        drawFooterCode(canvas, bodyBottom, areaBottom, pxPerMm, footerSize, false);
        float bodyH = bodyBottom - bodyTop;

        float logoWidth = 13.5f * pxPerMm;
        float contentX = (LABEL_MARGIN_SIDE_MM * pxPerMm) + logoWidth + (2.35f * pxPerMm);
        float contentW = widthPx - contentX - (LABEL_MARGIN_SIDE_MM * pxPerMm);

        Bitmap logo = loadLogoBitmap();
        if (logo != null) {
            Bitmap logoPrint = prepareLogoForThermal(logo);
            float logoMaxH = bodyH * 1.18f;
            float scale = Math.min(logoWidth / logoPrint.getWidth(), logoMaxH / logoPrint.getHeight());
            float scaledW = logoPrint.getWidth() * scale;
            float scaledH = logoPrint.getHeight() * scale;
            float logoLeft = LABEL_MARGIN_SIDE_MM * pxPerMm;
            float left = logoLeft + (logoWidth - scaledW) / 2f;
            float top = bodyTop + (bodyH - scaledH) / 2f - (1.1f * pxPerMm);
            canvas.drawBitmap(logoPrint, null, new RectF(left, top, left + scaledW, top + scaledH), paint);
            if (logoPrint != logo) {
                logoPrint.recycle();
            }
        } else {
            contentX = LABEL_MARGIN_SIDE_MM * pxPerMm;
            contentW = widthPx - contentX - (LABEL_MARGIN_SIDE_MM * pxPerMm);
        }

        int lines = 5;
        float blockH = idSize + (rowSize * (lines - 1));
        float firstTop = bodyTop + Math.max(0f, (bodyH - blockH) / 2f);

        float y = drawBaselineFromTop(paint, firstTop, idSize);
        drawCrispFittedText(canvas, "ID: " + id, contentX, y, contentW, idSize, minTextSize, LabelFontStyle.BOLD, false);

        y = drawBaselineFromTop(paint, firstTop + idSize, rowSize);
        drawCrispFittedText(canvas, "F.CAL: " + cal, contentX, y, contentW, rowSize, minTextSize, LabelFontStyle.BOLD, false);

        y = drawBaselineFromTop(paint, firstTop + idSize + rowSize, rowSize);
        drawCrispFittedText(canvas, "F.SUG: " + ven, contentX, y, contentW, rowSize, minTextSize, LabelFontStyle.BOLD, false);

        y = drawBaselineFromTop(paint, firstTop + idSize + (rowSize * 2f), rowSize);
        drawCrispFittedText(canvas, "CALIBRÓ: " + tec, contentX, y, contentW, rowSize, minTextSize, LabelFontStyle.BOLD, false);

        y = drawBaselineFromTop(paint, firstTop + idSize + (rowSize * 3f), rowSize);
        drawCrispFittedText(canvas, "CERT: " + cert, contentX, y, contentW, rowSize, minTextSize, LabelFontStyle.BOLD, false);

        return bmp;
    }

    private void fail(PluginCall call, String code, String msg) {
        mainHandler.post(() -> {
            isPrinting = false;
            call.reject(code, msg);
        });
    }
}
