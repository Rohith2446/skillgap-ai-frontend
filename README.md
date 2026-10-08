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

## Render Static Site

Create a Static Site using this repository's root. Set the build command to `npm install && npm run build`, the publish directory to `dist`, and add `VITE_API_URL` as a build environment variable containing the backend's public base URL. Do not add credentials to frontend environment variables.

The application has no React Router or URL-based pages; its signed-in views are managed in component state. No SPA rewrite rule is required for the current routes. If URL-based routes are introduced later, configure a Render rewrite to serve `/index.html` for those application paths.
