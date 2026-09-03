// app.js — logique d'EkoMa (portail d'accès UrBizia).
// Ce fichier est chargé par index.html après le SDK Supabase (voir <script> en fin de body).
// Sections : (1) connexion + liste des outils accessibles, (2) chargement du logo vectoriel
// partagé, (3) panneau d'Administration (données de référence partagées entre tous les outils).

// ---------- Connexion & liste des outils ----------
const SUPABASE_URL = 'https://mnsfstjgrueyuvejfvvk.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1uc2ZzdGpncnVleXV2ZWpmdnZrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5NDI2MDgsImV4cCI6MjA5OTUxODYwOH0.Nb8d-b3zvXYqbl95PjkNrR12WXnVanJMGJzRU2-UpI4';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const APP_VERSION = 'v2.1';
// Consignation des principales evolutions (demande de Gilles, 2026-08-29) --
// entree la plus recente en premier, affichee dans le panneau "A propos".
const CHANGELOG = [
  { version: 'v2.1', date: '03/09/2026', items: [
    "Les outils s'ouvrent désormais dans un nouvel onglet (au lieu de remplacer EkoMa) — le tableau de bord reste ouvert en arrière-plan.",
    "FBS/RFQ/StatSan affichent désormais un lien « ← EkoMa » pour revenir au tableau de bord, et ne montrent plus brièvement « Connexion requise » à l'ouverture d'un compte déjà connecté.",
  ] },
  { version: 'v2.0', date: '29/08/2026', items: [
    "Alertes admin (nouveau compte, incivilité signalée, fiche sanitaire renseignée)",
    "Modération des fiches sanitaires et signalements I&V (SpotSan)",
    "Parcs de sanitaires par fonction (Nettoyage, Maintenance N1/N2, Exploitant) avec âge limite enfant",
    "Gestion des enfants liés aux comptes Usager (SpotSan)",
    "Entreprise/administration désormais obligatoire aussi pour les comptes Admin",
  ] },
];
let currentUserId = null;
let isAdminUser = false;
document.title = 'EkoMa ' + APP_VERSION;
document.getElementById('about-version').textContent = APP_VERSION + ' — Août 2026';
(function afficherChangelog(){
  const c = document.getElementById('about-changelog');
  if (!c || !CHANGELOG.length) return;
  const dernier = CHANGELOG[0];
  c.innerHTML = '';
  const titre = document.createElement('div');
  titre.className = 'titre';
  titre.textContent = 'Nouveautés ' + dernier.version;
  const ul = document.createElement('ul');
  dernier.items.forEach(i => { const li = document.createElement('li'); li.textContent = i; ul.appendChild(li); });
  c.appendChild(titre); c.appendChild(ul);
})();

// Ordre d'affichage des outils dans EkoMa. La clé (`key`) correspond à tool_access.tool en base
// (des noms internes historiques — ex. StatSan garde la clé "pointsan_desktop" malgré son renommage,
// pour éviter une migration de données pour un simple changement cosmétique).
const TOOLS = [
  { key: 'fbs', name: 'FBS', desc: 'Arborescence fonctionnelle', dot: '#3b82f6', url: 'https://gibruga.github.io/Functional-Breakdown-Structure/FBS.html' },
  { key: 'rfq', name: 'RFQ', desc: "Appels d'offres et devis", dot: '#0d9488', url: 'https://gibruga.github.io/Functional-Breakdown-Structure/rfq.html' },
  { key: 'pointsan_desktop', name: 'StatSan', desc: 'Curation et études terrain (sanitaires)', dot: '#C46E8A', url: 'https://gibruga.github.io/StatSan/' },
  // Pas de regroupement "SitInZen" pour l'instant (demande de Gilles, 2026-09-03) --
  // reorganisation par service a revoir plus tard, entree a plat comme les autres en attendant.
  { key: 'irum', name: 'IRUM', desc: 'Incivilités, vandalisme, entretien (IVER)', dot: '#540E28', url: 'https://gibruga.github.io/IRUM/' }
];

function showLogin(errorMsg){
  document.getElementById('login-overlay').style.display = '';
  document.getElementById('app').style.display = 'none';
  document.getElementById('auth-error').textContent = errorMsg || '';
}
function hideLogin(){
  document.getElementById('login-overlay').style.display = 'none';
  document.getElementById('app').style.display = 'block';
}

document.getElementById('auth-submit').addEventListener('click', doSignIn);
document.getElementById('auth-password').addEventListener('keydown', e => { if (e.key === 'Enter') doSignIn(); });
document.getElementById('auth-mdp-visible').addEventListener('change', e => {
  document.getElementById('auth-password').type = e.target.checked ? 'text' : 'password';
});
document.getElementById('logout').addEventListener('click', async () => {
  try { await sb.auth.signOut(); } catch(e){}
  currentUserId = null;
  isAdminUser = false;
  document.getElementById('btn-admin-open').style.display = 'none';
  document.getElementById('alertes-badge').style.display = 'none';
  document.getElementById('admin-overlay').classList.remove('show');
  showLogin();
});
document.getElementById('btn-about-login').addEventListener('click', () => {
  document.getElementById('about-overlay').classList.add('show');
});
document.getElementById('btn-about-app').addEventListener('click', () => {
  document.getElementById('about-overlay').classList.add('show');
});
document.getElementById('btn-about-close').addEventListener('click', () => {
  document.getElementById('about-overlay').classList.remove('show');
});

// Met en forme un numero de portable pour Supabase Auth ("+33 761 761 559")
// -- retire un 0 initial francais avant de decouper en groupes de 3, meme
// bug/correctif que SpotSan (src/lib/auth.js, formaterTelephone) : taper le
// numero "a la francaise" (0761761559) sans ce retrait tronque le dernier
// chiffre au lieu du 0, et l'identifiant ne correspond plus a rien en base.
function formaterTelephone(indicatif, numeroLocal){
  const chiffres = numeroLocal.replace(/\D/g, '').replace(/^0/, '');
  return `${indicatif} ${chiffres.slice(0, 3)} ${chiffres.slice(3, 6)} ${chiffres.slice(6, 9)}`.trim();
}

async function doSignIn(){
  const indicatif = document.getElementById('auth-indicatif').value.trim() || '+33';
  const numero = document.getElementById('auth-numero').value.trim();
  const password = document.getElementById('auth-password').value;
  const errEl = document.getElementById('auth-error');
  errEl.textContent = '';
  if (!numero || !password){ errEl.textContent = 'Renseigne ton numéro de portable et ton mot de passe.'; return; }
  const phone = formaterTelephone(indicatif, numero);
  const btn = document.getElementById('auth-submit');
  btn.disabled = true; btn.textContent = 'Connexion…';
  const res = await sb.auth.signInWithPassword({ phone, password });
  btn.disabled = false; btn.textContent = 'Se connecter';
  if (res.error){ errEl.textContent = 'Numéro ou mot de passe incorrect.'; return; }
  await onAuthenticated(res.data.user);
}

// Formatage d'affichage seulement (badge utilisateur) -- comptes telephone
// desormais (voir "Naming history"/fusion de compte 2026-09-03), user.email
// est le plus souvent vide.
function afficherIdentite(user){
  if (user.email) return user.email;
  if (user.phone) return '+' + user.phone.replace(/^(\d{2})(\d{3})(\d{3})(\d{3})$/, '$1 $2 $3 $4');
  return '';
}

async function onAuthenticated(user){
  currentUserId = user.id;
  document.getElementById('user-email').textContent = afficherIdentite(user);
  const res = await sb.from('tool_access').select('tool,role').eq('user_id', user.id);
  if (res.error){
    showLogin('Erreur de chargement des accès. Réessaie.');
    return;
  }
  const access = {};
  (res.data || []).forEach(r => { access[r.tool] = r.role; });

  const adminRes = await sb.rpc('has_tool_access', { p_tool: 'fbs', p_min_role: 'admin' });
  isAdminUser = !!(adminRes && adminRes.data);
  document.getElementById('btn-admin-open').style.display = isAdminUser ? 'block' : 'none';
  if (isAdminUser) rafraichirBadgeAlertes();

  // Entreprise/administration obligatoire pour Utilisateur ET Admin (correction de Gilles,
  // 2026-08-29 -- les Admin n'en etaient pas exemptes avant, a tort). Seuls les Usagers
  // (SpotSan, hors de ce mecanisme entierement) n'en ont pas besoin. Les comptes sans aucun
  // acces outil restent exemptes (rien a debloquer de toute facon).
  if (Object.keys(access).length || isAdminUser){
    const profRes = await sb.from('profiles').select('company_id').eq('id', user.id).single();
    if (!profRes.error && !profRes.data.company_id){
      if (isAdminUser){
        // Les Admin sont par defaut rattaches a UrBizia elle-meme -- pas de choix a faire,
        // rattachement silencieux plutot que de leur montrer l'ecran de selection.
        await sb.from('profiles').update({ company_id: 'URBIZIA' }).eq('id', user.id);
      } else {
        showEntrepriseGate(access);
        return;
      }
    }
  }

  renderTools(access);
  hideLogin();
}

// ---------- Entreprise / Administration (palier Utilisateur) ----------
const NOUVELLE_ENTREPRISE = '__nouvelle__';

async function showEntrepriseGate(access){
  document.getElementById('login-overlay').style.display = 'none';
  document.getElementById('app').style.display = 'none';
  document.getElementById('entreprise-overlay').style.display = 'block';
  await loadEntrepriseOptions();

  document.getElementById('ent-select').onchange = (e) => {
    document.getElementById('ent-new-fields').style.display = e.target.value === NOUVELLE_ENTREPRISE ? 'block' : 'none';
  };

  document.getElementById('ent-submit').onclick = async () => {
    const errEl = document.getElementById('ent-error');
    errEl.textContent = '';
    const sel = document.getElementById('ent-select').value;
    const btn = document.getElementById('ent-submit');
    btn.disabled = true; btn.textContent = 'Enregistrement…';
    try {
      let companyId = sel;
      if (sel === NOUVELLE_ENTREPRISE){
        const nom = document.getElementById('ent-nom').value.trim();
        const adresse = document.getElementById('ent-adresse').value.trim();
        if (!nom){ errEl.textContent = 'Le nom est obligatoire.'; return; }
        // Sous-traitants (FBS/RFQ) = "Bureau d'Études" ; exploitants (StatSan, futur parametrage
        // SpotSan) = "Exploitant" -- deduit de l'outil qui a amene la personne jusqu'ici plutot
        // que redemande, les deux populations ne se recoupant pas aujourd'hui.
        const type = (access.fbs || access.rfq) ? "Bureau d'Études" : 'Exploitant';
        const insertRes = await sb.from('contractors')
          .insert({ id: 'BE-' + Date.now().toString(36), nom, adresse, type, owner_id: currentUserId })
          .select('id').single();
        if (insertRes.error){ errEl.textContent = 'Erreur : ' + insertRes.error.message; return; }
        companyId = insertRes.data.id;
      } else if (!sel){
        errEl.textContent = 'Choisis ton entreprise/administration, ou crée-la.';
        return;
      }
      const updRes = await sb.from('profiles').update({ company_id: companyId }).eq('id', currentUserId);
      if (updRes.error){ errEl.textContent = 'Erreur : ' + updRes.error.message; return; }
      document.getElementById('entreprise-overlay').style.display = 'none';
      renderTools(access);
      hideLogin();
    } finally {
      btn.disabled = false; btn.textContent = 'Continuer';
    }
  };
}

async function loadEntrepriseOptions(){
  const sel = document.getElementById('ent-select');
  sel.innerHTML = '';
  sel.appendChild(makeEl('option', { value: '' }, '— Choisir —'));
  const res = await sb.from('contractors').select('id,nom,type').order('nom');
  (res.data || []).forEach(c => sel.appendChild(makeEl('option', { value: c.id }, c.nom + ' (' + c.type + ')')));
  sel.appendChild(makeEl('option', { value: NOUVELLE_ENTREPRISE }, "+ Créer une nouvelle entreprise/administration"));
}

function renderTools(access){
  const wrap = document.getElementById('tools');
  wrap.innerHTML = '';
  const granted = TOOLS.filter(t => access[t.key]);
  if (!granted.length){
    wrap.innerHTML = '<div class="empty">Ce compte n\'a accès à aucun outil pour l\'instant.<br>Contacte un administrateur pour en demander un.</div>';
    return;
  }
  granted.forEach(t => {
    const el = document.createElement('div');
    el.className = 'tool';
    el.innerHTML = '<div class="dot" style="background:'+t.dot+'"></div>' +
      '<div class="t-body"><div class="t-name">'+t.name+'</div><div class="t-desc">'+t.desc+'</div></div>' +
      '<div class="t-role">'+(access[t.key] === 'admin' ? 'Admin' : 'Utilisateur')+'</div>';
    el.addEventListener('click', () => { window.open(t.url, '_blank'); });
    wrap.appendChild(el);
  });
}

// ---------- Logo vectoriel partagé (identité visuelle UrBizia) ----------
async function loadEkomaLogo(){
  try {
    const res = await sb.from('acronymes').select('icon_svg').eq('id', 'EkoMa').single();
    if (res.error || !res.data || !res.data.icon_svg) return;
    document.querySelectorAll('.logo').forEach(el => { el.innerHTML = res.data.icon_svg; });
  } catch (e) { /* repli visuel via .logo:empty en CSS */ }
}

// ============================================================
// ADMINISTRATION (Acronymes / Competences / Lexique / Bureaux d'Etudes / Profils)
// ============================================================
const ADMIN_TOOLS = [
  { key: 'fbs', label: 'FBS' },
  { key: 'rfq', label: 'RFQ' },
  { key: 'pointsan_desktop', label: 'StatSan' },
  { key: 'pointsan_mobile', label: 'SpotSan' },
  { key: 'irum', label: 'IRUM' }
];
const ACR_CATS = ['FBS_Type','Phase_Projet','Besoin_Client','Risque_Type','Application','SOW_Statut'];
const ACR_CAT_NAMES = { FBS_Type:'FBS Type', Phase_Projet:'Phase Projet', Besoin_Client:'Besoin Client', Risque_Type:'Risque', Application:'Application', SOW_Statut:'Statut SOW' };
const ACR_EDIT_ID_CATS = ['Phase_Projet','Besoin_Client','Risque_Type','Application'];

function acrIconSrc(a){
  if (!a) return null;
  if (a.icon_svg) return 'data:image/svg+xml;utf8,' + encodeURIComponent(a.icon_svg);
  if (a.icon_base64) return 'data:image/png;base64,' + a.icon_base64;
  return null;
}

function makeEl(tag, props, text){
  const el = document.createElement(tag);
  if (props) Object.keys(props).forEach(k => {
    if (k === 'style') Object.keys(props.style).forEach(sk => { el.style[sk] = props.style[sk]; });
    else if (k === 'class') el.className = props[k];
    else if (k === 'onclick') el.onclick = props[k];
    else if (k === 'title') el.title = props[k];
    else el.setAttribute(k, props[k]);
  });
  if (text !== undefined) el.textContent = text;
  return el;
}
function appendChildren(parent, ...children){ children.forEach(c => { if (c) parent.appendChild(c); }); return parent; }
function makeFF(label, el){ const w = makeEl('div', { class: 'ff' }); if (label) w.appendChild(makeEl('label', {}, label)); w.appendChild(el); return w; }
function makeInput(id, val, ph){ return makeEl('input', { id, value: val || '', placeholder: ph || '' }); }
function makeTextarea(id, val, ph){ const t = makeEl('textarea', { id, placeholder: ph || '' }); t.value = val || ''; return t; }

function showModal(title, bodyEl, footEls){
  document.getElementById('modal-title').textContent = title;
  const mb = document.getElementById('modal-body'); mb.innerHTML = ''; if (bodyEl) mb.appendChild(bodyEl);
  const mf = document.getElementById('modal-foot'); mf.innerHTML = '';
  (Array.isArray(footEls) ? footEls : [footEls]).forEach(el => { if (el) mf.appendChild(el); });
  document.getElementById('mo').classList.add('open');
}
function closeModal(){ document.getElementById('mo').classList.remove('open'); }
document.getElementById('modal-close').addEventListener('click', closeModal);
(function(){
  const mo = document.getElementById('mo');
  let downOnOverlay = false;
  mo.addEventListener('mousedown', e => { downOnOverlay = (e.target === mo); });
  mo.addEventListener('mouseup', e => { if (downOnOverlay && e.target === mo) closeModal(); downOnOverlay = false; });
})();

document.getElementById('btn-admin-open').addEventListener('click', () => {
  document.getElementById('admin-overlay').classList.add('show');
  switchAdminTab('alertes');
});
document.getElementById('admin-close').addEventListener('click', () => {
  document.getElementById('admin-overlay').classList.remove('show');
});
document.querySelectorAll('.admin-tab').forEach(btn => {
  btn.addEventListener('click', () => switchAdminTab(btn.getAttribute('data-tab')));
});
function switchAdminTab(tab){
  document.querySelectorAll('.admin-tab').forEach(b => b.classList.toggle('active', b.getAttribute('data-tab') === tab));
  const c = document.getElementById('admin-content');
  c.innerHTML = '<div class="admin-empty" style="padding:20px 0;">Chargement...</div>';
  if (tab === 'alertes') renderAdminAlertes(c);
  else if (tab === 'mod') renderAdminModeration(c);
  else if (tab === 'irum') renderAdminIRUM(c);
  else if (tab === 'parcs') renderAdminParcs(c);
  else if (tab === 'enfants') renderAdminEnfants(c);
  else if (tab === 'acr') renderAdminAcronymes(c);
  else if (tab === 'comp') renderAdminCompetences(c);
  else if (tab === 'lex') renderAdminLexique(c);
  else if (tab === 'be') renderAdminBE(c);
  else if (tab === 'users') renderAdminUsers(c);
}

// ---------- Alertes admin (nouveau compte / incivilite / fiche sanitaire) ----------
const ALERTE_LABELS = { nouveau_compte: 'Nouveau compte', incivilite: 'Incivilité', fiche_sanitaire: 'Fiche sanitaire' };

async function rafraichirBadgeAlertes(){
  if (!isAdminUser) return;
  const res = await sb.from('admin_alerts').select('id', { count: 'exact', head: true }).eq('lu', false);
  const badge = document.getElementById('alertes-badge');
  const n = res.count || 0;
  badge.textContent = n > 99 ? '99+' : String(n);
  badge.style.display = n > 0 ? 'inline-block' : 'none';
}

async function marquerAlerteLue(id){
  const session = (await sb.auth.getSession()).data.session;
  await sb.from('admin_alerts').update({ lu: true, lu_par: session.user.id, lu_at: new Date().toISOString() }).eq('id', id);
  rafraichirBadgeAlertes();
}

async function renderAdminAlertes(container){
  const res = await sb.from('admin_alerts').select('*').order('created_at', { ascending: false }).limit(200);
  if (res.error){
    container.innerHTML = '';
    container.appendChild(makeEl('div', { style: { color: '#f87171', fontSize: '11px' } }, 'Erreur : ' + res.error.message));
    return;
  }
  const alertes = res.data || [];
  container.innerHTML = '';

  const sec = makeEl('div', { class: 'admin-sec' });
  const head = makeEl('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' } });
  head.appendChild(makeEl('div', { class: 'admin-cat' }, 'Alertes'));
  const toutLuBtn = makeEl('button', { class: 'abtn' }, 'Tout marquer comme lu');
  toutLuBtn.onclick = async () => {
    await sb.from('admin_alerts').update({ lu: true, lu_par: currentUserId, lu_at: new Date().toISOString() }).eq('lu', false);
    rafraichirBadgeAlertes();
    switchAdminTab('alertes');
  };
  head.appendChild(toutLuBtn);
  sec.appendChild(head);

  if (!alertes.length) sec.appendChild(makeEl('div', { class: 'admin-empty' }, '(aucune alerte)'));
  alertes.forEach(a => {
    const row = makeEl('div', { class: 'admin-row', style: { alignItems: 'flex-start', opacity: a.lu ? '0.55' : '1' } });
    const col = makeEl('div', { style: { flex: '1' } });
    col.appendChild(makeEl('div', { style: { fontSize: '9px', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.03em' } }, ALERTE_LABELS[a.type] || a.type));
    col.appendChild(makeEl('div', { style: { fontSize: '11px', margin: '2px 0' } }, a.resume));
    col.appendChild(makeEl('div', { style: { fontSize: '9px', color: 'var(--text3)' } }, new Date(a.created_at).toLocaleString('fr-FR')));
    row.appendChild(col);
    if (!a.lu){
      const luBtn = makeEl('button', { class: 'abtn' }, 'Marquer comme lu');
      luBtn.onclick = async () => { await marquerAlerteLue(a.id); switchAdminTab('alertes'); };
      row.appendChild(luBtn);
    }
    sec.appendChild(row);
  });
  container.appendChild(sec);
}

// ---------- Modération (fiches Sanitary_Reviews / I&V Incident_Reports) ----------
// Demande de Gilles (2026-08-29) : corriger des erreurs d'Usagers, ou ajouter
// des infos glanées en parallèle, sur une fiche/I&V d'un sanitaire choisi --
// uniquement sous EkoMa. Cote SpotSan/Usager inchange (Sanitary_Reviews reste
// limite a ses propres lignes, Incident_Reports reste append-only) ; les
// nouvelles policies admin (has_tool_access('fbs','admin')) sont additives.
// Taxonomie I&V : table partagée Incivilites_Taxonomie (source commune avec
// SpotSan, cf. Regles Generales de Conception des Modules UrBizia) --
// plus de liste figée cote code, un ajout/retrait ici se voit aussi dans
// SpotSan sans redeploiement. Cache simple (rechargé à chaque ouverture
// d'onglet admin concerné, pas besoin de plus pour un outil interne).
async function getTaxonomieIncivilites(){
  // Ne jamais rejeter : appelée dans un Promise.all aux côtés d'appels
  // sb.from(...) qui eux ne rejettent jamais (erreur portée par .error),
  // pour rester cohérent avec le reste de ce fichier.
  const res = await sb.from('Incivilites_Taxonomie').select('tag,actif,ordre,categorie_iver,propose_par_ia').order('ordre');
  if (res.error){ console.error(res.error); return []; }
  return res.data || [];
}
async function signedIncidentPhotoUrl(path){
  if (!path) return null;
  const res = await sb.storage.from('PointSan-Incidents').createSignedUrl(path, 3600);
  if (res.error){ console.error(res.error); return null; }
  return res.data?.signedUrl || null;
}
let modUbId = null;

async function renderAdminModeration(container){
  container.innerHTML = '';
  if (modUbId) await renderModerationDetail(container, modUbId);
  else renderModerationRecherche(container);
}

function renderModerationRecherche(container){
  const sec = makeEl('div', { class: 'admin-sec' });
  sec.appendChild(makeEl('div', { class: 'admin-cat' }, 'Modération — choisir un sanitaire'));
  const row = makeEl('div', { style: { display: 'flex', gap: '6px', marginBottom: '10px' } });
  const q = makeEl('input', { placeholder: 'Nom, adresse ou UB_id...', style: { flex: '1' } });
  const btn = makeEl('button', { class: 'abtn primary' }, 'Rechercher');
  const resultsWrap = makeEl('div');
  async function chercher(){
    const val = q.value.trim();
    if (!val){ resultsWrap.innerHTML = ''; return; }
    resultsWrap.innerHTML = '';
    resultsWrap.appendChild(makeEl('div', { class: 'admin-empty' }, 'Recherche...'));
    const res = await sb.from('SanitaryBlocks_Inventory').select('UB_id,Name,Adresse,City')
      .or(`Name.ilike.%${val}%,Adresse.ilike.%${val}%,UB_id.ilike.%${val}%`).limit(20);
    resultsWrap.innerHTML = '';
    if (res.error){ resultsWrap.appendChild(makeEl('div', { style: { color: '#f87171', fontSize: '11px' } }, 'Erreur : ' + res.error.message)); return; }
    const rows = res.data || [];
    if (!rows.length){ resultsWrap.appendChild(makeEl('div', { class: 'admin-empty' }, 'Aucun résultat.')); return; }
    rows.forEach(r => {
      const rrow = makeEl('div', { class: 'admin-row', style: { cursor: 'pointer' } });
      rrow.appendChild(makeEl('div', { style: { flex: '1' } }, (r.Name || r.UB_id) + ' — ' + (r.Adresse || '') + (r.City ? (', ' + r.City) : '') + ' (' + r.UB_id + ')'));
      rrow.onclick = () => { modUbId = r.UB_id; switchAdminTab('mod'); };
      resultsWrap.appendChild(rrow);
    });
  }
  btn.onclick = chercher;
  q.addEventListener('keydown', e => { if (e.key === 'Enter') chercher(); });
  appendChildren(row, q, btn);
  sec.appendChild(row);
  sec.appendChild(resultsWrap);
  container.appendChild(sec);
}

async function renderModerationDetail(container, ubId){
  container.appendChild(makeEl('div', { class: 'admin-empty' }, 'Chargement...'));
  const [sbRes, revRes, incRes, taxo] = await Promise.all([
    sb.from('SanitaryBlocks_Inventory').select('UB_id,Name,Adresse,City').eq('UB_id', ubId).maybeSingle(),
    sb.from('Sanitary_Reviews').select('*').eq('ub_id', ubId),
    sb.from('Incident_Reports').select('*').eq('UB_id', ubId).order('Reported_at', { ascending: false }),
    getTaxonomieIncivilites()
  ]);
  const incidentIds = (incRes.data || []).map(i => i.Report_id);
  const tagsRes = incidentIds.length
    ? await sb.from('Incident_Report_Tags').select('report_id,tag').in('report_id', incidentIds)
    : { data: [] };
  const tagsByReport = {};
  (tagsRes.data || []).forEach(r => { (tagsByReport[r.report_id] ||= []).push(r.tag); });
  container.innerHTML = '';

  const backB = makeEl('button', { class: 'abtn', style: { marginBottom: '10px' } }, '← Retour à la recherche');
  backB.onclick = () => { modUbId = null; switchAdminTab('mod'); };
  container.appendChild(backB);

  const s = sbRes.data;
  container.appendChild(makeEl('div', { class: 'admin-cat' }, (s?.Name || ubId) + (s?.Adresse ? ' — ' + s.Adresse : '') + (s?.City ? ', ' + s.City : '') + ' (' + ubId + ')'));

  const secFiches = makeEl('div', { class: 'admin-sec' });
  const headF = makeEl('div', { style: { display: 'flex', alignItems: 'center', gap: '10px', margin: '10px 0 8px' } });
  headF.appendChild(makeEl('div', { class: 'admin-cat' }, 'Fiches (' + (revRes.data || []).length + ')'));
  const addFicheB = makeEl('button', { class: 'abtn primary', style: { marginLeft: 'auto' } }, '+ Ajouter un avis');
  addFicheB.onclick = () => openFicheEntry(null, ubId);
  headF.appendChild(addFicheB);
  secFiches.appendChild(headF);
  if (revRes.error) secFiches.appendChild(makeEl('div', { style: { color: '#f87171', fontSize: '11px' } }, 'Erreur : ' + revRes.error.message));
  const fiches = revRes.data || [];
  if (!fiches.length) secFiches.appendChild(makeEl('div', { class: 'admin-empty' }, '(aucune fiche)'));
  fiches.forEach(f => {
    const row = makeEl('div', { class: 'admin-row', style: { alignItems: 'flex-start' } });
    const col = makeEl('div', { style: { flex: '1' } });
    col.appendChild(makeEl('div', { style: { fontSize: '11px' } }, 'Avis général : ' + (f.avis_general ?? '—') + ' — ' + (f.commentaire || '(pas de commentaire)')));
    col.appendChild(makeEl('div', { style: { fontSize: '9px', color: 'var(--text3)' } }, 'user_id ' + f.user_id + ' · maj ' + new Date(f.updated_at || f.created_at).toLocaleString('fr-FR')));
    row.appendChild(col);
    const editB = makeEl('button', { class: 'abtn' }, 'Éditer'); editB.onclick = () => openFicheEntry(f, ubId);
    const delB = makeEl('button', { class: 'abtn danger' }, 'Supprimer');
    delB.onclick = async () => {
      if (!confirm('Supprimer cette fiche ?')) return;
      const d = await sb.from('Sanitary_Reviews').delete().eq('user_id', f.user_id).eq('ub_id', ubId);
      if (d.error) alert('Erreur : ' + d.error.message); else switchAdminTab('mod');
    };
    row.appendChild(editB); row.appendChild(delB);
    secFiches.appendChild(row);
  });
  container.appendChild(secFiches);

  const secInc = makeEl('div', { class: 'admin-sec' });
  const headI = makeEl('div', { style: { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' } });
  headI.appendChild(makeEl('div', { class: 'admin-cat' }, 'IVER (' + (incRes.data || []).length + ')'));
  secInc.appendChild(headI);
  if (incRes.error) secInc.appendChild(makeEl('div', { style: { color: '#f87171', fontSize: '11px' } }, 'Erreur : ' + incRes.error.message));
  const incidents = incRes.data || [];
  if (!incidents.length) secInc.appendChild(makeEl('div', { class: 'admin-empty' }, '(aucun signalement)'));
  const bandeauInc = makeEl('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '8px' } });
  incidents.forEach(inc => bandeauInc.appendChild(renderIncidentVignette(inc, ubId, taxo || [], tagsByReport[inc.Report_id] || [])));
  secInc.appendChild(bandeauInc);
  container.appendChild(secInc);
}

// Vignette IVER réutilisable (bandeau compact) : photo (URL signée, bucket
// privé) + pastille de statut (vert = vérifié par un humain, orange = pas
// encore). Cliquer ouvre la fiche de modération complète en modale plutôt
// que tout afficher en permanence -- demande de Gilles (2026-09-02) pour
// garder le bandeau lisible même avec beaucoup de photos. Utilisée à la
// fois par Modération (par sanitaire) et par l'onglet IRUM (galerie tous
// sanitaires).
const COULEUR_CONFIANCE = { haute: '#22c55e', moyenne: '#f59e0b', basse: '#ef4444' };

function renderIncidentVignette(inc, ubId, taxonomie, currentTags){
  const wrap = makeEl('div', { style: { position: 'relative', width: '84px', height: '84px', flexShrink: '0', cursor: 'pointer' }, title: (inc.verifie_humain ? 'Vérifié par un humain' : 'À vérifier') + (inc.confiance_ia ? ' — confiance IA ' + inc.confiance_ia : '') });
  const img = makeEl('img', { style: { width: '84px', height: '84px', objectFit: 'cover', borderRadius: '6px', background: 'var(--bg3)', display: 'block' } });
  signedIncidentPhotoUrl(inc.Photo).then(url => { if (url) img.src = url; });
  const badge = makeEl('div', { style: {
    position: 'absolute', top: '3px', right: '3px', width: '14px', height: '14px', borderRadius: '50%',
    background: inc.verifie_humain ? '#22c55e' : '#f59e0b', border: '2px solid var(--bg2)'
  } });
  appendChildren(wrap, img, badge);
  if (inc.confiance_ia){
    const confBadge = makeEl('div', { style: {
      position: 'absolute', bottom: '3px', left: '3px', width: '9px', height: '9px', borderRadius: '50%',
      background: COULEUR_CONFIANCE[inc.confiance_ia] || 'var(--text3)', border: '1px solid var(--bg2)'
    } });
    wrap.appendChild(confBadge);
  }
  wrap.onclick = () => ouvrirModerationIncident(inc, ubId, taxonomie, currentTags);
  return wrap;
}

// Fiche de modération d'un IVER : photo en grand, cases à cocher multi-tag,
// remarque, case "Vérifié par un humain", suppression. Tout se sauvegarde
// ensemble via le bouton Enregistrer (contrairement à l'ancienne version qui
// sauvegardait chaque case à cocher immédiatement) -- plus cohérent avec le
// fait que la case "Vérifié" doit refléter un geste explicite de relecture,
// pas se cocher toute seule au premier clic sur un tag.
function ouvrirModerationIncident(inc, ubId, taxonomie, currentTags){
  const body = makeEl('div');
  body.appendChild(makeEl('div', { style: { fontSize: '9px', color: 'var(--text3)', marginBottom: '8px' } },
    ubId + ' · ' + new Date(inc.Reported_at).toLocaleString('fr-FR')));

  const img = makeEl('img', { style: { width: '100%', maxHeight: '280px', objectFit: 'contain', borderRadius: '6px', background: 'var(--bg3)', marginBottom: '10px', display: 'block' } });
  signedIncidentPhotoUrl(inc.Photo).then(url => { if (url) img.src = url; });
  body.appendChild(img);

  if (inc.confiance_ia || (inc.tags_ia_origine && inc.tags_ia_origine.length)) {
    const origine = makeEl('div', { style: { fontSize: '10px', color: 'var(--text3)', background: 'var(--bg3)', borderRadius: '6px', padding: '6px 8px', marginBottom: '8px' } });
    origine.appendChild(makeEl('div', {}, 'Diagnostic IA d\'origine (figé, jamais modifié par une correction) :'));
    origine.appendChild(makeEl('div', { style: { marginTop: '2px' } },
      (inc.tags_ia_origine && inc.tags_ia_origine.length ? inc.tags_ia_origine.join(', ') : '(rien détecté)') +
      (inc.confiance_ia ? ' — confiance ' + inc.confiance_ia : '')));
    body.appendChild(origine);
  }

  const selected = new Set(currentTags);
  const origineSet = new Set(inc.tags_ia_origine || []);
  // La taxonomie compte aussi les intitulés libres proposés par l'IA (voir
  // detection_iv.js) -- potentiellement des centaines, non pertinents pour
  // la plupart des photos. On n'affiche que les tags officiels + ceux
  // effectivement lies a CETTE photo (diagnostic d'origine ou deja coche),
  // pour garder la liste utilisable. Les tags proposes non lies restent
  // gerables depuis la section Taxonomie plus bas.
  const tagsPertinents = taxonomie.filter(t => !t.propose_par_ia || selected.has(t.tag) || origineSet.has(t.tag));
  const tagsWrap = makeEl('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '6px' } });
  const cases = [];
  tagsPertinents.forEach(t => {
    const lbl = makeEl('label', { style: { display: 'flex', alignItems: 'center', gap: '4px', fontSize: '10.5px', color: t.actif ? 'var(--text2)' : 'var(--text3)', border: '1px solid ' + (origineSet.has(t.tag) ? '#c55a7a' : 'var(--border2)'), borderRadius: '999px', padding: '3px 8px', cursor: 'pointer' }, title: t.propose_par_ia ? 'Proposé par l\'IA (pas encore dans la liste officielle)' : '' });
    const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = selected.has(t.tag); cb.value = t.tag;
    lbl.appendChild(cb);
    lbl.appendChild(document.createTextNode(t.tag + (t.actif ? '' : ' (inactif)') + (t.propose_par_ia ? ' 🆕' : '')));
    tagsWrap.appendChild(lbl);
    cases.push(cb);
  });
  body.appendChild(makeFF('IVER constatés (bord rose = proposé par l\'IA sur cette photo)', tagsWrap));

  const ajoutWrap = makeEl('div', { style: { display: 'flex', gap: '6px', marginTop: '4px' } });
  const ajoutInput = makeEl('input', { placeholder: 'Ajouter un tag officiel non listé ici...', style: { flex: '1', fontSize: '10.5px' } });
  const ajoutB = makeEl('button', { class: 'abtn' }, '+');
  ajoutB.onclick = () => {
    const val = ajoutInput.value.trim();
    if (!val || cases.some(c => c.value === val)) return;
    const lbl = makeEl('label', { style: { display: 'flex', alignItems: 'center', gap: '4px', fontSize: '10.5px', color: 'var(--text2)', border: '1px solid var(--border2)', borderRadius: '999px', padding: '3px 8px', cursor: 'pointer' } });
    const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = true; cb.value = val;
    lbl.appendChild(cb); lbl.appendChild(document.createTextNode(val));
    tagsWrap.appendChild(lbl); cases.push(cb);
    ajoutInput.value = '';
  };
  appendChildren(ajoutWrap, ajoutInput, ajoutB);
  body.appendChild(ajoutWrap);
  body.appendChild(makeFF('Remarque / description', makeTextarea('mod-iver-desc', inc.Description)));

  const verifLbl = makeEl('label', { style: { display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--text2)', marginTop: '4px' } });
  const verifCb = document.createElement('input'); verifCb.type = 'checkbox'; verifCb.checked = !!inc.verifie_humain;
  verifLbl.appendChild(verifCb); verifLbl.appendChild(document.createTextNode('Vérifié par un humain'));
  body.appendChild(verifLbl);

  const fermerB = makeEl('button', { class: 'abtn' }, 'Fermer'); fermerB.onclick = closeModal;
  const delB = makeEl('button', { class: 'abtn danger' }, 'Supprimer');
  delB.onclick = async () => {
    if (!confirm('Supprimer ce signalement (photo + tags) ?')) return;
    const d = await sb.from('Incident_Reports').delete().eq('Report_id', inc.Report_id);
    if (d.error){ alert('Erreur : ' + d.error.message); return; }
    closeModal(); switchAdminTab(document.querySelector('.admin-tab.active')?.getAttribute('data-tab') || 'mod');
  };
  const saveB = makeEl('button', { class: 'abtn primary' }, 'Enregistrer');
  saveB.onclick = async () => {
    const nouveaux = cases.filter(c => c.checked).map(c => c.value);
    const aSupprimer = [...selected].filter(t => !nouveaux.includes(t));
    const aAjouter = nouveaux.filter(t => !selected.has(t));
    try {
      const upd = await sb.from('Incident_Reports')
        .update({ Description: document.getElementById('mod-iver-desc').value.trim() || null, verifie_humain: verifCb.checked })
        .eq('Report_id', inc.Report_id);
      if (upd.error) throw upd.error;
      if (aSupprimer.length){
        const d = await sb.from('Incident_Report_Tags').delete().eq('report_id', inc.Report_id).in('tag', aSupprimer);
        if (d.error) throw d.error;
      }
      if (aAjouter.length){
        const i = await sb.from('Incident_Report_Tags').insert(aAjouter.map(tag => ({ report_id: inc.Report_id, tag })));
        if (i.error) throw i.error;
      }
      closeModal();
      switchAdminTab(document.querySelector('.admin-tab.active')?.getAttribute('data-tab') || 'mod');
    } catch (e){
      alert('Erreur : ' + e.message);
    }
  };
  showModal('Modération IVER', body, [fermerB, delB, saveB]);
}

function openFicheEntry(f, ubId){
  const isEdit = !!f;
  const body = makeEl('div');
  body.appendChild(makeFF('Avis général (1-5)', makeInput('mf-avis', isEdit && f.avis_general != null ? f.avis_general : '')));
  body.appendChild(makeFF('Commentaire', makeTextarea('mf-comment', isEdit ? f.commentaire : '')));
  const eclLbl = makeEl('label', { style: { display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--text2)', marginBottom: '8px' } });
  const eclC = document.createElement('input'); eclC.type = 'checkbox'; eclC.checked = isEdit ? !!f.eclairage_naturel : false;
  eclLbl.appendChild(eclC); eclLbl.appendChild(document.createTextNode('Éclairage naturel'));
  body.appendChild(eclLbl);
  const verLbl = makeEl('label', { style: { display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--text2)', marginBottom: '8px' } });
  const verC = document.createElement('input'); verC.type = 'checkbox'; verC.checked = isEdit ? !!f.verrou_mecanique : false;
  verLbl.appendChild(verC); verLbl.appendChild(document.createTextNode('Verrou mécanique'));
  body.appendChild(verLbl);
  body.appendChild(makeFF('Signalétique', makeInput('mf-signal', isEdit ? f.signaletique : '')));
  body.appendChild(makeFF('Configuration (JSON, avancé)', makeTextarea('mf-config', isEdit && f.configuration ? JSON.stringify(f.configuration) : '')));
  body.appendChild(makeFF('États (JSON, avancé)', makeTextarea('mf-etats', isEdit && f.etats ? JSON.stringify(f.etats) : '')));
  const cancelB = makeEl('button', { class: 'abtn' }, 'Annuler'); cancelB.onclick = closeModal;
  const saveB = makeEl('button', { class: 'abtn primary' }, isEdit ? 'Enregistrer' : 'Ajouter');
  saveB.onclick = async () => {
    // configuration/etats sont NOT NULL en base (defaut '{}'::jsonb) -- ce
    // defaut ne s'applique que si la colonne est absente de la requete, pas
    // si on envoie explicitement null, d'ou le fallback {} ici plutot que null.
    let configuration = {}, etats = {};
    try { const c = document.getElementById('mf-config').value.trim(); configuration = c ? JSON.parse(c) : {}; } catch { alert('Configuration : JSON invalide.'); return; }
    try { const e2 = document.getElementById('mf-etats').value.trim(); etats = e2 ? JSON.parse(e2) : {}; } catch { alert('États : JSON invalide.'); return; }
    const avisVal = document.getElementById('mf-avis').value.trim();
    const entry = {
      avis_general: avisVal ? Number(avisVal) : null,
      commentaire: document.getElementById('mf-comment').value.trim() || null,
      eclairage_naturel: eclC.checked,
      verrou_mecanique: verC.checked,
      signaletique: document.getElementById('mf-signal').value.trim() || null,
      configuration, etats
    };
    const res = isEdit
      ? await sb.from('Sanitary_Reviews').update(entry).eq('user_id', f.user_id).eq('ub_id', ubId)
      : await sb.from('Sanitary_Reviews').upsert({ ...entry, user_id: currentUserId, ub_id: ubId }, { onConflict: 'user_id,ub_id' });
    if (res.error){ alert('Erreur : ' + res.error.message); return; }
    closeModal(); switchAdminTab('mod');
  };
  showModal(isEdit ? 'Éditer la fiche' : 'Ajouter une fiche', body, [cancelB, saveB]);
}

// ---------- IRUM (SitInZen) : correction des tags tous sanitaires confondus,
// gestion de la taxonomie partagée, export photos+métadonnées ----------
// Demande de Gilles (2026-08-30) : voir Regles Generales de Conception des
// Modules UrBizia (Architecture des IHM) -- IRUM n'a pas d'app dédiée, tout
// passe par ici. Reutilise renderIncidentVignette/ouvrirModerationIncident
// (definis plus haut, deja utilises par Modération) pour ne pas dupliquer
// l'affichage/l'edition photo+tags.
let irumLimit = 60;
let irumSeulementAVerifier = true;
let irumTriParConfiance = true;

async function renderAdminIRUM(container){
  container.innerHTML = '';
  let requete = sb.from('Incident_Reports').select('*').order('Reported_at', { ascending: false }).limit(irumLimit);
  if (irumSeulementAVerifier) requete = requete.eq('verifie_humain', false);
  const [incRes, taxo] = await Promise.all([requete, getTaxonomieIncivilites()]);
  if (incRes.error){ container.appendChild(makeEl('div', { style: { color: '#f87171', fontSize: '11px' } }, 'Erreur : ' + incRes.error.message)); return; }
  let incidents = incRes.data || [];
  if (irumTriParConfiance){
    // Confiance basse en premier -- c'est la priorite de relecture demandee
    // par Gilles (2026-09-03) ; tri cote client, "basse" < "moyenne" <
    // "haute" n'est pas l'ordre alphabetique naturel.
    const rang = { basse: 0, moyenne: 1, haute: 2 };
    incidents = [...incidents].sort((a, b) => (rang[a.confiance_ia] ?? -1) - (rang[b.confiance_ia] ?? -1));
  }
  const ids = incidents.map(i => i.Report_id);
  const tagsRes = ids.length ? await sb.from('Incident_Report_Tags').select('report_id,tag').in('report_id', ids) : { data: [] };
  const tagsByReport = {};
  (tagsRes.data || []).forEach(r => { (tagsByReport[r.report_id] ||= []).push(r.tag); });

  const secTax = makeEl('div', { class: 'admin-sec' });
  secTax.appendChild(makeEl('div', { class: 'admin-cat' }, 'Taxonomie des IVER (partagée avec SpotSan)'));
  const nbProposes = taxo.filter(t => t.propose_par_ia).length;
  if (nbProposes) secTax.appendChild(makeEl('div', { style: { fontSize: '10px', color: '#f59e0b', marginBottom: '6px' } },
    `🆕 ${nbProposes} intitulé(s) proposé(s) par l'IA à trier (garder tel quel, renommer, ou ajouter à SpotSan une fois validé).`));
  taxo.forEach(t => {
    const row = makeEl('div', { class: 'admin-row' });
    const label = (t.categorie_iver ? `[${t.categorie_iver}] ` : '') + t.tag + (t.actif ? '' : ' (inactif)') + (t.propose_par_ia ? ' 🆕' : '');
    row.appendChild(makeEl('div', { style: { flex: '1', fontSize: '11px', opacity: t.actif ? '1' : '0.5', color: t.propose_par_ia ? '#f59e0b' : 'inherit' } }, label));
    if (t.propose_par_ia){
      const validerB = makeEl('button', { class: 'abtn' }, 'Valider (retirer 🆕)');
      validerB.onclick = async () => {
        const res = await sb.from('Incivilites_Taxonomie').update({ propose_par_ia: false }).eq('tag', t.tag);
        if (res.error) alert('Erreur : ' + res.error.message); else switchAdminTab('irum');
      };
      row.appendChild(validerB);
    }
    const toggleB = makeEl('button', { class: 'abtn' }, t.actif ? 'Désactiver' : 'Réactiver');
    toggleB.onclick = async () => {
      const res = await sb.from('Incivilites_Taxonomie').update({ actif: !t.actif }).eq('tag', t.tag);
      if (res.error) alert('Erreur : ' + res.error.message); else switchAdminTab('irum');
    };
    row.appendChild(toggleB);
    secTax.appendChild(row);
  });
  const addRow = makeEl('div', { style: { display: 'flex', gap: '6px', marginTop: '8px' } });
  const newTagInput = makeEl('input', { placeholder: 'Nouveau tag...', style: { flex: '1' } });
  const catSelect = document.createElement('select');
  catSelect.style.cssText = 'background:var(--bg3);border:1px solid var(--border2);border-radius:5px;padding:6px 8px;color:var(--text);font-size:11px;font-family:inherit';
  [['I', 'I — Incivilité'], ['V', 'V — Vandalisme'], ['E', "E — Défaut d'entretien"], ['R', 'R — Défaut de réparation']]
    .forEach(([val, txt]) => { const o = document.createElement('option'); o.value = val; o.textContent = txt; catSelect.appendChild(o); });
  const addTagB = makeEl('button', { class: 'abtn primary' }, '+ Ajouter');
  addTagB.onclick = async () => {
    const val = newTagInput.value.trim();
    if (!val) return;
    const maxOrdre = taxo.reduce((m, t) => Math.max(m, t.ordre), 0);
    const res = await sb.from('Incivilites_Taxonomie').insert({ tag: val, ordre: maxOrdre + 1, categorie_iver: catSelect.value });
    if (res.error) alert('Erreur : ' + res.error.message); else switchAdminTab('irum');
  };
  appendChildren(addRow, newTagInput, catSelect, addTagB);
  secTax.appendChild(addRow);
  secTax.appendChild(makeEl('div', { style: { fontSize: '9px', color: 'var(--text3)', marginTop: '6px' } },
    '"Désactiver" retire un tag des nouveaux signalements (SpotSan) sans toucher aux photos déjà taguées avec — jamais de suppression physique, pour ne pas casser l\'historique.'));
  container.appendChild(secTax);

  const secGal = makeEl('div', { class: 'admin-sec' });
  const headG = makeEl('div', { style: { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' } });
  headG.appendChild(makeEl('div', { class: 'admin-cat' }, 'IVER (' + incidents.length + (irumSeulementAVerifier ? ' à vérifier' : '') + ')'));

  const filtreLbl = makeEl('label', { style: { display: 'flex', alignItems: 'center', gap: '4px', fontSize: '10.5px', color: 'var(--text2)', cursor: 'pointer' } });
  const filtreCb = document.createElement('input'); filtreCb.type = 'checkbox'; filtreCb.checked = irumSeulementAVerifier;
  filtreCb.onchange = () => { irumSeulementAVerifier = filtreCb.checked; switchAdminTab('irum'); };
  filtreLbl.appendChild(filtreCb); filtreLbl.appendChild(document.createTextNode('Seulement à vérifier'));
  headG.appendChild(filtreLbl);

  const triLbl = makeEl('label', { style: { display: 'flex', alignItems: 'center', gap: '4px', fontSize: '10.5px', color: 'var(--text2)', cursor: 'pointer' } });
  const triCb = document.createElement('input'); triCb.type = 'checkbox'; triCb.checked = irumTriParConfiance;
  triCb.onchange = () => { irumTriParConfiance = triCb.checked; switchAdminTab('irum'); };
  triLbl.appendChild(triCb); triLbl.appendChild(document.createTextNode('Confiance basse d\'abord'));
  headG.appendChild(triLbl);

  const addVerifB = makeEl('button', { class: 'abtn' }, '+ Ajouter pour vérification humaine');
  addVerifB.onclick = () => ouvrirVerificationHumaine(taxo);
  headG.appendChild(addVerifB);
  const exportB = makeEl('button', { class: 'abtn primary', style: { marginLeft: 'auto' } }, '⬇ Exporter (EXIF + CSV)');
  exportB.onclick = () => exporterPhotosIRUM(incidents, tagsByReport);
  headG.appendChild(exportB);
  secGal.appendChild(headG);
  if (!incidents.length) secGal.appendChild(makeEl('div', { class: 'admin-empty' }, '(aucun signalement)'));
  const bandeauGal = makeEl('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '8px' } });
  incidents.forEach(inc => bandeauGal.appendChild(renderIncidentVignette(inc, inc.UB_id, taxo, tagsByReport[inc.Report_id] || [])));
  secGal.appendChild(bandeauGal);
  if (incidents.length === irumLimit){
    const moreB = makeEl('button', { class: 'abtn' }, 'Charger plus');
    moreB.onclick = () => { irumLimit += 60; switchAdminTab('irum'); };
    secGal.appendChild(moreB);
  }
  container.appendChild(secGal);
}

// "VerIA" (2026-09-02, demande de Gilles) : sanitaire virtuel (UB_id
// 'UB-VERIA', Exists=false donc invisible cote SpotSan) qui sert uniquement
// de porteur pour des photos deposees ici par un humain pour verifier/
// contredire une detection IA -- reutilise integralement Incident_Reports +
// Incident_Report_Tags plutot qu'un fichier Excel a part, pour garder une
// trace structuree exploitable plus tard (comparaison IA vs humain).
function ouvrirVerificationHumaine(taxonomie){
  const body = makeEl('div');
  const fileInput = document.createElement('input'); fileInput.type = 'file'; fileInput.accept = 'image/*';
  body.appendChild(makeFF('Photo', fileInput));

  const tagsWrap = makeEl('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '6px', margin: '6px 0' } });
  const cases = [];
  taxonomie.forEach(t => {
    const lbl = makeEl('label', { style: { display: 'flex', alignItems: 'center', gap: '4px', fontSize: '10.5px', border: '1px solid var(--border2)', borderRadius: '999px', padding: '3px 8px', cursor: 'pointer' } });
    const cb = document.createElement('input'); cb.type = 'checkbox'; cb.value = t.tag;
    lbl.appendChild(cb); lbl.appendChild(document.createTextNode(t.tag));
    tagsWrap.appendChild(lbl);
    cases.push(cb);
  });
  body.appendChild(makeFF('Ce que vous constatez vous-même', tagsWrap));
  body.appendChild(makeFF('Remarque libre (ex. écart avec la détection IA)', makeTextarea('verif-remarque', '')));

  const cancelB = makeEl('button', { class: 'abtn' }, 'Annuler'); cancelB.onclick = closeModal;
  const saveB = makeEl('button', { class: 'abtn primary' }, 'Ajouter');
  saveB.onclick = async () => {
    const file = fileInput.files[0];
    if (!file){ alert('Choisissez une photo.'); return; }
    saveB.disabled = true; saveB.textContent = 'Envoi...';
    try {
      const tagsChoisis = cases.filter(c => c.checked).map(c => c.value);
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
      const chemin = `UB-VERIA/verif_${Date.now()}.${ext}`;
      const up = await sb.storage.from('PointSan-Incidents').upload(chemin, file);
      if (up.error) throw up.error;
      const ins = await sb.from('Incident_Reports').insert({
        UB_id: 'UB-VERIA', Photo: chemin,
        Description: document.getElementById('verif-remarque').value.trim() || null,
        user_id: currentUserId
      }).select().single();
      if (ins.error) throw ins.error;
      if (tagsChoisis.length){
        const insT = await sb.from('Incident_Report_Tags').insert(tagsChoisis.map(tag => ({ report_id: ins.data.Report_id, tag })));
        if (insT.error) throw insT.error;
      }
      closeModal();
      switchAdminTab('irum');
    } catch (e){
      alert('Erreur : ' + e.message);
      saveB.disabled = false; saveB.textContent = 'Ajouter';
    }
  };
  showModal('Ajouter une photo pour vérification humaine (VerIA)', body, [cancelB, saveB]);
}

// Export : une archive zip avec chaque photo (EXIF enrichi : UB_id, date,
// tags dans ImageDescription/UserComment via piexifjs) + manifest.csv en
// filet de secours -- l'EXIF seul est fragile (beaucoup d'outils de
// traitement d'image le suppriment silencieusement), le CSV garantit que
// rien ne se perd pour un usage ML en aval.
async function exporterPhotosIRUM(incidents, tagsByReport){
  if (!incidents.length){ alert('Rien à exporter.'); return; }
  if (!window.JSZip || !window.piexif){ alert('Bibliothèques d\'export indisponibles, réessaie (connexion internet nécessaire au premier chargement).'); return; }
  const zip = new JSZip();
  const manifestRows = [['fichier', 'ub_id', 'date_heure', 'tags']];
  let ok = 0, ko = 0;
  for (const inc of incidents){
    try {
      const url = await signedIncidentPhotoUrl(inc.Photo);
      if (!url) throw new Error('pas de photo');
      const resp = await fetch(url);
      const blob = await resp.blob();
      const dataUrl = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result);
        r.onerror = reject;
        r.readAsDataURL(blob);
      });
      const tags = (tagsByReport[inc.Report_id] || []).join('; ');
      const date = new Date(inc.Reported_at);
      const exifDate = date.toISOString().slice(0, 19).replace('T', ' ').replace(/-/g, ':');
      const exifObj = { '0th': {}, 'Exif': {} };
      exifObj['0th'][piexif.ImageIFD.ImageDescription] = `${inc.UB_id} | ${date.toLocaleString('fr-FR')} | ${tags || 'sans tag'}`;
      exifObj['Exif'][piexif.ExifIFD.DateTimeOriginal] = exifDate;
      exifObj['Exif'][piexif.ExifIFD.UserComment] = `UB_id=${inc.UB_id}; tags=${tags}`;
      const exifBytes = piexif.dump(exifObj);
      const newDataUrl = piexif.insert(exifBytes, dataUrl);
      const base64 = newDataUrl.split(',')[1];
      const filename = `${inc.UB_id}_${inc.Report_id}_${date.toISOString().slice(0, 10)}.jpg`;
      zip.file(filename, base64, { base64: true });
      manifestRows.push([filename, inc.UB_id, date.toISOString(), tags]);
      ok++;
    } catch (e){
      console.error('Export IRUM : échec pour le signalement', inc.Report_id, e);
      ko++;
    }
  }
  zip.file('manifest.csv', manifestRows.map(r => r.map(c => '"' + String(c).replace(/"/g, '""') + '"').join(',')).join('\n'));
  const content = await zip.generateAsync({ type: 'blob' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(content);
  a.download = `IRUM_export_${new Date().toISOString().slice(0, 10)}.zip`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(a.href);
  alert(ko ? `Export terminé : ${ok} photo(s), ${ko} en échec (voir la console).` : `Export terminé : ${ok} photo(s).`);
}

// ---------- Parcs de sanitaires (age limite enfant, par Exploitant) ----------
// Demande de Gilles (2026-08-29) : un parc regroupe des sanitaires sous une
// Administration/Exploitant, avec son propre age limite enfant (le seuil
// n'est pas global -- chaque parc a le sien). Selection des sanitaires par
// liste (recherche + cases a cocher) pour l'instant ; une selection sur
// carte (zone / Ctrl+clic) viendra plus tard en amelioration.
let parcDetailId = null;

async function renderAdminParcs(container){
  container.innerHTML = '';
  if (parcDetailId) await renderParcDetail(container, parcDetailId);
  else await renderParcsListe(container);
}

const FONCTION_PARC_EXPLOITANT = 'EXPLOIT';

async function renderParcsListe(container){
  const [parcsRes, ctrRes, fctRes] = await Promise.all([
    sb.from('parcs_sanitaires').select('*, contractors(nom)').order('nom'),
    sb.from('contractors').select('id,nom').order('nom'),
    sb.from('acronymes').select('id,designation').eq('categorie', 'Fonction_Parc').order('ordre')
  ]);
  container.innerHTML = '';
  if (parcsRes.error){ container.appendChild(makeEl('div', { style: { color: '#f87171', fontSize: '11px' } }, 'Erreur : ' + parcsRes.error.message)); return; }
  const contractors = ctrRes.data || [];
  const fonctions = fctRes.data || [];
  const fonctionLabel = (id) => fonctions.find(f => f.id === id)?.designation || id;
  const sec = makeEl('div', { class: 'admin-sec' });
  const head = makeEl('div', { style: { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' } });
  head.appendChild(makeEl('div', { class: 'admin-cat' }, 'Parcs de sanitaires'));
  const addB = makeEl('button', { class: 'abtn primary', style: { marginLeft: 'auto' } }, '+ Nouveau parc');
  addB.onclick = () => openParcEntry(null, contractors, fonctions);
  head.appendChild(addB); sec.appendChild(head);
  const parcs = parcsRes.data || [];
  if (!parcs.length) sec.appendChild(makeEl('div', { class: 'admin-empty' }, '(aucun parc)'));
  for (const p of parcs){
    const cntRes = await sb.from('parc_sanitaires_membres').select('ub_id', { count: 'exact', head: true }).eq('parc_id', p.id);
    const row = makeEl('div', { class: 'admin-row', style: { alignItems: 'flex-start' } });
    const col = makeEl('div', { style: { flex: '1' } });
    col.appendChild(makeEl('div', { style: { fontSize: '12px', fontWeight: 'bold' } }, p.nom));
    const ageTxt = p.fonction === FONCTION_PARC_EXPLOITANT && p.age_limite_enfant != null ? (' · âge limite ' + p.age_limite_enfant + ' ans') : '';
    col.appendChild(makeEl('div', { style: { fontSize: '10px', color: 'var(--text3)' } }, (p.contractors?.nom || '—') + ' · ' + fonctionLabel(p.fonction) + ageTxt + ' · ' + (cntRes.count || 0) + ' sanitaire(s)'));
    row.appendChild(col);
    const gererB = makeEl('button', { class: 'abtn' }, 'Gérer les sanitaires');
    gererB.onclick = () => { parcDetailId = p.id; switchAdminTab('parcs'); };
    const editB = makeEl('button', { class: 'abtn' }, 'Éditer');
    editB.onclick = () => openParcEntry(p, contractors, fonctions);
    const delB = makeEl('button', { class: 'abtn danger' }, 'Supprimer');
    delB.onclick = async () => {
      if (!confirm('Supprimer ce parc (et son association aux sanitaires) ?')) return;
      const d = await sb.from('parcs_sanitaires').delete().eq('id', p.id);
      if (d.error) alert('Erreur : ' + d.error.message); else switchAdminTab('parcs');
    };
    row.appendChild(gererB); row.appendChild(editB); row.appendChild(delB);
    sec.appendChild(row);
  }
  container.appendChild(sec);
}

function openParcEntry(p, contractors, fonctions){
  const isEdit = !!p;
  const body = makeEl('div');
  body.appendChild(makeFF('Nom du parc', makeInput('pc-nom', isEdit ? p.nom : '')));

  const ctrSel = document.createElement('select');
  ctrSel.style.cssText = 'background:var(--bg3);border:1px solid var(--border2);border-radius:5px;padding:6px 8px;color:var(--text);font-size:11px;font-family:inherit;width:100%';
  if (!contractors.length) ctrSel.appendChild(makeEl('option', { value: '' }, '(aucune entreprise -- crée-en une dans "Entreprises / Administrations")'));
  contractors.forEach(c => ctrSel.appendChild(makeEl('option', { value: c.id }, c.nom)));
  if (isEdit) ctrSel.value = p.contractor_id;
  body.appendChild(makeFF('Entreprise / Administration', ctrSel));

  const fctSel = document.createElement('select');
  fctSel.style.cssText = 'background:var(--bg3);border:1px solid var(--border2);border-radius:5px;padding:6px 8px;color:var(--text);font-size:11px;font-family:inherit;width:100%';
  fonctions.forEach(f => fctSel.appendChild(makeEl('option', { value: f.id }, f.designation)));
  if (isEdit) fctSel.value = p.fonction;
  body.appendChild(makeFF('Fonction sur ce parc', fctSel));

  const ageFF = makeFF('Âge limite enfant (ans)', makeInput('pc-age', isEdit && p.age_limite_enfant != null ? p.age_limite_enfant : 11));
  ageFF.style.display = fctSel.value === FONCTION_PARC_EXPLOITANT ? '' : 'none';
  fctSel.onchange = () => { ageFF.style.display = fctSel.value === FONCTION_PARC_EXPLOITANT ? '' : 'none'; };
  body.appendChild(ageFF);

  const cancelB = makeEl('button', { class: 'abtn' }, 'Annuler'); cancelB.onclick = closeModal;
  const saveB = makeEl('button', { class: 'abtn primary' }, isEdit ? 'Enregistrer' : 'Créer');
  saveB.onclick = async () => {
    const nom = document.getElementById('pc-nom').value.trim();
    if (!nom){ alert('Le nom du parc est obligatoire.'); return; }
    if (!ctrSel.value){ alert("Choisis l'entreprise/administration associée."); return; }
    if (!fctSel.value){ alert('Choisis la fonction sur ce parc.'); return; }
    let age = null;
    if (fctSel.value === FONCTION_PARC_EXPLOITANT){
      age = Number(document.getElementById('pc-age').value);
      if (!age || age < 1){ alert('Âge limite invalide.'); return; }
    }
    const entry = { nom, contractor_id: ctrSel.value, fonction: fctSel.value, age_limite_enfant: age };
    const res = isEdit ? await sb.from('parcs_sanitaires').update(entry).eq('id', p.id) : await sb.from('parcs_sanitaires').insert(entry);
    if (res.error){ alert('Erreur : ' + res.error.message); return; }
    closeModal(); switchAdminTab('parcs');
  };
  showModal(isEdit ? 'Éditer le parc' : 'Nouveau parc', body, [cancelB, saveB]);
}

// ---------- Module "Acces sanitaire" (statut d'un sanitaire, cote Exploitant) ----------
// Complement direct au consensus par vote Usager de SpotSan (3 signalements
// concordants basculent Inexistant/Hors Service) : cet angle mort-la ne
// couvre pas la remise en service, puisqu'un sanitaire HS n'est plus
// visite donc ne recoit plus d'avis (note V2-PLAN.md §8, 2026-08-31).
// Reserve aux admins EkoMa pour l'instant, pas de compte "Exploitant" en
// libre-service -- amorce seulement (demande de Gilles le meme jour).
const STATUTS_ACCES = [
  { valeur: 'Disponible', label: 'Disponible' },
  { valeur: 'Hors_Service', label: 'HS' },
  { valeur: 'Condamne', label: 'Condamné' },
  { valeur: 'Supprime', label: 'Supprimé' },
  { valeur: 'Remise_Conformite', label: 'Remise en conformité' },
];

function statutActuelSanitaire(s){
  if (!s) return null;
  if (s.Exists === false) return 'Supprime';
  if (s.Statut_Operationnel === 'Hors_Service') return 'Hors_Service';
  if (s.Statut_Operationnel === 'Condamne') return 'Condamne';
  return 'Disponible';
}

function makeAccesSanitaire(s, onChange){
  const wrap = makeEl('div', { style: { display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', paddingLeft: '4px' } });
  wrap.appendChild(makeEl('span', { style: { fontSize: '10px', color: 'var(--text3)' } }, 'Accès sanitaire :'));
  const actuel = statutActuelSanitaire(s);
  STATUTS_ACCES.forEach(opt => {
    // "Remise en conformite" n'est pas un statut stocke -- c'est un alias
    // d'action vers Disponible, jamais affiche comme actif lui-meme.
    const actif = opt.valeur !== 'Remise_Conformite' && opt.valeur === actuel;
    const b = makeEl('button', { class: 'abtn' + (actif ? ' primary' : '') }, opt.label);
    b.disabled = actif;
    b.onclick = async () => {
      const res = await sb.rpc('definir_statut_sanitaire_admin', { p_ub_id: s.UB_id, p_statut: opt.valeur });
      if (res.error) alert('Erreur : ' + res.error.message); else onChange?.();
    };
    wrap.appendChild(b);
  });
  return wrap;
}

async function renderParcDetail(container, parcId){
  container.appendChild(makeEl('div', { class: 'admin-empty' }, 'Chargement...'));
  const [parcRes, membresRes] = await Promise.all([
    sb.from('parcs_sanitaires').select('*, contractors(nom)').eq('id', parcId).single(),
    sb.from('parc_sanitaires_membres').select('ub_id, SanitaryBlocks_Inventory(UB_id,Name,Adresse,City,Exists,Statut_Operationnel)').eq('parc_id', parcId)
  ]);
  container.innerHTML = '';
  const backB = makeEl('button', { class: 'abtn', style: { marginBottom: '10px' } }, '← Retour aux parcs');
  backB.onclick = () => { parcDetailId = null; switchAdminTab('parcs'); };
  container.appendChild(backB);

  if (parcRes.error){ container.appendChild(makeEl('div', { style: { color: '#f87171', fontSize: '11px' } }, 'Erreur : ' + parcRes.error.message)); return; }
  const parc = parcRes.data;
  container.appendChild(makeEl('div', { class: 'admin-cat' }, parc.nom + ' — ' + (parc.contractors?.nom || '—') + ' (âge limite ' + parc.age_limite_enfant + ' ans)'));

  const membres = membresRes.data || [];
  const secMembres = makeEl('div', { class: 'admin-sec' });
  secMembres.appendChild(makeEl('div', { class: 'admin-cat' }, 'Sanitaires du parc (' + membres.length + ')'));
  if (!membres.length) secMembres.appendChild(makeEl('div', { class: 'admin-empty' }, '(aucun sanitaire dans ce parc)'));
  membres.forEach(m => {
    const s = m.SanitaryBlocks_Inventory;
    const bloc = makeEl('div', { class: 'admin-row', style: { flexDirection: 'column', alignItems: 'stretch', gap: '6px' } });

    const ligneInfo = makeEl('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } });
    ligneInfo.appendChild(makeEl('div', { style: { flex: '1', fontSize: '11px' } }, (s?.Name || m.ub_id) + ' — ' + (s?.Adresse || '') + (s?.City ? ', ' + s.City : '') + ' (' + m.ub_id + ')'));
    const delB = makeEl('button', { class: 'abtn danger' }, 'Retirer');
    delB.onclick = async () => {
      const d = await sb.from('parc_sanitaires_membres').delete().eq('parc_id', parcId).eq('ub_id', m.ub_id);
      if (d.error) alert('Erreur : ' + d.error.message); else switchAdminTab('parcs');
    };
    ligneInfo.appendChild(delB);
    bloc.appendChild(ligneInfo);
    bloc.appendChild(makeAccesSanitaire(s, () => { parcDetailId = parcId; switchAdminTab('parcs'); }));
    secMembres.appendChild(bloc);
  });
  container.appendChild(secMembres);

  const secAjout = makeEl('div', { class: 'admin-sec' });
  secAjout.appendChild(makeEl('div', { class: 'admin-cat' }, 'Ajouter des sanitaires'));
  const row = makeEl('div', { style: { display: 'flex', gap: '6px', margin: '8px 0' } });
  const q = makeEl('input', { placeholder: 'Nom, adresse ou UB_id...', style: { flex: '1' } });
  const btn = makeEl('button', { class: 'abtn' }, 'Rechercher');
  const resultsWrap = makeEl('div');
  const selectedUbIds = new Set();
  async function chercher(){
    const val = q.value.trim();
    if (!val){ resultsWrap.innerHTML = ''; return; }
    resultsWrap.innerHTML = '';
    resultsWrap.appendChild(makeEl('div', { class: 'admin-empty' }, 'Recherche...'));
    const res = await sb.from('SanitaryBlocks_Inventory').select('UB_id,Name,Adresse,City')
      .or(`Name.ilike.%${val}%,Adresse.ilike.%${val}%,UB_id.ilike.%${val}%`).limit(30);
    resultsWrap.innerHTML = '';
    if (res.error){ resultsWrap.appendChild(makeEl('div', { style: { color: '#f87171', fontSize: '11px' } }, 'Erreur : ' + res.error.message)); return; }
    const rows = (res.data || []).filter(r => !membres.some(m => m.ub_id === r.UB_id));
    if (!rows.length){ resultsWrap.appendChild(makeEl('div', { class: 'admin-empty' }, 'Aucun résultat (hors sanitaires déjà dans le parc).')); return; }
    rows.forEach(r => {
      const rrow = makeEl('div', { class: 'admin-row' });
      const cb = document.createElement('input'); cb.type = 'checkbox';
      cb.onchange = () => { if (cb.checked) selectedUbIds.add(r.UB_id); else selectedUbIds.delete(r.UB_id); };
      rrow.appendChild(cb);
      rrow.appendChild(makeEl('div', { style: { flex: '1' } }, (r.Name || r.UB_id) + ' — ' + (r.Adresse || '') + (r.City ? (', ' + r.City) : '') + ' (' + r.UB_id + ')'));
      resultsWrap.appendChild(rrow);
    });
  }
  btn.onclick = chercher;
  q.addEventListener('keydown', e => { if (e.key === 'Enter') chercher(); });
  appendChildren(row, q, btn);
  secAjout.appendChild(row);
  secAjout.appendChild(resultsWrap);
  const addSelB = makeEl('button', { class: 'abtn primary', style: { marginTop: '8px' } }, 'Ajouter la sélection au parc');
  addSelB.onclick = async () => {
    if (!selectedUbIds.size){ alert('Coche au moins un sanitaire.'); return; }
    const rows = Array.from(selectedUbIds).map(ub_id => ({ parc_id: parcId, ub_id }));
    const res = await sb.from('parc_sanitaires_membres').insert(rows);
    if (res.error){ alert('Erreur : ' + res.error.message); return; }
    switchAdminTab('parcs');
  };
  secAjout.appendChild(addSelB);
  container.appendChild(secAjout);
}

// ---------- Enfants (lies a un parent SpotSan/Usager, age limite par parc) ----------
// Saisi par un admin uniquement -- jamais auto-declare par le mineur ni le
// parent (voir memoire "pointsan-access-tiers"). L'eligibilite reelle
// (acces aux sanitaires a siege enfant) depend du parc concerne et n'est
// pas encore branchee a un vrai controle d'acces -- voir
// parent_a_enfant_eligible() en base, prete a etre consommee plus tard.
let enfantParentId = null;

async function renderAdminEnfants(container){
  container.innerHTML = '';
  if (enfantParentId) await renderEnfantsDetail(container, enfantParentId);
  else renderEnfantsRecherche(container);
}

function renderEnfantsRecherche(container){
  const sec = makeEl('div', { class: 'admin-sec' });
  sec.appendChild(makeEl('div', { class: 'admin-cat' }, 'Enfants — choisir un parent (Usager SpotSan)'));
  const row = makeEl('div', { style: { display: 'flex', gap: '6px', marginBottom: '10px' } });
  const q = makeEl('input', { placeholder: 'Pseudo, nom, prénom ou téléphone...', style: { flex: '1' } });
  const btn = makeEl('button', { class: 'abtn primary' }, 'Rechercher');
  const resultsWrap = makeEl('div');
  async function chercher(){
    const val = q.value.trim();
    if (!val){ resultsWrap.innerHTML = ''; return; }
    resultsWrap.innerHTML = '';
    resultsWrap.appendChild(makeEl('div', { class: 'admin-empty' }, 'Recherche...'));
    const res = await sb.from('SitInZen_Users').select('user_id,pseudo,Nom,Prenom,Phone')
      .or(`pseudo.ilike.%${val}%,Nom.ilike.%${val}%,Prenom.ilike.%${val}%,Phone.ilike.%${val}%`).limit(20);
    resultsWrap.innerHTML = '';
    if (res.error){ resultsWrap.appendChild(makeEl('div', { style: { color: '#f87171', fontSize: '11px' } }, 'Erreur : ' + res.error.message)); return; }
    const rows = res.data || [];
    if (!rows.length){ resultsWrap.appendChild(makeEl('div', { class: 'admin-empty' }, 'Aucun résultat.')); return; }
    rows.forEach(r => {
      const rrow = makeEl('div', { class: 'admin-row', style: { cursor: 'pointer' } });
      rrow.appendChild(makeEl('div', { style: { flex: '1' } }, (r.pseudo || '(sans pseudo)') + ' — ' + [r.Nom, r.Prenom].filter(Boolean).join(' ') + ' — ' + (r.Phone || '')));
      rrow.onclick = () => { enfantParentId = r.user_id; switchAdminTab('enfants'); };
      resultsWrap.appendChild(rrow);
    });
  }
  btn.onclick = chercher;
  q.addEventListener('keydown', e => { if (e.key === 'Enter') chercher(); });
  appendChildren(row, q, btn);
  sec.appendChild(row);
  sec.appendChild(resultsWrap);
  container.appendChild(sec);
}

async function renderEnfantsDetail(container, parentId){
  container.appendChild(makeEl('div', { class: 'admin-empty' }, 'Chargement...'));
  const [parentRes, enfantsRes] = await Promise.all([
    sb.from('SitInZen_Users').select('user_id,pseudo,Nom,Prenom,Phone').eq('user_id', parentId).single(),
    sb.from('enfants_usagers').select('*').eq('parent_user_id', parentId).order('annee_naissance')
  ]);
  container.innerHTML = '';
  const backB = makeEl('button', { class: 'abtn', style: { marginBottom: '10px' } }, '← Retour à la recherche');
  backB.onclick = () => { enfantParentId = null; switchAdminTab('enfants'); };
  container.appendChild(backB);

  const parent = parentRes.data;
  container.appendChild(makeEl('div', { class: 'admin-cat' }, (parent?.pseudo || parentId) + ' — ' + [parent?.Nom, parent?.Prenom].filter(Boolean).join(' ') + ' — ' + (parent?.Phone || '')));

  const sec = makeEl('div', { class: 'admin-sec' });
  const head = makeEl('div', { style: { display: 'flex', alignItems: 'center', gap: '10px', margin: '10px 0 8px' } });
  head.appendChild(makeEl('div', { class: 'admin-cat' }, 'Enfants (' + (enfantsRes.data || []).length + ')'));
  const addB = makeEl('button', { class: 'abtn primary', style: { marginLeft: 'auto' } }, '+ Ajouter un enfant');
  addB.onclick = () => openEnfantEntry(null, parentId);
  head.appendChild(addB); sec.appendChild(head);
  if (enfantsRes.error) sec.appendChild(makeEl('div', { style: { color: '#f87171', fontSize: '11px' } }, 'Erreur : ' + enfantsRes.error.message));
  const enfants = enfantsRes.data || [];
  if (!enfants.length) sec.appendChild(makeEl('div', { class: 'admin-empty' }, '(aucun enfant enregistré)'));
  const anneeCourante = new Date().getFullYear();
  enfants.forEach(e => {
    const age = anneeCourante - e.annee_naissance;
    const row = makeEl('div', { class: 'admin-row' });
    row.appendChild(makeEl('div', { style: { flex: '1', fontSize: '11px' } }, (e.prenom || '(sans prénom)') + ' — né(e) en ' + e.annee_naissance + ' (' + age + ' ans)'));
    const editB = makeEl('button', { class: 'abtn' }, 'Éditer'); editB.onclick = () => openEnfantEntry(e, parentId);
    const delB = makeEl('button', { class: 'abtn danger' }, 'Supprimer');
    delB.onclick = async () => {
      if (!confirm('Supprimer cet enfant ?')) return;
      const d = await sb.from('enfants_usagers').delete().eq('id', e.id);
      if (d.error) alert('Erreur : ' + d.error.message); else switchAdminTab('enfants');
    };
    row.appendChild(editB); row.appendChild(delB);
    sec.appendChild(row);
  });
  container.appendChild(sec);
}

function openEnfantEntry(e, parentId){
  const isEdit = !!e;
  const body = makeEl('div');
  body.appendChild(makeFF('Prénom (facultatif)', makeInput('en-prenom', isEdit ? e.prenom : '')));
  body.appendChild(makeFF('Année de naissance', makeInput('en-annee', isEdit ? e.annee_naissance : '')));
  const cancelB = makeEl('button', { class: 'abtn' }, 'Annuler'); cancelB.onclick = closeModal;
  const saveB = makeEl('button', { class: 'abtn primary' }, isEdit ? 'Enregistrer' : 'Ajouter');
  saveB.onclick = async () => {
    const annee = Number(document.getElementById('en-annee').value);
    if (!annee || annee < 1900 || annee > new Date().getFullYear()){ alert('Année de naissance invalide.'); return; }
    const entry = { prenom: document.getElementById('en-prenom').value.trim() || null, annee_naissance: annee };
    const res = isEdit ? await sb.from('enfants_usagers').update(entry).eq('id', e.id) : await sb.from('enfants_usagers').insert({ ...entry, parent_user_id: parentId });
    if (res.error){ alert('Erreur : ' + res.error.message); return; }
    closeModal(); switchAdminTab('enfants');
  };
  showModal(isEdit ? "Éditer l'enfant" : 'Nouvel enfant', body, [cancelB, saveB]);
}

// ---------- Acronymes ----------
async function renderAdminAcronymes(container){
  const res = await sb.from('acronymes').select('*').neq('categorie', 'Identite_Visuelle').order('categorie').order('ordre');
  if (res.error){ container.innerHTML = ''; container.appendChild(makeEl('div', { style: { color: '#f87171', fontSize: '11px' } }, 'Erreur : ' + res.error.message)); return; }
  const rows = res.data || [];
  container.innerHTML = '';
  ACR_CATS.forEach(cat => {
    const catItems = rows.filter(a => a.categorie === cat).sort((a, b) => (a.ordre || 0) - (b.ordre || 0));
    const sec = makeEl('div', { class: 'admin-sec' });
    const head = makeEl('div', { style: { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' } });
    head.appendChild(makeEl('div', { class: 'admin-cat' }, ACR_CAT_NAMES[cat] || cat));
    const addB = makeEl('button', { class: 'abtn primary', style: { marginLeft: 'auto' } }, '+ Ajouter');
    addB.onclick = async () => {
      const id = prompt("Identifiant (code) du nouvel élément de " + (ACR_CAT_NAMES[cat] || cat) + " :", '');
      if (id === null) return;
      const idT = id.trim(); if (!idT){ alert('Identifiant vide.'); return; }
      if (rows.some(x => x.categorie === cat && x.id === idT)){ alert('Cet identifiant existe déjà dans cette table.'); return; }
      const des = prompt('Désignation (libellé) :', ''); if (des === null) return;
      const maxO = Math.max(0, ...rows.filter(x => x.categorie === cat).map(x => x.ordre || 0));
      const ins = await sb.from('acronymes').insert({ id: idT, categorie: cat, ordre: maxO + 1, designation: des.trim(), couleur: '#64748B' });
      if (ins.error){ alert('Erreur : ' + ins.error.message); return; }
      switchAdminTab('acr');
    };
    head.appendChild(addB);
    sec.appendChild(head);
    if (!catItems.length) sec.appendChild(makeEl('div', { class: 'admin-empty' }, '(vide)'));
    catItems.forEach(a => sec.appendChild(acronymRow(a, cat, rows)));
    container.appendChild(sec);
  });
}

function acronymRow(a, cat, allRows){
  const row = makeEl('div', { class: 'admin-row' });
  if (ACR_EDIT_ID_CATS.indexOf(cat) >= 0){
    const idInp = makeEl('input', { value: a.id, title: 'Signe / clé (éditable)', style: { fontFamily: 'monospace', width: '60px', textAlign: 'center' } });
    idInp.onchange = async () => {
      const nv = (idInp.value || '').trim();
      if (!nv){ alert('Le signe ne peut pas être vide.'); idInp.value = a.id; return; }
      if (nv === a.id) return;
      if (allRows.some(x => x.categorie === cat && x.id === nv)){ alert('Ce signe existe déjà dans cette table.'); idInp.value = a.id; return; }
      const ins = await sb.from('acronymes').insert({ ...a, id: nv });
      if (ins.error){ alert('Erreur : ' + ins.error.message); idInp.value = a.id; return; }
      await sb.from('acronymes').delete().eq('id', a.id).eq('categorie', cat);
      switchAdminTab('acr');
    };
    row.appendChild(idInp);
  } else {
    row.appendChild(makeEl('span', { style: { fontFamily: 'monospace', fontSize: '13px', minWidth: '60px' } }, a.id));
  }
  const desInp = makeEl('input', { value: a.designation || '', placeholder: 'désignation...', style: { flex: '1', minWidth: '110px' } });
  desInp.onchange = async () => { const u = await sb.from('acronymes').update({ designation: desInp.value }).eq('id', a.id).eq('categorie', cat); if (u.error) alert('Erreur : ' + u.error.message); };
  row.appendChild(desInp);

  const prev = makeEl('span', { class: 'acr-badge', style: { background: (a.couleur || '#555') + '33', color: a.couleur || '#555', borderColor: (a.couleur || '#555') + '88' } }, a.id);
  const picker = document.createElement('input');
  picker.type = 'color'; picker.value = a.couleur || '#555555';
  picker.style.cssText = 'width:28px;height:22px;border:1px solid var(--border2);border-radius:4px;cursor:pointer;padding:1px;background:transparent';
  picker.oninput = async () => {
    prev.style.background = picker.value + '33'; prev.style.color = picker.value; prev.style.borderColor = picker.value + '88';
    const u = await sb.from('acronymes').update({ couleur: picker.value }).eq('id', a.id).eq('categorie', cat);
    if (u.error) alert('Erreur : ' + u.error.message);
  };
  row.appendChild(picker); row.appendChild(prev);

  const iw = makeEl('div', { style: { display: 'flex', alignItems: 'center', gap: '5px' } });
  if (acrIconSrc(a)){
    const img = makeEl('img', { style: { width: '16px', height: '16px', objectFit: 'contain' } }); img.src = acrIconSrc(a);
    iw.appendChild(img);
    const del = makeEl('button', { class: 'abtn danger' }, 'x');
    del.onclick = async () => { const u = await sb.from('acronymes').update({ icon_svg: null, icon_base64: null }).eq('id', a.id).eq('categorie', cat); if (u.error) alert('Erreur : ' + u.error.message); else switchAdminTab('acr'); };
    iw.appendChild(del);
  } else {
    const up = makeEl('button', { class: 'abtn' }, '+ Icône');
    up.onclick = () => {
      const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.png,.ico,.jpg,.jpeg,.gif,.svg'; inp.style.display = 'none';
      inp.onchange = e => {
        const file = e.target.files[0]; if (!file) return;
        const isSvg = file.type === 'image/svg+xml' || /\.svg$/i.test(file.name);
        const rd = new FileReader();
        rd.onload = async ev => {
          const patch = isSvg ? { icon_svg: ev.target.result, icon_base64: null } : { icon_base64: ev.target.result.split(',')[1], icon_svg: null };
          const u = await sb.from('acronymes').update(patch).eq('id', a.id).eq('categorie', cat);
          if (u.error) alert('Erreur : ' + u.error.message); else switchAdminTab('acr');
        };
        if (isSvg) rd.readAsText(file); else rd.readAsDataURL(file);
      };
      document.body.appendChild(inp); inp.click(); setTimeout(() => { if (inp.parentNode) document.body.removeChild(inp); }, 30000);
    };
    iw.appendChild(up);
  }
  row.appendChild(iw);

  const delRow = makeEl('button', { class: 'abtn danger' }, 'Supprimer');
  delRow.onclick = async () => {
    if (!confirm("Supprimer '" + a.id + "' de la table " + (ACR_CAT_NAMES[cat] || cat) + " ?")) return;
    const del = await sb.from('acronymes').delete().eq('id', a.id).eq('categorie', cat);
    if (del.error) alert('Erreur : ' + del.error.message); else switchAdminTab('acr');
  };
  row.appendChild(delRow);
  return row;
}

// ---------- Competences ----------
async function renderAdminCompetences(container){
  const res = await sb.from('competences').select('id,label').order('label');
  if (res.error){ container.innerHTML = ''; container.appendChild(makeEl('div', { style: { color: '#f87171', fontSize: '11px' } }, 'Erreur : ' + res.error.message)); return; }
  const rows = res.data || [];
  container.innerHTML = '';
  const sec = makeEl('div', { class: 'admin-sec' });
  sec.appendChild(makeEl('div', { class: 'admin-cat' }, 'Compétences Métier (liste maîtresse)'));
  const addRow = makeEl('div', { style: { display: 'flex', gap: '6px', margin: '8px 0' } });
  const newComp = makeEl('input', { placeholder: 'Nouvelle compétence...', style: { flex: '1' } });
  const addBtn = makeEl('button', { class: 'abtn primary' }, '+ Ajouter');
  addBtn.onclick = async () => {
    const v = newComp.value.trim();
    if (!v) return;
    if (rows.some(r => r.label === v)){ alert('Cette compétence existe déjà.'); return; }
    const ins = await sb.from('competences').insert({ label: v });
    if (ins.error){ alert('Erreur : ' + ins.error.message); return; }
    switchAdminTab('comp');
  };
  appendChildren(addRow, newComp, addBtn); sec.appendChild(addRow);
  if (!rows.length) sec.appendChild(makeEl('div', { class: 'admin-empty' }, '(aucune)'));
  rows.forEach(c => {
    const row = makeEl('div', { class: 'admin-row' });
    row.appendChild(makeEl('span', { style: { flex: '1', fontSize: '11px' } }, c.label));
    const del = makeEl('button', { class: 'abtn danger' }, 'x');
    del.onclick = async () => {
      if (!confirm("Supprimer la compétence '" + c.label + "' ?")) return;
      const d = await sb.from('competences').delete().eq('id', c.id);
      if (d.error) alert('Erreur : ' + d.error.message); else switchAdminTab('comp');
    };
    row.appendChild(del); sec.appendChild(row);
  });
  container.appendChild(sec);
}

// ---------- Lexique ----------
async function renderAdminLexique(container){
  const res = await sb.from('lexique').select('*').order('expression');
  if (res.error){ container.innerHTML = ''; container.appendChild(makeEl('div', { style: { color: '#f87171', fontSize: '11px' } }, 'Erreur : ' + res.error.message)); return; }
  const rows = res.data || [];
  container.innerHTML = '';
  const sec = makeEl('div', { class: 'admin-sec' });
  const head = makeEl('div', { style: { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' } });
  head.appendChild(makeEl('div', { class: 'admin-cat' }, 'Lexique (' + rows.length + ' terme(s))'));
  const addB = makeEl('button', { class: 'abtn primary', style: { marginLeft: 'auto' } }, '+ Nouveau terme');
  addB.onclick = () => openLexEntry(null);
  head.appendChild(addB); sec.appendChild(head);
  if (!rows.length) sec.appendChild(makeEl('div', { class: 'admin-empty' }, '(aucun terme)'));
  rows.forEach(e => {
    const card = makeEl('div', { style: { background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: '8px', padding: '10px 12px', marginBottom: '8px' } });
    const headRow = makeEl('div', { style: { display: 'flex', alignItems: 'baseline', gap: '8px', flexWrap: 'wrap' } });
    headRow.appendChild(makeEl('span', { style: { fontSize: '14px', fontWeight: 'bold', color: 'var(--brand-pink)' } }, e.expression || ''));
    if (e.equivalence) headRow.appendChild(makeEl('span', { style: { fontSize: '11px', color: 'var(--text3)', fontStyle: 'italic' } }, '= ' + e.equivalence));
    if (e.acronyme && e.acronyme !== e.expression) headRow.appendChild(makeEl('span', { style: { fontSize: '10px', fontFamily: 'monospace', color: 'var(--text3)', border: '1px solid var(--border2)', borderRadius: '4px', padding: '0 5px' } }, e.acronyme));
    headRow.appendChild(makeEl('span', { style: { flex: '1' } }));
    const editB = makeEl('button', { class: 'abtn' }, 'Éditer');
    editB.onclick = () => openLexEntry(e);
    const delB = makeEl('button', { class: 'abtn danger' }, 'Supprimer');
    delB.onclick = async () => {
      if (!confirm('Supprimer ce terme du lexique ?')) return;
      const d = await sb.from('lexique').delete().eq('id', e.id);
      if (d.error) alert('Erreur : ' + d.error.message); else switchAdminTab('lex');
    };
    headRow.appendChild(editB); headRow.appendChild(delB);
    card.appendChild(headRow);
    if ((e.domaines || []).length){
      const dbox = makeEl('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '4px', margin: '6px 0' } });
      e.domaines.forEach(d => dbox.appendChild(makeEl('span', { style: { background: '#1c2e1c', color: '#86efac', border: '1px solid #16653444', borderRadius: '4px', padding: '1px 8px', fontSize: '10px' } }, d)));
      card.appendChild(dbox);
    }
    if (e.definition) card.appendChild(makeEl('div', { style: { fontSize: '12px', color: 'var(--text2)', lineHeight: '1.5', marginTop: '4px', whiteSpace: 'pre-wrap' } }, e.definition));
    sec.appendChild(card);
  });
  container.appendChild(sec);
}

async function getLexiqueDomaines(){
  const [lexRes, domRes] = await Promise.all([
    sb.from('lexique').select('domaines'),
    sb.from('lexique_domaines').select('label')
  ]);
  const s = {};
  (domRes.data || []).forEach(r => { s[r.label] = true; });
  (lexRes.data || []).forEach(r => (r.domaines || []).forEach(d => { s[d] = true; }));
  return Object.keys(s).sort();
}

function makeDomaineWidget(current, allDomaines){
  const st = { vals: (current || []).slice() };
  const wrap = makeEl('div', { class: 'ff' });
  wrap.appendChild(makeEl('label', {}, 'Domaines d\'application (mots-clés)'));
  const box = makeEl('div', { style: { border: '1px solid var(--border2)', borderRadius: '6px', padding: '4px', background: 'var(--bg3)', display: 'flex', flexWrap: 'wrap', gap: '4px', alignItems: 'center', minHeight: '36px' } });
  const listId = 'dom-list-' + Math.random().toString(36).slice(2, 7);
  const inp = makeEl('input', { placeholder: 'Taper ou choisir...', list: listId, style: { flex: '1', minWidth: '120px', border: 'none', background: 'transparent', width: 'auto' } });
  const datalist = makeEl('datalist', { id: listId });
  allDomaines.forEach(d => datalist.appendChild(makeEl('option', { value: d })));
  function render(){
    box.innerHTML = '';
    st.vals.forEach((v, i) => {
      const tag = makeEl('span', { style: { display: 'inline-flex', alignItems: 'center', gap: '4px', background: '#1c2e1c', color: '#86efac', border: '1px solid #16653444', borderRadius: '4px', padding: '1px 6px', fontSize: '10px' } }, v);
      const x = makeEl('span', { style: { cursor: 'pointer', color: '#f87171', fontWeight: 'bold' } }, 'x');
      x.onclick = () => { st.vals.splice(i, 1); render(); };
      tag.appendChild(x); box.appendChild(tag);
    });
    box.appendChild(inp);
  }
  function add(v){
    v = (v || '').trim(); if (!v) return;
    if (st.vals.indexOf(v) < 0) st.vals.push(v);
    if (allDomaines.indexOf(v) < 0) allDomaines.push(v);
    inp.value = ''; render();
  }
  inp.onkeydown = e => {
    if (e.key === 'Enter' || e.key === ','){ e.preventDefault(); add(inp.value); }
    else if (e.key === 'Backspace' && inp.value === '' && st.vals.length){ st.vals.pop(); render(); }
  };
  inp.onchange = () => { if (inp.value) add(inp.value); };
  render();
  wrap.appendChild(box); wrap.appendChild(datalist);
  wrap._getVals = () => st.vals;
  return wrap;
}

async function openLexEntry(e){
  const isEdit = !!e;
  const allDomaines = await getLexiqueDomaines();
  const body = makeEl('div');
  body.appendChild(makeFF('Expression utilisée', makeInput('lx-expr', isEdit ? e.expression : '')));
  body.appendChild(makeFF('Équivalence', makeInput('lx-equiv', isEdit ? e.equivalence : '')));
  body.appendChild(makeFF('Acronyme', makeInput('lx-acr', isEdit ? e.acronyme : '')));
  const domW = makeDomaineWidget(isEdit ? e.domaines : [], allDomaines);
  body.appendChild(domW);
  body.appendChild(makeFF('Définition', makeTextarea('lx-def', isEdit ? e.definition : '')));
  const cancelB = makeEl('button', { class: 'abtn' }, 'Annuler'); cancelB.onclick = closeModal;
  const saveB = makeEl('button', { class: 'abtn primary' }, isEdit ? 'Enregistrer' : 'Ajouter');
  saveB.onclick = async () => {
    const expr = document.getElementById('lx-expr').value.trim();
    if (!expr){ alert("L'expression est obligatoire."); return; }
    const entry = {
      expression: expr,
      equivalence: document.getElementById('lx-equiv').value.trim(),
      acronyme: document.getElementById('lx-acr').value.trim(),
      domaines: domW._getVals(),
      definition: document.getElementById('lx-def').value.trim()
    };
    const res = isEdit ? await sb.from('lexique').update(entry).eq('id', e.id) : await sb.from('lexique').insert(entry);
    if (res.error){ alert('Erreur : ' + res.error.message); return; }
    const existingLabels = (await sb.from('lexique_domaines').select('label')).data.map(r => r.label);
    const toInsert = entry.domaines.filter(d => !existingLabels.includes(d)).map(d => ({ label: d }));
    if (toInsert.length) await sb.from('lexique_domaines').insert(toInsert);
    closeModal(); switchAdminTab('lex');
  };
  showModal(isEdit ? 'Éditer un terme' : 'Nouveau terme', body, [cancelB, saveB]);
}

// ---------- Entreprises / Administrations (sous-traitants FBS/RFQ + exploitants StatSan/SpotSan) ----------
async function renderAdminBE(container){
  const res = await sb.from('contractors').select('*').order('nom');
  if (res.error){ container.innerHTML = ''; container.appendChild(makeEl('div', { style: { color: '#f87171', fontSize: '11px' } }, 'Erreur : ' + res.error.message)); return; }
  const rows = res.data || [];
  container.innerHTML = '';
  const sec = makeEl('div', { class: 'admin-sec' });
  const head = makeEl('div', { style: { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' } });
  head.appendChild(makeEl('div', { class: 'admin-cat' }, 'Entreprises / Administrations'));
  const addB = makeEl('button', { class: 'abtn primary', style: { marginLeft: 'auto' } }, '+ Nouvelle entrée');
  addB.onclick = () => openBEModal(null);
  head.appendChild(addB); sec.appendChild(head);
  sec.appendChild(makeEl('div', { style: { fontSize: '10px', color: 'var(--text3)', marginBottom: '6px' } }, "Fiche entreprise (sous-traitant FBS/RFQ) ou administration exploitante (StatSan, futur paramétrage SpotSan), utilisée pour rattacher un profil Utilisateur à une société."));
  if (!rows.length) sec.appendChild(makeEl('div', { class: 'admin-empty' }, '(aucune entrée déclarée)'));
  rows.forEach(c => {
    const row = makeEl('div', { class: 'admin-row' });
    row.appendChild(makeEl('span', { style: { fontSize: '12px', fontWeight: 'bold', color: 'var(--brand-pink)', minWidth: '120px' } }, c.nom || '(sans nom)'));
    row.appendChild(makeEl('span', { style: { fontSize: '10px', color: 'var(--text3)', border: '1px solid var(--border2)', borderRadius: '999px', padding: '1px 7px' } }, c.type));
    row.appendChild(makeEl('span', { style: { flex: '1', fontSize: '11px', color: 'var(--text3)' } }, c.contact || ''));
    if (c.adresse) row.appendChild(makeEl('span', { style: { fontSize: '10px', color: 'var(--text3)' } }, c.adresse));
    const ed = makeEl('button', { class: 'abtn' }, 'Éditer'); ed.onclick = () => openBEModal(c);
    const dl = makeEl('button', { class: 'abtn danger' }, 'Supprimer');
    dl.onclick = async () => {
      if (!confirm('Supprimer cette entrée ?')) return;
      const d = await sb.from('contractors').delete().eq('id', c.id);
      if (d.error) alert('Erreur : ' + d.error.message); else switchAdminTab('be');
    };
    row.appendChild(ed); row.appendChild(dl);
    sec.appendChild(row);
  });
  container.appendChild(sec);
}

function openBEModal(c){
  const isEdit = !!c;
  const body = makeEl('div');
  const typeSel = document.createElement('select');
  typeSel.id = 'be-type';
  typeSel.style.cssText = 'width:100%;padding:10px 12px;border-radius:8px;border:1px solid var(--border);background:var(--bg3);color:var(--text);font-size:13.5px';
  ["Bureau d'Études", 'Exploitant'].forEach(t => typeSel.appendChild(makeEl('option', { value: t }, t)));
  typeSel.value = isEdit ? c.type : "Bureau d'Études";
  body.appendChild(makeFF('Type', typeSel));
  body.appendChild(makeFF('Nom', makeInput('be-nom', isEdit ? c.nom : '', 'Ex: Acme Engineering, ou Mairie de...')));
  body.appendChild(makeFF('Contact (email)', makeInput('be-contact', isEdit ? c.contact : '', 'Ex: contact@acme.fr')));
  body.appendChild(makeFF('Adresse', makeTextarea('be-adresse', isEdit ? c.adresse : '')));
  const cancelB = makeEl('button', { class: 'abtn' }, 'Annuler'); cancelB.onclick = closeModal;
  const saveB = makeEl('button', { class: 'abtn primary' }, isEdit ? 'Enregistrer' : 'Créer');
  saveB.onclick = async () => {
    const nom = document.getElementById('be-nom').value.trim();
    if (!nom){ alert('Le nom est obligatoire.'); return; }
    const type = document.getElementById('be-type').value;
    const contact = document.getElementById('be-contact').value.trim();
    const adresse = document.getElementById('be-adresse').value.trim();
    const res = isEdit
      ? await sb.from('contractors').update({ nom, type, contact, adresse }).eq('id', c.id)
      : await sb.from('contractors').insert({ id: 'BE-' + Date.now().toString(36), nom, type, contact, adresse, owner_id: currentUserId });
    if (res.error){ alert('Erreur : ' + res.error.message); return; }
    closeModal(); switchAdminTab('be');
  };
  showModal(isEdit ? "Éditer l'entrée" : 'Nouvelle entrée', body, [cancelB, saveB]);
}

// ---------- Profils utilisateur ----------
async function renderAdminUsers(container){
  const [profRes, accessRes, ctrRes] = await Promise.all([
    sb.from('profiles').select('id,email,display_name,company_id').order('email'),
    sb.from('tool_access').select('user_id,tool,role'),
    sb.from('contractors').select('id,nom').order('nom')
  ]);
  if (profRes.error || accessRes.error || ctrRes.error){
    container.innerHTML = '';
    container.appendChild(makeEl('div', { style: { color: '#f87171', fontSize: '11px' } }, 'Erreur : ' + (profRes.error || accessRes.error || ctrRes.error).message));
    return;
  }
  const profiles = profRes.data || [];
  const access = {};
  (accessRes.data || []).forEach(r => { access[r.user_id + '|' + r.tool] = r.role; });
  const contractors = ctrRes.data || [];
  container.innerHTML = '';

  const inviteSec = makeEl('div', { class: 'admin-sec' });
  inviteSec.appendChild(makeEl('div', { class: 'admin-cat' }, 'Inviter un utilisateur'));
  inviteSec.appendChild(makeEl('div', { style: { fontSize: '10px', color: 'var(--text3)', marginBottom: '8px' } }, "Envoie un email d'invitation Supabase — la personne choisit elle-même son mot de passe. Elle apparaîtra dans la liste ci-dessous une fois son compte créé."));
  const inviteRow = makeEl('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'flex-end' } });
  const emailInp = makeEl('input', { type: 'email', placeholder: 'email@exemple.com', style: { flex: '1', minWidth: '160px' } });
  const companySel = document.createElement('select');
  companySel.style.cssText = 'background:var(--bg3);border:1px solid var(--border2);border-radius:5px;padding:6px 8px;color:var(--text);font-size:11px;font-family:inherit';
  companySel.appendChild(makeEl('option', { value: '' }, "Entreprise (optionnel)"));
  contractors.forEach(c => companySel.appendChild(makeEl('option', { value: c.id }, c.nom)));
  const inviteBtn = makeEl('button', { class: 'abtn primary' }, 'Inviter');
  inviteBtn.onclick = async () => {
    const email = emailInp.value.trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){ alert('Adresse email invalide.'); return; }
    if (!confirm("Envoyer une invitation par email à " + email + " ?")) return;
    inviteBtn.disabled = true; inviteBtn.textContent = 'Envoi...';
    try {
      const session = (await sb.auth.getSession()).data.session;
      const resp = await fetch(SUPABASE_URL + '/functions/v1/admin-invite-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + session.access_token },
        body: JSON.stringify({ email })
      });
      const out = await resp.json();
      if (!resp.ok){ alert('Erreur : ' + (out.error || resp.status)); return; }
      if (companySel.value){
        await sb.from('profiles').update({ company_id: companySel.value }).eq('id', out.user_id);
      }
      alert('Invitation envoyée à ' + out.email + '.');
      emailInp.value = ''; companySel.value = '';
      switchAdminTab('users');
    } catch (e){
      alert('Erreur : ' + (e.message || e));
    } finally {
      inviteBtn.disabled = false; inviteBtn.textContent = 'Inviter';
    }
  };
  appendChildren(inviteRow, emailInp, companySel, inviteBtn);
  inviteSec.appendChild(inviteRow);
  container.appendChild(inviteSec);

  const listSec = makeEl('div', { class: 'admin-sec' });
  listSec.appendChild(makeEl('div', { class: 'admin-cat' }, 'Profils et droits d\'accès'));
  if (!profiles.length) listSec.appendChild(makeEl('div', { class: 'admin-empty' }, '(aucun compte)'));
  profiles.forEach(p => {
    const row = makeEl('div', { class: 'admin-row', style: { alignItems: 'flex-start' } });
    const idCol = makeEl('div', { style: { flex: '1', minWidth: '160px' } });
    idCol.appendChild(makeEl('div', { style: { fontSize: '11px' } }, p.email || p.display_name || p.id));
    const compSel = document.createElement('select');
    compSel.style.cssText = 'margin-top:4px;background:var(--bg3);border:1px solid var(--border2);border-radius:5px;padding:2px 6px;color:var(--text2);font-size:10px;font-family:inherit';
    compSel.appendChild(makeEl('option', { value: '' }, "Aucune entreprise"));
    contractors.forEach(c => compSel.appendChild(makeEl('option', { value: c.id }, c.nom)));
    compSel.value = p.company_id || '';
    compSel.onchange = async () => {
      const u = await sb.from('profiles').update({ company_id: compSel.value || null }).eq('id', p.id);
      if (u.error) alert('Erreur : ' + u.error.message);
    };
    idCol.appendChild(compSel);
    row.appendChild(idCol);
    ADMIN_TOOLS.forEach(t => {
      const cw = makeEl('div', { style: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' } });
      cw.appendChild(makeEl('span', { style: { fontSize: '9px', color: 'var(--text3)' } }, t.label));
      const sel = document.createElement('select');
      sel.style.cssText = 'font-family:inherit;font-size:10px;background:var(--bg3);border:1px solid var(--border2);border-radius:4px;color:var(--text);padding:2px 4px';
      [['', 'Aucun accès'], ['user', 'Utilisateur'], ['admin', 'Admin']].forEach(o => {
        const opt = document.createElement('option'); opt.value = o[0]; opt.textContent = o[1]; sel.appendChild(opt);
      });
      sel.value = access[p.id + '|' + t.key] || '';
      sel.setAttribute('data-prev', sel.value);
      sel.onchange = () => setToolAccess(p.id, t.key, sel.value, sel);
      cw.appendChild(sel);
      row.appendChild(cw);
    });
    listSec.appendChild(row);
  });
  container.appendChild(listSec);
}

async function setToolAccess(userId, tool, role, selEl){
  const prevValue = selEl.getAttribute('data-prev') || '';
  selEl.disabled = true;
  try {
    if (!role){
      const del = await sb.from('tool_access').delete().eq('user_id', userId).eq('tool', tool);
      if (del.error) throw del.error;
    } else {
      const up = await sb.from('tool_access').upsert({ user_id: userId, tool, role, granted_by: currentUserId }, { onConflict: 'user_id,tool' });
      if (up.error) throw up.error;
    }
    selEl.setAttribute('data-prev', role);
  } catch (e){
    alert('Erreur mise à jour des accès : ' + (e.message || e));
    selEl.value = prevValue;
  } finally {
    selEl.disabled = false;
  }
}

loadEkomaLogo();

(async () => {
  const { data } = await sb.auth.getSession();
  if (data.session && data.session.user){
    await onAuthenticated(data.session.user);
  }
})();

if ('serviceWorker' in navigator){
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
