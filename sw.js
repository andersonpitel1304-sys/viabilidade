// Guarda a tela no celular para abrir mesmo sem sinal.
var VERSAO = 'secretaria-v7';
var ARQUIVOS = ['./', 'index.html', 'manifest.webmanifest', 'icone-192.png', 'icone-512.png', 'pdf.min.js', 'pdf.worker.min.js'];
// Leitor de PDF (pdf.js 3.11.174): não muda entre versões do app, então usa a cópia guardada primeiro.
var FIXOS = /\/pdf(\.worker)?\.min\.js$/;

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(VERSAO).then(function (c) { return c.addAll(ARQUIVOS); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.filter(function (k) { return k !== VERSAO; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  if (FIXOS.test(new URL(e.request.url).pathname)) {
    e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(function (r) {
      return r || fetch(e.request).then(function (resp) { var copia = resp.clone(); caches.open(VERSAO).then(function (c) { c.put(e.request, copia); }); return resp; });
    }));
    return;
  }
  // Rede primeiro (pega versão nova); sem sinal, usa a cópia guardada.
  e.respondWith(fetch(e.request).then(function (r) {
    var copia = r.clone();
    caches.open(VERSAO).then(function (c) { c.put(e.request, copia); });
    return r;
  }).catch(function () {
    return caches.match(e.request, { ignoreSearch: true }).then(function (r) { return r || caches.match('index.html'); });
  }));
});
