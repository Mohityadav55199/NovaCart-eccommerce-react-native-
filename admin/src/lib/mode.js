// which workspace the person is using on this browser: "vendor" (seller dashboard) or "customer"
// (customer home). It is only a view choice: what a person may actually do is decided by the API.
const KEY = "novacart:mode";

export const readMode = () => {
  try {
    const value = localStorage.getItem(KEY);
    return value === "customer" || value === "vendor" ? value : null;
  } catch {
    return null;
  }
};

export const writeMode = (mode) => {
  try {
    localStorage.setItem(KEY, mode);
  } catch {
    /* private mode: the choice just isn't remembered */
  }
};
