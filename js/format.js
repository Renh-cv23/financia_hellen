/* =========================================================================
   format.js — formatação e datas.
   Datas são sempre strings 'YYYY-MM-DD' e nunca passam por new Date(str):
   o parser trataria a string como UTC e, em UTC-3, 2026-01-05 viraria 04/01.
   Toda conversão aqui monta a data com os componentes locais.
   ========================================================================= */
var Fmt = (function () {
  var MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  // Abreviado para eixo de gráfico; por extenso para título e texto corrido.
  var MESES_EXTENSO = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
                       'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  var DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

  function paraData(iso) {                       // 'YYYY-MM-DD' -> Date local
    if (!iso) return null;
    var p = iso.split('-');
    return new Date(+p[0], +p[1] - 1, +p[2]);
  }
  function paraISO(d) {                          // Date -> 'YYYY-MM-DD'
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var dia = String(d.getDate()).padStart(2, '0');
    return d.getFullYear() + '-' + m + '-' + dia;
  }

  return {
    paraData: paraData,
    paraISO: paraISO,
    hoje: function () { return paraISO(new Date()); },
    mesAtual: function () { return this.hoje().slice(0, 7); },

    moeda: function (v) {
      return (Number(v) || 0).toLocaleString('pt-BR', {
        style: 'currency', currency: 'BRL', minimumFractionDigits: 2
      });
    },
    moedaCurta: function (v) {                   // rótulos de eixo
      v = Number(v) || 0;
      if (Math.abs(v) >= 1000) return (v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + 'k';
      return String(Math.round(v));
    },

    data: function (iso) {
      var d = paraData(iso);
      if (!d) return '—';
      return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' + d.getFullYear();
    },
    dataCurta: function (iso) {
      var d = paraData(iso);
      if (!d) return '—';
      return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0');
    },
    diaSemana: function (iso) {
      var d = paraData(iso);
      return d ? DIAS[d.getDay()] : '';
    },
    mesRotulo: function (ym) {                   // '2026-03' -> 'mar/26'
      var p = ym.split('-');
      return MESES[+p[1] - 1] + '/' + p[0].slice(2);
    },
    mesExtenso: function (ym) {
      var p = ym.split('-');
      return MESES_EXTENSO[+p[1] - 1] + ' de ' + p[0];
    },

    idade: function (nascimento) {
      var d = paraData(nascimento);
      if (!d) return null;
      var hoje = new Date();
      var anos = hoje.getFullYear() - d.getFullYear();
      var m = hoje.getMonth() - d.getMonth();
      if (m < 0 || (m === 0 && hoje.getDate() < d.getDate())) anos--;
      return anos;
    },

    telefone: function (t) {
      var d = String(t || '').replace(/\D/g, '');
      if (d.length === 11) return '(' + d.slice(0, 2) + ') ' + d.slice(2, 7) + '-' + d.slice(7);
      if (d.length === 10) return '(' + d.slice(0, 2) + ') ' + d.slice(2, 6) + '-' + d.slice(6);
      return t || '';
    },
    whatsapp: function (t) {
      var d = String(t || '').replace(/\D/g, '');
      if (d.length < 10) return null;
      return 'https://wa.me/55' + d;
    },

    plural: function (n, singular, plural) {
      return n + ' ' + (n === 1 ? singular : plural);
    },

    escapar: function (s) {                      // defesa contra HTML em campo digitado
      return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }
  };
})();
