import { createContext, useContext } from "react";

// role: "admin" | "vendor" (highest role of the signed-in person), name, and setMode to switch views
export const RoleContext = createContext({ role: null, name: "", setMode: () => {} });

export const useRole = () => useContext(RoleContext);
