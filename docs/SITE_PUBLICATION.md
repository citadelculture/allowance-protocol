# Site Publication Check

The site publication check verifies that the static Allow Protocol site is safe to hand to a domain or hosting provider for explicit publication approval.

```bash
npm run site-publication-check
```

It checks:

- `index.html`, `styles.css`, and `app.js` exist
- the HTML loads the local stylesheet and module script
- required public disclosures are present
- public copy avoids token, return, market-cap, partnership, and unevidenced usage claims
- local asset references exist
- external references are surfaced for review

## Required Public Disclosures

The website must say the product is experimental, has no token at launch, is no-custody, uses demo or evidence-backed metrics, and leaves wallet security with the user.

## Boundary

This check does not publish the site, post to X, send outreach, sign wallet payloads, deploy contracts, start pilot traffic, move funds, store secrets, update canonical state, or enable tokens. A passing check means the owner can prepare a website publication approval packet; it is not publication approval by itself.
