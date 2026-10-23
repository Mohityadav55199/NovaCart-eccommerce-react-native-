// builds the value for RoleContext from the account the API returned
export function buildRoleValue(me, setMode) {
  const permissions = me.permissions || [];
  const scopeOf = (permission) =>
    permissions.includes(permission) ? "all" : permissions.includes(`${permission}:own`) ? "own" : null;

  return {
    role: me.role,
    name: me.name,
    permissions,
    paused: !!me.paused,
    can: (permission) => scopeOf(permission) !== null,
    scopeOf,
    setMode,
  };
}

// anyone with a dashboard permission (admin, support, vendor) may use the admin site
export const hasDashboard = (me) => (me.permissions || []).some((p) => p === "dashboard:view" || p === "dashboard:view:own");
