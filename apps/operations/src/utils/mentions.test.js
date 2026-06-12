import { describe, it, expect } from 'vitest';
import { slugifyName, extractMentions, suggestMentions, tokenizeWithMentions } from './mentions';

const TEAM = [
  { id: 'u1', name: 'Matias Braszka' },
  { id: 'u2', name: 'María Jesús del Rey' },
  { id: 'u3', name: 'Ana' },
];

describe('slugifyName', () => {
  it('normaliza tildes, espacios y mayusculas', () => {
    expect(slugifyName('María Jesús')).toBe('mariajesus');
    expect(slugifyName('  Matias  Braszka ')).toBe('matiasbraszka');
    expect(slugifyName('')).toBe('');
  });
});

describe('extractMentions', () => {
  it('resuelve @primernombre y @nombre.apellido', () => {
    expect(extractMentions('hola @matias revisa esto', TEAM)).toEqual(['u1']);
    expect(extractMentions('cc @matias.braszka', TEAM)).toEqual(['u1']);
  });
  it('matchea nombres con tilde escritos sin tilde', () => {
    expect(extractMentions('aviso a @maria', TEAM)).toEqual(['u2']);
  });
  it('excluye al actor y deduplica', () => {
    expect(extractMentions('@matias y de nuevo @matias', TEAM)).toEqual(['u1']);
    expect(extractMentions('@matias', TEAM, { excludeId: 'u1' })).toEqual([]);
  });
  it('ignora menciones que no matchean y texto vacio', () => {
    expect(extractMentions('@nadie conocido', TEAM)).toEqual([]);
    expect(extractMentions('', TEAM)).toEqual([]);
    expect(extractMentions(null, TEAM)).toEqual([]);
  });
});

describe('suggestMentions', () => {
  it('sin query devuelve los primeros N sin el actor', () => {
    const out = suggestMentions('', TEAM, { excludeId: 'u1' });
    expect(out.map((m) => m.id)).toEqual(['u2', 'u3']);
  });
  it('prioriza startsWith sobre contains', () => {
    const out = suggestMentions('ma', TEAM);
    expect(out[0].id).toBe('u1'); // "matias..." arranca con ma
  });
});

describe('tokenizeWithMentions', () => {
  it('parte el texto en tokens text/mention', () => {
    const tokens = tokenizeWithMentions('hola @matias como va', TEAM);
    expect(tokens.map((t) => t.type)).toEqual(['text', 'mention', 'text']);
    expect(tokens[1].member.id).toBe('u1');
    expect(tokens[1].raw).toBe('@matias');
  });
  it('una mencion no resuelta queda como texto', () => {
    const tokens = tokenizeWithMentions('@desconocido hola', TEAM);
    expect(tokens[0]).toEqual({ type: 'text', value: '@desconocido' });
  });
});
