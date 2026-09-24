/* =========================================================================
   painel.js — visão geral: números-chave, evolução e próximas sessões.
   ========================================================================= */
var Painel = (function () {
  var MESES_SERIE = 12;

  function tile(classe, rotulo, valor, rodape) {
    return '<div class="stat ' + classe + '">' +
      '<div class="stat__label">' + rotulo + '</div>' +
      '<div class="stat__value">' + valor + '</div>' +
      '<div class="stat__foot">' + rodape + '</div>' +
    '</div>';
  }

  function tabelaMensal(serie) {
    return '<table><caption class="sr-only">Valores por mês</caption>' +
      '<thead><tr><th>Mês</th><th>Recebido</th><th>A receber</th><th>Sessões</th></tr></thead><tbody>' +
      serie.map(function (m) {
        return '<tr><td>' + Fmt.mesRotulo(m.mes) + '</td><td>' + Fmt.moeda(m.recebido) +
          '</td><td>' + Fmt.moeda(m.aReceber) + '</td><td>' + m.sessoes + '</td></tr>';
      }).join('') + '</tbody></table>';
  }

  function tabelaAcumulada(serie) {
    return '<table><thead><tr><th>Mês</th><th>Acumulado</th></tr></thead><tbody>' +
      serie.map(function (m) {
        return '<tr><td>' + Fmt.mesRotulo(m.mes) + '</td><td>' + Fmt.moeda(m.valor) + '</td></tr>';
      }).join('') + '</tbody></table>';
  }

  /* Aviso de mês não gerado. Só aparece quando há de fato o que gerar, some
     sozinho depois da geração e pode ser adiado — um alerta sem saída vira
     ruído, e ruído recorrente é ignorado justamente quando importa. */
  function renderAviso() {
    var el = document.getElementById('aviso-painel');
    var competencia = Fmt.mesAtual();
    var pend = Planos.pendentes(competencia);

    if (!pend.qtd || Store.config().avisoIgnorado === competencia) {
      el.hidden = true;
      el.innerHTML = '';
      return;
    }

    el.hidden = false;
    el.innerHTML =
      '<div class="aviso">' +
        '<div class="aviso__topo">' +
          '<span class="aviso__ico" aria-hidden="true">⚠️</span>' +
          '<div>' +
            '<strong class="aviso__titulo">Cobranças de ' + Fmt.mesExtenso(competencia) + ' ainda não geradas</strong>' +
            '<p class="aviso__texto">' +
              Fmt.plural(pend.qtd, 'cobrança', 'cobranças') + ' de ' +
              Fmt.plural(pend.pacientes, 'paciente', 'pacientes') + ', somando ' +
              Fmt.moeda(pend.total) + '.' +
            '</p>' +
          '</div>' +
        '</div>' +
        '<div class="btn-row">' +
          '<button class="btn" type="button" id="aviso-gerar">⚙️ Gerar agora</button>' +
          '<button class="ghost-btn" type="button" id="aviso-ver">Ver cobranças</button>' +
          '<button class="ghost-btn" type="button" id="aviso-adiar">Agora não</button>' +
        '</div>' +
      '</div>';
  }

  function render() {
    renderAviso();
    var sessoes = Store.sessoes();
    var cobrancas = Store.cobrancas();
    var total = Finance.totais(cobrancas);
    var mesAtual = Fmt.mesAtual();
    var doMes = Finance.doMes(sessoes, mesAtual);
    var totalMes = Finance.totais(Finance.cobrancasDoMes(cobrancas, mesAtual));
    var realizadasMes = doMes.filter(function (s) { return s.status === 'realizada'; }).length;
    var ativos = Store.pacientes().filter(function (p) { return p.ativo; }).length;
    // Quanto os planos ativos representam por mês, independente das sessões.
    var previsto = Store.pacientes().reduce(function (soma, p) {
      return soma + (p.ativo ? Planos.previstoMensal(p) : 0);
    }, 0);

    var serie = Finance.porMes(cobrancas, sessoes, MESES_SERIE);
    var acum = Finance.acumulado(serie);
    var mesAnterior = serie[serie.length - 2];
    var esteMes = serie[serie.length - 1];
    var variacao = mesAnterior && mesAnterior.recebido > 0
      ? Math.round(((esteMes.recebido - mesAnterior.recebido) / mesAnterior.recebido) * 100)
      : null;

    document.getElementById('stats').innerHTML =
      tile('stat--recebido', '💰 Total recebido', Fmt.moeda(total.recebido),
        Fmt.plural(total.qtdPagas, 'cobrança paga', 'cobranças pagas')) +
      tile('stat--pendente', '⏳ A receber', Fmt.moeda(total.aReceber),
        total.vencido > 0 ? '⚠ ' + Fmt.moeda(total.vencido) + ' já vencido' : Fmt.plural(total.qtdAbertas, 'cobrança em aberto', 'cobranças em aberto')) +
      tile('', '📅 ' + Fmt.mesExtenso(mesAtual), Fmt.moeda(totalMes.recebido),
        realizadasMes + ' sessões realizadas' + (variacao != null ? ' · ' + (variacao >= 0 ? '+' : '') + variacao + '%' : '')) +
      tile('', '👥 Pacientes ativos', String(ativos),
        previsto > 0 ? Fmt.moeda(previsto) + '/mês em planos' : Store.pacientes().length + ' cadastrados');

    Charts.barras('chart-mensal', serie);
    Charts.linha('chart-acumulado', acum);
    document.getElementById('chart-mensal-table').innerHTML = tabelaMensal(serie);
    document.getElementById('chart-acumulado-table').innerHTML = tabelaAcumulada(acum);

    var proximas = Finance.proximas(sessoes, 5);
    document.getElementById('proximas').innerHTML = proximas.length
      ? '<div class="list">' + proximas.map(function (s) {
          var p = Store.paciente(s.pacienteId);
          return '<article class="item">' +
            '<div class="item__top">' +
              '<div>' +
                '<div class="item__name">' + Fmt.escapar(p ? p.nome : 'Paciente removido') + '</div>' +
                '<div class="item__meta">' + Fmt.data(s.data) + ' · ' + Fmt.diaSemana(s.data) + (s.hora ? ' · ' + s.hora : '') + '</div>' +
              '</div>' +
              '<div class="item__value">' + Fmt.moeda(s.valor) + '</div>' +
            '</div>' +
            '<div class="item__actions">' +
              '<button class="ghost-btn" data-calendario="' + s.id + '">📅 Minha agenda</button>' +
            '</div>' +
          '</article>';
        }).join('') + '</div>'
      : UI.vazio('Nenhuma sessão futura', 'Agende pelo botão + na aba Agenda.');
  }

  /* Delegação: as listas do painel são redesenhadas a cada mudança no Store. */
  function iniciar() {
    document.getElementById('proximas').addEventListener('click', function (e) {
      var alvo = e.target.closest('[data-calendario]');
      if (alvo) Calendario.adicionar(alvo.dataset.calendario);
    });

    document.getElementById('aviso-painel').addEventListener('click', function (e) {
      var competencia = Fmt.mesAtual();
      if (e.target.id === 'aviso-gerar') {
        var n = Planos.gerar(competencia);
        UI.toast(Fmt.plural(n, 'cobrança criada', 'cobranças criadas') + ' para ' + Fmt.mesExtenso(competencia) + '.');
      } else if (e.target.id === 'aviso-ver') {
        App.mostrar('cobrancas');
        Cobrancas.irParaMes(competencia);
      } else if (e.target.id === 'aviso-adiar') {
        Store.config({ avisoIgnorado: competencia });   // silencia só este mês
        UI.toast('Aviso adiado. Você ainda pode gerar na aba Cobranças.');
      }
    });
  }

  return { iniciar: iniciar, render: render };
})();
