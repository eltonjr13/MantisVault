## Memória Obsidian / Markdown

Estas regras globais valem para qualquer projeto aberto no Codex.

- Sempre que o usuário pedir qualquer tarefa de desenvolvimento, análise, refatoração, correção ou criação de projeto, registrar ao final um resumo em Markdown.
- Destino principal da memória: sempre registrar no vault global do Obsidian:
  - `C:\Users\elton\Documents\Obsidian\CodexMemory\00-inbox\inbox.md`
  - `C:\Users\elton\Documents\Obsidian\CodexMemory\40-registros\changelog-codex.md`
  - `C:\Users\elton\Documents\Obsidian\CodexMemory\20-decisoes\decisoes.md`
  - `C:\Users\elton\Documents\Obsidian\CodexMemory\30-tarefas\tarefas.md`
  - `C:\Users\elton\Documents\Obsidian\CodexMemory\10-projetos\projetos.md`
- Quando estiver dentro de um projeto, a pasta `docs/` do próprio projeto pode ser usada apenas como espelho opcional, quando fizer sentido:
  - `docs/memoria.md`
  - `docs/decisoes.md`
  - `docs/tarefas.md`
  - `docs/changelog-codex.md`
- Sempre registrar:
  - data
  - contexto
  - arquivos impactados, se houver
  - decisão tomada
  - próximos passos
  - pendências
- Nunca salvar senhas, tokens, chaves de API, cookies, dados bancários, credenciais ou qualquer dado sensível.
- Nunca procurar, abrir ou registrar arquivos como `.env`, tokens, cookies, chaves SSH ou credenciais.
- Nunca apagar histórico antigo sem confirmação explícita do usuário.
- Sempre preservar conteúdo existente e adicionar novas entradas com data.
- Sempre usar Markdown limpo e compatível com Obsidian.
- Usar links internos do Obsidian quando fizer sentido, como `[[projetos]]`, `[[decisoes]]` e `[[tarefas]]`.
- Se houver dúvida entre registrar no projeto ou no vault global, preferir o vault global.

### Leitura economica da memoria

- No inicio de tarefas de desenvolvimento, analise, refatoracao, correcao ou criacao, consultar memoria apenas quando isso ajudar a tarefa.
- Para economizar tokens, ler primeiro somente:
  - `C:\Users\elton\Documents\Obsidian\CodexMemory\00-inbox\contexto-ativo.md`;
  - `docs/memoria.md`, apenas se o projeto exigir contexto local especifico;
  - `docs/tarefas.md`, apenas se o projeto exigir contexto local especifico.
- Nao carregar o vault inteiro automaticamente.
- Abrir `decisoes.md`, `changelog-codex.md` ou arquivos historicos apenas quando a tarefa depender desse contexto.
- Ao final de tarefa relevante, atualizar automaticamente a memoria sem o usuario precisar pedir.
- Manter `contexto-ativo.md` curto, com no maximo o necessario para orientar proximas sessoes.
