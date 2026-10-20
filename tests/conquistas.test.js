// Conquistas (js/jogos/conquistas.js): níveis, metais liberados, leitura defensiva do registro, a soma da tontura, o
// código do prêmio, as marcas e a moeda; e o fluxo sem DOM (a moeda pousa na hora). Roda com `node --test tests/`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CONQUISTAS, LIMIAR_PRATA, MARCAS, nivelPara, metalLiberado, faltaPara, lerAtelie, mesclarAtelie, somarGiros,
  gerarCodigo, celulasDaMoeda, desbloquear, tem, quantas, nivel, metal, vestir, cabeca, visual, placar,
} from '../js/jogos/conquistas.js';
import { ouvir } from '../js/nucleo/sinais.js';

test('níveis: prata com 13, ouro com as 25', () => {
  assert.equal(CONQUISTAS.length, 25);
  assert.equal(LIMIAR_PRATA, 13);
  assert.deepEqual([0, 12, 13, 24, 25].map(nivelPara), ['bronze', 'bronze', 'prata', 'prata', 'ouro']);
  assert.equal(metalLiberado('prata', 12), false);
  assert.equal(metalLiberado('prata', 13), true);
  assert.equal(metalLiberado('ouro', 24), false);
  assert.equal(metalLiberado('bronze', 0), true);
  assert.equal(metalLiberado('toString', 25), false);
  assert.equal(faltaPara(12), 'Falta 1 para a prata.');
  assert.equal(faltaPara(13), 'Faltam 12 para o ouro.');
  assert.equal(faltaPara(25), null);
});

test('o registro: lixo vira vazio, id desconhecido some, o resto passa', () => {
  const vazio = { encontradas: {}, placar: {}, visual: {} };
  for (const lixo of [null, 'texto', 42, [], { encontradas: [] }]) assert.deepEqual(lerAtelie(lixo), vazio);
  const lido = lerAtelie({
    encontradas: { sino: 1, inventada: 2, aba: 'ontem' },
    placar: { velha: { v: 2 }, ruim: 3 },
    visual: { metal: 'platina', cabeca: 'elmo' },
    codigo: 'OURO-AB2C',
  });
  assert.deepEqual(lido.encontradas, { sino: 1 });
  assert.deepEqual(lido.placar, { velha: { v: 2 }, ruim: {} });
  assert.deepEqual(lido.visual, { cabeca: 'elmo' });
  assert.equal(lido.codigo, 'OURO-AB2C');
  assert.equal(lerAtelie({ codigo: 'OURO-0000' }).codigo, undefined);
  assert.equal(lerAtelie({ zerado: 7 }).zerado, 7);
  assert.equal(lerAtelie({ zerado: 'ontem' }).zerado, undefined);
});

test('duas abas: a mescla une medalhas e placares, e o que veio antes de apagar não volta', () => {
  const disco = lerAtelie({
    encontradas: { sino: 5, nariz: 9 },
    placar: { papo: { n: 7, abriu: true }, caixas: { abertas: ['chat', 'lab'] }, velha: { v: 2, last: 'x........', first: 'o' } },
    visual: { metal: 'prata' },
    codigo: 'OURO-AAAA',
  });
  const aqui = lerAtelie({
    encontradas: { sino: 8, aba: 10 },
    placar: {
      papo: { n: 4 }, caixas: { abertas: ['lab', 'viral'] }, velha: { v: 1, last: 'o........', jogou: true },
      cartas: { lv: { facil: { v: 1 } } },
    },
    visual: { cabeca: 'elmo' },
    codigo: 'OURO-BBBB',
  });
  const m = mesclarAtelie(disco, aqui);
  assert.deepEqual(m.encontradas, { sino: 5, nariz: 9, aba: 10 });                        // fica a primeira data
  assert.deepEqual(m.placar.papo, { n: 7, abriu: true });                                  // o maior; o "sim" fica
  assert.deepEqual(m.placar.caixas.abertas.sort(), ['chat', 'lab', 'viral']);              // a união
  assert.deepEqual(m.placar.velha, { v: 2, last: 'o........', first: 'o', jogou: true });  // texto: o mais recente
  assert.deepEqual(m.placar.cartas, { lv: { facil: { v: 1 } } });
  assert.deepEqual(m.visual, { metal: 'prata', cabeca: 'elmo' });
  assert.equal(m.codigo, 'OURO-AAAA');                                                     // o que já estava gravado
  assert.deepEqual(mesclarAtelie(lerAtelie(null), aqui), aqui);                            // sem outra aba, nada muda

  // Apagado no disco às 100: o que esta aba sabia de antes some; só a medalha ganha depois fica.
  const apagado = lerAtelie({ zerado: 100 });
  const depois = mesclarAtelie(apagado, lerAtelie({ ...aqui, encontradas: { sino: 8, aba: 150 } }));
  assert.deepEqual(depois, { encontradas: { aba: 150 }, placar: {}, visual: {}, zerado: 100 });
  assert.deepEqual(mesclarAtelie(depois, aqui), depois);                                   // e nem na volta
  // Quem já sabia do apagar fica com as medalhas dele, mesmo com a data antes do zerado (o relógio voltou).
  const relogioVoltou = lerAtelie({ zerado: 100, encontradas: { sino: 40 } });
  assert.deepEqual(mesclarAtelie(apagado, relogioVoltou).encontradas, { sino: 40 });
});

test('tontura: soma enquanto gira, zera depois de 4 s parado', () => {
  let s = somarGiros(null, 5, 0);
  s = somarGiros(s, 4, 3000);
  assert.equal(s.total, 9);
  s = somarGiros(s, 6, 6900);              // 3,9 s depois do último: ainda conta
  assert.equal(s.total, 15);
  assert.equal(somarGiros(s, 2, 11000).total, 2);   // 4,1 s parado: recomeça
  assert.equal(somarGiros(s, 'x', 7000).total, 15);
});

test('código do prêmio: OURO- e 4 letras sem I, O, 0 e 1', () => {
  for (let i = 0; i < 50; i++) assert.match(gerarCodigo(), /^OURO-[A-HJ-NP-Z2-9]{4}$/);
  assert.equal(gerarCodigo(() => 0), 'OURO-AAAA');
  assert.equal(gerarCodigo(() => 0.999), 'OURO-9999');
});

test('as marcas: 25 e o vazio, 9 × 9, cantos livres', () => {
  assert.deepEqual(Object.keys(MARCAS).sort(), [...CONQUISTAS.map(c => c.id), 'vazio'].sort());
  for (const [id, linhas] of Object.entries(MARCAS)) {
    assert.equal(linhas.length, 9, id);
    for (const l of linhas) assert.match(l, /^[#.]{9}$/, id);
    assert.ok(linhas.join('').includes('#'), id);
    for (const [r, c] of [[0, 0], [0, 8], [8, 0], [8, 8]]) assert.equal(linhas[r][c], '.', `${id} canto ${r},${c}`);
  }
});

test('a moeda: disco simétrico de frente, estreita no giro, marca some abaixo de 0,6', () => {
  const frente = celulasDaMoeda(1);
  assert.equal(frente.length, 15);
  for (const l of frente) assert.equal(l.replace(/[^.]/g, 'x'), [...l.replace(/[^.]/g, 'x')].reverse().join(''));
  assert.equal(frente[7][0], 'l');                    // aro na luz (de cima à esquerda)…
  assert.equal(frente[7][14], 'd');                   // …e na sombra
  assert.equal(frente[7][7], 'm');                    // face no meio
  const marcada = celulasDaMoeda(1, MARCAS.sino);
  assert.equal(marcada[3][7], 'd');                   // o botão do sino, no alto do meio
  const estreita = celulasDaMoeda(0.5, MARCAS.sino);
  assert.ok(estreita[7].replace(/\./g, '').length < frente[7].replace(/\./g, '').length);
  assert.ok(estreita.join('').includes('s'));         // a borda escura do giro
  assert.equal(estreita.join('').replace(/[^d]/g, '').length < marcada.join('').replace(/[^d]/g, '').length, true);
});

test('sem DOM: desbloquear grava, pousa na hora e vira prata na 13ª', () => {
  const niveis = [];
  const desligar = ouvir('nivel', d => niveis.push(d.nivel));
  assert.equal(desbloquear('inventada'), false);
  assert.equal(desbloquear('sino'), true);
  assert.equal(desbloquear('sino'), false);
  assert.equal(tem('sino'), true);
  assert.equal(quantas(), 1);
  assert.equal(vestir({ metal: 'prata' }), false);
  assert.equal(vestir({ cabeca: 'elmo' }), false);
  for (const c of CONQUISTAS.slice(0, 13)) desbloquear(c.id);
  assert.equal(quantas(), 13);
  assert.equal(nivel(), 'prata');
  assert.equal(metal(), 'prata');
  assert.deepEqual(niveis, ['prata']);
  assert.equal(vestir({ metal: 'bronze' }), true);
  assert.equal(metal(), null);
  assert.equal(vestir({ metal: 'ouro' }), false);
  desbloquear('cabo');
  assert.equal(vestir({ cabeca: 'elmo' }), true);
  assert.equal(cabeca(), 'elmo');
  assert.deepEqual(visual(), { elmo: true, semBoina: false });
  desligar();
});

test('placar: lê sem salvar, mescla com patch', () => {
  assert.deepEqual(placar('velha'), {});
  assert.deepEqual(placar('velha', { v: 1, d: 2 }), { v: 1, d: 2 });
  assert.deepEqual(placar('velha', { v: 2 }), { v: 2, d: 2 });
});
