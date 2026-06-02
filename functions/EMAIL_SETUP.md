# Configuración de correo (Gmail) para Cloud Functions

El error **535 / BadCredentials** o el toast *"Gmail rechazó la contraseña del servidor"* significa que **Firebase no tiene una contraseña de aplicación válida** (o no tiene ninguna configurada).

Comprobar config actual:

```bash
firebase functions:config:get
```

Si sale `{}` vacío, **hay que configurar Gmail** (pasos abajo).

## Pasos (una sola vez)

1. En la cuenta de Gmail que enviará correos (`eseagmaster@gmail.com` u otra):
   - Activar **verificación en 2 pasos**.
   - Ir a [Contraseñas de aplicaciones](https://myaccount.google.com/apppasswords).
   - Crear una contraseña para **Correo** / **Otro** → copiar los 16 caracteres (sin espacios).

2. En la terminal, en la carpeta del proyecto:

```bash
firebase functions:config:set gmail.user="eseagmaster@gmail.com" gmail.pass="TU_CONTRASEÑA_DE_APLICACION"
firebase deploy --only functions:procesarAlertaVencimiento,functions:agbotMonitorDiario
```

3. Vuelve a pulsar **Notificar** en la app. El toast debe cambiar a **Correo enviado**.

## Emulador local (opcional)

Cree `functions/.env` (no lo suba a git):

```
GMAIL_USER=eseagmaster@gmail.com
GMAIL_PASS=contraseña_de_aplicacion
GMAIL_FROM=eseagmaster@gmail.com
```

## Nota de seguridad

No guarde la contraseña en el código fuente. Si alguna contraseña quedó en el repositorio, **revóquela** en Google y genere una nueva de aplicación.
