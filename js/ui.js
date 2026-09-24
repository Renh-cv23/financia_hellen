/* =========================================================================
   ui.js — primitivas de interface (modal, toast, confirmação, navegação).
   Mantém as telas livres de manipulação repetida de DOM.
   ========================================================================= */
var UI = (function () {
  var modal, corpoModal, tituloModal, toastEl, toastTimer, aoFechar = null;

  function iniciar() {
    modal = document.getElementById('modal');
    corpoModal = document.getElementById('modal-body');
    tituloModal = document.getElementById('modal-title');
    toastEl = document.getElementById('toast');

    modal.addEventListener('click', function (e) {
      if (e.target.hasAttribute('data-close')) fecharModal();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !modal.hidden) fecharModal();
    });
  }

  function abrirModal(titulo, html, depoisDeAbrir) {
    tituloModal.textContent = titulo;
    corpoModal.innerHTML = html;
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
    if (depoisDeAbrir) depoisDeAbrir(corpoModal);
    var primeiro = corpoModal.querySelector('input,select,textarea');
    if (primeiro && window.matchMedia('(min-width:860px)').matches) primeiro.focus();
  }

  function fecharModal() {
    modal.hidden = true;
    corpoModal.innerHTML = '';
    document.body.style.overflow = '';
    if (aoFechar) { var f = aoFechar; aoFechar = null; f(); }
  }

  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.hidden = true; }, 3200);
  }

  /* Confirmação em modal (window.confirm some em alguns navegadores de celular
     e não segue o tema). Callback só dispara na confirmação. */
  function confirmar(titulo, texto, rotulo, aoConfirmar, perigoso) {
    abrirModal(titulo,
      '<p class="card__text">' + texto + '</p>' +
      '<div class="btn-row">' +
        '<button class="btn btn--ghost" type="button" data-close>Cancelar</button>' +
        '<button class="btn ' + (perigoso ? 'btn--danger' : '') + '" type="button" id="ok-confirm">' + rotulo + '</button>' +
      '</div>',
      function (c) {
        c.querySelector('#ok-confirm').addEventListener('click', function () {
          fecharModal();
          aoConfirmar();
        });
      });
  }

  function vazio(titulo, texto) {
    return '<div class="empty"><strong>' + titulo + '</strong>' + texto + '</div>';
  }

  return {
    iniciar: iniciar,
    modal: abrirModal,
    fecharModal: fecharModal,
    toast: toast,
    confirmar: confirmar,
    vazio: vazio
  };
})();
