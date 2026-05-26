@echo off
setlocal
cd /d "%~dp0\.."

echo.
echo =====================================
echo KazVault Beta - Servidor local
echo =====================================
echo.

if not exist ".env" (
  echo AVISO: .env nao encontrado na raiz.
  echo Copie .env.example para .env e ajuste KAZVAULT_STORAGE_DIR antes de enviar para beta.
  echo.
)

if not exist "apps\mobile\dist\kazvault-debug.apk" (
  echo AVISO: APK ainda nao encontrado em apps\mobile\dist\kazvault-debug.apk.
  echo Rode: corepack pnpm beta:build
  echo O servidor ainda pode iniciar, mas o download do APK vai retornar 404.
  echo.
)

echo Abrindo servidor beta.
echo Tela de pareamento: http://localhost:4577/pair
echo APK Android: http://localhost:4577/app/kazvault.apk
echo.

call corepack pnpm beta:server

endlocal
