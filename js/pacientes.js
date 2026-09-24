/* =========================================================================
   pacientes.js — tela de pacientes (lista, cadastro, edição, exclusão).
   ========================================================================= */
var Pacientes = (function () {
  var lista, busca, mostrarInativos;

  function iniciar() {
    lista = document.getElementById('lista-pacientes');
    busca = document.getElementById('f-busca');
    mostrarInativos = document.getElementById('f-inativos');
    busca.addEventListener('input', render);
    mostrarInativos.addEventListener('change', render);
  }

  function filtrar() {
    var termo = (busca.value || '').toLowerCase().trim();
    var digitos = termo.replace(/\D/g, '');
    return Store.pacientes().filter(function (p) {
      if (!mostrarInativos.checked && !p.ativo) return false;
      if (!termo) return true;
      var achouNome = p.nome.toLowerCase().indexOf(termo) >= 0;
      var achouTel = digitos && String(p.telefone || '').replace(/\D/g, '').indexOf(digitos) >= 0;
      return achouNome || achouTel;
    }).sort(function (a, b) { return a.nome.localeCompare(b.nome, 'pt-BR'); });
  }

  function cartao(p) {
    var sessoes = Finance.doPaciente(Store.sessoes(), p.id);
    var t = Finance.totais(Finance.doPaciente(Store.cobrancas(), p.id));
    var realizadas = sessoes.filter(function (s) { return s.status === 'realizada'; }).length;
    var idade = Fmt.idade(p.nascimento);
    var zap = Fmt.whatsapp(p.telefone);
    var e = Fmt.escapar;

    return '' +
      '<article class="item">' +
        '<div class="item__top">' +
          '<div>' +
            '<div class="item__name">' + e(p.nome) + (p.ativo ? '' : ' <span class="badge badge--cancelada">inativo</span>') + '</div>' +
            '<div class="item__meta">' +
              (idade != null ? idade + ' anos · ' + Fmt.data(p.nascimento) : 'sem data de nascimento') +
            '</div>' +
            '<div class="item__meta">' + (p.telefone ? Fmt.telefone(p.telefone) : 'sem telefone') + '</div>' +
            '<div class="item__meta">💳 ' + Fmt.escapar(Planos.descricao(p)) + '</div>' +
          '</div>' +
          '<div style="text-align:right">' +
            '<div class="item__value">' + Fmt.moeda(t.recebido) + '</div>' +
            '<div class="item__meta">' + realizadas + ' realizadas</div>' +
          '</div>' +
        '</div>' +
        (t.aReceber > 0 ? '<div class="chips"><span class="badge badge--' + (t.vencido > 0 ? 'vencida' : 'pendente') + '">' +
          (t.vencido >= t.aReceber
            ? '⚠ Vencido ' + Fmt.moeda(t.vencido)
            : 'Em aberto ' + Fmt.moeda(t.aReceber) + (t.vencido > 0 ? ' (' + Fmt.moeda(t.vencido) + ' vencido)' : '')) +
          ' · ' + Fmt.plural(t.qtdAbertas, 'cobrança', 'cobranças') + '</span></div>' : '') +
        (p.observacoes ? '<div class="item__meta">' + e(p.observacoes) + '</div>' : '') +
        '<div class="item__actions">' +
          '<button class="ghost-btn" data-nova="' + p.id + '">+ Sessão</button>' +
          (zap ? '<a class="ghost-btn" href="' + zap + '" target="_blank" rel="noopener">WhatsApp</a>' : '') +
          (p.telefone ? '<a class="ghost-btn" href="tel:' + String(p.telefone).replace(/\D/g, '') + '">Ligar</a>' : '') +
          '<button class="ghost-btn" data-editar="' + p.id + '">Editar</button>' +
          '<button class="ghost-btn" data-historico="' + p.id + '">Histórico</button>' +
        '</div>' +
      '</article>';
  }

  function render() {
    if (!lista) return;
    var itens = filtrar();
    if (!itens.length) {
      lista.innerHTML = Store.pacientes().length
        ? UI.vazio('Nenhum paciente encontrado', 'Tente outro nome ou telefone.')
        : UI.vazio('Nenhum paciente cadastrado', 'Toque no botão + para cadastrar o primeiro.');
      return;
    }
    lista.innerHTML = '<div class="list">' + itens.map(cartao).join('') + '</div>';
  }

  /* ------------------------------ Formulário ------------------------- */
  function formulario(id) {
    var p = id ? Store.paciente(id) : null;
    var e = Fmt.escapar;
    var valorPadrao = p ? p.valorSessao : Store.config().valorSessaoPadrao;

    var plano = Planos.plano(p);
    var html = '' +
      '<form class="form-grid" id="form-paciente">' +
        '<label class="field"><span>Nome completo *</span>' +
          '<input name="nome" required value="' + e(p ? p.nome : '') + '" autocomplete="name"></label>' +
        '<div class="form-2">' +
          '<label class="field"><span>Data de nascimento</span>' +
            '<input type="date" name="nascimento" value="' + (p ? p.nascimento : '') + '"></label>' +
          '<label class="field"><span>Telefone</span>' +
            '<input type="tel" name="telefone" inputmode="tel" placeholder="(11) 98888-7777" value="' + e(p ? Fmt.telefone(p.telefone) : '') + '"></label>' +
        '</div>' +
        '<fieldset class="fieldset">' +
          '<legend>Plano de pagamento</legend>' +
          '<label class="field"><span>Como este paciente paga</span><select name="tipoPlano">' +
            '<option value="avulso"' + (plano.tipo === 'avulso' ? ' selected' : '') + '>Por sessão (avulso)</option>' +
            '<option value="quinzenal"' + (plano.tipo === 'quinzenal' ? ' selected' : '') + '>Quinzenal (a cada 15 dias)</option>' +
            '<option value="mensal"' + (plano.tipo === 'mensal' ? ' selected' : '') + '>Mensal</option>' +
          '</select></label>' +
          '<div class="form-2">' +
            '<label class="field"><span id="rot-valor-plano">Valor (R$)</span>' +
              '<input type="number" name="valorPlano" min="0" step="10" inputmode="decimal" value="' + (p ? plano.valor : valorPadrao) + '"></label>' +
            '<label class="field" id="campo-parcelas"><span>Dividir em</span><select name="parcelas">' +
              [1, 2, 3, 4].map(function (n) {
                return '<option value="' + n + '"' + (plano.parcelas === n ? ' selected' : '') + '>' +
                  (n === 1 ? 'Parcela única' : n + 'x') + '</option>';
              }).join('') +
            '</select></label>' +
          '</div>' +
          '<label class="field" id="campo-vencimento"><span>Dia do vencimento</span>' +
            '<input type="number" name="diaVencimento" min="1" max="28" inputmode="numeric" value="' + plano.diaVencimento + '"></label>' +
          '<p class="hint" id="resumo-plano"></p>' +
        '</fieldset>' +
        '<label class="field"><span>Observações</span>' +
          '<textarea name="observacoes" placeholder="Convênio, horário preferido, etc.">' + e(p ? p.observacoes : '') + '</textarea></label>' +
        '<label class="check"><input type="checkbox" name="ativo" ' + (!p || p.ativo ? 'checked' : '') + '> <span>Paciente ativo (em atendimento)</span></label>' +
        '<div class="btn-row">' +
          '<button class="btn" type="submit">Salvar</button>' +
          (p ? '<button class="btn btn--danger" type="button" id="excluir-paciente">Excluir</button>' : '') +
        '</div>' +
      '</form>';

    UI.modal(p ? 'Editar paciente' : 'Novo paciente', html, function (c) {
      var form = c.querySelector('#form-paciente');

      form.telefone.addEventListener('input', function () {
        var d = this.value.replace(/\D/g, '').slice(0, 11);
        this.value = d.length > 6 ? Fmt.telefone(d) : d;
      });

      /* O formulário muda de cara conforme o plano: no avulso não existe parcela
         nem dia de vencimento; no quinzenal o valor é por quinzena. */
      /* Sugestão de valor ao trocar o tipo — só enquanto ela não digitou um
         valor próprio, para não sobrescrever combinação particular. */
      var SUGESTAO = { avulso: Store.config().valorSessaoPadrao, quinzenal: 200, mensal: 400 };

      function ajustarPlano(trocouTipo) {
        var tipo = form.tipoPlano.value;
        var avulso = tipo === 'avulso';
        if (trocouTipo && !form.valorPlano.dataset.tocado) form.valorPlano.value = SUGESTAO[tipo];
        form.querySelector('#campo-parcelas').hidden = tipo !== 'mensal';
        form.querySelector('#campo-vencimento').hidden = avulso;
        form.querySelector('#rot-valor-plano').textContent =
          avulso ? 'Valor por sessão (R$)' : (tipo === 'quinzenal' ? 'Valor por quinzena (R$)' : 'Valor mensal (R$)');

        var valor = Number(form.valorPlano.value) || 0;
        var parcelas = Number(form.parcelas.value) || 1;
        var resumo = form.querySelector('#resumo-plano');
        if (avulso) {
          resumo.textContent = 'Cada sessão realizada vira uma cobrança de ' + Fmt.moeda(valor) + '.';
        } else if (tipo === 'quinzenal') {
          resumo.textContent = 'Duas cobranças por mês (' + Fmt.moeda(valor) + ' cada) — ' + Fmt.moeda(valor * 2) + ' no mês.';
        } else {
          resumo.textContent = parcelas > 1
            ? parcelas + ' cobranças de ' + Fmt.moeda(valor / parcelas) + ' no mês — total ' + Fmt.moeda(valor) + '.'
            : 'Uma cobrança de ' + Fmt.moeda(valor) + ' por mês.';
        }
      }
      ajustarPlano(false);
      form.tipoPlano.addEventListener('change', function () { ajustarPlano(true); });
      form.parcelas.addEventListener('change', function () { ajustarPlano(false); });
      form.valorPlano.addEventListener('input', function () {
        this.dataset.tocado = '1';
        ajustarPlano(false);
      });

      form.addEventListener('submit', function (ev) {
        ev.preventDefault();
        var tipo = form.tipoPlano.value;
        var valorPlano = Number(form.valorPlano.value) || Store.config().valorSessaoPadrao;
        var dados = {
          nome: form.nome.value.trim(),
          nascimento: form.nascimento.value,
          telefone: form.telefone.value.replace(/\D/g, ''),
          valorSessao: tipo === 'avulso' ? valorPlano : (p ? p.valorSessao : Store.config().valorSessaoPadrao),
          plano: {
            tipo: tipo,
            valor: valorPlano,
            parcelas: tipo === 'mensal' ? (Number(form.parcelas.value) || 1) : 1,
            diaVencimento: Number(form.diaVencimento.value) || 5
          },
          observacoes: form.observacoes.value.trim(),
          ativo: form.ativo.checked
        };
        if (!dados.nome) return;
        if (p) dados.id = p.id;
        Store.salvarPaciente(dados);
        UI.fecharModal();
        UI.toast(p ? 'Paciente atualizado.' : 'Paciente cadastrado.');
      });

      var btnExcluir = c.querySelector('#excluir-paciente');
      if (btnExcluir) {
        btnExcluir.addEventListener('click', function () {
          var n = Finance.doPaciente(Store.sessoes(), p.id).length;
          UI.confirmar('Excluir paciente',
            'Excluir <strong>' + Fmt.escapar(p.nome) + '</strong>' +
            (n ? ' e as <strong>' + n + '</strong> sessões registradas' : '') +
            '? Esta ação não pode ser desfeita. Se for só encerrar o acompanhamento, desmarque "paciente ativo".',
            'Excluir', function () {
              Store.excluirPaciente(p.id);
              UI.toast('Paciente excluído.');
            }, true);
        });
      }
    });
  }

  /* ------------------------------ Histórico -------------------------- */
  function historico(id) {
    var p = Store.paciente(id);
    if (!p) return;
    var sessoes = Finance.ordenar(Finance.doPaciente(Store.sessoes(), id), false);
    var cobrancas = Finance.ordenarCobrancas(Finance.doPaciente(Store.cobrancas(), id), false);
    var t = Finance.totais(cobrancas);

    var linhas = sessoes.length
      ? '<div class="table-view"><table><thead><tr><th>Data</th><th>Situação</th><th>Valor</th><th>Pago</th></tr></thead><tbody>' +
        sessoes.map(function (s) {
          return '<tr><td>' + Fmt.data(s.data) + (s.hora ? ' ' + s.hora : '') + '</td>' +
            '<td>' + s.status + '</td>' +
            '<td>' + Fmt.moeda(s.valor) + '</td>' +
            '<td>' + (s.pago ? 'sim' : '—') + '</td></tr>';
        }).join('') +
        '</tbody></table></div>'
      : UI.vazio('Sem sessões', 'Nenhuma sessão registrada para este paciente.');

    var linhasCobrancas = cobrancas.length
      ? '<div class="table-view"><table><thead><tr><th>Vencimento</th><th>Descrição</th><th>Valor</th><th>Pago</th></tr></thead><tbody>' +
        cobrancas.map(function (c) {
          return '<tr><td>' + Fmt.data(c.vencimento) + '</td>' +
            '<td>' + Fmt.escapar(c.descricao) + '</td>' +
            '<td>' + Fmt.moeda(c.valor) + '</td>' +
            '<td>' + (c.pago ? Fmt.dataCurta(c.dataPagamento) : (Finance.vencida(c) ? '⚠ vencida' : '—')) + '</td></tr>';
        }).join('') + '</tbody></table></div>'
      : '';

    UI.modal('Histórico — ' + p.nome,
      '<dl class="kv">' +
        '<dt>Plano</dt><dd>' + Fmt.escapar(Planos.descricao(p)) + '</dd>' +
        '<dt>Total recebido</dt><dd>' + Fmt.moeda(t.recebido) + '</dd>' +
        '<dt>Em aberto</dt><dd>' + Fmt.moeda(t.aReceber) + '</dd>' +
        (t.vencido > 0 ? '<dt>Vencido</dt><dd>' + Fmt.moeda(t.vencido) + '</dd>' : '') +
      '</dl>' +
      '<h3 class="card__title">Cobranças</h3>' + (linhasCobrancas || '<p class="hint">Nenhuma cobrança.</p>') +
      '<h3 class="card__title">Sessões</h3>' + linhas);
  }

  /* Delegação de eventos: a lista é redesenhada inteira a cada mudança,
     então escutar no container evita religar handlers a cada render. */
  function ligarCliques() {
    document.getElementById('lista-pacientes').addEventListener('click', function (e) {
      var alvo = e.target.closest('[data-editar],[data-historico],[data-nova]');
      if (!alvo) return;
      if (alvo.dataset.editar) formulario(alvo.dataset.editar);
      else if (alvo.dataset.historico) historico(alvo.dataset.historico);
      else if (alvo.dataset.nova) Sessoes.formulario(null, alvo.dataset.nova);
    });
  }

  return {
    iniciar: function () { iniciar(); ligarCliques(); },
    render: render,
    formulario: formulario
  };
})();
