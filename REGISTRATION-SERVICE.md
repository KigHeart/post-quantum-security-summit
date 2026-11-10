# Self-hosted summit registration

A small registration application using only Node.js 22 built-in modules. No SaaS form provider, API key, trial, or subscription is required.

## Run

1. Install Docker Engine and Docker Compose, or use Node.js 22+ directly.
2. Copy `.env.example` to `.env`.
3. Set a unique organiser username and a long random password (at least 32 characters).
4. Run `docker compose up -d --build`.
5. Open `http://localhost:8080/registration.html`.
6. Check `http://localhost:8080/api/health`.

The service serves the summit website and API from one origin. Delegate submissions are stored in a persistent Docker volume at `/data/registrations.jsonl`. Restarting the container does not remove records.

## Organiser export

Open `/admin/export.csv` on the deployed site. Use the HTTP Basic Authentication username and password from `.env`. The CSV endpoint is private; there is no public endpoint for listing registrations.

## Public deployment

Run this container on a server you control. Put it behind HTTPS using a reverse proxy (Caddy or nginx); do not expose the admin export over plain public HTTP. Keep the data volume private and back it up securely. Never commit `.env`, registrations, backups, or passwords to Git.

GitHub Pages is static hosting and cannot run this API. The Pages copy remains a static preview; live submissions require this container to be deployed at a public HTTPS address. Once deployed, publish that address as the official summit website/form URL. This is a portable self-hosted app: it can be moved between Docker-capable hosts without changing the application or data format.

## Safeguards and limitations

- Server-side validation, consent enforcement, request-size limit, honeypot, and basic per-IP rate limiting.
- Random submission reference and pending-review status.
- Local append-only JSONL storage and authenticated CSV export.
- No payment details, identity documents, passwords, or sensitive files collected.
- The built-in rate limiter is a baseline, not enterprise DDoS protection. Use HTTPS and a properly configured reverse proxy for public deployment.
- This is an expression of interest, not a confirmed booking. Fees and venue arrangements remain subject to confirmation.

Registration enquiries: YEQOEN@OTULOOK.COM
