# Project: TimeOff.Management

## Project Overview

TimeOff.Management is a simple yet powerful Node.js web application designed for managing employee absences in small and medium-sized businesses. It is built with **Express.js** for the web framework, **Sequelize ORM** for database interaction, and **Handlebars** for templating.

The application supports multiple database backends, defaulting to **SQLite** for development and typically using **MySQL** for production environments. Key features include multiple views of staff absences (Calendar, Team, List), extensive customization to align with company policies (custom absence types, public holidays, departmental grouping with supervisor assignments), and **department-based hierarchical approval workflows**.

It supports third-party calendar integration (MS Outlook, Google Calendar, iCal), features a three-step workflow for requesting, approving, and accounting for absences, and includes access control with employee, supervisor, and administrator roles. **Optional LDAP authentication** is available, and the system allows exporting leave data to CSV. The most used customer paths are mobile-friendly.

**Key Technologies:**
*   **Backend:** Node.js (minimum v13.0.0), Express.js
*   **Database:** SQLite3 (development), MySQL (production), managed with Sequelize ORM
*   **Templating:** Express-Handlebars
*   **Authentication:** Passport.js (LocalStrategy, BearerStrategy) with support for LDAP via `ldapauth-fork`
*   **Session Management:** Express-session (default Sequelize-based, optional Redis)
*   **Email:** Nodemailer
*   **Calendar Feeds:** `ical-generator`
*   **Testing:** Mocha, Chai, Selenium-webdriver
*   **Styling:** SASS (compiled to CSS)
*   **Module System:** CommonJS

## Building and Running

### Installation and First Run

To set up and run the application for the first time:

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/timeoff-management/application.git timeoff-management
    cd timeoff-management
    ```
2.  **Install dependencies:** Ensure Node.js (version 13 or higher) and SQLite are installed on your system.
    ```bash
    npm install
    ```
3.  **Start the application:**
    ```bash
    npm start
    ```
    The server will start on `http://localhost:3000/`.
4.  **Access in browser:** Open your web browser to `http://localhost:3000/`

### Running Tests

The project has wide test coverage.

*   **To execute all tests:**
    ```bash
    npm test
    ```
    By default, `npm test` uses PhantomJS WebDriver.
*   **To run tests using Chrome browser (requires Chrome and ChromeDriver installed and in your system's PATH):**
    ```bash
    USE_CHROME=1 npm test
    ```
    Add `SHOW_CHROME=1` to see browser interactions during integration tests:
    ```bash
    USE_CHROME=1 SHOW_CHROME=1 npm test
    ```
    Note: For integration tests, ensure the application is running separately (e.g., via `npm start`) before executing tests.
*   **To run a specific test file:**
    ```bash
    node node_modules/mocha/bin/mocha --recursive t/integration/specific_test.js
    ```

### Updating an Existing Instance

To update your local instance with the latest code:

```bash
git fetch
git pull origin master
npm install
npm run-script db-update
npm start
```

### Other Useful Commands

*   **Compile SASS to CSS:**
    ```bash
    npm run compile-sass
    ```
    This rebuilds `public/css/style.css` from `scss/main.scss`.
*   **Run database migrations:**
    ```bash
    npm run db-update
    ```
    This uses Sequelize CLI with configurations from `config/db.json` and models from `lib/model/db/`.
*   **Calculate carry-over allowance for all users:**
    ```bash
    npm run carry-over-allowance
    ```

## Development Conventions

### Project Structure & Module Organization

*   `app.js`: Bootstraps the Express application, sets up middleware, registers routes, and configures sessions/authentication.
*   `lib/`: Contains server-side logic, including:
    *   `lib/route/`: Modular route handlers organized by feature (e.g., `login.js`, `dashboard.js`, `users/`, `api/`).
    *   `lib/middleware/`: Express middleware (e.g., `withSession.js`, `ensure_user_is_admin.js`).
    *   `lib/model/db/`: Sequelize models defining database schema. These models include `associate()`, `loadScope()`, and `scopeAssociate()` hooks for managing relationships and query scopes.
    *   Other business logic models: `user_allowance.js`, `calendar_month.js`, `team_view.js`, `leave_collection.js`.
    *   `lib/view/helpers.js`: Custom Handlebars helpers.
*   `views/`: Handlebars templates (`.hbs` files), with `views/layouts/main.hbs` as the default layout. View logic should be kept thin.
*   `public/`: Serves static assets, including compiled CSS and JavaScript. Generated CSS files should not be edited directly.
*   `scss/`: Source SASS files, which compile to `public/css/style.css`.
*   `config/`: Stores runtime configuration files (`app.json`, `db.json`, `localisation.json`). **Secrets and sensitive credentials should never be committed to version control.**
*   `t/`: Houses all tests:
    *   `t/unit/`: Unit tests for models and utilities.
    *   `t/integration/`: Selenium WebDriver tests simulating user workflows and UI interactions.
    *   `t/lib/`: Test helper functions.
*   `bin/`: Contains executable entry scripts, notably `bin/wwww` (the main server entry point).

### Coding Style & Naming Conventions

*   **Module System:** Use CommonJS modules (`require`/`module.exports`).
*   **Quoting:** Prefer single quotes for strings.
*   **Indentation:** Use 2-space indentation.
*   **Variable Declaration:** Prefer `const` and `let` in new code, while matching the style of surrounding existing code.
*   **File Naming:** Use descriptive lowercase names with underscores (e.g., `lib/route/bank_holidays.js`, `lib/middleware/with_session.js`).
*   **Logic Separation:** Keep view logic minimal; business rules and complex operations should reside in the `lib/` directory.

### Testing Guidelines

*   **Coverage:** Strive for good test coverage for all new features and bug fixes.
*   **Organization:** Unit tests (`t/unit/`) focus on individual components (models, utilities), while integration tests (`t/integration/`) cover user flows and UI interactions.
*   **Assertions:** Use Chai for writing assertions.
*   **Environment:** Integration tests require Chrome and ChromeDriver installed. Default WebDriver is PhantomJS.
*   **Fixtures:** Keep test fixtures minimal and ensure state is reset between tests.
*   **New Code:** Add or adjust tests for new routes, models, or views.

### Commit & Pull Request Guidelines

*   **Commit Subjects:** Should be short, imperative, and optionally scoped (e.g., `route: improve audit feed`).
*   **Focus:** Keep commits focused on a single logical change, ideally with matching tests or migrations.
*   **CSS Compilation:** Only rebuild compiled CSS when SCSS changes.
*   **Pull Request Content:** PRs should clearly state their intent, describe the testing performed (e.g., `npm test`, manual steps), and include screenshots or GIFs for UI changes. Link any relevant issues or tickets and flag follow-up work.

### Configuration & Security Notes

*   **Database:** Development environments default to SQLite (`db.development.sqlite`). Test and production configurations are typically set up for MySQL.
*   **Credentials:** Do not commit real database credentials, API keys, or other sensitive information directly into version control. Use local overrides or environment variables.
*   **Redis Sessions:** Optional via `config/app.json`. Ensure Redis is available and properly configured before enabling.
*   **Email Sending:** Email functionality is off by default. Update `application_sender_email` and transporter settings in `config/app.json` to enable.
*   **Secrets:** Keep `crypto_secret` and other cryptographic keys private. Rotate them if they are ever exposed.
