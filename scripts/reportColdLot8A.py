import json,pathlib
p=pathlib.Path('audits/lot8a')
pairs=[]
for suffix in ['','-calendar','-messages']:
 a=json.loads((p/('before'+suffix+'.json')).read_text())['samples'];b=json.loads((p/('after'+suffix+'.json')).read_text())['samples']
 for x,y in zip(a,b):
  assert (x['kind'],x['n'],x['h'])==(y['kind'],y['n'],y['h'])
  pairs.append((x,y))
def name(x):return f"{x['kind']} {x['n']}"+(f" / h{x['h']}" if x['h'] else '')+(' calendrier' if x.get('group')=='calendar' else '')
def fmt(x):return 'ND' if x is None else str(round(x,2))
def v(x,k):return x.get(k)
def pair(x,y,fn):return fmt(fn(x))+' → '+fmt(fn(y))
s=['# Lot 8A — mesures avant/après','', 'Mesures locales sur Chrome froid 1440 px, application Vite de développement et émulateurs. Un passage par cellule : variations de JIT, compilation et scheduling possibles. Historique h = nombre total de validations réparties entre programmes. Les ressources de développement ne représentent pas le bundle distribué.', '', '**Chargement complet : non démontré.** La stabilisation est 1,5 s sans nouveaux octets achevés, pas la fin de tous les flux. Les routes secondaires non montées peuvent retourner 404 ; les mesures restent partielles. ND = indisponible ou jalon non atteint. Les données principales sont signalées par les composants, le premier contenu utile par la présence de données synthétiques autorisées. Le squelette est mesuré séparément dans les JSON.', '', '## Temps, millisecondes','', '| Scénario | Premier contenu utile | Données principales | Stabilisation observée |','|---|---:|---:|---:|']
for x,y in pairs:s.append('| '+name(x)+' | '+' | '.join(pair(x,y,lambda r,k=k:r.get(k)) for k in ['firstUsefulMs','primaryMs','networkSettledMs'])+' |')
s+=['','## Coûts documentaires observés','', 'B = navigateur ; R = routes instrumentées ; L = documents de snapshots Admin hors HTTP. Ces colonnes sont séparées pour éviter de confondre SDK, HTTP, documents et facturation. La sonde générique backend partielle n’est pas ajoutée aux routes. Écritures = navigateur / backend après seed. Les erreurs et requêtes encore ouvertes ne sont pas converties en lectures nulles.', '', '| Scénario | SDK B | Documents B | Estimation B | Documents R | Estimation R | Documents L | Écritures B | Écritures backend |','|---|---:|---:|---:|---:|---:|---:|---:|---:|']
funcs=[lambda r:r.get('allBrowser',{}).get('sdkCalls'),lambda r:r.get('allBrowser',{}).get('documentsReturned'),lambda r:r.get('allBrowser',{}).get('estimatedReads'),lambda r:sum(t.get('documentsReturned',0) for t in r['http']) if 'http'in r else None,lambda r:sum(t.get('estimatedDocumentReads',0) for t in r['http']) if 'http'in r else None,lambda r:sum(t.get('documentsReturned',0) for t in r['listeners']) if 'listeners'in r else None,lambda r:r.get('allBrowser',{}).get('confirmedWrites'),lambda r:r.get('backend',{}).get('writes')]
for x,y in pairs:s.append('| '+name(x)+' | '+' | '.join(pair(x,y,f) for f in funcs)+' |')
s+=['','## Ressources et API','', 'Réseau = octets CDP achevés, incluant les modules Vite. Mémoire = heap JS utilisé, pas la mémoire totale de Chrome. JS = ScriptDuration CDP. Montages = instances function/class engagées relevées par la sonde, pas tous les éléments DOM.', '', '| Scénario | API lancées | Réponses API octets | Réseau Mio | Heap Mio | JS ms | Montages |','|---|---:|---:|---:|---:|---:|---:|']
funcs=[lambda r:r.get('api',{}).get('requests'),lambda r:r.get('api',{}).get('responseBytes'),lambda r:r['networkBytes']/1048576 if r.get('networkBytes') is not None else None,lambda r:r['heap']['usedSize']/1048576 if r.get('heap') else None,lambda r:r['execution']['ScriptDuration']*1000 if r.get('execution') else None,lambda r:r.get('mounts')]
for x,y in pairs:s.append('| '+name(x)+' | '+' | '.join(pair(x,y,f) for f in funcs)+' |')
s+=['','## Calendriers et limites observées','', '| Calendrier | Coque calendrier ms | Premier événement visible ms |','|---|---:|---:|']
for x,y in pairs:
 if x.get('group')=='calendar':s.append('| '+name(x)+' | '+pair(x,y,lambda r:r.get('calendarShellMs'))+' | '+pair(x,y,lambda r:r.get('calendarEventMs'))+' |')
s+=['','## Statuts, erreurs et vérification','']
for x,y in pairs:
 s.append(f"- {name(x)} : statuts API {x.get('api',{}).get('statuses')} → {y.get('api',{}).get('statuses')}; échecs SDK {x.get('allBrowser',{}).get('failures')} → {y.get('allBrowser',{}).get('failures')}. Échec de collecte : {x.get('failure','aucun')} → {y.get('failure','aucun')}.")
s+=['','Les temps serveur par route sont conservés dans `http[].durationMs`, les temps de toutes les réponses dans `api.durationMs`. La couverture des sondes est décrite dans FIREBASE. Aucun chiffre ne représente une économie réelle de facture Firebase. Les objectifs de 1/2 s ne sont pas garantis, notamment pour Coach 500 et les historiques Client volumineux. Les parcours à chaud ne sont pas une seconde matrice de benchmark : le retour Clients et les tests de cache vérifient le comportement, sans extrapoler un percentile.']
pathlib.Path('BYL_LOT8A_AVANT_APRES.md').write_text('\n'.join(s)+'\n')
