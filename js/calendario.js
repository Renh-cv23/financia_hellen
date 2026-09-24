/* =========================================================================
   calendario.js — leva a sessão para a agenda pessoal do celular.

   Duas saídas, porque nenhuma cobre todos os aparelhos:
     • Google Agenda: link "TEMPLATE" que abre o app já preenchido (Android/web).
     • Arquivo .ics (iCalendar, RFC 5545): funciona no iPhone, Outlook, Samsung
       Calendar e também importa no Google.

   Fuso: as horas vão como "hora local flutuante" (sem sufixo Z e sem TZID).
   É o comportamento correto aqui — a sessão é às 14h no relógio dela, e nenhum
   aparelho precisa saber converter fuso. Para o Google, que exige contexto,
   mandamos o fuso do próprio aparelho no parâmetro ctz.
   ========================================================================= */
var Calendario = (function () {

  function doisDigitos(n) { return String(n).padStart(2, '0'); }

  /* 'YYYY-MM-DD' + 'HH:MM' + minutos -> {data, hora} já somados. */
  function somarMinutos(dataISO, hora, minutos) {
    var d = Fmt.paraData(dataISO);
    var p = (hora || '00:00').split(':');
    d.setHours(+p[0], +p[1] + minutos, 0, 0);
    return { data: Fmt.paraISO(d), hora: doisDigitos(d.getHours()) + ':' + doisDigitos(d.getMinutes()) };
  }

  function carimbo(dataISO, hora) {            // 20260918T140000
    return dataISO.replace(/-/g, '') + (hora ? 'T' + hora.replace(':', '') + '00' : '');
  }

  function escapar(texto) {                    // RFC 5545 §3.3.11
    return String(texto || '')
      .replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,')
      .replace(/\r?\n/g, '\\n');
  }

  /* Linhas de no máximo 75 OCTETOS (não caracteres — 'ã' ocupa 2 bytes em UTF-8),
     continuação com espaço à esquerda. Agendas rígidas rejeitam o arquivo sem isso.
     O corte é por caractere para nunca partir uma sequência UTF-8 ao meio. */
  function octetos(texto) {
    return unescape(encodeURIComponent(texto)).length;
  }
  function dobrar(linha) {
    if (octetos(linha) <= 75) return linha;
    var partes = [], atual = '', limite = 75;
    for (var i = 0; i < linha.length; i++) {
      var ch = linha[i];
      if (octetos(atual + ch) > limite) {
        partes.push(atual);
        atual = ' ' + ch;                      // continuação começa com espaço
        limite = 75;
      } else {
        atual += ch;
      }
    }
    partes.push(atual);
    return partes.join('\r\n');
  }

  function titulo(s) {
    var p = Store.paciente(s.pacienteId);
    return 'Sessão — ' + (p ? p.nome : 'Paciente');
  }

  function descricao(s) {
    var partes = ['Valor: ' + Fmt.moeda(s.valor)];
    if (s.pago) partes.push('Pagamento já registrado');
    if (s.notas) partes.push(s.notas);
    return partes.join('\n');
  }

  function evento(s, agora) {
    var dur = Number(s.duracao) || Store.config().duracaoPadrao || 50;
    var linhas = [
      'BEGIN:VEVENT',
      // UID estável: reimportar atualiza o evento em vez de duplicar.
      'UID:' + s.id + '@financia',
      'DTSTAMP:' + agora,
      'LAST-MODIFIED:' + agora
    ];

    if (s.hora) {
      var fim = somarMinutos(s.data, s.hora, dur);
      linhas.push('DTSTART:' + carimbo(s.data, s.hora));
      linhas.push('DTEND:' + carimbo(fim.data, fim.hora));
    } else {
      // Sem horário definido vira evento de dia inteiro (DTEND é exclusivo).
      var dia = Fmt.paraData(s.data); dia.setDate(dia.getDate() + 1);
      linhas.push('DTSTART;VALUE=DATE:' + s.data.replace(/-/g, ''));
      linhas.push('DTEND;VALUE=DATE:' + Fmt.paraISO(dia).replace(/-/g, ''));
    }

    linhas.push('SUMMARY:' + escapar(titulo(s)));
    linhas.push('DESCRIPTION:' + escapar(descricao(s)));
    linhas.push('STATUS:' + (s.status === 'cancelada' ? 'CANCELLED' : 'CONFIRMED'));
    linhas.push('TRANSP:OPAQUE');

    if (s.hora) {
      linhas.push('BEGIN:VALARM', 'TRIGGER:-PT30M', 'ACTION:DISPLAY',
        'DESCRIPTION:' + escapar(titulo(s)), 'END:VALARM');
    }
    linhas.push('END:VEVENT');
    return linhas;
  }

  function ics(sessoes) {
    var agora = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    var linhas = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Financia//Consultorio//PT',
      'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'
    ];
    sessoes.forEach(function (s) { linhas = linhas.concat(evento(s, agora)); });
    linhas.push('END:VCALENDAR');
    return linhas.map(dobrar).join('\r\n') + '\r\n';
  }

  function linkGoogle(s) {
    var dur = Number(s.duracao) || Store.config().duracaoPadrao || 50;
    var datas;
    if (s.hora) {
      var fim = somarMinutos(s.data, s.hora, dur);
      datas = carimbo(s.data, s.hora) + '/' + carimbo(fim.data, fim.hora);
    } else {
      var dia = Fmt.paraData(s.data); dia.setDate(dia.getDate() + 1);
      datas = s.data.replace(/-/g, '') + '/' + Fmt.paraISO(dia).replace(/-/g, '');
    }
    var fuso = '';
    try { fuso = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) {}

    return 'https://calendar.google.com/calendar/render?action=TEMPLATE' +
      '&text=' + encodeURIComponent(titulo(s)) +
      '&dates=' + datas +
      '&details=' + encodeURIComponent(descricao(s)) +
      (fuso ? '&ctz=' + encodeURIComponent(fuso) : '');
  }

  function baixarIcs(sessoes, nome) {
    Dados.baixar(ics(sessoes), nome, 'text/calendar;charset=utf-8');
  }

  /* Modal de escolha: o aparelho decide qual caminho funciona melhor. */
  function adicionar(sessaoId) {
    var s = Store.sessao(sessaoId);
    if (!s) return;
    var p = Store.paciente(s.pacienteId);
    var dur = Number(s.duracao) || Store.config().duracaoPadrao || 50;

    UI.modal('Adicionar à minha agenda',
      '<p class="card__text">' +
        '<strong>' + Fmt.escapar(p ? p.nome : 'Sessão') + '</strong><br>' +
        Fmt.data(s.data) + ' · ' + Fmt.diaSemana(s.data) +
        (s.hora ? ' · ' + s.hora + ' (' + dur + ' min)' : ' · dia inteiro') +
      '</p>' +
      '<div class="btn-row">' +
        '<a class="btn" href="' + linkGoogle(s) + '" target="_blank" rel="noopener">📅 Google Agenda</a>' +
        '<button class="btn btn--ghost" type="button" id="btn-ics">⬇️ Baixar .ics</button>' +
      '</div>' +
      '<p class="hint">O <strong>.ics</strong> é o formato do calendário do iPhone, Outlook e Samsung: ' +
      'baixe e toque no arquivo para o evento entrar na agenda. Um lembrete de 30 minutos antes já vem junto.</p>',
      function (c) {
        c.querySelector('#btn-ics').addEventListener('click', function () {
          baixarIcs([s], 'sessao-' + s.data + '.ics');
          UI.fecharModal();
          UI.toast('Arquivo gerado. Toque nele para adicionar à agenda.');
        });
      });
  }

  /* Exporta de hoje em diante: reimportar o passado só polui a agenda. */
  function exportarFuturas() {
    var hoje = Fmt.hoje();
    var futuras = Finance.ordenar(Store.sessoes().filter(function (s) {
      return s.data >= hoje && s.status !== 'cancelada';
    }), true);

    if (!futuras.length) { UI.toast('Nenhuma sessão futura para exportar.'); return; }
    baixarIcs(futuras, 'agenda-consultorio.ics');
    UI.toast(Fmt.plural(futuras.length, 'sessão exportada', 'sessões exportadas') + '. Abra o arquivo para importar.');
  }

  return {
    ics: ics,
    linkGoogle: linkGoogle,
    adicionar: adicionar,
    exportarFuturas: exportarFuturas
  };
})();
