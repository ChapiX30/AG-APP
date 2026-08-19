import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

function copyPdfiumWasm(): Plugin {
    const copy = () => {
        const src = resolve('node_modules/@embedpdf/pdfium/dist/pdfium.wasm')
        const destDir = resolve('public/embedpdf')
        const dest = resolve(destDir, 'pdfium.wasm')
        if (!existsSync(src)) return
        mkdirSync(destDir, { recursive: true })
        copyFileSync(src, dest)
    }
    return {
        name: 'copy-pdfium-wasm',
        buildStart: copy,
        configureServer: copy,
    }
}

export default defineConfig({
    resolve: {
        // Prefer .tsx over .ts so extensionless imports hit JSX modules first
        extensions: ['.mjs', '.js', '.mts', '.tsx', '.ts', '.jsx', '.json'],
    },
    plugins: [
        copyPdfiumWasm(),
        react(),
        VitePWA({
            registerType: 'prompt',
            injectRegister: null,
            manifest: {
                name: 'Equipos y Servicios AG',
                short_name: 'Equipos AG',
                description: 'Tu app de metrología profesional',
                start_url: '/',
                display: 'standalone',
                background_color: '#ffffff',
                theme_color: '#2464A3',
                icons: [
                    {
                        src: 'pwa-192.png',
                        sizes: '192x192',
                        type: 'image/png',
                        purpose: 'any',
                    },
                    {
                        src: 'pwa-512.png',
                        sizes: '512x512',
                        type: 'image/png',
                        purpose: 'any',
                    },
                    {
                        src: 'pwa-512.png',
                        sizes: '512x512',
                        type: 'image/png',
                        purpose: 'maskable',
                    },
                ],
            },
            includeAssets: ['lab_logo.png', 'pwa-192.png', 'pwa-512.png', 'embedpdf/pdfium.wasm'],
            workbox: {
                cleanupOutdatedCaches: true,
                clientsClaim: true,
                skipWaiting: false,
                // Evita que caches viejos / precache peleen con el SW de FCM.
                navigateFallbackDenylist: [/^\/api/, /^\/__/],
            },
            // En build de Capacitor el SW PWA aporta más problemas que beneficios.
            devOptions: {
                enabled: false,
            },
        })
    ]
})
