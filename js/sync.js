/* =========================================================================
   sync.js — sincronização cifrada com a nuvem (Netlify Function + Blobs).

   Da senha saem, via PBKDF2, duas chaves independentes:
     token (256 bits) — prova ao servidor que é a dona dos dados;
     chave AES-GCM    — cifra o backup ANTES de sair do aparelho.
   O servidor só guarda um bloco ilegível; nem quem tiver acesso à conta da
   Netlify consegue ler paciente. A contrapartida: esquecer a senha torna a
   cópia da nuvem irrecuperável — os backups .json continuam valendo.

   Ciclo: baixa a versão da nuvem, mescla com a local (vence a edição mais
   recente, exclusões valem dos dois lados) e envia o resultado. Roda ao
   abrir o app, ao voltar para ele, ao reconectar e ~2s depois de cada edição.
   O localStorage continua sendo a cópia de trabalho: sem internet, o app
   funciona igual e sincroniza quando a rede voltar.
   ========================================================================= */
var Sync = (function () {
  var CHAVE_LOCAL = 'financia_sync';
  var URL_API = '/api/sync';
  // Precisam bater com scripts/gerar_senha.py.
  var SAL = 'financia-hellen/sync/v1';
  var ITERACOES = 600000;
  var ESPERA_MS = 2000;

  var cred = null;          // { token, chave, ultima } — persistido neste aparelho
  var chaveAES = null;      // CryptoKey importada de cred.chave
  var rodando = false, deNovo = false, timer = null, ignorarMudanca = false;
  var situacao = '', erro = '';

  function disponivel() {
    return /^https?:$/.test(location.protocol) && window.crypto && crypto.subtle;
  }

  /* ----------------------------- bytes ------------------------------ */
  function paraHex(buf) {
    return Array.prototype.map.call(new Uint8Array(buf), function (b) {
      return b.toString(16).padStart(2, '0');
    }).join('');
  }
  function deHex(hex) {
    var out = new Uint8Array(hex.length / 2);
    for (var i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
    return out;
  }
  function paraB64(buf) {
    var bytes = new Uint8Array(buf), s = '';
    for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s);
  }
  function deB64(b64) {
    var s = atob(b64), out = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
  }

  /* ----------------------------- cripto ----------------------------- */
  function normalizarSenha(senha) {
    // Teclado de celular põe maiúscula sozinho; a senha gerada é minúscula.
    return String(senha || '').trim().toLowerCase().normalize('NFC');
  }

  function derivarChaves(senha) {
    var enc = new TextEncoder();
    return crypto.subtle.importKey('raw', enc.encode(normalizarSenha(senha)), 'PBKDF2', false, ['deriveBits'])
      .then(function (base) {
        return crypto.subtle.deriveBits(
          { name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(SAL), iterations: ITERACOES }, base, 512);
      })
      .then(function (bits) {
        return { token: paraHex(bits.slice(0, 32)), chave: paraHex(bits.slice(32, 64)) };
      });
  }

  function importarChave(hex) {
    return crypto.subtle.importKey('raw', deHex(hex), 'AES-GCM', false, ['encrypt', 'decrypt']);
  }

  function cifrar(texto) {
    var iv = crypto.getRandomValues(new Uint8Array(12));
    return crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, chaveAES, new TextEncoder().encode(texto))
      .then(function (ct) { return JSON.stringify({ v: 1, iv: paraB64(iv), ct: paraB64(ct) }); });
  }

  function decifrar(env) {
    return crypto.subtle.decrypt({ name: 'AES-GCM', iv: deB64(env.iv) }, chaveAES, deB64(env.ct))
      .then(function (buf) { return JSON.parse(new TextDecoder().decode(buf)); })
      .catch(function () { throw erroDe('cifra', 'Os dados da nuvem foram cifrados com outra senha.'); });
  }

  /* ------------------------------ rede ------------------------------ */
  function erroDe(tipo, msg) { var e = new Error(msg); e.tipo = tipo; return e; }

  function requisicao(metodo, corpo) {
    return fetch(URL_API, {
      method: metodo,
      cache: 'no-store',
      headers: { 'Authorization': 'Bearer ' + cred.token, 'Content-Type': 'application/json' },
      body: corpo
    }).catch(function () {
      throw erroDe('rede', 'Sem conexão com a internet.');
    }).then(function (r) {
      if (r.status === 401) throw erroDe('senha', 'Senha não aceita pelo servidor.');
      if (r.status === 404 && metodo === 'GET') return null;
      if (r.status === 404) throw erroDe('servidor', 'Servidor de sincronização não encontrado neste endereço.');
      if (r.status === 503) throw erroDe('servidor', 'Sincronização não configurada na Netlify (SYNC_AUTH_HASH).');
      if (!r.ok) throw erroDe('servidor', 'Erro no servidor (' + r.status + ').');
      return metodo === 'GET' ? r.json() : null;
    });
  }

  function baixar() {
    return requisicao('GET').then(function (env) { return env ? decifrar(env) : null; });
  }

  function enviar() {
    return cifrar(Store.exportar()).then(function (corpo) { return requisicao('PUT', corpo); });
  }

  /* Mescla sem disparar nova sincronização: a mudança veio da própria nuvem. */
  function mesclarRemoto(remoto) {
    if (!remoto) return;
    ignorarMudanca = true;
    try { Store.mesclar(remoto); } finally { ignorarMudanca = false; }
  }

  /* ---------------------------- estado ------------------------------ */
  function persistir() {
    try {
      if (cred) localStorage.setItem(CHAVE_LOCAL, JSON.stringify(cred));
      else localStorage.removeItem(CHAVE_LOCAL);
    } catch (e) {}
  }

  function carregar() {
    try { return JSON.parse(localStorage.getItem(CHAVE_LOCAL) || 'null'); } catch (e) { return null; }
  }

  function falhou(e) {
    var novo = e && e.message ? e.message : 'Falha ao sincronizar.';
    // Sem rede é o caso comum no celular e se resolve sozinho: não merece toast.
    if (novo !== erro && (!e || e.tipo !== 'rede')) UI.toast('☁️ ' + novo);
    erro = novo;
  }

  /* --------------------------- ciclo ------------------------------- */
  function sincronizar() {
    if (!cred || !chaveAES) return Promise.resolve();
    if (rodando) { deNovo = true; return Promise.resolve(); }
    rodando = true;
    clearTimeout(timer); timer = null;
    situacao = 'Sincronizando…';
    render();

    return baixar()
      .then(mesclarRemoto)
      .then(enviar)
      .then(function () {
        cred.ultima = new Date().toISOString();
        erro = '';
        persistir();
      })
      .catch(falhou)
      .then(function () {
        rodando = false;
        situacao = '';
        render();
        if (deNovo) { deNovo = false; sincronizar(); }
      });
  }

  function agendar() {
    if (!cred || ignorarMudanca) return;
    clearTimeout(timer);
    timer = setTimeout(sincronizar, ESPERA_MS);
  }

  function conectar(senha, botao) {
    if (normalizarSenha(senha).length < 12) { UI.toast('Digite a senha completa.'); return; }
    botao.disabled = true;
    botao.textContent = 'Conectando…';

    var novo;
    derivarChaves(senha)
      .then(function (c) {
        novo = c;
        cred = c;   // provisório: requisicao() lê daqui
        return importarChave(c.chave);
      })
      .then(function (k) { chaveAES = k; return baixar(); })
      .then(function (remoto) {
        mesclarRemoto(remoto);
        return enviar();
      })
      .then(function () {
        cred = { token: novo.token, chave: novo.chave, ultima: new Date().toISOString() };
        erro = '';
        persistir();
        UI.toast('☁️ Aparelho conectado. Os dados agora sincronizam sozinhos.');
        render();
      })
      .catch(function (e) {
        var chaveNova = chaveAES;
        cred = null; chaveAES = null;   // nada sincroniza até a conexão se confirmar
        if (e && e.tipo === 'cifra') {
          // Senha trocada no servidor: a cópia antiga não abre mais com a nova chave.
          UI.confirmar('Senha diferente da cópia na nuvem',
            'A senha foi aceita, mas os dados guardados na nuvem foram cifrados com uma senha anterior e ' +
            'não podem ser lidos. Deseja <strong>substituir a cópia da nuvem</strong> pelos dados deste aparelho?',
            'Substituir cópia da nuvem', function () {
              cred = novo; chaveAES = chaveNova;
              enviar().then(function () {
                cred = { token: novo.token, chave: novo.chave, ultima: new Date().toISOString() };
                persistir();
                UI.toast('☁️ Nuvem atualizada com os dados deste aparelho.');
                render();
              }).catch(function (e2) { cred = null; chaveAES = null; falhou(e2); render(); });
            }, true);
          return;
        }
        UI.toast('☁️ ' + (e && e.message ? e.message : 'Não foi possível conectar.'));
      })
      .then(function () {
        botao.disabled = false;
        botao.textContent = 'Conectar';
      });
  }

  function desconectar() {
    clearTimeout(timer);
    cred = null; chaveAES = null; erro = '';
    persistir();
    render();
  }

  /* ------------------------------ tela ------------------------------ */
  function render() {
    var el = document.getElementById('nuvem');
    if (!el) return;

    if (!disponivel()) {
      el.innerHTML = '<p class="hint">Disponível só pelo endereço publicado na Netlify ' +
        '(aberto direto do arquivo, o app não alcança o servidor).</p>';
      return;
    }

    if (!cred || !chaveAES) {
      // Não redesenha o formulário por cima do que está sendo digitado.
      if (el.querySelector('#nuvem-senha')) return;
      el.innerHTML =
        '<p class="card__text">Guarda uma cópia <strong>cifrada</strong> dos dados na nuvem e mantém ' +
        'celular e notebook iguais, sem precisar baixar e importar arquivo.</p>' +
        '<form id="nuvem-form">' +
          '<label class="field"><span>Senha da sincronização</span>' +
            '<input type="password" id="nuvem-senha" autocomplete="current-password" autocapitalize="off" ' +
            'spellcheck="false" placeholder="xxxx-xxxx-xxxx-xxxx-xxxx"></label>' +
          '<div class="btn-row" style="margin-top:12px"><button class="btn" type="submit" id="nuvem-conectar">Conectar</button></div>' +
        '</form>' +
        '<p class="hint">Os dados são cifrados neste aparelho antes de sair; o servidor não consegue lê-los. ' +
        'Por isso, <strong>sem a senha não há como recuperar</strong> a cópia da nuvem.</p>';
      el.querySelector('#nuvem-form').addEventListener('submit', function (ev) {
        ev.preventDefault();
        conectar(el.querySelector('#nuvem-senha').value, el.querySelector('#nuvem-conectar'));
      });
      return;
    }

    var ultima = cred.ultima ? new Date(cred.ultima).toLocaleString('pt-BR') : 'nunca';
    var estado = situacao || (erro ? '⚠ ' + erro : '✓ Em dia');
    el.innerHTML =
      '<dl class="kv">' +
        '<dt>Situação</dt><dd>' + Fmt.escapar(estado) + '</dd>' +
        '<dt>Última sincronização</dt><dd>' + Fmt.escapar(ultima) + '</dd>' +
      '</dl>' +
      '<div class="btn-row" style="margin-top:14px">' +
        '<button class="btn" type="button" id="nuvem-agora"' + (rodando ? ' disabled' : '') + '>🔄 Sincronizar agora</button>' +
        '<button class="btn btn--ghost" type="button" id="nuvem-sair">Desconectar este aparelho</button>' +
      '</div>' +
      '<p class="hint">Desconectar só esquece a senha aqui: os dados continuam neste aparelho e na nuvem.</p>';
    el.querySelector('#nuvem-agora').addEventListener('click', sincronizar);
    el.querySelector('#nuvem-sair').addEventListener('click', function () {
      UI.confirmar('Desconectar este aparelho',
        'Este aparelho deixa de sincronizar. Para voltar, será preciso digitar a senha de novo.',
        'Desconectar', function () { desconectar(); UI.toast('Aparelho desconectado da nuvem.'); });
    });
  }

  function iniciar() {
    Store.onChange(agendar);
    if (!disponivel()) { render(); return; }

    var salvo = carregar();
    if (salvo && salvo.token && salvo.chave) {
      cred = salvo;
      importarChave(cred.chave).then(function (k) { chaveAES = k; sincronizar(); })
        .catch(function () { desconectar(); });
    }

    window.addEventListener('online', sincronizar);
    document.addEventListener('visibilitychange', function () {
      // Ao voltar para o app, traz o que foi feito no outro aparelho.
      if (document.visibilityState === 'visible') sincronizar();
      // Ao sair com edição pendente, tenta enviar antes de o sistema congelar a aba.
      else if (timer) sincronizar();
    });
    render();
  }

  return {
    iniciar: iniciar,
    render: render,
    sincronizar: sincronizar,
    conectado: function () { return !!cred; },
    desconectar: desconectar
  };
})();
