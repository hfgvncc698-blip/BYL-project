const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createRequire } = require("node:module");

const functionsRoot = path.resolve(__dirname, "..");

function packageInfoFromEntry(entryPath) {
  let directory = path.dirname(entryPath);
  while (directory !== path.dirname(directory)) {
    const packagePath = path.join(directory, "package.json");
    if (fs.existsSync(packagePath)) {
      const data = JSON.parse(fs.readFileSync(packagePath, "utf8"));
      if (data.name && data.version) return data;
    }
    directory = path.dirname(directory);
  }
  throw new Error(`Unable to locate package.json for ${entryPath}`);
}

function packageMajor(packageInfo) {
  return Number.parseInt(String(packageInfo.version).split(".")[0], 10);
}

function verifyGoogleCloudDependencyCompatibility() {
  const metadata = packageInfoFromEntry(require.resolve("gcp-metadata"));
  const requireFromMetadata = createRequire(require.resolve("gcp-metadata"));
  const metadataGaxios = packageInfoFromEntry(requireFromMetadata.resolve("gaxios"));

  if (packageMajor(metadata) === 6) {
    assert.equal(
      packageMajor(metadataGaxios),
      6,
      "gcp-metadata 6 requires the object-style response headers provided by gaxios 6"
    );
  }

  const googleGax = packageInfoFromEntry(require.resolve("google-gax"));
  const requireFromGoogleGax = createRequire(require.resolve("google-gax"));
  const retryRequest = packageInfoFromEntry(
    requireFromGoogleGax.resolve("retry-request")
  );

  if (packageMajor(googleGax) === 4) {
    assert.equal(
      packageMajor(retryRequest),
      7,
      "google-gax 4 must keep its compatible retry-request 7 dependency"
    );
  }
}

function verifyDependencyOverrides() {
  const packageJson = JSON.parse(
    fs.readFileSync(path.join(functionsRoot, "package.json"), "utf8")
  );
  const forbiddenOverrides = ["gaxios", "retry-request", "teeny-request"];

  forbiddenOverrides.forEach((dependency) => {
    assert.ok(
      !Object.prototype.hasOwnProperty.call(packageJson.overrides || {}, dependency),
      `Do not globally override ${dependency}; Google Cloud packages must resolve their compatible major versions`
    );
  });
}

function verifyIcsContract() {
  const ical = require("ical-generator").default;
  const calendar = ical({
    name: "BoostYourLife - Test",
    prodId: {
      company: "BoostYourLife",
      product: "Calendar Contract Test",
      language: "FR",
    },
  });

  calendar.createEvent({
    id: "byl-contract-active@boostyourlife.app",
    start: new Date("2026-08-11T08:00:00.000Z"),
    end: new Date("2026-08-11T09:00:00.000Z"),
    summary: "Séance active",
  });
  calendar.createEvent({
    id: "byl-contract-cancelled@boostyourlife.app",
    start: new Date("2026-08-12T08:00:00.000Z"),
    end: new Date("2026-08-12T09:00:00.000Z"),
    summary: "Séance annulée",
    status: "CANCELLED",
  });

  const body = calendar.toString();
  const physicalLines = body.split("\r\n");

  assert.ok(body.startsWith("BEGIN:VCALENDAR\r\n"));
  assert.ok(body.trimEnd().endsWith("END:VCALENDAR"));
  assert.ok(body.includes("VERSION:2.0"));
  assert.ok(body.includes("X-WR-CALNAME:BoostYourLife - Test"));
  assert.equal((body.match(/BEGIN:VEVENT/g) || []).length, 2);
  assert.equal((body.match(/^UID:/gm) || []).length, 2);
  assert.equal((body.match(/^DTSTART/gm) || []).length, 2);
  assert.equal((body.match(/^DTEND/gm) || []).length, 2);
  assert.ok(body.includes("STATUS:CANCELLED"));
  assert.ok(
    physicalLines.every((line) => Buffer.byteLength(line, "utf8") <= 75),
    "ICS physical lines must respect the 75-octet folding limit"
  );

  const functionSource = fs.readFileSync(
    path.join(functionsRoot, "index.js"),
    "utf8"
  );
  assert.ok(
    functionSource.includes('res.setHeader("Content-Type", "text/calendar; charset=utf-8")'),
    "calendarFeed must keep the Apple-compatible Content-Type"
  );
  assert.ok(
    functionSource.includes("calendar.toString()"),
    "calendarFeed must return serialized iCalendar content"
  );
}

async function main() {
  verifyDependencyOverrides();
  verifyGoogleCloudDependencyCompatibility();
  verifyIcsContract();
  console.log("Calendar dependency and ICS contract checks: OK");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
