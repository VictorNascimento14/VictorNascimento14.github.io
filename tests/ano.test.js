// Contas da placa do ano (js/arte/placa.js): grade, geometria, hit-test, layout em registros, estatísticas e a
// divisão das semanas entre os aprendizes. Roda com `npm test` (todos os testes).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import dados from '../assets/dados/contribuicoes.js';
import {
  grade, medidas, pino, posicaoEm, disposicao, estatisticas, trechos, linhaDoGolpe, linhasPorSemana, indiceDoDia, PINO,
} from '../js/arte/placa.js';

// 2026 de 1º de janeiro a 20 de outubro (293 dias), como no dia em que a placa foi feita.
const DIAS_2026 = Array.from({ length: 293 }, (_, i) => [new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10), i % 3, i % 3 ? 1 : 0]);

test('grade de 2026: domingo em cima, 53 colunas e encaixes até 31/12', () => {
  const g = grade(DIAS_2026, '2026-12-31');
  assert.equal(g.inicio, 4);                                   // 1º/jan/2026 é quinta
  assert.equal(g.semanas, 53);
  assert.deepEqual([g.celulas[0].semana, g.celulas[0].linha], [0, 4]);
  assert.deepEqual([g.celulas[292].semana, g.celulas[292].linha], [42, 2]);   // 20/out, terça
  assert.equal(g.encaixes.length, 365 - 293);
  assert.deepEqual([g.encaixes.at(-1).indice, g.encaixes.at(-1).semana, g.encaixes.at(-1).linha], [364, 52, 4]);
  const semFim = grade(DIAS_2026);
  assert.equal(semFim.encaixes.length, 0);
  assert.equal(semFim.semanas, 43);
});

test('medidas: 1 registro = 276 × 62 ps, 2 registros = 146 × 110 ps', () => {
  const um = medidas(53, 1), dois = medidas(53, 2);
  assert.deepEqual([um.w, um.h], [276, 62]);
  assert.deepEqual([dois.w, dois.h], [146, 110]);
  assert.deepEqual(dois.campos.map(c => [c.y, c.semanas, c.w]), [[12, 27, 138], [60, 26, 138]]);
  assert.deepEqual(dois.faixas, [4, 52, 100]);
  assert.deepEqual(pino(um, 0, 0), { x: 6, y: 14 });
  assert.deepEqual(pino(dois, 27, 1), { x: 6, y: 67 });         // 1ª semana do 2º registro
});

test('o ponto no centro de um pino (e no meio vão em volta) devolve o mesmo pino', () => {
  for (const registros of [1, 2]) {
    const L = medidas(53, registros);
    for (const [semana, linha] of [[0, 0], [12, 6], [26, 3], [27, 0], [41, 5], [52, 4]]) {
      const p = pino(L, semana, linha);
      assert.deepEqual(posicaoEm(L, p.x + PINO / 2, p.y + PINO / 2), { semana, linha });
      assert.deepEqual(posicaoEm(L, p.x - 0.4, p.y - 0.4), { semana, linha });
    }
    assert.equal(posicaoEm(L, 1, 1), null);                     // na moldura
  }
  assert.equal(posicaoEm(medidas(53, 2), 6 + 26 * 5 + 1, 62 + 1), null);   // a coluna vazia no fim do 2º registro
});

test('disposicao escolhe o maior pixel; 2 registros só se der pixel estritamente maior', () => {
  assert.deepEqual(disposicao(53, 1425, 900, 1440), { pixel: 4, registros: 1 });   // 1108 × 252
  assert.deepEqual(disposicao(53, 1905, 1080, 1920), { pixel: 5, registros: 1 });
  assert.deepEqual(disposicao(53, 768, 1024), { pixel: 3, registros: 2 });
  assert.deepEqual(disposicao(53, 844, 390), { pixel: 2, registros: 1 });          // celular deitado
  assert.deepEqual(disposicao(53, 390, 844), { pixel: 2, registros: 2 });          // celular em pé: 294 × 222
  assert.deepEqual(disposicao(53, 320, 568), { pixel: 1, registros: 1 });          // empate fica com 1
});

test('estatísticas: maior sequência (não a atual), maior dia com empate no primeiro e soma por mês', () => {
  const dias = [
    ['2026-01-30', 4, 1], ['2026-01-31', 0, 0], ['2026-02-01', 9, 2], ['2026-02-02', 1, 1],
    ['2026-02-03', 9, 2], ['2026-02-04', 0, 0], ['2026-02-05', 2, 1], ['2026-02-06', 3, 1],
  ];
  const e = estatisticas(dias);
  assert.equal(e.ativos, 6);
  assert.equal(e.maiorSequencia, 3);
  assert.deepEqual(e.melhor, { data: '2026-02-01', contagem: 9 });
  assert.deepEqual(e.meses, [['2026-01', 4], ['2026-02', 24]]);
  // Uma sequência que termina no último dia também conta.
  assert.equal(estatisticas([['2026-03-01', 0, 0], ['2026-03-02', 1, 1], ['2026-03-03', 1, 1]]).maiorSequencia, 2);
});

test('trechos dos aprendizes: 43 semanas → 11/11/10/11; 1 semana → 1 aprendiz; 2 → 2', () => {
  assert.deepEqual(trechos(43).map(t => t.ate - t.de), [11, 11, 10, 11]);
  assert.deepEqual(trechos(43).map(t => t.de), [0, 11, 22, 32]);
  assert.deepEqual(trechos(1), [{ de: 0, ate: 1 }]);
  assert.deepEqual(trechos(2), [{ de: 0, ate: 1 }, { de: 1, ate: 2 }]);
  assert.deepEqual(trechos(0), []);
});

test('o cinzel faz zigue-zague e respeita as linhas das semanas parciais', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5].map(s => linhaDoGolpe(s, 0, 0, 6)), [1, 4, 2, 5, 3, 1]);
  assert.deepEqual([0, 1, 2].map(n => linhaDoGolpe(10, n, 0, 6)), [1, 3, 5]);
  assert.equal(linhaDoGolpe(0, 0, 4, 6), 4);                   // 1ª semana de 2026: só quinta a sábado
  assert.equal(linhaDoGolpe(1, 0, 0, 2), 2);                   // semana corrente: até terça
  const linhas = linhasPorSemana(grade(DIAS_2026).celulas);
  assert.equal(linhas.length, 43);
  assert.deepEqual([linhas[0], linhas[1], linhas[42]], [[4, 6], [0, 6], [0, 2]]);
});

test('índice de um dia conta em UTC', () => {
  assert.equal(indiceDoDia('2026-01-01', '2026-10-20'), 292);
  assert.equal(indiceDoDia('2026-01-01', '2026-12-31'), 364);
  assert.equal(indiceDoDia('2026-01-01', '2025-12-31'), -1);
});

test('os dados gerados valem para a placa: contíguos, nível 0 só sem contribuição e total = soma', () => {
  const { days, total, year, end } = dados;
  assert.ok(days.length > 0);
  assert.equal(days[0][0], `${year}-01-01`);
  days.forEach(([data, contagem, nivel], i) => {
    assert.equal(indiceDoDia(days[0][0], data), i, `buraco antes de ${data}`);
    assert.ok(Number.isInteger(contagem) && contagem >= 0 && nivel >= 0 && nivel <= 4);
    assert.equal(nivel === 0, contagem === 0, `nível ${nivel} com ${contagem} em ${data}`);
  });
  assert.equal(total, days.reduce((soma, [, contagem]) => soma + contagem, 0));
  assert.ok(end >= days.at(-1)[0]);
});
