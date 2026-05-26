# Beta teste KazVault

Guia curto para preparar uma beta instalavel e mandar para alguem testar sem conhecer o monorepo.

## Passo a passo

1. Instale dependencias na raiz:

```bash
corepack enable
corepack pnpm install
```

2. Crie e ajuste o `.env`:

```powershell
Copy-Item .env.example .env
```

Configure `KAZVAULT_STORAGE_DIR` para uma pasta gravavel do PC. Para beta local, deixe Gmail/Outlook vazios.

3. Gere build e APK:

```bash
corepack pnpm beta:build
```

Resultado esperado: `apps/mobile/dist/kazvault-debug.apk`.

4. Inicie o servidor:

```bash
corepack pnpm beta:server
```

Alternativa Windows: `scripts/kazvault-beta-server.bat`.

5. Abra no PC:

```text
http://localhost:4577/pair
```

6. No Android:

- baixe `http://localhost:4577/app/kazvault.apk`;
- instale o APK;
- abra o KazVault;
- toque em `Parear` > `Escanear QR`;
- permita a camera e leia o QR do PC.

7. Teste o cofre:

- envie um arquivo pequeno pela aba `Upload`;
- espere o status `Concluido`;
- abra `Cofre`;
- toque em baixar/restaurar;
- confira se o arquivo restaurado abre corretamente.

## Solucao de problemas

- APK retorna 404: rode `corepack pnpm beta:build` e confirme `apps/mobile/dist/kazvault-debug.apk`.
- Celular nao conecta: PC e Android precisam estar na mesma rede. Libere a porta `4577` no firewall do Windows.
- QR expira: clique em `Gerar novo QR` na tela do PC e escaneie de novo.
- Camera nao abre: permita camera para o KazVault nas configuracoes do Android e tente novamente.
- Upload fica pausado: confirme que `corepack pnpm beta:server` continua rodando e abra `http://localhost:4577/health`.
- Nao consegue restaurar: confirme que a chave de recuperacao foi guardada e que o cofre esta desbloqueado na aba `Seguranca`.
- Gmail/Outlook pedem configuracao: ignore essas fontes no beta local; elas nao sao obrigatorias para upload/download local.

## Logs para pedir ao testador

- Terminal onde `corepack pnpm beta:server` esta rodando.
- Arquivo `KAZVAULT_STORAGE_DIR/logs/kazvault.log`.
- Print da tela `/pair` no PC.
- No Android, print do erro e, se houver ADB, `adb logcat | findstr KazVault`.

## Checklist antes de enviar

- `.env` existe e `KAZVAULT_STORAGE_DIR` aponta para uma pasta gravavel.
- `corepack pnpm typecheck` passa.
- `corepack pnpm --filter @kazvault/server test` passa.
- `corepack pnpm beta:build` gera `apps/mobile/dist/kazvault-debug.apk`.
- `corepack pnpm beta:server` mostra a tela em `http://localhost:4577/pair`.
- `http://localhost:4577/app/kazvault.apk` baixa o APK.
- Teste local de upload e restauracao foi feito com arquivo pequeno.
