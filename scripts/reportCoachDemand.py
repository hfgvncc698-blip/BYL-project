import json,pathlib,statistics
root=pathlib.Path('audits/coach-demand')
series={label:[json.loads((root/f'{label}-{i}-build.json').read_text())['samples'][0] for i in range(1,3)] for label in ['before','after']}
def detail(s,key):return sum(h.get(key,0) for h in s['http'] if h.get('activity')=='dashboard-client-programs')
for a,b in zip(series['before'],series['after']):
 for key in ['clients','programs','completed','planned','sessions']:assert a['stages']['core'][key]==b['stages']['core'][key]
 for key in ['sdkReads','documentsReturned','estimatedDocumentReads','httpRequests']:assert detail(a,key)==detail(b,key)
 assert b['allBrowser']['sdkCalls']==a['allBrowser']['sdkCalls']
 assert a['allBrowser']['confirmedWrites']==b['allBrowser']['confirmedWrites']
 assert a['backend']['writes']==b['backend']['writes']==0
 assert not a['api']['statuses'].get('413') and not b['api']['statuses'].get('413')
 assert b['stages']['programTransport']['fallbackClients']==0
 assert a['primaryMs'] and b['primaryMs']
def median(label,fn):
 v=[fn(x) for x in series[label]]
 return f'{statistics.median(v):.0f} [{min(v):.0f}–{max(v):.0f}]'
metrics=[('Principal confirmé (ms)',lambda s:s['primaryMs']),('Retour chaud (ms)',lambda s:next(t['primaryMs'] for t in s['returns'] if t['mode']=='warm')),('SDK navigateur',lambda s:s['allBrowser']['sdkCalls']),('Documents navigateur',lambda s:s['allBrowser']['documentsReturned']),('Estimation navigateur',lambda s:s['allBrowser']['estimatedReads']),('Lectures SDK détaillées backend',lambda s:detail(s,'sdkReads')),('Documents détaillés backend',lambda s:detail(s,'documentsReturned')),('Lectures estimées détaillées backend',lambda s:detail(s,'estimatedDocumentReads')),('Appels API détaillés',lambda s:detail(s,'httpRequests')),('Écritures navigateur',lambda s:s['allBrowser']['confirmedWrites']),('Écritures backend',lambda s:s['backend']['writes']),('Corps HTTP détaillés, octets compressés',lambda s:detail(s,'responseBytes')),('Ressources réseau terminées, octets (partiel)',lambda s:s['networkBytes']),('CPU JS navigateur (ms)',lambda s:1000*s['execution']['ScriptDuration']),('Heap navigateur (Mio)',lambda s:s['heap']['usedSize']/1048576)]
lines=['# Dashboard Coach — détails à la demande : mesures synthétiques','', 'Deux séries alternées avant/après, application compilée, mêmes versions Firebase, émulateurs et profils Chrome jetables. 36 clients, 90 programmes, 900 validations. Descriptions de 336 000 caractères et détails historiques synthétiques volumineux. Médiane [min–max]. Les données principales sont confirmées ; un squelette ne termine pas la mesure.', '', '| Mesure | Avant | Après |','|---|---:|---:|']
for label,fn in metrics:lines.append('| '+label+' | '+median('before',fn)+' | '+median('after',fn)+' |')
lines += ['', 'Les compteurs métier (clients, programmes, validations, séances prévues et calendrier) sont identiques. Même nombre de lectures détaillées, aucune écriture ajoutée. Ce sont des estimations documentaires, pas la facture Firebase.', '', 'Les corps HTTP indiquent les octets compressés. Le trafic total observé est partiel : les canaux Firestore persistants ne sont pas tous terminés. La mémoire mesurée est celle du navigateur, pas celle du service Google. La fixture favorise la compression de textes répétitifs ; elle ne prédit pas le temps du compte local.', '', 'Les métadonnées de toutes les validations restent lues. Les descriptions et contenus détaillés historiques sont chargés par les lecteurs existants lors de la consultation. Les prescriptions nécessaires au Radar restent complètes : aucune lecture supplémentaire pour ces actions.']
pathlib.Path('BYL_DASHBOARD_COACH_DETAILS_MESURES.md').write_text('\n'.join(lines)+'\n')
