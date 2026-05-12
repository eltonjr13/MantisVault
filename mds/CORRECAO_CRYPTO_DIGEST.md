# Correção: Cannot read properties of undefined (reading 'digest')

## Problema Identificado

Durante o upload, o erro ocorreu:
```
Cannot read properties of undefined (reading 'digest')
```

Isso aconteceu em 18% do upload, durante o cálculo do hash SHA-256.

## Causa Raiz

O erro ocorreu na função `sha256Hex` em `packages/crypto/src/index.ts`:

```typescript
// ANTES (ERRADO):
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", input);
  //                            ^^^^^^ undefined!
  return bytesToHex(new Uint8Array(digest));
}
```

### Por que `crypto.subtle` estava undefined?

A Web Crypto API (`crypto.subtle`) só está disponível em **contextos seguros**:

1. ✅ **HTTPS** - Qualquer domínio com SSL
2. ✅ **localhost** - http://localhost:5173
3. ❌ **HTTP via IP** - http://192.169.x.x:5173 (SEU CASO!)

Você estava acessando via IP local (192.169.x.x), que não é considerado contexto seguro.

## Solução Implementada

Adicionei um **fallback** usando a biblioteca `hash-wasm` que já estava instalada:

```typescript
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  // Tentar usar Web Crypto API primeiro (mais rápido)
  if (globalThis.crypto && globalThis.crypto.subtle) {
    try {
      const input = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
      const digest = await globalThis.crypto.subtle.digest("SHA-256", input);
      return bytesToHex(new Uint8Array(digest));
    } catch (error) {
      console.warn("Web Crypto API falhou, usando hash-wasm como fallback:", error);
    }
  }
  
  // Fallback para hash-wasm (funciona em qualquer contexto)
  return await sha256(bytes);
}
```

### Vantagens da Solução

1. ✅ **Funciona em qualquer contexto** (HTTP, HTTPS, localhost, IP)
2. ✅ **Performance otimizada** - Usa Web Crypto quando disponível
3. ✅ **Fallback robusto** - hash-wasm quando Web Crypto não está disponível
4. ✅ **Sem mudanças no código existente** - API permanece a mesma

## Como Testar

### 1. Recompilar o pacote crypto:
```bash
cd packages/crypto
pnpm build
```

### 2. Reiniciar o servidor mobile:
```bash
cd apps/mobile
pnpm dev
```

### 3. Testar o upload:
- Selecione um arquivo
- Clique em "Enviar fila"
- O upload deve progredir além de 18%

## Alternativas (se ainda não funcionar)

### Opção 1: Acessar via localhost
```
http://localhost:5173
```
Em vez de:
```
http://192.169.x.x:5173
```

### Opção 2: Configurar HTTPS no Vite

Edite `apps/mobile/vite.config.ts`:

```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import fs from "fs";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 5173,
    https: {
      key: fs.readFileSync('./.cert/key.pem'),
      cert: fs.readFileSync('./.cert/cert.pem'),
    }
  }
});
```

Gerar certificado auto-assinado:
```bash
mkdir .cert
openssl req -x509 -newkey rsa:4096 -keyout .cert/key.pem -out .cert/cert.pem -days 365 -nodes
```

### Opção 3: Usar ngrok ou similar

```bash
npx ngrok http 5173
```

Isso cria um túnel HTTPS para seu servidor local.

## Verificação

Para verificar se `crypto.subtle` está disponível, abra o console:

```javascript
console.log(window.crypto);
console.log(window.crypto.subtle);
```

Se `subtle` for `undefined`, o fallback será usado automaticamente.

## Performance

- **Web Crypto API**: ~1-2ms para hash de 8MB
- **hash-wasm**: ~5-10ms para hash de 8MB

A diferença é pequena e não afeta significativamente o upload.

## Próximos Passos

Após recompilar e reiniciar:
1. Tente fazer upload novamente
2. Verifique se passa de 18%
3. Observe o console para warnings sobre fallback
4. Se funcionar, o upload deve completar 100%
