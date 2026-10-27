---
name: domain
description: Use when the user asks about DigitalPlat FreeDomain free domains (.DPDNS.ORG, .US.KG, .QZZ.IO, .XX.KG, .QD.JE), registering one, connecting external nameservers, DNS records, renewal, or deploying a website on a domain.
---

# DigitalPlat FreeDomain

Knowledge base from https://github.com/DigitalPlatDev/FreeDomain, bundled under `references/`.

## Key facts

- Dashboard: https://dash.domain.digitalplat.org/
- Extensions: .DPDNS.ORG, .US.KG, .QZZ.IO, .XX.KG, .QD.JE
- DigitalPlat registers domains and delegates them to **external authoritative nameservers** (e.g. Cloudflare). It has no ordinary DNS record editor: A/AAAA/CNAME/MX/TXT records are managed at the external DNS provider.
- Abuse reports: abusereport@digitalplat.org
- Application source: https://github.com/DigitalPlatDev/Domain-OSS

## How to use

1. Read `references/README.md` for the overview and `references/LEARN.md` for the chapter index.
2. Open only the relevant chapter under `references/documents/`:
   - `tutorial/platform/` — account, registration, nameservers, status/renewal, policies, API (product-specific)
   - `tutorial/dns/` — delegation, record types, subdomains, TTL, troubleshooting
   - `tutorial/website/` — build, deploy, HTTPS, performance
   - `tutorial/email/`, `tutorial/operations/`, `tutorial/appendices/` — email records, security, renewal, checklists
   - `domains/faq.md` — FAQ
3. Keep product-specific answers (Category A: platform) separate from general DNS/web education (Category B), and don't claim DigitalPlat offers features the docs say it does not.
