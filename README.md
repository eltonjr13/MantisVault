# KazVault

MVP local para enviar arquivos do celular para um servidor no PC. O app comprime os arquivos antes da criptografia, criptografa manifest e chunks no cliente e o servidor salva somente blobs criptografados em uma pasta configuravel do HDD.

## Stack

- Monorepo PNPM
- App mobile: React, Vite e Capacitor
- Servidor: Node.js, Fastify, TypeScript e SQLite via `sql.js`
- Criptografia client-side: Argon2id para derivar chaves e XChaCha20-Poly1305 via libsodium
- Compressao: seletor automatico com compressao real via `fflate` neste MVP

## Estrutura

```text
kazvault/
  apps/
    mobile/
    server/
  packages/
    shared/
    crypto/
    compression/
```

## Comece aqui em 5 minutos

Fluxo recomendado para entregar uma beta local para alguem testar no PC + Android:

1. Instale as dependencias:

```bash
corepack enable
corepack pnpm install
```

2. Crie o `.env` na raiz do projeto:

```powershell
Copy-Item .env.example .env
```

Edite pelo menos `KAZVAULT_STORAGE_DIR` para uma pasta do PC, por exemplo `D:/KazVault` ou `E:/cloudkz`. As credenciais de Gmail/Outlook podem ficar vazias no beta local.

3. Gere servidor, mobile e APK:

```bash
corepack pnpm beta:build
```

O APK final deve aparecer em `apps/mobile/dist/kazvault-debug.apk`.

4. Inicie o servidor beta:

```bash
corepack pnpm beta:server
```

No Windows, tambem pode abrir `scripts/kazvault-beta-server.bat`.

5. No PC, abra `http://localhost:4577/pair`. A tela mostra a URL/IP do servidor, o QR Code e o link direto `http://localhost:4577/app/kazvault.apk`.
6. No Android, baixe o APK pela tela de pareamento, permita instalar app de fonte desconhecida se o sistema pedir e abra o KazVault.
7. No app, entre em `Parear`, toque em `Escanear QR`, permita a camera e aponte para o QR Code do PC.
8. Na aba `Upload`, selecione um arquivo pequeno de teste e aguarde concluir.
9. Na aba `Cofre`, toque em atualizar se necessario, baixe/restaure o arquivo e confirme que ele abre igual ao original.

## Checklist de beta

- PC: Windows 10/11, Node.js com Corepack, PNPM via Corepack e acesso de rede local liberado no firewall para a porta `4577`.
- Build APK: Android SDK e JDK 17/21 configurados. O script tenta detectar SDK/JDK locais antes de chamar o Gradle.
- Android: aparelho na mesma rede Wi-Fi do PC, Android com WebView/Chrome atualizado, permissao para instalar APK fora da Play Store e permissao de camera para ler QR Code.
- Portas: `4577` para o backend e pareamento; `5173` apenas para desenvolvimento/PWA do mobile.
- Permissoes: servidor precisa gravar em `KAZVAULT_STORAGE_DIR`; Android precisa de internet/rede local, camera para QR e seletor de arquivos/downloads do sistema.
- Arquivos criptografados: ficam em `KAZVAULT_STORAGE_DIR/files/<fileId>/manifest.enc` e `KAZVAULT_STORAGE_DIR/files/<fileId>/chunks/*.chunk.enc`. Padrao: `E:/cloudkz/files`.
- Metadados locais do servidor: ficam em `%USERPROFILE%/.kazvault` por padrao, ou em `KAZVAULT_APP_DATA_DIR` se configurado.
- Logs: backend grava em `KAZVAULT_STORAGE_DIR/logs/kazvault.log`; mantenha tambem o terminal do `beta:server` aberto para copiar erros.
- Confirmacao rapida: `http://localhost:4577/health` responde `ok`, `/pair` mostra QR, `/app/kazvault.apk` baixa o APK, upload fica `Concluido` e o download na aba `Cofre` restaura o arquivo.

## Instalar

```bash
pnpm install
```

Se `pnpm` nao estiver no PATH, use `corepack pnpm install`.

## Rodar servidor local

```bash
pnpm dev:server
```

Por padrao o servidor usa:

- host: `0.0.0.0`
- porta: `4577`
- storage: `E:/cloudkz`
- limite: `1TB`

Configure por variaveis de ambiente usando `.env.example` como referencia. O servidor cria `files`, `logs` e metadados internos dentro da pasta configurada.
Tambem e possivel trocar a pasta pela aba Cofre do app usando um caminho absoluto do PC, por exemplo `E:/cloudkz` ou `D:/KazVault`.
O app mostra o tamanho real do disco, espaco livre e uso do cofre quando o servidor consegue ler essas informacoes do sistema.

## Rodar app mobile em desenvolvimento

```bash
pnpm dev:mobile
```

Abra no navegador ou use o IP do PC no celular. Para Android nativo:

```bash
pnpm build
pnpm android
```

O comando `pnpm android` sincroniza o build web com Capacitor e abre o projeto Android.
O app mobile tambem possui manifest e service worker para instalacao como PWA quando servido em contexto seguro. Depois de instalado, ele abre no celular mesmo com o PC offline e sincroniza a fila quando o servidor voltar.

Para gerar um APK debug baixavel pela tela de pareamento:

```bash
corepack pnpm --filter @kazvault/mobile android:apk
```

O APK e copiado para `apps/mobile/dist/kazvault-debug.apk` e fica disponivel no servidor em `http://localhost:4577/app/kazvault.apk`.

## Fluxo do MVP

1. Inicie o servidor.
2. No PC, abra `http://localhost:4577` ou `http://localhost:4577/pair` para ver a imagem do QR Code.
3. Escaneie o QR Code exibido no PC. O QR abre o KazVault no celular com o pareamento preenchido, sem copiar JSON.
4. Se abrir no navegador, use o botao `Instalar app` para manter o KazVault no celular.
5. O cofre local e criado automaticamente no celular e a chave de recuperacao e exibida.
6. Selecione arquivos.
7. O app salva a fila localmente, comprime, criptografa, divide em chunks e envia quando o servidor estiver disponivel.
8. O servidor grava somente `manifest.enc` e chunks criptografados.
9. Para recuperar, abra a aba Cofre no app, toque em baixar e o app descriptografa, descomprime e salva o arquivo original.

O QR Code da tela `/pair` e temporario, atualiza automaticamente a cada 2 minutos e para de atualizar quando o celular confirma o pareamento.

## Endpoints

- `POST /api/pair/start`
- `POST /api/pair/confirm`
- `GET /api/pair/status`
- `GET /api/pair/qr`
- `GET /pair`
- `GET /pair/qr.png`
- `GET /app/kazvault.apk`
- `POST /api/uploads/init`
- `PATCH /api/uploads/:uploadId/chunk/:index`
- `POST /api/uploads/:uploadId/complete`
- `GET /api/vault/stats`
- `GET /api/vault/optimizers`
- `GET /api/vault/keyring`
- `PUT /api/vault/keyring`
- `GET /api/vault/settings`
- `PUT /api/vault/settings`
- `GET /api/files`
- `GET /api/files/:fileId/manifest`
- `GET /api/files/:fileId/chunks/:index`
- `DELETE /api/files/:fileId`
- `GET /api/connectors`
- `GET /api/connectors/capabilities`
- `POST /api/connectors/:id/sync`
- `GET /api/connectors/:id/items`
- `POST /api/connectors/:id/email-vault/plan`
- `POST /api/connectors/:id/email-vault/archive`
- `POST /api/connectors/:id/email-vault/cleanup`
- `GET /api/storage/pools`
- `POST /api/storage/pools`
- `GET /api/storage/pools/:id/usage`

## Seguranca

- O servidor nunca recebe arquivo original em texto puro.
- O servidor nunca salva nomes reais sem criptografia.
- O manifest com nome, extensao, tamanhos e parametros fica criptografado.
- O MVP nao pede senha no celular; o login fica salvo no armazenamento local do navegador/app.
- Se o usuario limpar cache/dados do site, o login local e removido.
- A chave mestra local e gerada no app e fica envelopada pela chave local do dispositivo e pela chave de recuperacao.
- Se a chave de recuperacao for perdida, os arquivos nao poderao ser restaurados em outro dispositivo.

## KazVault Lossless Engine

O modo padrao e `lossless-safe`: otimiza/comprime antes de criptografar, nunca usa compressao com perda e descarta o resultado se a economia ficar abaixo de `MIN_OPTIMIZATION_GAIN_PERCENT` (padrao: `2`).

Estrategias ativas no app:

- texto/codigo: compressao sem perda com fallback seguro;
- JPEG/PNG/video/arquivos ja comprimidos: original preservado no app para evitar ganho irrelevante ou perda de qualidade;
- arquivos desconhecidos: tenta compressao sem perda e aceita apenas se houver ganho real.
- deduplicacao: chunks sao identificados por hash antes da criptografia; chunks repetidos nao sao gravados novamente no disco.
- hashes: o manifest criptografado registra hash original, hash final, estrategia, motivo da decisao e economia real.

Variaveis:

```bash
MIN_OPTIMIZATION_GAIN_PERCENT=2
CHUNK_SIZE_MB=8
```

Dependencias externas opcionais para o engine local do PC:

```bash
zstd --version
xz --version
brotli --version
cjxl --version
djxl --version
jpegtran -version
oxipng --version
qpdf --version
ffmpeg -version
```

Se alguma ferramenta nao existir, o sistema preserva o original e continua funcionando. O endpoint `GET /api/vault/optimizers` mostra quais binarios foram encontrados.

## Email Vault

O Email Vault ajuda a liberar espaco de caixas de email sem apagar nada antes de validar o backup local.

Fluxo seguro:

1. Simular limpeza com filtros de idade, tamanho e busca do provedor.
2. Revisar candidatos e prioridade sugerida.
3. Arquivar email bruto `.eml` e anexos no KazVault.
4. Validar que o item foi salvo no cofre local.
5. Somente depois mover mensagens arquivadas para a lixeira.

No MVP, o fluxo real esta implementado para Gmail. O Gmail nao permite remover somente anexos mantendo a mensagem original; para liberar espaco, o KazVault arquiva o email completo e depois move a mensagem original para a lixeira mediante confirmacao. Outlook e IMAP continuam conectores preparados, mas a limpeza fina fica para evolucao dos respectivos providers.
