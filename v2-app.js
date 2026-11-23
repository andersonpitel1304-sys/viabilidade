// V2 dentro do app ST: exige login de Programador, busca no servidor os dados de pessoas (encarregados, supervisores,
// viabilizadores, contatos Enel) e o modelo do PI — que NÃO ficam nesta página pública — e só então roda o V2.
// Também traz a importação do V2 antigo (arquivo do botão "Exportar tudo para o app").
(function () {
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const barra = document.createElement('div');
  barra.className = 'stbar';
  barra.innerHTML = '<a href="./" class="stvolta">← App ST</a><span id="stQuem">conferindo acesso…</span>';
  document.body.insertBefore(barra, document.body.firstChild);

  function bloquear(msg) {
    const b = document.createElement('div'); b.className = 'stbloq';
    b.innerHTML = '<div><h2>Pré-APR e Programação</h2><p>' + esc(msg) + '</p><p><a class="copy" href="./">Abrir o app ST e entrar</a></p></div>';
    document.body.appendChild(b);
  }

  // ---- importação do V2 antigo ----
  function caixaImportar(onde, primeira) {
    const box = document.createElement('div');
    box.id = 'stImport'; box.className = 'stimp' + (primeira ? ' primeira' : '');
    box.innerHTML = (primeira
      ? '<b>Primeiro acesso: falta trazer os dados do V2 antigo</b><p class="meta">Sem eles o V2 não abre aqui (as listas de encarregados, supervisores e viabilizadores e o modelo do PI não ficam na página pública).</p>'
      : '<b>Trazer o histórico do V2 antigo</b>') +
      '<p class="meta">No V2 antigo (página do Claude), aba Histórico, clique em <b>Exportar tudo para o app (.json)</b>. Depois escolha o arquivo aqui. ' +
      'Só entram as Pré-APRs que ainda não existem aqui; as listas são atualizadas; o contador de IDs continua do maior número. As fotos das Pré-APRs antigas continuam no V2 antigo.</p>' +
      '<input type="file" id="stArq" accept=".json,application/json"> <span id="stImpMsg" class="meta"></span>';
    onde(box);
    $('stArq').addEventListener('change', async () => {
      const f = $('stArq').files[0]; if (!f) return;
      const msg = $('stImpMsg');
      let j; try { j = JSON.parse(await f.text()); } catch (e) { msg.textContent = 'Arquivo inválido.'; return; }
      if (!j || j.origem !== 'V2' || !Array.isArray(j.docs)) { msg.textContent = 'Este arquivo não é a exportação do V2.'; return; }
      // o documento de dados (grande, com o modelo do PI) vai sozinho; as Pré-APRs em lotes de 25
      const dados = j.docs.filter(d => /^dados\//.test(d.caminho)), resto = j.docs.filter(d => !/^dados\//.test(d.caminho));
      const lotes = dados.map(d => [d]);
      for (let i = 0; i < resto.length; i += 25) lotes.push(resto.slice(i, i + 25));
      let novos = 0, ja = 0, enviados = 0;
      try {
        for (const l of lotes) {
          enviados += l.length; msg.textContent = 'Enviando ' + enviados + ' de ' + j.docs.length + '…';
          const r = await STV2.chamar({ acao: 'v2_importar', docs: l });
          novos += r.novos; ja += r.jaExistiam;
        }
        msg.textContent = 'Pronto: ' + novos + ' novas, ' + ja + ' já existiam. Contador atualizado.' + (dados.length ? ' Listas atualizadas.' : '');
        if (primeira) { msg.textContent += ' Abrindo o V2…'; setTimeout(() => location.reload(), 1200); }
      } catch (e) { msg.textContent = 'Parou: ' + (e.message || e) + ' (' + novos + ' já enviadas; pode escolher o arquivo de novo, não duplica).'; }
      $('stArq').value = '';   // permite escolher o mesmo arquivo de novo
    });
  }

  // ---- roda o V2 (os scripts principais ficaram adiados na página) ----
  function rodarV2(d) {
    window.ST_DADOS = d;
    $('tpl-pi').textContent = d.TPL_PI || '';
    document.querySelectorAll('script[type="text/x-st-v2"]').forEach(velho => {
      const s = document.createElement('script'); s.textContent = velho.textContent; velho.replaceWith(s);
    });
  }

  if (!STV2.logado()) { bloquear('Entre no app ST com a sua senha para usar o V2.'); $('stQuem').textContent = 'sem login'; return; }
  STV2.chamar({ acao: 'ping' }).then(async r => {
    $('stQuem').textContent = r.nome + ' · ' + r.perfil;
    if (!/PROGRAMADOR|ADMIN/.test(String(r.perfil || '').toUpperCase())) { bloquear('O V2 é só para o perfil Programador. Seu perfil: ' + r.perfil + '.'); return; }
    const g = await STV2.chamar({ acao: 'v2_get', caminho: 'dados/st' });
    if (!g.existe) { caixaImportar(b => document.body.insertBefore(b, barra.nextSibling), true); return; }
    rodarV2(g.dados);
    const painel = document.querySelector('#aba-hist .panel');
    if (painel) caixaImportar(b => painel.appendChild(b), false);
  }).catch(e => {
    if (e && e.code === 'sem_login') bloquear('Sua senha não foi aceita. Entre de novo pelo app ST.');
    else { $('stQuem').textContent = 'sem conexão com o servidor'; bloquear('Sem conexão com o servidor do app. Tente de novo com sinal.'); }
  });
})();
