const pendingError = () => Object.assign(
  new Error("La confirmation serveur est encore en attente. Réessaie pour vérifier cette même opération, sans la recréer."),
  { code: "write-confirmation-pending" }
);

// Retain the exact operation after a timeout (including its document IDs).
// A retry observes the same promise, or reruns the same idempotent operation
// after an actual rejection. Only a delivered acknowledgement clears it.
export async function confirmOperation(holder, key, createOperation, { timeoutMs = 12000 } = {}) {
  let operation = holder.current;
  if (operation && operation.key !== key) {
    if (operation.status === "confirmed") {
      holder.current = null;
      throw Object.assign(new Error("L’opération précédente a bien été enregistrée. Aucune nouvelle opération n’a été créée. Tu peux maintenant confirmer ta nouvelle sélection."), { code: "write-previous-confirmed" });
    }
    if (operation.status !== "failed") throw pendingError();
    operation = null;
  }
  if (!operation) {
    operation = { key, run: createOperation(), status: "idle", promise: null };
    holder.current = operation;
  }
  if (!operation.promise || operation.status === "failed") {
    operation.status = "pending";
    operation.promise = Promise.resolve().then(operation.run).then(result => {
      operation.status = "confirmed";
      return result;
    }, error => {
      operation.status = "failed";
      throw error;
    });
  }
  let timeoutId;
  try {
    const result = await Promise.race([
      operation.promise,
      new Promise((_, reject) => { timeoutId = setTimeout(() => reject(pendingError()), timeoutMs); }),
    ]);
    if (holder.current === operation) holder.current = null;
    return result;
  } finally {
    clearTimeout(timeoutId);
  }
}
