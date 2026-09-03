// v2 (2026-09-03) : CACHE_NAME bumpe pour purger le cache 'ekoma-v1' de tous les navigateurs deja
// installes -- ce cache servait indefiniment un index.html perime (cache-first, meme pour la page
// elle-meme) car ce fichier sw.js, inchange depuis la creation de l'app, ne redeclenchait jamais
// 'install'. C'est ce qui a fait manquer le favicon (ajoute a index.html le 2026-09-02) sur les
// navigateurs ayant deja EkoMa installe/visite avant cette date -- voir aussi le changement de
// strategie ci-dessous, qui evite que ca se reproduise a chaque future modification de la page.
const CACHE_NAME = 'ekoma-v2';
const APP_SHELL = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png', './icon-512-maskable.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

// Navigation (chargement de la page elle-meme) : reseau d'abord, cache seulement en secours hors
// ligne -- la page change assez souvent (fonctionnalites, favicon, etc.) pour ne jamais rester
// figee sur une version perimee comme avant. Le reste (icones, manifest, app.js, style.css) :
// cache-first, ces fichiers changent rarement et sont de toute facon rafraichis au prochain bump
// de CACHE_NAME ci-dessus.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request)
        .then((resp) => {
          if (resp && resp.ok) {
            const clone = resp.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone));
          }
          return resp;
        })
        .catch(() => caches.match(e.request).then((cached) => cached || caches.match('./index.html')))
    );
    return;
  }
  e.respondWith(
    caches.match(e.request).then((cached) => {
      if (cached) return cached;
      return fetch(e.request)
        .then((resp) => {
          if (resp && resp.ok && e.request.url.startsWith(self.location.origin)) {
            const clone = resp.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone));
          }
          return resp;
        })
        .catch(() => cached);
    })
  );
});
