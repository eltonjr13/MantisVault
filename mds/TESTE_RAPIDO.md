# Teste Rápido - Correção da Tela Branca

## O que foi corrigido:

1. ✅ **ErrorBoundary** - Captura erros de renderização
2. ✅ **Logs de debug** - Console mostra o que está acontecendo
3. ✅ **Try-catch** - Protege contra erros ao selecionar arquivos
4. ✅ **ID único** - Substituído crypto.randomUUID() por alternativa compatível
5. ✅ **Feedback visual** - Itens concluídos ficam verdes
6. ✅ **Botões de limpeza** - Limpar concluídos e limpar tudo

## Como testar:

### 1. Compile e rode a aplicação:
```bash
cd apps/mobile
pnpm install
pnpm dev
```

### 2. Abra o navegador em: http://localhost:5173

### 3. Abra o Console (F12)

### 4. Siga o fluxo:
- Vá para "Seguranca" → Crie o cofre (se necessário)
- Vá para "Parear" → Pareie com o servidor
- Vá para "Upload" → Selecione um arquivo

### 5. Observe o console:
```
UploadPanel render: { hasPairing: true, hasMasterKey: true, ready: true, queueLength: 0 }
File input onChange triggered
Files selected: 1
Adding items to queue: 1
File input onChange completed
UploadPanel render: { hasPairing: true, hasMasterKey: true, ready: true, queueLength: 1 }
```

## Se ainda der erro:

### Verifique no console:
- Mensagem de erro em vermelho
- Stack trace completo
- Warnings em amarelo

### Teste básico de localStorage:
```javascript
// No console do navegador:
localStorage.clear();
location.reload();
```

### Teste com arquivo pequeno:
- Crie um arquivo de texto simples (< 1KB)
- Tente fazer upload

## Possíveis soluções adicionais:

### Se o erro for "crypto.randomUUID is not defined":
✅ Já corrigido - usando Date.now() + Math.random()

### Se o erro for "Cannot read property of undefined":
✅ Já corrigido - ErrorBoundary mostrará o erro

### Se a tela ficar branca sem erro:
- Verifique se o CSS está carregando
- Inspecione o elemento (F12 → Elements)
- Veja se há elementos no DOM

### Se o upload não iniciar:
- Verifique se `pairing` e `masterKey` estão definidos
- Veja os logs no console
- Clique em "Enviar fila" manualmente

## Contato para debug:

Se o problema persistir, envie:
1. Screenshot da tela branca
2. Console completo (copie todo o texto)
3. Aba "Network" do DevTools (F12)
4. Versão do navegador
