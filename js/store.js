/* =========================================================================
   store.js — camada de persistência.
   Única parte do sistema que conhece o formato de armazenamento. O resto do
   app fala só com esta API; trocar localStorage por IndexedDB/SQLite no futuro
   não exige tocar em nenhuma tela.

   Estratégia: todo o dataset vive em memória e é gravado inteiro a cada
   mutação (O(n) por escrita). Para a escala real deste caso — ~40 sessões/mês,
   ~500/ano — isso é irrelevante e compra simplicidade e um export trivial.
   Se um dia passar de ~50k registros, o ponto de troca é IndexedDB.

   Schema 2: dinheiro deixou de morar na sessão e virou a coleção `cobrancas`.
   Motivo: com plano mensal (R$ 400) ou quinzenal (R$ 200) um pagamento cobre
   várias sessões, e com plano dividido uma mensalidade vira duas ou quatro
   cobranças. "Uma sessão = um pagamento" só descreve o paciente avulso, então
   deixou de servir como modelo. A sessão ficou com a agenda; a cobrança, com
   o financeiro. O elo é opcional (`cobranca.sessaoId`) e só existe no avulso.
   ========================================================================= */
var Store = (function () {
  var KEY = 'financia_hellen_v1';
  var SCHEMA = 2;

  var state = null;
  var listeners = [];

  function agora() { return new Date().toISOString(); }

  function novoId() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }

  function vazio() {
    return {
      schema: SCHEMA,
      atualizadoEm: agora(),
      config: { valorSessaoPadrao: 100, duracaoPadrao: 50, avisoIgnorado: '' },
      pacientes: [],
      sessoes: [],
      cobrancas: [],
      excluidos: {}                                // id -> quando foi excluído (ver marcarExcluidos)
    };
  }

  function planoNormalizado(p, padraoValor) {
    var plano = p.plano || {};
    var tipo = ['avulso', 'mensal', 'quinzenal'].indexOf(plano.tipo) >= 0 ? plano.tipo : 'avulso';
    var valorPadrao = tipo === 'mensal' ? 400 : tipo === 'quinzenal' ? 200 : (Number(p.valorSessao) || padraoValor);
    return {
      tipo: tipo,
      valor: Number(plano.valor) || valorPadrao,     // valor do ciclo (sessão, quinzena ou mês)
      parcelas: Math.max(1, Number(plano.parcelas) || 1),
      diaVencimento: Math.min(28, Math.max(1, Number(plano.diaVencimento) || 5))
    };
  }

  /* Normaliza qualquer dado vindo do disco/importação: garante campos novos em
     bases antigas e descarta registro sem id (aqui fica a migração de schema). */
  function normalizar(bruto) {
    var base = vazio();
    if (!bruto || typeof bruto !== 'object') return base;

    base.config.valorSessaoPadrao = Number(
      (bruto.config && bruto.config.valorSessaoPadrao) != null ? bruto.config.valorSessaoPadrao : 100
    ) || 100;
    base.config.duracaoPadrao = Number(
      (bruto.config && bruto.config.duracaoPadrao) != null ? bruto.config.duracaoPadrao : 50
    ) || 50;
    // Competência cujo aviso de geração foi adiado ('' = nenhum).
    base.config.avisoIgnorado = (bruto.config && bruto.config.avisoIgnorado) || '';

    base.pacientes = (bruto.pacientes || []).filter(function (p) { return p && p.id; }).map(function (p) {
      return {
        id: p.id,
        nome: String(p.nome || '').trim(),
        nascimento: p.nascimento || '',
        telefone: p.telefone || '',
        valorSessao: Number(p.valorSessao) || base.config.valorSessaoPadrao,
        plano: planoNormalizado(p, base.config.valorSessaoPadrao),
        ativo: p.ativo !== false,
        observacoes: p.observacoes || '',
        criadoEm: p.criadoEm || agora(),
        atualizadoEm: p.atualizadoEm || p.criadoEm || agora()
      };
    });

    base.sessoes = (bruto.sessoes || []).filter(function (s) { return s && s.id; }).map(function (s) {
      return {
        id: s.id,
        pacienteId: s.pacienteId || '',
        data: s.data || '',                       // YYYY-MM-DD
        hora: s.hora || '',                       // HH:MM
        duracao: Number(s.duracao) || base.config.duracaoPadrao,
        valor: Number(s.valor) || 0,              // só usado no avulso
        status: s.status || 'agendada',           // agendada | realizada | falta | cancelada
        notas: s.notas || '',
        criadoEm: s.criadoEm || agora(),
        atualizadoEm: s.atualizadoEm || s.criadoEm || agora()
      };
    });

    base.cobrancas = (bruto.cobrancas || []).filter(function (c) { return c && c.id; }).map(function (c) {
      return {
        id: c.id,
        pacienteId: c.pacienteId || '',
        competencia: c.competencia || (c.vencimento || '').slice(0, 7),
        descricao: c.descricao || '',
        valor: Number(c.valor) || 0,
        vencimento: c.vencimento || '',
        pago: !!c.pago,
        dataPagamento: c.dataPagamento || '',
        metodo: c.metodo || '',
        origem: c.origem || 'manual',             // plano | sessao | manual
        sessaoId: c.sessaoId || '',
        indice: Number(c.indice) || 1,            // ordem da parcela dentro da competência
        criadoEm: c.criadoEm || agora(),
        atualizadoEm: c.atualizadoEm || c.criadoEm || agora()
      };
    });

    // Migração 1 -> 2: cada sessão paga (ou realizada em aberto) vira cobrança.
    var precisaMigrar = Number(bruto.schema) < 2 && !Array.isArray(bruto.cobrancas);
    if (precisaMigrar) {
      (bruto.sessoes || []).forEach(function (s) {
        if (!s || !s.id) return;
        var cobravel = s.pago || s.status === 'realizada' || s.status === 'falta';
        if (!cobravel) return;
        base.cobrancas.push({
          id: novoId(),
          pacienteId: s.pacienteId || '',
          competencia: (s.data || '').slice(0, 7),
          descricao: 'Sessão ' + (s.data || ''),
          valor: Number(s.valor) || 0,
          vencimento: s.data || '',
          pago: !!s.pago,
          dataPagamento: s.dataPagamento || (s.pago ? s.data : ''),
          metodo: s.metodo || '',
          origem: 'sessao',
          sessaoId: s.id,
          indice: 1,
          criadoEm: s.criadoEm || agora(),
          atualizadoEm: s.atualizadoEm || agora()
        });
      });
    }

    // Registro de exclusões: sem ele, mesclar com outro aparelho (ou com a
    // nuvem) traria de volta tudo o que foi apagado aqui.
    var exc = bruto.excluidos && typeof bruto.excluidos === 'object' ? bruto.excluidos : {};
    Object.keys(exc).forEach(function (id) { base.excluidos[id] = String(exc[id] || agora()); });

    base.atualizadoEm = bruto.atualizadoEm || agora();
    return base;
  }

  function carregar() {
    var cru = null;
    try { cru = localStorage.getItem(KEY); } catch (e) { cru = null; }
    if (!cru) return vazio();
    try {
      return normalizar(JSON.parse(cru));
    } catch (e) {
      // Nunca sobrescrever silenciosamente dado corrompido: guarda uma cópia.
      try { localStorage.setItem(KEY + '_corrompido_' + Date.now(), cru); } catch (e2) {}
      return vazio();
    }
  }

  function gravar() {
    state.atualizadoEm = agora();
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (e) {
      // QuotaExceeded ou modo privativo: avisa em vez de perder a edição em silêncio.
      if (window.UI) UI.toast('Não foi possível salvar neste navegador. Baixe um backup agora.');
    }
    listeners.forEach(function (fn) { fn(state); });
  }

  /* Ids são UUID e nunca se repetem, então basta lembrar que o id morreu:
     na mesclagem, id excluído em qualquer lado some dos dois. */
  function marcarExcluidos(registros) {
    var quando = agora();
    registros.forEach(function (r) { state.excluidos[r.id] = quando; });
  }

  /* Helper genérico de upsert: as três coleções têm o mesmo ciclo de vida. */
  function upsert(colecao, dados, padroes) {
    var atual = dados.id ? colecao.filter(function (r) { return r.id === dados.id; })[0] : null;
    if (atual) {
      Object.assign(atual, dados, { atualizadoEm: agora() });
      return atual;
    }
    var novo = Object.assign({ id: novoId(), criadoEm: agora(), atualizadoEm: agora() }, padroes, dados);
    colecao.push(novo);
    return novo;
  }

  /* --------------------------- API pública --------------------------- */
  return {
    init: function () { state = carregar(); return state; },
    get: function () { return state; },
    onChange: function (fn) { listeners.push(fn); },
    novoId: novoId,

    config: function (patch) {
      if (patch) { Object.assign(state.config, patch); gravar(); }
      return state.config;
    },

    /* ----------------------------- Pacientes ------------------------- */
    pacientes: function () { return state.pacientes; },
    paciente: function (id) {
      return state.pacientes.filter(function (p) { return p.id === id; })[0] || null;
    },
    salvarPaciente: function (dados) {
      var p = upsert(state.pacientes, dados, { ativo: true, observacoes: '' });
      p.plano = planoNormalizado(p, state.config.valorSessaoPadrao);
      gravar();
      return p;
    },
    excluirPaciente: function (id) {
      marcarExcluidos(state.pacientes.filter(function (p) { return p.id === id; }));
      marcarExcluidos(state.sessoes.filter(function (s) { return s.pacienteId === id; }));
      marcarExcluidos(state.cobrancas.filter(function (c) { return c.pacienteId === id; }));
      state.pacientes = state.pacientes.filter(function (p) { return p.id !== id; });
      state.sessoes = state.sessoes.filter(function (s) { return s.pacienteId !== id; });
      state.cobrancas = state.cobrancas.filter(function (c) { return c.pacienteId !== id; });
      gravar();
    },

    /* ------------------------------ Sessões -------------------------- */
    sessoes: function () { return state.sessoes; },
    sessao: function (id) {
      return state.sessoes.filter(function (s) { return s.id === id; })[0] || null;
    },
    salvarSessao: function (dados) {
      var s = upsert(state.sessoes, dados, { status: 'agendada' });
      gravar();
      return s;
    },
    salvarVarias: function (lista) {
      // Devolve os registros gravados: quem cria a sessão precisa do id para
      // gerar a cobrança do avulso quando ela já nasce realizada.
      var criadas = lista.map(function (dados) { return upsert(state.sessoes, dados, { status: 'agendada' }); });
      gravar();
      return criadas;
    },
    excluirSessao: function (id) {
      marcarExcluidos(state.sessoes.filter(function (s) { return s.id === id; }));
      marcarExcluidos(state.cobrancas.filter(function (c) { return c.sessaoId === id && !c.pago; }));
      state.sessoes = state.sessoes.filter(function (s) { return s.id !== id; });
      // Cobrança em aberto gerada por esta sessão não faz mais sentido; a paga fica,
      // porque o dinheiro entrou de verdade e precisa continuar no histórico.
      state.cobrancas = state.cobrancas.filter(function (c) { return !(c.sessaoId === id && !c.pago); });
      gravar();
    },

    /* ----------------------------- Cobranças ------------------------- */
    cobrancas: function () { return state.cobrancas; },
    cobranca: function (id) {
      return state.cobrancas.filter(function (c) { return c.id === id; })[0] || null;
    },
    cobrancaDaSessao: function (sessaoId) {
      return state.cobrancas.filter(function (c) { return c.sessaoId === sessaoId; })[0] || null;
    },
    salvarCobranca: function (dados) {
      var c = upsert(state.cobrancas, dados, { pago: false, origem: 'manual', indice: 1 });
      gravar();
      return c;
    },
    salvarVariasCobrancas: function (lista) {
      lista.forEach(function (dados) { upsert(state.cobrancas, dados, { pago: false, origem: 'plano', indice: 1 }); });
      gravar();
    },
    excluirCobranca: function (id) {
      marcarExcluidos(state.cobrancas.filter(function (c) { return c.id === id; }));
      state.cobrancas = state.cobrancas.filter(function (c) { return c.id !== id; });
      gravar();
    },
    alternarPagamento: function (id) {
      var c = this.cobranca(id);
      if (!c) return null;
      c.pago = !c.pago;
      c.dataPagamento = c.pago ? Fmt.hoje() : '';
      if (!c.pago) c.metodo = '';
      c.atualizadoEm = agora();
      gravar();
      return c;
    },

    /* --------------------- Backup / transferência -------------------- */
    exportar: function () { return JSON.stringify(state, null, 2); },

    substituir: function (bruto) {
      var novo = normalizar(bruto);
      // O que existia aqui e não está no arquivo conta como excluído; senão a
      // próxima sincronização traria tudo de volta e "substituir" viraria "mesclar".
      var ficam = {};
      ['pacientes', 'sessoes', 'cobrancas'].forEach(function (col) {
        novo[col].forEach(function (r) { ficam[r.id] = true; });
      });
      var quando = agora();
      Object.keys(state.excluidos).forEach(function (id) {
        if (!ficam[id] && !novo.excluidos[id]) novo.excluidos[id] = state.excluidos[id];
      });
      ['pacientes', 'sessoes', 'cobrancas'].forEach(function (col) {
        state[col].forEach(function (r) { if (!ficam[r.id]) novo.excluidos[r.id] = quando; });
      });
      state = novo;
      gravar();
    },

    /* Mescla por id; em conflito vence o registro editado mais recentemente.
       É o que torna viável o fluxo celular <-> notebook sem servidor. */
    mesclar: function (bruto) {
      var outro = normalizar(bruto);
      var resumo = { pacientesNovos: 0, pacientesAtualizados: 0, sessoesNovas: 0, sessoesAtualizadas: 0, cobrancasNovas: 0, cobrancasAtualizadas: 0 };

      Object.keys(outro.excluidos).forEach(function (id) {
        if (!state.excluidos[id]) state.excluidos[id] = outro.excluidos[id];
      });
      var excluido = function (r) { return !!state.excluidos[r.id]; };
      state.pacientes = state.pacientes.filter(function (r) { return !excluido(r); });
      state.sessoes = state.sessoes.filter(function (r) { return !excluido(r); });
      state.cobrancas = state.cobrancas.filter(function (r) { return !excluido(r); });

      function juntar(atual, chegando, contNovo, contAtualizado) {
        var indice = {};
        atual.forEach(function (r) { indice[r.id] = r; });
        chegando.forEach(function (r) {
          if (excluido(r)) return;
          var existente = indice[r.id];
          if (!existente) {
            atual.push(r);
            resumo[contNovo]++;
          } else if ((r.atualizadoEm || '') > (existente.atualizadoEm || '')) {
            Object.assign(existente, r);
            resumo[contAtualizado]++;
          }
        });
      }

      juntar(state.pacientes, outro.pacientes, 'pacientesNovos', 'pacientesAtualizados');
      juntar(state.sessoes, outro.sessoes, 'sessoesNovas', 'sessoesAtualizadas');
      juntar(state.cobrancas, outro.cobrancas, 'cobrancasNovas', 'cobrancasAtualizadas');
      gravar();
      return resumo;
    },

    /* Apaga só este aparelho. Não gera exclusões: com a nuvem ligada, zerar
       não pode virar "apagar tudo em todo lugar" por um toque errado. */
    zerar: function () { state = vazio(); gravar(); },

    tamanhoBytes: function () {
      try { return (localStorage.getItem(KEY) || '').length; } catch (e) { return 0; }
    }
  };
})();
