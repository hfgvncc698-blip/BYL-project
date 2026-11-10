// Instrument only the isolated Vite copy, with aggregate counts and no payloads.
const fs=require('node:fs'), path=require('node:path');
module.exports=function instrument(folder) {
  const filename=rel=>path.join(folder,rel);
  const pages=['components/Clientdashboard.jsx','components/ProgramView.jsx','components/AutoProgramPreview.jsx','pages/StatisticsPageClient.jsx','components/SessionPlayer.jsx','utils/clientProgramFeed.js','hooks/useProgrammeDocument.js','utils/clientResolver.js','utils/firestoreAccessDiagnostics.js'];
  for(const rel of pages){
    const file=filename('src/'+rel);
    if(!fs.existsSync(file))continue;
    let source=fs.readFileSync(file,'utf8').replaceAll(/from ['"]firebase\/firestore['"]/g,"from '/progressSdk.js'");
    const marker=rel.includes('Clientdashboard') ? ['const [loadingPremium','useEffect(()=>{window.pageResult={page:"dashboard",loading,n:programmes.length,done:programmes.reduce((n,p)=>n+p._doneRaw,0),rows:programmes.map(p=>[p.id,p._doneRaw,p._resumePct,p._total,p._rating,p.nomProgramme])};},[programmes,loading]);']
      :rel.includes('SessionPlayer') ? ['const [programLoadError','useEffect(()=>{window.pageResult={page:"player",loaded:!!programData,n:completionHistory.length,loading:historyLoading};},[programData,completionHistory,historyLoading]);']
      :rel.includes('AutoProgramPreview') ? ['const [tabIndex','useEffect(()=>{window.pageResult={page:"auto",loaded:!!prog,id:prog?.id};},[prog]);']
      :rel.includes('StatisticsPageClient') ? ['const currentProgram=','useEffect(()=>{window.pageResult={page:"stats",n:programmes.length};},[programmes]);']
      :rel.includes('ProgramView') ? ['const [tabIndex','useEffect(()=>{window.pageResult={page:"view",loaded:!!prog,n:completionHistory.length};},[prog,completionHistory]);']:null;
    if(marker){if(!source.includes(marker[0]))throw Error('missing render marker');source=source.replace(marker[0],marker[1]+'\n  '+marker[0]);}
    fs.writeFileSync(file,source);
  }
  fs.writeFileSync(filename('progressSdk.js'),`
    export * from 'firebase/firestore';import * as sdk from 'firebase/firestore';
    function row(ref){let type=(ref.path || ref._query?.path?.canonicalString() || '').split('/').pop();
      if(!['sessionsEffectuees','programmes','difficulté_notes','difficulte_notes','historique_modifications'].includes(type))type='other';
      return (window.probe ||= {})[type] ||= {reads:0,listen:0,docs:0,changes:0,estimate:0};}
    async function point(ref,read){
      row(ref).reads++;const snap=await read(ref);const r=row(ref);r.docs+=Number(snap.exists());r.estimate+=snap.metadata.fromCache?0:1;return snap;
    }
    export const getDoc=ref=>point(ref,sdk.getDoc);
    export const getDocFromServer=ref=>point(ref,sdk.getDocFromServer);
    export async function getDocs(ref){row(ref).reads++;const snap=await sdk.getDocs(ref);const r=row(ref);r.docs+=snap.size;r.estimate+=snap.metadata.fromCache?0:Math.max(1,snap.size);return snap;}
    export function onSnapshot(ref,...args){const i=args.findIndex(fn=>typeof fn==='function'),next=args[i];let first=true;row(ref).listen++;
      args[i]=snap=>{const r=row(ref),size=snap.size ?? Number(snap.exists());r.docs+=size;
        if(!snap.metadata.fromCache && !snap.metadata.hasPendingWrites){const d=first?size:(snap.docChanges?.().length ?? 1);r.changes+=d;r.estimate+=first?Math.max(1,d):d;first=false;}next(snap);};return sdk.onSnapshot(ref,...args);}
  `);
};
