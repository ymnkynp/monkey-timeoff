# Dependency Upgrade Plan for Codex

## Context

This TimeOff.Management application needs a dependency upgrade before implementing the standin/substitute approval feature. The current dependencies are from 2016-2019 and have known security vulnerabilities.

## Current State

**Node Version:** v22.17.0 (current)
**Target:** Keep Node v22 but upgrade all npm dependencies

**Key Dependencies to Upgrade:**
- Sequelize: `3.19.2` → `6.x` (latest stable)
- sqlite3: `4.0.1` → `5.x`
- Express: `4.13.4` → `4.18.x`
- Passport: `0.3.2` → `0.7.x`
- Nodemailer: `1.11.0` → `6.x`
- Handlebars: `4.5.0` → `4.7.x`
- Moment: `2.11.2` → `2.30.x` (or consider migrating to Luxon/date-fns)
- All other packages to latest compatible versions

## Critical Breaking Changes to Handle

### 1. Sequelize 3 → 6 (MAJOR)

**Documentation:** https://sequelize.org/docs/v6/other-topics/upgrade/

**Key Changes:**
- Promise API is now standard (bluebird no longer needed)
- `sequelize.sync()` behavior may differ
- Model definition syntax changed
- Operators now require explicit import: `const { Op } = require('sequelize')`
- Instance methods like `updateAttributes` → `update`
- Validation changes
- Migration file format updates

**Files to Update:**
- `lib/model/db/*.js` - All model definitions
- `lib/model/leave/index.js` - Leave creation logic
- `lib/model/mixin/user/*.js` - User mixins
- Any file using Sequelize queries with `where`, `include`, etc.

**Migration Considerations:**
- Existing migrations in `migrations/` should still work
- Test `npm run db-update` after upgrade
- Verify SQLite database file compatibility

### 2. sqlite3 4 → 5

**Changes:**
- Better Node.js v22 support with prebuilt binaries
- No major breaking changes, mostly drop-in replacement
- May need to rebuild native bindings

### 3. Express 4.13 → 4.18

**Changes:**
- Minimal breaking changes (mostly security fixes)
- Middleware order still matters
- Body-parser is now built-in (but external package still works)

### 4. Passport 0.3 → 0.7

**Changes:**
- Mostly compatible
- Session serialization may need tweaks
- Test authentication flows thoroughly

### 5. Nodemailer 1.x → 6.x

**Changes:**
- Complete rewrite of API
- Transport configuration changed
- Update `lib/email.js` extensively

**Before:**
```javascript
var nodemailer = require('nodemailer');
var transport = nodemailer.createTransport('SMTP', config);
```

**After:**
```javascript
const nodemailer = require('nodemailer');
const transport = nodemailer.createTransport({
  host: config.host,
  port: config.port,
  auth: { user: config.user, pass: config.pass }
});
```

## Upgrade Strategy

### Phase 1: Preparation
1. Create a backup branch: `git checkout -b pre-upgrade-backup`
2. Document current test status: run `npm test` and save output
3. Create upgrade branch: `git checkout -b dependency-upgrade`

### Phase 2: Package.json Updates
1. Update `package.json` dependencies to target versions:
   ```json
   {
     "dependencies": {
       "sequelize": "^6.37.0",
       "sqlite3": "^5.1.7",
       "express": "^4.18.2",
       "passport": "^0.7.0",
       "nodemailer": "^6.9.7",
       "handlebars": "^4.7.8",
       "moment": "^2.30.1",
       ...
     }
   }
   ```

2. Remove deprecated dependencies:
   - Remove `bluebird` (Sequelize 6 uses native Promises)
   - Remove `node-uuid` (replaced by `uuid`)

3. Update devDependencies:
   - `mocha`: `^6.2.2` → `^10.x`
   - `chai`: `^2.2.0` → `^4.x`
   - Replace `node-sass` with `sass` (modern version)

### Phase 3: Install & Fix Compilation Issues
1. Delete `node_modules` and `package-lock.json`
2. Run `npm install`
3. Fix any peer dependency warnings
4. Resolve native module compilation issues

### Phase 4: Code Updates

#### 4.1 Update Sequelize Models (`lib/model/db/*.js`)

**Example - User Model:**

**Before (Sequelize 3):**
```javascript
var User = sequelize.define("User", {
  // fields
}, {
  // options
});

User.associate = function(models) {
  User.belongsTo(models.Company, {as: 'company', foreignKey: 'companyId'});
};
```

**After (Sequelize 6):**
```javascript
const { Model, DataTypes, Op } = require('sequelize');

class User extends Model {
  static associate(models) {
    User.belongsTo(models.Company, {as: 'company', foreignKey: 'companyId'});
  }
}

User.init({
  // fields
}, {
  sequelize,
  modelName: 'User',
  // other options
});
```

**OR keep functional style (also supported in v6):**
```javascript
const User = sequelize.define("User", {
  // fields
}, {
  // options
});

User.associate = function(models) {
  User.belongsTo(models.Company, {as: 'company', foreignKey: 'companyId'});
};
```

**Key: Update all query operators:**
```javascript
// Before (Sequelize 3)
where: { id: { $gt: 5 } }

// After (Sequelize 6)
const { Op } = require('sequelize');
where: { id: { [Op.gt]: 5 } }
```

**Common operator mappings:**
- `$gt` → `Op.gt`
- `$lt` → `Op.lt`
- `$gte` → `Op.gte`
- `$lte` → `Op.lte`
- `$ne` → `Op.ne`
- `$in` → `Op.in`
- `$notIn` → `Op.notIn`
- `$like` → `Op.like`
- `$or` → `Op.or`
- `$and` → `Op.and`
- `$between` → `Op.between`

#### 4.2 Update Email System (`lib/email.js`)

Need complete rewrite of nodemailer integration. Current code uses v1 API.

**Checklist:**
- [ ] Update transport configuration
- [ ] Update `sendMail` method calls
- [ ] Test SMTP connection
- [ ] Test email sending in development mode

#### 4.3 Update Database Initialization (`lib/model/db/index.js`)

Sequelize 6 initialization may differ slightly. Ensure:
- `sequelize.sync()` works correctly
- Model associations are loaded properly
- Connection pooling is configured

#### 4.4 Update Query Files

Search for Sequelize queries in:
- `lib/route/*.js`
- `lib/model/**/*.js`

Update all `$` operators to `Op.*` syntax.

#### 4.5 Update SASS Compilation

Replace `node-sass` with `sass` (Dart Sass):

**package.json:**
```json
"devDependencies": {
  "sass": "^1.69.0"
}
```

**Update npm script if needed:**
```json
"scripts": {
  "compile-sass": "sass scss/main.scss public/css/style.css"
}
```

### Phase 5: Testing

1. **Database Migration Test:**
   ```bash
   rm db.development.sqlite  # Start fresh
   npm run db-update
   ```

2. **Server Start Test:**
   ```bash
   npm start
   # Should start without errors on http://localhost:3000
   ```

3. **Manual Testing:**
   - [ ] Create company account
   - [ ] Create users
   - [ ] Create leave request
   - [ ] Approve/reject leave
   - [ ] Test LDAP authentication (if configured)
   - [ ] Test email sending (if enabled)
   - [ ] Test calendar feeds
   - [ ] Test reports

4. **Automated Tests:**
   ```bash
   npm test
   # Goal: All tests passing (or at least same pass rate as before)
   ```

5. **Integration Tests:**
   ```bash
   npm start  # In separate terminal
   USE_CHROME=1 npm test
   ```

### Phase 6: Documentation

Create `_AI Briefing/UPGRADE-NOTES.md` documenting:
- What was upgraded
- Breaking changes encountered
- Code patterns that changed
- Any remaining issues or warnings
- Test results (before/after comparison)

## Definition of Done

The dependency upgrade is complete when:

1. ✅ All dependencies updated to modern versions
2. ✅ `npm install` completes successfully without errors
3. ✅ `npm start` starts the server without errors
4. ✅ Database migrations run successfully
5. ✅ Manual smoke tests pass:
   - User creation
   - Leave request flow
   - Approval workflow
   - Calendar views
6. ✅ Automated tests pass (or failures are documented)
7. ✅ No console errors in browser
8. ✅ Application is functionally equivalent to pre-upgrade
9. ✅ Upgrade notes document created

## Handoff to Claude

Once upgrade is complete, Claude will:
1. Review the upgraded codebase
2. Verify all changes are compatible with the standin approval feature plan
3. Begin implementing the standin feature using the updated dependency versions
4. Adjust implementation plan if needed based on Sequelize 6 patterns

## Critical Files to Check After Upgrade

**Must work correctly:**
- `lib/model/db/user.js` - User model (we'll add `standinId` field here)
- `lib/model/db/leave.js` - Leave model (we'll modify approval logic)
- `lib/model/db/department.js` - Department relationships
- `lib/model/leave/index.js` - Leave creation (we'll add LeaveApproval logic)
- `lib/route/requests.js` - Approval routes (we'll modify these)
- `lib/email.js` - Email sending (we'll add standin notification emails)
- `bin/wwww` - Server startup with `sequelize.sync()`

**Configuration files:**
- `config/db.json` - SQLite/MySQL config
- `config/app.json` - Application settings
- `.sequelizerc` - Sequelize CLI config

## Questions to Clarify

1. **Should we migrate from Moment.js to a modern alternative?**
   - Moment is now in maintenance mode
   - Could use Luxon or date-fns
   - But requires changing many date operations
   - **Recommendation:** Keep Moment for now, upgrade separately later

2. **MySQL compatibility?**
   - Current code supports MySQL for production
   - Sequelize 6 still supports MySQL
   - Should test with MySQL after SQLite works

3. **Node version policy?**
   - Keep Node v22? Or downgrade to LTS (v20)?
   - **Recommendation:** Keep v22, it's the current version

## Useful Commands

```bash
# Check outdated packages
npm outdated

# Update package.json interactively
npx npm-check-updates -i

# Test specific model
node -e "const models = require('./lib/model/db'); models.User.findAll().then(console.log)"

# Run single test
node node_modules/mocha/bin/mocha --recursive t/unit/user_model.js

# Check for deprecated Sequelize operators
grep -r "\$gt\|\$lt\|\$in\|\$or" lib/
```

## Risk Assessment

**High Risk Areas:**
- Sequelize query syntax changes (many files affected)
- Nodemailer API rewrite (email system may break)
- Migration compatibility (existing migrations may fail)

**Medium Risk:**
- Session store compatibility
- Passport authentication flow
- Date/time handling

**Low Risk:**
- Express middleware (minimal changes)
- Handlebars templates (no changes needed)
- Static assets

## Timeline Estimate

- Phase 1-2 (Prep & package.json): 30 minutes
- Phase 3 (Install): 15 minutes
- Phase 4 (Code updates): 3-4 hours
- Phase 5 (Testing): 1-2 hours
- Phase 6 (Documentation): 30 minutes

**Total: 5-7 hours**

## Support Resources

- Sequelize v6 Migration Guide: https://sequelize.org/docs/v6/other-topics/upgrade/
- Nodemailer v6 Docs: https://nodemailer.com/about/
- Express 4.x API: https://expressjs.com/en/4x/api.html
- Node.js v22 Docs: https://nodejs.org/docs/latest-v22.x/api/

---

## Ready for Codex

Codex, please follow this plan to upgrade all dependencies. Focus on:
1. Getting `npm install` to work
2. Updating Sequelize queries to v6 syntax (Op.* operators)
3. Rewriting nodemailer integration
4. Testing the server starts and basic flows work

When done, document what you changed in `_AI Briefing/UPGRADE-NOTES.md` and Claude will take over for the standin feature implementation.
