/* =========================================================================
   dados.js — backup, importação e ajustes.
   Fluxo alvo: usar no celular, baixar o .json, importar no notebook (e vice-versa).
   ========================================================================= */
var Dados = (function () {

  function baixar(conteudo, nome, tipo) {
    var blob = new Blob([conteudo], { type: tipo });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = nome;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function nomeArquivo(ext) {
    var d = new Date();
    var ts = d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0') +
             '-' + String(d.getHours()).padStart(2, '0') + String(d.getMinutes()).padStart(2, '0');
    return 'financia-backup-' + ts + '.' + ext;
  }

  /* CSV do financeiro: uma linha por cobrança, que é a unidade que a
     contabilidade entende (mensalidade, parcela ou sessão avulsa). */
  function exportarCSV() {
    var cab = ['vencimento', 'competencia', 'paciente', 'telefone', 'plano', 'descricao',
               'valor', 'pago', 'data_pagamento', 'forma', 'origem'];
    var linhas = Finance.ordenarCobrancas(Store.cobrancas(), true).map(function (c) {
      var p = Store.paciente(c.pacienteId);
      return [
        c.vencimento, c.competencia, p ? p.nome : '', p ? Fmt.telefone(p.telefone) : '',
        p ? Planos.plano(p).tipo : '', c.descricao,
        String(c.valor).replace('.', ','),           // separador decimal pt-BR para abrir no Excel
        c.pago ? 'sim' : 'nao', c.dataPagamento, c.metodo, c.origem
      ].map(function (v) { return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'; }).join(';');
    });
    // BOM para o Excel reconhecer o UTF-8 e não quebrar acentos.
    baixar('﻿' + cab.join(';') + '\n' + linhas.join('\n'), nomeArquivo('csv'), 'text/csv;charset=utf-8');
    UI.toast('CSV do financeiro gerado.');
  }

  function lerArquivo(input, aoLer) {
    var arq = input.files && input.files[0];
    if (!arq) return;
    var leitor = new FileReader();
    leitor.onload = function () {
      try {
        var dados = JSON.parse(leitor.result);
        if (!dados || (!dados.pacientes && !dados.sessoes && !dados.cobrancas)) throw new Error('formato');
        aoLer(dados);
      } catch (e) {
        UI.toast('Arquivo inválido. Use um backup gerado por este app.');
      }
      input.value = '';                               // permite reimportar o mesmo arquivo
    };
    leitor.onerror = function () { UI.toast('Não foi possível ler o arquivo.'); input.value = ''; };
    leitor.readAsText(arq);
  }

  function infoArmazenamento() {
    var kb = (Store.tamanhoBytes() / 1024).toFixed(1);
    var s = Store.get();
    document.getElementById('info-armazenamento').innerHTML =
      '<dt>Pacientes</dt><dd>' + s.pacientes.length + '</dd>' +
      '<dt>Sessões</dt><dd>' + s.sessoes.length + '</dd>' +
      '<dt>Cobranças</dt><dd>' + s.cobrancas.length + '</dd>' +
      '<dt>Espaço usado</dt><dd>' + kb + ' KB</dd>' +
      '<dt>Última alteração</dt><dd>' + new Date(s.atualizadoEm).toLocaleString('pt-BR') + '</dd>';
  }

  function iniciar() {
    document.getElementById('btn-export').addEventListener('click', function () {
      baixar(Store.exportar(), nomeArquivo('json'), 'application/json');
      UI.toast('Backup baixado. Guarde em local seguro.');
    });
    document.getElementById('btn-export-csv').addEventListener('click', exportarCSV);
    document.getElementById('btn-export-ics').addEventListener('click', Calendario.exportarFuturas);

    document.getElementById('in-merge').addEventListener('change', function () {
      var input = this;
      lerArquivo(input, function (dados) {
        var r = Store.mesclar(dados);
        UI.toast('Mesclado: ' + r.pacientesNovos + ' pacientes, ' + r.sessoesNovas + ' sessões e ' +
                 r.cobrancasNovas + ' cobranças novas; ' +
                 (r.pacientesAtualizados + r.sessoesAtualizadas + r.cobrancasAtualizadas) + ' atualizados.');
      });
    });

    document.getElementById('in-replace').addEventListener('change', function () {
      var input = this;
      lerArquivo(input, function (dados) {
        UI.confirmar('Substituir todos os dados',
          'Os dados atuais deste aparelho serão apagados e trocados pelo conteúdo do arquivo.' +
          (Sync.conectado() ? ' Como a nuvem está ligada, a troca vale também para os outros aparelhos.' : '') +
          ' Continuar?',
          'Substituir', function () { Store.substituir(dados); UI.toast('Dados substituídos.'); }, true);
      });
    });

    document.getElementById('btn-zerar').addEventListener('click', function () {
      // Com a nuvem ligada, a próxima sincronização traria tudo de volta; por
      // isso apagar também desconecta o aparelho (a cópia da nuvem fica intacta).
      var nuvem = Sync.conectado();
      UI.confirmar('Apagar todos os dados',
        'Isso remove <strong>todos</strong> os pacientes e sessões deste aparelho. Baixe um backup antes se tiver dúvida.' +
        (nuvem ? '<br><br>Este aparelho também será <strong>desconectado da nuvem</strong>; a cópia de lá não é apagada.' : ''),
        'Apagar tudo', function () {
          if (nuvem) Sync.desconectar();
          Store.zerar();
          UI.toast('Dados apagados.');
        }, true);
    });

    var cfgValor = document.getElementById('cfg-valor');
    cfgValor.value = Store.config().valorSessaoPadrao;
    cfgValor.addEventListener('change', function () {
      Store.config({ valorSessaoPadrao: Number(this.value) || 100 });
      UI.toast('Valor padrão atualizado.');
    });

    var cfgDuracao = document.getElementById('cfg-duracao');
    cfgDuracao.value = Store.config().duracaoPadrao;
    cfgDuracao.addEventListener('change', function () {
      Store.config({ duracaoPadrao: Number(this.value) || 50 });
      UI.toast('Duração padrão atualizada.');
    });
  }

  return {
    baixar: baixar,                 // reaproveitado pelo módulo de calendário
    iniciar: iniciar,
    render: function () {
      infoArmazenamento();
      Sync.render();
      document.getElementById('cfg-valor').value = Store.config().valorSessaoPadrao;
      document.getElementById('cfg-duracao').value = Store.config().duracaoPadrao;
    }
  };
})();
