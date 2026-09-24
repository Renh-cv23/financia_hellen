/* =========================================================================
   cobrancas.js — tela do financeiro: mensalidades, quinzenas e sessões avulsas
   no mesmo lugar, com o que está em aberto e o que já venceu.
   ========================================================================= */
var Cobrancas = (function () {
  var lista, resumo, fMes, fPaciente, fSituacao;

  function iniciar() {
    lista = document.getElementById('lista-cobrancas');
    resumo = document.getElementById('resumo-cobrancas');
    fMes = document.getElementById('fc-mes');
    fPaciente = document.getElementById('fc-paciente');
    fSituacao = document.getElementById('fc-situacao');

    fMes.value = Fmt.mesAtual();
    [fMes, fPaciente, fSituacao].forEach(function (el) { el.addEventListener('change', render); });
    document.getElementById('fc-limpar').addEventListener('click', function () {
      fMes.value = ''; fPaciente.value = ''; fSituacao.value = '';
      render();
    });

    document.getElementById('btn-gerar').addEventListener('click', gerarDoMes);

    lista.addEventListener('click', function (e) {
      var alvo = e.target.closest('[data-acao]');
      if (!alvo) return;
      var id = alvo.dataset.id;
      if (alvo.dataset.acao === 'pagar') {
        var c = Store.alternarPagamento(id);
        UI.toast(c && c.pago ? 'Pagamento registrado.' : 'Pagamento desfeito.');
      } else if (alvo.dataset.acao === 'editar') {
        formulario(id);
      }
    });
  }

  /* Gera o que falta no mês escolhido (ou no corrente, com o filtro limpo):
     mensalidades, quinzenas e sessões avulsas ainda sem cobrança. Esta última
     parte é a rede de segurança para sessão criada antes da regra atual, em que
     a cobrança do avulso nasce junto com o agendamento. Idempotente. */
  function gerarDoMes() {
    var competencia = fMes.value || Fmt.mesAtual();
    var pend = Planos.pendentes(competencia);

    if (!pend.qtd) {
      UI.toast(Fmt.mesExtenso(competencia) + ' já está completo — nada a gerar.');
      return;
    }

    UI.confirmar('Gerar cobranças de ' + Fmt.mesExtenso(competencia),
      'Serão criadas <strong>' + Fmt.plural(pend.qtd, 'cobrança', 'cobranças') + '</strong> de ' +
      Fmt.plural(pend.pacientes, 'paciente', 'pacientes') + ' (mensalidades, quinzenas e sessões ' +
      'avulsas sem cobrança), totalizando <strong>' + Fmt.moeda(pend.total) + '</strong>. ' +
      'Quem já tem cobrança no mês não é duplicado.',
      'Gerar', function () {
        var n = Planos.gerar(competencia);
        fMes.value = competencia;
        UI.toast(Fmt.plural(n, 'cobrança criada', 'cobranças criadas') + '.');
      });
  }

  function popularPacientes() {
    var atual = fPaciente.value;
    var ordenados = Store.pacientes().slice().sort(function (a, b) { return a.nome.localeCompare(b.nome, 'pt-BR'); });
    fPaciente.innerHTML = '<option value="">Todos os pacientes</option>' +
      ordenados.map(function (p) { return '<option value="' + p.id + '">' + Fmt.escapar(p.nome) + '</option>'; }).join('');
    fPaciente.value = atual;
  }

  function filtrar() {
    var mes = fMes.value, pid = fPaciente.value, sit = fSituacao.value;
    var base = mes ? Finance.cobrancasDoMes(Store.cobrancas(), mes) : Store.cobrancas();
    return base.filter(function (c) {
      if (pid && c.pacienteId !== pid) return false;
      if (sit === 'aberta') return !c.pago;
      if (sit === 'vencida') return Finance.vencida(c);
      if (sit === 'paga') return c.pago;
      return true;
    });
  }

  function cartao(c) {
    var p = Store.paciente(c.pacienteId);
    var atrasada = Finance.vencida(c);
    var selo = c.pago
      ? '<span class="badge badge--pago">✓ Pago ' + (c.dataPagamento ? Fmt.dataCurta(c.dataPagamento) : '') + (c.metodo ? ' · ' + Fmt.escapar(c.metodo) : '') + '</span>'
      : (atrasada
        ? '<span class="badge badge--vencida">⚠ Vencida</span>'
        : '<span class="badge badge--pendente">Em aberto</span>');

    return '' +
      '<article class="item' + (atrasada ? ' item--vencida' : '') + '">' +
        '<div class="item__top">' +
          '<div>' +
            '<div class="item__name">' + Fmt.escapar(p ? p.nome : 'Paciente removido') + '</div>' +
            '<div class="item__meta">' + Fmt.escapar(c.descricao || 'Cobrança') + '</div>' +
            '<div class="item__meta">Vence ' + Fmt.data(c.vencimento) + '</div>' +
          '</div>' +
          '<div class="item__value">' + Fmt.moeda(c.valor) + '</div>' +
        '</div>' +
        '<div class="chips">' + selo + '</div>' +
        '<div class="item__actions">' +
          '<button class="ghost-btn" data-acao="pagar" data-id="' + c.id + '">' + (c.pago ? '↩ Desfazer pagamento' : '💰 Registrar pagamento') + '</button>' +
          '<button class="ghost-btn" data-acao="editar" data-id="' + c.id + '">Editar</button>' +
        '</div>' +
      '</article>';
  }

  function render() {
    if (!lista) return;
    popularPacientes();

    var itens = Finance.ordenarCobrancas(filtrar(), false);
    var t = Finance.totais(itens);

    resumo.innerHTML =
      '<span>' + (fMes.value ? Fmt.mesExtenso(fMes.value) : 'Todo o período') + '</span>' +
      '<span>Recebido ' + Fmt.moeda(t.recebido) + '</span>' +
      '<span>Em aberto ' + Fmt.moeda(t.aReceber) + '</span>' +
      (t.vencido > 0 ? '<span class="resumo--alerta">Vencido ' + Fmt.moeda(t.vencido) + '</span>' : '');

    if (!itens.length) {
      lista.innerHTML = UI.vazio('Nenhuma cobrança no filtro',
        'Use "Gerar cobranças do mês" para criar as mensalidades, ou + para lançar uma avulsa.');
      return;
    }
    lista.innerHTML = '<div class="list">' + itens.map(cartao).join('') + '</div>';
  }

  /* ------------------------------ Formulário ------------------------- */
  function formulario(id) {
    var c = id ? Store.cobranca(id) : null;
    var pacientes = Store.pacientes().slice().sort(function (a, b) { return a.nome.localeCompare(b.nome, 'pt-BR'); });

    if (!pacientes.length) {
      UI.confirmar('Cadastre um paciente primeiro',
        'Toda cobrança pertence a um paciente.', 'Cadastrar paciente',
        function () { Pacientes.formulario(); });
      return;
    }

    var pidAtual = c ? c.pacienteId : (fPaciente.value || pacientes[0].id);
    var e = Fmt.escapar;

    UI.modal(c ? 'Editar cobrança' : 'Nova cobrança',
      '<form class="form-grid" id="form-cobranca">' +
        '<label class="field"><span>Paciente *</span><select name="pacienteId" required>' +
          pacientes.map(function (p) {
            return '<option value="' + p.id + '"' + (p.id === pidAtual ? ' selected' : '') + ' data-valor="' + Planos.plano(p).valor + '">' + e(p.nome) + '</option>';
          }).join('') +
        '</select></label>' +
        '<label class="field"><span>Descrição</span>' +
          '<input name="descricao" placeholder="Mensalidade, sessão extra, reposição..." value="' + e(c ? c.descricao : '') + '"></label>' +
        '<div class="form-2">' +
          '<label class="field"><span>Valor (R$) *</span>' +
            '<input type="number" name="valor" min="0" step="10" inputmode="decimal" required value="' + (c ? c.valor : '') + '"></label>' +
          '<label class="field"><span>Vencimento *</span>' +
            '<input type="date" name="vencimento" required value="' + (c ? c.vencimento : Fmt.hoje()) + '"></label>' +
        '</div>' +
        '<label class="check"><input type="checkbox" name="pago" ' + (c && c.pago ? 'checked' : '') + '> <span>Pagamento recebido</span></label>' +
        '<div class="form-2" id="bloco-pag-cobranca"' + (c && c.pago ? '' : ' hidden') + '>' +
          '<label class="field"><span>Data do pagamento</span>' +
            '<input type="date" name="dataPagamento" value="' + (c ? c.dataPagamento : '') + '"></label>' +
          '<label class="field"><span>Forma</span><select name="metodo">' +
            ['', 'Pix', 'Dinheiro', 'Cartão', 'Transferência', 'Convênio'].map(function (m) {
              return '<option value="' + m + '"' + (c && c.metodo === m ? ' selected' : '') + '>' + (m || '—') + '</option>';
            }).join('') +
          '</select></label>' +
        '</div>' +
        '<div class="btn-row">' +
          '<button class="btn" type="submit">Salvar</button>' +
          (c ? '<button class="btn btn--danger" type="button" id="excluir-cobranca">Excluir</button>' : '') +
        '</div>' +
      '</form>',
      function (ct) {
        var form = ct.querySelector('#form-cobranca');
        var bloco = ct.querySelector('#bloco-pag-cobranca');

        if (!c) {
          form.valor.value = form.pacienteId.selectedOptions[0].dataset.valor;
          form.pacienteId.addEventListener('change', function () {
            if (!form.valor.dataset.tocado) form.valor.value = this.selectedOptions[0].dataset.valor;
          });
          form.valor.addEventListener('input', function () { this.dataset.tocado = '1'; });
        }

        form.pago.addEventListener('change', function () {
          bloco.hidden = !this.checked;
          if (this.checked && !form.dataPagamento.value) form.dataPagamento.value = Fmt.hoje();
        });

        form.addEventListener('submit', function (ev) {
          ev.preventDefault();
          var dados = {
            pacienteId: form.pacienteId.value,
            descricao: form.descricao.value.trim() || 'Cobrança',
            valor: Number(form.valor.value) || 0,
            vencimento: form.vencimento.value,
            competencia: form.vencimento.value.slice(0, 7),
            pago: form.pago.checked,
            dataPagamento: form.pago.checked ? (form.dataPagamento.value || Fmt.hoje()) : '',
            metodo: form.pago.checked ? form.metodo.value : ''
          };
          if (c) { dados.id = c.id; } else { dados.origem = 'manual'; }
          Store.salvarCobranca(dados);
          UI.fecharModal();
          UI.toast(c ? 'Cobrança atualizada.' : 'Cobrança lançada.');
        });

        var btnExcluir = ct.querySelector('#excluir-cobranca');
        if (btnExcluir) {
          btnExcluir.addEventListener('click', function () {
            UI.confirmar('Excluir cobrança',
              'Remover <strong>' + e(c.descricao) + '</strong> de ' + Fmt.moeda(c.valor) + '? Não é possível desfazer.',
              'Excluir', function () { Store.excluirCobranca(c.id); UI.toast('Cobrança excluída.'); }, true);
          });
        }
      });
  }

  return {
    iniciar: iniciar,
    render: render,
    formulario: formulario,
    irParaMes: function (ym) { fMes.value = ym; fPaciente.value = ''; fSituacao.value = ''; render(); }
  };
})();
