const { gzip } = require('node:zlib');
const { promisify } = require('node:util');
const compress = promisify(gzip);
const MAX_TRANSFER_BYTES = 4 * 1024 * 1024;
const MAX_V2_TRANSFER_BYTES = 32 * 1024 * 1024;
const MAX_DECODED_BYTES = 64 * 1024 * 1024;

// Lossless transport only: no field projection, summary, cache or extra DB read.
// Legacy clients keep their original 4 MiB decoded-body contract. Version 2
// permits up to 32 MiB compressed and 64 MiB decoded. This replaces an
// unbounded SDK re-read of exactly the same authorized data after a 413.
async function dashboardTransport(body, { gzipAccepted, version } = {}) {
  const decodedBytes = Buffer.byteLength(body);
  const limit = version === 2 && gzipAccepted ? MAX_DECODED_BYTES : MAX_TRANSFER_BYTES;
  if (decodedBytes > limit) return null;
  if (!gzipAccepted) return { body, gzip: false, decodedBytes, transferBytes: decodedBytes };
  const packed = await compress(body);
  if (packed.length > (version === 2 ? MAX_V2_TRANSFER_BYTES : MAX_TRANSFER_BYTES)) return null;
  return { body: packed, gzip: true, decodedBytes, transferBytes: packed.length };
}
module.exports = { dashboardTransport, MAX_TRANSFER_BYTES, MAX_V2_TRANSFER_BYTES, MAX_DECODED_BYTES };
