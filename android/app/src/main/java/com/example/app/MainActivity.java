package com.tuapp; // ← cambia a tu paquete real (ej: com.agcal.app)

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(EpsonLabelPlugin.class); // ✅ PRIMERO el plugin
        super.onCreate(savedInstanceState);     // ✅ DESPUÉS Capacitor Bridge
    }
}
