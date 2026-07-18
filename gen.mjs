import { writeFileSync } from 'node:fs';
const q = async (sql, tries=4) => { for(let i=0;i<tries;i++){ try{
  const r=await fetch(`https://api.supabase.com/v1/projects/cgdwieoxjoexzlfbxrfc/database/query`,{method:'POST',headers:{Authorization:`Bearer ${process.env.SB_PAT}`,'Content-Type':'application/json'},body:JSON.stringify({query:sql}),signal:AbortSignal.timeout(60000)});
  return JSON.parse(await r.text()); }catch(e){ if(i===tries-1)throw e; await new Promise(r=>setTimeout(r,1500*(i+1))); } } };
const clients=Object.fromEntries((await q(`select id,name from clients`)).map(c=>[c.id,c.name]));
const folders=await q(`select id,name,parent_id,client_id from client_drive_nodes where node_type='folder'`);
const fById=Object.fromEntries(folders.map(f=>[f.id,f]));
const videos=await q(`select parent_id,client_id from client_drive_nodes where node_type='video'`);
const EDI=/(edici|editad|termina|\bfinal|listo|entrega|aprobad|export|render|montaj|master|\breel|\bcta\d?\b|ganador|funcionaron|version|\bv\d\b|angulo)/i;
const GRA=/(grabaci|bruto|\braw\b|crudo|sin ?editar|\btoma|apoyo|stock|material|b-?roll|footage|descartad|por editar)/i;
const TEST=/testimoni/i;
const path=(f)=>{let p=[],n=f,h=0;while(n&&h<14){p.unshift(n.name);n=fById[n.parent_id];h++;}return p.join(' / ');};
function tipo(f){let n=f,h=0;while(n&&h<14){ if(TEST.test(n.name))return 'testimonio'; if(EDI.test(n.name))return 'edicion'; if(GRA.test(n.name))return 'grabacion'; n=fById[n.parent_id];h++;} return 'revisar';}
const ACC={edicion:'Conservar → al sistema',testimonio:'Conservar (testimonios)',grabacion:'Candidata a borrar',revisar:'Revisar a mano'};
const perFolder={}; for(const v of videos){(perFolder[v.parent_id]||={n:0}).n++;}
const rows=[]; for(const [fid,info] of Object.entries(perFolder)){const f=fById[fid]; if(!f)continue; const t=tipo(f); rows.push({cliente:clients[f.client_id]||'(sin cliente)',carpeta:f.name,ruta:path(f),videos:info.n,tipo:t,accion:ACC[t]});}
rows.sort((a,b)=>a.cliente.localeCompare(b.cliente)||b.videos-a.videos);
writeFileSync(process.env.OUT, JSON.stringify(rows));
const byT=rows.reduce((a,r)=>{a[r.tipo]=(a[r.tipo]||0)+r.videos;return a;},{});
console.log('carpetas:',rows.length,'| videos por tipo:',byT, '| total videos:', rows.reduce((s,r)=>s+r.videos,0));
