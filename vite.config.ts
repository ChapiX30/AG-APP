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
            registerType: 'prompt', // Actualización solo cuando el usuario lo confirma (evita recargas en bucle en tablet)
            manifest: {
                name: 'AG App',
                short_name: 'AGApp',
                description: 'Tu app de metrología profesional',
                start_url: '/',
                display: 'standalone',
                background_color: '#ffffff',
                theme_color: '#0050d8',
                icons: [
                    {
                        src: '/lab_logo.png',
                        sizes: '192x192',
                        type: 'image/png'
                    },
                    {
                        src: '/logo512.png',
                        sizes: '512x512',
                        type: 'image/png'
                    }
                ]
            },
            workbox: {
                cleanupOutdatedCaches: true,
                clientsClaim: true,
                // Sin skipWaiting: el SW nuevo espera hasta que el usuario pulse "Actualizar"
            }
        })
    ]
})
