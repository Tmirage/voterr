import db from '../db/index.js';

const UserRole = {
  GUEST: 'guest',
  MEMBER: 'member',
  ADMIN: 'admin',
  APP_ADMIN: 'app_admin'
};

function getUserRole(session, groupId = null, movieNight = null) {
  if (!session?.userId) return UserRole.GUEST;
  
  if (session.isLocal || session.isLocalInvite) {
    return UserRole.GUEST;
  }
  
  if (session.isAppAdmin) {
    return UserRole.APP_ADMIN;
  }
  
  if (session.isAdmin) {
    return UserRole.ADMIN;
  }
  
  if (groupId) {
    const membership = db.prepare(
      'SELECT role FROM group_members WHERE group_id = ? AND user_id = ?'
    ).get(groupId, session.userId);
    
    if (membership?.role === 'admin') {
      return UserRole.ADMIN;
    }
  }
  
  if (movieNight && movieNight.host_id === session.userId) {
    return UserRole.ADMIN;
  }
  
  return UserRole.MEMBER;
}

export function isAppAdmin(session) {
  return session?.isAppAdmin === true;
}

export function isGroupMember(session, groupId) {
  if (!session?.userId) return false;
  return !!db.prepare(
    'SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?'
  ).get(groupId, session.userId);
}

export function isGroupAdmin(session, groupId) {
  if (!session?.userId) return false;
  if (session.isLocal || session.isLocalInvite) return false;
  if (session.isAdmin) return true;
  
  const membership = db.prepare(
    'SELECT role FROM group_members WHERE group_id = ? AND user_id = ?'
  ).get(groupId, session.userId);
  
  return membership?.role === 'admin';
}

const Permissions = {
  canVote: (role) => role !== null,
  canNominate: (role) => role !== null,
  
  canChangeHost: (role) => role === UserRole.MEMBER || role === UserRole.ADMIN || role === UserRole.APP_ADMIN,
  canDecideWinner: (role) => role === UserRole.MEMBER || role === UserRole.ADMIN || role === UserRole.APP_ADMIN,
  canCancelMovieNight: (role) => role === UserRole.MEMBER || role === UserRole.ADMIN || role === UserRole.APP_ADMIN,
  
  canManageGroup: (role) => role === UserRole.ADMIN || role === UserRole.APP_ADMIN,
  canAddGroupMembers: (role) => role === UserRole.ADMIN || role === UserRole.APP_ADMIN,
  canRemoveGroupMembers: (role) => role === UserRole.ADMIN || role === UserRole.APP_ADMIN,
  canDeleteGroup: (role) => role === UserRole.ADMIN || role === UserRole.APP_ADMIN,
  canViewInvites: (role) => role === UserRole.ADMIN || role === UserRole.APP_ADMIN,
  canDeleteInvite: (role) => role === UserRole.ADMIN || role === UserRole.APP_ADMIN,
  
  canAccessSettings: (role) => role === UserRole.APP_ADMIN,
  canManageUsers: (role) => role === UserRole.APP_ADMIN,
  canToggleAdmin: (role) => role === UserRole.APP_ADMIN,
  canDeleteUser: (role) => role === UserRole.APP_ADMIN,
  canManageCache: (role) => role === UserRole.APP_ADMIN
};

export function getPermissions(session, groupId = null, movieNight = null) {
  const role = getUserRole(session, groupId, movieNight);
  
  return {
    role,
    isGuest: role === UserRole.GUEST,
    isMember: role === UserRole.MEMBER || role === UserRole.ADMIN || role === UserRole.APP_ADMIN,
    isAdmin: role === UserRole.ADMIN || role === UserRole.APP_ADMIN,
    isAppAdmin: role === UserRole.APP_ADMIN,
    
    canVote: Permissions.canVote(role),
    canNominate: Permissions.canNominate(role),
    canChangeHost: Permissions.canChangeHost(role),
    canDecideWinner: Permissions.canDecideWinner(role),
    canCancel: Permissions.canCancelMovieNight(role),
    canManage: Permissions.canChangeHost(role),
    
    canManageGroup: Permissions.canManageGroup(role),
    canAddGroupMembers: Permissions.canAddGroupMembers(role),
    canRemoveGroupMembers: Permissions.canRemoveGroupMembers(role),
    canDeleteGroup: Permissions.canDeleteGroup(role),
    canViewInvites: Permissions.canViewInvites(role),
    canDeleteInvite: Permissions.canDeleteInvite(role),
    
    canAccessSettings: Permissions.canAccessSettings(role),
    canManageUsers: Permissions.canManageUsers(role),
    canToggleAdmin: Permissions.canToggleAdmin(role),
    canDeleteUser: Permissions.canDeleteUser(role),
    canManageCache: Permissions.canManageCache(role)
  };
}
