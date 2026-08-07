// auth-gate.js — gate d'accès partagée pour les outils "satellites" gated derrière EkoMa
// (aujourd'hui : FBS et RFQ, dépôt Functional-Breakdown-Structure ; StatSan a sa propre
// implémentation bas-niveau en fetch() et n'utilise pas ce module — voir son CLAUDE.md).
//
// Chargé depuis https://gibruga.github.io/EkoMa/auth-gate.js par la page hôte, après le SDK
// Supabase et après la création du client `sb`. Remplace le bloc dupliqué (showAuthOverlay /
// hideAuthOverlay / onAuthenticated / onAuthStateChange / vérification de session au chargement)
// qui existait auparavant, identique à quelques lignes près, dans FBS.html et rfq.html.
//
// Contrat DOM attendu dans la page hôte :
//   #auth-overlay   conteneur plein écran affiché/masqué (display flex/none)
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
  function showAuthOverlay(){
    var el = document.getElementById('auth-overlay');
    if (el) el.style.display = 'flex';
  }
  function hideAuthOverlay(){
    var el = document.getElementById('auth-overlay');
    if (el) el.style.display = 'none';
  }

  async function onAuthenticated(user){
    var access = await sb.rpc('has_tool_access', { p_tool: tool });
    if (access.error || !access.data){
      var errEl = document.getElementById('auth-error');
      if (errEl) errEl.textContent = deniedMessage || "Ce compte n'a pas accès à cet outil. Contactez l'administrateur.";
      try { await sb.auth.signOut(); } catch(e){}
      showAuthOverlay();
      if (onSignedOut) onSignedOut();
      return;
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
    if (res.data.session) await onAuthenticated(res.data.session.user);
    else showAuthOverlay();
  })();

  return { showAuthOverlay, hideAuthOverlay, onAuthenticated };
}
