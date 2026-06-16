# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Cyber-Pendant is a digital garment hang tag system. Users scan QR codes or enter SN codes to view garment details; admins manage records and generate codes. It's a monorepo with:

- **`client/`**: Uni-app Vue 3 H5 frontend (WeChat Mini Program ready)
- **`server/`**: Node.js API using built-in `node:sqlite`
- **`data/`**: Local SQLite database (runtime-generated, gitignored)

## Commands

```bash
# Install all dependencies
npm --prefix server install && npm --prefix client install

# Development (run in separate terminals)
npm run dev:server   # node --watch server/src/index.js
npm run dev:client   # uni -p h5 (H5) or uni -p mp-weixin (Mini Program)

# Build
npm run build:client # uni build -p h5

# Test
npm test             # node --test server/test/*.test.js
```

## Architecture

### Server (Node.js ESM, built-in http + sqlite)

Entry point: `server/src/index.js` → `api.js` (HTTP routing & handlers)

Core modules:
- `db.js`: SQLite schema, migrations, garment CRUD queries. Uses `FIELD_MAP` to convert camelCase ↔ snake_case between API and database.
- `auth.js`: PBKDF2 password hashing, custom JWT-like token (HMAC-SHA256, 7-day TTL)
- `sn.js`: SN code generation (`CP{YYYYMMDD}{6-char-alphanum}`)
- `config.js`: Loads `server/.env`, manages runtime config

API design (no framework):
- Manual routing via `pathname` patterns in `route()` function
- `HttpError` class for error responses
- CORS configurable via `CORS_ORIGIN` env var

### Client (Uni-app Vue 3)

- `src/pages.json`: Route registry (Uni-app convention)
- `src/utils/api.js`: Fetch wrapper, token storage in `uni.getStorageSync()`
- `src/utils/scanner.js`: QR scanning; handles WeChat Mini Program vs H5 divergence via conditional compilation (`#ifdef MP-WEIXIN`)

## Environment Setup

Before first run:
```bash
cp server/.env.example server/.env
# Edit server/.env: set ADMIN_PASSWORD and TOKEN_SECRET
```

Default admin username: `admin` (configurable via `ADMIN_USERNAME`)

Demo SN: `CP20260615DEMO01`

## Database Schema

Two tables:
- `admins`: id, username, password_hash, created_at
- `garments`: id, sn, product_name, style_no, color, size, fabric, standard, safety_category, grade, manufacturer, manufacturer_address, care_instructions, batch_no, production_date, remark, status (active/inactive), created_at, updated_at

Seeds: one admin (if none exists), one demo garment (if table empty)

## Testing

Tests use Node.js built-in test runner (`node:test`). Each test creates an in-memory temp database. Pattern: `startTestServer()` → run fetch requests → assert response status/body.

Run individual test: `node --test server/test/api.test.js`
