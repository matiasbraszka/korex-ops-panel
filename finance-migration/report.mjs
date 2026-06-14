// Reporte de impacto: corre el motor con la REGLA CORRECTA y compara contra el
// Sheet. Las columnas "limpias" deben seguir matcheando; las diferencias son las
// inconsistencias del Sheet (doble conteo, AC no restado, filas borradas).
import fs from 'node:fs';
import { buildAcuerdos, runLedger, num } from './engine.mjs';

const D = 'C:/Users/Mati Braska/Documents/claude-code/';
const ing = JSON.parse(fs.readFileSync(D + 'fx_ingresos.json', 'utf8'));
const ac = JSON.parse(fs.readFileSync(D + 'fx_acuerdos.json', 'utf8'));
const acuerdos = buildAcuerdos(ac.derecho.rows, ac.izquierdo.rows);

const I = { B: 1, E: 4, F: 5, H: 7, N: 13, O: 14, P: 15, V: 21, W: 22, X: 23, Y: 24, Z: 25, AA: 26, AC: 28 };
const active = ing.rows.filter(r => { const v = r.v; return (v[I.H] && String(v[I.H]).trim()) || num(v[I.E]) || (v[I.N] && String(v[I.N]).trim()); });
const incomes = active.map(r => ({ row: r.row, fecha: r.v[I.B], E: r.v[I.E], H: r.v[I.H], N: r.v[I.N], O: r.v[I.O], P: r.v[I.P] }));
const res = runLedger(incomes, acuerdos);

// --- match de columnas limpias ---
const clean = ['W', 'X', 'Z', 'AA'];
const cs = {}; clean.forEach(c => cs[c] = { ok: 0, bad: 0 });
active.forEach((r, i) => clean.forEach(c => { if (Math.abs(num(res[i][c]) - num(r.v[I[c]])) <= 0.02) cs[c].ok++; else cs[c].bad++; }));
console.log('=== Columnas limpias (motor vs Sheet) ===');
clean.forEach(c => console.log('  ' + c.padEnd(3) + ' ' + cs[c].ok + ' ok / ' + cs[c].bad + ' dif'));

// --- impacto en F (ingreso real Korex) ---
let sheetF = 0, engineF = 0;
const diffs = [];
active.forEach((r, i) => {
  const v = r.v, sF = num(v[I.F]), eF = num(res[i].F);
  sheetF += sF; engineF += eF;
  if (Math.abs(sF - eF) > 0.02) {
    const sY = num(v[I.Y]), sAC = num(v[I.AC]);
    let motivo;
    if (sY > 0.005 && sAC > 0.005) motivo = 'Sheet contó afiliado DOBLE (Y+AC)';
    else if (String(v[I.V] || '').trim() === '' && String(v[I.H] || '').toUpperCase().includes('CRM')) motivo = 'Sheet tenía reparto BORRADO';
    else if (Math.abs((num(v[I.E]) - (num(v[I.W]) + num(v[I.X]) + sY + num(v[I.Z]) + num(v[I.AA]))) - sF) < 0.02 && sAC > 0.005) motivo = 'Sheet NO restó el reservado (AC)';
    else motivo = 'otra (revisar)';
    diffs.push({ row: r.row, cli: v[I.N], H: v[I.H], E: num(v[I.E]), sheetF: sF, engineF: eF, delta: eF - sF, motivo });
  }
});

console.log('\n=== Impacto en el ingreso real de Korex (F) ===');
console.log('  Total segun Sheet : US$ ' + sheetF.toFixed(2));
console.log('  Total segun motor : US$ ' + engineF.toFixed(2));
console.log('  Diferencia neta   : US$ ' + (engineF - sheetF).toFixed(2) + '  (positivo = Korex gano mas de lo que decia el Sheet)');
console.log('  Filas con diferencia: ' + diffs.length);

const porMotivo = {};
diffs.forEach(d => { porMotivo[d.motivo] = porMotivo[d.motivo] || { n: 0, delta: 0 }; porMotivo[d.motivo].n++; porMotivo[d.motivo].delta += d.delta; });
console.log('\n=== Diferencias por motivo ===');
Object.entries(porMotivo).sort((a, b) => b[1].n - a[1].n).forEach(([m, o]) => console.log('  ' + String(o.n).padStart(3) + ' filas | delta US$ ' + o.delta.toFixed(2).padStart(10) + ' | ' + m));

console.log('\n=== Primeras 15 filas con diferencia ===');
diffs.slice(0, 15).forEach(d => console.log(`  fila ${String(d.row).padStart(4)} | ${String(d.cli || '').slice(0, 16).padEnd(16)} | ${String(d.H || '').padEnd(6)} | Sheet ${d.sheetF.toFixed(2).padStart(9)} -> motor ${d.engineF.toFixed(2).padStart(9)} (${d.delta >= 0 ? '+' : ''}${d.delta.toFixed(2)}) | ${d.motivo}`));
