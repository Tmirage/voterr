import db from '../db/index.js';
import type { SessionData } from 'express-session';

const UserRole = {
  GUEST: 'guest',
  MEMBER: 'member',
  ADMIN: 'admin',
  APP_ADMIN: 'app_admin',
} as const;

type UserRoleType = (typeof UserRole)[keyof typeof UserRole];

interface MembershipRow {
  role: string;
}

interface MovieNight {
  host_id?: number | null;
}

function getUserRole(
  session: SessionData | null | undefined,
  groupId: number | null = null,
  movieNight: MovieNight | null = null
): UserRoleType {
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
    const membership = db
      .prepare('SELECT role FROM group_members WHERE group_id = ? AND user_id = ?')
      .get(groupId, session.userId) as MembershipRow | undefined;

    if (membership?.role === 'admin') {
      return UserRole.ADMIN;
    }
  }

  if (movieNight && movieNight.host_id === session.userId) {
    return UserRole.ADMIN;
  }

  return UserRole.MEMBER;
}

export function isAppAdmin(session: SessionData | null | undefined): boolean {
  return session?.isAppAdmin === true;
}

type GroupIdParam = string | string[] | number | undefined;

function parseGroupId(groupId: GroupIdParam): number | null {
  if (groupId === undefined || groupId === null) return null;
  if (Array.isArray(groupId)) return groupId[0] ? parseInt(groupId[0], 10) : null;
  if (typeof groupId === 'string') return parseInt(groupId, 10);
  return groupId;
}

export function isGroupMember(
  session: SessionData | null | undefined,
  groupId: GroupIdParam
): boolean {
  if (!session?.userId) return false;
  const gid = parseGroupId(groupId);
  if (gid === null) return false;
  return !!db
    .prepare('SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?')
    .get(gid, session.userId);
}

export function isGroupAdmin(
  session: SessionData | null | undefined,
  groupId: GroupIdParam
): boolean {
  if (!session?.userId) return false;
  if (session.isLocal || session.isLocalInvite) return false;
  if (session.isAdmin) return true;

  const gid = parseGroupId(groupId);
  if (gid === null) return false;
  const membership = db
    .prepare('SELECT role FROM group_members WHERE group_id = ? AND user_id = ?')
    .get(gid, session.userId) as MembershipRow | undefined;

  return membership?.role === 'admin';
}

const Permissions = {
  canVote: (role: UserRoleType | null): boolean => role !== null,
  canNominate: (role: UserRoleType | null): boolean => role !== null,

  canChangeHost: (role: UserRoleType): boolean =>
    role === UserRole.MEMBER || role === UserRole.ADMIN || role === UserRole.APP_ADMIN,
  canDecideWinner: (role: UserRoleType): boolean =>
    role === UserRole.MEMBER || role === UserRole.ADMIN || role === UserRole.APP_ADMIN,
  canCancelMovieNight: (role: UserRoleType): boolean =>
    role === UserRole.MEMBER || role === UserRole.ADMIN || role === UserRole.APP_ADMIN,

  canManageGroup: (role: UserRoleType): boolean =>
    role === UserRole.ADMIN || role === UserRole.APP_ADMIN,
  canAddGroupMembers: (role: UserRoleType): boolean =>
    role === UserRole.ADMIN || role === UserRole.APP_ADMIN,
  canRemoveGroupMembers: (role: UserRoleType): boolean =>
    role === UserRole.ADMIN || role === UserRole.APP_ADMIN,
  canDeleteGroup: (role: UserRoleType): boolean =>
    role === UserRole.ADMIN || role === UserRole.APP_ADMIN,
  canViewInvites: (role: UserRoleType): boolean =>
    role === UserRole.ADMIN || role === UserRole.APP_ADMIN,
  canDeleteInvite: (role: UserRoleType): boolean =>
    role === UserRole.ADMIN || role === UserRole.APP_ADMIN,

  canAccessSettings: (role: UserRoleType): boolean => role === UserRole.APP_ADMIN,
  canManageUsers: (role: UserRoleType): boolean => role === UserRole.APP_ADMIN,
  canToggleAdmin: (role: UserRoleType): boolean => role === UserRole.APP_ADMIN,
  canDeleteUser: (role: UserRoleType): boolean => role === UserRole.APP_ADMIN,
  canManageCache: (role: UserRoleType): boolean => role === UserRole.APP_ADMIN,
};

export interface PermissionsResult {
  role: UserRoleType;
  isGuest: boolean;
  isMember: boolean;
  isAdmin: boolean;
  isAppAdmin: boolean;
  canVote: boolean;
  canNominate: boolean;
  canChangeHost: boolean;
  canDecideWinner: boolean;
  canCancel: boolean;
  canManage: boolean;
  canManageGroup: boolean;
  canAddGroupMembers: boolean;
  canRemoveGroupMembers: boolean;
  canDeleteGroup: boolean;
  canViewInvites: boolean;
  canDeleteInvite: boolean;
  canAccessSettings: boolean;
  canManageUsers: boolean;
  canToggleAdmin: boolean;
  canDeleteUser: boolean;
  canManageCache: boolean;
}

export function getPermissions(
  session: SessionData | null | undefined,
  groupId: number | null = null,
  movieNight: MovieNight | null = null
): PermissionsResult {
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
    canManageCache: Permissions.canManageCache(role),
  };
}
