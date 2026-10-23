// "HTTP 403: Forbidden - admin access only" / "Network Error" etc, for error banners
export const describeError = (error) => {
  if (!error) return "";
  const status = error.response?.status;
  const detail = error.response?.data?.message || error.response?.data?.error || error.message;
  return `${status ? `HTTP ${status}: ` : ""}${detail}`;
};

export const ERROR_HINT =
  "401 = not signed in, 403 = this email is not the admin, network error = the API is asleep or unreachable.";
