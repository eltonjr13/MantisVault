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

## Fluxo do MVP

1. Inicie o servidor.
2. No PC, abra `http://localhost:4577` ou `http://localhost:4577/pair` para ver a imagem do QR Code.
3. Escaneie o QR Code exibido no PC. O QR abre o KazVault no celular com o pareamento preenchido, sem copiar JSON.
4. O cofre local e criado automaticamente no celular e a chave de recuperacao e exibida.
5. Selecione arquivos.
6. O app comprime, criptografa, divide em chunks e envia para o servidor.
7. O servidor grava somente `manifest.enc` e chunks criptografados.
8. Para recuperar, abra a aba Cofre no app, toque em baixar e o app descriptografa, descomprime e salva o arquivo original.

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
- `GET /api/vault/keyring`
- `PUT /api/vault/keyring`
- `GET /api/vault/settings`
- `PUT /api/vault/settings`
- `GET /api/files`
- `GET /api/files/:fileId/manifest`
- `GET /api/files/:fileId/chunks/:index`
- `DELETE /api/files/:fileId`

## Seguranca

- O servidor nunca recebe arquivo original em texto puro.
- O servidor nunca salva nomes reais sem criptografia.
- O manifest com nome, extensao, tamanhos e parametros fica criptografado.
- O MVP nao pede senha no celular; o login fica salvo no armazenamento local do navegador/app.
- Se o usuario limpar cache/dados do site, o login local e removido.
- A chave mestra local e gerada no app e fica envelopada pela chave local do dispositivo e pela chave de recuperacao.
- Se a chave de recuperacao for perdida, os arquivos nao poderao ser restaurados em outro dispositivo.
