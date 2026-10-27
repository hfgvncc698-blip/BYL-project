function canUseAdvancedCalendar(user) {
  if (user?.role === "admin") return true;
  const access = user?.proAccess || user;
  const tier = access?.packageTier || user?.packageTier;
  return String(tier || "").toLowerCase() !== "solo";
}
module.exports = { canUseAdvancedCalendar };
