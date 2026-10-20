// Mestre de obras (js/jogos/tetris.js): o motor puro do Tetris do /admin — peças, colisão, giro com chute, queda,
// fileiras completas, pontuação, saco de sete e a partida andando no tempo. Roda com `node --test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sorteio } from '../js/nucleo/pixel.js';
import {
  COLUNAS, LINHAS, ESCONDIDAS, ALTURA, TIPOS, LIMPEZA, TRAVA, AJUSTES,
  vazio, peca, celulasDa, colide, girar, mover, tentarGirar, queda, fixar, completas, limpar,
  pontuar, nivelDe, tempoDeQueda, criarSaco, criarPartida, comandar, avancarPartida,
} from '../js/jogos/tetris.js';

const ordenadas = celulas => celulas.map(c => c.join(',')).sort();
// Um tabuleiro com fileiras cheias (menos os buracos dados), contadas de baixo para cima.
function comFileiras(n, buraco = -1) {
  const t = vazio();
  for (let y = ALTURA - n; y < ALTURA; y++) for (let x = 0; x < COLUNAS; x++) if (x !== buraco) t[y][x] = 1;
  return t;
}

test('poço de 10 × 20 com duas fileiras escondidas em cima', () => {
  const t = vazio();
  assert.equal(t.length, LINHAS + ESCONDIDAS);
  assert.ok(t.every(f => f.length === COLUNAS && f.every(v => v === 0)));
});

test('as sete peças têm quatro blocos e nascem no meio', () => {
  for (const tipo of TIPOS) assert.equal(peca(tipo).celulas.length, 4, tipo);
  assert.deepEqual(ordenadas(celulasDa(peca('I'))), ['3,1', '4,1', '5,1', '6,1']);
  assert.deepEqual(ordenadas(celulasDa(peca('O'))), ['4,0', '4,1', '5,0', '5,1']);
  assert.deepEqual(ordenadas(celulasDa(peca('T'))), ['3,1', '4,0', '4,1', '5,1']);
});

test('colisão: paredes, chão, teto e blocos', () => {
  const t = vazio();
  const T = peca('T');
  assert.equal(colide(t, T), false);
  assert.equal(colide(t, { ...T, x: -1 }), true);                      // a coluna 0 da caixa sai pela esquerda
  assert.equal(colide(t, { ...T, x: COLUNAS - 2 }), true);             // e a 2 pela direita
  assert.equal(colide(t, { ...T, y: ALTURA - 1 }), true);              // a fileira de baixo passa do chão
  assert.equal(colide(t, { ...T, y: -1 }), true);                      // o bico de cima passa do teto
  t[1][4] = 3;
  assert.equal(colide(t, T), true);
  assert.equal(mover(t, T, 1, 0), null);
  assert.ok(mover(vazio(), T, 1, 0));
});

test('girar: quatro giros voltam ao começo; o O não muda; anti-horário desfaz o horário', () => {
  for (const tipo of TIPOS) {
    let p = peca(tipo);
    for (let i = 0; i < 4; i++) p = girar(p);
    assert.deepEqual(ordenadas(p.celulas), ordenadas(peca(tipo).celulas), tipo);
    assert.deepEqual(ordenadas(girar(girar(peca(tipo)), -1).celulas), ordenadas(peca(tipo).celulas), tipo);
  }
  assert.deepEqual(ordenadas(girar(peca('O')).celulas), ordenadas(peca('O').celulas));
  // T de pé, apontando para a direita (estado R do SRS).
  assert.deepEqual(ordenadas(girar(peca('T')).celulas), ['1,0', '1,1', '1,2', '2,1']);
});

test('chute na parede: o I em pé encostado à direita gira para dentro', () => {
  const t = vazio();
  const emPe = { ...girar(peca('I')), x: 7, y: 5 };                    // coluna 2 da caixa → coluna 9 do poço
  assert.deepEqual([...new Set(celulasDa(emPe).map(c => c[0]))], [9]);
  assert.equal(colide(t, girar(emPe)), true);                          // girar no lugar sairia pela direita
  const girado = tentarGirar(t, emPe);
  assert.ok(girado);
  assert.equal(colide(t, girado), false);
  assert.equal(Math.max(...celulasDa(girado).map(c => c[0])), COLUNAS - 1);
  // Sem lugar nenhum (tudo ocupado em volta), não gira.
  const preso = vazio().map(f => f.map(() => 1));
  for (const [x, y] of celulasDa(emPe)) preso[y][x] = 0;
  assert.equal(tentarGirar(preso, emPe), null);
});

test('chute no chão: o T deitado no fundo gira subindo uma fileira', () => {
  const t = vazio();
  const deitado = { ...peca('T'), y: ALTURA - 2 };                    // bico em cima, base na última fileira
  assert.equal(colide(t, deitado), false);
  assert.equal(colide(t, girar(deitado)), true);                       // em pé no lugar, passaria do chão
  const girado = tentarGirar(t, deitado);
  assert.equal(girado.y, ALTURA - 3);
  assert.equal(girado.x, deitado.x);
  assert.equal(colide(t, girado), false);
});

test('queda e fixar: a peça desce até o fundo e grava o tipo com a textura', () => {
  const t = vazio();
  const O = peca('O', 5);
  assert.equal(queda(t, O), ALTURA - 2);
  const fixado = fixar(t, { ...O, y: ALTURA - 2 });
  const valores = celulasDa({ ...O, y: ALTURA - 2 }).map(([x, y]) => fixado[y][x]);
  assert.ok(valores.every(v => (v & 7) === TIPOS.indexOf('O') + 1));
  assert.deepEqual(valores.map(v => v >> 3), [1, 2, 3, 0]);            // (série + i) % 4
  assert.equal(t[ALTURA - 1][4], 0);                                   // o tabuleiro de entrada não muda
});

test('fileiras completas saem e o que estava em cima desce', () => {
  const t = comFileiras(2);
  t[ALTURA - 3][0] = 7;                                                // um bloco solto em cima das duas cheias
  t[ALTURA - 2][5] = 0;                                                // a penúltima tem um buraco
  assert.deepEqual(completas(t), [ALTURA - 1]);
  const limpo = limpar(t, completas(t));
  assert.equal(limpo.length, ALTURA);
  assert.equal(limpo[ALTURA - 1][5], 0);                               // a do buraco desceu para o fundo
  assert.equal(limpo[ALTURA - 2][0], 7);                               // o bloco solto desceu junto
  assert.ok(limpo[0].every(v => v === 0));
  assert.deepEqual(completas(comFileiras(4)), [18, 19, 20, 21]);
  assert.ok(limpar(comFileiras(4), [18, 19, 20, 21]).every(f => f.every(v => v === 0)));
});

test('pontuação da diretriz e níveis', () => {
  assert.deepEqual([1, 2, 3, 4].map(n => pontuar(n, 1)), [100, 300, 500, 800]);
  assert.equal(pontuar(4, 3), 2400);
  assert.equal(pontuar(0, 5), 0);
  assert.deepEqual([0, 9, 10, 19, 20, 35].map(nivelDe), [1, 1, 2, 2, 3, 4]);
  assert.equal(tempoDeQueda(1), 1);
  for (let n = 1; n < 15; n++) assert.ok(tempoDeQueda(n + 1) < tempoDeQueda(n), `nível ${n + 1} mais rápido`);
  assert.equal(tempoDeQueda(20), tempoDeQueda(15));
  assert.ok(Math.abs(tempoDeQueda(10) - 0.0643) < 0.001);
});

test('saco de sete: cada sete peças trazem as sete', () => {
  const proximo = criarSaco(sorteio(42));
  for (let saco = 0; saco < 5; saco++) {
    const sete = Array.from({ length: 7 }, proximo);
    assert.deepEqual([...sete].sort(), [...TIPOS].sort());
  }
});

test('partida: soltar vale 2 por fileira e trava na hora', () => {
  const p = criarPartida(sorteio(7));
  const tipo = p.peca.tipo;
  const d = queda(p.tabuleiro, p.peca);
  const eventos = comandar(p, 'soltar');
  assert.equal(eventos[0].tipo, 'soltou');
  assert.equal(eventos[0].distancia, d);
  assert.equal(p.pontos, 2 * d);
  assert.ok(eventos.some(e => e.tipo === 'fixou'));
  assert.equal(p.tabuleiro[ALTURA - 1].filter(v => (v & 7) === TIPOS.indexOf(tipo) + 1).length > 0, true);
  assert.ok(p.peca && p.serie === 2);                                  // a próxima já nasceu
});

test('partida: a gravidade desce uma fileira por segundo no nível 1 e trava depois da folga', () => {
  const p = criarPartida(sorteio(3));
  const y0 = p.peca.y;
  avancarPartida(p, 0.5);
  assert.equal(p.peca.y, y0);
  avancarPartida(p, 0.5);
  assert.equal(p.peca.y, y0 + 1);
  // ↓ segurado: queda rápida, 1 ponto por fileira.
  avancarPartida(p, 0.035 * 3 + 0.001, true);
  assert.equal(p.peca.y, y0 + 4);
  assert.equal(p.pontos, 3);
  // Apoiada no fundo, espera TRAVA segundos antes de travar.
  p.peca = { ...p.peca, y: p.peca.y + queda(p.tabuleiro, p.peca) };
  avancarPartida(p, TRAVA - 0.1);
  assert.equal(p.serie, 1);
  const eventos = avancarPartida(p, 0.11);
  assert.ok(eventos.some(e => e.tipo === 'fixou'));
  assert.equal(p.serie, 2);
});

test('partida: ajeitar a peça apoiada segura a trava, até 15 vezes', () => {
  const p = criarPartida(sorteio(11));
  p.peca = { ...p.peca, y: p.peca.y + queda(p.tabuleiro, p.peca) };
  avancarPartida(p, TRAVA - 0.1);
  assert.equal(p.serie, 1);
  for (let i = 0; i < AJUSTES; i++) {
    const lado = i % 2 ? 'direita' : 'esquerda';
    assert.equal(comandar(p, lado)[0]?.tipo, 'moveu');
    avancarPartida(p, TRAVA - 0.1);
    assert.equal(p.serie, 1, `segurou no ajuste ${i + 1}`);
  }
  comandar(p, 'esquerda');                                             // o 16º não segura mais: a folga acaba
  avancarPartida(p, 0.11);
  assert.equal(p.serie, 2);
});

test('partida: fiada completa racha, sai depois da limpeza e pontua com o nível', () => {
  const p = criarPartida(sorteio(5));
  // Fundo cheio menos o lugar exato da peça da vez, deitada no fundo.
  const alvo = { ...p.peca, y: p.peca.y + queda(vazio(), p.peca) };
  p.tabuleiro = vazio();
  const fundoDela = Math.max(...celulasDa(alvo).map(c => c[1]));
  for (let x = 0; x < COLUNAS; x++) p.tabuleiro[fundoDela][x] = 1;
  for (const [x, y] of celulasDa(alvo)) p.tabuleiro[y][x] = 0;
  const yAntes = p.peca.y;
  const eventos = comandar(p, 'soltar');
  const linhas = eventos.find(e => e.tipo === 'linhas');
  assert.ok(linhas);
  assert.deepEqual(linhas.fileiras, [fundoDela]);
  assert.equal(p.linhas, 1);
  assert.equal(p.pontos, 100 + 2 * (alvo.y - yAntes));
  assert.equal(p.peca, null);                                          // enquanto racha, não tem peça
  assert.deepEqual(comandar(p, 'esquerda'), []);
  avancarPartida(p, LIMPEZA / 2);
  assert.ok(p.limpando);
  avancarPartida(p, LIMPEZA / 2 + 0.01);
  assert.equal(p.limpando, null);
  assert.ok(p.peca);
  assert.equal(completas(p.tabuleiro).length, 0);
});

test('partida: dez linhas sobem o nível e a pontuação usa o nível de antes', () => {
  const p = criarPartida(sorteio(9));
  p.linhas = 9;
  p.tabuleiro = comFileiras(1, 0);
  p.peca = { ...peca('I'), x: -1, y: 0, celulas: [[1, 0], [1, 1], [1, 2], [1, 3]] }; // um I em pé na coluna 0
  const eventos = comandar(p, 'soltar');
  assert.equal(p.linhas, 10);
  assert.equal(p.nivel, 2);
  assert.ok(eventos.some(e => e.tipo === 'nivel' && e.nivel === 2));
  assert.equal(eventos.find(e => e.tipo === 'linhas').ganho, 100);
});

test('partida: sem lugar para nascer, desaba', () => {
  const p = criarPartida(sorteio(1));
  // Enche tudo até o alto, deixando só a peça da vez solta no topo e um buraco por fileira (nada completa).
  for (let y = ESCONDIDAS; y < ALTURA; y++) for (let x = 0; x < COLUNAS; x++) p.tabuleiro[y][x] = x === y % COLUNAS ? 0 : 2;
  let eventos = [];
  for (let i = 0; i < 40 && !p.fim; i++) eventos = eventos.concat(comandar(p, 'soltar'), avancarPartida(p, 0.05));
  assert.ok(p.fim);
  assert.ok(eventos.some(e => e.tipo === 'fim'));
  assert.deepEqual(comandar(p, 'girar'), []);
  assert.deepEqual(avancarPartida(p, 1), []);
});
