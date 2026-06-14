// Golden test: corre el motor sobre los datos REALES del Sheet y compara
// columna por columna (V, W, X, Y, Z, AA, AC, F) contra lo que el Sheet calculó.
import fs from 'node:fs';
import { buildAcuerdos, runLedger, num } from './engine.mjs';

const D = 'C:/Users/Mati Braska/Documents/claude-code/';
const ing = JSON.parse(fs.readFileSync(D + 'fx_ingresos.json', 'utf8'));
const ac = JSON.parse(fs.readFileSync(D + 'fx_acuerdos.json', 'utf8'));

const acuerdos = buildAcuerdos(ac.derecho.rows, ac.izquierdo.rows);

// índices de columna en el array v[] de Ingresos (A=0 ... AD=29)
const IDX = { B: 1, C: 2, D: 3, E: 4, F: 5, G: 6, H: 7, M: 12, N: 13, O: 14, P: 15, V: 21, W: 22, X: 23, Y: 24, Z: 25, AA: 26, AC: 28 };

const rows = ing.rows;
const active = rows.filter(r => {
  const v = r.v;
  return (v[IDX.H] != null && String(v[IDX.H]).trim() !== '') || num(v[IDX.E]) !== 0 || (v[IDX.N] != null && String(v[IDX.N]).trim() !== '');
});

const incomes = active.map(r => ({
  row: r.row, fecha: r.v[IDX.B], E: r.v[IDX.E], H: r.v[IDX.H],
  N: r.v[IDX.N], O: r.v[IDX.O], P: r.v[IDX.P],
}));

const results = runLedger(incomes, acuerdos);

const TOL = 0.02;
const cols = ['V', 'W', 'X', 'Y', 'Z', 'AA', 'AC', 'F'];
const stats = {}; cols.forEach(c => stats[c] = { ok: 0, bad: 0, mism: [] });

function eqVal(col, got, exp) {
  if (col === 'V') return String(got || '').trim().toLowerCase() === String(exp || '').trim().toLowerCase();
  return Math.abs(num(got) - num(exp)) <= TOL;
}

active.forEach((r, i) => {
  const res = results[i];
  const exp = { V: r.v[IDX.V], W: r.v[IDX.W], X: r.v[IDX.X], Y: r.v[IDX.Y], Z: r.v[IDX.Z], AA: r.v[IDX.AA], AC: r.v[IDX.AC], F: r.v[IDX.F] };
  for (const c of cols) {
    if (eqVal(c, res[c], exp[c])) stats[c].ok++;
    else { stats[c].bad++; if (stats[c].mism.length < 12) stats[c].mism.push({ row: r.row, cli: r.v[IDX.N], H: r.v[IDX.H], E: num(r.v[IDX.E]), got: res[c], exp: exp[c] }); }
  }
});

console.log('Filas activas comparadas:', active.length, '\n');
console.log('Columna |   OK  |  DIF  | % match');
for (const c of cols) {
  const t = stats[c].ok + stats[c].bad;
  console.log(c.padEnd(7) + ' | ' + String(stats[c].ok).padStart(5) + ' | ' + String(stats[c].bad).padStart(5) + ' | ' + (100 * stats[c].ok / t).toFixed(2) + '%');
}
console.log('\n=== Primeras diferencias por columna ===');
for (const c of cols) {
  if (!stats[c].bad) continue;
  console.log('\n-- ' + c + ' (' + stats[c].bad + ' difs) --');
  for (const m of stats[c].mism) {
    console.log(`  fila ${m.row} | ${String(m.cli||'').slice(0,18).padEnd(18)} | H=${String(m.H||'').padEnd(10)} E=${m.E.toFixed(2).padStart(10)} | got=${String(typeof m.got==='number'?m.got.toFixed(2):m.got).padStart(10)} exp=${String(typeof m.exp==='number'?m.exp.toFixed(2):m.exp).padStart(10)}`);
  }
}
