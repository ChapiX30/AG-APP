# Configura Gmail para Cloud Functions (proyecto agg1-b7f40)
# Ejecutar en PowerShell desde la carpeta functions:
#   cd functions
#   .\setup-gmail.ps1

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
Set-Location ..

Write-Host ""
Write-Host "=== Configurar correo AG (Firebase Functions) ===" -ForegroundColor Cyan
Write-Host "Necesitas una CONTRASEÑA DE APLICACIÓN de Google (16 caracteres)." -ForegroundColor Yellow
Write-Host "Crearla en: https://myaccount.google.com/apppasswords" -ForegroundColor Yellow
Write-Host ""

$email = Read-Host "Correo Gmail que envía (ej. eseagmaster@gmail.com)"
$pass = Read-Host "Contraseña de aplicación (16 caracteres, con o sin espacios)" -AsSecureString
$plain = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
    [Runtime.InteropServices.Marshal]::SecureStringToBSTR($pass)
)
$plain = ($plain -replace '\s+', '').Trim()

if ($email.Length -lt 5 -or $plain.Length -lt 16) {
    Write-Host "Correo o contraseña inválidos." -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Guardando config en Firebase..." -ForegroundColor Green
firebase experiments:enable legacyRuntimeConfigCommands 2>$null
firebase functions:config:set "gmail.user=$email" "gmail.pass=$plain"

Write-Host ""
Write-Host "Desplegando functions de correo..." -ForegroundColor Green
firebase deploy --only "functions:procesarAlertaVencimiento,functions:agbotMonitorDiario"

Write-Host ""
Write-Host "Listo. Prueba Notificar en la app." -ForegroundColor Green
