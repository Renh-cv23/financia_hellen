/* =========================================================================
   finance.js — regras de negócio dos números. Sem DOM aqui: é o que permite
   testar/reaproveitar a lógica e mantém as telas burras.

   Fonte única da verdade financeira: a coleção `cobrancas`. A sessão não
   carrega mais pagamento — no plano mensal um pagamento cobre várias sessões,
   então contar dinheiro pela agenda daria número errado.

   Convenções:
     recebido  = cobrança com pago = true   (entra no mês do PAGAMENTO)
     a receber = cobrança em aberto         (entra no mês do VENCIMENTO)
     vencida   = em aberto com vencimento anterior a hoje
   ========================================================================= */
var Finance = (function () {

  function vencida(c, hoje) {
    return !c.pago && c.vencimento && c.vencimento < (hoje || Fmt.hoje());
  }

  function totais(cobrancas) {
    var hoje = Fmt.hoje();
    var t = { recebido: 0, aReceber: 0, vencido: 0, qtdPagas: 0, qtdAbertas: 0, qtdVencidas: 0 };
    cobrancas.forEach(function (c) {
      if (c.pago) { t.recebido += c.valor; t.qtdPagas++; return; }
      t.aReceber += c.valor; t.qtdAbertas++;
      if (vencida(c, hoje)) { t.vencido += c.valor; t.qtdVencidas++; }
    });
    return t;
  }

  /* Série mensal dos últimos N meses, sempre contígua (meses sem movimento
     entram com zero) — buraco no eixo de tempo distorce a leitura da evolução. */
  function porMes(cobrancas, sessoes, nMeses) {
    var ref = new Date();
    var chaves = [], mapa = {};
    for (var i = nMeses - 1; i >= 0; i--) {
      var d = new Date(ref.getFullYear(), ref.getMonth() - i, 1);
      var k = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
      chaves.push(k);
      mapa[k] = { mes: k, recebido: 0, aReceber: 0, sessoes: 0 };
    }

    cobrancas.forEach(function (c) {
      // Recebido conta no mês em que o dinheiro entrou; em aberto, no vencimento.
      var k = c.pago ? (c.dataPagamento || c.vencimento || '').slice(0, 7) : (c.vencimento || '').slice(0, 7);
      if (!mapa[k]) return;
      if (c.pago) mapa[k].recebido += c.valor;
      else mapa[k].aReceber += c.valor;
    });

    (sessoes || []).forEach(function (s) {
      var k = (s.data || '').slice(0, 7);
      if (mapa[k] && s.status !== 'cancelada') mapa[k].sessoes++;
    });

    return chaves.map(function (k) { return mapa[k]; });
  }

  function acumulado(serieMensal) {
    var soma = 0;
    return serieMensal.map(function (m) {
      soma += m.recebido;
      return { mes: m.mes, valor: soma };
    });
  }

  /* Cobranças do mês: paga entra pelo pagamento, aberta pelo vencimento — é
     assim que a tela do mês bate com o gráfico. */
  function cobrancasDoMes(cobrancas, ym) {
    return cobrancas.filter(function (c) {
      var k = c.pago ? (c.dataPagamento || c.vencimento || '') : (c.vencimento || '');
      return k.slice(0, 7) === ym;
    });
  }

  function doMes(sessoes, ym) {
    return sessoes.filter(function (s) { return (s.data || '').slice(0, 7) === ym; });
  }

  function doPaciente(registros, pacienteId) {
    return registros.filter(function (r) { return r.pacienteId === pacienteId; });
  }

  function proximas(sessoes, limite) {
    var hoje = Fmt.hoje();
    return sessoes
      .filter(function (s) { return s.data >= hoje && s.status === 'agendada'; })
      .sort(function (a, b) { return (a.data + a.hora).localeCompare(b.data + b.hora); })
      .slice(0, limite || 5);
  }

  function ordenar(sessoes, crescente) {
    return sessoes.slice().sort(function (a, b) {
      var r = (a.data + 'T' + (a.hora || '00:00')).localeCompare(b.data + 'T' + (b.hora || '00:00'));
      return crescente ? r : -r;
    });
  }

  function ordenarCobrancas(cobrancas, crescente) {
    return cobrancas.slice().sort(function (a, b) {
      var r = (a.vencimento || '').localeCompare(b.vencimento || '');
      return crescente ? r : -r;
    });
  }

  return {
    vencida: vencida,
    totais: totais,
    porMes: porMes,
    acumulado: acumulado,
    cobrancasDoMes: cobrancasDoMes,
    doMes: doMes,
    doPaciente: doPaciente,
    proximas: proximas,
    ordenar: ordenar,
    ordenarCobrancas: ordenarCobrancas
  };
})();
