/* =========================================================================
   charts.js — gráficos em canvas puro, sem biblioteca externa.

   Decisão: nenhuma dependência de CDN. O app precisa abrir no celular mesmo
   offline (e mesmo aberto direto do arquivo, sem servidor); uma lib de chart
   via CDN quebraria exatamente nesse cenário. O custo é este arquivo — aceitável
   porque são só duas formas (barra empilhada e linha).

   Regras de leitura aplicadas: um único eixo Y, malha recessiva, marcas finas
   com topo arredondado de 4px, 2px de respiro entre os segmentos empilhados,
   textura na série "a receber" (identidade não fica só na cor) e tooltip por
   toque/hover. Cada gráfico tem também uma visão em tabela no HTML.
   ========================================================================= */
var Charts = (function () {
  var registro = {};                       // id -> função de redesenho
  var tip = null;

  function tokens(el) {
    var cs = getComputedStyle(el);
    return {
      s1: cs.getPropertyValue('--series-1').trim(),
      s2: cs.getPropertyValue('--series-2').trim(),
      grid: cs.getPropertyValue('--grid').trim(),
      texto: cs.getPropertyValue('--text-secondary').trim(),
      mudo: cs.getPropertyValue('--text-muted').trim(),
      superficie: cs.getPropertyValue('--surface-1').trim()
    };
  }

  function preparar(canvas) {
    var r = canvas.getBoundingClientRect();
    var dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(r.width * dpr));
    canvas.height = Math.max(1, Math.round(r.height * dpr));
    var ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, r.width, r.height);
    return { ctx: ctx, w: r.width, h: r.height };
  }

  /* Textura da série secundária: hachura 135° gerada em canvas offscreen. */
  function padraoHachura(ctx, cor, fundo) {
    var p = document.createElement('canvas');
    p.width = p.height = 6;
    var c = p.getContext('2d');
    c.fillStyle = fundo; c.fillRect(0, 0, 6, 6);
    c.strokeStyle = cor; c.lineWidth = 2.2;
    c.beginPath(); c.moveTo(-1, 7); c.lineTo(7, -1); c.stroke();
    c.beginPath(); c.moveTo(2, 10); c.lineTo(10, 2); c.stroke();
    return ctx.createPattern(p, 'repeat');
  }

  /* Escolhe o topo do eixo a partir de um passo "redondo" (4 faixas), em vez de
     arredondar o máximo para a próxima potência: evita gráfico com metade do
     espaço vazio quando o pico é, por exemplo, 2.400. */
  var PASSOS = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
  function escalaMax(valor) {
    if (valor <= 0) return 100;
    var bruto = valor / 4;
    var mag = Math.pow(10, Math.floor(Math.log10(bruto)));
    var n = bruto / mag;
    var passo = PASSOS.filter(function (p) { return n <= p; })[0] || 10;
    return passo * mag * 4;
  }

  function retanguloTopo(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, Math.max(0, h));
    ctx.beginPath();
    ctx.moveTo(x, y + h);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h);
    ctx.closePath();
    ctx.fill();
  }

  function mostrarTip(html, x, y) {
    if (!tip) tip = document.getElementById('chart-tooltip');
    tip.innerHTML = html;
    tip.hidden = false;
    var r = tip.getBoundingClientRect();
    var left = Math.min(Math.max(8, x - r.width / 2), window.innerWidth - r.width - 8);
    var top = y - r.height - 12;
    if (top < 8) top = y + 16;
    tip.style.left = left + 'px';
    tip.style.top = top + 'px';
  }
  function esconderTip() { if (tip) tip.hidden = true; }

  /* Liga hover/toque ao índice da categoria mais próxima no eixo X. */
  function interacao(canvas, obterIndice, montarHtml) {
    if (canvas.__ligado) canvas.__ligado();
    function mover(ev) {
      var t = ev.touches ? ev.touches[0] : ev;
      var r = canvas.getBoundingClientRect();
      var i = obterIndice(t.clientX - r.left);
      if (i == null) { esconderTip(); return; }
      mostrarTip(montarHtml(i), t.clientX, r.top + 12);
      if (ev.touches) ev.preventDefault();
    }
    canvas.addEventListener('mousemove', mover);
    canvas.addEventListener('mouseleave', esconderTip);
    canvas.addEventListener('touchstart', mover, { passive: false });
    canvas.addEventListener('touchmove', mover, { passive: false });
    canvas.addEventListener('touchend', esconderTip);
    canvas.__ligado = function () {
      canvas.removeEventListener('mousemove', mover);
      canvas.removeEventListener('mouseleave', esconderTip);
      canvas.removeEventListener('touchstart', mover);
      canvas.removeEventListener('touchmove', mover);
      canvas.removeEventListener('touchend', esconderTip);
    };
  }

  function eixoY(ctx, w, pad, max, t) {
    ctx.font = '11px system-ui, sans-serif';
    ctx.fillStyle = t.mudo;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (var i = 0; i <= 4; i++) {
      var v = max * i / 4;
      var y = pad.top + (pad.alturaPlot) * (1 - i / 4);
      ctx.strokeStyle = t.grid;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(pad.left, y + .5); ctx.lineTo(w - pad.right, y + .5); ctx.stroke();
      ctx.fillText(Fmt.moedaCurta(v), pad.left - 6, y);
    }
  }

  /* --------------------------- Barra empilhada ------------------------ */
  function barras(canvas, dados) {
    var t = tokens(canvas);
    var p = preparar(canvas);
    var ctx = p.ctx, w = p.w, h = p.h;
    var pad = { left: 38, right: 8, top: 10, bottom: 26 };
    pad.alturaPlot = h - pad.top - pad.bottom;
    if (pad.alturaPlot <= 0 || w <= 0) return;

    var max = escalaMax(Math.max.apply(null, dados.map(function (d) { return d.recebido + d.aReceber; }).concat([0])));
    eixoY(ctx, w, pad, max, t);

    var larguraFaixa = (w - pad.left - pad.right) / dados.length;
    var larguraBarra = Math.min(26, larguraFaixa * 0.58);
    var hachura = padraoHachura(ctx, t.s2, t.superficie);
    var base = pad.top + pad.alturaPlot;
    var esconderAlternados = larguraFaixa < 34;   // evita colisão de rótulos no celular

    dados.forEach(function (d, i) {
      var cx = pad.left + larguraFaixa * (i + .5);
      var x = cx - larguraBarra / 2;
      var hRec = (d.recebido / max) * pad.alturaPlot;
      var hPen = (d.aReceber / max) * pad.alturaPlot;
      var topoRec = base - hRec;

      if (hRec > 0) {
        ctx.fillStyle = t.s1;
        retanguloTopo(ctx, x, topoRec, larguraBarra, hRec, hPen > 0 ? 0 : 4);
      }
      if (hPen > 0) {
        var yPen = topoRec - hPen - (hRec > 0 ? 2 : 0);   // 2px de respiro entre segmentos
        ctx.fillStyle = hachura;
        retanguloTopo(ctx, x, yPen, larguraBarra, hPen, 4);
        ctx.strokeStyle = t.s2; ctx.lineWidth = 1;
        ctx.stroke();
      }

      if (!esconderAlternados || i % 2 === 1 || i === dados.length - 1) {
        ctx.fillStyle = t.mudo;
        ctx.font = '10.5px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(Fmt.mesRotulo(d.mes), cx, base + 8);
      }
    });

    interacao(canvas,
      function (x) {
        var i = Math.floor((x - pad.left) / larguraFaixa);
        return (i >= 0 && i < dados.length) ? i : null;
      },
      function (i) {
        var d = dados[i];
        return '<b>' + Fmt.mesExtenso(d.mes) + '</b><br>' +
          'Recebido: ' + Fmt.moeda(d.recebido) + '<br>' +
          'A receber: ' + Fmt.moeda(d.aReceber) + '<br>' +
          d.sessoes + (d.sessoes === 1 ? ' sessão' : ' sessões');
      });
  }

  /* -------------------------------- Linha ----------------------------- */
  function linha(canvas, dados) {
    var t = tokens(canvas);
    var p = preparar(canvas);
    var ctx = p.ctx, w = p.w, h = p.h;
    var pad = { left: 38, right: 10, top: 12, bottom: 26 };
    pad.alturaPlot = h - pad.top - pad.bottom;
    if (pad.alturaPlot <= 0 || w <= 0) return;

    var max = escalaMax(Math.max.apply(null, dados.map(function (d) { return d.valor; }).concat([0])));
    eixoY(ctx, w, pad, max, t);

    var passo = dados.length > 1 ? (w - pad.left - pad.right) / (dados.length - 1) : 0;
    var base = pad.top + pad.alturaPlot;
    function px(i) { return pad.left + passo * i; }
    function py(v) { return base - (v / max) * pad.alturaPlot; }

    // Área suave sob a linha: reforça a leitura de acúmulo sem competir com ela.
    var grad = ctx.createLinearGradient(0, pad.top, 0, base);
    grad.addColorStop(0, t.s1 + '38');
    grad.addColorStop(1, t.s1 + '00');
    ctx.beginPath();
    ctx.moveTo(px(0), base);
    dados.forEach(function (d, i) { ctx.lineTo(px(i), py(d.valor)); });
    ctx.lineTo(px(dados.length - 1), base);
    ctx.closePath();
    ctx.fillStyle = grad; ctx.fill();

    ctx.beginPath();
    dados.forEach(function (d, i) { i ? ctx.lineTo(px(i), py(d.valor)) : ctx.moveTo(px(i), py(d.valor)); });
    ctx.strokeStyle = t.s1; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.stroke();

    // Rótulo direto no último ponto — dispensa legenda para série única.
    var ult = dados[dados.length - 1];
    ctx.beginPath();
    ctx.arc(px(dados.length - 1), py(ult.valor), 4.5, 0, Math.PI * 2);
    ctx.fillStyle = t.s1; ctx.fill();
    ctx.strokeStyle = t.superficie; ctx.lineWidth = 2; ctx.stroke();

    ctx.font = '10.5px system-ui, sans-serif';
    ctx.fillStyle = t.mudo;
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    var esconderAlternados = passo < 34;
    dados.forEach(function (d, i) {
      if (!esconderAlternados || i % 2 === 1 || i === dados.length - 1) {
        ctx.fillText(Fmt.mesRotulo(d.mes), px(i), base + 8);
      }
    });

    interacao(canvas,
      function (x) {
        if (!passo) return dados.length ? 0 : null;
        var i = Math.round((x - pad.left) / passo);
        return (i >= 0 && i < dados.length) ? i : null;
      },
      function (i) {
        return '<b>' + Fmt.mesExtenso(dados[i].mes) + '</b><br>Acumulado: ' + Fmt.moeda(dados[i].valor);
      });
  }

  /* Registra o desenho para redesenhar em resize e troca de tema. */
  function render(id, fn) {
    var canvas = document.getElementById(id);
    if (!canvas) return;
    registro[id] = function () { fn(canvas); };
    registro[id]();
    if (!canvas.__observado) {
      canvas.__observado = true;
      if (window.ResizeObserver) {
        new ResizeObserver(function () { if (registro[id]) registro[id](); }).observe(canvas.parentElement);
      } else {
        window.addEventListener('resize', function () { if (registro[id]) registro[id](); });
      }
    }
  }

  return {
    barras: function (id, dados) { render(id, function (c) { barras(c, dados); }); },
    linha: function (id, dados) { render(id, function (c) { linha(c, dados); }); },
    redesenhar: function () { Object.keys(registro).forEach(function (k) { registro[k](); }); },
    esconderTip: esconderTip
  };
})();
