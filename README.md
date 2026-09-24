# Financia — controle do consultório

App web para cadastro de pacientes, agenda de sessões, registro de pagamentos e
acompanhamento da evolução do faturamento. Feito para uso no **celular**, com
backup em arquivo para levar os dados para o notebook.

## Como usar

**No computador:** abra `index.html` no navegador (duplo clique já funciona).

**No celular (recomendado):** publique a pasta em qualquer hospedagem estática
— GitHub Pages, Netlify, Vercel — abra o endereço no Chrome/Safari e use
"Adicionar à tela de início". O app abre em tela cheia, como um aplicativo, e
funciona sem internet depois de carregado.

Para testar localmente em rede:

```bash
python3 -m http.server 8000     # e acesse http://<ip-do-pc>:8000 pelo celular
```

## Planos de pagamento

Cada paciente tem um plano, definido no cadastro:

| Plano | Como funciona | Cobranças geradas |
|---|---|---|
| **Por sessão (avulso)** | R$ 100 por sessão | uma cobrança por sessão, criada **ao agendar** |
| **Quinzenal** | R$ 200 a cada 15 dias | duas por mês |
| **Mensal** | R$ 400 no mês | uma por mês |
| **Mensal dividido** | R$ 400 em 2x, 3x ou 4x | 2, 3 ou 4 no mês, espaçadas |

No plano, a mensalidade **não depende de quantas sessões aconteceram** no mês —
é mensalidade, não pacote. Por isso a sessão de quem tem plano aparece na agenda
sem valor próprio, com o selo *Plano mensal/quinzenal*.

No avulso é o contrário: o pagamento é devido **no ato de marcar**, então agendar
já cria a cobrança em aberto. Não é preciso esperar a sessão acontecer nem marcar
*Realizada* para o valor aparecer no financeiro.

## Fluxo de trabalho

1. **Pacientes** → botão `+` → cadastra nome, nascimento, telefone e **o plano**.
2. **Agenda** → botão `+` → agenda a sessão. A opção *Repetir* cria as sessões
   semanais ou quinzenais de uma vez. Sendo paciente avulso, cada sessão criada
   já sai com a **cobrança em aberto** — inclusive as da recorrência.
3. Na agenda, cada sessão tem **✓ Realizada** e **📅 Minha agenda**. Para
   paciente avulso aparece também **💰 Registrar pagamento**. Cancelar a sessão
   apaga a cobrança em aberto dela; se já estava paga, a cobrança permanece.
4. **Cobranças** → **⚙️ Gerar cobranças do mês** cria as mensalidades e quinzenas
   de todos os pacientes com plano, e também a cobrança de qualquer sessão avulsa
   do mês que ainda esteja sem uma. Pode apertar quantas vezes quiser: quem já
   tem cobrança no mês não é duplicado. O **Painel avisa** quando o mês corrente
   ainda não foi gerado, com botão para gerar na hora (ou *Agora não*, que
   silencia o aviso só naquele mês).
5. Ainda em **Cobranças**, cada linha tem **💰 Registrar pagamento**. O que passou
   do vencimento aparece marcado como **⚠ Vencida**.
6. **Painel** mostra total recebido, a receber (com o vencido em destaque), o mês
   corrente e os gráficos.
7. **Dados** → **Baixar backup (.json)** sempre que quiser guardar ou transferir.

Sessão extra, reposição ou qualquer valor fora do plano: botão `+` na aba
Cobranças lança uma cobrança avulsa.

## Onde os dados ficam

No `localStorage` do navegador, ou seja, **dentro do aparelho**. Se a
sincronização estiver ligada, uma cópia **cifrada** também fica na Netlify
(ver abaixo). Sem ela, nada sai do celular a não ser que você mesma baixe o arquivo.

Consequências práticas:

- Cada aparelho tem a sua própria cópia; a sincronização é manual, pelo arquivo.
- **Limpar dados de navegação apaga tudo.** Baixe backup com frequência.
- Navegação anônima não guarda nada.

### Sincronização na nuvem (Netlify)

Em *Dados → Sincronização na nuvem*, digite a senha em cada aparelho uma única
vez. A partir daí, celular e notebook ficam iguais sozinhos: o app sincroniza ao
abrir, ao voltar para ele e cerca de 2 segundos depois de cada edição. Sem
internet ele continua funcionando normalmente e sincroniza quando a rede volta.

- Os dados são **cifrados no aparelho** (AES-GCM, com a chave derivada da senha)
  antes de sair. A Netlify guarda só um bloco ilegível.
- **Sem a senha não há recuperação** da cópia da nuvem. Continue baixando o
  backup `.json` de vez em quando.
- *Apagar todos os dados* apaga só o aparelho e o desconecta da nuvem.
  Excluir um paciente, uma sessão ou uma cobrança vale para todos os aparelhos.

**Configuração (uma vez):**

1. `python3 scripts/gerar_senha.py` gera a senha e o `SYNC_AUTH_HASH`. Para
   usar uma senha escolhida por você, rode `python3 scripts/gerar_senha.py "sua senha"`.
2. No painel da Netlify: *Site configuration → Environment variables* →
   `SYNC_AUTH_HASH` = o hash gerado.
3. Publique por **Git** (repositório ligado ao site) ou pela linha de comando
   (`netlify deploy --prod`). Arrastar a pasta para o painel **não** publica a
   função `netlify/functions/sync.mjs`.

Para trocar a senha, gere um novo hash, atualize a variável, publique de novo e
reconecte cada aparelho. O primeiro aparelho a reconectar oferece substituir a
cópia antiga da nuvem, já que ela foi cifrada com a senha anterior.

### Transferir celular ↔ notebook por arquivo

No aparelho de origem: *Dados → Baixar backup (.json)*.
No aparelho de destino: *Dados → Mesclar* (junta os registros; em conflito vence
a versão editada mais recentemente) ou *Substituir tudo* (descarta o que havia lá).

O `.csv` de sessões serve para abrir no Excel/Planilhas — é saída para
contabilidade, não backup: **não** dá para reimportar.

## Agenda pessoal (celular)

Botão **📅 Minha agenda** em cada sessão (na Agenda e no Painel), com duas saídas:

- **Google Agenda** — abre o app/site já preenchido, é só confirmar.
- **Baixar .ics** — formato do calendário do iPhone, Outlook e Samsung. Baixe e
  toque no arquivo. Vai com lembrete de 30 minutos antes.

Em *Dados → Exportar agenda (.ics)* saem de uma vez todas as sessões futuras —
útil depois de criar uma recorrência de 12 semanas.

A duração do evento vem de *Dados → Ajustes → Duração da sessão* (padrão 50 min)
e pode ser ajustada por sessão. Cada evento leva um identificador estável: se
reimportar o mesmo arquivo, o calendário **atualiza** o evento em vez de duplicar.

Sessão sem horário definido vira evento de dia inteiro.

## Sobre dados de paciente (LGPD)

Nome, telefone e data de nascimento são dados pessoais; ficha clínica é dado
sensível e exige cuidado bem maior. O campo *Anotações* foi pensado para
informação administrativa (convênio, horário, pendência) — evite conteúdo
clínico ali. Recomendações: bloqueio de tela no aparelho e backup guardado em
local com senha (o arquivo `.json` é texto puro, legível por qualquer um).

## Estrutura do projeto

```
index.html              markup das quatro telas
manifest.webmanifest    permite "adicionar à tela de início"
css/styles.css          tokens de cor, tema claro/escuro, layout responsivo
js/store.js             persistência (localStorage), export/import, mesclagem
js/format.js            moeda, datas, telefone, idade
js/planos.js            regras dos planos e geração das cobranças (sem DOM)
js/finance.js           totais, séries mensais e vencidos (sem DOM)
js/charts.js            gráficos em canvas, sem dependência externa
js/calendario.js        exportação .ics (RFC 5545) e link do Google Agenda
js/ui.js                modal, toast, confirmação
js/pacientes.js         tela de pacientes
js/sessoes.js           tela de agenda
js/cobrancas.js         tela do financeiro
js/painel.js            tela de painel
js/dados.js             tela de backup/ajustes
js/sync.js              sincronização cifrada com a nuvem (cliente)
netlify/functions/sync.mjs  guarda/devolve o bloco cifrado (Netlify Blobs)
scripts/gerar_senha.py  gera a senha e o SYNC_AUTH_HASH
js/app.js               navegação, tema e inicialização
```

### Decisões técnicas

- **Sessão e cobrança são entidades separadas.** A primeira versão guardava
  `pago` dentro da sessão, o que só descreve o paciente avulso: no plano mensal
  um pagamento cobre várias sessões, e no plano dividido uma mensalidade vira
  duas ou quatro cobranças. Com pagamento preso à sessão, o "total recebido"
  ficaria errado para a maioria dos pacientes. Hoje a sessão cuida da agenda e a
  cobrança cuida do dinheiro; o elo (`cobranca.sessaoId`) existe só no avulso.
  Backups do formato antigo são migrados na importação — cada sessão paga ou
  realizada vira uma cobrança equivalente.
- **No avulso, o fato gerador é o agendamento, não a sessão realizada.** A
  primeira versão só criava a cobrança ao marcar *Realizada*, o que deixava
  invisível todo dinheiro já combinado — e fazia a sessão esquecida sem marcar
  sumir do financeiro. No consultório o paciente paga ao marcar, então a agenda
  é que define o que se tem a receber. A contrapartida é sincronizar nos dois
  sentidos: cancelar derruba a cobrança em aberto (a paga fica, porque o
  dinheiro entrou), e editar valor ou data reajusta a cobrança em aberto. Sem
  essa sincronização, a cobrança antecipada viraria dívida fantasma.
- **Geração idempotente por competência.** A chave é
  paciente + competência + índice da parcela (e, na sessão avulsa, o próprio
  `sessaoId`), então apertar "Gerar cobranças do mês" duas vezes não duplica
  nada. O mesmo botão serve de rede para sessão criada antes desta regra. Sem isso, o botão mais usado da tela seria
  também o mais perigoso. O aviso do painel, a confirmação e a geração leem a
  mesma função (`Planos.pendentes`), de modo que as três nunca discordam sobre
  o que falta.
- **Aviso com saída.** O painel avisa do mês não gerado, mas o *Agora não* grava
  a competência dispensada em `config.avisoIgnorado`. Alerta sem escape vira
  ruído permanente, e ruído é ignorado justamente quando passa a importar.
- **Recebido conta pela data do pagamento; em aberto, pela do vencimento.** É o
  que faz o gráfico de evolução mostrar caixa de verdade, sem misturar o mês em
  que a conta nasceu com o mês em que o dinheiro entrou.

- **Backend mínimo e sem build.** O app funciona inteiro sem servidor. A única
  peça de backend é uma função da Netlify que guarda um bloco cifrado: não
  existe banco de dados de saúde legível na internet, e sem a nuvem o
  export/import por arquivo continua funcionando.
- **`localStorage` com JSON, não SQLite.** SQLite no navegador exigiria sql.js
  (~1 MB de WebAssembly via CDN, o que quebra o uso offline) para um volume de
  algumas centenas de registros por ano. O ponto de troca para IndexedDB seria
  na casa das dezenas de milhares de registros — `js/store.js` é a única camada
  que precisaria mudar.
- **Scripts clássicos, não ES modules.** Módulos ES falham por CORS quando o
  `index.html` é aberto direto do arquivo (`file://`), cenário provável no
  celular. O código continua separado por responsabilidade.
- **Gráficos em canvas próprio.** Zero dependência de CDN: o app abre offline.
- **Calendário por arquivo, não por integração.** Sincronizar via API do Google
  exigiria OAuth, `client_secret` e, portanto, um backend — tudo o que este
  projeto evita. O `.ics` é padrão aberto, funciona em qualquer calendário e não
  pede login nenhum. O preço é a ação manual a cada sessão (ou em lote, no
  export das futuras).
- **Nuvem só com dado cifrado.** Dado de saúde (LGPD) não deveria ficar legível
  num servidor de terceiros. A senha gera, por PBKDF2, um token de acesso (o
  servidor guarda só o SHA-256 dele) e uma chave AES que nunca sai do aparelho.
  O backend continua sendo um só arquivo, sem banco de dados.
- **Exclusões registradas (`excluidos`).** A mesclagem por id, sozinha, traria
  de volta tudo o que foi apagado em outro aparelho. Cada exclusão guarda o id,
  e na mesclagem o id excluído some dos dois lados.
- **Mesclagem por `atualizadoEm`.** Cada registro guarda quando foi editado, e
  na importação o mais recente vence — é o que permite editar no celular e no
  notebook sem perder trabalho.
