import { canUseCustomBranding } from "./proPlanAccess.js";
import { settleWithTimeout } from "./asyncTimeout.js";

export async function loadProgramPdfLogos({ user, convertImage }) {
  const allowed = canUseCustomBranding(user?.proAccess || {
    packageKey: user?.packageKey,
    packageTier: user?.packageTier,
    branding: user?.branding,
  });
  const customSource = allowed ? user?.logoUrl || user?.photoURL || "" : "";
  const [footerLogo, customLogo] = await Promise.all([
    settleWithTimeout(convertImage("/logo-byl.png?v=palm-20261027"), 10000, null),
    customSource ? settleWithTimeout(convertImage(customSource), 10000, null) : null,
  ]);
  if (!footerLogo || (customSource && !customLogo)) {
    throw new Error("Impossible de charger les logos du PDF. Vérifiez votre connexion puis réessayez.");
  }
  return { headerLogo: customLogo || footerLogo, footerLogo };
}
