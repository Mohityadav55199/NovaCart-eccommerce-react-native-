import { createContext, useContext } from "react";

const none = () => false;

// What the signed-in person may do. `permissions` come from the API (see backend/src/config/permissions.js);
// "x:own" means only their own data. The server checks everything again: this only decides what to show.
export const RoleContext = createContext({
  role: null,
  name: "",
  permissions: [],
  paused: false,
  can: none,
  scopeOf: () => null,
  setMode: () => {},
});

export const useRole = () => useContext(RoleContext);
