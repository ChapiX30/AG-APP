import React, { useEffect, useState } from 'react'

// El hook para detectar SW actualizado
function useSWUpdate() {
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null)
  const [showReload, setShowReload] = useState(false)

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistration().then((reg) => {
        if (!reg) return
        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing
          if (newWorker) {
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                setWaitingWorker(newWorker)
                setShowReload(true)
              }
            })
          }
        })
      })
    }
  }, [])

  const reloadPage = () => {
    waitingWorker?.postMessage({ type: 'SKIP_WAITING' })
    window.location.reload()
  }

  return { showReload, reloadPage }
}

const UpdateBanner: React.FC = () => {
  const { showReload, reloadPage } = useSWUpdate()

  if (!showReload) return null

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 24,
        left: 0,
        right: 0,
        margin: 'auto',
        width: 'fit-content',
        zIndex: 9999,
        background: 'linear-gradient(90deg,#0050d8 60%,#51b5ff 100%)',
        color: '#fff',
        borderRadius: 14,
        boxShadow: '0 4px 18px rgba(80,80,180,0.14)',
        padding: '18px 30px',
        fontSize: 18,
        fontWeight: 600,
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        cursor: 'pointer'
      }}
      onClick={reloadPage}
    >
      <span style={{ marginRight: 10 }}>🔄</span>
      ¡Nueva versión disponible! Presiona aquí para actualizar
    </div>
  )
}

export default UpdateBanner
