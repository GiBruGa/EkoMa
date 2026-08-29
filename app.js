// app.js — logique d'EkoMa (portail d'accès UrBizia).
// Ce fichier est chargé par index.html après le SDK Supabase (voir <script> en fin de body).
// Sections : (1) connexion + liste des outils accessibles, (2) chargement du logo vectoriel
// partagé, (3) panneau d'Administration (données de référence partagées entre tous les outils).

// ---------- Connexion & liste des outils ----------
const SUPABASE_URL = 'https://mnsfstjgrueyuvejfvvk.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1uc2ZzdGpncnVleXV2ZWpmdnZrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5NDI2MDgsImV4cCI6MjA5OTUxODYwOH0.Nb8d-b3zvXYqbl95PjkNrR12WXnVanJMGJzRU2-UpI4';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const APP_VERSION = 'v1.0';
let currentUserId = null;
let isAdminUser = false;
document.title = 'EkoMa ' + APP_VERSION;
document.getElementById('about-version').textContent = APP_VERSION + ' — Août 2026';

// Ordre d'affichage des outils dans EkoMa. La clé (`key`) correspond à tool_access.tool en base
// (des noms internes historiques — ex. StatSan garde la clé "pointsan_desktop" malgré son renommage,
// pour éviter une migration de données pour un simple changement cosmétique).
const TOOLS = [
  { key: 'fbs', name: 'FBS', desc: 'Arborescence fonctionnelle', dot: '#3b82f6', url: 'https://gibruga.github.io/Functional-Breakdown-Structure/FBS.html' },
  { key: 'rfq', name: 'RFQ', desc: "Appels d'offres et devis", dot: '#0d9488', url: 'https://gibruga.github.io/Functional-Breakdown-Structure/rfq.html' },
  { key: 'pointsan_desktop', name: 'StatSan', desc: 'Curation et études terrain (sanitaires)', dot: '#C46E8A', url: 'https://gibruga.github.io/StatSan/' }
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
document.getElementById('logout').addEventListener('click', async () => {
  try { await sb.auth.signOut(); } catch(e){}
  currentUserId = null;
  isAdminUser = false;
  document.getElementById('btn-admin-open').style.display = 'none';
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

async function doSignIn(){
  const email = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value;
  const errEl = document.getElementById('auth-error');
  errEl.textContent = '';
  if (!email || !password){ errEl.textContent = 'Renseigne ton email et ton mot de passe.'; return; }
  const btn = document.getElementById('auth-submit');
  btn.disabled = true; btn.textContent = 'Connexion…';
  const res = await sb.auth.signInWithPassword({ email, password });
  btn.disabled = false; btn.textContent = 'Se connecter';
  if (res.error){ errEl.textContent = 'Identifiants invalides.'; return; }
  await onAuthenticated(res.data.user);
}

async function onAuthenticated(user){
  currentUserId = user.id;
  document.getElementById('user-email').textContent = user.email;
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

  // Palier "Utilisateur" (voir memoire project-pointsan-access-tiers) : obligation de rattacher
  // son compte a une entreprise/administration avant d'entrer, sauf pour les Admin (deja acces
  // sans restriction) et les comptes sans aucun acces outil (rien a debloquer de toute facon).
  if (!isAdminUser && Object.keys(access).length){
    const profRes = await sb.from('profiles').select('company_id').eq('id', user.id).single();
    if (!profRes.error && !profRes.data.company_id){
      showEntrepriseGate(access);
      return;
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
    el.addEventListener('click', () => { location.href = t.url; });
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
  { key: 'pointsan_mobile', label: 'SpotSan' }
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
  switchAdminTab('acr');
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
  if (tab === 'acr') renderAdminAcronymes(c);
  else if (tab === 'comp') renderAdminCompetences(c);
  else if (tab === 'lex') renderAdminLexique(c);
  else if (tab === 'be') renderAdminBE(c);
  else if (tab === 'users') renderAdminUsers(c);
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
