// Jogos: a IA do jogo da velha (js/jogos/velha.js) e o embaralhamento do jogo da luz (js/jogos/copinhos.js). As regras
// ficam no topo de cada módulo, sem DOM; a página só é carregada no iniciar() deles.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sorteio } from '../js/nucleo/pixel.js';
import { vencedor, linhaVencedora, melhoresJogadas, jogadaDoEscultor, deTexto, paraTexto } from '../js/jogos/velha.js';
import { sortearTrocas, diferenca, lugar, duracaoDaTroca, RODADAS, CHANCE_DA_LUZ } from '../js/jogos/copinhos.js';

const t = deTexto;   // "x.o......" → ['x', null, 'o', ...]

// ---------- jogo da velha ----------

test('vencedor: linhas, colunas, diagonais, velha e partida em curso', () => {
  assert.equal(vencedor(t('xxx.o.o..')), 'x');
  assert.equal(vencedor(t('o..o..o.x')), 'o');
  assert.equal(vencedor(t('x.o.x.o.x')), 'x');
  assert.equal(vencedor(t('x.o.o.o.x')), 'o');
  assert.equal(vencedor(t('xoxxoooxx')), 'velha');
  assert.equal(vencedor(t('x...o....')), null);
  assert.deepEqual(linhaVencedora(t('..o.o.o..')), [2, 4, 6]);
  assert.equal(linhaVencedora(t('xoxxoooxx')), null);
});

test('o tabuleiro guardado vai e volta como texto', () => {
  assert.equal(paraTexto(t('x...o...x')), 'x...o...x');
  assert.deepEqual(t('x.o'.padEnd(9, '.')), ['x', null, 'o', null, null, null, null, null, null]);
});

test('o escultor fecha a linha quando pode, e mais cedo é melhor', () => {
  // O pode ganhar já em 5 (coluna do meio) ou montar outra ameaça: só a vitória imediata serve.
  assert.deepEqual(melhoresJogadas(t('xox.o.x..'), 'o'), [7]);
  // Duas vitórias imediatas: as duas valem o mesmo.
  assert.deepEqual(melhoresJogadas(t('oo.oxx.x.'), 'o').sort(), [2, 6]);
});

test('o escultor bloqueia a linha do visitante', () => {
  assert.deepEqual(melhoresJogadas(t('xx..o....'), 'o'), [2]);
  assert.deepEqual(melhoresJogadas(t('x.o.x....'), 'o'), [8]);   // a diagonal 0-4-8
});

// Todas as partidas possíveis: o visitante tenta todas as casas, o escultor sem palpite joga qualquer uma das
// melhores. Ele nunca pode perder, comece quem começar.
test('sem palpite, o escultor nunca perde (todas as partidas)', () => {
  let finais = 0;
  const explorar = (tab, vez) => {
    const fim = vencedor(tab);
    if (fim) {
      assert.notEqual(fim, 'x', `o escultor perdeu em ${paraTexto(tab)}`);
      finais++;
      return;
    }
    const casas = vez === 'x' ? [...tab.keys()].filter(i => !tab[i]) : melhoresJogadas(tab, 'o');
    for (const i of casas) {
      tab[i] = vez;
      explorar(tab, vez === 'x' ? 'o' : 'x');
      tab[i] = null;
    }
  };
  explorar(Array(9).fill(null), 'x');
  explorar(Array(9).fill(null), 'o');
  assert.ok(finais > 100, `${finais} partidas exploradas`);
});

test('com palpite, ele joga numa casa livre qualquer; sem casa livre, -1', () => {
  const tab = t('xo.xo.o.x');
  const livres = [2, 5, 7];
  const s = sorteio(7);
  for (let k = 0; k < 50; k++) assert.ok(livres.includes(jogadaDoEscultor(tab, 'o', 1, s)));
  assert.equal(jogadaDoEscultor(t('xoxxoooxx'), 'o', 0.35, s), -1);
  // Sem palpite e com uma vitória à mão, é ela.
  assert.equal(jogadaDoEscultor(t('xox.o.x..'), 'o', 0, sorteio(3)), 7);
});

test('o palpite de 35% deixa o escultor vencível', () => {
  // O visitante abre no canto e depois joga sempre a melhor casa para ele; o escultor erra de vez em quando.
  const s = sorteio(42);
  let vitorias = 0;
  for (let partida = 0; partida < 300; partida++) {
    const tab = Array(9).fill(null);
    let vez = 'x';
    while (!vencedor(tab)) {
      const casas = vez === 'x' ? (tab.every(m => !m) ? [0] : melhoresJogadas(tab, 'x')) : null;
      const i = vez === 'x' ? casas[Math.floor(s() * casas.length)] : jogadaDoEscultor(tab, 'o', 0.35, s);
      tab[i] = vez;
      vez = vez === 'x' ? 'o' : 'x';
    }
    if (vencedor(tab) === 'x') vitorias++;
  }
  assert.ok(vitorias > 20 && vitorias < 250, `${vitorias} vitórias do visitante em 300`);
});

// ---------- jogo da luz ----------

test('diferença mais curta no anel de cinco', () => {
  assert.equal(diferenca(0, 2, 5), 2);
  assert.equal(diferenca(0, 3, 5), -2);
  assert.equal(diferenca(4, 0, 5), 1);
  assert.equal(diferenca(1, 0, 5), -1);
  assert.equal(diferenca(2, 2, 5), 0);
  assert.ok(Math.abs(diferenca(3.4, 0, 5) - 1.6) < 1e-9);   // no meio de uma troca
});

test('lugar de cada vaga em relação à da frente', () => {
  assert.deepEqual([0, 1, 2, 3, 4].map(v => lugar(v, 0, 5)), ['frente', 'direita', 'fundo à direita', 'fundo à esquerda', 'esquerda']);
  assert.equal(lugar(1, 3, 5), 'fundo à esquerda');
});

test('as trocas sorteadas são pares válidos e a luz termina onde a conta diz', () => {
  const s = sorteio(2026);
  for (let rodada = 0; rodada < 200; rodada++) {
    const luz = Math.floor(s() * 5);
    const { trocas, fim } = sortearTrocas(5, 9, luz, s);
    assert.equal(trocas.length, 9);
    const anel = [0, 1, 2, 3, 4];          // anel[vaga] = caixa
    for (const [a, b] of trocas) {
      assert.ok(a !== b && a >= 0 && a < 5 && b >= 0 && b < 5, `par inválido ${a}, ${b}`);
      [anel[a], anel[b]] = [anel[b], anel[a]];
    }
    assert.equal(anel.indexOf(luz), fim);
  }
});

// Com três caixas, um par ao acaso leva a luz 2 vezes em 3. Com cinco, o sorteio mantém essa proporção (a dificuldade
// do original); a luz passa na frente em metade das vezes que anda.
test('a luz anda tanto quanto no original de três caixas', () => {
  for (const n of [3, 5]) {
    const s = sorteio(n * 101);
    let total = 0, comLuz = 0, naFrente = 0;
    for (let rodada = 0; rodada < 2000; rodada++) {
      let onde = Math.floor(s() * n);
      for (const [a, b] of sortearTrocas(n, 7, onde, s).trocas) {
        total++;
        if (a === onde || b === onde) {
          comLuz++;
          if (a === onde) naFrente++;
          onde = a === onde ? b : a;
        }
      }
    }
    assert.ok(Math.abs(comLuz / total - CHANCE_DA_LUZ) < 0.02, `n = ${n}: ${(comLuz / total).toFixed(3)}`);
    assert.ok(Math.abs(naFrente / comLuz - 0.5) < 0.02, `n = ${n}: ${(naFrente / comLuz).toFixed(3)} na frente`);
  }
});

test('as rodadas aceleram, e a troca que pula uma vaga ganha tempo', () => {
  assert.deepEqual(RODADAS.map(r => r.trocas), [5, 7, 9]);
  assert.ok(RODADAS[0].duracao > RODADAS[1].duracao && RODADAS[1].duracao > RODADAS[2].duracao);
  assert.equal(duracaoDaTroca(0.4, 1), 0.4);
  assert.equal(duracaoDaTroca(0.4, -2), 0.5);
});
