/* =========================================================================
   sessoes.js — agenda: lista filtrada e cadastro de sessões (inclusive
   recorrência semanal, que é o padrão real de um consultório).

   Dinheiro não mora aqui. Paciente de plano tem a sessão coberta pela
   mensalidade; paciente avulso ganha uma cobrança vinculada já no agendamento,
   porque no consultório o pagamento é devido no ato de marcar (ver planos.js).
   O botão de pagamento nesta tela é um atalho para essa cobrança — a verdade
   financeira está na aba Cobranças.
   ========================================================================= */
var Sessoes = (function () {
  var lista, resumo, fMes, fPaciente, fStatus;

  var ROTULO = {
    agendada: 'Agendada', realizada: 'Realizada', falta: 'Falta', cancelada: 'Cancelada'
  };

  function iniciar() {
    lista = document.getElementById('lista-sessoes');
    resumo = document.getElementById('resumo-mes');
    fMes = document.getElementById('f-mes');
    fPaciente = document.getElementById('f-paciente');
    fStatus = document.getElementById('f-status');

    fMes.value = Fmt.mesAtual();
    [fMes, fPaciente, fStatus].forEach(function (el) { el.addEventListener('change', render); });
    document.getElementById('f-limpar').addEventListener('click', function () {
      fMes.value = ''; fPaciente.value = ''; fStatus.value = '';
      render();
    });

    lista.addEventListener('click', function (e) {
      var alvo = e.target.closest('[data-acao]');
      if (!alvo) return;
      var id = alvo.dataset.id;
      if (alvo.dataset.acao === 'pagar') {
        var cob = Planos.cobrancaDaSessao(id, true);
        if (!cob) { UI.toast('Sessão coberta pelo plano — o pagamento é a mensalidade.'); return; }
        var atualizada = Store.alternarPagamento(cob.id);
        UI.toast(atualizada && atualizada.pago ? 'Pagamento registrado.' : 'Pagamento desfeito.');
      }
      else if (alvo.dataset.acao === 'realizada') {
        Store.salvarSessao({ id: id, status: 'realizada' });
        // A cobrança normalmente já nasceu no agendamento; isto cobre a sessão
        // antiga, criada antes da regra, e mantém um caminho só.
        var gerada = Planos.sincronizarCobrancaDaSessao(id);
        UI.toast(gerada && !gerada.pago
          ? 'Realizada. Cobrança de ' + Fmt.moeda(gerada.valor) + ' em aberto.'
          : 'Sessão marcada como realizada.');
      }
      else if (alvo.dataset.acao === 'calendario') Calendario.adicionar(id);
      else if (alvo.dataset.acao === 'editar') formulario(id);
    });
  }

  function popularPacientes() {
    var atual = fPaciente.value;
    var ativos = Store.pacientes().slice().sort(function (a, b) { return a.nome.localeCompare(b.nome, 'pt-BR'); });
    fPaciente.innerHTML = '<option value="">Todos os pacientes</option>' +
      ativos.map(function (p) { return '<option value="' + p.id + '">' + Fmt.escapar(p.nome) + '</option>'; }).join('');
    fPaciente.value = atual;
  }

  function filtrar() {
    var mes = fMes.value, pid = fPaciente.value, st = fStatus.value;
    return Store.sessoes().filter(function (s) {
      if (mes && (s.data || '').slice(0, 7) !== mes) return false;
      if (pid && s.pacienteId !== pid) return false;
      if (st === 'pendente') {
        var c = Store.cobrancaDaSessao(s.id);
        return s.status === 'realizada' && Planos.ehAvulso(s.pacienteId) && (!c || !c.pago);
      }
      if (st && s.status !== st) return false;
      return true;
    });
  }

  function cartao(s) {
    var p = Store.paciente(s.pacienteId);
    var nome = p ? p.nome : 'Paciente removido';
    var classe = s.status === 'cancelada' ? ' item--cancelada' : (s.status === 'falta' ? ' item--falta' : '');
    var avulso = Planos.ehAvulso(s.pacienteId);
    var cob = Store.cobrancaDaSessao(s.id);

    // No plano, a sessão não tem preço próprio: o selo explica de onde vem o dinheiro.
    var badgePago = !avulso
      ? '<span class="badge badge--plano">' + Fmt.escapar(Planos.plano(p).tipo === 'mensal' ? 'Plano mensal' : 'Plano quinzenal') + '</span>'
      : (cob && cob.pago
        ? '<span class="badge badge--pago">✓ Pago</span>'
        : (cob ? '<span class="badge badge--' + (Finance.vencida(cob) ? 'vencida">⚠ A receber' : 'pendente">A receber') + '</span>' : ''));
    var valorExibido = avulso ? Fmt.moeda(s.valor || Planos.plano(p).valor) : '—';

    return '' +
      '<article class="item' + classe + '">' +
        '<div class="item__top">' +
          '<div>' +
            '<div class="item__name">' + Fmt.escapar(nome) + '</div>' +
            '<div class="item__meta">' + (s.hora ? s.hora + ' · ' + (s.duracao || Store.config().duracaoPadrao) + ' min' : 'sem horário definido') + '</div>' +
          '</div>' +
          '<div class="item__value">' + valorExibido + '</div>' +
        '</div>' +
        '<div class="chips">' +
          '<span class="badge badge--' + s.status + '">' + ROTULO[s.status] + '</span>' +
          badgePago +
          (cob && cob.pago && cob.dataPagamento ? '<span class="badge">' + Fmt.dataCurta(cob.dataPagamento) + (cob.metodo ? ' · ' + Fmt.escapar(cob.metodo) : '') + '</span>' : '') +
        '</div>' +
        (s.notas ? '<div class="item__meta">' + Fmt.escapar(s.notas) + '</div>' : '') +
        '<div class="item__actions">' +
          (s.status === 'agendada' ? '<button class="ghost-btn" data-acao="realizada" data-id="' + s.id + '">✓ Realizada</button>' : '') +
          (avulso && s.status !== 'cancelada' ? '<button class="ghost-btn" data-acao="pagar" data-id="' + s.id + '">' + (cob && cob.pago ? '↩ Desfazer pagamento' : '💰 Registrar pagamento') + '</button>' : '') +
          (s.status !== 'cancelada' ? '<button class="ghost-btn" data-acao="calendario" data-id="' + s.id + '">📅 Minha agenda</button>' : '') +
          '<button class="ghost-btn" data-acao="editar" data-id="' + s.id + '">Editar</button>' +
        '</div>' +
      '</article>';
  }

  function render() {
    if (!lista) return;
    popularPacientes();

    var itens = Finance.ordenar(filtrar(), false);
    var realizadas = itens.filter(function (s) { return s.status === 'realizada'; }).length;
    // O financeiro do mês sai das cobranças, não da soma das sessões.
    var cobrancasMes = fMes.value
      ? Finance.cobrancasDoMes(Store.cobrancas(), fMes.value)
      : Store.cobrancas();
    if (fPaciente.value) cobrancasMes = Finance.doPaciente(cobrancasMes, fPaciente.value);
    var t = Finance.totais(cobrancasMes);

    resumo.innerHTML =
      '<span>' + (fMes.value ? Fmt.mesExtenso(fMes.value) : 'Todo o período') + '</span>' +
      '<span>' + Fmt.plural(itens.length, 'sessão', 'sessões') + '</span>' +
      '<span>' + realizadas + ' realizadas</span>' +
      '<span>Recebido ' + Fmt.moeda(t.recebido) + '</span>' +
      (t.aReceber > 0 ? '<span>Em aberto ' + Fmt.moeda(t.aReceber) + '</span>' : '');

    if (!itens.length) {
      lista.innerHTML = UI.vazio('Nenhuma sessão no filtro', 'Toque em + para agendar ou limpe os filtros.');
      return;
    }

    // Agrupamento por dia: a leitura da agenda é por data, não por registro solto.
    var html = '', diaAtual = null;
    itens.forEach(function (s) {
      if (s.data !== diaAtual) {
        diaAtual = s.data;
        html += '<div class="day-head">' + Fmt.data(s.data) + ' · ' + Fmt.diaSemana(s.data) + '</div>';
      }
      html += cartao(s);
    });
    lista.innerHTML = '<div class="list">' + html + '</div>';
  }

  /* ------------------------------ Formulário ------------------------- */
  function formulario(id, pacienteIdSugerido) {
    var s = id ? Store.sessao(id) : null;
    var pacientes = Store.pacientes().slice().sort(function (a, b) { return a.nome.localeCompare(b.nome, 'pt-BR'); });

    if (!pacientes.length) {
      UI.confirmar('Cadastre um paciente primeiro',
        'Para agendar uma sessão é preciso ter ao menos um paciente cadastrado.',
        'Cadastrar paciente', function () { Pacientes.formulario(); });
      return;
    }

    var pidAtual = s ? s.pacienteId : (pacienteIdSugerido || pacientes[0].id);
    var e = Fmt.escapar;

    var html = '' +
      '<form class="form-grid" id="form-sessao">' +
        '<label class="field"><span>Paciente *</span><select name="pacienteId" required>' +
          pacientes.map(function (p) {
            var pl = Planos.plano(p);
            return '<option value="' + p.id + '"' + (p.id === pidAtual ? ' selected' : '') +
              ' data-valor="' + pl.valor + '" data-avulso="' + (pl.tipo === 'avulso' ? '1' : '') + '">' +
              e(p.nome) + (p.ativo ? '' : ' (inativo)') + '</option>';
          }).join('') +
        '</select></label>' +
        '<div class="form-2">' +
          '<label class="field"><span>Data *</span><input type="date" name="data" required value="' + (s ? s.data : Fmt.hoje()) + '"></label>' +
          '<label class="field"><span>Horário</span><input type="time" name="hora" value="' + (s ? s.hora : '') + '"></label>' +
        '</div>' +
        '<label class="field"><span>Duração (minutos)</span>' +
          '<input type="number" name="duracao" min="10" step="5" inputmode="numeric" value="' +
          (s && s.duracao ? s.duracao : Store.config().duracaoPadrao) + '"></label>' +
        '<div class="form-2">' +
          '<label class="field" id="campo-valor"><span>Valor da sessão (R$)</span>' +
            '<input type="number" name="valor" min="0" step="10" inputmode="decimal" value="' + (s ? s.valor : '') + '"></label>' +
          '<label class="field"><span>Situação</span><select name="status">' +
            Object.keys(ROTULO).map(function (k) {
              return '<option value="' + k + '"' + (s && s.status === k ? ' selected' : '') + '>' + ROTULO[k] + '</option>';
            }).join('') +
          '</select></label>' +
        '</div>' +
        '<p class="hint" id="aviso-plano" hidden></p>' +
        (!s ?
          '<div class="form-2">' +
            '<label class="field"><span>Repetir</span><select name="repetir">' +
              '<option value="1">Só esta data</option>' +
              '<option value="4">Semanal — 4 semanas</option>' +
              '<option value="8">Semanal — 8 semanas</option>' +
              '<option value="12">Semanal — 12 semanas</option>' +
              '<option value="24">Semanal — 24 semanas</option>' +
            '</select></label>' +
            '<label class="field" id="campo-intervalo" hidden><span>Intervalo</span><select name="intervalo">' +
              '<option value="7">Toda semana</option>' +
              '<option value="14">A cada 15 dias</option>' +
            '</select></label>' +
          '</div>' : '') +
        '<label class="field"><span>Anotações</span><textarea name="notas" placeholder="Observações administrativas (evite dados clínicos sensíveis).">' + e(s ? s.notas : '') + '</textarea></label>' +
        '<div class="btn-row">' +
          '<button class="btn" type="submit">Salvar</button>' +
          (s ? '<button class="btn btn--danger" type="button" id="excluir-sessao">Excluir</button>' : '') +
        '</div>' +
      '</form>';

    UI.modal(s ? 'Editar sessão' : 'Nova sessão', html, function (c) {
      var form = c.querySelector('#form-sessao');
      var campoValor = c.querySelector('#campo-valor');
      var avisoPlano = c.querySelector('#aviso-plano');

      function opcao() { return form.pacienteId.selectedOptions[0]; }
      function ehAvulso() { return !!(opcao() && opcao().dataset.avulso); }
      function valorDoPaciente() {
        return opcao() ? Number(opcao().dataset.valor) : Store.config().valorSessaoPadrao;
      }

      /* Valor por sessão só existe no avulso. Para plano, esconder o campo evita
         o erro mais provável: lançar R$ 400 numa sessão e contar a mensalidade 4x. */
      function ajustarPorPlano() {
        var avulso = ehAvulso();
        campoValor.hidden = !avulso;
        avisoPlano.hidden = avulso;
        if (!avulso) {
          var p = Store.paciente(form.pacienteId.value);
          avisoPlano.innerHTML = '💳 ' + Fmt.escapar(Planos.descricao(p)) +
            ' — esta sessão não gera cobrança própria. As mensalidades ficam na aba <strong>Cobranças</strong>.';
        } else if (!form.valor.dataset.tocado) {
          form.valor.value = valorDoPaciente();
        }
      }
      if (!s) form.valor.value = valorDoPaciente();
      ajustarPorPlano();

      form.pacienteId.addEventListener('change', ajustarPorPlano);
      form.valor.addEventListener('input', function () { this.dataset.tocado = '1'; });

      var campoIntervalo = c.querySelector('#campo-intervalo');
      if (form.repetir) {
        form.repetir.addEventListener('change', function () {
          campoIntervalo.hidden = Number(this.value) <= 1;
        });
      }

      form.addEventListener('submit', function (ev) {
        ev.preventDefault();
        var base = {
          pacienteId: form.pacienteId.value,
          data: form.data.value,
          hora: form.hora.value,
          valor: ehAvulso() ? (Number(form.valor.value) || valorDoPaciente()) : 0,
          duracao: Number(form.duracao.value) || Store.config().duracaoPadrao,
          status: form.status.value,
          notas: form.notas.value.trim()
        };
        if (!base.data) return;

        if (s) {
          base.id = s.id;
          Store.salvarSessao(base);
          var sinc = Planos.sincronizarCobrancaDaSessao(s.id);
          UI.toast(base.status === 'cancelada' && !sinc
            ? 'Sessão cancelada. Cobrança em aberto removida.'
            : 'Sessão atualizada.');
        } else {
          var repeticoes = Number(form.repetir.value) || 1;
          var intervalo = Number(form.intervalo.value) || 7;
          var novas = [];
          for (var i = 0; i < repeticoes; i++) {
            var d = Fmt.paraData(base.data);
            d.setDate(d.getDate() + i * intervalo);
            // Só a primeira herda a situação informada; as futuras nascem agendadas.
            novas.push(Object.assign({}, base, {
              data: Fmt.paraISO(d),
              status: i === 0 ? base.status : 'agendada'
            }));
          }
          var criadas = Store.salvarVarias(novas);
          // Agendar já é o fato gerador do pagamento: cada sessão avulsa sai
          // daqui com a cobrança em aberto. Numa recorrência isso vale para
          // todas — é o mesmo compromisso repetido, não uma previsão.
          var geradas = Planos.cobrancasDeSessoes(criadas);
          UI.toast(
            (novas.length > 1 ? novas.length + ' sessões agendadas' : 'Sessão agendada') +
            (geradas ? ' · ' + Fmt.plural(geradas, 'cobrança em aberto', 'cobranças em aberto') : '') + '.');
        }
        UI.fecharModal();
      });

      var btnExcluir = c.querySelector('#excluir-sessao');
      if (btnExcluir) {
        btnExcluir.addEventListener('click', function () {
          UI.confirmar('Excluir sessão', 'Remover esta sessão do histórico? Não é possível desfazer.',
            'Excluir', function () { Store.excluirSessao(s.id); UI.toast('Sessão excluída.'); }, true);
        });
      }
    });
  }

  return {
    iniciar: iniciar,
    render: render,
    formulario: formulario,
    irParaMes: function (ym) { fMes.value = ym; fStatus.value = ''; fPaciente.value = ''; render(); }
  };
})();
