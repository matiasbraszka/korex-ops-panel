import { writeFileSync } from 'node:fs';
const q = async (sql, tries=4) => {
  for (let i=0;i<tries;i++){
    try {
      const r = await fetch(`https://api.supabase.com/v1/projects/cgdwieoxjoexzlfbxrfc/database/query`, {
        method:'POST', headers:{Authorization:`Bearer ${process.env.SB_PAT}`,'Content-Type':'application/json'},
        body: JSON.stringify({ query: sql }), signal: AbortSignal.timeout(60000) });
      return JSON.parse(await r.text());
    } catch(e){ if(i===tries-1) throw e; await new Promise(r=>setTimeout(r,1500*(i+1))); }
  }
};
const clients = Object.fromEntries((await q(`select id,name from clients`)).map(c=>[c.id,c.name]));
const folders = await q(`select id,name,parent_id,client_id from client_drive_nodes where node_type='folder'`);
const fById = Object.fromEntries(folders.map(f=>[f.id,f]));
const videos = await q(`select parent_id, client_id from client_drive_nodes where node_type='video'`);
const EDI = /(edici|editad|termina|\bfinal|listo|entrega|aprobad|export|render|montaj|master|\breel|\bcta\d?\b|anuncio|public|\bads?\b|\bv\d\b|version)/i;
const GRA = /(grabaci|bruto|\braw\b|crudo|sin ?editar|\btoma|apoyo|stock|material|b-?roll|footage|camara|celular|tarima|selfie|reunion|entrevista)/i;
const path = (f) => { let p=[], n=f, h=0; while(n && h<12){ p.unshift(n.name); n=fById[n.parent_id]; h++; } return p.join(' / '); };
function classify(f){ let n=f,h=0; while(n&&h<12){ if(EDI.test(n.name)) return 'edicion'; if(GRA.test(n.name)) return 'grabacion'; n=fById[n.parent_id]; h++; } return 'revisar'; }
const perFolder = {};
for (const v of videos){ const k=v.parent_id; (perFolder[k] ||= {n:0}); perFolder[k].n++; }
const rows = [];
for (const [fid,info] of Object.entries(perFolder)){ const f=fById[fid]; if(!f) continue;
  rows.push({ cliente: clients[f.client_id]||'(sin cliente)', carpeta: f.name, ruta: path(f), videos: info.n, tipo: classify(f) }); }
rows.sort((a,b)=> a.cliente.localeCompare(b.cliente) || b.videos-a.videos);
writeFileSync('folders_tmp.json', JSON.stringify(rows));
console.log('OK carpetas con videos:', rows.length, '| por tipo:', rows.reduce((a,r)=>{a[r.tipo]=(a[r.tipo]||0)+r.videos;return a;},{}));
