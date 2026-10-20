// Segredos: as duas contas das cutucadas (o total da carga e a sequência rápida), o ouvido do teclado (eureca, deploy
// e o código Konami), a elipse do nariz e as letras da inscrição. Regras puras de js/jogos/segredos.js (spec 06 §6.8,
// §6.10–6.12).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  contarCutucada, efeitosDaCutucada, JANELA_RAPIDA, CUTUCADAS_ZERO,
  teclar, TECLADO_VAZIO, KONAMI, noNariz, sulcos, INSCRICAO,
} from '../js/jogos/segredos.js';

const cutucar = instantes => instantes.reduce((c, t) => contarCutucada(c, t), CUTUCADAS_ZERO);

// Os números (1, 2, …) das cutucadas que dispararam cada efeito.
function disparos(instantes) {
  const achados = { cocegas: [], sino: [], terremoto: [] };
  let c = CUTUCADAS_ZERO;
  instantes.forEach((t, i) => {
    c = contarCutucada(c, t);
    for (const [efeito, sim] of Object.entries(efeitosDaCutucada(c))) if (sim) achados[efeito].push(i + 1);
  });
  return achados;
}

const seguidas = (n, de = 0, passo = 300) => Array.from({ length: n }, (_, i) => de + i * passo);

test('cócegas a partir da 3ª cutucada, rápida ou não', () => {
  assert.deepEqual(disparos([0, 5000, 60000]).cocegas, [3]);
  assert.deepEqual(disparos(seguidas(5, 0, 2000)).cocegas, [3, 4, 5]);
  assert.equal(cutucar([0, 5000, 60000]).sequencia, 1);
});

test('sino na 10ª rápida e terremoto na 20ª, por igualdade', () => {
  const d = disparos(seguidas(25));
  assert.deepEqual(d.sino, [10]);
  assert.deepEqual(d.terremoto, [20]);
});

test('a sequência recomeça depois de 1200 ms parado (1199 ainda vale)', () => {
  assert.equal(cutucar([0, JANELA_RAPIDA - 1]).sequencia, 2);
  assert.equal(cutucar([0, JANELA_RAPIDA]).sequencia, 1);
  // 9 rápidas, uma pausa, mais 9: nenhum sino, mas o total segue somando
  const d = disparos([...seguidas(9), ...seguidas(9, 10000)]);
  assert.deepEqual(d.sino, []);
  assert.equal(cutucar([...seguidas(9), ...seguidas(9, 10000)]).total, 18);
  // a 10ª tem de vir a menos de 1,2 s da 9ª
  assert.deepEqual(disparos([...seguidas(9), 2400 + 1250]).sino, []);
});

// O que cada sequência de teclas (o `key` dos eventos) dispara.
function digitar(teclas) {
  const achados = [];
  let estado = TECLADO_VAZIO;
  for (const tecla of teclas) {
    const r = teclar(estado, tecla);
    estado = r.estado;
    if (r.segredo) achados.push(r.segredo);
  }
  return achados;
}

const SETAS = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight'];

test('eureca, eureka e eurecka, em qualquer caixa e com acento', () => {
  assert.deepEqual(digitar([...'eureca']), ['eureca']);
  assert.deepEqual(digitar([...'EUREKA']), ['eureca']);
  assert.deepEqual(digitar([...'olha, eurecka']), ['eureca']);
  assert.deepEqual(digitar([...'éurecá']), ['eureca']);
  // Shift no meio não quebra a palavra; espaço quebra
  assert.deepEqual(digitar(['e', 'u', 'r', 'e', 'c', 'Shift', 'A']), ['eureca']);
  assert.deepEqual(digitar([...'eure ca']), []);
});

test('deploy pela palavra ou pelo código Konami', () => {
  assert.deepEqual(digitar([...'deploy']), ['deploy']);
  assert.deepEqual(digitar([...'DePlOy']), ['deploy']);
  assert.deepEqual(digitar([...SETAS, 'b', 'a']), ['deploy']);
  assert.deepEqual(digitar([...SETAS, 'B', 'A']), ['deploy']);
  assert.deepEqual(digitar(['x', 'Enter', ...SETAS, 'b', 'a']), ['deploy']);
  assert.equal(KONAMI.length, 10);
});

test('Konami fora de ordem ou incompleto não vale', () => {
  assert.deepEqual(digitar(['ArrowUp', 'ArrowDown', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a']), []);
  assert.deepEqual(digitar([...SETAS.slice(1), 'b', 'a']), []);
  assert.deepEqual(digitar([...SETAS, 'a', 'b']), []);
});

test('cada palavra vale uma vez por digitação; o ouvido guarda só as 12 últimas letras', () => {
  assert.deepEqual(digitar([...'deploydeploy']), ['deploy', 'deploy']);
  assert.deepEqual(digitar([...'eurecaeureca']), ['eureca', 'eureca']);
  assert.deepEqual(digitar([...'deplo', 'Shift', 'y']), ['deploy']);
  const r = teclar({ teclas: [], texto: 'abcdefghijkl' }, 'm');
  assert.equal(r.estado.texto, 'bcdefghijklm');
  assert.ok(r.estado.teclas.length <= KONAMI.length);
});

test('a elipse do nariz, em frações da imagem', () => {
  const n = { x: 0.5, y: 0.25, raioX: 0.04, raioY: 0.03 };
  assert.ok(noNariz(0.5, 0.25, n));
  assert.ok(noNariz(0.5399, 0.25, n));
  assert.ok(noNariz(0.5, 0.2201, n));
  assert.ok(!noNariz(0.5401, 0.25, n));
  assert.ok(!noNariz(0.5, 0.2801, n));
  assert.ok(!noNariz(0.535, 0.275, n));   // dentro da caixa, fora da elipse
});

test('a inscrição tem desenho para toda letra e cabe em 4 colunas por letra', () => {
  assert.equal(INSCRICAO, 'VICTOR ESTEVE AQUI');
  for (const letra of INSCRICAO.replaceAll(' ', '')) assert.ok(sulcos(letra).length >= 5, `falta a letra ${letra}`);
  const todos = sulcos(INSCRICAO);
  assert.ok(todos.every(([c, r]) => c >= 0 && c < INSCRICAO.length * 4 - 1 && r >= 0 && r < 5));
  assert.ok(todos.every(([c]) => c % 4 !== 3), 'a 4ª coluna de cada letra é o espaço');
  // riscar aos poucos só acrescenta sulcos, na ordem das letras
  assert.deepEqual(sulcos(INSCRICAO, 2), [...sulcos('V'), ...sulcos('VI').filter(([c]) => c >= 4)]);
  assert.equal(sulcos(INSCRICAO, 0).length, 0);
});
