export async function settleWithTimeout(promise, timeoutMs, fallback = null) {
  let timer;
  try {
    return await Promise.race([
      Promise.resolve(promise).catch(() => fallback),
      new Promise((resolve) => {
        timer = setTimeout(() => resolve(fallback), Math.max(0, Number(timeoutMs) || 0));
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
