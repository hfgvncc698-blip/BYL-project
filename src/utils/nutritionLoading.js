// A timeout releases the UI, but does not cancel a Firestore write. Callers
// must retain and recheck that same operation rather than start another write.
export async function waitForNutritionOperation(operation, timeoutMs = 12000) {
  let timer;
  try {
    return await Promise.race([
      operation,
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          const error = new Error(
            "La confirmation prend plus de temps que prévu. Cliquez sur « Vérifier la création » pour reprendre la même demande sans créer de doublon."
          );
          error.code = "nutrition-confirmation-timeout";
          reject(error);
        }, timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export function nutritionIdentityError(lookup) {
  if (lookup?.exists && ["coach", "admin", "club"].includes(lookup.role)) {
    return new Error(
      "Cette adresse e-mail appartient à un compte professionnel. Saisissez l’adresse du client. Pour créer votre propre fiche de test, laissez l’e-mail vide ou utilisez une autre adresse."
    );
  }
  if (lookup?.exists && lookup?.canLink === false) {
    return new Error(
      "Ce compte appartient déjà à un autre espace. Un administrateur doit valider son transfert."
    );
  }
  return null;
}
