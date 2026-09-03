// favicon-live.js — synchronise le favicon (onglet/favoris) d'EkoMa avec la table Supabase
// acronymes (categorie Identite_Visuelle, id='EkoMa'), sur le meme principe que les .logo en
// page (voir loadEkomaLogo() dans app.js) : le logo est recupere a l'execution plutot
// qu'embarque en statique, pour pouvoir faire evoluer l'identite visuelle sans redeploiement
// (Regles Generales de Conception, section "Identite visuelle").
//
// Fichier volontairement independant d'app.js -- charge separement dans index.html plutot que
// fusionne, pour ne jamais entrer en collision avec des modifications concurrentes de app.js.
// Charge APRES app.js (voir index.html) pour reutiliser le client Supabase global `sb` deja
// cree la-bas, plutot que d'en instancier un second -- deux clients sur la meme cle de storage
// declenchent l'avertissement "Multiple GoTrueClient instances" du SDK.
//
// icon-192.png/icon-512*.png restent en place comme repli : ce sont eux qui s'affichent le temps
// que ce script s'execute (les manifestes/installations PWA en ont de toute facon besoin sous
// forme de fichier statique, un lien de manifeste ne peut pas etre mis a jour depuis du JS) --
// ce script se contente de rafraichir le favicon affiche par le navigateur une fois le SVG a jour
// recupere, silencieusement, sans jamais faire pire que garder ce repli si Supabase est injoignable.
(function () {
  function setFaviconPng(dataUrl) {
    ['icon', 'apple-touch-icon'].forEach(function (rel) {
      var link = document.querySelector('link[rel="' + rel + '"]');
      if (link) link.href = dataUrl;
    });
  }

  function svgToPngDataUrl(svg, size) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () {
        var canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        var ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, size, size);
        try {
          resolve(canvas.toDataURL('image/png'));
        } catch (e) {
          reject(e);
        }
      };
      img.onerror = reject;
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    });
  }

  if (typeof sb === 'undefined') return; // repli silencieux sur icon-192.png si app.js n'a pas cree `sb`

  sb.from('acronymes').select('icon_svg').eq('id', 'EkoMa').single()
    .then(function (res) {
      if (res.error || !res.data || !res.data.icon_svg) return;
      return svgToPngDataUrl(res.data.icon_svg, 192).then(setFaviconPng);
    })
    .catch(function () { /* repli silencieux sur icon-192.png, deja en place */ });
})();
