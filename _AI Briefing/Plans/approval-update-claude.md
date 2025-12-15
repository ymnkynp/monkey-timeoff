# Standin/Substitute Approval Feature - Implementation Plan

## Overview

This plan outlines the implementation of a dual-approval system where leave requests can optionally require approval from both a designated standin/substitute AND the department manager. This ensures that someone is available to cover the employee's responsibilities during their absence.

**Plan Status**: Updated 2025-12-15 to incorporate corrections from codex feedback review.

**Key Corrections Applied**:
- ✅ **Auto-approve**: Now correctly skips entire approval system (no LeaveApproval records created)
- ✅ **Revoke flow**: Changed to manager-only (standin not involved in revoke decisions)
- ✅ **Manager == Standin**: Added deduplication logic to create only one approval record
- ✅ **Migration clarity**: Clarified handling of existing leaves and backfill strategy

## Requirements Summary

Based on user requirements:
- **Optional Feature**: If no standin is configured, the current approval flow remains (department manager only)
- **Configuration Rights**: Administrators and department managers can assign standins to users
- **Parallel Approvals**: Both standin and department manager receive notifications simultaneously and can approve in any order
- **Full Approval**: Leave is only fully approved when BOTH standin and department manager have approved
- **Conflict Handling**: Allow leave requests even if standin is on leave, but display warnings to relevant parties
- **Backward Compatibility**: Existing leave requests and users without standins continue to work as before

---

## 1. Database Schema Changes

### 1.1 Add `standinId` to User Table

**Migration**: `migrations/YYYYMMDD-add-standin-to-users.js`

```javascript
module.exports = {
  up: function (queryInterface, Sequelize) {
    return queryInterface.addColumn('Users', 'standinId', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: {
        model: 'Users',
        key: 'id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
      comment: 'Default standin/substitute who must approve this user\'s leave requests'
    });
  },

  down: function (queryInterface, Sequelize) {
    return queryInterface.removeColumn('Users', 'standinId');
  }
};
```

**Notes**:
- Self-referential foreign key: `User.standinId -> User.id`
- `allowNull: true` ensures optional standins
- `SET NULL` on delete prevents cascading issues
- Users can act as standins for multiple people

### 1.2 New `LeaveApproval` Table (Multi-Approval Tracking)

**Migration**: `migrations/YYYYMMDD-create-leave-approval-table.js`

Create a new junction table to track multiple approvals per leave request:

```javascript
module.exports = {
  up: function (queryInterface, Sequelize) {
    return queryInterface.createTable('LeaveApprovals', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      leaveId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'Leaves',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      approverId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'Users',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      approverType: {
        type: Sequelize.ENUM('MANAGER', 'STANDIN'),
        allowNull: false,
        comment: 'Type of approver: department manager or standin'
      },
      status: {
        type: Sequelize.ENUM('PENDING', 'APPROVED', 'REJECTED'),
        allowNull: false,
        defaultValue: 'PENDING'
      },
      decidedAt: {
        type: Sequelize.DATE,
        allowNull: true
      },
      comment: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'Optional comment from approver'
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false
      }
    });
  },

  down: function (queryInterface, Sequelize) {
    return queryInterface.dropTable('LeaveApprovals');
  }
};
```

**Design Rationale**:
- **Flexible Tracking**: Supports multiple approvers per leave (future-proof for additional approval chains)
- **Individual Status**: Each approver has their own approval status
- **Type Distinction**: `approverType` distinguishes between manager and standin approvals
- **Audit Trail**: Tracks who approved when with optional comments
- **Cascading Deletes**: LeaveApprovals are deleted when the Leave is deleted

### 1.3 Update Leave Table (Optional Enhancement)

**Consider adding**: `requires_standin_approval` boolean to Leave table for quick filtering

```javascript
// Optional: Add flag to Leave model for performance
queryInterface.addColumn('Leaves', 'requires_standin_approval', {
  type: Sequelize.BOOLEAN,
  allowNull: false,
  defaultValue: false,
  comment: 'Whether this leave requires standin approval (denormalized for performance)'
});
```

**Purpose**: Quick filtering without joining to User table. Set to `true` when leave is created if user has a standin.

---

## 2. Model Changes

### 2.1 User Model (`lib/model/db/user.js`)

**Add Association**:
```javascript
// In User.associate(models)
User.belongsTo(models.User, {
  as: 'standin',
  foreignKey: 'standinId'
});

User.hasMany(models.User, {
  as: 'standingInFor',
  foreignKey: 'standinId'
});
```

**Add Instance Methods**:
```javascript
// Get users for whom this user is a standin
User.prototype.promise_users_i_standin_for = function() {
  return this.Model.scope('active').findAll({
    where: { standinId: this.id }
  });
};

// Check if user has a standin configured
User.prototype.has_standin = function() {
  return !!this.standinId;
};

// Get standin with proper loading
User.prototype.promise_standin = function() {
  if (!this.standinId) {
    return Promise.resolve(null);
  }

  return this.Model.scope('active').findByPk(this.standinId);
};
```

**Add Validation**:
```javascript
// In User model definition
validate: {
  standinCannotBeSelf() {
    if (this.standinId && this.standinId === this.id) {
      throw new Error('A user cannot be their own standin');
    }
  }
}
```

### 2.2 New LeaveApproval Model (`lib/model/db/leave_approval.js`)

Create new model file:

```javascript
'use strict';

module.exports = function(sequelize, DataTypes) {
  const LeaveApproval = sequelize.define('LeaveApproval', {
    leaveId: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    approverId: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    approverType: {
      type: DataTypes.ENUM('MANAGER', 'STANDIN'),
      allowNull: false
    },
    status: {
      type: DataTypes.ENUM('PENDING', 'APPROVED', 'REJECTED'),
      allowNull: false,
      defaultValue: 'PENDING'
    },
    decidedAt: {
      type: DataTypes.DATE,
      allowNull: true
    },
    comment: {
      type: DataTypes.TEXT,
      allowNull: true
    }
  }, {
    tableName: 'LeaveApprovals',
    indexes: [
      {
        fields: ['leaveId']
      },
      {
        fields: ['approverId']
      },
      {
        unique: true,
        fields: ['leaveId', 'approverType'],
        name: 'unique_leave_approver_type'
      }
    ]
  });

  LeaveApproval.associate = function(models) {
    LeaveApproval.belongsTo(models.Leave, {
      as: 'leave',
      foreignKey: 'leaveId'
    });

    LeaveApproval.belongsTo(models.User, {
      as: 'approver',
      foreignKey: 'approverId'
    });
  };

  // Instance methods
  LeaveApproval.prototype.promise_to_approve = function(comment) {
    this.status = 'APPROVED';
    this.decidedAt = new Date();
    if (comment) this.comment = comment;
    return this.save();
  };

  LeaveApproval.prototype.promise_to_reject = function(comment) {
    this.status = 'REJECTED';
    this.decidedAt = new Date();
    if (comment) this.comment = comment;
    return this.save();
  };

  LeaveApproval.prototype.is_pending = function() {
    return this.status === 'PENDING';
  };

  LeaveApproval.prototype.is_approved = function() {
    return this.status === 'APPROVED';
  };

  LeaveApproval.prototype.is_rejected = function() {
    return this.status === 'REJECTED';
  };

  return LeaveApproval;
};
```

### 2.3 Leave Model Updates (`lib/model/db/leave.js`)

**Add Association**:
```javascript
// In Leave.associate(models)
Leave.hasMany(models.LeaveApproval, {
  as: 'approvals',
  foreignKey: 'leaveId'
});
```

**Add Helper Methods**:
```javascript
// Check if leave requires standin approval
Leave.prototype.requires_standin_approval = function() {
  return this.requires_standin_approval || false; // uses denormalized field if present
};

// Get all approvals for this leave
Leave.prototype.promise_approvals = function() {
  return this.Model.sequelize.models.LeaveApproval.findAll({
    where: { leaveId: this.id },
    include: [
      {
        model: this.Model.sequelize.models.User,
        as: 'approver'
      }
    ]
  });
};

// Check if all required approvals are complete
Leave.prototype.promise_check_all_approvals_complete = function() {
  return this.promise_approvals()
    .then(approvals => {
      if (approvals.length === 0) return true; // No approvals needed (backward compatibility)

      const anyRejected = approvals.some(a => a.is_rejected());
      if (anyRejected) return false;

      const allApproved = approvals.every(a => a.is_approved());
      return allApproved;
    });
};

// Get approval status summary
Leave.prototype.promise_approval_summary = function() {
  return this.promise_approvals()
    .then(approvals => {
      return {
        total: approvals.length,
        approved: approvals.filter(a => a.is_approved()).length,
        rejected: approvals.filter(a => a.is_rejected()).length,
        pending: approvals.filter(a => a.is_pending()).length,
        approvals: approvals
      };
    });
};
```

**Update Existing Approval Methods**:

The existing `promise_to_approve` and `promise_to_reject` methods need to be updated to work with the new LeaveApproval system:

```javascript
// Modified approval method
Leave.prototype.promise_to_approve = function(args) {
  const by_user = args.by_user;
  const comment = args.comment || null;

  return this.promise_approvals()
    .then(approvals => {
      // Find the approval record for this approver
      const approval = approvals.find(a => a.approverId === by_user.id);

      if (!approval) {
        throw new Error('User is not authorized to approve this leave');
      }

      if (!approval.is_pending()) {
        throw new Error('This approval has already been processed');
      }

      // Approve this individual approval
      return approval.promise_to_approve(comment);
    })
    .then(() => {
      // Check if all approvals are complete
      return this.promise_check_all_approvals_complete();
    })
    .then(allComplete => {
      if (allComplete) {
        // All approvals done - update leave status to APPROVED
        this.status = 2; // APPROVED
        this.approverId = by_user.id; // Last approver (for backward compatibility)
        this.decided_at = new Date();
        return this.save();
      }
      // Not all approvals complete yet - leave in NEW status
      return this;
    });
};

// Modified rejection method
Leave.prototype.promise_to_reject = function(args) {
  const by_user = args.by_user;
  const comment = args.comment || null;

  return this.promise_approvals()
    .then(approvals => {
      const approval = approvals.find(a => a.approverId === by_user.id);

      if (!approval) {
        throw new Error('User is not authorized to reject this leave');
      }

      if (!approval.is_pending()) {
        throw new Error('This approval has already been processed');
      }

      // Reject this approval
      return approval.promise_to_reject(comment);
    })
    .then(() => {
      // Any rejection = entire leave is REJECTED
      this.status = 3; // REJECTED
      this.approverId = by_user.id;
      this.decided_at = new Date();
      return this.save();
    });
};

// Modified revoke method - MANAGER ONLY
Leave.prototype.promise_to_revoke = function() {
  if (this.does_skip_approval()) {
    // Auto-approved leave - revoke immediately without approval
    this.status = 3; // REJECTED
    return this.save();
  }

  // Set status to PENDED_REVOKE
  this.status = 4;

  // Only reset MANAGER approval to pending (standin is NOT involved in revokes)
  return this.promise_approvals()
    .then(approvals => {
      const managerApproval = approvals.find(a => a.approverType === 'MANAGER');

      if (managerApproval) {
        managerApproval.status = 'PENDING';
        managerApproval.decidedAt = null;
        return Promise.all([this.save(), managerApproval.save()]);
      }

      // Fallback if no manager approval exists (shouldn't happen)
      return this.save();
    });
};
```

### 2.4 Leave Creation Logic (`lib/model/leave/index.js`)

Update the `createNewLeave` function to create approval records:

```javascript
// In createNewLeave function, after leave is created:

// Get employee with standin
const employee = await models.User.findByPk(leave.userId, {
  include: [{
    model: models.User,
    as: 'standin'
  }]
});

// Check if auto-approve is enabled
const leaveType = await leave.getLeaveType();
const skipApproval = models.Leave.does_skip_approval(employee, leaveType);

if (skipApproval) {
  // Auto-approve: skip entire approval system (no LeaveApproval records needed)
  leave.status = 2; // APPROVED
  await leave.save();
  // Send auto-approval notifications and return
  return leave;
}

// Get department supervisor
const supervisor = await employee.promise_supervisor();

// Create approval records, avoiding duplicates when manager == standin
const approversMap = new Map();

// Always add manager
approversMap.set(supervisor.id, 'MANAGER');

// Add standin only if configured AND different from manager
if (employee.standinId && employee.standinId !== supervisor.id) {
  approversMap.set(employee.standinId, 'STANDIN');

  // Set flag on leave for quick filtering
  if (leave.requires_standin_approval !== undefined) {
    leave.requires_standin_approval = true;
  }
}

// Create approval records from the deduplicated map
const approvals = Array.from(approversMap.entries()).map(([approverId, approverType]) =>
  models.LeaveApproval.create({
    leaveId: leave.id,
    approverId: approverId,
    approverType: approverType,
    status: 'PENDING'
  })
);

await Promise.all(approvals);

if (leave.requires_standin_approval) {
  await leave.save();
}
```

---

## 3. Approval Workflow Logic Changes

### 3.1 Current Flow (Before Changes)

```
Employee submits leave request
  ↓
Leave.status = NEW (1)
Leave.approverId = department.boss
  ↓
Department supervisor views in /requests
  ↓
Supervisor approves → Leave.status = APPROVED (2)
Supervisor rejects → Leave.status = REJECTED (3)
```

### 3.2 New Flow (With Standin)

```
Employee submits leave request
  ↓
Check if auto-approve enabled
  ↓
If auto-approve → Leave.status = APPROVED (2) immediately
                  No LeaveApproval records created
                  Send auto-approval notifications
  ↓
If NOT auto-approve:
  ↓
Leave.status = NEW (1)
  ↓
Check if manager == standin
  ↓
If manager == standin:
  Create 1 LeaveApproval (MANAGER only)
  ↓
If manager != standin and standin exists:
  Create 2 LeaveApprovals:
    - MANAGER approval (department boss) - PENDING
    - STANDIN approval - PENDING
  ↓
If no standin configured:
  Create 1 LeaveApproval (MANAGER only)
  ↓
Both manager and standin receive notifications (if both exist)
  ↓
Either approver can approve first (parallel)
  ↓
First approval → LeaveApproval.status = APPROVED (that approver)
                 Leave.status remains NEW (1)
  ↓
Second approval → LeaveApproval.status = APPROVED (that approver)
                  Leave.status = APPROVED (2) [all complete]
  ↓
If ANY approver rejects → Leave.status = REJECTED (3) immediately
```

### 3.3 Revoke Flow (Manager-Only)

**Important**: Revoke approval is **MANAGER-ONLY**. Standin is not involved in revoke decisions.

```
Employee or manager requests revoke of approved leave
  ↓
If auto-approved → Leave.status = REJECTED (3) immediately
  ↓
If NOT auto-approved:
  Leave.status = PENDED_REVOKE (4)
  Reset MANAGER approval to PENDING (standin approval untouched)
  ↓
Manager reviews revoke request
  ↓
Manager approves revoke → Leave.status = REJECTED (3) [revoke granted]
Manager rejects revoke → Leave.status = APPROVED (2) [leave remains]
```

### 3.4 User Methods for Standin-Aware Supervision

Update `lib/model/mixin/user/absence_aware.js`:

```javascript
// Add method to get leaves where user is standin approver
User.prototype.promise_leaves_to_approve_as_standin = function(args) {
  const models = this.Model.sequelize.models;

  return models.LeaveApproval.findAll({
    where: {
      approverId: this.id,
      approverType: 'STANDIN',
      status: 'PENDING'
    },
    include: [
      {
        model: models.Leave,
        as: 'leave',
        where: {
          status: { [models.Sequelize.Op.in]: [1, 4] } // NEW or PENDED_REVOKE
        },
        include: [
          {
            model: models.User,
            as: 'user'
          },
          {
            model: models.LeaveType,
            as: 'leave_type'
          }
        ]
      }
    ]
  }).then(approvals => approvals.map(a => a.leave));
};

// Update existing promise_leaves_to_be_processed to include standin leaves
User.prototype.promise_leaves_to_be_processed = function(args) {
  const models = this.Model.sequelize.models;

  return Promise.all([
    // Original: leaves from supervised users
    this.promise_users_I_can_manage()
      .then(users => {
        const userIds = users.map(u => u.id);
        return models.Leave.findAll({
          where: {
            userId: { [models.Sequelize.Op.in]: userIds },
            status: { [models.Sequelize.Op.in]: [1, 4] }
          },
          include: [
            { model: models.User, as: 'user' },
            { model: models.LeaveType, as: 'leave_type' },
            { model: models.LeaveApproval, as: 'approvals' }
          ]
        });
      }),

    // New: leaves where user is standin
    this.promise_leaves_to_approve_as_standin()
  ])
  .then(([managerLeaves, standinLeaves]) => {
    // Merge and deduplicate
    const allLeaves = [...managerLeaves, ...standinLeaves];
    const uniqueLeaves = Array.from(new Map(allLeaves.map(l => [l.id, l])).values());
    return uniqueLeaves;
  });
};
```

---

## 4. Route/Controller Changes

### 4.1 User Settings Route (`lib/route/users/edit.js`)

**Add Standin Configuration Field**:

In the user edit form handler, add standin selection:

```javascript
// GET /users/edit/:user_id
router.get('/edit/:user_id', require_permission_to_edit_user, (req, res) => {
  const user_id = req.params.user_id;

  Promise.all([
    req.user.get_company_with_all_users(),
    models.User.findByPk(user_id, {
      include: [
        { model: models.Department, as: 'department' },
        { model: models.User, as: 'standin' }
      ]
    })
  ])
  .then(([company, employee]) => {
    // Get potential standins (all active users in company except self)
    const potentialStandins = company.users
      .filter(u => u.id !== employee.id && !u.is_admin())
      .sort((a, b) => a.full_name().localeCompare(b.full_name()));

    res.render('user_edit', {
      employee: employee,
      company: company,
      potential_standins: potentialStandins,
      current_standin: employee.standin
    });
  });
});

// POST /users/edit/:user_id
router.post('/edit/:user_id', require_permission_to_edit_user, (req, res) => {
  const standinId = req.body.standin_id ? parseInt(req.body.standin_id) : null;

  // Validate standin is not self
  if (standinId && standinId === parseInt(req.params.user_id)) {
    req.session.flash_error('A user cannot be their own standin');
    return res.redirect_with_session('/users/edit/' + req.params.user_id);
  }

  return models.User.findByPk(req.params.user_id)
    .then(employee => {
      employee.standinId = standinId;
      // ... other field updates
      return employee.save();
    })
    .then(() => {
      req.session.flash_message('User details updated');
      res.redirect_with_session('/users/');
    });
});
```

**Middleware for Permission**:
```javascript
// Only admins and department managers can set standins
function require_permission_to_edit_user(req, res, next) {
  const target_user_id = req.params.user_id;

  Promise.all([
    req.user.promise_supervised_departments(),
    models.User.findByPk(target_user_id)
  ])
  .then(([supervisedDepts, targetUser]) => {
    // Admin can edit anyone
    if (req.user.admin) {
      return next();
    }

    // Department manager can edit their team members
    const isSupervisor = supervisedDepts.some(dept => dept.id === targetUser.DepartmentId);
    if (isSupervisor) {
      return next();
    }

    req.session.flash_error('You do not have permission to edit this user');
    res.redirect_with_session('/');
  });
}
```

### 4.2 Requests Route Updates (`lib/route/requests.js`)

**Update Approval Display**:

Modify `/requests/` page to show approval status for each leave:

```javascript
router.get('/', (req, res) => {
  req.user.promise_leaves_to_be_processed()
    .then(leaves => {
      // Load approval details for each leave
      return Promise.all(
        leaves.map(leave =>
          leave.promise_approval_summary()
            .then(summary => {
              leave.approval_summary = summary;

              // Determine if current user can approve this leave
              const userApproval = summary.approvals.find(a => a.approverId === req.user.id);
              leave.user_can_approve = userApproval && userApproval.is_pending();
              leave.user_approval_type = userApproval ? userApproval.approverType : null;

              return leave;
            })
        )
      );
    })
    .then(leaves => {
      res.render('requests', {
        leaves: leaves,
        current_user: req.user
      });
    });
});
```

**Update Approval Actions**:

```javascript
router.post('/approve/', (req, res) => {
  const leave_id = req.body.request;
  const comment = req.body.comment;

  models.Leave.findByPk(leave_id, {
    include: [
      { model: models.User, as: 'user' },
      { model: models.LeaveApproval, as: 'approvals' }
    ]
  })
  .then(leave => {
    if (!leave) {
      throw new Error('Leave not found');
    }

    // Check if user is authorized to approve
    const userApproval = leave.approvals.find(a =>
      a.approverId === req.user.id && a.is_pending()
    );

    if (!userApproval) {
      throw new Error('You are not authorized to approve this leave or it has already been processed');
    }

    // Approve
    return leave.promise_to_approve({
      by_user: req.user,
      comment: comment
    });
  })
  .then(leave => {
    // Check if fully approved or still pending other approvals
    return leave.promise_check_all_approvals_complete()
      .then(allComplete => {
        if (allComplete) {
          req.session.flash_message('Leave request has been fully approved');
        } else {
          req.session.flash_message('Your approval has been recorded. Waiting for other approvals.');
        }

        // Send appropriate emails
        return email.promise_leave_request_decision_emails({
          leave: leave,
          action: 'approve',
          by_user: req.user
        });
      });
  })
  .then(() => {
    res.redirect_with_session('/requests/');
  })
  .catch(error => {
    req.session.flash_error(error.message);
    res.redirect_with_session('/requests/');
  });
});

// Similar updates for /reject/ route
```

### 4.3 Calendar/Dashboard Updates

Update views to show approval status:
- In user's calendar: show pending approval state differently
- In team view: show leaves awaiting multiple approvals
- In dashboard: add section for "Leaves you need to approve as standin"

---

## 5. UI/View Changes

### 5.1 User Edit Form (`views/user_edit.hbs`)

Add standin selection dropdown:

```handlebars
{{!-- Add this section in the user edit form --}}
<div class="form-group">
  <label for="standin_id">Default Standin/Substitute (Optional)</label>
  <select class="form-control" id="standin_id" name="standin_id">
    <option value="">-- No standin required --</option>
    {{#each potential_standins}}
      <option value="{{this.id}}"
              {{#if ../current_standin}}
                {{#if (eq this.id ../current_standin.id)}}selected{{/if}}
              {{/if}}>
        {{this.name}} {{this.lastname}} ({{this.department.name}})
      </option>
    {{/each}}
  </select>
  <small class="form-text text-muted">
    If set, this person must also approve leave requests along with the department manager.
    They will be notified when this employee requests time off.
  </small>
</div>
```

### 5.2 Requests Page (`views/requests.hbs`)

Update leave request display to show multi-approval status:

```handlebars
{{#each leaves}}
  <tr class="{{#if user_can_approve}}pending-my-approval{{/if}}">
    <td>{{user.full_name}}</td>
    <td>{{format_date date_start}} - {{format_date date_end}}</td>
    <td>{{leave_type.name}}</td>

    {{!-- New: Show approval status --}}
    <td>
      {{#if approval_summary}}
        <div class="approval-status">
          {{#each approval_summary.approvals}}
            <div class="approval-item">
              <span class="approver-type badge badge-secondary">
                {{#if (eq approverType 'MANAGER')}}Manager{{else}}Standin{{/if}}
              </span>
              <span class="approver-name">{{approver.full_name}}</span>
              <span class="approval-badge badge
                {{#if (eq status 'APPROVED')}}badge-success
                {{else if (eq status 'REJECTED')}}badge-danger
                {{else}}badge-warning{{/if}}">
                {{status}}
              </span>
            </div>
          {{/each}}
        </div>
      {{else}}
        <span class="badge badge-info">Single Approval (Legacy)</span>
      {{/if}}
    </td>

    <td>
      {{#if user_can_approve}}
        <form method="POST" action="/requests/approve/" style="display: inline;">
          <input type="hidden" name="request" value="{{id}}">
          <button type="submit" class="btn btn-sm btn-success">
            Approve as {{user_approval_type}}
          </button>
        </form>
        <form method="POST" action="/requests/reject/" style="display: inline;">
          <input type="hidden" name="request" value="{{id}}">
          <button type="submit" class="btn btn-sm btn-danger">Reject</button>
        </form>
      {{else}}
        <span class="text-muted">
          {{#if approval_summary}}
            {{approval_summary.approved}}/{{approval_summary.total}} approved
          {{/if}}
        </span>
      {{/if}}
    </td>
  </tr>
{{/each}}
```

### 5.3 Dashboard Updates (`views/dashboard.hbs`)

Add section for standin approvals:

```handlebars
{{#if standin_leaves_to_approve}}
  <div class="panel panel-info">
    <div class="panel-heading">
      <h3 class="panel-title">
        <i class="fa fa-user-circle"></i>
        Leaves requiring your approval as standin
      </h3>
    </div>
    <div class="panel-body">
      <p>You are the designated standin for these leave requests:</p>
      <ul class="list-group">
        {{#each standin_leaves_to_approve}}
          <li class="list-group-item">
            <strong>{{user.full_name}}</strong>
            - {{format_date date_start}} to {{format_date date_end}}
            - {{leave_type.name}}
            <a href="/requests/" class="btn btn-sm btn-primary pull-right">Review</a>
          </li>
        {{/each}}
      </ul>
    </div>
  </div>
{{/if}}
```

### 5.4 Calendar View Updates

Add visual indicators:
- **Pending full approval**: Orange/amber color
- **Partially approved**: Yellow with indicator
- **Fully approved**: Green (current behavior)
- **Tooltip**: Show which approvals are pending

### 5.5 Standin Conflict Warnings

When creating leave request, check if standin is on leave:

```handlebars
{{!-- In leave request form after submission attempt --}}
{{#if standin_conflict_warning}}
  <div class="alert alert-warning">
    <i class="fa fa-exclamation-triangle"></i>
    <strong>Note:</strong> Your standin ({{standin_name}}) has approved leave
    during {{format_date conflict_start}} - {{format_date conflict_end}}.
    This may affect coverage during your absence.
  </div>
{{/if}}
```

---

## 6. Email Notification Changes

### 6.1 New Email Templates

Create new email templates in `views/email/`:

**`leave_request_with_standin_to_requestor.hbs`**:
```handlebars
<p>Hi {{requester.full_name}},</p>

<p>Your leave request has been submitted successfully.</p>

<p><strong>Leave Details:</strong></p>
<ul>
  <li>From: {{format_date leave.date_start}}</li>
  <li>To: {{format_date leave.date_end}}</li>
  <li>Type: {{leave.leave_type.name}}</li>
</ul>

<p><strong>Approval Required From:</strong></p>
<ul>
  <li>{{manager.full_name}} (Department Manager)</li>
  <li>{{standin.full_name}} (Your Standin)</li>
</ul>

<p>Both approvals are required before your leave can be confirmed.</p>
```

**`leave_request_to_standin.hbs`**:
```handlebars
<p>Hi {{standin.full_name}},</p>

<p>You are designated as the standin for {{requester.full_name}}, who has requested leave.</p>

<p><strong>Leave Details:</strong></p>
<ul>
  <li>From: {{format_date leave.date_start}}</li>
  <li>To: {{format_date leave.date_end}}</li>
  <li>Type: {{leave.leave_type.name}}</li>
  <li>Employee Comment: {{leave.employee_comment}}</li>
</ul>

{{#if standin_has_conflict}}
  <p><strong style="color: orange;">⚠️ Note:</strong> You have approved leave during part of this period.</p>
{{/if}}

<p>Please review and approve/reject this request:</p>
<p><a href="{{application_host}}/requests/">View Pending Approvals</a></p>

<p>Both you and the department manager must approve before the leave is confirmed.</p>
```

**`leave_request_partial_approval.hbs`**:
```handlebars
<p>Hi {{requester.full_name}},</p>

<p>Good news - your leave request has been partially approved!</p>

<p><strong>Approval Status:</strong></p>
<ul>
  {{#each approvals}}
    <li>
      {{approver.full_name}} ({{approverType}}) -
      <strong style="color: {{#if (eq status 'APPROVED')}}green{{else}}orange{{/if}}">
        {{status}}
      </strong>
    </li>
  {{/each}}
</ul>

<p>We're waiting for all required approvals before your leave can be fully confirmed.</p>
```

### 6.2 Email Sending Logic Updates

Update `lib/email.js`:

```javascript
function promise_leave_request_emails(args) {
  const leave = args.leave;
  const company = args.company;

  return Promise.all([
    leave.getUser({ include: [{ model: User, as: 'standin' }] }),
    leave.promise_approvals()
  ])
  .then(([employee, approvals]) => {
    const emailsToSend = [];

    // Find manager and standin approvals
    const managerApproval = approvals.find(a => a.approverType === 'MANAGER');
    const standinApproval = approvals.find(a => a.approverType === 'STANDIN');

    // Email to requester
    if (standinApproval) {
      // Multi-approval case
      emailsToSend.push(
        render_template('leave_request_with_standin_to_requestor', {
          requester: employee,
          leave: leave,
          manager: managerApproval.approver,
          standin: standinApproval.approver
        })
        .then(html => send_email({
          to: employee.email,
          subject: 'Leave request submitted (awaiting dual approval)',
          html: html
        }))
      );
    } else {
      // Single approval (existing flow)
      emailsToSend.push(/* existing single approval email */);
    }

    // Email to manager
    emailsToSend.push(
      send_email_to_approver(managerApproval.approver, leave, 'MANAGER')
    );

    // Email to standin (if exists)
    if (standinApproval) {
      // Check for standin conflicts
      return check_standin_conflicts(standinApproval.approver, leave)
        .then(hasConflict => {
          emailsToSend.push(
            render_template('leave_request_to_standin', {
              standin: standinApproval.approver,
              requester: employee,
              leave: leave,
              standin_has_conflict: hasConflict
            })
            .then(html => send_email({
              to: standinApproval.approver.email,
              subject: `Standin approval needed: ${employee.full_name()}'s leave request`,
              html: html
            }))
          );

          return Promise.all(emailsToSend);
        });
    }

    return Promise.all(emailsToSend);
  });
}

// Helper to check if standin has overlapping leave
function check_standin_conflicts(standin, leave) {
  return Leave.findAll({
    where: {
      userId: standin.id,
      status: 2, // APPROVED
      [Sequelize.Op.or]: [
        {
          date_start: {
            [Sequelize.Op.between]: [leave.date_start, leave.date_end]
          }
        },
        {
          date_end: {
            [Sequelize.Op.between]: [leave.date_start, leave.date_end]
          }
        }
      ]
    }
  })
  .then(conflicts => conflicts.length > 0);
}
```

---

## 7. Testing Considerations

### 7.1 Unit Tests

**Test file**: `t/unit/standin_approval.js`

```javascript
describe('Standin approval functionality', () => {

  it('User can have a standin assigned', async () => {
    // Create two users
    // Set user1.standinId = user2.id
    // Assert relationship works
  });

  it('User cannot be their own standin', async () => {
    // Try to set user.standinId = user.id
    // Expect validation error
  });

  it('Leave with standin creates two approval records', async () => {
    // Create user with standin
    // Create leave request
    // Assert two LeaveApprovals created (MANAGER + STANDIN)
  });

  it('Leave without standin creates one approval record', async () => {
    // Create user without standin
    // Create leave request
    // Assert one LeaveApproval created (MANAGER only)
  });

  it('Leave approved only after both approvals', async () => {
    // Create leave with standin
    // Manager approves
    // Assert leave still NEW
    // Standin approves
    // Assert leave now APPROVED
  });

  it('Any rejection rejects entire leave', async () => {
    // Create leave with standin
    // Manager approves
    // Standin rejects
    // Assert leave REJECTED
  });

  it('Approval order does not matter', async () => {
    // Test 1: Standin approves first, then manager
    // Test 2: Manager approves first, then standin
    // Both should result in approved leave
  });
});
```

### 7.2 Integration Tests

**Test file**: `t/integration/standin_workflow.js`

```javascript
describe('Standin approval workflow', () => {

  it('Admin can assign standin to user', async () => {
    // Login as admin
    // Navigate to user edit page
    // Select standin from dropdown
    // Save
    // Verify standin set in database
  });

  it('Department manager can assign standin to team member', async () => {
    // Login as dept manager
    // Edit team member
    // Set standin
    // Verify success
  });

  it('Regular user cannot assign standin', async () => {
    // Login as regular user
    // Try to edit another user
    // Verify permission denied
  });

  it('Employee sees standin requirements when creating leave', async () => {
    // Login as employee with standin
    // Create leave request
    // Verify UI shows both approvers needed
  });

  it('Standin sees leave requests in their queue', async () => {
    // Create leave request for user with standin
    // Login as standin
    // Navigate to /requests
    // Verify leave appears in list
  });

  it('Manager and standin can approve in parallel', async () => {
    // Create leave request
    // Login as manager, approve
    // Verify leave still pending
    // Login as standin, approve
    // Verify leave fully approved
  });

  it('Warning shown when standin has conflicting leave', async () => {
    // Create approved leave for standin
    // Login as employee
    // Try to request overlapping leave
    // Verify warning displayed
  });
});
```

### 7.3 Edge Cases to Test

1. **Circular Standins**: User A is standin for User B, User B is standin for User A
2. **Chain Reactions**: User A requests leave, User B is standin, User B also requests leave
3. **Standin Deletion**: What happens if standin user is deleted/deactivated?
4. **Department Changes**: User changes departments while leave is pending
5. **Auto-approval**: Does auto-approval bypass standin requirements?
6. **Revoke Scenarios**: How does revoke work with dual approvals?
7. **Bulk Operations**: Importing users with standins
8. **API Integration**: External API calls for leave requests

---

## 8. Migration Strategy & Backward Compatibility

### 8.1 Data Migration

**For Existing Leaves**:
- Leaves created before this feature will have no LeaveApproval records
- Add migration to backfill LeaveApprovals for historical data (optional)
- Or handle gracefully: `leave.promise_approvals()` returns empty array for old leaves

**Backfill Migration** (optional):
```javascript
module.exports = {
  up: async function (queryInterface, Sequelize) {
    // For all approved/rejected leaves, create single approval record
    const [leaves] = await queryInterface.sequelize.query(`
      SELECT id, approverId, status, decided_at
      FROM Leaves
      WHERE status IN (2, 3) AND approverId IS NOT NULL
    `);

    for (const leave of leaves) {
      await queryInterface.sequelize.query(`
        INSERT INTO LeaveApprovals
        (leaveId, approverId, approverType, status, decidedAt, createdAt, updatedAt)
        VALUES
        (?, ?, 'MANAGER', ?, ?, NOW(), NOW())
      `, {
        replacements: [
          leave.id,
          leave.approverId,
          leave.status === 2 ? 'APPROVED' : 'REJECTED',
          leave.decided_at
        ]
      });
    }
  },

  down: function (queryInterface, Sequelize) {
    // Clean up backfilled records
    return queryInterface.bulkDelete('LeaveApprovals', {
      createdAt: { [Sequelize.Op.eq]: Sequelize.col('updatedAt') }
    });
  }
};
```

### 8.2 Graceful Degradation

**Leave Model Compatibility Layer**:
```javascript
// In Leave model
Leave.prototype.promise_approvals = function() {
  return this.Model.sequelize.models.LeaveApproval.findAll({
    where: { leaveId: this.id },
    include: [{ model: this.Model.sequelize.models.User, as: 'approver' }]
  })
  .then(approvals => {
    // If no approvals exist (old leaves), return empty array
    // Calling code should handle gracefully
    return approvals;
  });
};

Leave.prototype.promise_check_all_approvals_complete = function() {
  return this.promise_approvals()
    .then(approvals => {
      if (approvals.length === 0) {
        // Old leave without approval records
        // Consider it "complete" based on leave status
        return this.status === 2; // APPROVED
      }

      // New dual-approval logic
      const anyRejected = approvals.some(a => a.is_rejected());
      if (anyRejected) return false;

      const allApproved = approvals.every(a => a.is_approved());
      return allApproved;
    });
};
```

### 8.3 Feature Flag (Optional)

Add feature flag to `config/app.json`:

```json
{
  "enable_standin_approvals": true
}
```

Wrap standin logic in feature checks:
```javascript
if (config.get('enable_standin_approvals') && employee.standinId) {
  // Create standin approval
}
```

This allows gradual rollout and easy rollback if issues arise.

---

## 9. Edge Cases & Validation

### 9.1 Validation Rules

| Scenario | Validation | Action |
|----------|------------|--------|
| User sets self as standin | `user.standinId !== user.id` | Block with error message |
| Standin is inactive/deleted | Check `standin.is_active()` | Warn admin, prevent save or auto-clear |
| Circular standin (A→B, B→A) | Check for cycles | Allow (not harmful, just unusual) |
| Standin has conflicting leave | Check overlapping approved leaves | Warn but allow |
| Standin changes mid-approval | Leave already created | Keep original standin for that leave |
| Department manager is also standin | Both roles on same leave | Create only one approval record (MANAGER role) to avoid duplicate |
| Auto-approval enabled | `user.auto_approve` or `leaveType.auto_approve` | Skip entire approval system (no LeaveApproval records created) |

### 9.2 Conflict Detection

**Standin Overlap Warning**:
```javascript
function check_standin_availability(standinId, dateStart, dateEnd) {
  return Leave.findAll({
    where: {
      userId: standinId,
      status: 2, // APPROVED
      [Op.or]: [
        {
          date_start: { [Op.between]: [dateStart, dateEnd] }
        },
        {
          date_end: { [Op.between]: [dateStart, dateEnd] }
        },
        {
          [Op.and]: [
            { date_start: { [Op.lte]: dateStart } },
            { date_end: { [Op.gte]: dateEnd } }
          ]
        }
      ]
    }
  })
  .then(conflicts => ({
    hasConflict: conflicts.length > 0,
    conflicts: conflicts
  }));
}
```

Display warning in:
- Leave request form (when creating)
- Email to standin
- Email to requester
- Approval interface

### 9.3 Auto-Approval Handling

**Critical Rule**: When auto-approval is enabled, **skip the entire approval system** including standin approval. No LeaveApproval records are created.

```javascript
// In createNewLeave
const leaveType = await leave.getLeaveType();
const skipApproval = models.Leave.does_skip_approval(employee, leaveType);

if (skipApproval) {
  // Auto-approve: skip entire approval system
  leave.status = 2; // APPROVED
  await leave.save();

  // Send auto-approval notification emails
  await email.promise_leave_request_emails({
    leave: leave,
    auto_approved: true
  });

  // Do NOT create any LeaveApproval records
  // Standin is bypassed entirely
  return leave;
}

// If not auto-approved, proceed with normal approval flow
// (create LeaveApproval records as shown in section 2.4)
```

**Rationale**:
- Auto-approve means the leave is trusted/pre-authorized, so no human approval is needed
- Creating "pre-approved" approval records adds unnecessary data complexity
- Checking for empty `approvals` array distinguishes auto-approved leaves (backward compatible)
- Standin requirement is for coverage confirmation; auto-approve bypasses this entirely

### 9.4 Revoke - Manager Only (Standin Not Involved)

**Critical Rule**: Revoke approval is **MANAGER-ONLY**. The standin is not involved in revoke decisions because the revoke is about departmental approval, not coverage.

When revoking a leave:
```javascript
Leave.prototype.promise_to_revoke = function() {
  if (this.does_skip_approval()) {
    // Auto-approved, revoke immediately without approval
    this.status = 3; // REJECTED
    return this.save();
  }

  // Set status to PENDED_REVOKE
  this.status = 4;

  // Only reset MANAGER approval to PENDING (standin approval is ignored for revokes)
  return this.promise_approvals()
    .then(approvals => {
      const managerApproval = approvals.find(a => a.approverType === 'MANAGER');

      if (managerApproval) {
        managerApproval.status = 'PENDING';
        managerApproval.decidedAt = null;
        return Promise.all([this.save(), managerApproval.save()]);
      }

      return this.save();
    });
};
```

Revoke handling in approval routes:
```javascript
// When approving a PENDED_REVOKE leave
if (leave.status === 4) { // PENDED_REVOKE
  // Only manager can approve/reject revokes
  const managerApproval = leave.approvals.find(a =>
    a.approverType === 'MANAGER' && a.approverId === req.user.id
  );

  if (!managerApproval) {
    throw new Error('Only department managers can approve revoke requests');
  }

  // Approve revoke = grant the revoke = reject the leave
  leave.status = 3; // REJECTED
  managerApproval.status = 'APPROVED';

  // Standin approval status is irrelevant for revokes
}

// Reject revoke = deny the revoke = leave remains approved
if (action === 'reject_revoke' && leave.status === 4) {
  leave.status = 2; // APPROVED (back to approved)
  managerApproval.status = 'REJECTED';
}
```

**Why manager-only?**
- Revoke is about canceling an approved absence, which is a departmental/scheduling decision
- Standin has already confirmed they can cover; revoking doesn't require re-checking coverage
- Simplifies the revoke workflow and avoids coordination overhead
- Manager has final authority over team scheduling

---

## 10. Implementation Phases

### Phase 1: Database & Core Models (Days 1-2)
- [ ] Create migration for `standinId` on User table
- [ ] Create migration for `LeaveApproval` table
- [ ] Update User model with standin associations
- [ ] Create LeaveApproval model
- [ ] Add validation for standin (cannot be self)
- [ ] Update Leave model associations
- [ ] Write unit tests for models

### Phase 2: Leave Creation & Approval Logic (Days 3-4)
- [ ] Update `createNewLeave` to create LeaveApproval records
- [ ] Modify `Leave.promise_to_approve` for multi-approval
- [ ] Modify `Leave.promise_to_reject` for multi-approval
- [ ] Add helper methods: `promise_approvals`, `promise_check_all_approvals_complete`
- [ ] Update User methods: `promise_leaves_to_be_processed`, `promise_leaves_to_approve_as_standin`
- [ ] Handle auto-approval scenarios
- [ ] Write unit tests for approval logic

### Phase 3: UI & Routes (Days 5-6)
- [ ] Add standin dropdown to user edit form
- [ ] Update user edit route (GET/POST) for standin configuration
- [ ] Add permission middleware for standin configuration
- [ ] Update `/requests/` route to show approval summary
- [ ] Update approval/rejection POST routes
- [ ] Update requests.hbs template with approval status display
- [ ] Update user_edit.hbs template with standin field
- [ ] Add CSS styling for approval status badges

### Phase 4: Email Notifications (Day 7)
- [ ] Create new email templates:
  - `leave_request_with_standin_to_requestor.hbs`
  - `leave_request_to_standin.hbs`
  - `leave_request_partial_approval.hbs`
- [ ] Update `promise_leave_request_emails` function
- [ ] Add conflict detection for standin availability
- [ ] Update decision emails to include approval summary
- [ ] Test email delivery in development mode

### Phase 5: Dashboard & Calendar Updates (Day 8)
- [ ] Add "Standin approvals needed" section to dashboard
- [ ] Update calendar view to show partial approval status
- [ ] Add tooltips showing pending approvals
- [ ] Update team view to indicate multi-approval leaves

### Phase 6: Edge Cases & Validation (Day 9)
- [ ] Add conflict warning when standin has overlapping leave
- [ ] Handle revoke scenarios with dual approvals
- [ ] Ensure backward compatibility with old leaves
- [ ] Test circular standin scenarios
- [ ] Test department manager who is also standin
- [ ] Add data migration for historical leaves (optional)

### Phase 7: Testing & QA (Day 10-11)
- [ ] Write integration tests for standin workflow
- [ ] Test all user permission scenarios
- [ ] Test parallel approval flows
- [ ] Test email notifications
- [ ] Test UI across different browsers
- [ ] Load testing with multiple concurrent approvals
- [ ] Security review (SQL injection, XSS, CSRF)

### Phase 8: Documentation & Deployment (Day 12)
- [ ] Update user documentation
- [ ] Update admin guide
- [ ] Create database backup before migration
- [ ] Run migrations on production
- [ ] Monitor logs for errors
- [ ] Communicate feature to users

---

## 11. Potential Future Enhancements

### 11.1 Multiple Standins
Allow users to have multiple standins (primary, secondary):
- Add `UserStandin` join table instead of `standinId` field
- Add priority/order to standins
- Require only one standin to approve (OR logic) or all (AND logic)

### 11.2 Temporary Standins
Allow users to set temporary standin overrides:
- Add date range fields to standin configuration
- "From date X to date Y, use standin Z instead of default"
- Useful for when regular standin is on vacation

### 11.3 Role-Based Standins
Standins based on leave type:
- Technical leave → technical colleague approves
- Personal leave → any colleague approves
- Add `standinId_by_leave_type` mapping

### 11.4 Standin Delegation
Standin can delegate to another user:
- "I can't cover, but User X can" button
- Reassigns standin approval to new person
- Notifies all parties

### 11.5 Analytics & Reports
- Report: "Users without standins configured"
- Report: "Standin approval bottlenecks" (who takes longest)
- Dashboard widget: "You are standin for X people"

### 11.6 Smart Standin Suggestions
Algorithm to suggest standins:
- Same department
- Similar skill set
- Available during the period
- Low current standin load

---

## 12. Security Considerations

### 12.1 Authorization Checks

**Critical Security Rules**:
1. Only admins and department managers can assign standins
2. Users cannot approve their own leave (even if they're somehow both standin and manager)
3. Approval actions must verify user has pending approval record
4. Cannot approve already-processed approvals (prevent replay attacks)
5. Leave revoke requires proper ownership verification

### 12.2 SQL Injection Prevention

Use Sequelize parameterized queries throughout:
```javascript
// GOOD
Leave.findAll({ where: { userId: req.params.id } })

// BAD (don't do this)
sequelize.query(`SELECT * FROM Leaves WHERE userId = ${req.params.id}`)
```

### 12.3 CSRF Protection

All POST routes must include CSRF tokens (already handled by Express middleware).

### 12.4 Input Validation

Validate all user inputs:
```javascript
function validate_standin_id(standinId, currentUserId) {
  if (!standinId) return true; // Optional standin

  const id = parseInt(standinId);
  if (isNaN(id)) {
    throw new Error('Invalid standin ID');
  }

  if (id === currentUserId) {
    throw new Error('User cannot be their own standin');
  }

  return true;
}
```

### 12.5 Data Exposure

Ensure users can only see:
- Their own leave requests and approvals
- Leave requests from users they supervise
- Leave requests where they are the standin

Never expose:
- Leave requests from unrelated departments
- Approval records for other approvers
- Standin relationships they're not involved in

---

## 13. Rollback Plan

If critical issues arise post-deployment:

### Option 1: Feature Flag Disable
1. Set `enable_standin_approvals: false` in config
2. Restart application
3. All new leaves use single-approval flow
4. Existing pending approvals remain in database

### Option 2: Code Rollback
1. Revert to previous git commit
2. Redeploy application
3. Do NOT rollback migrations (keep new tables)
4. Existing data remains intact

### Option 3: Manual Cleanup
If data corruption occurs:
```sql
-- Remove all pending standin approvals
DELETE FROM LeaveApprovals
WHERE approverType = 'STANDIN' AND status = 'PENDING';

-- Reset leaves to approved if manager approved
UPDATE Leaves l
SET status = 2
WHERE EXISTS (
  SELECT 1 FROM LeaveApprovals la
  WHERE la.leaveId = l.id
  AND la.approverType = 'MANAGER'
  AND la.status = 'APPROVED'
);
```

---

## 14. Success Metrics

Track these metrics to measure feature success:

1. **Adoption Rate**: % of users with standin configured (target: 60% after 3 months)
2. **Approval Speed**: Average time to full approval (should not increase significantly)
3. **Rejection Rate**: Does dual approval increase rejections? (monitor)
4. **User Satisfaction**: Survey users on new approval process
5. **Error Rate**: Monitor application errors related to approvals (target: < 0.1%)
6. **Coverage Conflicts**: How often do standins have conflicting leave? (track for insights)

---

## 15. Implementation Decisions (Resolved)

These questions have been resolved based on requirements and codex feedback:

1. **Auto-approval behavior** ✅
   - **Decision**: Auto-approve bypasses entire approval system, including standin
   - No LeaveApproval records created for auto-approved leaves
   - Standin is not involved when auto-approve is enabled

2. **Revoke approval** ✅
   - **Decision**: Manager-only (standin not involved in revokes)
   - Only MANAGER approval is reset to PENDING for PENDED_REVOKE
   - Rationale: Revoke is a scheduling decision, not a coverage decision

3. **Manager == Standin case** ✅
   - **Decision**: Create only one approval record (MANAGER role)
   - Deduplication logic in createNewLeave prevents duplicate approvals
   - User doesn't need to approve their own request twice

4. **Standin configuration permissions** ✅
   - **Decision**: Administrators and department managers can assign standins
   - Regular employees cannot set their own standin (prevents gaming the system)

5. **Conflict handling when standin is on leave** ✅
   - **Decision**: Allow but warn
   - Display warnings in UI, emails, and approval interface
   - Don't block the request (business continuity)

## 16. Remaining Open Questions

1. **Should we show standin relationship on user profile?**
   - Could add "Standin for: [list of people]" on user profile page
   - Adds visibility but increases UI complexity
   - **Recommendation**: Add in Phase 8 if users request it

2. **What happens if standin changes after leave is submitted?**
   - **Current plan**: Keep original standin for that pending leave
   - **Alternative**: Update pending approvals to new standin dynamically
   - **Recommendation**: Keep original (simpler, more predictable)

3. **Notification preferences for standins?**
   - Some users may want to opt out of standin notifications
   - Would require `notification_preferences` field on User model
   - **Recommendation**: Defer to future enhancement if users complain

4. **Should we add reminder emails for pending approvals?**
   - Codex plan mentions reminders should go to pending approvers
   - Currently no automated reminder system exists
   - **Recommendation**: Defer to Phase 11.5 (future enhancement)

---

## Conclusion

This implementation plan provides a comprehensive dual-approval system with standin/substitute functionality. The design prioritizes:
- **Backward Compatibility**: Existing leaves and users without standins work unchanged
- **Flexibility**: Standins are optional, configured by admins/managers
- **Parallel Workflow**: Both approvers receive notifications simultaneously
- **User Experience**: Clear UI indicators, helpful warnings, detailed email notifications
- **Extensibility**: Foundation for future enhancements (multiple standins, temporary standins)

The phased implementation approach allows for incremental development and testing, with clear rollback options if issues arise.

**Estimated Implementation Time**: 10-12 days (1 developer)
**Database Impact**: 2 new migrations, backward compatible
**UI Impact**: Moderate (several views updated)
**Testing Requirement**: High (complex approval logic requires thorough testing)
**Risk Level**: Medium (changes core approval workflow, needs careful testing)

---

## Next Steps

1. Review this plan with stakeholders
2. Clarify open questions (Section 15)
3. Set up development environment
4. Begin Phase 1 implementation
5. Regular check-ins after each phase completion
