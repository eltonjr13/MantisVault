# Correção: Loop Infinito de Re-renderização

## Problema Identificado

O console mostrou que o componente `UploadPanel` estava re-renderizando infinitamente:

```
App.tsx:510 UploadPanel render: {hasPairing: true, hasMasterKey: true, ready: true, queueLength: 1}
App.tsx:510 UploadPanel render: {hasPairing: true, hasMasterKey: true, ready: true, queueLength: 1}
App.tsx:510 UploadPanel render: {hasPairing: true, hasMasterKey: true, ready: true, queueLength: 1}
...
```

Isso travava o navegador e deixava a tela branca.

## Causas do Loop

### 1. **controllers.current sendo passado diretamente**
```typescript
// ANTES (ERRADO):
<UploadPanel controllers={controllers.current} />
```

O `controllers.current` é uma referência que pode mudar, causando re-renders.

### 2. **handlePairing sendo recriado a cada render**
```typescript
// ANTES (ERRADO):
async function handlePairing(payload: PairPayload): Promise<void> {
  // ...
}
```

Funções declaradas dentro do componente são recriadas a cada render.

### 3. **useEffect sem dependências corretas**
```typescript
// ANTES (ERRADO):
useEffect(() => {
  void handlePairing(incomingPairing);
}, []); // handlePairing não está nas dependências!
```

## Correções Aplicadas

### 1. **Estabilizar controllers com useMemo**
```typescript
const controllers = useRef(new Map<string, AbortController>());
const controllersMap = useMemo(() => controllers.current, []);

// Usar controllersMap em vez de controllers.current
<UploadPanel controllers={controllersMap} />
```

### 2. **Memoizar handlePairing com useCallback**
```typescript
const handlePairingCallback = useCallback(async (payload: PairPayload): Promise<void> => {
  updatePairing(payload);
  await confirmPairing(payload).catch(() => undefined);
  // ...
}, [masterKey]); // Dependências corretas
```

### 3. **Atualizar useEffect com dependências corretas**
```typescript
useEffect(() => {
  const incomingPairing = readPairPayloadFromCurrentUrl();
  if (!incomingPairing) return;
  
  clearPairPayloadFromCurrentUrl();
  void handlePairingCallback(incomingPairing);
}, [handlePairingCallback]); // Dependência adicionada
```

### 4. **Remover console.logs que causavam problemas**
```typescript
// Removidos os console.log que estavam dentro do render
// Mantido apenas o console.error para erros reais
```

## Resultado Esperado

Agora o componente deve:
- ✅ Renderizar apenas quando necessário
- ✅ Não entrar em loop infinito
- ✅ Manter a tela responsiva
- ✅ Permitir upload de arquivos normalmente

## Como Testar

1. Recarregue a aplicação (Ctrl+R ou Cmd+R)
2. Abra o console (F12)
3. Vá para a aba "Upload"
4. Selecione um arquivo
5. Verifique que NÃO há múltiplas mensagens de render
6. O arquivo deve aparecer na fila normalmente

## Se o Problema Persistir

Se ainda houver loop infinito, verifique:

1. **React DevTools Profiler**
   - Instale a extensão React DevTools
   - Vá para a aba "Profiler"
   - Clique em "Record"
   - Faça o upload
   - Veja quais componentes estão re-renderizando

2. **Console do navegador**
   - Procure por warnings do React
   - Verifique se há erros de dependências

3. **Limpar cache**
   ```bash
   # No terminal:
   cd apps/mobile
   rm -rf node_modules dist
   pnpm install
   pnpm dev
   ```

## Lições Aprendidas

1. **Sempre use useMemo/useCallback** para valores/funções passados como props
2. **Refs não devem ser passadas diretamente** como props
3. **useEffect precisa de dependências corretas** ou pode causar loops
4. **Console.log pode causar problemas** se usado incorretamente em renders
