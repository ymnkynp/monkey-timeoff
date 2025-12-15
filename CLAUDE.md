# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

TimeOff.Management is a Node.js web application for managing employee absences, built with Express.js, Sequelize ORM, and Handlebars templating. It supports multiple database backends (SQLite for development, MySQL for production) and includes features like LDAP authentication, calendar integration, and department-based hierarchical approval workflows.

### Key Technologies
- **Backend**: Node.js (minimum v13.0.0) with Express.js
- **Database**: SQLite3 (development default: `db.development.sqlite`), MySQL (test/production) via Sequelize ORM
- **Templating**: Express-Handlebars (`.hbs` files)
- **Authentication**: Passport.js (LocalStrategy + BearerStrategy) with optional LDAP via `ldapauth-fork`
- **Session Management**: Express-session (Sequelize store or optional Redis)
- **Email**: Nodemailer with SMTP transport
- **Calendar Feeds**: ical-generator for iCal/Google Calendar/Outlook integration
- **Testing**: Mocha + Chai + Selenium WebDriver (PhantomJS default, Chrome with `USE_CHROME=1`)
- **Styling**: SASS compiled to CSS via node-sass

## Common Commands

### Development
```bash
npm install              # Install dependencies
npm start               # Start server on port 3000 (http://localhost:3000)
npm test                # Run all tests (uses PhantomJS WebDriver by default)
USE_CHROME=1 npm test   # Run tests with Chrome/ChromeDriver instead
SHOW_CHROME=1 USE_CHROME=1 npm test  # Run Chrome tests with visible browser
```

### Database Management
```bash
npm run db-update       # Run database migrations using Sequelize CLI
                        # Uses config/db.json and lib/model/db/ for models
```

### Build & Utilities
```bash
npm run compile-sass    # Compile SCSS to CSS (scss/main.scss → public/css/style.css)
npm run carry-over-allowance  # Calculate carry-over allowance for all users
```

### Running Single Tests
```bash
# Run specific test file
node node_modules/mocha/bin/mocha --recursive t/integration/specific_test.js
```

## Code Architecture

### Application Entry Points
- **bin/wwww**: Main server entry point. Syncs database with `sequelize.sync()` then starts Express server
- **app.js**: Express application setup with middleware stack, route registration, and session/authentication configuration

### MVC Structure

**Models** (`lib/model/`)
- `db/`: Sequelize models with database schema definitions
  - Core models: User, Company, Department, Leave, LeaveType, BankHoliday, Schedule
  - Models define `associate()` for relationships, `loadScope()` for query scopes, and `scopeAssociate()` for scope-based associations
  - `db/index.js`: Auto-loads all models and wires up associations/scopes in 3 phases
- Business logic models: `user_allowance.js`, `calendar_month.js`, `team_view.js`, `leave_collection.js`
- User mixins in `mixin/user/`: `company_aware.js`, `absence_aware.js` - extend User model functionality

**Views** (`views/`)
- Handlebars templates (`.hbs` extension) with `main.hbs` as default layout
- Custom helpers defined in `lib/view/helpers.js`

**Routes** (`lib/route/`)
- Modular route handlers organized by feature area
- Main routes: `login.js`, `dashboard.js`, `calendar.js`, `settings.js`, `requests.js`, `reports.js`, `users/`, `departments.js`, `bankHolidays.js`, `audit.js`
- API routes: `api/` (internal API), `integration_api.js` (external integration API with Bearer token auth), `feed.js` (calendar feeds)

### Authentication & Session Management
- **Passport.js** (`lib/passport/`): Handles authentication with LocalStrategy (email/password) and BearerStrategy (API tokens)
  - Supports both local password auth and LDAP authentication (configured per company)
  - `getCompanyAdminByToken.js`: Validates API bearer tokens
- **Sessions**: Configured in `lib/middleware/withSession.js`
  - Default: Sequelize-based session store
  - Optional Redis support (configured in `config/app.json` with `sessionStore.useRedis`)
- **User model** (`lib/model/db/user.js`): Password hashing with crypto, session serialization methods

### Middleware Pipeline (app.js order matters)
1. Static file serving, body parsing, cookie parsing
2. Session middleware (Sequelize or Redis)
3. Passport initialization
4. Custom middleware: session data to templates, flash messages, session-aware redirects
5. Route handlers (public feeds/API → login → authenticated routes)

### Configuration
- **config/app.json**: Email settings, Redis session config, locale sorting, feature flags, crypto secret
- **config/db.json**: Environment-specific database configs (development uses SQLite, test/production use MySQL)
- **config/localisation.json**: Localization settings

### Database Migrations
- Located in `migrations/` directory
- Executed via Sequelize CLI: `npm run db-update`
- Migration file format: `YYYYMMDD-description.js`

### Email System
- **lib/email.js**: Nodemailer-based email sending (configured in `config/app.json`)
- Email auditing via `EmailAudit` model

### Business Logic Flow
1. **Leave Request Workflow**: Employee requests → Supervisor approval → Email notifications → Calendar feed updates
2. **User Allowance Calculation**: Pro-rated based on start date, manual adjustments via `UserAllowanceAdjustment`, carry-over logic in `calculateCarryOverAllowance.js`
3. **Department Hierarchy**: Users belong to departments with supervisors (`DepartmentSupervisor` join table)
4. **Company-wide Settings**: Leave types, bank holidays, schedules, LDAP config stored per company

### Testing
- **Integration tests**: `t/integration/` - Selenium WebDriver tests simulating user workflows
- **Unit tests**: `t/unit/` - Model and utility unit tests
- **Test helpers**: `t/lib/` - Shared test utilities and helpers
- **Important**: Start the application separately (`npm start`) before running integration tests
- WebDriver: Uses PhantomJS by default; set `USE_CHROME=1` to use Chrome/ChromeDriver instead
- Set `SHOW_CHROME=1` to watch browser interactions during Chrome tests

## Key Patterns & Conventions

### Coding Style
- **Module system**: CommonJS (`require`/`module.exports`)
- **Quotes**: Single quotes preferred
- **Indentation**: 2 spaces
- **Variables**: Prefer `const`/`let` in new code; match nearby style in existing files
- **File naming**: Lowercase with underscores (e.g., `user_allowance.js`, `bank_holidays.js`)
- **View logic**: Keep templates thin; business rules belong in `lib/model/` or `lib/route/`

### SCSS/CSS
- Edit source files in `scss/`, never edit generated files in `public/css/` directly
- Run `npm run compile-sass` after SCSS changes to regenerate `public/css/style.css`

### Sequelize Model Pattern
Models define three hooks for associations:
1. `associate(models)`: Basic foreign key relationships
2. `loadScope(models)`: Define scopes for filtered queries
3. `scopeAssociate(models)`: Associations that depend on scopes being loaded

### User Roles & Permissions
Three user types: employees, supervisors (via department assignment), and administrators (User.admin flag)

### Date/Time Handling
- **moment.js** with timezone support via moment-timezone
- Company timezone stored in `Company.timezone`, used for calculating "today" in user's context
- User start date affects pro-rated allowance calculations

### Extensibility Points
- Add leave types via Company settings (each type can use/not use vacation allowance, have limits)
- Custom absence colors: See `docs/extend_colors_for_leave_type.md`
- Redis sessions: See `docs/SessionStoreInRedis.md`
- Feature flags in `config/app.json`: `force_to_explicitly_select_type_when_requesting_new_leave`, `allow_create_new_accounts`, etc.

## Configuration & Security Notes

### Default Configuration
- **Email sending is OFF by default** (`send_emails: false` in `config/app.json`)
  - Update `application_sender_email` and `email_transporter` settings before enabling
- **Redis sessions are optional** - Sequelize session store is default
  - Set `sessionStore.useRedis: true` in `config/app.json` only if Redis is available
- **Development database**: SQLite file (`db.development.sqlite`) created automatically
- **Test/Production databases**: Require MySQL configuration in `config/db.json`

### Security
- **Never commit `crypto_secret`** or other sensitive keys to version control
  - `crypto_secret` in `config/app.json` is used for password hashing - rotate if exposed
  - Use environment variables or local config overrides for production credentials
- **Database credentials**: Keep real credentials out of `config/db.json` in version control
- **LDAP configuration**: Stored per-company in encrypted format in `Company.ldap_auth_config`
