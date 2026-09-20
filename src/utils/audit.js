const { run, uuid } = require('../db');

function logAdminAction(adminId, action, targetType, targetId, notes) {
  run(
    'INSERT INTO admin_actions (id, admin_id, action, target_type, target_id, notes) VALUES (?,?,?,?,?,?)',
    [uuid(), adminId, action, targetType || null, targetId || null, notes || null]
  );
}

function notify(userId, type, title, body, data) {
  run(
    'INSERT INTO notifications (id, user_id, type, title, body, data) VALUES (?,?,?,?,?,?)',
    [uuid(), userId, type, title, body || null, data ? JSON.stringify(data) : null]
  );
}

module.exports = { logAdminAction, notify };
