package com.example.app;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.util.Log;
import android.widget.Toast;

import androidx.core.content.FileProvider;

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
    
    // Nombres de paquete oficiales de Epson
    private static final String[] EPSON_PACKAGES = {
        "com.epson.labelmobile",  // Epson Label Editor Mobile (Principal)
        "jp.co.epson.labelworks.labeleditor",
        "com.epson.labeleditor"
    };

    private String detectedPackage = null;

    @PluginMethod
    public void printLabel(PluginCall call) {
        String id = call.getString("id", "SIN-ID");
        String fechaCal = call.getString("fechaCal", "N/A");
        String fechaSug = call.getString("fechaSug", "N/A");
        String certificado = call.getString("certificado", "PEND");
        String calibro = call.getString("calibro", "AG");

        openEpsonApp(call, id, fechaCal, fechaSug, certificado, calibro);
    }

    @PluginMethod
    public void findEpsonPackages(PluginCall call) {
        try {
            PackageManager pm = getContext().getPackageManager();
            java.util.List<android.content.pm.ApplicationInfo> packages = 
                pm.getInstalledApplications(PackageManager.GET_META_DATA);
            
            java.util.ArrayList<String> epsonApps = new java.util.ArrayList<>();
            for (android.content.pm.ApplicationInfo packageInfo : packages) {
                if (packageInfo.packageName.contains("epson") || packageInfo.packageName.contains("label")) {
                    epsonApps.add(packageInfo.packageName);
                }
            }
            
            com.getcapacitor.JSObject ret = new com.getcapacitor.JSObject();
            ret.put("packages", new com.getcapacitor.JSArray(epsonApps));
            ret.put("count", epsonApps.size());
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Error buscando paquetes: " + e.getMessage());
        }
    }

    private void openEpsonApp(PluginCall call, String id, String fechaCal, String fechaSug, 
                             String cert, String calibro) {
        try {
            if (!isEpsonAppInstalled()) {
                Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=com.epson.labelmobile"));
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(intent);
                call.reject("Instala Epson Label Editor Mobile");
                return;
            }

            File lemdFile = createLEMDFile(id, fechaCal, fechaSug, cert, calibro);
            
            if (lemdFile == null) {
                call.reject("Error al generar el archivo de etiqueta");
                return;
            }

            // Generar URI usando FileProvider (VITAL para permisos)
            Uri fileUri = FileProvider.getUriForFile(
                getContext(),
                getContext().getPackageName() + ".fileprovider",
                lemdFile
            );

            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setDataAndType(fileUri, "application/octet-stream");
            intent.setPackage(detectedPackage);
            intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_GRANT_READ_URI_PERMISSION);
            
            getContext().startActivity(intent);
            
            Toast.makeText(getActivity(), "Enviando a Epson...", Toast.LENGTH_SHORT).show();
            call.resolve();

        } catch (Exception e) {
            Log.e(TAG, "Error en openEpsonApp: " + e.getMessage());
            call.reject(e.getMessage());
        }
    }

    private boolean isEpsonAppInstalled() {
        PackageManager pm = getContext().getPackageManager();
        for (String packageName : EPSON_PACKAGES) {
            try {
                pm.getPackageInfo(packageName, 0);
                detectedPackage = packageName;
                return true;
            } catch (PackageManager.NameNotFoundException e) {
                continue;
            }
        }
        return false;
    }

    private File createLEMDFile(String id, String fechaCal, String fechaSug, 
                               String cert, String calibro) {
        try {
            // 1. Leer plantilla desde assets de Android
            InputStream is = getContext().getAssets().open("Etiqueta-24mm-2.lemd");
            BufferedReader reader = new BufferedReader(new InputStreamReader(is, "UTF-8"));
            StringBuilder sb = new StringBuilder();
            String line;
            while ((line = reader.readLine()) != null) {
                sb.append(line).append("\n");
            }
            is.close();

            String template = sb.toString();

            // 2. Reemplazo de datos (Placeholders exactos del archivo .lemd)
            template = template.replace("EP-1234", id);
            template = template.replace("2024-SEP-20", fechaCal);
            template = template.replace("2025-SEP-20", fechaSug);
            template = template.replace("AGPT-1234-24", cert);
            // Reemplazo especial para el campo de calibro dentro de etiquetas XML
            template = template.replace(">AG<", ">" + calibro + "<");

            // 3. Escribir archivo temporal en la caché de la App
            File cacheDir = getContext().getCacheDir();
            File lemdFile = new File(cacheDir, "print_label_temp.lemd");
            
            FileOutputStream fos = new FileOutputStream(lemdFile);
            fos.write(template.getBytes("UTF-8"));
            fos.flush();
            fos.close();

            Log.d(TAG, "Archivo LEMD generado en: " + lemdFile.getAbsolutePath());
            return lemdFile;

        } catch (Exception e) {
            Log.e(TAG, "Error crítico creando archivo LEMD: " + e.getMessage());
            return null;
        }
    }
}