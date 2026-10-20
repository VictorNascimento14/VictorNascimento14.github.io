// Arena: a projeção do Coliseu (números de conferência da spec 04 §4.4.5) e como os números dos cartões são escritos.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { projetar, desenhar, SUBIDA } from '../js/arte/coliseu.js';
import { numeroPt, porcentagem, rotuloData, periodo, contagem, falaDoPlacar } from '../js/dados/redes.js';

const perto = (valor, esperado, tolerancia = 0.06) =>
  assert.ok(Math.abs(valor - esperado) <= tolerancia, `${valor} deveria ser ≈ ${esperado}`);

test('o muro sobe 5 vãos do pé ao topo', () => {
  perto(SUBIDA, 5, 1e-9);
});

test('projeção larga: 1440 px, pé em 426, muro de 404', () => {
  const p = projetar({ largura: 1440, pe: 426, muro: 404, abertura: 0.72 });
  perto(p.F, 820.9);
  perto(p.vao, 80.8);
  perto(p.podio, 44.44);
  perto(p.olho, 408.22);
  perto(p.alcance, 671.9);
  assert.equal(Math.ceil(p.alcance / p.vao), 9);
  perto(p.Y(0, 404), 22.0);                                  // topo do muro no centro
  perto(p.Y(-p.F * 0.72, 404), -105.5);                      // e na borda da tela, que sai por cima
  perto(p.peEm(720), 426.0);
  perto(p.peEm(0), 431.9);
  perto(p.peEm(1440), 431.9);
  perto(p.podioEm(720), 381.6);
});

test('projeção estreita: 390 px, pé em 191,7, muro de 175,7', () => {
  const p = projetar({ largura: 390, pe: 191.7, muro: 175.7, abertura: 0.72 });
  perto(p.F, 222.3);
  perto(p.vao, 35.14);
  perto(p.podio, 19.33);
  assert.equal(Math.ceil(p.alcance / p.vao), 6);
  perto(p.Y(0, 175.7), 16.0);
  perto(p.Y(-p.F * 0.72, 175.7), -39.5);
  perto(p.peEm(0), 194.3);
  perto(p.podioEm(195), 172.4);
});

test('o desenho tem as oito camadas, na ordem de pintura', () => {
  const { svg, vao } = desenhar({ largura: 1440, altura: 640, pe: 426, muro: 404, abertura: 0.72 });
  const classes = [...svg.matchAll(/<path class="([a-z]+)" d="[^"]+"\/>/g)].map(m => m[1]);
  assert.deepEqual(classes, ['face', 'podio', 'faixa', 'vao', 'coluna', 'corte', 'areia', 'anel']);
  perto(vao, 80.8);
  assert.doesNotMatch(svg, /NaN|Infinity/);
});

test('números e datas em pt-BR', () => {
  assert.equal(numeroPt(2597), '2.597');
  assert.equal(numeroPt(901097), '901.097');
  assert.equal(numeroPt(143), '143');
  assert.equal(porcentagem(2579 / 2597), '99,3%');
  assert.equal(rotuloData('2026-05-03'), '3 mai 2026');
  assert.equal(rotuloData('2026-09'), 'set 2026');
  assert.equal(rotuloData('2026-10-02', false), '2 out');
  assert.equal(periodo('2026-02-03', '2026-05-03'), '3 FEV A 3 MAI 2026');
  assert.equal(periodo('2026-01', '2026-10'), 'JAN A OUT 2026');
  assert.equal(periodo('2025-12-03', '2026-05-03'), '3 DEZ 2025 A 3 MAI 2026');
});

test('a contagem acompanha a estátua, não o tempo', () => {
  assert.equal(contagem(2597, 0), '0');
  assert.equal(contagem(2597, 1), '2.597');
  // progresso da estátua aos 1, 2 e 3 s do reboque → 45%, 80% e 97% do número
  assert.equal(contagem(1000, 0.26), '452');
  assert.equal(contagem(1000, 0.55), '798');
  assert.equal(contagem(1000, 0.84), '974');
});

test('a fala compara seguidores e pull requests, sem somar', () => {
  assert.equal(falaDoPlacar(0, 2597), 'Faz mais do que conta: 2.597 pull requests contra 0 seguidores. Segue ele lá!');
  assert.equal(falaDoPlacar(1, 2597), 'Faz mais do que conta: 2.597 pull requests contra 1 seguidor. Segue ele lá!');
  assert.equal(falaDoPlacar(3000, 2597), '3.000 seguidores no LinkedIn e 2.597 pull requests no GitHub. Segue ele lá!');
});
