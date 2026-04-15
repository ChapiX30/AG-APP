package com.example.app; // ← debe ser IGUAL al package de EpsonLabelPlugin.java

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(EpsonLabelPlugin.class); // ✅ PRIMERO el plugin
        super.onCreate(savedInstanceState); // ✅ DESPUÉS Capacitor Bridge
    }
}