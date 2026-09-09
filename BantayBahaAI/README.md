# BantayBaha

Static, mobile-first campus flood-reporting PWA with a desktop operations dashboard.

## Project structure

- `bantayagos-design-mockup.html` — semantic page structure and dashboard content
- `js/app.js` — report form interactions, submission feedback, and app bootstrap
- `js/camera.js` — mobile camera capture and gallery fallback
- `manifest.webmanifest` — PWA installation metadata
- `service-worker.js` — offline app-shell cache
- `bantayagos-icon.svg` — installable app icon

Serve the folder on `localhost` or HTTPS to enable mobile camera access and PWA installation. For example, use VS Code Live Server and open `bantayagos-design-mockup.html`.
