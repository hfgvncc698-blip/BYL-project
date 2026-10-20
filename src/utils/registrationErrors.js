// Only expose known, actionable messages; Firebase's raw messages are technical.
export function getRegistrationErrorMessage(error, t) {
  const code = error?.code || error?.message;
  const keys = {
    "auth/email-already-in-use": "emailInUse",
    "auth/account-exists-with-different-credential": "emailInUse",
    "auth/invalid-email": "invalidEmail",
    "auth/weak-password": "weakPassword",
    "auth/password-does-not-meet-requirements": "weakPassword",
    "auth/network-request-failed": "network",
    "unavailable": "network",
    "deadline-exceeded": "network",
    "auth/too-many-requests": "tooMany",
    "auth/quota-exceeded": "tooMany",
    "permission-denied": "profileDenied",
    "auth/operation-not-allowed": "serviceUnavailable",
    "auth/internal-error": "serviceUnavailable",
    "auth/popup-blocked": "popupBlocked",
    "auth/popup-closed-by-user": "popupClosed",
    "auth/cancelled-popup-request": "popupClosed",
    "registration-in-progress": "inProgress",
    "registration-details-required": "missingFields",
    "registration-invalid-birth-date": "invalidBirthDate",
    "registration-underage": "mustBeAdult",
    "registration-consent-required": "mustConfirmAndAccept",
    "registration-club-name-required": "clubNameRequired",
  };
  return t(`auth.register.errors.${keys[code] || "failed"}`);
}
