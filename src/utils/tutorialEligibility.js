// Fixed rollout boundary: existing accounts must never become newcomers on
// reload, another device, or when a new tutorial version is released.
export const TUTORIAL_NEW_ACCOUNT_SINCE = "2026-10-13T12:49:26Z";

export function canAutoStartTutorial(user, loading = false) {
  if (loading || !user?.uid) return false;
  const createdAt = Date.parse(user.authCreatedAt || "");
  return Number.isFinite(createdAt) && createdAt >= Date.parse(TUTORIAL_NEW_ACCOUNT_SINCE);
}
