function canUseIntegratedMessaging(user) {
  if (user?.role === "admin") return true;
  const access = user?.proAccess || user;
  return String(access?.packageTier || user?.packageTier || "").toLowerCase() !== "solo";
}
module.exports = { canUseIntegratedMessaging };
