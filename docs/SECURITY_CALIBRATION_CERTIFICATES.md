# Seguridad — certificados de calibración (patrones)

## Resumen

Los certificados de patrones se guardan en Firebase Storage bajo `calibraciones/{patronId}/{uuid}.{ext}` (nuevas cargas).  
Rutas legacy `certificados/{patronId}/…` siguen soportadas hasta migración.  
Firestore guarda `certificadoStoragePath` (no URLs públicas de larga duración). La visualización usa la Cloud Function `getPatronCertificadoUrl`, que devuelve una URL firmada (~15 minutos).

## Despliegue en Firebase Console / CLI

```bash
firebase deploy --only firestore:rules,storage:rules,functions:getPatronCertificadoUrl
```

Tras el primer despliegue de reglas estrictas, verifique que los documentos `usuarios/{uid}` existan para cada cuenta (el `uid` de Auth debe coincidir con el ID del documento).

## Roles con acceso

- **Ver:** calidad, metrólogo, técnico, logística, admin/gerente (y correos en lista interna de la app).
- **Subir:** calidad, metrólogo, técnico, admin/gerente.
- **Auditoría de vistas:** colección `certificadoAccesos` (lectura calidad/admin).

## Legacy

Registros con solo `certificadoUrl` siguen funcionando hasta migrar: la función extrae la ruta del objeto desde la URL y emite URL firmada. Al subir un certificado nuevo se guarda `certificadoStoragePath` y se elimina `certificadoUrl`.

## Recomendaciones adicionales

- Habilitar **Firebase App Check** en web/Android.
- Revisar reglas de Storage para `worksheets/` si se requiere el mismo nivel de rol.
- Rotar credenciales expuestas en el cliente solo vía variables de entorno de build (la config de Firebase en cliente es pública por diseño).
- Considerar 2FA en cuentas de calidad y backups cifrados de Storage.
