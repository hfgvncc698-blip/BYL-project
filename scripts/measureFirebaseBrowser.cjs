// Chromium mounts the real pages in an isolated Vite root, without the production App or Firebase config.
const fs = require('node:fs');
const path = require('node:path');
const { spawn, execFileSync } = require('node:child_process');
const { once } = require('node:events');
const root = path.resolve(__dirname, '..');

async function browserPages({ directory, revision, app, accounts, projectId, rows, changeSession, offerScenario }) {
  const folder = path.join(fs.realpathSync(directory), 'web');
  fs.mkdirSync(folder, { recursive: true });
  if (revision) {
    const archive = execFileSync('git', ['archive', revision, 'src'], { cwd: root, maxBuffer: 120 * 1024 * 1024 });
    execFileSync('tar', ['-x', '-C', folder], { input: archive });
  } else fs.cpSync(path.join(root, 'src'), path.join(folder, 'src'), { recursive: true });
  fs.symlinkSync(path.join(root, 'node_modules'), path.join(folder, 'node_modules'), 'dir');
  // Files imported by the real components outside src.
  for (const f of fs.readdirSync(root).filter(f => /^(exercises|training|fixed|ergometre|warmup|cooldown)\.json$/.test(f))) {
    fs.copyFileSync(path.join(root, f), path.join(folder, f));
  }
  fs.mkdirSync(path.join(folder, 'backend/utils'), { recursive: true });
  for (const f of ['clubCurrencies.json', 'clubCurrencyDigits.json']) {
    const source = path.join(revision ? directory : root, 'backend/utils', f);
    if (fs.existsSync(source)) fs.copyFileSync(source, path.join(folder, 'backend/utils', f));
  }
  const write = (f, data) => fs.writeFileSync(path.join(folder, f), data);
  for (const file of ['firestoreMetrics.js', 'browserMetrics.js']) {
    fs.copyFileSync(path.join(root, 'src/utils', file), path.join(folder, 'src/utils', file));
  }
  // Insert the current observer at the same SDK boundary on each historical page.
  if (revision) for (const [name, activity] of [['CoachDashboard', 'coach-dashboard'], ['Clients', 'clients']]) {
    const file = 'src/components/' + name + '.jsx';
    let source = fs.readFileSync(path.join(folder, file), 'utf8');
    const reads = [];
    source = source.replace(/import \{([^{}]+)\} from "firebase\/firestore";/, (match, fields) => {
      const keep = fields.split(',').map(x => x.trim()).filter(Boolean).filter(f => {
        if (!['getDoc', 'getDocs', 'getDocsFromCache', 'getDocFromCache', 'onSnapshot', 'query'].includes(f)) return true;
        reads.push(f);
        return false;
      });
      return 'import { ' + keep.join(', ') + ' } from "firebase/firestore";';
    });
    if (!reads.includes('getDocs') && source.includes('utils/firestoreMetrics.js')) continue;
    if (!reads.includes('getDocs')) throw Error('Historical SDK boundary changed');
    write(file, 'import {forFirestorePage} from "../utils/firestoreMetrics.js";\nconst {' + reads.join(',') +
      '} = forFirestorePage(' + JSON.stringify(activity) + ');\n' + source);
  }
  if (offerScenario) {
    const file = 'src/components/offers/OfferPreviewStore.js';
    const notify = "window.dispatchEvent(new Event('fixture-offer-confirmed'));";
    let source = fs.readFileSync(path.join(folder, file), 'utf8');
    const insertion = revision ? 'cache.set(uid,state);' : 'publish(entry, entry.confirmed);';
    if (!source.includes(insertion)) throw Error('Offer measurement boundary changed');
    source = source.replace(insertion, insertion + (revision ? 'if(!state.error&&!state.loading)' : '') + notify);
    const boundary = /return \[state,\s*update\];/;
    if (!boundary.test(source)) throw Error('Offer render boundary changed');
    source = source.replace(boundary, `useOfferMeasurement(() => {
      if (!state.loading && !state.error) window.dispatchEvent(new Event('fixture-offer-usable'));
    }, [state]);
    return [state, update];`);
    write(file, "import {useLayoutEffect as useOfferMeasurement} from 'react';\n" + source);
  }
  write('src/firebaseConfig.js', `
    import { initializeApp } from 'firebase/app';
    import { getAuth, connectAuthEmulator } from 'firebase/auth';
    import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, connectFirestoreEmulator } from 'firebase/firestore';
    const app = initializeApp({projectId:${JSON.stringify(projectId)}, apiKey:'demo-key', appId:'synthetic-app'});
    export const auth = getAuth(app);
    connectAuthEmulator(auth, 'http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}', {disableWarnings:true});
    export const db = initializeFirestore(app,{localCache:persistentLocalCache({tabManager:persistentMultipleTabManager()})});
    connectFirestoreEmulator(db, '127.0.0.1', ${Number(process.env.FIRESTORE_EMULATOR_HOST.split(':')[1])});
    export default app;
  `);
  write('src/AuthContext.jsx', `
    const coach = {uid:'coach',role:'coach',subscriptionStatus:'active',hasActiveSubscription:true};
    const owner = {uid:'owner',role:'club',accountType:'club_owner',clubId:'sample'};
    const administrator = {uid:'administrator',role:'admin'};
    export const useAuth = () => ({user: window.fixtureAdmin ? administrator : window.fixtureOwner ? owner : coach, isAdmin: !!window.fixtureAdmin, isCoach: !window.fixtureOwner,
      isAuthenticated:true, loading:false, effectiveRole:window.fixtureOwner ? 'club' : 'coach'});
    export const AuthProvider = ({children}) => children;
  `);
  write('index.html', `<meta charset="utf-8"><div id="root"></div>
    <script>
    const fail = () => fetch('/fixture-results', {method:'POST',body:JSON.stringify({failure:'page-exception'})});
    window.addEventListener('error', fail); window.addEventListener('unhandledrejection', fail);
    </script><script type="module" src="/entry.jsx"></script>`);
  const appSource = fs.readFileSync(path.join(folder, 'src/App.jsx'), 'utf8');
  const condition = appSource.match(/const showDashboardMessaging = ([\s\S]*?);/)[1];
  // Evaluate the same mount condition used by this revision of App.
  write('clubBubble.js', 'export function onClub(user,location) { return ' + condition + '; }');
  write('entry.jsx', fs.readFileSync(path.join(__dirname, offerScenario ? 'fixtures/firebaseOffersBrowser.jsx' : 'fixtures/firebaseLot1Browser.jsx'), 'utf8'));
  const { createServer } = await import('vite');
  const vite = await createServer({ root: folder, configFile: false, envDir: false, publicDir: false,
    cacheDir: path.join(folder, '.vite'), logLevel: 'error',
    define: { 'globalThis.offerScenario': JSON.stringify(offerScenario || null), 'import.meta.env.VITE_BYL_FIRESTORE_METRICS': '"1"',
      'globalThis.fixtureExtended': JSON.stringify(!revision && process.env.BYL_LOT1_EXTENDED === '1') },
    server: { middlewareMode: true, hmr: false, fs: { allow: [folder, path.join(root, 'node_modules')] } },
    optimizeDeps: { entries: ['entry.jsx'] } });
  let settle;
  const completed = new Promise(resolve => { settle = resolve; });
  let start = 0;
  let offerTransportUnavailable = false;
  const server = require('node:http').createServer((req, res) => {
    // All external connections are disallowed even if a historical page references an external asset.
    res.setHeader('Content-Security-Policy', "default-src 'self'; connect-src 'self' http://127.0.0.1:* ws://127.0.0.1:*; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; frame-src 'none'; worker-src 'self' blob:");
    if (req.url === '/fixture-start') { start = rows.length; res.end(); return; }
    if (req.url === '/fixture-stop') {
      const totals = {};
      for (const row of rows.slice(start)) {
        const group = totals[row.activity] ||= { http: 0, reads: 0, documents: 0, bytes: 0 };
        if (offerScenario) group.estimate = (group.estimate || 0) + row.estimatedDocumentReads;
        group.http += row.httpRequests;
        group.reads += row.sdkReads;
        group.documents += row.documentsReturned;
        group.bytes += row.responseBytes || 0;
      }
      res.end(JSON.stringify(totals)); return;
    }
    if (offerScenario && req.method === 'POST' && ['/fixture-offers-offline', '/fixture-offers-online'].includes(req.url)) {
      offerTransportUnavailable = req.url === '/fixture-offers-offline';
      res.end(); return;
    }
    if (offerTransportUnavailable && req.url.startsWith('/api/coach-offers')) {
      res.statusCode = 503; res.end(); return;
    }
    if ((req.url === '/fixture-calendar-change' || (offerScenario && req.url === '/fixture-calendar-change?unrelated')) && req.method === 'POST') {
      changeSession(req.url.endsWith('?unrelated')).then(() => res.end(), () => { res.statusCode = 500; res.end(); }); return;
    }
    if (['/fixture-coach', '/fixture-owner', '/fixture-administrator'].includes(req.url)) {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(accounts[req.url.slice('/fixture-'.length)])); return;
    }
    if (req.url === '/fixture-results' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => { res.end(); settle(JSON.parse(body)); });
      return;
    }
    if (req.url.startsWith('/api/')) return app(req, res);
    vite.middlewares(req, res);
  });
  let chrome, timer;
  try {
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const executable = process.env.BYL_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
    chrome = spawn(executable, ['--headless=new', '--window-size=' + (offerScenario?.width || 1440) + ',1000', '--disable-background-networking', '--disable-popup-blocking', '--disable-sync', '--no-first-run',
      '--disable-default-apps', '--disable-component-update', '--no-proxy-server', '--disable-gpu',
      '--user-data-dir=' + path.join(folder, '.chrome'), 'http://127.0.0.1:' + server.address().port], { stdio: 'ignore' });
    chrome.once('error', () => settle({ failure: 'chrome-start' }));
    chrome.once('exit', () => settle({ failure: 'chrome-exit' }));
    timer = setTimeout(() => settle({ failure: 'browser-timeout' }), 260000);
    const result = await completed;
    if (result.failure) throw Error('Browser probe: ' + result.failure);
    return result;
  } finally {
    clearTimeout(timer);
    if (chrome && chrome.exitCode === null && chrome.pid) {
      const closed = once(chrome, 'exit');
      chrome.kill();
      await closed;
    }
    await vite.close();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
}

module.exports = { browserPages };
