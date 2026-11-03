# Threat model: dr-nomark/juice-shop

Status: includes the user's answers (see "User-provided facts"). The sections that describe the code are Devin's reading of it.

## System overview
This repo is a fork of OWASP Juice Shop, a web shop that is **intentionally insecure** and used for security training and CTFs (see `README.md`, `AGENTS.md`, `SECURITY.md`). It is a single Node.js/Express server (`server.ts`, `app.ts`) that serves:
- an Angular SPA (`frontend/`),
- a REST API (`/rest/*`), auto-generated Sequelize CRUD (`/api/*` via finale-rest), the B2B API (`/b2b/v2`), and Socket.io events (`lib/startup/registerWebsocketEvents.ts`).

Data lives in SQLite through Sequelize (`models/`), MarsDB in memory (reviews, orders), and the local filesystem (`ftp/`, `uploads/`, `logs/`, `encryptionkeys/`).

The repo's own Threat Dragon model, `threat-model.json`, defines these actors: B2C customer, B2B customer, Admin, and Accounting (all in a browser). Google OAuth2 is out of scope there.

`SECURITY.md` says that vulnerabilities which are part of a hacking challenge are by design. Vulnerabilities that are **not** part of any challenge (zero-days) are the ones the maintainers want reported.

## Trust boundaries
1. Browser to Application Server (HTTP on port 3000). Anyone who can reach the port is untrusted.
2. Application Server to datastores and the local file system.
3. Application Server to outside services: the LLM endpoint `chatBot.llmApiUrl` (default `http://localhost:11434/v1`), the Web3 RPC/Alchemy, and the optional webhook in `lib/webhook.ts`.
4. Container/host boundary. The `Dockerfile` builds a distroless image that runs as uid 65532. Safety Mode (`challenges.safetyMode`, `lib/utils.ts#getChallengeEnablementStatus`) turns off challenges marked `disabledEnv` (for example RCE/DoS) on Docker and Heroku, or whenever it is set to `enabled`.
5. CI/CD: GitHub Actions in `.github/workflows/`. These workflows use repository secrets (DockerHub, Heroku, BOT_TOKEN, ORG_ADMIN_TOKEN, Slack, Cypress), and `pr-compliance.yml` runs on `pull_request_target`.

## Components
| Name | Code |
|---|---|
| Frontend | `frontend/` (Angular SPA) |
| API | `server.ts`, `app.ts`, `routes/` (except the auth, chatbot and Web3 files below), `models/`, `views/`, `lib/` (except `lib/insecurity.ts`), `data/` |
| Auth | `lib/insecurity.ts` (JWT RS256 with a hardcoded private key, express-jwt 0.1.3, `isAuthorized`/`denyAll`/`isAccounting`), `routes/login.ts`, `routes/2fa.ts`, `routes/resetPassword.ts`, `routes/changePassword.ts`, `routes/currentUser.ts`, `routes/securityQuestion.ts` |
| Chatbot | `routes/chat.ts` (LLM with tools: searchProducts, getProductReviews, getOrderById, generateCoupon) |
| Web3 | `routes/nftMint.ts`, `routes/web3Wallet.ts`, `routes/checkKeys.ts`, the BEE Haven/Web3 frontend pieces |
| Infrastructure | `Dockerfile`, `docker-compose.test.yml`, `infrastructure/`, `terraform/`, `vagrant/`, `monitoring/` |
| CI/CD | `.github/workflows/`, `package.json` scripts, dependency manifests |

## Entry points
- Unauthenticated: login, registration, password reset, search, product and review APIs, file upload (`/file-upload`), `/ftp`, `/encryptionkeys`, `/support/logs`, `/metrics`, redirect, B2B order, chatbot status, and the Socket.io events.
- JWT-authenticated (any registered user, since self-registration is open): basket, orders, profile and image upload, wallet, memories, privacy requests, data export/erasure, and chatbot.
- Role-gated: admin and accounting (`isAccounting`), `deluxe` membership.
- Vulnerable on purpose: around 110 hacking challenges in `data/static/challenges.yml`. Their code is marked with `vuln-code-snippet` comments (11 files hold markers; codefixes are in `data/static/codefixes/`). Examples are SQLi in `routes/login.ts`/`routes/search.ts`, `eval` in `routes/captcha.ts`/`routes/userProfile.ts`, sandboxed `vm`/`notevil` in `routes/b2bOrder.ts`, `routes/fileUpload.ts` and `lib/xml.ts`, the hardcoded JWT key, and the insecure Terraform in `infrastructure/terraform`.

## Assets
- The integrity of the training environment itself: the challenge-solved state, the score board, and continue codes (`ctf.key` for CTF flags).
- The host or container running the app. Escaping the intended sandbox (`vm` timeouts, Safety Mode) reaches real resources.
- CI secrets and the release pipeline (DockerHub images, Heroku deploy).
- The demo users' data. It is synthetic (`data/static/users.yml`) and **not** real PII.

## Attacker profiles
- Training participants and CTF players. Breaking the app is their job, within the intended challenges.
- An outside network attacker. Out of scope (user: local or private VM only).
- A malicious contributor or PR author, against CI.

## Existing controls
- The distroless container runs as a non-root user.
- Safety Mode turns off dangerous challenges in Docker and Heroku.
- `vm.runInContext` sandboxes run with a 2s timeout.
- Rate limits on reset-password and a few other routes.
- `helmet.noSniff`/`frameguard`.
- Workflows pin third-party actions by SHA.
- `AGENTS.md` forbids deploying `./infrastructure` or `./terraform`.

## User-provided facts
- **Deployment:** the fork runs only locally or on a private VM, for the user's own training and testing. It is not a shared or internet-facing instance. Whoever can reach the port is the user.
- **Intentional challenges are accepted risk.** A finding that is one of the hacking challenges in `data/static/challenges.yml` gets priority `none` (dismissed). This includes findings in `vuln-code-snippet` code, the documented challenge vulnerabilities, and the intentionally insecure `infrastructure/` and `terraform/` files.
- **What matters most:**
  1. CI/CD and supply chain: GitHub Actions secrets, the release workflow (DockerHub/Heroku), `pull_request_target` workflows, and dependency integrity.
  2. Escaping the app sandbox: RCE on the host or container that is not an intended challenge, bypassing the `vm` sandboxes or Safety Mode, and reading or writing host files outside the challenge design.

## Out of scope / accepted risk
- Every intentional hacking challenge (accepted risk, priority `none`).
- Attacks that need a remote or third-party network attacker against the running app: the instance is local/private. Findings that only matter when someone else can reach the app are lowered unless they reach the critical assets above.
- Demo user data is synthetic. Leaking it isn't a privacy issue on its own.

## Reranking rules
- The finding matches an intentional challenge (the challenge key is known): `none`, with the `Challenge` tag set to the key.
- It is an unintended web vulnerability that only a network attacker against the local instance can use: lower it one level (the scanner's severity is the start).
- It is a CI/CD or supply-chain issue, or a sandbox/host escape outside the challenge design, that reaches secrets, the release pipeline or the host through a path the scanner confirmed: keep the severity, or raise it one level.
- Anything else keeps the scanner's severity.

## Open questions
- Which repository secrets are actually set on the fork `dr-nomark/juice-shop`? The workflows refer to upstream secrets such as DockerHub, Heroku, BOT_TOKEN and ORG_ADMIN_TOKEN. Until confirmed, CI findings are judged as if those secrets exist.
- Is GitHub Actions enabled on the fork?
