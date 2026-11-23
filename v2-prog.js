// ---------- V2 › passo 5: Programação na planilha 2026, dentro do próprio V2 ----------
// Usa o descritivo (tipo, projeto, serviço, zona protegida, responsável, suplente, execução prevista e data da vistoria)
// e grava pelo servidor do app (prog_dia / prog_obra / prog_gravar), com a senha de quem está logado.
// O servidor decide linha principal × sinergia, grava só as colunas digitadas e confere lendo de volta.
(function () {
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const nrm = s => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toUpperCase();
  const nobra = s => nrm(s).replace(/[^A-Z0-9]/g, '');
  const brData = iso => (iso ? iso.split('-').reverse().join('/') : '');
  const pctTxt = f => (Math.round(f * 10000) / 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 });
  function numBR(v) { if (v == null || v === '') return null; if (typeof v === 'number') return v; const n = parseFloat(String(v).replace(/%$/, '').replace(/\./g, '').replace(',', '.')); return isNaN(n) ? null : n; }
  function somaDias(iso, n) { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || '')); if (!m) return ''; const d = new Date(+m[1], +m[2] - 1, +m[3] + n); if (isNaN(d)) return '';
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  const V2 = () => window.V2PROG || null;
  let DIA = null, OBRA = null, SEL = {}, MANUAL = false, PLANO = null;

  function aviso(t, tipo) { const el = $('pgMsg'); el.hidden = !t; el.className = 'status ' + (tipo || 's-ok'); el.textContent = t || ''; }
  function msgErro(e) {
    const c = e && e.code;
    if (c === 'sem_rede') return 'Sem conexão com o servidor. Nada foi confirmado: confira a planilha antes de gravar de novo.';
    if (c === 'sem_login') return 'Sua senha do app não foi aceita. Entre de novo pelo app ST.';
    return (e && e.message) || String(e);
  }
  function projetosV2() { const v = V2(); return v ? (v.estado().PROJ || []).filter(r => nrm(r.p)) : []; }
  function encarregadoBate(grade, descr) {
    const g = nrm(grade).split(' ').filter(Boolean), d = nrm(String(descr || '').split('(')[0]).split(' ').filter(Boolean);
    return g.length > 0 && d.length > 0 && g[0] === d[0] && g.every(w => d.indexOf(w) >= 0);
  }
  function horario(forca) { const n = $('pgTurno').value === 'N'; if (forca || !$('pgIni').value) { $('pgIni').value = n ? '23:00' : '10:30'; $('pgFim').value = n ? '03:00' : '14:30'; } }
  function preencherDoDescritivo() {
    const v = V2(); if (!v) return; const st = v.estado();
    const sel = $('pgProj'), atual = sel.value; sel.innerHTML = '';
    projetosV2().forEach(r => sel.appendChild(new Option(nrm(r.p), nrm(r.p))));
    if (atual && [...sel.options].some(o => o.value === atual)) sel.value = atual;
    if (!$('pgData').value && st.dExec) $('pgData').value = st.dExec;
    const t = v.tipo(); $('pgM').value = t === 'LIVRE' ? 'LIVRE' : t;
    textosDoProjeto(); horario(false);
  }
  function textosDoProjeto() {
    const v = V2(); if (!v) return; const t = v.tipo(), p = $('pgProj').value;
    const r = projetosV2().find(x => nrm(x.p) === p);
    $('pgQ').value = t === 'LIVRE' ? 'OBRA LIVRE' : (t === 'BRA' ? v.bloqTxt() : v.zonaTxt());
    $('pgR').value = r ? nrm(r.serv) : '';
  }

  async function carregar() {
    const data = $('pgData').value, proj = $('pgProj').value, turno = $('pgTurno').value;
    if (!data) { aviso('Coloque a data da programação (vem da execução prevista do descritivo).', 's-warn'); return; }
    if (!proj) { aviso('Coloque pelo menos um projeto no descritivo.', 's-warn'); return; }
    aviso('Lendo a grade do dia e a obra…', 's-none'); $('pgBloco').hidden = true; $('pgObra').hidden = true; $('pgAlertas').innerHTML = '';
    try {
      const [d, o] = await Promise.all([STV2.chamar({ acao: 'prog_dia', data, turno }), STV2.chamar({ acao: 'prog_obra', data, turno, obra: proj })]);
      DIA = d; OBRA = o;
      SEL = {}; MANUAL = false;
      // obra já no dia: traz o % de cada turma; senão, responsável e suplente do descritivo
      o.noDia.forEach(x => d.turmas.forEach(t => { if (t.linha === x.linha || t.linhaSinergia === x.linha) SEL[t.linha] = { pct: pctTxt(x.pct), papel: 'A' }; }));
      const st = V2() ? V2().estado() : {};
      if (!o.noDia.length) [['R', st.dResp], ['S', st.dSupl]].forEach(([p, n]) => {
        if (!n) return; const t = d.turmas.find(t => encarregadoBate(t.enc, n) && livre(t).ok); if (t && !SEL[t.linha]) SEL[t.linha] = { pct: '', papel: p };
      });
      $('pgTotal').value = pctTxt(o.saldo);
      horario(false);
      $('pgOnde').textContent = d.aba + ' · ' + brData(d.data) + ' · grava como ' + d.programador + (d.programadorNaLista ? '' : ' (FORA da lista de programadores da planilha)');
      aviso('');
      desenharObra(); desenharTurmas(); $('pgBloco').hidden = false;
      if (!o.noDia.length && Object.keys(SEL).length) dividir(true);
    } catch (e) { DIA = null; OBRA = null; aviso(msgErro(e), 's-warn'); }
  }

  function limiteDia() {   // % que ainda cabe no dia: saldo (sem este dia) menos as linhas do dia que não serão regravadas
    if (!OBRA || !DIA) return null;
    const alvos = {};
    Object.keys(SEL).forEach(k => DIA.turmas.forEach(t => { if (String(t.linha) === k) { alvos[t.linha] = 1; if (t.linhaSinergia) alvos[t.linhaSinergia] = 1; } }));
    const fica = OBRA.noDia.reduce((s, x) => s + (alvos[x.linha] ? 0 : x.pct), 0);
    return Math.max(0, (OBRA.saldo - fica) * 100);
  }
  const soma = () => Object.values(SEL).reduce((s, x) => s + (numBR(x.pct) || 0), 0);
  function alertas() {
    const A = OBRA.alertas.map(a => [a.nivel === 'ALTO' ? 'ALTO' : (a.nivel === 'BAIXO' ? 'BAIXO' : 'MÉDIO'), a.msg]);
    const v = V2(), st = v ? v.estado() : {};
    const vi = somaDias(st.dApr, 45);
    if (vi) { if (vi < DIA.data) A.push(['ALTO', 'Pré-APR vence em ' + brData(vi) + ', antes da data programada.']); }
    else A.push(['ALTO', 'Descritivo sem data da vistoria (Pré-APR) válida.']);
    const ids = v ? v.idmap() : {}; if (!Object.keys(ids).some(k => nobra(k.split('|')[0]) === nobra(OBRA.obra.obra))) A.push(['MÉDIO', 'Este projeto ainda não tem ID de Pré-APR gerado nesta tela.']);
    const lim = limiteDia(), sm = soma(), tot = numBR($('pgTotal').value) || 0;
    if (lim !== null && sm > lim + 0.005) A.push(['ALTO', 'ACIMA DO SALDO: o dia ficaria com ' + sm.toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + '% e a obra só tem ' + lim.toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + '% para programar.']);
    if (Object.keys(SEL).length && Math.abs(sm - tot) > 0.005) A.push(['ALTO', 'Soma das turmas (' + sm.toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + '%) diferente do % da obra a programar (' + tot.toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + '%).']);
    if (!$('pgQ').value.trim() && $('pgM').value !== 'LIVRE') A.push(['MÉDIO', 'Equipamento a desligar (zona protegida) vazio.']);
    return A;
  }
  function desenharAlertas() { if (OBRA && DIA) $('pgAlertas').innerHTML = alertas().map(([n, t]) => `<p class="status ${n === 'ALTO' ? 's-bad' : n === 'MÉDIO' ? 's-warn' : 's-none'}">${esc(t)}</p>`).join(''); }
  function desenharObra() {
    const o = OBRA, el = $('pgObra'); el.hidden = false;
    el.innerHTML = `<b>${esc(o.obra.obra)}</b> · executado ${pctTxt(o.obra.pctExec || 0)}% · programado em outras datas ${pctTxt(o.progFuturo)}% · <b>saldo ${pctTxt(o.saldo)}%</b>` +
      (o.futuras.length ? `<br><span class="dtip">Outras datas: ${o.futuras.map(r => esc(brData(r.data).slice(0, 5) + (r.turno === 'N' ? ' (noite) ' : ' ') + r.cod + ' ' + pctTxt(r.pct) + '%')).join(' · ')}</span>` : '');
    desenharAlertas();
  }
  function livre(t) {
    const a = OBRA ? nobra(OBRA.obra.obra) : '';
    if (a && nobra(t.principal.obra) === a) return { ok: true, txt: 'já tem esta obra' };
    if (a && t.sinergia && nobra(t.sinergia.obra) === a) return { ok: true, txt: 'já tem esta obra (sinergia)' };
    if (!t.principal.obra) return { ok: true, txt: 'livre' };
    if (t.linhaSinergia && !t.sinergia.obra) return { ok: true, txt: 'tem ' + t.principal.obra + ' → vai na sinergia' };
    return { ok: false, txt: 'cheia: ' + t.principal.obra + (t.sinergia && t.sinergia.obra ? ' + ' + t.sinergia.obra : '') };
  }
  function desenharTurmas() {
    const box = $('pgTurmas'); let vagas = 0;
    box.innerHTML = DIA.turmas.map(t => {
      const l = livre(t); if (l.ok) vagas++; const s = SEL[t.linha];
      return `<div class="pgt${l.ok ? '' : ' cheia'}" data-l="${t.linha}"><input type="checkbox" ${s ? 'checked' : ''} ${l.ok ? '' : 'disabled'} aria-label="${esc(t.cod + ' ' + t.enc)}">` +
        `<span class="pgn"><b>${esc(t.cod)} · ${esc(t.enc)}</b><small>${esc((t.sup ? t.sup + ' · ' : '') + l.txt)}</small></span>` +
        `<select ${s ? '' : 'disabled'}>${['R', 'S', 'A'].map(p => `<option ${s && s.papel === p ? 'selected' : ''}>${p}</option>`).join('')}</select>` +
        `<input class="pgp" inputmode="decimal" placeholder="%" value="${esc(s ? s.pct : '')}" ${s ? '' : 'disabled'}></div>`;
    }).join('');
    $('pgResumo').textContent = DIA.turmas.length + ' turmas · ' + vagas + ' com vaga';
    mostraSoma();
  }
  function mostraSoma() {
    const el = $('pgSoma'), sm = soma(), tot = numBR($('pgTotal').value) || 0, n = Object.keys(SEL).length, dif = n && Math.abs(sm - tot) > 0.005;
    const lim = limiteDia(), acima = lim !== null && sm > lim + 0.005;
    el.textContent = 'Soma das turmas: ' + sm.toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + '% de ' + tot.toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + '% a programar' +
      (MANUAL ? ' · divisão manual ("Dividir pelos pesos" volta ao automático)' : ' · divisão automática pelos pesos') + (dif ? ' · NÃO FECHA com o total' : '') +
      (acima ? ' · ACIMA do saldo (máx. ' + lim.toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + '% neste dia)' : '');
    el.className = dif || acima ? 'status s-bad' : 'dtip'; desenharAlertas();
  }
  function dividir(quieto) {
    MANUAL = false; const ks = Object.keys(SEL); if (!ks.length) { desenharTurmas(); if (!quieto) aviso('Marque as turmas primeiro.', 's-warn'); return; }
    const tot = numBR($('pgTotal').value) || 0;
    const ps = ks.map(k => (DIA.turmas.find(t => String(t.linha) === k) || {}).peso || 1), sp = ps.reduce((a, b) => a + b, 0);
    let ac = 0; ks.forEach((k, i) => { const v = i === ks.length - 1 ? Math.round((tot - ac) * 100) / 100 : Math.round(tot * ps[i] / sp * 100) / 100; ac += v; SEL[k].pct = v.toLocaleString('pt-BR', { maximumFractionDigits: 2 }); });
    desenharTurmas();
  }

  $('pgCarregar').addEventListener('click', () => { preencherDoDescritivo(); carregar(); });
  $('pgProj').addEventListener('change', () => { textosDoProjeto(); if (DIA) carregar(); });
  $('pgTurno').addEventListener('change', () => { horario(true); if (DIA) carregar(); });
  $('pgData').addEventListener('change', () => { if (DIA) carregar(); });
  $('pgTurmas').addEventListener('change', e => {
    const d = e.target.closest('.pgt'); if (!d) return; const l = +d.dataset.l;
    if (e.target.type === 'checkbox') { if (e.target.checked) { const n = Object.keys(SEL).length; SEL[l] = { pct: '', papel: n === 0 ? 'R' : n === 1 ? 'S' : 'A' }; } else delete SEL[l]; if (!MANUAL) dividir(true); else desenharTurmas(); }
    else if (e.target.tagName === 'SELECT' && SEL[l]) SEL[l].papel = e.target.value;
  });
  $('pgTurmas').addEventListener('input', e => { const d = e.target.closest('.pgt'); if (d && e.target.classList.contains('pgp') && SEL[+d.dataset.l]) { SEL[+d.dataset.l].pct = e.target.value; MANUAL = true; mostraSoma(); } });
  $('pgDividir').addEventListener('click', () => dividir(false));
  $('pgTotal').addEventListener('input', () => { if (!MANUAL) dividir(true); else mostraSoma(); });
  ['pgQ', 'pgM'].forEach(id => $(id).addEventListener('input', desenharAlertas));

  // ---- gravação: confirma na tela; acima do saldo exige marcar a caixa ----
  $('pgGravar').addEventListener('click', () => {
    if (!DIA || !OBRA) return;
    if (!$('pgIni').value || !$('pgFim').value) { aviso('Coloque os horários.', 's-warn'); return; }
    const itens = Object.keys(SEL).map(k => ({ t: DIA.turmas.find(t => String(t.linha) === k), pct: numBR(SEL[k].pct) || 0, papel: SEL[k].papel })).filter(x => x.t && x.pct > 0);
    if (!itens.length) { aviso('Marque ao menos uma turma com %.', 's-warn'); return; }
    const lim = limiteDia(), sm = itens.reduce((s, x) => s + x.pct, 0), acima = lim !== null && sm > lim + 0.005;
    PLANO = { itens, acima };
    const A = alertas();
    $('pgConfTxt').innerHTML = `Gravar <b>${esc(OBRA.obra.obra)}</b> em <b>${esc(brData(DIA.data))}</b> (${esc(DIA.aba)}) para ${itens.length} turma(s): ` +
      itens.map(x => esc(x.t.cod + ' ' + x.papel + ' ' + x.pct.toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + '%')).join(', ') + '.' +
      (A.length ? '<br><br><b>Alertas:</b><br>' + A.map(a => '• ' + esc(a[1])).join('<br>') : '');
    $('pgAcimaBox').hidden = !acima; $('pgAcimaOk').checked = false;
    $('pgConf').hidden = false; $('pgGravar').disabled = true;
  });
  $('pgVolta').addEventListener('click', () => { $('pgConf').hidden = true; $('pgGravar').disabled = false; PLANO = null; });
  $('pgOk').addEventListener('click', async () => {
    if (!PLANO) return;
    if (PLANO.acima && !$('pgAcimaOk').checked) { aviso('Acima do saldo: marque a confirmação ou ajuste o %.', 's-warn'); return; }
    const b = $('pgOk'); b.disabled = true; $('pgVolta').disabled = true; const res = $('pgRes'); res.innerHTML = '<p class="status s-none">Gravando na planilha…</p>';
    try {
      const r = await STV2.chamar({ acao: 'prog_gravar', data: DIA.data, turno: DIA.turno, obra: OBRA.obra.obra,
        itens: PLANO.itens.map(x => ({ linha: x.t.linha, pct: x.pct, papel: x.papel })),
        m: $('pgM').value, q: $('pgQ').value.trim(), r: $('pgR').value.trim(), inicio: $('pgIni').value, fim: $('pgFim').value, acimaSaldo: PLANO.acima });
      res.innerHTML = (r.gravadas || []).map(g => `<p class="status ${g.ok ? 's-ok' : 's-bad'}">${g.ok ? '✓' : '✗'} ${esc(g.cod + ' ' + g.enc)} · ${pctTxt(g.pct)}% · linha ${g.linha}${g.sinergia ? ' (sinergia)' : ''}</p>`).join('') +
        `<p class="status s-ok">Gravado na aba ${esc(r.aba)}.</p>`;
    } catch (e) {
      res.innerHTML = `<p class="status s-bad">${esc(msgErro(e))}</p>`;
    }
    $('pgConf').hidden = true; b.disabled = false; $('pgVolta').disabled = false; $('pgGravar').disabled = false; PLANO = null;
    const guarda = res.innerHTML; await carregar(); $('pgRes').innerHTML = guarda;
  });

  setTimeout(() => { try { preencherDoDescritivo(); } catch (e) {} }, 800);
  window.addEventListener('focus', () => { if (!DIA) try { preencherDoDescritivo(); } catch (e) {} });
})();
