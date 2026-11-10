# Quantum-Resistant Cryptography for Datacentres Summit

Official event information and delegate expression-of-interest platform maintained by Tilil Engineering Group.

## Event overview

- **Dates:** 19–22 January 2027 (Tuesday–Friday)
- **Proposed venue:** C4D Innovation Lab, Department of Computing & Informatics, University of Nairobi, Chiromo Campus, Nairobi, Kenya (subject to written venue approval and confirmation)
- **Convener:** Tilil Engineering Group
- **Convening lead:** Kiprop Yego, Founder
- **Theme:** Quantum-resistant cryptography, datacentre security and critical infrastructure resilience

The venue, programme, speakers, registration terms and fees remain provisional until formally confirmed. The University of Nairobi identifies the C4D Innovation Lab as a research and innovation facility within its computing school; this repository does not imply that the University has agreed to host or endorse the summit.

## Site and application

- `index.html` — event overview and technical scope
- `programme.html` — proposed four-day programme framework
- `sponsors.html` — partnership overview
- `registration.html` — delegate expression-of-interest form
- `privacy.html` — draft privacy notice and pre-launch disclosures
- `LAUNCH-CHECKLIST.md` — event, privacy, hosting and go-live requirements
- `admin.html` — authenticated organiser dashboard with audited status management (served only through `/admin`)
- `app/server.mjs` — dependency-free Node.js registration API and static site server
- `Dockerfile`, `docker-compose.yml` — portable self-hosted deployment
- `scripts/check-site.mjs` — dependency-free static-site checks
- `scripts/test-registration.mjs` — registration API and organiser dashboard integration test
- `.github/workflows/pages.yml` — GitHub Actions validation and static preview deployment

## Local preview

For the static site:

```sh
python -m http.server 8000
```

For the complete registration application (Node.js 22+):

```sh
cp .env.example .env
# Edit .env and set a unique admin username and a long random password.
docker compose up -d --build
```

Open `http://localhost:8080/registration.html`. Check service health at `/api/health`. Open the organiser dashboard at `http://127.0.0.1:8080/admin`; the browser will request the organiser credentials from `.env`.

## Registration and data handling

The form submits to the self-hosted API. The API stores delegate expressions of interest in an append-only JSON Lines file on a persistent private Docker volume. Organisers can review records in the authenticated dashboard with append-only status audit events at `/admin` and download a CSV through `/admin/export.csv`. The dashboard supports search, category/status filtering, pagination and audited status changes (Pending review, Accepted, Waitlisted, Declined). Changes do not send email, issue tickets, collect fees or confirm a paid place; organisers must contact delegates manually.

The form is an expression of interest, not a confirmed booking. Submissions remain pending organiser review. No payment is requested or collected. Do not submit payment-card data, passwords, identity documents, medical diagnoses or other sensitive personal information.

The privacy notice is a draft and explicitly lists the organiser, hosting, retention and regulatory matters that must be confirmed before public collection begins. It is not a legal opinion or a certification of compliance. The registration API and form are closed by default. Deployment does not open submissions: the organiser must explicitly set `REGISTRATION_OPEN=1` only after completing [LAUNCH-CHECKLIST.md](LAUNCH-CHECKLIST.md). The server also refuses weak/default organiser credentials and reports unhealthy storage as HTTP 503.

Registration enquiries and privacy questions: **YEQOEN@OTULOOK.COM**.

## Deployment boundary

GitHub Pages can host the static website, but it cannot execute the Node.js registration API or store submissions. Public online registration therefore requires the self-hosted application to run on a server controlled by the organiser, behind HTTPS. No third-party form SaaS, API key, trial or subscription is required. The application is portable and can be moved between Docker-capable hosts.

See [REGISTRATION-SERVICE.md](REGISTRATION-SERVICE.md) for deployment, organiser access and backup instructions.

## Validation

Run:

```sh
node scripts/check-site.mjs
node scripts/test-registration.mjs
node scripts/test-registration-backup.mjs
```

## Maintainer

Tilil Engineering Group.
