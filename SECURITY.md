# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in this project, please report it
privately rather than opening a public issue.

**How to report:**

1. **GitHub Security Advisory** (preferred) — Go to the
   [Security tab](../../security/advisories/new) of this repository and
   create a private security advisory.

2. **Email** — Contact us at security@israellopezconsulting.com with a
   description of the vulnerability, steps to reproduce, and any relevant
   Fishbowl Advanced version information.

We will acknowledge receipt within 3 business days and provide an initial
assessment within 10 business days.

## Scope

This policy covers `cloudpages.js` and `cloudpages.css` in this repository.
Issues related to `fb.js` should be reported to [ILC.Fishbowl.JS](https://github.com/ilc-global/ILC.Fishbowl.JS).
Issues related to Fishbowl Advanced server software should be reported
directly to Fishbowl.

## Best Practices for Users

- Always use parameterized SQL in your `<script id="query">` blocks — cloudpages.js
  binds values via `FB.query(sql, params)` and never concatenates user input.
- Validate and sanitize any user-supplied data in `onBeforeQuery` hooks.
- Keep your Fishbowl Advanced server updated to the latest supported version.
