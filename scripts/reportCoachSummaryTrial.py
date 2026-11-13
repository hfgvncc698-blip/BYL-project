import json, pathlib, statistics, math
root=pathlib.Path('audits/coach-summary-pilot')
trial=json.loads((root/'trial.json').read_text())
series={label:[json.loads(pathlib.Path(f'audits/coach-summary-browser/{label}-{i}-build.json').read_text())['samples'][0] for i in [1,2]] for label in ['before','after']}
for a,b in zip(series['before'],series['after']):
 for key in ['clients','programs','completed','planned','sessions']:assert a['stages']['core'][key]==b['stages']['core'][key]
 assert a['allBrowser']['sdkCalls']==b['allBrowser']['sdkCalls']
 assert a['backend']['writes']==0 and b['backend']['writes']==36
 assert len(b['summarySynchronization'])==2
 assert b['mobileResizePassed']
def detail(s,key):return sum(x.get(key,0) for x in s['http'] if x.get('activity')=='dashboard-client-programs')
def median(label,fn):
 values=[fn(x) for x in series[label]]
 return f'{statistics.median(values):.0f} [{min(values):.0f}–{max(values):.0f}]'
metrics=[('Premier contenu réel (ms)',lambda s:s['firstUsefulMs']),('Principal confirmé, première création (ms)',lambda s:s['primaryMs']),('Rechargement, résumés déjà prêts (ms)',lambda s:next(x['primaryMs'] for x in s['returns'] if x['mode']=='reload')),('Retour chaud (ms)',lambda s:next(x['primaryMs'] for x in s['returns'] if x['mode']=='warm')),('SDK navigateur',lambda s:s['allBrowser']['sdkCalls']),('SDK backend programmes à la création',lambda s:detail(s,'sdkReads')),('Documents programmes à la création',lambda s:detail(s,'documentsReturned')),('Lectures estimées programmes à la création',lambda s:detail(s,'estimatedDocumentReads')),('Écritures backend à la création',lambda s:s['backend']['writes']),('Écritures navigateur',lambda s:s['allBrowser']['confirmedWrites']),('Octets API programmes compressés',lambda s:detail(s,'responseBytes')),('CPU JavaScript navigateur (ms)',lambda s:1000*s['execution']['ScriptDuration']),('Heap navigateur (Mio)',lambda s:s['heap']['usedSize']/1048576),('Validation : synchronisation (ms)',lambda s:s['summarySynchronization'][0]['ms']),('Suppression : synchronisation (ms)',lambda s:s['summarySynchronization'][1]['ms'])]
lines=['# Essai de résumés — mesures','', '## Dashboard complet, 36 clients synthétiques','', 'Deux séries alternées avant/après, application réelle compilée, Chrome jetable, Auth/Firestore émulés. 90 programmes, 900 historiques. Médiane [min–max]. La première ouverture crée les résumés ; le rechargement suivant les réutilise. Il ne faut pas comparer ce rechargement au premier lancement ni à la mesure locale précédente de 13,77 s.','', '| Mesure | Avant | Pilote |','|---|---:|---:|']
for title,fn in metrics:lines.append(f'| {title} | {median("before",fn)} | {median("after",fn)} |')
lines += ['', 'Les compteurs métier sont identiques. Les données transférées et le travail de rendu restent pratiquement identiques : le gain vient surtout des lectures serveur évitées. Les validations et suppressions changent bien les statistiques à l’écran. La reconstruction du dossier modifié ajoute 1 lecture et 1 écriture de résumé ; son annuaire et les autres dossiers ne sont pas reconstruits.', '', '## API protégée : création et consultations suivantes','', 'Une référence et une création par fixture, puis deux consultations avec résumé présent. Latences locales et émulateurs ; aucune facture réelle. Avant et après renvoient une projection strictement identique (empreinte de l’intégralité des réponses). Les nombres ci-dessous sont des lectures documentaires estimées, autorisation incluse.','', '| Clients | Programmes | Historiques | Avant ms | Création ms | Résumé présent ms (médiane) | Lectures avant | Lectures création | Lectures suivantes | Écritures création |','|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|']
for s in trial['scenarios']:
 a,c,w,w2=s['phases'];lines.append(f"| {s['clients']} | {s['programs']} | {s['histories']} | {a['ms']} | {c['ms']} | {statistics.median([w['ms'],w2['ms']]):.0f} | {a['estimated']} | {c['estimated']} | {w['estimated']} | {c['writes']} |")
lines += ['', '## Coût complet et seuil de rentabilité','', 'Soit R le prix d’une lecture et W celui d’une écriture. Après N consultations serveur sans modification : avant = N × B × R ; pilote = C × R + E × W + (N−1) × H × R, avec B les lectures de référence, C celles de création, E ses écritures et H les lectures du résumé. Il faut compter aussi le stockage et les ressources serveur. Les ratios ci-dessous sont des hypothèses de sensibilité, **pas des tarifs Google**.', '', '| Clients / programmes / historiques | Consultations nécessaires si W/R=1 | Si W/R=3 | Si W/R=5 | Résumés compressés stockés (octets) |','|---|---:|---:|---:|---:|']
for s in trial['scenarios']:
 a,c,w,_=s['phases'];saving=a['estimated']-w['estimated']
 def threshold(k):
  excess=c['estimated']-a['estimated']+k*c['writes']
  if excess==0:return 'aucun surcoût'
  return str(1+math.ceil(excess/saving)) if saving>0 else 'jamais'
 lines.append('| '+f"{s['clients']} / {s['programs']} / {s['histories']}"+' | '+' | '.join(threshold(k) for k in [1,3,5])+f" | {s['summaryBytes']} |")
lines += ['', 'Une consultation après chaque modification reconstruit le résumé et peut coûter plus cher que la référence. Un dossier vide peut ne jamais amortir la création. Une navigation à chaud déjà servie par le cache navigateur ne constitue pas une consultation serveur économisée. Il serait donc incorrect de garantir un coût inférieur pour tous les utilisateurs à partir des seuls accès avec cache présent.', '', '## CPU et mémoire du processus de test','', '| Clients / historiques | CPU référence ms | CPU création ms | CPU résumé ms (médiane) | RSS max observé référence / création / résumé (Mio) |','|---|---:|---:|---:|---|']
for s in trial['scenarios']:
 a,c,w,w2=s['phases'];lines.append(f"| {s['clients']} / {s['histories']} | {a['cpuMs']:.0f} | {c['cpuMs']:.0f} | {statistics.median([w['cpuMs'],w2['cpuMs']]):.0f} | {a['peakRssMiB']:.0f} / {c['peakRssMiB']:.0f} / {max(w['peakRssMiB'],w2['peakRssMiB']):.0f} |")
lines += ['', 'CPU et RSS concernent le processus Node du banc, qui contient le SDK, les routes et les fixtures. RSS est échantillonné toutes les 10 ms et dépend du GC et des scénarios précédents ; il ne mesure ni le pic exact ni le coût mémoire d’une instance Google. Le trafic réseau navigateur observe seulement les ressources terminées. Ni les entrées d’index facturées, ni la facture Firebase/Google ne sont observées par les émulateurs. Aucun service ou capacité supplémentaire n’est déployé.']
pathlib.Path('BYL_DASHBOARD_COACH_RESUMES_MESURES.md').write_text('\n'.join(lines)+'\n')
