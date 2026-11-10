# Quantum-Resistant Cryptography for Datacentres Summit

Official event information website maintained for Tilil Engineering Group.

## Event overview

- **Dates:** 19–22 January 2027 (Tuesday–Friday)
- **Planned venue:** Kenya Advanced Institute of Science and Technology (KENYA-AIST), Nairobi, Kenya
- **Convener:** Tilil Engineering Group
- **Convening lead:** Kiprop Yego, Founder
- **Theme:** Quantum-resistant cryptography, datacentre security and critical infrastructure resilience

Venue, programme, speakers, registration terms and fees remain provisional until formally confirmed and published.

## Site structure

- `index.html` — event overview and technical scope
- `programme.html` — proposed four-day programme framework
- `sponsors.html` — partnership overview
- `registration.html` — registration status and delegate information
- `styles.css`, `refinements.css`, `inner-pages.css` — presentation
- `script.js` — mobile navigation and dynamic copyright year
- `scripts/check-site.mjs` — dependency-free static smoke checks
- `.github/workflows/pages.yml` — validation and GitHub Pages deployment

## Local preview

This is a static site; no package manager or build step is required.

```sh
python -m http.server 8000
```

Open http://localhost:8000.

Run the static checks with Node.js:

```sh
node scripts/check-site.mjs
```

## Deployment

The GitHub Actions workflow validates the site and deploys the repository root to GitHub Pages. In repository settings, set **Pages → Build and deployment → Source** to **GitHub Actions** if it is not already configured.

## Operational safeguards

- The registration page is informational only. It does not collect personal data or accept payment.
- No registration prices, bank details, speakers, sponsor fees or unconfirmed partner benefits are fabricated.
- The programme is explicitly marked as a draft framework.
- Confirm event details and contact channels before publishing registration or payment instructions.

## Maintainer

Tilil Engineering Group.
