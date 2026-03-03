import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { BrowserRouter } from 'react-router-dom';

// 👇--- AGREGA ESTE BLOQUE ANTES DEL RENDER ---👇
if ('serviceWorker' in navigator) {
  // Enviamos el mensaje SKIP_WAITING si hay un SW "waiting"
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
// 👆--- HASTA AQUÍ EL BLOQUE NUEVO ---👆

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>
);
