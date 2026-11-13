import json,pathlib
root=pathlib.Path('audits/lot8b')
rows=[]
invalid=[]
def qualify_returns(label, data):
 for r in data:
  previous=r.get('stages',{}).get('core',{}).get('pageMs')
  for t in r.get('returns',[]):
   page=t.get('stages',{}).get('core',{}).get('pageMs')
   mode=t['mode'].split('/')[-1]
   valid_reload=(t.get('timeOrigin') or 0) > (t.get('previousTimeOrigin') or float('inf'))
   if (mode=='reload' and not valid_reload) or (mode=='warm' and previous is not None and (page is None or page<=previous)):
    invalid.append(f"{label}/{r['n']}/{t['mode']} : nouveau contexte/signal non démontré, temps exclu")
    t['primaryMs']=None;t['contentMs']=None
   previous=page

for mode in ['main','slow','cpu']:
 suffix='' if mode=='main' else '-'+mode
 a=json.loads((root/('before'+suffix+'.json')).read_text())['samples']
 b=json.loads((root/('after'+suffix+'.json')).read_text())['samples']
 assert len(a)==len(b)==4
 qualify_returns('before'+suffix,a);qualify_returns('after'+suffix,b)
 for x,y in zip(a,b):
  assert x['n']==y['n']
  for r in [x,y]:
   assert r.get('primaryMs') is not None and r.get('stages',{}).get('core',{}).get('status')=='ready'
   if r.get('stages',{}).get('core',{}).get('status')=='ready':
    assert r['stages']['core']['completed']==r['n']*2
    assert r['stages']['core']['planned']==r['n']*2
  rows.append((mode,x,y))
def fmt(v):return 'ND' if v is None else str(round(v,2))
def delta(x,y,f):return fmt(f(x))+' → '+fmt(f(y))
def stage(r,k):return r.get('stages',{}).get(k,{}).get('pageMs')
s=['# Lot 8B — avant/après','', 'Chrome froid, viewport 1440 × 1000, application Vite réelle et émulateurs locaux. Une observation par cellule, pas de percentile. main = réseau/CPU locaux ; slow = latence CDP 100 ms, téléchargement 1 500 000 octets/s, upload 750 000 ; cpu = ralentissement CDP ×4, réseau local. Cache HTTP désactivé, profil neuf par volume. Chaque dossier comporte deux programmes et deux validations ; cinq modèles et 40 événements par coach.', '', 'Les données principales correspondent à core confirmé, pas au skeleton. Le jalon painted ne couvre que les blocs instrumentés. Les 404 secondaires et flux ouverts empêchent de certifier un chargement exhaustif de toute BYL. ND ne signifie pas zéro. Les horloges pageMs et celles du runner diffèrent légèrement ; elles ne doivent pas être soustraites entre elles.', '', 'La série normale paired est la dernière paire successivement exécutée sur les fichiers finaux. Les séries ralenties précèdent uniquement l’alignement final du prédicat de confirmation sur la seconde disposition desktop ; voir TESTS. Les mesures antérieures de reload sans nouveau timeOrigin démontré sont exclues.', '', '## Temps de premier chargement (ms)','', '| Conditions / clients | Contenu utile | Principal confirmé | Blocs instrumentés painted | Stabilisation réseau |','|---|---:|---:|---:|---:|']
for mode,x,y in rows:s.append('| '+mode+' / '+str(x['n'])+' | '+' | '.join(delta(x,y,f) for f in [lambda r:r.get('firstUsefulMs'),lambda r:r.get('primaryMs'),lambda r:stage(r,'painted'),lambda r:r.get('networkSettledMs')])+' |')
s+=['','## Jalons de données, depuis navigation (ms)','', '| Conditions / clients | Admission observée | Racines confirmées | Modèles | Calendrier visible | Détails des clients |','|---|---:|---:|---:|---:|---:|']
for mode,x,y in rows:s.append('| '+mode+' / '+str(x['n'])+' | '+' | '.join(delta(x,y,f) for f in [lambda r:r.get('startup',{}).get('admitted'),lambda r:stage(r,'roots'),lambda r:stage(r,'templates'),lambda r:r.get('calendarEventMs'),lambda r:stage(r,'details')])+' |')
s+=['','Les racines servent les noms/compteurs confirmés ; les détails sont nécessaires aux actions dépendant des progressions. Ces jalons ne remplacent pas un test individuel de chaque interaction. Les instants Firebase, Auth, profil, montage, nutrition et rendu sont conservés dans les JSON.','', '## Navigation et restauration, réseau normal (ms)','', '| Clients / parcours | Contenu | Principal | API lancées | Écritures backend |','|---|---:|---:|---:|---:|']
for mode,x,y in rows:
 if mode!='main':continue
 for a,b in zip(x.get('returns',[]),y.get('returns',[])):
  s.append('| '+str(x['n'])+' / '+a['mode']+' | '+' | '.join(delta(a,b,lambda r,k=k:r.get(k)) for k in ['contentMs','primaryMs','apiCalls','writes'])+' |')
s+=['','Navigation : aller sur About, attendre 1,5 s, revenir ; warm : aller-retour de 200 ms ; reload : rechargement complet avec restauration Firebase et admission réelle. Ce sont trois parcours distincts. Le premier accès après connexion est inclus dans le premier chargement ; le délai route → core est disponible via mountMs, sans faire passer l’admission pour une donnée facultative.','', '## Firestore et réseau','', '| Conditions / clients | SDK navigateur | Docs navigateur | Lectures estimées navigateur | Docs routes | Lectures estimées routes | Écritures B / serveur avant→après | HTTP lancées | Réseau Mio |','|---|---:|---:|---:|---:|---:|---|---:|---:|']
for mode,x,y in rows:
 funcs=[lambda r:r.get('allBrowser',{}).get('sdkCalls'),lambda r:r.get('allBrowser',{}).get('documentsReturned'),lambda r:r.get('allBrowser',{}).get('estimatedReads'),lambda r:sum(q.get('documentsReturned',0) for q in r.get('http',[])),lambda r:sum(q.get('estimatedDocumentReads',0) for q in r.get('http',[]))]
 line='| '+mode+' / '+str(x['n'])+' | '+' | '.join(delta(x,y,f) for f in funcs)
 line+=' | '+str((x.get('allBrowser',{}).get('confirmedWrites'),x.get('backend',{}).get('writes')))+' → '+str((y.get('allBrowser',{}).get('confirmedWrites'),y.get('backend',{}).get('writes')))
 line+=' | '+delta(x,y,lambda r:r.get('api',{}).get('requests'))+' | '+delta(x,y,lambda r:r.get('networkBytes',0)/1048576)+' |';s.append(line)
s+=['','Aucune nouvelle écriture métier introduite. Les écritures navigateur à froid existaient avant correction. Le réseau inclut les modules Vite, et non seulement les réponses privées. Les comptes de snapshots Admin hors HTTP sont séparés dans listeners ; aucune addition de la sonde backend générique partielle aux routes. La sonde ne fournit pas un décompte certifié de tous les listeners actifs ; aucune souscription applicative ajoutée par le diff.','', '## CPU, interactivité et mémoire','', '| Conditions / clients | JS ms | Blocage cumulé >50 ms | Heartbeat maximum ms | Heap JS Mio | Montages |','|---|---:|---:|---:|---:|---:|']
for mode,x,y in rows:
 funcs=[lambda r:r.get('execution',{}).get('ScriptDuration',0)*1000,lambda r:sum(max(0,q['duration']-50) for q in r.get('longTasks',[])),lambda r:r.get('heartbeatMaxMs'),lambda r:r.get('heap',{}).get('usedSize',0)/1048576,lambda r:r.get('mounts')]
 s.append('| '+mode+' / '+str(x['n'])+' | '+' | '.join(delta(x,y,f) for f in funcs)+' |')
s+=['','Le heartbeat vise 50 ms ; les valeurs élevées représentent du retard du thread. Les Long Tasks ne sont pas un INP. Le heap est celui du renderer, pas la mémoire serveur. Les durées HTTP de chaque route et la somme des temps de réponse sont conservées dans les JSON : ce ne sont pas des temps CPU serveur.','', '## Échecs et réponses secondaires','']
for mode,x,y in rows:s.append(f"- {mode}/{x['n']} : HTTP {x.get('api',{}).get('statuses')} → {y.get('api',{}).get('statuses')}; SDK refus/erreurs {x.get('allBrowser',{}).get('failures')} → {y.get('allBrowser',{}).get('failures')}; collecte {x.get('failure','OK')} → {y.get('failure','OK')}.")
s+=['','## Navigation sous contraintes (ms)','', '| Clients / parcours | Contenu | Principal | API | Écritures backend |','|---|---:|---:|---:|---:|']
a=json.loads((root/'before-transitions.json').read_text())['samples'];b=json.loads((root/'after-transitions.json').read_text())['samples']
assert len(a)==len(b)==4
qualify_returns('before-transitions',a);qualify_returns('after-transitions',b)
for x,y in zip(a,b):
 assert x['n']==y['n']
 for u,v in zip(x.get('returns',[]),y.get('returns',[])):
  assert u['mode']==v['mode']
  s.append('| '+str(x['n'])+' / '+u['mode']+' | '+' | '.join(delta(u,v,lambda r,k=k:r.get(k)) for k in ['contentMs','primaryMs','apiCalls','writes'])+' |')
s+=['','Contrôles de fraîcheur des jalons : '+('; '.join(invalid) if invalid else 'tous les retours retenus ont un signal nouveau ; les reload retenus ont un timeOrigin nouveau.') ]
s+=['','## Écoutes actives observées au passage froid de la série transitions','', '| Clients | SDK navigateur actif | Pic SDK navigateur | Handles Admin actifs |','|---|---:|---:|---:|']
for x,y in zip(a,b):s.append('| '+str(x['n'])+' | '+delta(x,y,lambda r:r.get('allBrowser',{}).get('activeListeners'))+' | '+delta(x,y,lambda r:r.get('allBrowser',{}).get('peakListeners'))+' | '+delta(x,y,lambda r:r.get('backendActiveListeners'))+' |')
s+=['','Ces compteurs sont des abonnements/handles SDK actifs du banc, pas le nombre de connexions physiques multiplexées ni la consommation future après la fenêtre. La sonde de souscriptions a été ajoutée pour cette série complémentaire ; les autres séries ne prétendent pas mesurer un nombre actif exact.']
s+=['','Ces parcours conservent le même compte autorisé. Les conditions lentes sont appliquées après le premier lancement local, avant chaque navigation, retour ou reload. Seuls les reload avec changement de timeOrigin démontré sont retenus ; les mesures antérieures sans cette preuve sont ND, même si leur durée semblait plausible.']
s+=['','## Démarrage détaillé, réseau normal (ms depuis navigation)','', '| Clients | HTML responseEnd | Module Firebase prêt | Entrée JS | Session restaurée | Admission observée | Montage Dashboard |','|---|---:|---:|---:|---:|---:|---:|']
for mode,x,y in rows:
 if mode!='main':continue
 funcs=[lambda r:(r.get('navigation')or[{}])[0].get('responseEnd'),lambda r:r.get('startup',{}).get('firebase'),lambda r:r.get('startup',{}).get('entry'),lambda r:r.get('startup',{}).get('sessionRestored'),lambda r:r.get('startup',{}).get('admitted'),lambda r:r['stages']['core']['pageMs']-r['stages']['core']['mountMs']]
 s.append('| '+str(x['n'])+' | '+' | '.join(delta(x,y,f) for f in funcs)+' |')
s+=['','## Durée et transfert des réponses API','', '| Conditions / clients | Somme latences serveur ms | Plus lente route instrumentée ms | Réponses API octets |','|---|---:|---:|---:|']
for mode,x,y in rows:s.append('| '+mode+' / '+str(x['n'])+' | '+delta(x,y,lambda r:r.get('api',{}).get('durationMs'))+' | '+delta(x,y,lambda r:max((q.get('durationMs',0) for q in r.get('http',[])),default=0))+' | '+delta(x,y,lambda r:r.get('api',{}).get('responseBytes'))+' |')
s+=['','## Route détaillée seule, hors attentes de messagerie','', '| Clients | Appels détaillés | Documents retournés | Lectures estimées |','|---|---:|---:|---:|']
for mode,x,y in rows:
 if mode!='main':continue
 def detailed(r,key):return sum(q.get(key,0) for q in r.get('http',[]) if q.get('activity')=='dashboard-client-programs')
 s.append('| '+str(x['n'])+' | '+' | '.join(delta(x,y,lambda r,k=k:detailed(r,k)) for k in ['httpRequests','documentsReturned','estimatedDocumentReads'])+' |')
pathlib.Path('BYL_LOT8B_AVANT_APRES.md').write_text('\n'.join(s)+'\n')
