@echo off
echo Recompilando pacote crypto...
cd packages\crypto
call pnpm build

echo.
echo Crypto recompilado!
echo.
echo Reiniciando servidor mobile...
cd ..\..\apps\mobile
call pnpm dev
