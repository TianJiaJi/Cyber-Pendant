# CLAUDE.md

This file gives coding agents the current project map, guardrails, and verification commands for Cyber-Pendant. Keep it aligned with runtime behavior, not old plans.

## Project Overview

Cyber-Pendant is a digital school-uniform hang-tag system.

- Users scan a traditional square QR code or enter an SN to view garment traceability.
- WeChat users can log in, bind student/contact information, report a lost garment, and reveal contact details when a garment is marked lost.
- Admins manage clothing master data, production batches, SN records, users, lost reports, statistics, QR links, and exports.

Monorepo layout:

- `client/`: uni-app + Vue 3 user client for H5 and WeChat Mini Program.
- `server/`: Node.js ESM API using built-in `node:http` and `node:sqlite`.
- `server/admin/`: standalone Vue 3 + Vite admin console served by the backend after build.
- `data/`: runtime SQLite data, gitignored.
- `memory/`: design, operations, security, and current-state documentation.

## Requirements

- Node.js >= 24.0.0

## Commands

```bash
# Install all dependencies
npm --prefix server install
npm --prefix client install
npm --prefix server/admin install

# Development
npm run dev          # backend with auto-prepared admin console
npm run dev:server   # same backend dev server
npm run dev:client   # uni -p h5
npm --prefix client run dev:mp-weixin
npm run dev:admin    # optional admin hot reload server

# Build
npm start
npm run build:client
npm --prefix client run build:mp-weixin
npm run build:admin

# Tests and static checks
npm test
node --test client/test/fixed-header-layout.test.js
node --test server/admin/test/admin-ui.test.js
```

## Current Architecture

### Server

Entry point: `server/src/index.js` -> `server/src/api.js`.

Core modules:

- `api.js`: manual routing, public/admin/user APIs, CORS, admin SPA static hosting, QR generation.
- `db.js`: SQLite schema, migrations, seed data, CRUD, binding logs, lost reports, stats, exports.
- `auth.js`: PBKDF2 admin passwords, HMAC tokens, WeChat `code2session`.
- `config.js`: `.env` loading, runtime defaults, path resolution.
- `sn.js`: SN generation: `CP{YYYYMMDD}{6-char-alphanum}`, excluding `0`, `O`, `I`, `1`.
- `prepare-admin.js`: auto-installs/builds `server/admin` when hosted assets are missing or stale.

Important boundaries:

- Admin APIs must call `requireAdmin`.
- User-only APIs must call `requireUser` and authorize against database ownership.
- Public lookup must not return full contact details unless the dedicated contact reveal flow allows it.
- User token and admin token are separate token types.
- QR generation is traditional square QR only; do not reintroduce WeChat round mini-program code generation without an explicit product decision.

### Client

Important files:

- `client/src/pages/index/index.vue`: home, SN entry, scan entry.
- `client/src/pages/garment/detail.vue`: public detail, binding, lost report, contact reveal.
- `client/src/pages/login/index.vue`: WeChat login.
- `client/src/pages/user/index.vue`: user center.
- `client/src/utils/api.js`: user API wrapper and token storage.
- `client/src/utils/scanner.js`: H5 / WeChat scan parsing.
- `client/src/components/AppFooter.vue`: two-tab footer.

Client constraints:

- User-visible text should stay product-facing; do not expose implementation jargon.
- The client is not trusted for authorization or privacy decisions.
- WeChat Mini Program pages use custom navigation. Topbars need right-side space for the system capsule.
- Buttons in mini-program pages should use the known inline-arrow workaround for click handlers.

### Admin Console

Important files:

- `server/admin/src/router.js`: hash routes.
- `server/admin/src/views/DashboardView.vue`: overview, users, stats, exports.
- `server/admin/src/views/ClothingDetailView.vue`: master data, batches, SN tools, QR mode, exports.
- `server/admin/src/utils/api.js`: admin API wrapper.

Routes:

```text
#/login
#/dashboard
#/clothes/:id
```

## QR Code Policy

The product now uses traditional square QR codes.

- Default QR URL: `/api/qrcode/{sn}?type=url`.
- QR payload: `${FRONTEND_BASE_URL}/#/pages/garment/detail?sn={SN}`.
- `type=sn` is still supported for raw-SN QR payloads.
- Legacy `type=mini-program` falls back to square link QR.
- Admin exports should describe QR codes as traditional square QR codes.
- Mini Program scanning must parse SN from links, direct `sn`, direct `scene`, and encoded scene payloads.

Regression tests:

```bash
node --test client/test/fixed-header-layout.test.js
npm test
```

## Known WeChat Mini Program Workarounds

### Button Click Events

With Vue 3 `<script setup>` in uni-app, direct method references can fail in WeChat DevTools.

Use:

```vue
<button @click="() => lookup()">查询吊牌</button>
```

Avoid:

```vue
<button @click="lookup">查询吊牌</button>
```

### System Capsule Area

Custom navigation topbars should reserve the right-side capsule area in Mini Program builds:

```css
/* #ifdef MP-WEIXIN */
.some-topbar {
  padding-right: 224rpx;
}
/* #endif */
```

Grid topbars with a right spacer should widen the right column as well.

### Button Label Alignment

When mini-program native button text looks off-center, wrap visible text in a `text` node and pin label line height:

```vue
<button class="ghost-button">
  <text class="button-label">刷新</text>
</button>
```

```css
.button-label {
  display: block;
  line-height: 1;
}
```

## Database Schema

Current tables:

- `admins`
- `users`
- `clothes`
- `garment_batches`
- `garments`
- `binding_logs`
- `lost_reports`
- `contact_reveal_logs`
- `garment_styles` for legacy migration

The public garment DTO is assembled from clothing master data, batch data, SN state, binding state, and lost-report state.

## Environment

Server `.env` essentials:

- `ADMIN_PASSWORD`
- `TOKEN_SECRET`
- `USER_TOKEN_SECRET`
- `FRONTEND_BASE_URL`
- `WECHAT_APP_ID`
- `WECHAT_APP_SECRET`

Client `.env.local`:

- `VITE_API_BASE_URL`

Mini Program real-device testing cannot use desktop `localhost`; use a LAN IP or HTTPS domain.

## Testing Discipline

Before claiming work is complete, run the smallest relevant checks plus any broader command touched by the change.

Common verification set for cross-surface changes:

```bash
npm test
node --test client/test/fixed-header-layout.test.js
node --test server/admin/test/admin-ui.test.js
npm --prefix client run build:mp-weixin
npm --prefix server/admin run build
```

For documentation-only changes, at least verify:

```bash
find . -maxdepth 3 -name '*.md' -print
```

Then scan changed docs for stale claims against current source.

## Documentation Rules

- `README.md` is the user/operator entry point.
- `CLAUDE.md` is the coding-agent handoff.
- `memory/current-system-state.md` is the current factual state index.
- `memory/operations-handbook.md` is the delivery and operations handbook.
- Historical plan files under `memory/` must be labeled as historical when implementation has caught up or diverged.
- Do not leave old TODO sections saying "not implemented" after the feature is in code.

## Review Hotspots

When changing behavior, check these areas deliberately:

- Public privacy DTOs and contact reveal rules.
- Binding ownership and admin/user authorization split.
- Lost report lifecycle and 30-day expiry.
- QR payload compatibility between admin export, H5, and Mini Program.
- SQLite migrations and backward compatibility with legacy `garment_styles`.
- Admin export columns and generated spreadsheet width arrays.
- Mini Program topbar layout and button text alignment.
