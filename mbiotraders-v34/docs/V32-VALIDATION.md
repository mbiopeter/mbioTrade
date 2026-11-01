# mbioTraders v32 verification

Verification in this release environment:

- `node scripts/doctor.mjs`: PASS, 27 required files and matching package-lock.
- `npm test`: PASS, 92 tests, 0 failures (the original 86 plus six v32 design/release tests).
- Syntax-transpilation of all 33 TypeScript and TSX source files: PASS, 0 parser errors.
- Browser-based HTML/CSS layout simulations using Chromium with representative content: PASS without viewport overflow or internal card overflow at desktop sizes 1200x700, 1280x720, 1366x768, 1440x900, 1920x1080.
- Tablet widths 768, 834, and 1024: PASS, two-column grid without card overflow.
- Phone width 390: PASS, one-column layout without card overflow.
- The bundled illustrated guide: PASS, 10 pages rendered; no version reference in page text or PDF metadata; includes BUY/SELL chart examples.
- Trading modules in `src/lib/` were compared with the v31 ZIP and are byte-for-byte identical.
- Browser notification modules are unchanged, and permission, alert delivery, and deduplication regression tests pass.

Limitations:

- The environment could not fetch required npm packages. `npm ci --offline` reported an uncached `undici-types` tarball. An online npm install failed in this environment with an npm CLI exit-handler error. Therefore `npm run check` (type checking with all dependencies available) and `npm run build` (Next.js production compilation) were not successfully completed here.
- The layout viewports were inspected using a static browser representation with the actual v32 stylesheet; the complete deployed Next.js application has not been visually smoke-tested with live data. Real data and longer economic-calendar text may use more room than the representative sample. On screens below 700px tall, scrolling is allowed rather than clipping content.
- Chrome notification delivery depends on HTTPS/localhost, permission, a running browser page and operating-system settings, unchanged from v31.
