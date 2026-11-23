// Ponte do V2 (Pré-APR e Programação) dentro do app ST.
// O V2 foi feito para rodar numa página do Claude e pedia quatro recursos: banco (db), fotos (assets),
// download (downloads) e usuário (user). Aqui os quatro são atendidos pelo servidor do app (Apps Script),
// com a senha de quem está logado no app. O código do V2 continua o mesmo.
(function () {
  var SERVIDOR = 'https://script.google.com/macros/s/AKfycbz8hmbLMHaEJj7Secv24elyApKVqVyBFqDzCiaI7iE1ckiFRSueBUvV5X5NlD265V-Y/exec';
  function token() { try { return localStorage.getItem('token'); } catch (e) { return null; } }

  async function chamar(corpo, tentativa) {
    corpo.token = token();
    var r;
    try {
      r = await fetch(SERVIDOR, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(corpo) });
    } catch (e) {
      if (!tentativa) { await new Promise(function (ok) { setTimeout(ok, 1500); }); return chamar(corpo, 1); }   // sinal caiu: uma nova tentativa
      var x = new Error('Sem conexão com o servidor do app.'); x.code = 'sem_rede'; throw x;
    }
    var j = await r.json();
    if (!j.ok) { var er = new Error(j.erro || 'Erro no servidor'); er.code = j.codigo || (j.erro === 'Senha inválida' ? 'sem_login' : 'servidor'); throw er; }
    return j;
  }
  function copia(o) { return o == null ? undefined : JSON.parse(JSON.stringify(o)); }
  function snap(id, dados, existe) { return { id: id, exists: !!existe, data: function () { return copia(dados); } }; }

  var db = {
    doc: function (caminho) {
      return {
        get: async function () { var r = await chamar({ acao: 'v2_get', caminho: caminho }); return snap(caminho.split('/')[1], r.dados, r.existe); },
        set: async function (o) { await chamar({ acao: 'v2_set', caminho: caminho, dados: copia(o) }); },
        update: async function (o) { await chamar({ acao: 'v2_update', caminho: caminho, dados: copia(o) }); },
        // A trava do contador agora é do servidor (STV2.alocar). Mantido para compatibilidade.
        acquire: async function () { return { acquired: true }; }
      };
    },
    collection: function (col) {
      var q = { acao: 'v2_lista', colecao: col };
      var b = {
        orderBy: function (campo, dir) { q.ordem = dir === 'desc' ? 'desc' : 'asc'; return b; },
        limit: function (n) { q.limite = n; return b; },
        where: function (campo, op, valor) { q.onde = { campo: campo, valor: valor }; return b; },
        get: async function () {
          var r = await chamar(q);
          var docs = r.docs.map(function (d) { return snap(d.id, d.dados, true); });
          return { docs: docs, size: docs.length, empty: !docs.length };
        }
      };
      return b;
    }
  };

  function base64(bytes) {
    var s = '', n = 0x8000;
    for (var i = 0; i < bytes.length; i += n) s += String.fromCharCode.apply(null, bytes.subarray(i, i + n));
    return btoa(s);
  }
  function deBase64(b) { var s = atob(b), u = new Uint8Array(s.length); for (var i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; }

  var assets = {
    upload: async function (blob, opc) {
      var bytes = new Uint8Array(await blob.arrayBuffer());
      var r = await chamar({ acao: 'v2_foto_put', base64: base64(bytes), tipo: (opc && opc.type) || blob.type || 'image/jpeg' });
      return { id: r.id };
    }
  };
  // O V2 lê as fotos guardadas com fetch("/_blob/<id>"): aqui vem do Drive pelo servidor.
  var fetchOriginal = window.fetch.bind(window);
  window.fetch = function (url, opc) {
    if (typeof url === 'string' && url.indexOf('/_blob/') === 0) {
      return chamar({ acao: 'v2_foto_get', id: url.slice(7) }).then(function (r) {
        return new Response(new Blob([deBase64(r.base64)], { type: r.tipo || 'image/jpeg' }), { status: 200 });
      }, function () { return new Response('', { status: 404 }); });
    }
    return fetchOriginal(url, opc);
  };

  var downloads = {
    save: async function (o) {
      var blob = o.data instanceof Blob ? o.data : new Blob([o.data], { type: 'application/octet-stream' });
      var url = URL.createObjectURL(blob), a = document.createElement('a');
      a.href = url; a.download = o.filename || 'arquivo'; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
      return { ok: true };
    }
  };

  var quem = null;
  var user = { id: async function () { if (!quem) quem = await chamar({ acao: 'v2_quem' }); return quem.id; },
               nome: async function () { if (!quem) quem = await chamar({ acao: 'v2_quem' }); return quem.nome; } };

  var CAP = { db: db, assets: assets, downloads: downloads, user: user };
  window.claude = { use: async function (cap) { if (!CAP[cap]) { var e = new Error('Recurso ' + cap + ' não existe no app'); e.code = 'unavailable'; throw e; } return CAP[cap]; } };

  window.STV2 = {
    servidor: SERVIDOR,
    chamar: chamar,
    logado: function () { return !!token(); },
    // Reserva n IDs seguidos no servidor (trava única para todos os programadores).
    alocar: async function (n) { var r = await chamar({ acao: 'v2_alocar', n: n }); return r.ids; }
  };
})();
