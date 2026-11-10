# Self-hosted summit registration

This is a first-party registration application maintained in this repository. It uses Node.js built-in modules, a local append-only JSONL datastore, Docker Compose and (for public HTTPS) the open-source Caddy reverse proxy. It requires no hosted form vendor, API key, trial, subscription or external registration API.

## Local development

1. Install Node.js 22+.
2. Copy `.env.example` to `.env` and set a unique organiser username and a random password of at least 32 characters.
3. Leave `REGISTRATION_OPEN=0` while preparing the service. The form and API remain closed even when the server is healthy.
4. Run `docker compose up -d --build summit`.
5. Check `http://127.0.0.1:8080/api/health`; it should report `registrationOpen: false` until deliberately opened.
6. Open `http://127.0.0.1:8080/registration.html`.
7. Open the organiser dashboard at `http://127.0.0.1:8080/admin`; the browser will challenge for the credentials in `.env`.

The app binds its host port to loopback only. Delegate records are stored in the persistent Docker volume `/data/registrations.jsonl`. Restarting the container does not remove records.

## Organiser dashboard and export

The `/admin` route is protected by HTTP Basic Authentication and serves the read-only organiser dashboard only after successful authentication. The dashboard supports search across delegate contact and organisation fields, category filtering, pagination and CSV export. Its data API at `/admin/registrations.json` independently enforces the same authentication. Direct requests for `/admin.html` are blocked so the dashboard file cannot be fetched without the protected route.

The API is closed to new submissions by default. The `REGISTRATION_OPEN=1` setting is an explicit release switch; deployment or a healthy server does not open the form. Keep it at `0` until the organiser has completed the event, venue, privacy, regulatory, hosting and backup checks listed above. The health endpoint reports the switch state.

The dashboard is deliberately read-only. It does not approve delegates, send email, assign fees, issue tickets or confirm attendance. These workflows require separately designed audit and notification controls. The export route is also authenticated. Use HTTPS for any access beyond loopback.

## Public HTTPS deployment

You need a Linux host that you control, a DNS name whose A/AAAA records point to that host, and inbound TCP ports 80 and 443 (plus UDP 443 for HTTP/3). This can be a University of Nairobi/C4D Lab-managed machine if the University authorises hosting and supplies the DNS/host access; the venue proposal itself does not establish that permission.

1. Install Docker Engine and the Docker Compose plugin.
2. Copy `.env.example` to `.env`. Set a long random `ADMIN_PASSWORD`, a non-default `ADMIN_USER`, and `PUBLIC_HOSTNAME` to the real DNS name.
3. Set `TRUST_PROXY=1`. The application port remains bound to host loopback; Caddy reaches it over the private Compose network.
4. Confirm DNS points to the host and ports 80/443 are reachable.
5. Keep `REGISTRATION_OPEN=0` and start the public stack: `docker compose --profile production up -d --build`.
6. Check `https://YOUR-HOSTNAME/api/health`; it must report `registrationOpen: false`. Caddy obtains and renews the TLS certificate automatically.
7. Test submissions on a local or access-restricted staging instance with `REGISTRATION_OPEN=1`; verify the dashboard and export, then clear test records before production.
8. Only after venue permission, final event terms, privacy notice, controller details, retention policy, hosting location, regulatory checks, administrator access and backups are approved, set `REGISTRATION_OPEN=1` in the production `.env` and run `docker compose up -d --force-recreate summit`.
9. To close submissions immediately, set `REGISTRATION_OPEN=0` and recreate the service.

Do not expose port 8080 publicly. Do not run the admin dashboard or export over plain HTTP. Keep `.env`, the data volume and backups private. Restrict host access, apply OS and Docker security updates, and back up `summit_registrations` to encrypted storage under organiser control.

## Backup, verification and restore

Registration files contain personal data. Backups must be stored outside Git, protected by filesystem permissions, encrypted when moved off-host, and accessible only to authorised organisers. The repository's `.dockerignore` excludes the local `backups/` directory from production images.

Create a verified backup:

```sh
bash scripts/backup-registrations.sh
```

The script briefly stops the registration service to obtain a consistent snapshot, runs the JSONL integrity verifier, writes a timestamped `.jsonl` file with owner-only permissions, and restarts the service if it was running. A short interruption to form submissions may occur.

Verify an existing backup without restoring it:

```sh
node scripts/verify-registration-store.mjs backups/your-backup.jsonl
```

Restore only when deliberately replacing the live store:

```sh
CONFIRM_RESTORE=YES bash scripts/restore-registrations.sh backups/your-backup.jsonl
```

The restore script refuses to run without the explicit confirmation variable, verifies the source, creates a pre-restore backup, replaces the named-volume file through a one-off container, then reads it back and verifies the restored copy. Run restore only during a maintenance window. Preserve the backup files according to the approved retention schedule.

## Application safeguards

- Server-side field validation, fixed category/attendance allow-lists and explicit consent.
- Request-size limit, honeypot and bounded per-client rate limiting.
- Proxy-aware client identification is disabled by default and enabled only for the bundled reverse-proxy deployment.
- Random submission reference and pending-review status.
- Private append-only JSONL storage and authenticated CSV export.
- Authenticated read-only organiser dashboard with search, filtering and pagination.
- CSV formula neutralisation for spreadsheet exports.
- Offline JSONL integrity verification and guarded backup/restore scripts.
- The API does not persist the former free-text accessibility/dietary field; contact the organiser separately for necessary arrangements.
- No payment details, identity documents, passwords or sensitive files collected.
- The rate limiter is a baseline abuse control, not DDoS protection. Public deployment still needs host-level firewalling, monitoring, updates and backups.

## Event status

This is an expression of interest, not a confirmed booking. The proposed venue is C4D Innovation Lab, Department of Computing & Informatics, University of Nairobi, Chiromo Campus. Hosting permission and arrangements require written University confirmation. Fees and final programme remain subject to confirmation.

Registration enquiries: YEQOEN@OTULOOK.COM
