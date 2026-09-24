/* =========================================================================
   app.js — inicialização, navegação entre telas e tema.
   Toda mutação no Store dispara um re-render da tela ativa: um único caminho
   de atualização, sem estado de UI espalhado.
   ========================================================================= */
var App = (function () {
  var TEMA_KEY = 'financia_tema';
  var viewAtual = 'painel';

  var renderers = {
    painel: function () { Painel.render(); },
    agenda: function () { Sessoes.render(); },
    pacientes: function () { Pacientes.render(); },
    cobrancas: function () { Cobrancas.render(); },
    dados: function () { Dados.render(); }
  };

  function mostrar(view) {
    viewAtual = view;
    document.querySelectorAll('.view').forEach(function (el) {
      el.classList.toggle('is-active', el.id === 'view-' + view);
    });
    document.querySelectorAll('.nav__item').forEach(function (b) {
      b.classList.toggle('is-active', b.dataset.view === view);
    });
    document.getElementById('fab').hidden = (view === 'dados');
    // Hash na URL: recarregar a página (ou voltar) mantém a aba aberta.
    if (location.hash.slice(1) !== view) history.replaceState(null, '', '#' + view);
    Charts.esconderTip();
    window.scrollTo({ top: 0, behavior: 'auto' });
    renderers[view]();
  }

  function aplicarTema(modo) {
    document.documentElement.setAttribute('data-theme', modo);
    document.getElementById('btn-tema').textContent = modo === 'dark' ? '☀️' : '🌙';
    // O canvas não herda CSS: precisa ser redesenhado com os tokens do novo tema.
    requestAnimationFrame(function () { Charts.redesenhar(); });
  }

  function iniciarTema() {
    var salvo = null;
    try { salvo = localStorage.getItem(TEMA_KEY); } catch (e) {}
    var inicial = salvo || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    aplicarTema(inicial);

    document.getElementById('btn-tema').addEventListener('click', function () {
      var novo = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      try { localStorage.setItem(TEMA_KEY, novo); } catch (e) {}
      aplicarTema(novo);
    });
  }

  function iniciarTabelas() {
    document.querySelectorAll('[data-table-toggle]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var alvo = document.getElementById(btn.dataset.tableToggle + '-table');
        alvo.hidden = !alvo.hidden;
        btn.textContent = alvo.hidden ? 'Tabela' : 'Gráfico';
      });
    });
  }

  function iniciar() {
    UI.iniciar();   // primitivas antes do Store: um erro de gravação já consegue avisar
    Store.init();
    Sessoes.iniciar();
    Pacientes.iniciar();
    Cobrancas.iniciar();
    Painel.iniciar();
    Dados.iniciar();
    Sync.iniciar();
    iniciarTema();
    iniciarTabelas();

    document.getElementById('nav').addEventListener('click', function (e) {
      var btn = e.target.closest('.nav__item');
      if (btn) mostrar(btn.dataset.view);
    });

    document.getElementById('btn-ver-agenda').addEventListener('click', function () { mostrar('agenda'); });

    // O + é contextual: na aba de pacientes cadastra paciente; nas demais, sessão.
    document.getElementById('fab').addEventListener('click', function () {
      if (viewAtual === 'pacientes') Pacientes.formulario();
      else if (viewAtual === 'cobrancas') Cobrancas.formulario();
      else Sessoes.formulario();
    });

    Store.onChange(function () { renderers[viewAtual](); });

    var s = Store.get();
    document.getElementById('topbar-sub').textContent =
      s.pacientes.length + ' pacientes · ' + s.sessoes.length + ' sessões';
    Store.onChange(function (st) {
      document.getElementById('topbar-sub').textContent =
        st.pacientes.length + ' pacientes · ' + st.sessoes.length + ' sessões';
    });

    var inicial = location.hash.slice(1);
    mostrar(renderers[inicial] ? inicial : 'painel');
  }

  document.addEventListener('DOMContentLoaded', iniciar);

  return { mostrar: mostrar };   // usado pelos atalhos entre telas
})();
