import {doc} from 'firebase/firestore';
import {applySportProgressionToSession} from './trainingEngine.js';

export async function applyDashboardAdjustment(item,{clients,toast,t,source,db,setClients,dismissRadarItem,recordCopilotEvent,getProgrammeSessionTitle,RADAR_SESSION_ADJUSTMENT_DECISION}) {
      if (!item?.clientId || !item?.programId) {
        toast({
          status: "warning",
          title: t("dashboard.radar.toasts.action_unavailable_title", "Action impossible"),
          description: t("dashboard.radar.toasts.program_missing_description", "Le programme lié à cette alerte est introuvable."),
          duration: 4200,
          isClosable: true,
        });
        return false;
      }

      const client = clients.find((entry) => entry.id === item.clientId);
      const programme = (client?.programmesAssignes || []).find((entry) => entry.id === item.programId);
      const sessionKey = Array.isArray(programme?.sessions) ? "sessions" : Array.isArray(programme?.seances) ? "seances" : "";
      const sessionIndex = Number(item.sessionIndex);
      const sessionsList = sessionKey ? programme?.[sessionKey] || [] : [];
      const session = Number.isFinite(sessionIndex) ? sessionsList[sessionIndex] : null;

      if (!client || !programme || !sessionKey || !session) {
        toast({
          status: "warning",
          title: t("dashboard.radar.toasts.session_missing_title", "Séance non trouvée"),
          description: t("dashboard.radar.toasts.session_missing_description", "Ouvre le programme pour l'ajuster manuellement."),
          duration: 4200,
          isClosable: true,
        });
        return;
      }

      const targetExerciseIndexes = Array.isArray(item.adjustmentPlan?.targetExerciseIndexes)
        ? item.adjustmentPlan.targetExerciseIndexes
        : [];
      const decision = targetExerciseIndexes.length
        ? { ...RADAR_SESSION_ADJUSTMENT_DECISION, targetExerciseIndexes }
        : { ...RADAR_SESSION_ADJUSTMENT_DECISION };
      if (Array.isArray(item.adjustmentPlan?.fieldPriority) && item.adjustmentPlan.fieldPriority.length) {
        decision.fieldPriority = item.adjustmentPlan.fieldPriority;
        decision.strictFieldPriority = item.adjustmentPlan.strictFieldPriority === true;
      }
      const { changedCount, changedFields, changedDetails } = applySportProgressionToSession(
        session,
        decision
      );
      if (!changedCount) {
        toast({
          status: "info",
          title: t("dashboard.radar.toasts.no_adjustable_title", "Aucun paramètre ajustable"),
          description: t("dashboard.radar.toasts.no_adjustable_description", "Cette séance ne contient pas de charge, répétition, durée, distance ou repos modifiable automatiquement."),
          duration: 5200,
          isClosable: true,
        });
        return;
      }

      let nextSessions;
      const adjustmentAudit = {
        alertId: item.id,
        sessionIndex,
        sessionTitle: item.sessionTitle || getProgrammeSessionTitle(programme, sessionIndex, t),
        changedCount,
        changedFields: Array.from(new Set(changedFields)).filter(Boolean),
        changedDetails: changedDetails || [],
        targetExerciseIndexes,
        createdAt: new Date().toISOString(),
      };
      const {writeDashboardAdjustment}=await import('./dashboardPrescriptionWrite');
      try {
        nextSessions=await writeDashboardAdjustment(db,doc(db,"clients",item.clientId,"programmes",item.programId),{
          sessionKey,index:sessionIndex,expected:session,decision,audit:adjustmentAudit,
        },()=>!source.signal.aborted);
      }catch(error){
        if(error.code!=='dashboard-program-changed')throw error;
        toast({status:"warning",title:error.message});return false;
      }
      if(source.signal.aborted)return false;
      source.purge(item.clientId);

      setClients((prev) =>
        prev.map((entry) => {
          if (entry.id !== item.clientId) return entry;
          return {
            ...entry,
            programmesAssignes: (entry.programmesAssignes || []).map((program) =>
              program.id === item.programId
                ? {
                    ...program,
                    [sessionKey]: nextSessions,
                    lastRadarAdjustment: adjustmentAudit,
                    lastCopilotAdjustment: adjustmentAudit,
                  }
                : program
            ),
          };
        })
      );

      dismissRadarItem(item, {
        title: t("dashboard.radar.toasts.adjusted_title", "Séance ajustée"),
        description: t("dashboard.radar.toasts.adjusted_description", "{{count}} paramètre(s) modifié(s). L'alerte est retirée du radar.", { count: changedCount }),
      });
      recordCopilotEvent({
        type: "adjustment_applied",
        title: item.title || t("dashboard.copilot.history.adjustment_title", "Ajustement appliqué"),
        detail: item.adjustmentPlan?.summary || t("dashboard.copilot.history.adjustment_detail", "{{count}} paramètre(s) modifié(s).", { count: changedCount }),
        clientId: item.clientId,
      });
      return true;
}
