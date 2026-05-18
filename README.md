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
