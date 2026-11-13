import json,pathlib,statistics
root=pathlib.Path('audits/coach-history-transfer')
series={label:[json.loads((root/f'{label}-{i}-build.json').read_text())['samples'][0] for i in range(1,4)] for label in ['before','after']}
def detail(s,key):return sum(h.get(key,0) for h in s['http'] if h.get('activity')=='dashboard-client-programs')
for a,b in zip(series['before'],series['after']):
 for key in ['clients','programs','completed','planned','sessions']:assert a['stages']['core'][key]==b['stages']['core'][key]
 for key in ['sdkReads','documentsReturned','estimatedDocumentReads','httpRequests']:assert detail(a,key)==detail(b,key)
 assert b['allBrowser']['sdkCalls']<a['allBrowser']['sdkCalls']
 assert a['allBrowser']['confirmedWrites']==b['allBrowser']['confirmedWrites']
 assert a['backend']['writes']==b['backend']['writes']==0
 assert a['api']['statuses'].get('413')==1 and not b['api']['statuses'].get('413')
 assert b['stages']['programTransport']['fallbackClients']==0
 assert a['primaryMs'] and b['primaryMs']
def median(label,fn):
 v=[fn(x) for x in series[label]]
 return f'{statistics.median(v):.0f} [{min(v):.0f}–{max(v):.0f}]'
metrics=[('Principal confirmé (ms)',lambda s:s['primaryMs']),('Retour chaud (ms)',lambda s:next(t['primaryMs'] for t in s['returns'] if t['mode']=='warm')),('SDK navigateur',lambda s:s['allBrowser']['sdkCalls']),('Documents navigateur',lambda s:s['allBrowser']['documentsReturned']),('Estimation navigateur',lambda s:s['allBrowser']['estimatedReads']),('Lectures SDK détaillées backend',lambda s:detail(s,'sdkReads')),('Documents détaillés backend',lambda s:detail(s,'documentsReturned')),('Lectures estimées détaillées backend',lambda s:detail(s,'estimatedDocumentReads')),('Appels API détaillés',lambda s:detail(s,'httpRequests')),('Écritures navigateur',lambda s:s['allBrowser']['confirmedWrites']),('Écritures backend',lambda s:s['backend']['writes']),('Corps HTTP détaillés, octets compressés',lambda s:detail(s,'responseBytes')),('Ressources réseau terminées, octets (partiel)',lambda s:s['networkBytes']),('CPU JS navigateur (ms)',lambda s:1000*s['execution']['ScriptDuration']),('Heap navigateur (Mio)',lambda s:s['heap']['usedSize']/1048576)]
lines=['# Programmes détaillés — comparaison synthétique','', 'Trois passages avant et trois passages après, même SDK, même bundle compilé, émulateurs, profils Chrome jetables. Les premières séries étaient alternées ; les trois passages après ont été rejoués avec les plafonds finaux. 36 clients, 90 programmes, 900 validations ; champ synthétique riche par programme (336 000 caractères), conservé intégralement. Médiane [min–max].', '', '| Mesure | Avant | Après |','|---|---:|---:|']
for label,fn in metrics:lines.append('| '+label+' | '+median('before',fn)+' | '+median('after',fn)+' |')
lines+=['','Le backend lit les mêmes documents. Le gain documentaire vient de la suppression du repli SDK après 413. Les deux écritures navigateur sont existantes, aucune écriture ajoutée. Les métriques sont des estimations, pas des relevés de facturation.', '', 'Attention : le compteur réseau observe les ressources terminées. Il ne mesure pas intégralement les canaux Firestore persistants ; les octets API ne doivent pas être comparés seuls pour conclure sur le trafic total. La mémoire ci-dessus est celle du navigateur, pas de l’instance Google.', '', 'Les plafonds de transfert, le contrat ancien, la décompression sans perte, les refus d’accès et le cas incompressible sont testés séparément. Les compteurs métier avant/après sont identiques.']
pathlib.Path('BYL_DASHBOARD_COACH_HISTORIQUES_MESURES.md').write_text('\n'.join(lines)+'\n')
