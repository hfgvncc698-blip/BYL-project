// A slow Firestore acknowledgement does not cancel the write. Keep observing
// the same promise and keep the caller's save lock until it actually settles.
export async function awaitWriteConfirmation(request, onSlow, timeoutMs = 12000) {
  const timer = setTimeout(onSlow, timeoutMs);
  try {
    return await request;
  } finally {
    clearTimeout(timer);
  }
}
