// auth-gate.js — gate d'accès partagée pour les outils "satellites" gated derrière EkoMa
// (aujourd'hui : FBS et RFQ, dépôt Functional-Breakdown-Structure ; StatSan a sa propre
// implémentation bas-niveau en fetch() et n'utilise pas ce module — voir son CLAUDE.md).
//
// Chargé depuis https://gibruga.github.io/EkoMa/auth-gate.js par la page hôte, après le SDK
// Supabase et après la création du client `sb`. Remplace le bloc dupliqué (showAuthOverlay /
// hideAuthOverlay / onAuthenticated / onAuthStateChange / vérification de session au chargement)
// qui existait auparavant, identique à quelques lignes près, dans FBS.html et rfq.html.
//
// RÈGLE CENTRALE (demande explicite de Gilles, répétée plusieurs fois) : depuis l'intégration de
// ces outils à EkoMa, il ne doit JAMAIS y avoir de fenêtre/écran d'accueil visible pour un compte
// déjà autorisé. #auth-overlay doit donc être MASQUÉ PAR DÉFAUT dans le HTML de la page hôte
// (style="display:none"), jamais affiché par défaut -- ce module ne le rend visible QUE si
// l'accès est effectivement refusé (pas de session, session invalide, ou compte non autorisé).
// Le cas normal (session EkoMa valide + accès accordé) ne doit produire AUCUN affichage de cet
// overlay, pas même une fraction de seconde le temps d'un aller-retour réseau -- ne jamais
// réintroduire un état "vérification en cours" visible par défaut ici, une tentative précédente
// (état #auth-checking) a été jugée encore trop proche d'un écran d'accueil et retirée.
//
// Contrat DOM attendu dans la page hôte :
//   #auth-overlay   conteneur plein écran, MASQUÉ PAR DÉFAUT (style="display:none" dans le HTML) --
//                    ce module l'affiche (display:flex) uniquement en cas de refus d'accès avéré.
//   #auth-error     (optionnel) message d'erreur en cas d'accès refusé
//   #user-email     (optionnel) rempli avec l'email une fois connecté
//
// Usage :
//   initEkoGate({
//     sb,                          // client Supabase déjà créé par la page hôte
//     tool: 'fbs',                 // clé telle qu'utilisée dans tool_access.tool
//     deniedMessage: '...',        // (optionnel) message personnalisé si accès refusé
//     onGranted: async (user) => { // appelé une fois l'accès confirmé
//       currentUserId = user.id;
//       await refreshFromSupabase();
//     },
//     onSignedOut: () => { ... }   // (optionnel) appelé à la déconnexion / accès refusé
//   });

function initEkoGate({ sb, tool, deniedMessage, onGranted, onSignedOut }){
  function showAuthOverlay(msg){
    var el = document.getElementById('auth-overlay');
    if (el) el.style.display = 'flex';
    var errEl = document.getElementById('auth-error');
    if (errEl) errEl.textContent = msg || '';
  }
  function hideAuthOverlay(){
    var el = document.getElementById('auth-overlay');
    if (el) el.style.display = 'none';
  }

  async function onAuthenticated(user){
    var access = await sb.rpc('has_tool_access', { p_tool: tool });
    if (access.error || !access.data){
      try { await sb.auth.signOut(); } catch(e){}
      showAuthOverlay(deniedMessage || "Ce compte n'a pas accès à cet outil. Contactez l'administrateur.");
      if (onSignedOut) onSignedOut();
      return;
    }

    // Palier Utilisateur (Charte Graphique / memoire "pointsan-access-tiers") : meme obligation
    // d'entreprise/administration que dans EkoMa, sauf pour les admins. Pas de deconnexion ici
    // (contrairement au cas "acces refuse" ci-dessus) : l'acces est legitime, il manque juste
    // une etape -- on garde la session pour qu'un simple retour depuis EkoMa (sans se
    // reconnecter) suffise. En echec reseau on laisse passer (fail-open), meme logique que
    // EkoMa/app.js et StatSan.
    var adminAccess = await sb.rpc('has_tool_access', { p_tool: tool, p_min_role: 'admin' });
    if (!(adminAccess.error) && !adminAccess.data){
      var prof = await sb.from('profiles').select('company_id').eq('id', user.id).single();
      if (!prof.error && !prof.data.company_id){
        showAuthOverlay("Complète d'abord ton profil (entreprise/administration) sur EkoMa avant d'utiliser cet outil.");
        return;
      }
    }

    var ue = document.getElementById('user-email');
    if (ue) ue.textContent = user.email;
    hideAuthOverlay();
    if (onGranted) await onGranted(user);
  }

  sb.auth.onAuthStateChange(function(event){
    if (event === 'SIGNED_OUT'){
      showAuthOverlay();
      if (onSignedOut) onSignedOut();
    }
  });

  (async () => {
    var res = await sb.auth.getSession();
    // Session trouvée : rien à l'écran tant que has_tool_access n'a pas répondu -- #auth-overlay
    // reste masqué (état par défaut du HTML) pendant tout l'aller-retour réseau ci-dessus.
    // Aucune session : c'est immédiatement et définitivement vrai, donc on montre "Connexion
    // requise" tout de suite plutôt que d'attendre.
    if (res.data.session) await onAuthenticated(res.data.session.user);
    else showAuthOverlay();
  })();

  return { showAuthOverlay, hideAuthOverlay, onAuthenticated };
}
