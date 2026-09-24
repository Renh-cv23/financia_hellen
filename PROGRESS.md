# Progresso

Situação do projeto, o que já foi feito e o que falta. O funcionamento do app e
as decisões técnicas estão no [README](README.md).

## Situação atual (24/09/2026)

| Item | Estado |
|---|---|
| App (pacientes, agenda, cobranças, painel, backup) | ✅ em produção |
| Sincronização cifrada na nuvem | ✅ em produção, testada na Netlify real |
| Produção | https://minha-agenda-psi.netlify.app |
| Repositório | https://github.com/Renh-cv23/financia_hellen (`main`) |
| Deploy | manual pela CLI (`netlify deploy --prod --no-build`); site não ligado ao GitHub |
| `SYNC_AUTH_HASH` | configurada no site `minha-agenda-psi` |
| Aparelhos conectados à nuvem | ⏳ nenhum ainda: a nuvem está vazia |

## Histórico

### 24/09/2026: sincronização na nuvem, git e deploy

- **Sincronização cifrada** (`js/sync.js`, `netlify/functions/sync.mjs`):
  - A senha gera, por PBKDF2, um token de acesso e uma chave AES-GCM.
  - O servidor guarda só o bloco cifrado e o SHA-256 do token.
  - O app sincroniza ao abrir, ao voltar para ele, ao reconectar e ~2 s depois de cada edição.
- **Exclusões registradas** (`excluidos` em `js/store.js`): corrige o problema de
  a mesclagem trazer de volta registros apagados em outro aparelho.
  - *Substituir tudo* marca como excluído o que não está no arquivo.
  - *Apagar todos os dados* só limpa o aparelho e o desconecta da nuvem.
- **Script de senha** `scripts/gerar_senha.py`: gera a senha e o `SYNC_AUTH_HASH`.
- **Testes**: fluxo completo no Firefox headless contra um servidor que imita a função.
  - Senha errada é recusada.
  - O servidor só recebe dado cifrado.
  - Um aparelho vazio recebe os dados; uma edição sobe sozinha.
  - A exclusão se propaga entre aparelhos.
  - Na produção: 401 sem senha, 404 com senha (vazio), 400 para dado não cifrado.
- **Infraestrutura**:
  - Repositório git criado e enviado ao GitHub (conta Renh-cv23, SSH).
  - Node v24 instalado em `~/.local/node` e `netlify-cli` instalada.
  - Pasta ligada ao site com `netlify link`.

### Antes (versão original)

- App completo sem backend: pacientes, planos (avulso, quinzenal, mensal,
  mensal dividido), agenda com recorrência, cobranças com geração idempotente
  por mês, painel com gráficos, exportação `.json`, `.csv` e `.ics`, tema claro/escuro.

## Próximos passos

- [ ] Conectar primeiro o aparelho que já tem os dados (*Dados → Sincronização
      na nuvem*), depois os outros. Baixar um backup `.json` antes.
- [ ] Opcional: ligar o repositório no painel da Netlify para cada `git push`
      publicar sozinho.

## Pendências conhecidas

Encontradas na análise do código e ainda não corrigidas:

- [ ] **Excluir paciente apaga as cobranças já pagas** (`Store.excluirPaciente`):
      o dinheiro recebido some do histórico e dos gráficos. Alternativa: só
      permitir inativar, ou manter as cobranças pagas.
- [ ] **Trocar o plano de avulso para mensal/quinzenal** deixa as cobranças em
      aberto das sessões futuras, o que pode cobrar em dobro.
- [ ] **Parcelas com vencimento no fim do mês se amontoam** (`Planos.previstas`):
      com dia 28 e 4 parcelas, as parcelas 2 a 4 caem todas no último dia do mês.
      O quinzenal com dia maior que 15 tem o mesmo efeito.
- [ ] **Comentário desatualizado** no topo de `js/planos.js`: diz que a cobrança
      do avulso nasce na sessão realizada; hoje nasce no agendamento.
- [ ] **Sem testes automatizados** para `js/planos.js` e `js/finance.js`, que
      não dependem de DOM e são fáceis de testar.
- [ ] **Edição simultânea**: se dois aparelhos salvarem no mesmo instante, uma
      edição pode se perder. Pouco provável com uma usuária só; a correção
      seria gravar com ETag condicional no Blobs.
