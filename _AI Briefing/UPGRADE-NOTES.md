Upgrade notes (Codex)
======================

What changed
- Dependencies updated to modern versions (Sequelize 6.37.x, sqlite3 5.x, express 4.18.x, passport 0.7.x, nodemailer 6.x, redis 4.x, connect-session-sequelize 7.x, etc.). `node-uuid` removed in favor of `uuid` 9.x; `sass` replaces `node-sass`. `ical-generator` bumped to a compatible published version (3.6.0). `joi` upgraded to 17.x.
- Sequelize v6 migration: removed `sequelize.import`, added new loader in `lib/model/db/index.js`, reattached legacy class/instance methods, and replaced all legacy `$` operators with `Op.*` across models/mixins/routes. Updated `find`/`findById` calls to `findOne`/`findByPk`.
- Nodemailer v6 rewrite in `lib/email.js`; removed `nodemailer-smtp-transport` and now create transport directly from `config.email_transporter`.
- Redis 4/connect-redis 7 adjustments in `lib/middleware/withSession.js` (legacyMode client with explicit connect).
- HTML-to-text v9 API changes applied to email audit paths; migration updated.
- UUID usage updated to `uuid` package; unused test imports removed.
- Joi v17 API updates in validation helpers (error module, team_view, user_importer).
- All Sequelize query operators converted to `Op` syntax in mixins and routes; feed/passport adjusted to new APIs.
- npm install run after removing old lockfile; new `package-lock.json` generated.
- Validator v13 hardening: added guards around optional query/body params across routes (integration API, reports, users, departments, bank holidays, settings), plus calendar base date; boolean flags now default safely when absent.
- Boolean coercion for admin/auto-approve flags to keep truthy DB values working under Sequelize v6 (admin visibility, approvals, team view access).
- Team View rendering now awaits department calendars (`Promise.all`) to avoid undefined `days` during statistics injection.
- Frontend single-click guard now inspects required fields via jQuery correctly (fixes `el.val is not a function` on login submit).
- Admin/session middleware now forces boolean flags onto req.user so templates always see `admin`/`auto_approve` as booleans.
- Users index route protects `validator.isNumeric` with an existence check (validator v13 strictness).

Notes/issues
- `npm install` completed with warnings about deprecated transitive dependencies (request/request-promise, ldapjs, uuid@3 pulled by deps). Not addressed in code; consider future replacements.
- No automated or manual app tests were run after the upgrade (time). Key flows to smoke-test: startup, login/auth, user management, leave request/approval, calendar feeds, email sending, reports/exports, department/bank holiday settings, integration API bearer endpoints.

Follow-ups to consider
- Audit remaining models that still rely on legacy `classMethods`/`instanceMethods` patterns; index loader reattaches them, but refactoring to native class/static methods would be safer long term.
- Verify `ical-generator` 3.6.0 API compatibility with current usage (feed generation).
- Run `npm test` and app smoke tests; address any runtime errors from upgraded libraries.
- Review redis session handling in production (ensure host/port config valid, legacyMode acceptable).
