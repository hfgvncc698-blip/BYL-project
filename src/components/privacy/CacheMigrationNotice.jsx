import {useTranslation} from 'react-i18next';
import React, {useEffect,useState,useSyncExternalStore} from 'react';
import {migrationSnapshot,subscribeMigration,detectLegacyCaches,startMigrationCoordination,discoverRecoverableDrafts,recoverLegacyDraft,cleanLegacyCaches,cleanupAvailable} from '../../utils/cacheMigration';

const messages = {
  detected:'Une ancienne sauvegarde a été détectée.', checking:'Vérification de votre compte et de vos droits.',
  recoverable:'Un brouillon peut être récupéré.', ambiguous:'Cette sauvegarde ne peut pas être récupérée automatiquement.',
  recovered:'Le brouillon a été récupéré sans publier le programme.', blocked:'Un autre onglet BYL est encore ouvert.',
  interrupted:'Le nettoyage a été interrompu. Les vérifications doivent être reprises.',
  recontaminated:'Une ancienne sauvegarde est réapparue. Le nettoyage reste incomplet.',
  'local-verified-incomplete':'Les zones autorisées ont été vérifiées. Le nettoyage global de cet appareil reste incomplet.',
  started:'Vérification et nettoyage en cours.', error:'La vérification est indisponible. Aucune récupération automatique.',
};
export default function CacheMigrationNotice() {
  const {t}=useTranslation();
  const [dismissed,setDismissed]=useState(false);
  const label=(key,fallback)=>t(`cacheMigration.${key}`,fallback);
  const state=useSyncExternalStore(subscribeMigration,migrationSnapshot,migrationSnapshot);
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[plan,setPlan]=useState('');
  useEffect(()=>{startMigrationCoordination();void detectLegacyCaches().catch(()=>{});},[]);
  const run=async fn=>{setBusy(true);setError('');try{await fn();}catch(e){setError(e.message==='migration-other-tab-open'?'blocked':'operationError');}finally{setBusy(false);}};
  if(dismissed)return null;
  if(!state.detected && ['idle','none'].includes(state.status))return null;
  return <section aria-label={label("title","Anciennes sauvegardes")} style={{padding:'12px',border:'1px solid #cbd5e0',margin:'8px',borderRadius:'8px'}}>
    <div style={{display:'flex',justifyContent:'space-between',gap:'16px',alignItems:'center'}}>
      <p role="status">{label(state.status,messages[state.status] || messages.detected)}</p>
      <button disabled={busy} onClick={()=>setDismissed(true)} style={{padding:'6px 12px',border:'1px solid #cbd5e0',borderRadius:'8px'}}>{label('later','Plus tard')}</button>
    </div>
    <p style={{fontSize:'14px',marginTop:'4px'}}>{label('explanation','Cet appareil contient des données d’une ancienne version de BYL. Vous pouvez vérifier si un brouillon de programme est récupérable, ou continuer normalement.')}</p>
    <details style={{marginTop:'8px'}}><summary style={{cursor:'pointer'}}>{label('options','Options de récupération')}</summary>
    {state.peers>0 && <p>{label('blocked',messages.blocked)}</p>}
    {error && <p role="alert">{label(error,messages[error])}</p>}
    <button disabled={busy} onClick={()=>run(discoverRecoverableDrafts)}>{label('check','Vérifier les possibilités de récupération')}</button>
    {state.candidates.map((candidate,index)=><button key={candidate.id} disabled={busy} onClick={()=>{
      if(window.confirm(label('confirmRecovery','Récupérer ce brouillon sur BYL sans publier le programme ?')))void run(()=>recoverLegacyDraft(candidate.id,{confirm:true}));
    }}>{label('recover','Récupérer le brouillon')} {index+1}</button>)}
    {cleanupAvailable() && <details><summary>{label('cleanup','Nettoyage contrôlé')}</summary>
      <p>{label('cleanupHelp','Le nettoyage de cet appareil nécessite votre confirmation et un plan préalablement qualifié.')}</p>
      <label>{label('plan','Référence du plan autorisé')} <input value={plan} onChange={e=>setPlan(e.target.value)}/></label>
      <button disabled={busy||!plan} onClick={()=>{if(window.confirm(label('confirmCleanup','Confirmer le nettoyage des seules zones qualifiées par ce plan ?')))void run(()=>cleanLegacyCaches(plan,{confirm:true}));}}>{label('clean','Confirmer le nettoyage')}</button>
      <button disabled={busy||!plan} onClick={()=>run(()=>cleanLegacyCaches(plan,{confirm:true,verifyOnly:true}))}>{label('verify','Vérifier les zones du plan')}</button>
    </details>}
  </details></section>;
}
