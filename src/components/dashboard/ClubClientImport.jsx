import React, { useEffect, useRef, useState } from 'react';
import { Box, Button, Checkbox, Flex, FormControl, FormLabel, Heading, Input, Modal, ModalOverlay, ModalContent, ModalHeader, ModalCloseButton, ModalBody, ModalFooter, Select, SimpleGrid, Stack, Text, Badge } from '@chakra-ui/react';
import { useTranslation } from 'react-i18next';
import { clubText, clubLocale } from '../../i18n/clubText';
import { apiFetch } from '../../utils/api';
import { readClientFile, normalizeImportDate } from '../../utils/clientImportFile';
const fields=[['firstName','Prénom',['prenom','firstname','first name']],['lastName','Nom',['nom','lastname','last name','surname']],['email','E-mail',['email','e-mail','mail','adresse mail']],['phone','Téléphone',['telephone','phone','tel','mobile']],['birthDate','Date de naissance',['date de naissance','birthdate','date naissance','dob']],['coachUid','Pro référent',['referent','coach','pro referent','professionnel']],['packName','Nom du pack',['pack','nom du pack','packname']],['quantity','Nombre de séances',['nombre de seances','quantity','seances achetees']],['remaining','Séances restantes',['seances restantes','remaining','solde']],['packType','Type de séances',['type de seances','packtype']],['packStart','Début de validité du pack',['debut de validite','debut de validite du pack','packstart']],['packEnd','Expiration du pack (facultative)',['fin de validite','expiration du pack (facultative)','packend']],['subscriptionName','Nom de l’abonnement',['nom de l abonnement','abonnement','subscriptionname','subscription name']],['subscriptionStart','Début de l’abonnement',['debut de l abonnement','subscriptionstart','subscription start']],['subscriptionEnd','Fin de l’abonnement',['fin de l abonnement','subscriptionend','subscription end']]];
const normalized=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
export default function ClubClientImport({onClose,onImported,coaches=[]}) {
  useTranslation();
  const [notice,setNotice]=useState('');
  const [headerIndex,setHeaderIndex]=useState(0);
  const [file,setFile]=useState(null),[mapping,setMapping]=useState({}),[defaultCoach,setDefaultCoach]=useState(''),[preview,setPreview]=useState(null),[choices,setChoices]=useState({}),[history,setHistory]=useState([]),[busy,setBusy]=useState(false),[error,setError]=useState(''),[results,setResults]=useState([]),[confirmed,setConfirmed]=useState(false),[pendingAction,setPendingAction]=useState(null);
  const missingFields=fields.filter(([key])=>['firstName','lastName'].includes(key)&&!(mapping[key]>=0));
  function chooseHeader(data,index){
    const rawRows=data.rawRows||[data.headers,...data.rows];
    const headers=rawRows[index];
    setHeaderIndex(index);setFile({...data,rawRows,headers,rows:rawRows.slice(index+1)});
    setMapping(Object.fromEntries(fields.map(([key,,aliases])=>[key,headers.findIndex(h=>aliases.includes(normalized(h)))])));
  }
  const input=useRef(null), batch=useRef(crypto.randomUUID()), alive=useRef(true);
  const refresh=()=>apiFetch('/clubs/client-imports').then(data=>{if(alive.current)setHistory(data.imports);});
  useEffect(()=>{alive.current=true;refresh().catch(()=>setError(clubText('Chargement impossible.')));return()=>{alive.current=false;};},[]);
  const fail=e=>setError(clubText(e?.data?.error||e.message||'Enregistrement impossible.'));
  async function read(selected){
    setBusy(true);setError('');setPreview(null);setResults([]);setConfirmed(false);setChoices({});
    try {
      const data=await readClientFile(selected);
      const candidates=(data.rawRows||[data.headers,...data.rows]).slice(0,10);
      const scores=candidates.map(row=>fields.filter(([,,aliases])=>row.some(h=>aliases.includes(normalized(h)))).length);
      const best=scores.indexOf(Math.max(...scores));
      chooseHeader({...data,name:selected.name},scores[best]>=2?best:0);
      batch.current=crypto.randomUUID();
    }catch(e){setFile(null);fail(e);}finally{setBusy(false);}
  }
  async function check(){
    setBusy(true);setError('');setResults([]);setConfirmed(false);
    try {
      const rows=file.rows.map(cells=>{
        const row=Object.fromEntries(fields.map(([key])=>[key,mapping[key]>=0?cells[mapping[key]]:'']));
        row.coachUid=row.coachUid?coaches.find(c=>[c.uid,c.email,[c.firstName,c.lastName].filter(Boolean).join(' '),c.displayName,c.name].some(v=>v&&normalized(v)===normalized(row.coachUid)))?.uid||row.coachUid:defaultCoach;
        for(const key of ['birthDate','packStart','packEnd','subscriptionStart','subscriptionEnd'])row[key]=normalizeImportDate(row[key],file.date1904);
        if(row.packName){row.packType=['group','collectif','collectifs','cours collectifs'].includes(normalized(row.packType))?'group':row.packType?(['individual','individuel','coaching individuel'].includes(normalized(row.packType))?'individual':row.packType):'individual';row.packStart ||= new Date().toISOString().slice(0,10);}
        return row;
      });
      const data=await apiFetch('/clubs/client-imports/preview',{method:'POST',body:JSON.stringify({rows})});setPreview(data.rows);setChoices({});batch.current=crypto.randomUUID();
    }catch(e){fail(e);}finally{setBusy(false);}
  }
  async function commit(){
    setBusy(true);setError('');setResults([]);
    const output=[];
    for(const item of preview){
      if(item.status!=='new'&&!(item.status==='duplicate'&&choices[item.index]))continue;
      try {const r=await apiFetch('/clubs/client-imports/row',{method:'POST',body:JSON.stringify({batchId:batch.current,index:item.index,row:item.row,fileName:file.name,updateId:choices[item.index]||''})});output.push({index:item.index,...r});}
      catch(e){output.push({index:item.index,status:'failed',error:e?.data?.error||e.message});}
      setResults([...output]);
    }
    setBusy(false);setConfirmed(false);await refresh().catch(()=>{});onImported?.();
  }
  async function act(){
    const action=pendingAction;setPendingAction(null);setBusy(true);setError('');setNotice('');
    try{
      if(action.kind==='undo')await apiFetch(`/clubs/client-imports/${action.id}/undo`,{method:'POST'});
      else {
        const data=await apiFetch(`/clubs/client-imports/${action.id}/rows`), failures=[];
        for(const row of data.rows.filter(r=>r.status==='created'&&r.invitation!=='sent')){
          try{const response=await apiFetch(`/clubs/client-imports/${action.id}/invite/${row.index}`,{method:'POST'});if(response.status==='failed')failures.push(row.index+1);}catch{failures.push(row.index+1);}
        }
        if(failures.length)setError(clubText('Invitations à vérifier : {{rows}}',{rows:failures.join(', ')}));
        else setNotice(clubText('Invitations envoyées ou déjà demandées.'));
      }
      await refresh();onImported?.();
    }catch(e){fail(e);}finally{setBusy(false);}
  }
  function template(){
    const content='\uFEFFPrénom;Nom;E-mail;Téléphone;Date de naissance;Pro référent;Nom du pack;Nombre de séances;Séances restantes;Type de séances;Début de validité du pack;Expiration du pack (facultative);Nom de l’abonnement;Début de l’abonnement;Fin de l’abonnement\n';
    const link=document.createElement('a'),url=URL.createObjectURL(new Blob([content],{type:'text/csv;charset=utf-8'}));link.href=url;link.download='modele-clients.csv';link.click();URL.revokeObjectURL(url);
  }
  const ready=preview?.filter(r=>r.status==='new'||r.status==='duplicate'&&choices[r.index]).length||0;
  return <Modal isOpen onClose={()=>!busy&&onClose()} size="3xl" scrollBehavior="inside" closeOnOverlayClick={!busy}>
    <ModalOverlay/><ModalContent mx={3}><ModalHeader>{clubText('Importer mes clients')}</ModalHeader><ModalCloseButton isDisabled={busy}/>
    <ModalBody><Stack spacing={4}>
      <Text fontSize="sm">{clubText('Excel (.xlsx) ou CSV · 100 clients par lot · 5 Mo maximum. Seule la première feuille est lue.')}</Text>
      <Box borderWidth="2px" borderStyle="dashed" borderRadius="xl" p={5} textAlign="center" onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();if(!busy)read(e.dataTransfer.files[0]);}}>
        <Input ref={input} type="file" accept=".csv,.xlsx" display="none" onChange={e=>{read(e.target.files[0]);e.target.value='';}}/>
        <Button isDisabled={busy} onClick={()=>input.current.click()}>{clubText('Choisir ou déposer un fichier')}</Button>
        <Text mt={2} fontSize="sm" overflowWrap="anywhere">{file?.name}{file?.sheet?` · ${file.sheet}`:''}</Text>
      </Box>
      <Button size="sm" variant="link" alignSelf="start" onClick={template}>{clubText('Télécharger le modèle CSV')}</Button>
      {file&&!preview&&<><Heading size="sm">{clubText('Associer les colonnes')}</Heading><Text fontSize="sm">{clubText('Abonnement : renseignez son nom, son début et sa fin. Les règlements ne sont pas repris automatiquement.')}</Text>
      <FormControl><FormLabel>{clubText('Ligne des intitulés de colonnes')}</FormLabel><Select isDisabled={busy} value={headerIndex} onChange={e=>chooseHeader(file,Number(e.target.value))}>{(file.rawRows||[file.headers,...file.rows]).slice(0,10).map((row,i)=><option key={i} value={i}>{i+1} · {row.filter(Boolean).join(' · ').slice(0,120)}</option>)}</Select></FormControl><SimpleGrid columns={{base:1,md:2}} gap={3}>
        {fields.map(([key,label])=><FormControl key={key} isRequired={['firstName','lastName'].includes(key)}><FormLabel fontSize="sm">{clubText(label)}</FormLabel><Select isDisabled={busy} value={mapping[key]} onChange={e=>setMapping({...mapping,[key]:Number(e.target.value)})}><option value={-1}>{clubText('Ne pas importer')}</option>{file.headers.map((header,i)=><option key={i} value={i}>{header||`#${i+1}`}</option>)}</Select>{mapping[key]>=0&&<Text fontSize="xs" mt={1} overflowWrap="anywhere">{file.rows[0][mapping[key]]}</Text>}</FormControl>)}
      </SimpleGrid><FormControl><FormLabel>{clubText('Référent par défaut')}</FormLabel><Select value={defaultCoach} onChange={e=>setDefaultCoach(e.target.value)}><option value="">{clubText('Non attribué')}</option>{coaches.map(c=><option key={c.uid} value={c.uid}>{[c.firstName,c.lastName].filter(Boolean).join(' ')||c.email}</option>)}</Select></FormControl>
        <Text fontSize="xs">{clubText('Dates : AAAA-MM-JJ ou JJ/MM/AAAA. Packs : individual ou group. Aucun e-mail ne sera envoyé pendant l’import.')}</Text>
        {missingFields.length>0&&<Text role="status" color="orange.700">{clubText('Associez les colonnes obligatoires pour continuer : {{fields}}.',{fields:missingFields.map(([,label])=>clubText(label)).join(', ')})}</Text>}
        <Button isLoading={busy} isDisabled={missingFields.length>0} onClick={check}>{clubText('Vérifier le fichier')}</Button></>}
      {preview&&<><Heading size="sm">{clubText('Aperçu avant importation')}</Heading><Text>{clubText('{{count}} fiches prêtes à importer',{count:ready})}</Text>
        <Stack maxH="350px" overflowY="auto">{preview.map(item=><Box key={item.index} borderWidth="1px" borderRadius="lg" p={3}><Flex justify="space-between" gap={2}><Text fontWeight="bold">{item.index+2} · {item.row?[item.row.firstName,item.row.lastName].join(' '):clubText('Ligne invalide')}</Text><Badge>{clubText(({new:'Nouveau',duplicate:'Doublon','duplicate-file':'Doublon dans le fichier',invalid:'À corriger'})[item.status])}</Badge></Flex>{item.row?.subscriptionName&&<Text fontSize="sm">{clubText('Nom de l’abonnement')} : {item.row.subscriptionName} · {item.row.subscriptionStart} → {item.row.subscriptionEnd}</Text>}
          <Text fontSize="sm">{item.row?.email}</Text>{item.row?.quantity&&<Text fontSize="sm">{item.row.packName} · {item.row.remaining}/{item.row.quantity} · {clubText('Solde repris de l’ancien outil')}</Text>}
          {item.error&&<Text color="red.500" fontSize="sm">{clubText(item.error)}</Text>}
          {item.status==='duplicate'&&item.matches.length===1&&<Checkbox mt={2} isDisabled={busy} isChecked={!!choices[item.index]} onChange={e=>setChoices({...choices,[item.index]:e.target.checked?item.matches[0].id:''})}>{clubText('Mettre à jour ce dossier (sinon ignorer)')}</Checkbox>}
        </Box>)}</Stack>
        <Text fontSize="xs">{clubText('Les lignes invalides et les doublons non sélectionnés seront ignorés. Les comptes déjà liés et leurs packs ne seront pas écrasés.')}</Text>
        <Checkbox isDisabled={busy} isChecked={confirmed} onChange={e=>setConfirmed(e.target.checked)}>{clubText('J’ai vérifié les données et je confirme leur importation.')}</Checkbox>
        <Flex gap={2}><Button isDisabled={busy} variant="outline" onClick={()=>{setPreview(null);setResults([]);}}>{clubText('Modifier les colonnes')}</Button><Button isLoading={busy} isDisabled={!confirmed||!ready} onClick={commit}>{clubText('Confirmer l’import')}</Button></Flex>
      </>}
      {!!results.length&&<Box role="status"><Text fontWeight="bold">{clubText('Résultat de l’import')}</Text>{results.map(r=><Text key={r.index} fontSize="sm">{r.index+2} · {clubText(({created:'Créé',updated:'Mis à jour',skipped:'Ignoré',failed:'Échec'})[r.status])}{r.error?` · ${clubText(r.error)}`:''}</Text>)}</Box>}
      {notice&&<Text role="status" color="green.600">{notice}</Text>}
      {error&&<Text role="alert" color="red.500">{error}</Text>}
      <Heading size="sm">{clubText('Historique des imports')}</Heading>
      {history.map(job=><Box key={job.id} borderWidth="1px" borderRadius="lg" p={3}><Text overflowWrap="anywhere" fontWeight="bold">{job.fileName}</Text><Text fontSize="sm">{new Date(job.createdAt).toLocaleString(clubLocale())} · {job.count} · {job.undone?clubText('Annulé'):clubText('Importé')}</Text>{!job.undone&&<Flex gap={2} mt={2} wrap="wrap"><Button size="sm" isDisabled={busy} onClick={()=>setPendingAction({kind:'invite',id:job.id})}>{clubText('Inviter les clients importés')}</Button><Button size="sm" variant="outline" isDisabled={busy} onClick={()=>setPendingAction({kind:'undo',id:job.id})}>{clubText('Annuler cet import')}</Button></Flex>}</Box>)}
      {pendingAction&&<Box borderWidth="1px" p={3} borderRadius="lg"><Text>{pendingAction.kind==='invite'?clubText('Envoyer les invitations aux nouveaux clients de ce lot ? Les comptes existants devront être rattachés séparément.'):clubText('Annuler ce lot ? Seules les fiches sans modification, invitation ni utilisation peuvent être restaurées ou retirées.')}</Text><Flex mt={2} gap={2}><Button onClick={act}>{clubText('Confirmer')}</Button><Button variant="ghost" onClick={()=>setPendingAction(null)}>{clubText('Retour')}</Button></Flex></Box>}
    </Stack></ModalBody><ModalFooter><Button isDisabled={busy} onClick={onClose}>{clubText('Fermer')}</Button></ModalFooter></ModalContent>
  </Modal>;
}
