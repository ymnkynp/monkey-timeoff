# Repository Guidelines

## Project Structure & Module Organization
- `app.js` bootstraps Express, middleware, and routes.
- `lib/` holds server logic: routes, middleware, helpers, and Sequelize models (`lib/model/` used by `migrations/`).
- `views/` contains Handlebars templates (layout in `views/layouts/main.hbs`).
- `public/` serves compiled assets; SCSS lives in `scss/` and compiles to `public/css/style.css`.
- `config/` stores runtime settings (`app.json`, `db.json`, `localisation.json`); keep secrets out of version control.
- `t/` houses tests (`unit`, `integration`, helpers in `t/lib/`); `bin/` carries entry scripts including `bin/wwww`.

## Build, Test, and Development Commands
- `npm install` (Node >=13) installs dependencies.
- `npm start` runs `bin/wwww` (syncs DB via `sequelize.sync()`, serves http://localhost:3000).
- `npm run compile-sass` rebuilds CSS after SCSS changes.
- `npm run db-update` runs Sequelize migrations using `config/db.json` and `lib/model/db/`.
- `npm run carry-over-allowance` calculates carry-over allowances.
- `npm test` runs Mocha across `t/` (PhantomJS WebDriver). `USE_CHROME=1 npm test` uses ChromeDriver; add `SHOW_CHROME=1` to watch the browser. Start the app separately before integration runs.

## Coding Style & Naming Conventions
- CommonJS modules, single quotes, 2-space indentation; prefer `const`/`let` in new code but match nearby style.
- Keep view logic thin; business rules stay in `lib/`. Name files descriptively with lowercase/underscores (`lib/route/bankHolidays.js`, `lib/middleware/withSession.js`).
- Update SCSS, then compile; avoid editing generated `public/css` directly.

## Testing Guidelines
- Unit coverage in `t/unit/`; flows and UI interactions in `t/integration/` with helpers in `t/lib/`.
- Name tests after behaviors (e.g., `crud_users.js`) and assert with Chai.
- Install Chrome + ChromeDriver when using `USE_CHROME=1`; PhantomJS is the default fallback.
- Add tests for new routes, models, or views; keep fixtures minimal.

## Commit & Pull Request Guidelines
- Commit subjects: short, imperative, optional scope (`route: improve audit feed`); keep commits focused with matching tests or migrations.
- Rebuild compiled CSS only when SCSS changes; note migrations or config impacts in the PR.
- PRs should state intent, testing performed (`npm test`, manual steps), and include screenshots/GIFs for UI changes in `views/`/`public/`.
- Link issues or tickets and flag any follow-up work.

## Configuration & Security Notes
- Dev DB defaults to SQLite (`db.development.sqlite`); test/prod configs target MySQL. Do not commit real credentials; use local overrides or env variables.
- Redis sessions are optional via `config/app.json`; ensure Redis availability before enabling.
- Email sending is off by default; update `application_sender_email` and transporter settings before switching on.
- Keep `crypto_secret` and other keys private; rotate if exposed.
