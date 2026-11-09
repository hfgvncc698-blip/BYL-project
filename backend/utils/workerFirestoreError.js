// The worker SDK can use either gRPC codes or an HTTP error with a Google
// status in its JSON body. A generic HTTP 400 is not a version conflict.
const grpc = {5:'NOT_FOUND', 6:'ALREADY_EXISTS', 9:'FAILED_PRECONDITION'};
function workerFirestoreStatus(error) {
  if (grpc[error.code]) return grpc[error.code];
  if (typeof error.code === 'string') {
    const status = error.code.toUpperCase().replaceAll('-', '_');
    if (Object.values(grpc).includes(status)) return status;
  }
  try { return JSON.parse(error.message).error?.status; }
  catch { return undefined; }
}
function lostVersion(error) {
  const status = workerFirestoreStatus(error);
  return status === 'NOT_FOUND' || status === 'FAILED_PRECONDITION';
}
module.exports = { workerFirestoreStatus, lostVersion };
