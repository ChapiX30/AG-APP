import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
    plugins: [
        react(),
        VitePWA({
            registerType: 'autoUpdate', // Se actualiza siempre que subas cambios a Vercel
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
                        src: '/logo192.png',
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
                // Mejora la cache y el refresco automático
                cleanupOutdatedCaches: true,
                clientsClaim: true,
                skipWaiting: true,
            }
        })
    ]
})
