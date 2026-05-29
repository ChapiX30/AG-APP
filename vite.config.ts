import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
    resolve: {
        // Prefer .tsx over .ts so extensionless imports hit JSX modules first
        extensions: ['.mjs', '.js', '.mts', '.tsx', '.ts', '.jsx', '.json'],
    },
    plugins: [
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
            includeAssets: ['lab_logo.png', 'pwa-192.png', 'pwa-512.png'],
            workbox: {
                cleanupOutdatedCaches: true,
                clientsClaim: true,
                skipWaiting: false,
            },
        })
    ]
})
