package com.example.app;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.util.Log;
import android.widget.Toast;

import androidx.core.content.ContextCompat;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.io.File;
import java.io.FileOutputStream;

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
    // Posibles nombres de paquete de la app de Epson
    private static final String[] EPSON_PACKAGES = {
        "com.epson.labelmobile",  // Epson Label Editor Mobile
        "jp.co.epson.labelworks.labeleditor",
        "com.epson.labeleditor",
        "jp.co.epson.easyinteractivetools.labeleditor"
    };
    private PluginCall savedCall;
    private String detectedPackage = null;

    @PluginMethod
    public void printLabel(PluginCall call) {
        this.savedCall = call;

        final String id = call.getString("id", "SIN-ID");
        final String fechaCal = call.getString("fechaCal", "N/A");
        final String fechaSug = call.getString("fechaSug", "N/A");
        final String certificado = call.getString("certificado", "PEND");
        final String calibro = call.getString("calibro", "AG");
        final String tapeSize = call.getString("tapeSize", "24mm");

        openEpsonApp(id, fechaCal, fechaSug, certificado, calibro, tapeSize);
    }

    @PluginMethod
    public void findEpsonPackages(PluginCall call) {
        try {
            android.content.pm.PackageManager pm = getContext().getPackageManager();
            java.util.List<android.content.pm.ApplicationInfo> packages = 
                pm.getInstalledApplications(android.content.pm.PackageManager.GET_META_DATA);
            
            java.util.ArrayList<String> epsonApps = new java.util.ArrayList<>();
            
            for (android.content.pm.ApplicationInfo packageInfo : packages) {
                String packageName = packageInfo.packageName.toLowerCase();
                // Buscar cualquier app que contenga "epson" o "label"
                if (packageName.contains("epson") || packageName.contains("label")) {
                    String appName = "";
                    try {
                        appName = pm.getApplicationLabel(packageInfo).toString();
                    } catch (Exception e) {
                        appName = packageInfo.packageName;
                    }
                    epsonApps.add(appName + " → " + packageInfo.packageName);
                    Log.d(TAG, "App encontrada: " + appName + " (" + packageInfo.packageName + ")");
                }
            }
            
            com.getcapacitor.JSObject ret = new com.getcapacitor.JSObject();
            ret.put("packages", new com.getcapacitor.JSArray(epsonApps));
            ret.put("count", epsonApps.size());
            call.resolve(ret);
            
        } catch (Exception e) {
            Log.e(TAG, "Error buscando paquetes: " + e.getMessage());
            call.reject("Error buscando paquetes: " + e.getMessage());
        }
    }

    private void openEpsonApp(String id, String fechaCal, String fechaSug, 
                             String cert, String calibro, String tapeSize) {
        try {
            // Verificar si la app de Epson está instalada
            if (!isEpsonAppInstalled()) {
                // Abrir Play Store para instalar la app
                Intent playStoreIntent = new Intent(Intent.ACTION_VIEW);
                playStoreIntent.setData(Uri.parse("market://details?id=" + EPSON_PACKAGES[0]));
                playStoreIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                
                try {
                    getContext().startActivity(playStoreIntent);
                    savedCall.reject("Instala 'Label Editor Mobile' de Epson primero");
                } catch (Exception e) {
                    // Si no tiene Play Store, abrir en navegador
                    playStoreIntent.setData(Uri.parse("https://play.google.com/store/apps/details?id=" + EPSON_PACKAGES[0]));
                    getContext().startActivity(playStoreIntent);
                    savedCall.reject("Instala 'Label Editor Mobile' de Epson primero");
                }
                return;
            }

            // Crear archivo .lemd temporal con los datos
            File lemdFile = createLEMDFile(id, fechaCal, fechaSug, cert, calibro);
            
            if (lemdFile == null || !lemdFile.exists()) {
                throw new Exception("No se pudo crear el archivo de etiqueta");
            }

            // Usar FileProvider para Android 7+
            Uri fileUri;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                fileUri = androidx.core.content.FileProvider.getUriForFile(
                    getContext(),
                    getContext().getPackageName() + ".fileprovider",
                    lemdFile
                );
            } else {
                fileUri = Uri.fromFile(lemdFile);
            }

            // Abrir el archivo con la app de Epson detectada
            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setDataAndType(fileUri, "application/octet-stream");
            intent.setPackage(detectedPackage);  // Usar el paquete detectado
            intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_GRANT_READ_URI_PERMISSION);
            
            Log.d(TAG, "Abriendo con paquete: " + detectedPackage);
            getContext().startActivity(intent);
            
            Toast.makeText(getActivity(), "Abriendo Label Editor Mobile...", Toast.LENGTH_SHORT).show();
            savedCall.resolve();

        } catch (Exception e) {
            Log.e(TAG, "Error: " + e.getMessage(), e);
            savedCall.reject("Error al abrir Label Editor: " + e.getMessage());
        }
    }

    private boolean isEpsonAppInstalled() {
        for (String packageName : EPSON_PACKAGES) {
            try {
                getContext().getPackageManager().getPackageInfo(packageName, 0);
                detectedPackage = packageName;
                Log.d(TAG, "App de Epson detectada: " + packageName);
                return true;
            } catch (PackageManager.NameNotFoundException e) {
                // Continuar buscando
            }
        }
        Log.e(TAG, "No se encontró ninguna app de Epson instalada");
        return false;
    }

    private File createLEMDFile(String id, String fechaCal, String fechaSug, 
                               String cert, String calibro) {
        try {
            // Copiar la plantilla desde assets
            java.io.InputStream is = getContext().getAssets().open("Etiqueta-24mm-2.lemd");
            java.util.Scanner scanner = new java.util.Scanner(is, "UTF-8").useDelimiter("\\A");
            String template = scanner.hasNext() ? scanner.next() : "";
            is.close();

            // Reemplazar placeholders
            template = template.replace("EP-1234", id);
            template = template.replace("2024-SEP-20", fechaCal);
            template = template.replace("2025-SEP-20", fechaSug);
            template = template.replace("AGPT-1234-24", cert);
            template = template.replace("\"AG\"", "\"" + calibro + "\"");

            // Guardar en archivo temporal
            File cacheDir = getContext().getCacheDir();
            File lemdFile = new File(cacheDir, "etiqueta_" + id + ".lemd");
            
            FileOutputStream fos = new FileOutputStream(lemdFile);
            fos.write(template.getBytes("UTF-8"));
            fos.close();

            Log.d(TAG, "Archivo creado: " + lemdFile.getAbsolutePath());
            return lemdFile;

        } catch (Exception e) {
            Log.e(TAG, "Error creando archivo: " + e.getMessage());
            return null;
        }
    }
}