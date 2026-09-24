/* =========================================================================
   planos.js — regras dos planos de pagamento e geração das cobranças.

   Quatro arranjos atendidos:
     avulso     — paga por sessão (R$ 100). A cobrança nasce da sessão realizada.
     quinzenal  — R$ 200 a cada 15 dias. Duas cobranças por mês.
     mensal     — R$ 400 por mês, uma cobrança.
     mensal dividido — R$ 400 em N parcelas (2x 200, 4x 100...), espaçadas
                       dentro do próprio mês.

   O ponto de projeto: no plano, o que se cobra não depende de quantas sessões
   aconteceram no mês — é mensalidade, não pacote de sessões. Por isso a geração
   olha o calendário, não a agenda.
   ========================================================================= */
var Planos = (function () {

  var TIPOS = {
    avulso: 'Por sessão',
    quinzenal: 'Quinzenal',
    mensal: 'Mensal'
  };

  function plano(paciente) {
    return (paciente && paciente.plano) || { tipo: 'avulso', valor: 100, parcelas: 1, diaVencimento: 5 };
  }

  function descricao(paciente) {
    var pl = plano(paciente);
    if (pl.tipo === 'avulso') return 'Por sessão · ' + Fmt.moeda(pl.valor);
    if (pl.tipo === 'quinzenal') return 'Quinzenal · ' + Fmt.moeda(pl.valor) + ' a cada 15 dias';
    return pl.parcelas > 1
      ? 'Mensal · ' + Fmt.moeda(pl.valor) + ' em ' + pl.parcelas + 'x de ' + Fmt.moeda(pl.valor / pl.parcelas)
      : 'Mensal · ' + Fmt.moeda(pl.valor);
  }

  /* Quanto o paciente representa por mês — usado para projeção e conferência. */
  function previstoMensal(paciente) {
    var pl = plano(paciente);
    if (pl.tipo === 'mensal') return pl.valor;
    if (pl.tipo === 'quinzenal') return pl.valor * 2;
    return 0;                                   // avulso depende das sessões realizadas
  }

  function ultimoDia(ano, mes) {                // mes 1-12
    return new Date(ano, mes, 0).getDate();
  }

  function vencimento(competencia, dia) {
    var p = competencia.split('-');
    var ano = +p[0], mes = +p[1];
    var diaValido = Math.min(dia, ultimoDia(ano, mes));
    return ano + '-' + String(mes).padStart(2, '0') + '-' + String(diaValido).padStart(2, '0');
  }

  /* Molde da cobrança de uma sessão avulsa. Existe como função única porque
     três caminhos criam essa cobrança (agendamento, edição e "Gerar cobranças
     do mês"); se cada um montasse o próprio objeto, eles divergiriam. */
  function itemDaSessao(s, p) {
    return {
      pacienteId: s.pacienteId,
      competencia: (s.data || '').slice(0, 7),
      descricao: 'Sessão ' + Fmt.data(s.data),
      valor: Number(s.valor) || plano(p).valor,
      vencimento: s.data,
      pago: false,
      dataPagamento: '',
      metodo: '',
      origem: 'sessao',
      sessaoId: s.id,
      indice: 1
    };
  }

  /* Cobranças que DEVERIAM existir para este paciente nesta competência.
     Função pura: quem grava é o chamador, o que torna a geração conferível. */
  function previstas(paciente, competencia) {
    var pl = plano(paciente);
    if (pl.tipo === 'avulso') return [];

    var itens = [];
    if (pl.tipo === 'quinzenal') {
      // Duas quinzenas, cada uma com o valor cheio do ciclo.
      [0, 15].forEach(function (offset, i) {
        itens.push({
          indice: i + 1,
          valor: pl.valor,
          vencimento: vencimento(competencia, pl.diaVencimento + offset),
          descricao: 'Plano quinzenal — ' + (i + 1) + 'ª quinzena'
        });
      });
      return itens;
    }

    // Mensal: uma cobrança, ou N parcelas espaçadas dentro do mês.
    var passo = Math.floor(30 / pl.parcelas);
    var valorParcela = Math.round((pl.valor / pl.parcelas) * 100) / 100;
    for (var i = 0; i < pl.parcelas; i++) {
      itens.push({
        indice: i + 1,
        valor: valorParcela,
        vencimento: vencimento(competencia, pl.diaVencimento + i * passo),
        descricao: pl.parcelas > 1
          ? 'Plano mensal — parcela ' + (i + 1) + '/' + pl.parcelas
          : 'Plano mensal'
      });
    }
    return itens;
  }

  /* O que ainda falta gerar na competência. Função pura de leitura: é a mesma
     conta usada pelo aviso do painel, pela confirmação e pela própria geração —
     um só lugar decide o que "falta", então as três telas nunca discordam. */
  function pendentes(competencia) {
    var existentes = {}, cobertas = {};
    Store.cobrancas().forEach(function (c) {
      if (c.origem === 'plano') existentes[c.pacienteId + '|' + c.competencia + '|' + c.indice] = true;
      if (c.sessaoId) cobertas[c.sessaoId] = true;
    });

    var faltando = [], pacientes = {};
    Store.pacientes().forEach(function (p) {
      if (!p.ativo) return;
      previstas(p, competencia).forEach(function (item) {
        if (existentes[p.id + '|' + competencia + '|' + item.indice]) return;
        pacientes[p.id] = true;
        faltando.push({
          pacienteId: p.id,
          competencia: competencia,
          descricao: item.descricao,
          valor: item.valor,
          vencimento: item.vencimento,
          pago: false,
          dataPagamento: '',
          metodo: '',
          origem: 'plano',
          indice: item.indice
        });
      });
    });

    /* Avulso: toda sessão do mês que ainda não tem cobrança vinculada.
       Aqui não se exige paciente ativo — a sessão aconteceu (ou vai acontecer)
       e o valor é devido mesmo que o acompanhamento já tenha se encerrado.
       No plano é o contrário: mensalidade de inativo não deve continuar nascendo. */
    Store.sessoes().forEach(function (s) {
      if ((s.data || '').slice(0, 7) !== competencia) return;
      if (s.status === 'cancelada' || cobertas[s.id]) return;
      var p = Store.paciente(s.pacienteId);
      if (!p || plano(p).tipo !== 'avulso') return;
      pacientes[p.id] = true;
      faltando.push(itemDaSessao(s, p));
    });

    return {
      itens: faltando,
      qtd: faltando.length,
      pacientes: Object.keys(pacientes).length,
      total: faltando.reduce(function (soma, i) { return soma + i.valor; }, 0)
    };
  }

  /* Gera o que falta. Idempotente pela chave paciente + competência + parcela,
     então rodar duas vezes no mesmo mês não duplica nada — importante porque o
     botão fica à mão na tela e agora também no aviso do painel. */
  function gerar(competencia) {
    var pend = pendentes(competencia);
    if (pend.qtd) Store.salvarVariasCobrancas(pend.itens);
    return pend.qtd;
  }

  /* Avulso: a sessão vira conta a receber já no agendamento — a agenda passa a
     ser a fonte do que vai entrar, sem depender de marcar "realizada" depois.
     A contrapartida é sincronizar: cancelar precisa derrubar a cobrança em
     aberto, senão sobra cobrança de sessão que não houve (ver sincronizar). */
  function cobrancaDaSessao(sessaoId, criarSeFaltar) {
    var s = Store.sessao(sessaoId);
    if (!s) return null;
    var existente = Store.cobrancaDaSessao(sessaoId);
    if (existente || !criarSeFaltar) return existente;
    if (s.status === 'cancelada') return null;

    var p = Store.paciente(s.pacienteId);
    if (plano(p).tipo !== 'avulso') return null;    // no plano, a sessão não gera cobrança

    return Store.salvarCobranca(itemDaSessao(s, p));
  }

  /* Cobranças de várias sessões de uma vez, com UMA gravação. Uma recorrência
     de 24 semanas não pode disparar 24 escritas do dataset inteiro. */
  function cobrancasDeSessoes(sessoes) {
    var itens = [];
    (sessoes || []).forEach(function (s) {
      if (!s || s.status === 'cancelada' || Store.cobrancaDaSessao(s.id)) return;
      var p = Store.paciente(s.pacienteId);
      if (!p || plano(p).tipo !== 'avulso') return;
      itens.push(itemDaSessao(s, p));
    });
    if (itens.length) Store.salvarVariasCobrancas(itens);
    return itens.length;
  }

  /* Realinha a cobrança depois de uma edição da sessão:
       cancelada  -> derruba a cobrança em aberto (a paga fica: o dinheiro entrou)
       sem cobrança -> cria
       em aberto  -> acompanha mudança de valor e de data
     Sem isso, editar a sessão deixaria o financeiro descrevendo uma versão
     antiga dela — o que ficou mais provável agora que a cobrança nasce cedo. */
  function sincronizarCobrancaDaSessao(sessaoId) {
    var s = Store.sessao(sessaoId);
    if (!s) return null;
    var atual = Store.cobrancaDaSessao(sessaoId);

    if (s.status === 'cancelada') {
      if (atual && !atual.pago) Store.excluirCobranca(atual.id);
      return null;
    }
    if (!atual) return cobrancaDaSessao(sessaoId, true);
    if (atual.pago) return atual;

    var p = Store.paciente(s.pacienteId);
    if (!p || plano(p).tipo !== 'avulso') return atual;

    var alvo = itemDaSessao(s, p);
    if (atual.valor !== alvo.valor || atual.vencimento !== alvo.vencimento) {
      return Store.salvarCobranca({
        id: atual.id, valor: alvo.valor, vencimento: alvo.vencimento,
        competencia: alvo.competencia, descricao: alvo.descricao
      });
    }
    return atual;
  }

  function ehAvulso(pacienteId) {
    return plano(Store.paciente(pacienteId)).tipo === 'avulso';
  }

  return {
    TIPOS: TIPOS,
    plano: plano,
    descricao: descricao,
    previstoMensal: previstoMensal,
    previstas: previstas,
    pendentes: pendentes,
    gerar: gerar,
    cobrancaDaSessao: cobrancaDaSessao,
    cobrancasDeSessoes: cobrancasDeSessoes,
    sincronizarCobrancaDaSessao: sincronizarCobrancaDaSessao,
    ehAvulso: ehAvulso
  };
})();
