# Security

## Reporting a vulnerability

Please report security problems privately, using GitHub's "Report a vulnerability" option on the Security tab of this repository. Do not open a public issue. Include steps to reproduce and the version or commit you tested. You can expect a first reply within a few days.

## What to know when running this app

- The app uses one shared password (`APP_PASSWORD`) and signs login cookies with `AUTH_SECRET`. Set both, use a long random secret, and serve the app over HTTPS.
- In production the app refuses to serve pages when `APP_PASSWORD` is not set.
- Public report links (`/r/...`) are readable by anyone who has the link. Reset or switch off a link in Settings.
- The website audit and competitor discovery fetch URLs from the server. They refuse private, local, and link-local addresses, cap redirects and response size, and apply timeouts. This is basic protection, so run the app where it cannot reach internal services you care about.
- Your OpenRouter key is read from the environment on the server and is never sent to the browser.
