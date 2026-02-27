package com.example.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState); // 1. Primero inicializamos la base de Capacitor
        
        // 2. Después registramos el plugin para que el "Bridge" ya exista
        registerPlugin(EpsonLabelPlugin.class); 
    }
}