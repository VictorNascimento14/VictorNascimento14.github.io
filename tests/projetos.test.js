// Projetos: as contas do anel (js/arte/anel.js) e a caixa de bronze (js/arte/bau.js), sem DOM.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PROF_LADO, PROF_FUNDO, diferenca, escalaDe, opacidadeDe, subidaDe } from '../js/arte/anel.js';
import { quadro, montar, BORDA, EMENDA, AREA } from '../js/arte/bau.js';

const perto = (valor, esperado, tolerancia = 1e-9) =>
  assert.ok(Math.abs(valor - esperado) <= tolerancia, `${valor} deveria ser ≈ ${esperado}`);

test('cinco caixas: laterais a 72° e as do fundo a 144°', () => {
  perto(PROF_LADO, Math.cos(2 * Math.PI / 5));
  perto(PROF_FUNDO, Math.cos(4 * Math.PI / 5));
});

test('diferença: o caminho mais curto, em (−2,5; 2,5]', () => {
  assert.equal(diferenca(0, 1), 1);
  assert.equal(diferenca(0, 4), -1);    // da I para a V: um passo para trás, não quatro para a frente
  assert.equal(diferenca(0, 2), 2);
  assert.equal(diferenca(0, 3), -2);
  assert.equal(diferenca(3, 0), 2);
  perto(diferenca(4.6, 0), 0.4);        // no meio de um arrasto
  assert.equal(diferenca(-5, 0), 0);    // a volta de entrada é uma volta inteira: não se gira por aqui
});

test('escala, opacidade e subida param nos três degraus e só mudam entre eles', () => {
  const lado = 3 / 5, fundo = 2 / 5;    // P 5 na frente, 3 nas laterais e 2 no fundo
  perto(escalaDe(1, lado, fundo), 1);
  perto(escalaDe(PROF_LADO, lado, fundo), lado);
  perto(escalaDe(PROF_FUNDO, lado, fundo), fundo);
  assert.ok(escalaDe(-1, lado, fundo) >= 0.15);   // atrás de tudo (meio de um giro), nunca some
  perto(opacidadeDe(1), 1);
  perto(opacidadeDe(PROF_LADO), 0.55);
  perto(opacidadeDe(PROF_FUNDO), 0.4);
  assert.ok(opacidadeDe(-1) >= 0.2);
  perto(subidaDe(1), 0);
  perto(subidaDe(PROF_LADO), 0.168);
  perto(subidaDe(PROF_FUNDO), 0.336);
  // de trás para a frente: maior, mais acesa e mais baixa, sem degrau no caminho
  for (let k = 0; k < 40; k++) {
    const a = -1 + k / 20, b = a + 1 / 20;
    assert.ok(escalaDe(b, lado, fundo) >= escalaDe(a, lado, fundo));
    assert.ok(opacidadeDe(b) >= opacidadeDe(a));
    assert.ok(subidaDe(b) <= subidaDe(a));
  }
});

test('caixa fechada: só a grade, sem luz nem faíscas por cima', () => {
  const { tras, frente } = quadro({ numeral: 'I' });
  assert.equal(tras.sobre.length, 0);
  assert.equal(frente.sobre.length, 0);
  assert.ok(frente.grade.some(Boolean));
});

test('aberta e acesa: a luz sobe da boca, nunca abaixo da borda da frente', () => {
  const { tras } = quadro({ tampa: 1, brilho: 1, tempo: 0.3 });
  assert.ok(tras.sobre.length > 0);
  for (let n = 1; n < tras.sobre.length; n += 3) assert.ok(tras.sobre[n] < BORDA);
});

test('faíscas no pixel arredondado, por cima da frente; mesmo estado, mesmo quadro', () => {
  const estado = { tampa: 0.4, brilho: 0.5, tempo: 1.2, faiscas: [{ x: 46.6, y: 14.4, vida: 0.1 }] };
  const a = quadro(estado), b = quadro(estado);
  assert.deepEqual(a.frente.sobre.slice(0, 2), [47, 14]);
  assert.deepEqual(a.tras.grade, b.tras.grade);
  assert.deepEqual(a.frente.sobre, b.frente.sobre);
});

test('montar: pontos em px CSS e o buffer no P arredondado para cima', () => {
  const canvas = () => ({ width: 0, height: 0, style: {}, dataset: {}, getContext: () => ({}) });
  const tras = canvas(), frente = canvas();
  const bau = montar(tras, frente, { numeral: 'II', pixel: 4, dpr: 1 });
  assert.equal(bau.dimensionar(4, 2), true);
  assert.equal(bau.dimensionar(4, 2), false);   // nada mudou
  assert.deepEqual(bau.em(EMENDA.x, EMENDA.y), { x: (EMENDA.x - AREA.x0) * 4, y: (EMENDA.y - AREA.y0) * 4 });
  const largura = tras.width;
  assert.equal(largura, (AREA.x1 - AREA.x0) * 4 * 2);
  assert.equal(bau.dimensionar(3.5, 2), true);   // P fracionário no meio de um giro: o buffer de P 4 serve
  assert.equal(tras.width, largura);
  assert.equal(frente.height, (AREA.y1 - AREA.y0) * 4 * 2);
});
