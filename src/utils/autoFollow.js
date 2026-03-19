// src/utils/autoFollow.js
export const readAutoFollowFlag = (prog) => {
  const cands = [
    prog?.auto_suivi,
    prog?.autoSuivi,
    prog?.suivi_auto,
    prog?.suiviAuto,
    prog?.progression_auto,
    prog?.progressionAuto,
    prog?.options?.auto_suivi,
    prog?.options?.autoSuivi,
    prog?.options?.suivi_auto,
    prog?.options?.suiviAuto,
    prog?.questionnaire?.auto_suivi,
    prog?.meta?.auto_suivi,
  ];
  const v = cands.find((x) => x === true || x === false);
  return v === true;
};

export const buildAutoFollowUpdate = (nextVal, existingOptions = {}) => {
  const v = !!nextVal;
  return {
    auto_suivi: v,
    options: { ...(existingOptions || {}), auto_suivi: v },
  };
};
