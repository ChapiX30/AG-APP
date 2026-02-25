package com.example.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // 1. ¡PRIMERO registramos al empleado!
        registerPlugin(EpsonLabelPlugin.class);

        // 2. LUEGO iniciamos la fábrica (la app)
        super.onCreate(savedInstanceState);
    }
}