const ROLES = Object.freeze({
  OWNER: 'owner',
  CASHIER: 'cashier',
  VIEWER: 'viewer',
});

class AuthorizationError extends Error {
  constructor(message = 'You do not have permission to do that.') {
    super(message);
    this.name = 'AuthorizationError';
    this.code = 'FORBIDDEN';
  }
}

function requireRole(session, allowedRoles) {
  if (!session || !session.active) throw new AuthorizationError('Please log in first.');
  if (!allowedRoles.includes(session.user.role)) throw new AuthorizationError();
  return session.user;
}

module.exports = { ROLES, AuthorizationError, requireRole };