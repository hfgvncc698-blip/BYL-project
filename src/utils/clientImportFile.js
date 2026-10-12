// Reading stays in the browser: only mapped, reviewed fields go to the server.
export function parseCSV(text) {
  text=text.replace(/^\uFEFF/,'');
  const first=text.split(/\r?\n/)[0];
  const delimiter=[';',',','\t'].sort((a,b)=>first.split(b).length-first.split(a).length)[0];
  const rows=[]; let row=[],cell='',quoted=false;
  for(let i=0;i<text.length;i++) {
    const c=text[i];
    if(c==='"') {if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}
    else if(c===delimiter&&!quoted){row.push(cell);cell='';}
    else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);rows.push(row);row=[];cell='';}
    else cell+=c;
  }
  if(quoted)throw new Error('Import : fichier CSV invalide.');
  row.push(cell);rows.push(row);
  return cleanRows(rows);
}
function cleanRows(rows){
  const filtered=rows.filter(r=>r.some(c=>String(c).trim()));
  if(filtered.length<2||filtered.length>101||filtered.some(r=>r.length>80))throw new Error('Import : de 1 à 100 clients et 80 colonnes maximum.');
  return {rawRows:filtered.map(r=>Array.from(r,c=>String(c??''))),headers:filtered[0].map(String),rows:filtered.slice(1).map(r=>filtered[0].map((_,i)=>String(r[i]??'')))};
}
export async function readClientFile(file){
  if(!file||file.size>5*1024*1024)throw new Error('Import : fichier limité à 5 Mo.');
  if(/\.csv$/i.test(file.name))return parseCSV(await file.text());
  if(!/\.xlsx$/i.test(file.name))throw new Error('Import : utilisez un fichier CSV ou XLSX.');
  const {unzipSync,strFromU8}=await import('fflate');
  let total=0, isNumbers=false;
  const files=unzipSync(new Uint8Array(await file.arrayBuffer()),{filter:entry=>{
    if(/^Index\/.*\.iwa$/.test(entry.name))isNumbers=true;
    if(entry.originalSize>8*1024*1024||(total+=entry.originalSize)>20*1024*1024)throw new Error('Import : fichier trop volumineux.');
    return /\.xml$|\.rels$/.test(entry.name);
  }});
  if(isNumbers)throw new Error('Import : ce fichier est au format Numbers. Dans Numbers, utilisez Fichier > Exporter vers > Excel, puis sélectionnez le fichier exporté.');
  const xml=path=>{if(!files[path])throw new Error('Import : classeur invalide.');const d=new DOMParser().parseFromString(strFromU8(files[path]),'application/xml');if(d.querySelector('parsererror'))throw new Error('Import : classeur invalide.');return d;};
  // Spreadsheet exporters may use any XML namespace prefix (not necessarily r:).
  const elements=(node,name)=>Array.from(node.getElementsByTagNameNS('*',name));
  const workbook=xml('xl/workbook.xml'),sheet=elements(workbook,'sheet')[0];
  const relationshipId=Array.from(sheet?.attributes||[]).find(a=>a.localName==='id')?.value;
  const relation=elements(xml('xl/_rels/workbook.xml.rels'),'Relationship').find(r=>r.getAttribute('Id')===relationshipId);
  const target=relation?.getAttribute('Target')||'';
  if(!target||relation.getAttribute('TargetMode')==='External'||/^[a-z]+:/i.test(target)||target.includes('\\'))throw new Error('Import : classeur invalide.');
  // Resolve package-relative paths, including harmless ./ and ../ segments.
  const parts=[];
  for(const part of (target.startsWith('/')?target.slice(1):'xl/'+target).split('/')) {
    if(!part||part==='.')continue;
    if(part==='..'){if(!parts.length)throw new Error('Import : classeur invalide.');parts.pop();}
    else parts.push(part);
  }
  const path=parts.join('/');
  const strings=files['xl/sharedStrings.xml']?elements(xml('xl/sharedStrings.xml'),'si').map(n=>elements(n,'t').map(t=>t.textContent).join('')):[];
  const rows=elements(xml(path),'row').map(r=>{
    const cells=[];
    for(const c of elements(r,'c')) {
      const letters=(c.getAttribute('r')||'').match(/^[A-Z]+/)?.[0]||'A';let index=0;for(const l of letters)index=index*26+l.charCodeAt(0)-64;
      if(index>80)throw new Error('Import : de 1 à 100 clients et 80 colonnes maximum.');
      // Do not execute formulas or silently import their stale cached results.
      if(elements(c,'f').length)throw new Error('Import : remplacez les formules par leurs valeurs.');
      const raw=elements(c,'v')[0]?.textContent||'';
      cells[index-1]=c.getAttribute('t')==='s'?strings[Number(raw)]||'':c.getAttribute('t')==='inlineStr'?c.textContent:raw;
    }return cells;
  });
  return {...cleanRows(rows),sheet:sheet.getAttribute('name'),date1904:elements(workbook,'workbookPr')[0]?.getAttribute('date1904')==='1'};
}
export function normalizeImportDate(value,date1904=false){
  const raw=String(value||'').trim();if(!raw)return '';
  if(/^\d{5}(\.0+)?$/.test(raw))return new Date((Number(raw)-(date1904?24107:25569))*86400000).toISOString().slice(0,10);
  const match=raw.match(/^(\d{2})[/.](\d{2})[/.](\d{4})$/);return match?`${match[3]}-${match[2]}-${match[1]}`:raw;
}
