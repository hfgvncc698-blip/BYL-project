import json,statistics,pathlib
root=pathlib.Path('audits/coach-startup')
series={label:[json.loads((root/f'{label}-{i}-build.json').read_text())['samples'] for i in range(1,4)] for label in ['before','after']}
assert all(len(run)==3 for runs in series.values() for run in runs)
for i in range(3):
 for j in range(3):
  a,b=series['before'][i][j],series['after'][i][j]
  assert (a['n'],a['h'])==(b['n'],b['h'])
  assert a['primaryMs'] and b['primaryMs']
  for key in ['completed','planned']:assert a['stages']['core'][key]==b['stages']['core'][key]
  for r in [a,b]:
   assert not r.get('failure')
   for t in r['returns']:
    assert t['primaryMs']
    if t['mode']=='reload':assert t['timeOrigin']>t['previousTimeOrigin']
def metric(label,j,f):
 v=[f(run[j]) for run in series[label]]
 if any(x is None for x in v):return 'ND'
 return f'{statistics.median(v):.0f} [{min(v):.0f}–{max(v):.0f}]'
def compare(j,f):return metric('before',j,f)+' → '+metric('after',j,f)
def route(r,key):return sum(h.get(key,0) for h in r['http'] if h.get('activity')=='dashboard-client-programs')
s=['# Dashboard Coach — mesures de stabilisation','', 'Trois passages avant/après par scénario, profils navigateur jetables, bundle compilé de la vraie application, Auth et Firestore émulés. Valeurs : médiane [minimum–maximum]. Les modules sont compilés avec la configuration du projet ; seuls les marqueurs de temps sont activés dans la copie de test. Aucun compte réel. Pas de déploiement.', '', 'Fixtures : 36 ou 100 clients ; deux programmes chacun, sauf un client avec 20 programmes ; 10 ou 100 validations par programme ; 5 modèles et 40 événements de calendrier. Le nombre de clients ne suffit donc pas à décrire le volume. Les anciennes mesures 500 clients/deux validations ne sont pas comparables.', '', '## Affichage (millisecondes)','', '| Clients / historique par programme | Premier contenu utile | Principal confirmé | Retour chaud | Reload confirmé |','|---|---:|---:|---:|---:|']
for j,a in enumerate(series['before'][0]):
 s.append(f"| {a['n']} / {a['h']} | "+' | '.join(compare(j,f) for f in [lambda r:r['firstUsefulMs'],lambda r:r['primaryMs'],lambda r:next(t['primaryMs'] for t in r['returns'] if t['mode']=='warm'),lambda r:next(t['primaryMs'] for t in r['returns'] if t['mode']=='reload')])+' |')
s+=['','Principal = core confirmé, avec parité des totaux terminés/prévus. Le premier contenu utile n’est pas le skeleton. Les données secondaires ne sont pas toutes représentées par core ; certaines routes secondaires du banc restent non montées (404). Pas de percentile terrain, de serveur distant ni de promesse pour le compte réel.', '', '## Coûts et ressources','', '| Clients / historique | Appels détaillés | Lectures estimées détaillées | SDK navigateur | Écritures navigateur | Écritures backend |','|---|---:|---:|---:|---:|---:|']
for j,a in enumerate(series['before'][0]):
 s.append(f"| {a['n']} / {a['h']} | "+' | '.join(compare(j,f) for f in [lambda r:route(r,'httpRequests'),lambda r:route(r,'estimatedDocumentReads'),lambda r:r['allBrowser']['sdkCalls'],lambda r:r['allBrowser']['confirmedWrites'],lambda r:r['backend']['writes']])+' |')
s+=['','| Clients / historique | Documents route détaillée | Estimation navigateur | Transfert Kio | Heap JS Mio | JS ms | Écoutes actives navigateur |','|---|---:|---:|---:|---:|---:|---:|']
for j,a in enumerate(series['before'][0]):
 s.append(f"| {a['n']} / {a['h']} | "+' | '.join(compare(j,f) for f in [lambda r:route(r,'documentsReturned'),lambda r:r['allBrowser']['estimatedReads'],lambda r:r['networkBytes']/1024,lambda r:r['heap']['usedSize']/1048576,lambda r:r['execution']['ScriptDuration']*1000,lambda r:r['allBrowser']['activeListeners']])+' |')
s+=['','Les lectures sont des estimations instrumentées, pas la facture Google. Le coût serveur n’est pas remplacé par le heap du navigateur. Aucun nouveau service, index, document de synthèse, polling ou écriture métier. La concurrence des lectures détaillées ne dépasse pas celle de l’ancien code : au plus un créneau par client du lot, maximum 32. Une erreur arrête les lectures encore en file, sans retry ajouté.', '', '## Erreurs observées','']
for label,runs in series.items():
 for i,run in enumerate(runs,1):
  s.append(f"- {label}/{i} : "+'; '.join(f"{r['n']}/{r['h']} HTTP {r['api']['statuses']}, échecs SDK {r['allBrowser']['failures']}" for r in run))
pathlib.Path('BYL_DASHBOARD_COACH_MESURES.md').write_text('\n'.join(s)+'\n')
