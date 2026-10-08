# SkillGap AI Frontend

## Purpose

React/Vite user interface for SkillGap AI, the career-readiness platform. This repository is the frontend half of the unified SkillGap AI application and consumes its separately hosted Spring Boot API.

## Technology

- React
- TypeScript
- Vite

## Setup

Requirements: Node.js and npm.

```powershell
npm install
Copy-Item .env.example .env
npm run dev
```

Set `VITE_API_URL` in `.env` to the backend base URL, without a trailing slash. The example targets a local backend at `http://localhost:8080`.

## Environment

- `VITE_API_URL`: required API base URL. This value is embedded in public frontend assets; never place passwords, API keys, or other secrets in a `VITE_` variable.

Production builds must receive `VITE_API_URL` through the hosting provider's build environment.

## Build and Audit

```powershell
npm run build
npm audit
```

Vite writes generated output to `dist/`, which is excluded from Git.
