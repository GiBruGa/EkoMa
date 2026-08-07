# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

EkoMa is the UrBizia access portal: users sign in once with Supabase Auth, see the list of tools
they've been granted (`tool_access` table), and land on the one they click. It also hosts the
shared Administration panel (reference data used by several tools: acronymes/icônes, compétences,
lexique, bureaux d'études, profils utilisateur). No build step — static files, opened directly or
served by any static file server.

## Files

- `index.html` — markup only (login screen, tool list, admin panel, modals).
- `style.css` — all styling.
- `app.js` — all logic: sign-in, tool list rendering, admin panel CRUD. Loaded after the Supabase
  SDK (`<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2">`).
- `auth-gate.js` — **not used by EkoMa itself** (EkoMa has its own full login screen). This is a
  shared module published for satellite tools that are gated *behind* EkoMa: instead of showing
  their own login form, they show an "open this from EkoMa" overlay and defer the actual
  Supabase session check to this file. Consumed today by FBS and RFQ (repo
  `Functional-Breakdown-Structure`), loaded via `https://gibruga.github.io/EkoMa/auth-gate.js`.
  StatSan does **not** use it — it has its own lower-level auth implementation (raw `fetch()`
  against the Supabase REST API instead of the JS SDK); see StatSan's own CLAUDE.md.
  See the header comment in `auth-gate.js` for the calling contract.
- `sw.js` / `manifest.json` / `icon-*.png` — PWA plumbing.

## Architecture

`TOOLS` (in `app.js`) is the list of tools EkoMa can route to, keyed by the same string used in
`tool_access.tool` — note some keys are historical (`pointsan_desktop` for what's user-facing
called "StatSan") and are deliberately not renamed to avoid a data migration for a cosmetic change.

The Administration panel (`ADMIN_TOOLS`, `switchAdminTab`, `renderAdmin*`) edits reference data
shared across tools via Supabase tables directly (`acronymes`, `competences`, `lexique`,
`contractors`, `profiles`, `tool_access`) — there's no backend beyond Supabase (tables + RLS +
a couple of RPCs/Edge Functions such as `has_tool_access` and `admin-invite-user`).

`loadEkomaLogo()` fetches the vector logo from `acronymes` (id `EkoMa`) so the visual identity can
be updated without a deploy; the CSS `.logo:empty` rule is the silent fallback while that loads.

## Conventions specific to this codebase

- French throughout: UI strings, comments, domain terms.
- No framework, no bundler — `app.js` is one global script, DOM built via a small `makeEl` /
  `appendChildren` helper pair rather than `innerHTML` string-building for the admin panel.
