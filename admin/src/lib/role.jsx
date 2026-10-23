import { createContext, useContext } from "react";

// "admin" or "vendor" (set by AdminGate after the API confirms it), plus the person's display name
export const RoleContext = createContext({ role: null, name: "" });

export const useRole = () => useContext(RoleContext);
