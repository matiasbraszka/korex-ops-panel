import { writeFileSync, appendFileSync } from 'node:fs';
const LOG='sync_progress.log';
const q = async (sql) => { const r=await fetch(`https://api.supabase.com/v1/projects/cgdwieoxjoexzlfbxrfc/database/query`,{method:'POST',headers:{Authorization:`Bearer ${process.env.SB_PAT}`,'Content-Type':'application/json'},body:JSON.stringify({query:sql}),signal:AbortSignal.timeout(60000)}); return JSON.parse(await r.text()); };
const sp = await q(`select value from app_settings where key='soporte_config'`);
const secret = sp[0]?.value?.cron_secret;
const clients = await q(`select distinct c.id, c.name from clients c join client_drive_nodes n on n.client_id=c.id order by c.name`);
writeFileSync(LOG, `Clientes a sincronizar: ${clients.length}\n`);
let ok=0, fail=0;
for (const c of clients) {
  try {
    const r = await fetch(`https://cgdwieoxjoexzlfbxrfc.supabase.co/functions/v1/drive-sync?client_id=${encodeURIComponent(c.id)}`,{method:'POST',headers:{'Content-Type':'application/json','x-cron-secret':secret},body:'{}',signal:AbortSignal.timeout(300000)});
    const t = await r.text(); ok++;
    appendFileSync(LOG, `OK ${c.name} — ${t.slice(0,120)}\n`);
  } catch(e){ fail++; appendFileSync(LOG, `FAIL ${c.name} — ${e.message}\n`); }
}
const chk = await q(`select count(*) total, count(size_bytes) con_peso from client_drive_nodes where node_type='video'`);
appendFileSync(LOG, `\nLISTO. ok=${ok} fail=${fail} | videos ${chk[0].con_peso}/${chk[0].total} con peso\n`);
