# Cyber-Pendant

Cyber-Pendant is a digital garment hang tag system. Users can scan a QR code or enter an SN code to view garment details, while admins can log in to manage records and generate SN/QR codes.

## Project Structure

- `client/`: Uni-app Vue 3 H5 frontend, prepared for future WeChat Mini Program migration.
- `server/`: Node.js API server using built-in `node:sqlite`.
- `data/`: local SQLite database directory generated at runtime and ignored by Git.

## Quick Start

Install dependencies:

```bash
npm --prefix server install
npm --prefix client install
```

Run the backend:

```bash
cp server/.env.example server/.env
# Edit server/.env and set ADMIN_PASSWORD and TOKEN_SECRET before first run.
npm run dev:server
```

Run the H5 frontend in another terminal:

```bash
npm run dev:client
```

Default admin username:

```text
username: admin
```

The admin password is read from your local `server/.env` file and should not be committed.

Demo SN:

```text
CP20260615DEMO01
```

## Environment

Copy the example files when you need custom ports, passwords, or API hosts:

```bash
cp server/.env.example server/.env
cp client/.env.example client/.env.local
```
