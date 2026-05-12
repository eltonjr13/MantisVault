# Debug: Tela Branca no Upload

## Mudanças Implementadas

### 1. ErrorBoundary
- Adicionado componente `ErrorBoundary` para capturar erros de renderização
- Mostra mensagem de erro detalhada com stack trace
- Localização: `apps/mobile/src/components/ErrorBoundary.tsx`

### 2. Tratamento de Erros Global
- Adicionado listeners para erros não capturados
- Logs detalhados no console
- Estado `appError` para mostrar erros na UI

### 3. Logs de Debug
- Console.log no `UploadPanel` para verificar estado
- Try-catch no onChange do input de arquivo
- Alert em caso de erro ao selecionar arquivos

### 4. Correção do ID
- Substituído `crypto.randomUUID()` por `Date.now() + Math.random()`
- Evita problemas de compatibilidade

## Como Testar

### 1. Abra o Console do Navegador
```
F12 ou Ctrl+Shift+I (Windows/Linux)
Cmd+Option+I (Mac)
```

### 2. Vá para a aba "Console"

### 3. Limpe o console (ícone 🚫)

### 4. Tente fazer upload de um arquivo

### 5. Verifique as mensagens no console:
- `UploadPanel render:` - Estado do componente
- `File input onChange triggered` - Input foi acionado
- `Files selected:` - Quantos arquivos foram selecionados
- `Adding items to queue:` - Itens sendo adicionados
- `File input onChange completed` - Processo concluído

### 6. Se houver erro:
- Copie a mensagem de erro completa
- Copie o stack trace (se houver)
- Tire um print da tela de erro

## Possíveis Causas

### 1. Erro de Memória
- Arquivo muito grande
- Navegador sem memória suficiente

### 2. Erro de Permissão
- Navegador bloqueando acesso ao arquivo
- Arquivo em uso por outro programa

### 3. Erro de Estado
- `pairing` ou `masterKey` undefined
- Estado do React corrompido

### 4. Erro de Renderização
- Componente quebrando durante render
- Loop infinito de re-renderização

## Próximos Passos

Se o erro persistir, precisamos:
1. Ver a mensagem de erro no console
2. Verificar o stack trace
3. Testar com arquivo pequeno (< 1MB)
4. Testar em modo anônimo do navegador
5. Limpar cache e localStorage

## Comandos Úteis

### Limpar localStorage (no console do navegador):
```javascript
localStorage.clear();
location.reload();
```

### Verificar estado do pairing:
```javascript
console.log(localStorage.getItem('kazvault:pairing:v1'));
```

### Verificar se há keyring:
```javascript
console.log(localStorage.getItem('kazvault:keyring:v1'));
```
