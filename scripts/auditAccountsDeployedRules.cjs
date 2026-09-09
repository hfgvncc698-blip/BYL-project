// Read-only deployed Rules comparison. Never prints credentials, access tokens,
// rule contents, project identifiers or user data. Never creates/publishes rules.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { cert } = require('firebase-admin/app');

const root = path.resolve(__dirname, '..');
const hash = text => crypto.createHash('sha256').update(text).digest('hex');
const normalize = text => text.replace(/\r\n/g, '\n').trim();

(async () => {
  const candidates = [process.env.GOOGLE_APPLICATION_CREDENTIALS, path.join(root, 'backend/serviceAccountKey.json')].filter(Boolean);
  const credentialPath = candidates.find(file => fs.existsSync(file));
  if (!credentialPath) { console.log(JSON.stringify({ result: 'credential-unavailable' })); return; }
  const credentials = JSON.parse(fs.readFileSync(credentialPath, 'utf8'));
  const project = credentials.project_id;
  if (!project) { console.log(JSON.stringify({ result: 'project-unavailable' })); return; }
  const token = await cert(credentials).getAccessToken();
  const get = async resource => {
    const response = await fetch(`https://firebaserules.googleapis.com/v1/${resource}`, {
      method: 'GET', headers: { Authorization: `Bearer ${token.access_token}` },
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) { const error = new Error('rules-read-failed'); error.status = response.status; throw error; }
    return response.json();
  };
  let pageToken = '', pages = 0;
  const releases = [];
  do {
    const suffix = pageToken ? `?pageToken=${encodeURIComponent(pageToken)}` : '';
    const page = await get(`projects/${project}/releases${suffix}`);
    releases.push(...(page.releases || []));
    pageToken = page.nextPageToken || '';
    pages++;
  } while (pageToken && pages < 20);
  const output = [];
  for (const release of releases) {
    const kind = release.name?.includes('/releases/cloud.firestore') ? 'firestore'
      : release.name?.includes('/releases/firebase.storage') ? 'storage' : null;
    if (!kind) continue;
    const ruleset = await get(release.rulesetName);
    const files = ruleset.source?.files || [];
    const source = files.find(file => path.basename(file.name || '') === `${kind}.rules`) || (files.length === 1 ? files[0] : null);
    if (typeof source?.content !== 'string') { output.push({ kind, result: 'source-not-resolved' }); continue; }
    const local = fs.readFileSync(path.join(root, `${kind}.rules`), 'utf8');
    output.push({
      kind, exactEqual: hash(local) === hash(source.content),
      equalIgnoringLineEndingsAndEdgeWhitespace: hash(normalize(local)) === hash(normalize(source.content)),
      releaseCreatedAt: release.createTime || null,
      releaseUpdatedAt: release.updateTime || null,
      rulesetCreatedAt: ruleset.createTime || null,
    });
  }
  console.log(JSON.stringify({ result: 'read-only-comparison', completeReleaseListing: !pageToken, comparisons: output }, null, 2));
})().catch(error => {
  console.log(JSON.stringify({ result: 'unavailable', httpStatus: Number(error.status) || null, reason: error.name === 'TimeoutError' ? 'timeout' : 'read-or-credential-failed' }));
  process.exitCode = 1;
});
