export function canSpeculativelyPreload(connection, visibilityState = "visible") {
  return visibilityState !== "hidden" && !connection?.saveData &&
    !["slow-2g", "2g", "3g"].includes(connection?.effectiveType);
}
