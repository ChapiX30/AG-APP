import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { BrowserRouter } from 'react-router-dom';

// 👇--- LÓGICA DEL SERVICE WORKER ---👇
if ('serviceWorker' in navigator) {
  // 1. REGISTRAR EL SERVICE WORKER DE FIREBASE (NUEVO)
  navigator.serviceWorker
    .register('/firebase-messaging-sw.js')
    .then((registration) => {
      console.log('Service Worker de Firebase registrado con éxito:', registration.scope);
    })
    .catch((err) => {
      console.error('Fallo al registrar el Service Worker de Firebase:', err);
    });

  // 2. TU LÓGICA PARA FORZAR ACTUALIZACIONES (SKIP_WAITING)
  navigator.serviceWorker.getRegistration().then(reg => {
    if (reg && reg.waiting) {
      reg.waiting.postMessage({ type: 'SKIP_WAITING' });
    }
  });

  // Recargamos la página automáticamente cuando el nuevo SW toma el control
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    window.location.reload();
  });
}
// 👆--- HASTA AQUÍ LA LÓGICA DEL SW ---👆

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>
);