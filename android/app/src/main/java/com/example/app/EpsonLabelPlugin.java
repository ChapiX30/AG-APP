package com.example.app;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.util.Log;
import android.widget.Toast;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.util.ArrayList;
import java.util.List;

@CapacitorPlugin(
    name = "EpsonLabel",
    permissions = {
        @Permission(
            alias = "storage",
            strings = {
                Manifest.permission.READ_EXTERNAL_STORAGE,
                Manifest.permission.WRITE_EXTERNAL_STORAGE
            }
        )
    }
)
public class EpsonLabelPlugin extends Plugin {

    private static final String TAG = "EpsonLabel";

    private static final String[] EPSON_PACKAGES = {
        "com.epson.labelmobile",
        "jp.co.epson.labelworks.labeleditor",
        "com.epson.labeleditor"
    };

    // Nombre del archivo .lemd en android/app/src/main/assets/
    // ⚠️ VERIFICA QUE ESTE NOMBRE COINCIDA EXACTAMENTE CON TU ARCHIVO EN assets/
    private static final String LEMD_ASSET_NAME = "Etiqueta-24mm-2.lemd";

    private String detectedPackage = null;

    @PluginMethod
    public void printLabel(PluginCall call) {
        String id          = call.getString("id",          "SIN-ID");
        String fechaCal    = call.getString("fechaCal",    "N/A");
        String fechaSug    = call.getString("fechaSug",    "N/A");
        String certificado = call.getString("certificado", "PEND");
        String calibro     = call.getString("calibro",     "AG");

        Log.d(TAG, "printLabel() llamado → id=" + id + " fechaCal=" + fechaCal
                + " fechaSug=" + fechaSug + " cert=" + certificado + " calibro=" + calibro);

        // ── 1. Verificar que la app Epson está instalada ──────────────────────
        if (!isEpsonAppInstalled()) {
            Log.e(TAG, "Ninguna app Epson encontrada en el dispositivo.");
            // Abrir Play Store para instalarla
            try {
                Intent market = new Intent(Intent.ACTION_VIEW,
                        Uri.parse("market://details?id=com.epson.labelmobile"));
                market.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(market);
            } catch (Exception ignored) {}
            call.reject("NO_APP", "La app 'Epson Label Editor Mobile' no está instalada. Se abrió Play Store.");
            return;
        }
        Log.d(TAG, "App Epson detectada: " + detectedPackage);

        // ── 2. Verificar que el asset .lemd existe ────────────────────────────
        if (!assetExists(LEMD_ASSET_NAME)) {
            String msg = "Archivo plantilla no encontrado en assets: " + LEMD_ASSET_NAME
                    + ". Coloca el archivo en android/app/src/main/assets/";
            Log.e(TAG, msg);
            call.reject("NO_LEMD_ASSET", msg);
            return;
        }

        // ── 3. Generar el archivo .lemd con los datos reales ──────────────────
        File lemdFile = createLEMDFile(id, fechaCal, fechaSug, certificado, calibro);
        if (lemdFile == null) {
            call.reject("LEMD_ERROR", "No se pudo generar el archivo de etiqueta. Revisa el logcat para detalles.");
            return;
        }
        Log.d(TAG, "Archivo LEMD generado: " + lemdFile.getAbsolutePath()
                + " (" + lemdFile.length() + " bytes)");

        // ── 4. Obtener URI via FileProvider ───────────────────────────────────
        Uri fileUri;
        try {
            fileUri = FileProvider.getUriForFile(
                    getContext(),
                    getContext().getPackageName() + ".fileprovider",
                    lemdFile
            );
        } catch (IllegalArgumentException e) {
            String msg = "FileProvider error: " + e.getMessage()
                    + ". Verifica que res/xml/file_paths.xml incluya la ruta de caché.";
            Log.e(TAG, msg);
            call.reject("FILEPROVIDER_ERROR", msg);
            return;
        }

        // ── 5. Lanzar la app Epson con el archivo ─────────────────────────────
        try {
            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setDataAndType(fileUri, "application/octet-stream");
            intent.setPackage(detectedPackage);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_GRANT_READ_URI_PERMISSION);

            // Verificar que el Intent puede resolverse ANTES de lanzarlo
            if (getContext().getPackageManager().resolveActivity(intent, 0) == null) {
                // La app existe pero no maneja este tipo de archivo con este MIME
                // Intentar sin MIME específico
                Log.w(TAG, "resolveActivity falló con MIME octet-stream, intentando sin MIME...");
                intent.setData(fileUri);
                intent.setType(null);
                intent.setPackage(detectedPackage);
            }

            getContext().startActivity(intent);
            Log.d(TAG, "Intent lanzado correctamente hacia: " + detectedPackage);

            Toast.makeText(getActivity(), "✅ Enviando etiqueta a Epson...", Toast.LENGTH_SHORT).show();

            JSObject result = new JSObject();
            result.put("success", true);
            result.put("package", detectedPackage);
            result.put("file", lemdFile.getAbsolutePath());
            call.resolve(result);

        } catch (Exception e) {
            String msg = "Error al lanzar la app Epson: " + e.getMessage();
            Log.e(TAG, msg, e);
            call.reject("INTENT_ERROR", msg);
        }
    }

    @PluginMethod
    public void findEpsonPackages(PluginCall call) {
        try {
            PackageManager pm = getContext().getPackageManager();
            List<android.content.pm.ApplicationInfo> packages =
                    pm.getInstalledApplications(PackageManager.GET_META_DATA);

            ArrayList<String> found = new ArrayList<>();
            for (android.content.pm.ApplicationInfo info : packages) {
                if (info.packageName.contains("epson") || info.packageName.contains("label")) {
                    found.add(info.packageName);
                    Log.d(TAG, "App encontrada: " + info.packageName);
                }
            }

            // También verificar los conocidos específicamente
            for (String pkg : EPSON_PACKAGES) {
                try {
                    pm.getPackageInfo(pkg, 0);
                    if (!found.contains(pkg)) found.add(pkg + " ✅ (conocido)");
                    Log.d(TAG, "Paquete Epson conocido instalado: " + pkg);
                } catch (PackageManager.NameNotFoundException ignored) {
                    Log.d(TAG, "Paquete Epson conocido NO instalado: " + pkg);
                }
            }

            // Verificar asset
            boolean assetOk = assetExists(LEMD_ASSET_NAME);
            Log.d(TAG, "Asset '" + LEMD_ASSET_NAME + "' existe: " + assetOk);

            JSObject ret = new JSObject();
            ret.put("packages", new com.getcapacitor.JSArray(found));
            ret.put("count", found.size());
            ret.put("assetExists", assetOk);
            ret.put("assetName", LEMD_ASSET_NAME);
            call.resolve(ret);

        } catch (Exception e) {
            call.reject("ERROR", "Error buscando paquetes: " + e.getMessage());
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Helpers
    // ─────────────────────────────────────────────────────────────────────────

    private boolean isEpsonAppInstalled() {
        PackageManager pm = getContext().getPackageManager();
        for (String pkg : EPSON_PACKAGES) {
            try {
                pm.getPackageInfo(pkg, 0);
                detectedPackage = pkg;
                return true;
            } catch (PackageManager.NameNotFoundException ignored) {}
        }
        return false;
    }

    private boolean assetExists(String assetName) {
        try {
            InputStream is = getContext().getAssets().open(assetName);
            is.close();
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    private File createLEMDFile(String id, String fechaCal, String fechaSug,
                                String cert, String calibro) {
        try {
            InputStream is = getContext().getAssets().open(LEMD_ASSET_NAME);
            BufferedReader reader = new BufferedReader(new InputStreamReader(is, "UTF-8"));
            StringBuilder sb = new StringBuilder();
            String line;
            while ((line = reader.readLine()) != null) {
                sb.append(line).append("\n");
            }
            reader.close();
            is.close();

            String template = sb.toString();

            // ⚠️ IMPORTANTE: estos placeholders deben coincidir EXACTAMENTE
            // con los valores que están en tu archivo Etiqueta-24mm-2.lemd
            template = template.replace("EP-1234",          id);
            template = template.replace("2024-SEP-20",      fechaCal);
            template = template.replace("2025-SEP-20",      fechaSug);
            template = template.replace("AGPT-1234-24",     cert);
            template = template.replace(">AG<",             ">" + calibro + "<");

            Log.d(TAG, "Template reemplazado. Tamaño final: " + template.length() + " chars");

            File cacheDir = getContext().getCacheDir();
            File lemdFile = new File(cacheDir, "print_label_temp.lemd");

            FileOutputStream fos = new FileOutputStream(lemdFile);
            fos.write(template.getBytes("UTF-8"));
            fos.flush();
            fos.close();

            return lemdFile;

        } catch (Exception e) {
            Log.e(TAG, "Error creando archivo LEMD: " + e.getMessage(), e);
            return null;
        }
    }
}