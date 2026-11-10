# Self-hosted summit registration

This is a first-party registration application maintained in this repository. It uses Node.js built-in modules, a local append-only JSONL datastore, Docker Compose and (for public HTTPS) the open-source Caddy reverse proxy. It requires no hosted form vendor, API key, trial, subscription or external registration API.

## Local development

1. Install Node.js 22+.
2. Copy `.env.example` to `.env` and set a unique organiser username and a random password of at least 32 characters.
3. Run `docker compose up -d --build summit`.
4. Open `http://127.0.0.1:8080/registration.html`.
5. Check `http://127.0.0.1:8080/api/health`.

The app binds its host port to loopback only. Delegate records are stored in the persistent Docker volume `/data/registrations.jsonl`. Restarting the container does not remove records.

## Public HTTPS deployment

You need a Linux host that you control, a DNS name whose A/AAAA records point to that host, and inbound TCP ports 80 and 443 (plus UDP 443 for HTTP/3). This can be a University of Nairobi/C4D Lab-managed machine if the University authorises hosting and supplies the DNS/host access; the venue proposal itself does not establish that permission.

1. Install Docker Engine and the Docker Compose plugin.
2. Copy `.env.example` to `.env`. Set a long random `ADMIN_PASSWORD`, a non-default `ADMIN_USER`, and `PUBLIC_HOSTNAME` to the real DNS name.
3. Set `TRUST_PROXY=1`. The application port remains bound to host loopback; Caddy reaches it over the private Compose network.
4. Confirm DNS points to the host and ports 80/443 are reachable.
5. Start the public stack: `docker compose --profile production up -d --build`.
6. Check `https://YOUR-HOSTNAME/api/health`. Caddy obtains and renews the TLS certificate automatically.
7. Open `https://YOUR-HOSTNAME/registration.html` and submit a clearly labelled internal test record. Verify it appears in the organiser export, then remove the test record from the data volume before opening registration.

Do not expose port 8080 publicly. Do not run the admin export over plain HTTP. Keep `.env`, the data volume and backups private. Restrict host access, apply OS and Docker security updates, and back up `summit_registrations` to encrypted storage under organiser control.

## Organiser export

Open `/admin/export.csv` on the HTTPS site. Use the HTTP Basic Authentication credentials from `.env`. The endpoint does not list registrations without authentication. Store the password in a password manager; do not put it in this repository or send it by email.

## Application safeguards

- Server-side field validation, fixed category/attendance allow-lists and explicit consent.
- Request-size limit, honeypot and per-client rate limiting.
- Proxy-aware client identification is disabled by default and enabled only for the bundled reverse-proxy deployment.
- Random submission reference and pending-review status.
- Private append-only JSONL storage and authenticated CSV export.
- No payment details, identity documents, passwords or sensitive files collected.
- The rate limiter is a baseline abuse control, not DDoS protection. Public deployment still needs host-level firewalling, monitoring, updates and backups.

## Event status

This is an expression of interest, not a confirmed booking. The proposed venue is C4D Innovation Lab, Department of Computing & Informatics, University of Nairobi, Chiromo Campus. Hosting permission and arrangements require written University confirmation. Fees and final programme remain subject to confirmation.

Registration enquiries: YEQOEN@OTULOOK.COM
