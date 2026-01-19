import db from '../db/index.js';

export function isGroupMember(groupId, userId) {
  return !!db.prepare(
    'SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?'
  ).get(groupId, userId);
}

export function isGroupAdmin(groupId, userId) {
  return !!db.prepare(
    "SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ? AND role = 'admin'"
  ).get(groupId, userId);
}
