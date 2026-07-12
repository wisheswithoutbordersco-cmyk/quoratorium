export { ONE_YEAR_MS } from "@shared/const";

// Clerk handles all auth flows — no manual login URL needed
// This function is kept for backward compatibility but returns empty string
export const getLoginUrl = () => {
  return "/sign-in";
};
