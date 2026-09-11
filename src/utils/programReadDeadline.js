// Bounds read-only waits; does not retry writes or pretend a timed-out read succeeded.
export async function programReadDeadline(request, timeoutMs = 15000) {
  let timer;
  try {
    return await Promise.race([
      request,
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          const error = new Error("Program read timed out");
          error.code = "deadline-exceeded";
          reject(error);
        }, timeoutMs);
      }),
    ]);
  } finally { clearTimeout(timer); }
}
