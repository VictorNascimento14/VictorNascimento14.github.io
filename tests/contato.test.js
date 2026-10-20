// Contato: o campo e as casas batem com os valores de conferência da especificação 05 (§4.5), e o campo é o mesmo a
// cada desenho (semente fixa).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { desenhar as campo } from '../js/arte/campo.js';
import { desenhar as casa } from '../js/arte/casas.js';

const PONTOS = {
  stoa: [0.19, 340, 'encosta', 4], teatro: [0.8, 380, 'encosta', 4], tesouro: [0.36, 245, 'perto', 8], tholos: [0.64, 220, 'perto', 8],
};

// Em 1440 × 900: largura · x · chão · topo do SVG · assento (x, y), como na tabela da spec.
const ESPERADO = {
  stoa: [340, 274, 429, 312, 226, 319], teatro: [380, 1152, 434, 263, 1152, 309],
  tesouro: [245, 518, 735, 500, 519, 506], tholos: [220, 922, 722, 501, 922, 508],
};

test('casas em 1440 × 900 no lugar da tabela de conferência', () => {
  const d = campo({ largura: 1440, altura: 900, horizonte: 378 });
  assert.equal(Math.round(d.santuario.topo), 197);
  for (const [tipo, [fracao, largura, camada, afunda]] of Object.entries(PONTOS)) {
    const x = Math.round(1440 * fracao);
    const c = casa(tipo, { largura, nome: 'X', simbolo: 'envelope' });
    let base = -Infinity;
    for (let i = 0; i < 9; i++) base = Math.max(base, d.chao[camada](x - 0.45 * largura + 0.9 * largura * i / 8));
    base = Math.round(base + afunda);
    const left = Math.round(x - largura / 2), topo = Math.round(base - c.queda);
    const obtido = [largura, x, base, topo, Math.round(left + c.assento.x), Math.round(topo + c.assento.y)];
    obtido.forEach((v, i) => assert.ok(Math.abs(v - ESPERADO[tipo][i]) <= 1, `${tipo}: ${obtido} ≠ ${ESPERADO[tipo]}`));
  }
});

test('mesmo tamanho, mesmo prado', () => {
  const a = campo({ largura: 802, altura: 844, horizonte: 253 }).svg;
  assert.equal(campo({ largura: 802, altura: 844, horizonte: 253 }).svg, a);
});
