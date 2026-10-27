import { useEffect, useState } from "react";
import { useAuth } from "../../AuthContext";
import { canUseIntegratedMessaging } from "../../utils/proPlanAccess";
import { apiFetch } from "../../utils/api";

export default function useMessagingPlanAccess(contact) {
  const { user } = useAuth();
  const ownConversation = user?.uid === contact?.coachUid;
  const key = `${contact?.clientId || ""}:${contact?.coachUid || ""}`;
  const [access, setAccess] = useState(null);
  useEffect(() => {
    if (ownConversation || !contact?.clientId || !contact?.coachUid) return;
    let alive = true;
    const refresh = () => apiFetch(`/messaging/access?clientId=${encodeURIComponent(contact.clientId)}&professionalUid=${encodeURIComponent(contact.coachUid)}`)
      .then((result) => { if (alive) setAccess({ key, included: result.included === true }); })
      .catch(() => { if (alive) setAccess({ key, error: true, included: false }); });
    refresh();
    const interval = window.setInterval(refresh, 60000);
    return () => { alive = false; window.clearInterval(interval); };
  }, [ownConversation, contact?.clientId, contact?.coachUid, key]);
  if (ownConversation) return { included: canUseIntegratedMessaging(user), checking: false };
  return access?.key === key ? access : { included: false, checking: true };
}
