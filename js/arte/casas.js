// As quatro casas gregas do Contato, em SVG plano no estilo do campo: só formas com classe (as cores vêm do CSS e trocam
// à noite), sem contorno nem gradiente, luz de cima à esquerda (faces da direita e de baixo na sombra). Cada prédio
// recebe o nome do canal, entalhado no arquitrave, e o símbolo da rede, em relevo: trocar o canal de uma casa é trocar
// esses dois parâmetros, o prédio (lugar, tamanho e vez na ronda do mascote) continua o mesmo.
//
// desenhar(tipo, { largura, id, nome, simbolo }) → { svg, viewBox, largura, altura, topo, queda, assento: { x, y } }
//   Medidas em frações da largura w, com o chão em y = 0 e "para cima" negativo. topo é o y do alto do viewBox, queda a
//   distância dele até o chão e assento (em px do SVG, a partir do canto de cima) o ponto onde o mascote senta.
//   id deixa únicos os ids de recorte e do arco do nome.

export const TIPOS = ['tesouro', 'tholos', 'teatro', 'stoa'];

const n = v => Math.round(v * 100) / 100;
const forma = pontos => `M${pontos.map(([x, y]) => `${n(x)} ${n(y)}`).join('L')}Z`;
const escapar = texto => texto.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const ACHATA = 0.2;   // o tholos é visto um pouco de cima: elipses com ry = 0,2·rx

// Um desenho em construção: guarda as formas e o y mais alto usado (para a caixa do SVG).
function novoDesenho() {
  const partes = [];
  let topo = 0;
  const sobe = y => { if (y < topo) topo = y; };
  return {
    partes,
    get topo() { return topo; },
    ret(classe, x, y, w, h, canto = 0) {
      if (w <= 0 || h <= 0) return;
      sobe(y);
      partes.push(`<rect class="${classe}" x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}"${canto ? ` rx="${n(canto)}"` : ''}/>`);
    },
    poli(classe, pontos) {
      for (const [, y] of pontos) sobe(y);
      partes.push(`<path class="${classe}" d="${forma(pontos)}"/>`);
    },
    circulo(classe, cx, cy, r) { sobe(cy - r); partes.push(`<circle class="${classe}" cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}"/>`); },
    elipse(classe, cx, cy, rx, ry) { sobe(cy - ry); partes.push(`<ellipse class="${classe}" cx="${n(cx)}" cy="${n(cy)}" rx="${n(rx)}" ry="${n(ry)}"/>`); },
    cru(marcacao, alto = 0) { sobe(alto); partes.push(marcacao); },
  };
}

// ---------- peças comuns ----------

// Degraus de x0 a x1, cada um recuado dos dois lados; claros, com a base e a ponta direita na sombra. Devolve o piso.
function degraus(d, x0, x1, quantos, st, recuo) {
  for (let i = 0; i < quantos; i++) {
    const a = x0 + i * recuo, b = x1 - i * recuo, y = -(i + 1) * st;
    d.ret('cs-marmore', a, y, b - a, st);
    d.ret('cs-sombra', a, y + 0.62 * st, b - a, 0.38 * st);
    d.ret('cs-sombra', b - 0.9 * st, y, 0.9 * st, st);
  }
  return -quantos * st;
}

// Coluna: fuste de altura h que afina até 0,84 da base, terço direito na sombra, caneluras, e o capitel POR CIMA do
// fuste. Quem desenha a viga depois cobre o que sobrar dele: no tesouro só aparece a base do equino, na stoa e no tholos
// o capitel some atrás da viga, no teatro aparece quase inteiro. Quebrada (inteira < 1) fica sem capitel, com o topo em
// zigue-zague na fração da altura.
function coluna(d, x, yb, cw, h, inteira = 1) {
  const quebrada = inteira < 1;
  const fuste = h * inteira;
  const yt = yb - fuste;
  const alto = cw * (1 - 0.16 * inteira);                 // largura do fuste onde ele termina
  if (quebrada) {
    d.poli('cs-marmore', [[x - cw / 2, yb], [x + cw / 2, yb], [x + alto / 2, yt + 0.05 * cw], [x + 0.1 * cw, yt + 0.3 * cw], [x - 0.18 * cw, yt - 0.25 * cw], [x - alto / 2, yt]]);
    d.poli('cs-sombra', [[x + 0.16 * cw, yb], [x + cw / 2, yb], [x + alto / 2, yt + 0.05 * cw], [x + 0.15 * cw, yt + 0.26 * cw]]);
  } else {
    d.poli('cs-marmore', [[x - cw / 2, yb], [x + cw / 2, yb], [x + alto / 2, yt], [x - alto / 2, yt]]);
    d.poli('cs-sombra', [[x + 0.16 * cw, yb], [x + cw / 2, yb], [x + alto / 2, yt], [x + 0.16 * alto, yt]]);
  }
  const caneluras = Math.max(2, Math.round(cw / 5));
  const ys = yt + (quebrada ? 0.45 : 0.35) * cw;
  const larguraEm = y => cw - (cw - alto) * (yb - y) / (yb - yt);
  for (let i = 0; i < caneluras; i++) {
    const f = -0.39 + 0.78 * i / (caneluras - 1);
    const xb = x + f * cw, xs = x + f * larguraEm(ys);
    d.poli('cs-linha', [[xb - 0.4, yb], [xb + 0.4, yb], [xs + 0.4, ys], [xs - 0.4, ys]]);
  }
  if (quebrada) return;
  const ye = yt - 0.32 * cw;
  d.poli('cs-marmore', [[x - 0.42 * cw, yt], [x + 0.42 * cw, yt], [x + 0.66 * cw, ye], [x - 0.66 * cw, ye]]);
  d.poli('cs-sombra', [[x + 0.18 * cw, yt], [x + 0.42 * cw, yt], [x + 0.66 * cw, ye], [x + 0.3 * cw, ye]]);
  const ya = ye - 0.192 * cw;
  d.ret('cs-marmore', x - 0.72 * cw, ya, 1.44 * cw, 0.192 * cw);
  d.ret('cs-sombra', x + 0.3 * cw, ya, 0.42 * cw, 0.192 * cw);
}

// Porta: moldura clara (a faixa direita na sombra), vão escuro e a sombra do lintel. São as portas que acendem.
function porta(d, cx, yb, dw, dh, f) {
  d.ret('cs-marmore', cx - dw / 2 - f, yb - dh - f, dw + 2 * f, dh + f);
  d.ret('cs-sombra', cx + dw / 2, yb - dh - f, f, dh + f);
  d.ret('cs-porta', cx - dw / 2, yb - dh, dw, dh);
  d.ret('cs-porta-sombra', cx - dw / 2, yb - dh, dw, 0.18 * dh);
}

// Frontão sobre [x0, x1] na altura y: telha com a aresta direita na sombra, face de mármore e tímpano fundo. Devolve o
// y do ápice.
function frontao(d, x0, x1, y, sobe) {
  const L = x1 - x0, e = 0.025 * L, c = (x0 + x1) / 2;
  const apice = y - sobe - 1.4 * e;
  d.poli('cs-telha', [[x0 - e, y], [c, apice], [x1 + e, y]]);
  d.poli('cs-telha-sombra', [[c, apice], [x1 + e, y], [x1 - 0.6 * e, y], [c, y - sobe + 0.2 * e]]);
  d.poli('cs-marmore', [[x0 + 0.6 * e, y], [c, y - sobe + 0.2 * e], [x1 - 0.6 * e, y]]);
  d.poli('cs-fundo', [[c - 0.39 * L, y - 0.5 * e], [c, y - 0.78 * sobe - 0.2 * e], [c + 0.39 * L, y - 0.5 * e]]);
  return apice;
}

// Faixa do entablamento: mármore com os 22% de baixo na sombra.
function faixa(d, x0, x1, y, h) {
  d.ret('cs-marmore', x0, y, x1 - x0, h);
  d.ret('cs-sombra', x0, y + 0.78 * h, x1 - x0, 0.22 * h);
}

// Nome entalhado: Cinzel em maiúsculas; o x anda 0,14s para compensar o espaçamento que sobra depois da última letra.
function entalhe(d, texto, x, yBase, s) {
  d.cru(`<text class="cs-texto" x="${n(x + 0.14 * s)}" y="${n(yBase)}" font-size="${n(s)}" letter-spacing="${n(0.28 * s)}" text-anchor="middle">${escapar(texto)}</text>`, yBase - s);
}

// Pontos da metade de baixo (a da frente) de uma elipse, para x entre cx + u0·rx e cx + u1·rx.
function arco(cx, cy, rx, ry, u0, u1, passos = 24) {
  const a0 = Math.acos(Math.max(-1, Math.min(1, u0))), a1 = Math.acos(Math.max(-1, Math.min(1, u1)));
  return Array.from({ length: passos + 1 }, (_, i) => {
    const a = a0 + (a1 - a0) * i / passos;
    return [cx + rx * Math.cos(a), cy + ry * Math.sin(a)];
  });
}

// A frente de um cilindro (degrau, cela, cornija): a faixa entre a curva de baixo na base yb e a mesma curva h acima.
function face(d, classe, cx, yb, rx, ry, h, u0 = -1, u1 = 1) {
  d.poli(classe, [...arco(cx, yb - h, rx, ry, u0, u1), ...arco(cx, yb, rx, ry, u0, u1).reverse()]);
}

// Traço grosso como polígono (nada de stroke: a arte é só preenchimento).
function traco(d, classe, x1, y1, x2, y2, esp) {
  const L = Math.hypot(x2 - x1, y2 - y1) || 1;
  const ox = -(y2 - y1) / L * esp / 2, oy = (x2 - x1) / L * esp / 2;
  d.poli(classe, [[x1 + ox, y1 + oy], [x2 + ox, y2 + oy], [x2 - ox, y2 - oy], [x1 - ox, y1 - oy]]);
}

// Setor de anel em volta de (ox, oy), de a0 a a1 graus (medidos no sentido da tela: 90° aponta para baixo).
function setor(d, classe, ox, oy, r1, r2, a0, a1, passos = 8) {
  const ponto = (r, i) => { const a = (a0 + (a1 - a0) * i / passos) * Math.PI / 180; return [ox + r * Math.cos(a), oy + r * Math.sin(a)]; };
  d.poli(classe, [...Array.from({ length: passos + 1 }, (_, i) => ponto(r2, i)), ...Array.from({ length: passos + 1 }, (_, i) => ponto(r1, passos - i))]);
}

// ---------- símbolos em relevo ----------
// Desenhados numa caixa de altura L centrada em (cx, cy). Silhueta em cs-linha, vazados em cs-marmore; num disco ou
// num bloco (relevo), uma cópia em cs-sombra deslocada para baixo e à direita dá o volume.

const SIMBOLOS = {
  envelope(d, cx, cy, L) {
    const w = 1.76 * L, h = L, e = Math.max(1, 0.082 * L);
    d.ret('cs-linha', cx - w / 2, cy - h / 2, w, h);
    d.ret('cs-marmore', cx - w / 2 + e, cy - h / 2 + e, w - 2 * e, h - 2 * e);
    const ponta = cy + 0.12 * h;   // a aba em V desce dos cantos de cima até um pouco abaixo do meio
    traco(d, 'cs-linha', cx - w / 2 + e, cy - h / 2 + e, cx, ponta, 1.4 * e);
    traco(d, 'cs-linha', cx + w / 2 - e, cy - h / 2 + e, cx, ponta, 1.4 * e);
  },

  // A marca do GitHub, simplificada: o gato vazado num disco (cabeça, orelhas e o corpo descendo até a borda).
  github(d, cx, cy, L, relevo) {
    const r = L / 2;
    if (relevo) d.circulo('cs-sombra', cx + 0.08 * L, cy + 0.08 * L, r);
    d.circulo('cs-linha', cx, cy, r);
    d.elipse('cs-marmore', cx, cy - 0.06 * L, 0.25 * L, 0.19 * L);
    for (const lado of [-1, 1]) d.poli('cs-marmore', [[cx + lado * 0.245 * L, cy - 0.1 * L], [cx + lado * 0.21 * L, cy - 0.33 * L], [cx + lado * 0.07 * L, cy - 0.235 * L]]);
    d.poli('cs-marmore', [[cx - 0.1 * L, cy + 0.06 * L], [cx + 0.1 * L, cy + 0.06 * L], [cx + 0.11 * L, cy + 0.47 * L], [cx - 0.11 * L, cy + 0.47 * L]]);
  },

  // Balão de conversa redondo com a cauda embaixo à esquerda e um fone vazado: um arco grosso que passa por baixo à
  // esquerda, com as duas pontas (ouvido e boca) mais largas.
  whatsapp(d, cx, cy, L, relevo) {
    const R = L / 2;
    const balao = (x, y, classe) => {
      d.circulo(classe, x, y, R);
      d.poli(classe, [[x - 0.42 * R, y + 0.91 * R], [x - 1.05 * R, y + 1.05 * R], [x - 0.94 * R, y + 0.34 * R]]);
    };
    if (relevo) balao(cx + 0.16 * R, cy + 0.16 * R, 'cs-sombra');
    balao(cx, cy, 'cs-linha');
    const ox = cx + 0.3 * R, oy = cy - 0.3 * R;
    setor(d, 'cs-marmore', ox, oy, 0.4 * R, 0.64 * R, 100, 170);
    setor(d, 'cs-marmore', ox, oy, 0.26 * R, 0.68 * R, 84, 104, 3);
    setor(d, 'cs-marmore', ox, oy, 0.26 * R, 0.68 * R, 166, 186, 3);
  },

  // "in" vazado num quadrado de cantos redondos.
  linkedin(d, cx, cy, L, relevo) {
    const x0 = cx - L / 2, y0 = cy - L / 2, u = L / 10;
    if (relevo) d.ret('cs-sombra', x0 + 0.08 * L, y0 + 0.08 * L, L, L, 0.16 * L);
    d.ret('cs-linha', x0, y0, L, L, 0.16 * L);
    d.ret('cs-marmore', x0 + 1.8 * u, y0 + 4 * u, 1.6 * u, 4.3 * u);          // haste do i
    d.ret('cs-marmore', x0 + 1.8 * u, y0 + 1.6 * u, 1.6 * u, 1.6 * u);        // pingo
    d.ret('cs-marmore', x0 + 4.4 * u, y0 + 4 * u, 1.5 * u, 4.3 * u);          // perna esquerda do n
    d.ret('cs-marmore', x0 + 4.4 * u, y0 + 5.9 * u, 3.9 * u, 2.4 * u);        // corpo do n
    d.cru(`<path class="cs-marmore" d="M${n(x0 + 4.4 * u)} ${n(y0 + 5.9 * u)}A${n(1.95 * u)} ${n(1.9 * u)} 0 0 1 ${n(x0 + 8.3 * u)} ${n(y0 + 5.9 * u)}Z"/>`);
    d.ret('cs-linha', x0 + 5.9 * u, y0 + 6.4 * u, 0.9 * u, 1.95 * u);         // o vão de dentro do n
    d.cru(`<path class="cs-linha" d="M${n(x0 + 5.9 * u)} ${n(y0 + 6.45 * u)}A${n(0.45 * u)} ${n(0.45 * u)} 0 0 1 ${n(x0 + 6.8 * u)} ${n(y0 + 6.45 * u)}Z"/>`);
  },
};

const simbolo = (nome, ...args) => SIMBOLOS[nome]?.(...args);

// ---------- os prédios ----------
// Cada um desenha de trás para a frente e devolve o assento no sistema do desenho.

function tesouro(d, w, nome, simb) {
  const W = f => f * w;
  const piso = degraus(d, 0, w, 3, W(0.032), W(0.024));
  const colH = W(0.44), yTopo = piso - colH;
  d.ret('cs-fundo', W(0.14), yTopo, W(0.72), colH);                     // o fundo do pórtico
  porta(d, W(0.5), piso, W(0.15), W(0.27), W(0.022));
  for (const x0 of [0.09, 0.81]) {                                       // as duas paredes laterais (antas)
    d.ret('cs-marmore', W(x0), yTopo, W(0.1), colH);
    d.ret('cs-sombra', W(x0 + 0.065), yTopo, W(0.035), colH);
  }
  for (const x of [0.335, 0.665]) coluna(d, W(x), piso, W(0.085), colH - W(0.012));   // o capitel encosta na viga
  const yArq = yTopo - W(0.075);
  faixa(d, W(0.06), W(0.94), yArq, W(0.075));
  entalhe(d, nome, W(0.5), yTopo - W(0.024), W(0.043));
  const yFriso = yArq - W(0.062);
  faixa(d, W(0.06), W(0.94), yFriso, W(0.062));
  for (let i = 0; i < 8; i++) d.ret('cs-pintura', W(0.075 + 0.117 * i), yFriso + W(0.008), W(0.04), W(0.046));   // tríglifos
  const yCornija = yFriso - W(0.024);
  faixa(d, W(0.035), W(0.965), yCornija, W(0.024));
  const apice = frontao(d, W(0.035), W(0.965), yCornija, W(0.17));
  simbolo(simb, d, W(0.5), yCornija - W(0.068), W(0.085));
  // Acrotérios de telha: um no ápice (a base apoiada no caimento do telhado) e dois blocos nos cantos da cornija.
  d.poli('cs-telha', [[W(0.475), apice + W(0.0104)], [W(0.5), apice - W(0.04)], [W(0.525), apice + W(0.0104)]]);
  for (const x of [0.023, 0.937]) d.ret('cs-telha', W(x), yCornija - W(0.035), W(0.04), W(0.035));
  return { x: W(0.5), y: apice - W(0.035) };                             // na ponta do acrotério
}

function tholos(d, w, nome, simb, id) {
  const W = f => f * w, cx = W(0.5);
  let yc = W(-0.098);                                                    // a frente do degrau de baixo toca o chão
  for (const r of [0.49, 0.465, 0.44]) {
    const rx = W(r), ry = ACHATA * rx, h = W(0.028);
    face(d, 'cs-sombra', cx, yc, rx, ry, h);
    face(d, 'cs-fundo', cx, yc, rx, ry, h, 0.55, 1);
    d.elipse('cs-marmore', cx, yc - h, rx, ry);                          // o piso do degrau
    yc -= h;
  }
  const yP = yc;
  const rc = W(0.29), rcy = ACHATA * rc, hc = W(0.56);                   // a cela
  face(d, 'cs-marmore', cx, yP, rc, rcy, hc);
  face(d, 'cs-sombra', cx, yP, rc, rcy, hc, 0.4, 0.8);
  face(d, 'cs-fundo', cx, yP, rc, rcy, hc, 0.8, 1);
  const frente = yP + rcy;
  porta(d, cx, frente, W(0.12), W(0.24), W(0.018));
  const m = W(0.1), ym = frente - W(0.35);                               // medalhão sobre a porta
  d.circulo('cs-sombra', cx, ym, 0.78 * m);
  d.circulo('cs-marmore', cx - 0.03 * m, ym - 0.03 * m, 0.7 * m);
  simbolo(simb, d, cx - 0.03 * m, ym - 0.03 * m, 0.84 * m, true);
  // Seis colunas no semicírculo da frente, da esquerda para a direita; as duas da direita caíram.
  for (const [graus, inteira] of [[-90, 1], [-58, 1], [-22, 1], [22, 1], [58, 0.5], [90, 0.2]]) {
    const a = graus * Math.PI / 180;
    coluna(d, cx + W(0.4) * Math.sin(a), yP + W(0.08) * Math.cos(a), W(0.042 + 0.014 * Math.cos(a)), W(0.44), inteira);
  }
  // Entablamento em anel sobre as colunas, quebrado em zigue-zague perto de 0,7w.
  const re = W(0.435), rey = ACHATA * re, he = W(0.07), yE = yP - W(0.44);
  const u = x => (x - cx) / re;
  const meio = W(0.69);
  const meioY = yE - he / 2 + rey * Math.sqrt(1 - u(meio) ** 2);
  d.poli('cs-marmore', [...arco(cx, yE - he, re, rey, -1, u(W(0.72))), [meio, meioY], ...arco(cx, yE, re, rey, -1, u(W(0.715))).reverse()]);
  d.poli('cs-sombra', [...arco(cx, yE - 0.22 * he, re, rey, -1, u(W(0.708))), ...arco(cx, yE, re, rey, -1, u(W(0.715))).reverse()]);
  // O nome corre num arco invisível que acompanha a curva do entablamento, centrado a 40% (a direita caiu).
  const yArco = yE - 0.36 * he, s = W(0.031);
  d.cru(`<defs><path id="${id}-arco" d="M${n(cx - re)} ${n(yArco)}A${n(re)} ${n(rey)} 0 0 0 ${n(cx + re)} ${n(yArco)}"/></defs>`);
  d.cru(`<text class="cs-texto" font-size="${n(s)}" letter-spacing="${n(W(0.009))}" text-anchor="middle"><textPath href="#${id}-arco" startOffset="40%">${escapar(nome)}</textPath></text>`);
  // Cobertura: anel de cornija (metade direita na sombra), cone de telha com o terço direito na sombra, três fiadas e o
  // pináculo.
  const yT = yP - hc;
  const rk = W(0.325), rky = ACHATA * rk, hk = W(0.022);
  face(d, 'cs-marmore', cx, yT, rk, rky, hk, -1, 0);
  face(d, 'cs-sombra', cx, yT, rk, rky, hk, 0, 1);
  const yb = yT - hk, subida = W(0.19), apice = yb - subida;
  d.poli('cs-telha', [[cx, apice], ...arco(cx, yb, rk, rky, -1, 1)]);
  d.poli('cs-telha-sombra', [[cx, apice], ...arco(cx, yb, rk, rky, 1 / 3, 1)]);
  for (const f of [0.25, 0.5, 0.75]) {
    const rx = rk * (1 - f);
    face(d, 'cs-telha-sombra', cx, yb - f * subida, rx, ACHATA * rx, W(0.006));
  }
  d.circulo('cs-telha', cx, apice - W(0.012), W(0.018));
  return { x: cx, y: apice - W(0.02) };                                  // sobre o pináculo
}

function teatro(d, w, nome, simb, id) {
  const W = f => f * w, cx = W(0.5), cy = W(-0.1), Ry = W(0.33);
  // A arquibancada desabou à direita: recorte por uma linha que desce em degraus.
  const corte = [[-2, W(-0.5)], [W(0.64), W(-0.5)], [W(0.7), cy - 0.8 * Ry], [W(0.78), cy - 0.74 * Ry], [W(0.83), cy - 0.5 * Ry],
    [W(0.9), cy - 0.44 * Ry], [W(0.95), cy - 0.2 * Ry], [w, cy - 0.12 * Ry], [w + 2, cy + 2], [-2, cy + 2]];
  d.cru(`<clipPath id="${id}-ruina"><path d="${forma(corte)}"/></clipPath><g clip-path="url(#${id}-ruina)">`);
  for (let i = 9; i >= 1; i--) {                                         // nove fileiras, da maior para a menor
    const rx = W(0.5) * (0.34 + 0.66 * i / 9), ry = 0.66 * rx;
    const classe = i === 5 ? 'cs-fundo' : i % 2 ? 'cs-marmore' : 'cs-sombra';   // a 5ª é o corredor
    d.cru(`<path class="${classe}" d="M${n(cx - rx)} ${n(cy)}A${n(rx)} ${n(ry)} 0 0 1 ${n(cx + rx)} ${n(cy)}Z"/>`, cy - ry);
  }
  for (const graus of [18, 48, 90, 132, 162]) {                          // escadas radiais
    const a = graus * Math.PI / 180, dx = -Math.cos(a), dy = -0.66 * Math.sin(a), e = W(0.006);
    const [x1, y1, x2, y2] = [cx + W(0.17) * dx, cy + W(0.17) * dy, cx + W(0.5) * dx, cy + W(0.5) * dy];
    d.poli('cs-linha', [[x1 - e, y1], [x2 - e, y2], [x2 + e, y2], [x1 + e, y1]]);
  }
  d.cru('</g>');
  d.poli('cs-marmore', [[W(0.86), cy - 0.16 * Ry], [W(0.865), cy - 0.3 * Ry], [W(0.9), cy - 0.38 * Ry], [W(0.95), cy - 0.33 * Ry], [W(0.945), cy - 0.16 * Ry]]);
  d.poli('cs-sombra', [[W(0.92), cy - 0.36 * Ry], [W(0.95), cy - 0.33 * Ry], [W(0.945), cy - 0.16 * Ry], [W(0.92), cy - 0.16 * Ry]]);
  // O palco (skene): degraus, fundo, três portas, colunetas (sem as duas junto da porta do meio) e pilastras nas pontas.
  const piso = degraus(d, W(0.08), W(0.92), 2, W(0.02), W(0.012));
  const yTopo = piso - W(0.15);
  d.ret('cs-fundo', W(0.1), yTopo, W(0.8), W(0.15));
  porta(d, cx, piso, W(0.08), W(0.1), W(0.012));
  for (const x of [0.3, 0.7]) porta(d, W(x), piso, W(0.05), W(0.075), W(0.01));
  for (let i = 0; i < 12; i++) {
    const x = W(0.115 + 0.07 * i);
    if (Math.abs(x - cx) >= W(0.05)) coluna(d, x, piso, W(0.022), W(0.14));
  }
  d.ret('cs-marmore', W(0.1), yTopo, W(0.03), W(0.15));
  d.ret('cs-marmore', W(0.87), yTopo, W(0.03), W(0.15));
  d.ret('cs-sombra', W(0.888), yTopo, W(0.012), W(0.15));
  const yArq = yTopo - W(0.045);
  faixa(d, W(0.08), W(0.92), yArq, W(0.045));
  entalhe(d, nome, cx, yTopo - W(0.013), W(0.026));
  const apice = frontao(d, W(0.38), W(0.62), yArq, W(0.085));
  simbolo(simb, d, cx, yArq - W(0.03), W(0.052));
  return { x: cx, y: apice };                                            // no ápice do frontão do palco
}

function stoa(d, w, nome, simb) {
  const W = f => f * w;
  const piso = degraus(d, 0, w, 2, W(0.02), W(0.01));
  const yTopo = piso - W(0.2);
  d.ret('cs-fundo', W(0.03), yTopo, W(0.94), W(0.2));                    // parede do fundo
  d.ret('cs-sombra', W(0.03), yTopo, W(0.94), W(0.012));
  for (const x of [0.18, 0.41, 0.64, 0.87]) porta(d, W(x), piso, W(0.055), W(0.11), W(0.01));   // lojas
  [1, 1, 1, 1, 1, 1, 1, 1, 0.62, 0.3, 0.12].forEach((inteira, i) => coluna(d, W(0.045 + 0.091 * i), piso, W(0.03), W(0.2), inteira));
  // Arquitrave só sobre as oito colunas inteiras, com a ponta direita quebrada.
  const fim = W(0.045 + 0.091 * 7 + 0.03), ha = W(0.035), yArq = yTopo - ha;
  d.poli('cs-marmore', [[W(0.02), yTopo], [W(0.02), yArq], [fim, yArq], [fim + W(0.005), yArq + 0.45 * ha], [fim - W(0.006), yArq + 0.65 * ha], [fim - W(0.002), yTopo]]);
  d.poli('cs-sombra', [[W(0.02), yTopo], [W(0.02), yTopo - 0.22 * ha], [fim - W(0.004), yTopo - 0.22 * ha], [fim - W(0.002), yTopo]]);
  entalhe(d, nome, (W(0.02) + fim) / 2, yTopo - 0.27 * ha, W(0.022));
  // Telhado de uma água: juntas verticais e a faixa de cima na sombra, ponta direita quebrada.
  const ht = W(0.05), yTelhado = yArq - ht;
  d.poli('cs-telha', [[W(0.005), yArq], [W(0.03), yTelhado], [fim - W(0.04), yTelhado], [fim - W(0.02), yArq - 0.55 * ht], [fim, yArq - 0.4 * ht], [fim + W(0.025), yArq]]);
  for (let x = W(0.058); x < fim - W(0.045); x += W(0.028)) d.ret('cs-telha-sombra', x, yTelhado, W(0.005), ht);
  d.ret('cs-telha-sombra', W(0.03), yTelhado, fim - W(0.07), 0.16 * ht);
  // Um pedaço de arquitrave caído no chão.
  d.poli('cs-marmore', [[W(0.84), 0], [W(0.84), W(-0.02)], [W(0.935), W(-0.026)], [W(0.935), 0]]);
  d.poli('cs-sombra', [[W(0.915), 0], [W(0.915), W(-0.0245)], [W(0.935), W(-0.026)], [W(0.935), 0]]);
  // O bloco do símbolo, na frente, afundado um pouco no chão.
  const bx = W(0.2), bw = W(0.085), bh = W(0.075), yBloco = W(0.008) - bh;
  d.ret('cs-marmore', bx - bw / 2, yBloco, bw, bh);
  d.ret('cs-sombra', bx + bw / 4, yBloco, bw / 4, bh);
  d.ret('cs-sombra', bx - bw / 2, yBloco + 0.88 * bh, bw, 0.12 * bh);
  simbolo(simb, d, bx - W(0.006), yBloco + 0.45 * bh, 0.62 * bw, true);
  return { x: W(0.36), y: yTelhado };                                    // na beira de cima do telhado
}

const PREDIOS = { tesouro, tholos, teatro, stoa };

export function desenhar(tipo, { largura: w, id = `casa-${tipo}`, nome = '', simbolo: simb } = {}) {
  const d = novoDesenho();
  const assento = PREDIOS[tipo](d, w, nome.toUpperCase(), simb, id);
  // Folga de 0,02w em cima e 0,01w embaixo do chão; a altura vira inteira para o SVG caber 1:1 na caixa.
  const topo = d.topo - 0.02 * w;
  const altura = Math.ceil(-topo + 0.01 * w);
  return {
    svg: d.partes.join(''), viewBox: `0 ${n(topo)} ${w} ${altura}`,
    largura: w, altura, topo, queda: -topo,
    assento: { x: assento.x, y: assento.y - topo },
  };
}
