// v3 (2026-09-04) : la v2 (reseau-d'abord pour la navigation) restait encore piegee par une couche
// de cache differente -- fetch(e.request) sans option respecte par defaut le cache HTTP normal du
// navigateur (celui pilote par les en-tetes Cache-Control de GitHub Pages), qui est SEPARE du Cache
// Storage gere ici. Resultat concret constate le 2026-09-04 : une page HTML pourtant a jour cote
// serveur (verifie par fetch({cache:'no-store'}) direct) continuait de s'afficher perimee dans
// l'onglet, y compris apres le bump de CACHE_NAME en v2, parce que le fetch() de la SW recevait
// lui-meme une reponse disque perimee. Fix : {cache:'no-store'} explicite sur CHAQUE requete
// meme-origine (pas seulement la navigation) -- app.js/style.css changent aussi frequemment en ce
// moment (plusieurs fois par jour) pour se permettre un cache-first sur ces fichiers. Le Cache
// Storage ne sert plus que de repli hors-ligne, jamais de source par defaut.
//
// v4 (2026-09-04, meme jour) : le fetch handler ci-dessous ne suffisait pas -- 'install' semait le
// Cache Storage via cache.addAll(APP_SHELL), qui fait ses propres fetch() en mode par defaut (donc
// PAS no-store) en interne. Si le cache HTTP du navigateur avait deja une reponse (meme perimee)
// pour index.html au moment de l'install, 'ekoma-v3' naissait deja perime -- constate concretement :
// controller actif, cache 'ekoma-v3' present, mais caches.open('ekoma-v3').match('index.html')
// contenait une version sans favicon-live.js pourtant deja pousse. Fix : fetch manuel par URL avec
// {cache:'reload'} (contourne le cache HTTP, mais peuple quand meme le cache HTTP au passage,
// contrairement a no-store) avant de peupler le Cache Storage -- plus jamais de cache.addAll() nu.
const CACHE_NAME = 'ekoma-v4';
const APP_SHELL = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png', './icon-512-maskable.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.all(APP_SHELL.map((url) => fetch(url, { cache: 'reload' }).then((resp) => cache.put(url, resp))))
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

// Reseau d'abord (en forcant a contourner le cache HTTP du navigateur, pas seulement le Cache
// Storage) pour tout, y compris les fichiers annexes -- seul le mode hors-ligne retombe sur le
// Cache Storage, mis a jour a chaque requete reussie.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || !e.request.url.startsWith(self.location.origin)) return;
  e.respondWith(
    fetch(e.request, { cache: 'no-store' })
      .then((resp) => {
        if (resp && resp.ok) {
          const clone = resp.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone));
        }
        return resp;
      })
      .catch(() => caches.match(e.request).then((cached) => cached || (e.request.mode === 'navigate' ? caches.match('./index.html') : undefined)))
  );
});
