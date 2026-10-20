// A caixa de bronze de cada projeto, em pixel art: um baú visto de frente, de lado e de cima, com tampa que gira para
// trás na dobradiça até 104°, boca que acende, raios e pontinhos de luz, faíscas do golpe e o numeral na plaqueta.
// A arte é própria (moldura em relevo, cravos de cabeça redonda, coroa de oliveira, friso de contas, argola na
// lateral); a geometria segue a spec 02 (§3.1, §4.4, §6), porque é nela que o anel, o cartão e o golpe se apoiam.
//
// Espaço do sprite: px de sprite, (0,0) no canto superior esquerdo da caixa FECHADA, x à direita, y para baixo.
// Um ponto 3D (x, y, z) — x à direita, y para cima a partir do chão, z para trás a partir da frente — cai na tela em
//   coluna = 12 + x − z·12/22      linha = 55 − y − z·6/22
// (perspectiva cavaleira: o fundo sobe e vai para a esquerda). Duas camadas, dois canvas: a de trás (boca, tampa,
// raios, pontinhos) e a da frente (chão, corpo, faíscas). O cartão do projeto mora entre as duas.

export const FRENTE = 38;                  // largura da frente (x)
export const CORPO = 40;                   // altura do corpo (y)
export const LAJE = 6;                     // espessura da laje da tampa
export const DEGRAU = 3;                   // altura da tampinha em degrau sobre a laje
export const FUNDO = 22;                   // profundidade (z)
export const DESVIO = { x: 12, y: 6 };     // quanto a profundidade inteira anda na tela (para a esquerda e para cima)
export const LARGURA = DESVIO.x + FRENTE;  // 50: largura do sprite fechado
export const ALTURA = DESVIO.y + CORPO + LAJE + DEGRAU;  // 55: altura do sprite fechado
export const BORDA = ALTURA - CORPO;       // 15: linha da borda da frente, onde a tampa encontra o corpo
export const ABERTA = 104 * Math.PI / 180; // a tampa aberta em repouso, quase em pé e inclinada para trás
// Área desenhável. x0 = −9 (o original usava −2 e cortava a lateral da tampa aberta, spec 02 R1); y0 dá folga à tampa
// e aos raios; y1 cobre a sombra no chão. Tudo que posiciona passa por em(), então só o tamanho do canvas muda.
export const AREA = { x0: -9, y0: -26, x1: 53, y1: 58 };
export const EMENDA = { x: 47, y: 15 };    // onde a ponta do cinzel bate: a emenda, 3 px antes do canto direito
export const BOCA = { x: 31, y: 15 };      // meio da borda da frente
export const PE = { x: 28, y: 57 };        // ponto de apoio no anel: entre o meio do sprite e o da boca, sob a sombra

// Chaves de cor. b → h vão do mais fundo ao realce; G é o brilho quente; S a sombra no chão; g e q a luz translúcida.
const B = 1, D = 2, M = 3, L = 4, H = 5, G = 6, S = 7, RAIO = 8, PONTA = 9;
const CHAVES = ['', 'b', 'd', 'm', 'l', 'h', 'G', 'S', 'g', 'q'];
const clarear = c => (c >= B && c < H ? c + 1 : c);   // um tom acima: b→d→m→l→h (h e G ficam)
const opaco = c => c >= B && c <= G;

export const SOMBRA = 'rgba(40,30,18,.22)';
export const PALETAS = {
  bronze: { b: '#3a2b1b', d: '#5c4427', m: '#8d6a3b', l: '#c09760', h: '#e8cb95', G: '#f8e9c2', g: 'rgba(240,214,160,.5)', q: 'rgba(240,214,160,.26)' },
  prata: { b: '#2e3236', d: '#5b636a', m: '#939ca4', l: '#c3cbd1', h: '#eef2f4', G: '#fbfdfe', g: 'rgba(226,236,243,.5)', q: 'rgba(226,236,243,.26)' },
  ouro: { b: '#5a3b0b', d: '#986810', m: '#cc961b', l: '#ecc145', h: '#fdeeab', G: '#fff8d6', g: 'rgba(252,226,140,.5)', q: 'rgba(252,226,140,.26)' },
};

// ---------- a arte das faces ----------

// Frente do corpo, 38 × 40: moldura em relevo, cravos, coroa de oliveira, plaqueta rebaixada e plinto com friso.
// Ramo esquerdo da coroa, desenhado à mão do laço até o alto; o direito é o espelho em u = 38 − u.
const RAMO = [
  [19, 25, H], [18, 25, L], [18, 26, D], [17, 27, D], [19, 26, B],                         // laço e pontas da fita
  [17, 25, D], [16, 25, D], [15, 24, D], [14, 24, D], [13, 23, D], [12, 22, D], [12, 21, D], // caule de 1 px
  [11, 20, D], [11, 19, D], [10, 18, D], [10, 17, D], [10, 16, D], [10, 15, D], [11, 14, D],
  [11, 13, D], [12, 12, D], [12, 11, D], [13, 10, D], [14, 9, D],
  [14, 25, L], [13, 25, H], [12, 23, L], [11, 22, H], [10, 20, L], [9, 19, H], [9, 17, L], [8, 16, H], // folhas de fora
  [9, 14, L], [8, 13, H], [11, 12, L], [10, 11, H], [12, 10, L], [12, 9, H], [14, 8, L], [14, 7, H],
  [15, 23, L], [16, 22, L], [13, 21, L], [12, 18, L], [12, 17, H], [11, 15, L], [12, 14, H],          // folhas de dentro
  [13, 12, L], [13, 11, H], [15, 9, L],
];

// Numerais da plaqueta (5 linhas, centrados na coluna 19). I a III com serifas que se unem; IV e V como letra.
const GLIFOS = {
  I: ['###', '.#.', '.#.', '.#.', '###'],
  II: ['#####', '.#.#.', '.#.#.', '.#.#.', '#####'],
  III: ['#######', '.#.#.#.', '.#.#.#.', '.#.#.#.', '#######'],
  IV: ['#.#...#', '#.#...#', '#..#.#.', '#..#.#.', '#...#..'],
  V: ['##...##', '.#...#.', '.#...#.', '..#.#..', '...#...'],
  '?': ['.###.', '....#', '..##.', '.....', '..#..'],
};

function desenharFrente() {
  const g = new Uint8Array(FRENTE * CORPO).fill(M);
  const p = (u, v, c) => { if (u >= 0 && u < FRENTE && v >= 0 && v < CORPO) g[v * FRENTE + u] = c; };
  // moldura: aresta de fora clara em cima e à esquerda, escura embaixo e à direita; miolo claro; o painel recebe a
  // sombra da moldura na primeira linha e na primeira coluna
  for (let u = 2; u <= 35; u++) { p(u, 2, H); p(u, 31, D); }
  for (let v = 2; v <= 31; v++) { p(2, v, H); p(35, v, D); }
  for (let u = 3; u <= 34; u++) { p(u, 3, L); p(u, 30, L); }
  for (let v = 3; v <= 30; v++) { p(3, v, L); p(34, v, L); }
  p(35, 2, L); p(2, 31, L);
  for (let u = 4; u <= 33; u++) p(u, 4, D);
  for (let v = 4; v <= 29; v++) p(4, v, D);
  // cravos de cabeça redonda nos cantos do painel
  for (const [u, v] of [[6, 6], [30, 6], [6, 26], [30, 26]]) { p(u, v, H); p(u + 1, v, L); p(u, v + 1, L); p(u + 1, v + 1, B); }
  // plinto: filete escuro, aresta na luz, friso de contas e base
  for (let u = 0; u < FRENTE; u++) { p(u, 33, D); p(u, 34, H); p(u, 35, L); p(u, 36, M); p(u, 37, M); p(u, 38, D); p(u, 39, B); }
  for (let u = 3; u <= 35; u += 3) { p(u, 36, L); p(u, 37, D); }
  // bordas da face: sombra sob a tampa, quina na luz à esquerda, aresta na sombra à direita
  for (let u = 0; u < FRENTE; u++) p(u, 0, D);
  for (let v = 0; v < CORPO; v++) { p(0, v, L); p(FRENTE - 1, v, D); }
  // plaqueta rebaixada, 11 × 9: paredes de cima e da esquerda na sombra, de baixo e da direita na luz
  for (let u = 14; u <= 24; u++) for (let v = 12; v <= 20; v++) p(u, v, v === 12 || u === 14 ? B : v === 20 || u === 24 ? L : D);
  for (const [u, v, c] of RAMO) { p(u, v, c); p(FRENTE - u, v, c); }
  return g;
}

const FRENTE_BASE = desenharFrente();
const frentes = new Map();   // numeral → frente com o numeral gravado

function frenteCom(numeral) {
  let g = frentes.get(numeral);
  if (g) return g;
  g = FRENTE_BASE.slice();
  const linhas = GLIFOS[numeral] ?? GLIFOS.I;
  const u0 = 19 - (linhas[0].length >> 1);
  linhas.forEach((linha, dv) => [...linha].forEach((c, du) => { if (c === '#') g[(14 + dv) * FRENTE + u0 + du] = H; }));
  frentes.set(numeral, g);
  return g;
}

// Lateral do corpo: 12 colunas da tela (u = 0 atrás, 12 na quina) × 40 linhas. Em sombra, com painel rebaixado,
// o plinto dando a volta e uma argola pendurada num botão. A projeção cisalha tudo meia linha por coluna.
function desenharLateral() {
  const g = new Uint8Array(DESVIO.x * CORPO).fill(D);
  const p = (u, v, c) => { if (u >= 0 && u < DESVIO.x && v >= 0 && v < CORPO) g[v * DESVIO.x + u] = c; };
  for (let u = 1; u < 11; u++) p(u, 0, M);
  for (let u = 0; u < 11; u++) { p(u, 33, B); p(u, 34, M); p(u, 38, B); p(u, 39, B); }
  for (let u = 2; u <= 9; u++) p(u, 3, B);
  for (let v = 3; v <= 30; v++) p(2, v, B);
  const argola = [
    [5, 10, H], [6, 10, L], [5, 11, L], [6, 11, M], [5, 12, M], [6, 12, B],   // botão
    [4, 13, L], [7, 13, M], [3, 14, L], [8, 14, M], [3, 15, L], [8, 15, M],
    [3, 16, L], [8, 16, M], [3, 17, L], [8, 17, B], [4, 18, L], [7, 18, B], [5, 19, M], [6, 19, B],
  ];
  for (const [u, v, c] of argola) p(u, v, c);
  for (let v = 0; v < CORPO; v++) { p(0, v, B); p(DESVIO.x - 1, v, L); }
  return g;
}

const LATERAL = desenharLateral();

function texturaFrente(s, t, frente, brilho, reflexo) {
  const u = Math.floor(s * FRENTE), v = Math.floor(t * CORPO);
  let c = frente[v * FRENTE + u];
  if (brilho > 0.05 && v < 2) {
    // a luz de dentro transborda pela borda de cima
    const a = Math.abs(u - 18.5) / 19;
    if (a < 0.86 * brilho) c = v === 0 ? (a < 0.46 * brilho ? G : H) : clarear(c);
  }
  if (reflexo !== null && u + v >= reflexo && u + v < reflexo + 3) c = clarear(c);
  return c;
}

const texturaLateral = (s, t) => LATERAL[Math.floor(t * CORPO) * DESVIO.x + Math.floor(s * DESVIO.x)];

function texturaBoca(s, t, brilho) {
  const u = Math.floor(s * FRENTE);
  if (t > 0.9 || u === 0) return L;                  // lábios da frente e da esquerda, na luz
  if (t < 0.18 || u === FRENTE - 1) return D;        // parede de trás e lábio da direita
  if (brilho > 0.05) {
    const c = Math.hypot((s - 0.5) * 2, (t - 0.56) * 1.45);
    if (c < 0.4 * brilho) return G;
    if (c < 0.76 * brilho) return H;
    if (c < 0.94 * brilho) return L;
  }
  return B;
}

function texturaTopoLaje(s, t) {
  const u = Math.floor(s * FRENTE);
  if (t > 0.84 || u === 0) return H;   // quina da frente e aresta da esquerda, na luz
  if (t < 0.13 || u === FRENTE - 1) return M;
  return L;
}

function texturaFrenteLaje(s, t) {
  const u = Math.floor(s * FRENTE), v = Math.floor(t * LAJE);
  if (v === LAJE - 1) return B;                       // a junta com o corpo
  if (v === 0) return H;
  if (u === 0) return L;
  if (u === FRENTE - 1) return D;
  if ((v === 2 || v === 3) && u >= 4 && u <= 33) {    // fileira de contas, simétrica em 18,5
    const r = u % 4;
    if (r === 0) return v === 2 ? H : L;
    if (r === 1) return v === 2 ? L : D;
  }
  return M;
}

function texturaLateralLaje(s, t) {
  const v = Math.floor(t * LAJE);
  return v === 0 ? L : v === LAJE - 1 ? B : D;
}

function texturaDentro(s, t) {
  // lado de dentro da tampa (aparece quando ela sobe): aro, faixa, sulco do painel e um losango em relevo no meio
  const u = Math.floor(s * FRENTE), w = Math.floor(t * FUNDO);
  if (u === 0 || u === FRENTE - 1 || w === 0 || w === FUNDO - 1) return M;
  if (u < 3 || u > FRENTE - 4 || w < 3 || w > FUNDO - 4) return D;
  if (u === 3 || w === 3) return B;
  const r = Math.abs(u - 18.5) + Math.abs(w - 11);
  if (r < 3.6) return r < 1.6 ? L : M;
  return D;
}

function texturaTopoTampinha(s, t) {
  return t > 0.72 || Math.floor(s * 30) === 0 ? H : L;
}

function texturaFrenteTampinha(s, t) {
  const u = Math.floor(s * 30), v = Math.floor(t * DEGRAU);
  if (v === 0) return H;
  if (v === DEGRAU - 1) return D;
  return u === 0 ? L : u === 29 ? D : M;
}

const texturaLateralTampinha = (s, t) => (Math.floor(t * DEGRAU) === 0 ? M : D);

// ---------- geometria ----------

const COLUNAS = AREA.x1 - AREA.x0;
const LINHAS = AREA.y1 - AREA.y0;

const novaCamada = () => ({ grade: new Uint8Array(COLUNAS * LINHAS), sobre: [] });

function por(camada, i, j, cor) {
  const x = i - AREA.x0, y = j - AREA.y0;
  if (x >= 0 && y >= 0 && x < COLUNAS && y < LINHAS) camada.grade[y * COLUNAS + x] = cor;
}

// Por cima da grade, na ordem: luz translúcida, pontinhos e faíscas.
function sobre(camada, i, j, cor) {
  if (i >= AREA.x0 && i < AREA.x1 && j >= AREA.y0 && j < AREA.y1) camada.sobre.push(i, j, cor);
}

const projetar = ([x, y, z]) => [DESVIO.x + x - z * DESVIO.x / FUNDO, ALTURA - y - z * DESVIO.y / FUNDO];

// A tampa gira em torno da aresta de trás da sua face de baixo (y = 40, z = 22); ângulo positivo levanta a frente.
function dobrar([x, y, z], cos, sen) {
  const dy = y - CORPO, dz = z - FUNDO;
  return [x, CORPO + dy * cos - dz * sen, FUNDO + dy * sen + dz * cos];
}

// Rasteriza o paralelogramo p0 + s·(p1 − p0) + t·(p2 − p0), amostrando no centro de cada pixel. Face de costas ou de
// lado (determinante ≤ 0,01) não aparece: é isso que esconde o topo e mostra o lado de dentro quando a tampa sobe.
function face(camada, p0, p1, p2, textura) {
  const [ax, ay] = projetar(p0), [bx, by] = projetar(p1), [cx, cy] = projetar(p2);
  const e1x = bx - ax, e1y = by - ay, e2x = cx - ax, e2y = cy - ay;
  const det = e1x * e2y - e1y * e2x;
  if (det <= 0.01) return;
  const xs = [ax, bx, cx, bx + e2x], ys = [ay, by, cy, by + e2y];
  const i0 = Math.floor(Math.min(...xs)), i1 = Math.ceil(Math.max(...xs));
  const j0 = Math.floor(Math.min(...ys)), j1 = Math.ceil(Math.max(...ys));
  for (let j = j0; j < j1; j++) {
    const py = j + 0.5 - ay;
    for (let i = i0; i < i1; i++) {
      const px = i + 0.5 - ax;
      const s = (px * e2y - py * e2x) / det, t = (e1x * py - e1y * px) / det;
      if (s < 0 || s >= 1 || t < 0 || t >= 1) continue;
      const cor = textura(s, t);
      if (cor) por(camada, i, j, cor);
    }
  }
}

function chao(camada) {
  // sombra achatada no chão, um pouco para a direita (a luz vem da esquerda); não treme
  for (let i = 1; i <= 51; i++) {
    const a = Math.abs(i - 26) / 25.5;
    if (a < 0.97) por(camada, i, ALTURA, S);
    if (a < 0.85) por(camada, i, ALTURA + 1, S);
  }
}

function raios(camada, brilho, tempo) {
  // colunas de luz que sobem da boca, balançando; a base fica no meio da boca
  for (let i = 7; i <= 42; i++) {
    const x = i - 25;
    const balanco = Math.sin(1.3 * i + 2.7 * tempo) + 0.8 * Math.sin(0.47 * i - 1.7 * tempo);
    if (balanco < 0.15) continue;
    const comprimento = Math.round(brilho * (8 + 13 * (1 - Math.abs(x) / 20) + 4 * balanco));
    for (let k = 0; k < comprimento; k++) sobre(camada, i, BORDA - DESVIO.y / 2 - 1 - k, k < comprimento * 0.58 ? RAIO : PONTA);
  }
}

function pontinhos(camada, brilho, tempo) {
  for (let n = 0; n < 9; n++) {
    const vida = (0.5 * tempo + 0.31 * n) % 1;
    if (vida >= 0.88) continue;
    const i = Math.round(11 + ((12.7 * n) % 28) + 1.4 * Math.sin(1.8 * tempo + 1.3 * n));
    sobre(camada, i, Math.round(10 - 27 * brilho * vida), vida < 0.46 ? G : H);
  }
}

// Monta um quadro: { tras, frente }. estado: numeral ('I'…'V' | '?'), tampa (0…1,1; 1 = aberta), brilho (0…1),
// reflexo (diagonal clara na frente: inteiro | null), tempo (s, anima raios e pontinhos), faiscas ([{ x, y, vida }]).
export function quadro(estado = {}) {
  const tras = novaCamada(), frente = novaCamada();
  const tampa = Math.min(1.1, Math.max(0, estado.tampa ?? 0));
  const brilho = estado.brilho ?? 0, tempo = estado.tempo ?? 0;
  const fi = tampa * ABERTA, cos = Math.cos(fi), sen = Math.sin(fi);
  const gira = (x, y, z) => dobrar([x, y, z], cos, sen);

  chao(frente);
  const comNumeral = frenteCom(estado.numeral ?? 'I');
  const reflexo = estado.reflexo ?? null;
  face(frente, [0, CORPO, 0], [FRENTE, CORPO, 0], [0, 0, 0], (s, t) => texturaFrente(s, t, comNumeral, brilho, reflexo));
  face(frente, [0, CORPO, FUNDO], [0, CORPO, 0], [0, 0, FUNDO], texturaLateral);

  const topo = CORPO + LAJE, alto = topo + DEGRAU;
  const boca = () => face(tras, [0, CORPO, FUNDO], [FRENTE, CORPO, FUNDO], [0, CORPO, 0], (s, t) => texturaBoca(s, t, brilho));
  const laje = () => {
    face(tras, gira(0, topo, FUNDO), gira(FRENTE, topo, FUNDO), gira(0, topo, 0), texturaTopoLaje);
    face(tras, gira(0, topo, 0), gira(FRENTE, topo, 0), gira(0, CORPO, 0), texturaFrenteLaje);
    face(tras, gira(0, topo, FUNDO), gira(0, topo, 0), gira(0, CORPO, FUNDO), texturaLateralLaje);
    face(tras, gira(0, CORPO, 0), gira(FRENTE, CORPO, 0), gira(0, CORPO, FUNDO), texturaDentro);
  };
  const tampinha = () => {
    face(tras, gira(4, alto, 16), gira(34, alto, 16), gira(4, alto, 6), texturaTopoTampinha);
    face(tras, gira(4, alto, 6), gira(34, alto, 6), gira(4, topo, 6), texturaFrenteTampinha);
    face(tras, gira(4, alto, 16), gira(4, alto, 6), gira(4, topo, 16), texturaLateralTampinha);
  };
  // Até 90° a tampa passa por cima da boca; depois dela, fica atrás.
  if (fi < Math.PI / 2) { boca(); laje(); tampinha(); } else { tampinha(); laje(); boca(); }
  if (brilho > 0.05) { raios(tras, brilho, tempo); pontinhos(tras, brilho, tempo); }
  for (const f of estado.faiscas ?? []) sobre(frente, Math.round(f.x), Math.round(f.y), f.vida < 0.35 ? G : H);
  return { tras, frente };
}

// Pinta uma camada com o (0,0) do sprite em (x, y) px CSS, num contexto em px de dispositivo (k = razão). Cada borda
// de pixel é arredondada sozinha para o px de dispositivo: assim um P fracionário (no meio de um giro) continua
// nítido. Dois passes: primeiro o chão e a sombra de 1 px (para baixo e para a direita) de todo pixel opaco, depois as
// cores. A tremida desloca tudo, menos o chão.
export function pintarCamada(ctx, camada, x, y, P, k, tremida = 0, paleta = PALETAS.bronze) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const { grade, sobre: extra } = camada;
  const borda = (desvio, i) => Math.round((desvio + (i + AREA.x0) * P) * k);
  const X = i => borda(x, i), Xt = i => borda(x + tremida * P, i);
  const Y = j => Math.round((y + (j + AREA.y0) * P) * k);

  // corridas horizontais da mesma cor: um retângulo por corrida
  const corridas = (vale, pinta) => {
    for (let j = 0; j < LINHAS; j++) {
      let i = 0;
      while (i < COLUNAS) {
        const c = vale(j * COLUNAS + i);
        if (!c) { i++; continue; }
        let f = i + 1;
        while (f < COLUNAS && vale(j * COLUNAS + f) === c) f++;
        pinta(c, i, f, j);
        i = f;
      }
    }
  };

  // passe 1: chão parado e a sombra de 1 px de cada pixel opaco
  ctx.fillStyle = SOMBRA;
  corridas(n => (grade[n] === S ? 1 : 0), (c, i, f, j) => ctx.fillRect(X(i), Y(j), X(f) - X(i), Y(j + 1) - Y(j)));
  const sombra = new Uint8Array(COLUNAS * LINHAS);
  const marcar = (gi, gj) => { if (gi + 1 < COLUNAS && gj + 1 < LINHAS) sombra[(gj + 1) * COLUNAS + gi + 1] = 1; };
  for (let n = 0; n < grade.length; n++) if (opaco(grade[n])) marcar(n % COLUNAS, (n / COLUNAS) | 0);
  for (let n = 0; n < extra.length; n += 3) if (opaco(extra[n + 2])) marcar(extra[n] - AREA.x0, extra[n + 1] - AREA.y0);
  corridas(n => sombra[n], (c, i, f, j) => ctx.fillRect(Xt(i), Y(j), Xt(f) - Xt(i), Y(j + 1) - Y(j)));

  // passe 2: as cores
  corridas(n => (opaco(grade[n]) ? grade[n] : 0), (c, i, f, j) => {
    ctx.fillStyle = paleta[CHAVES[c]];
    ctx.fillRect(Xt(i), Y(j), Xt(f) - Xt(i), Y(j + 1) - Y(j));
  });
  for (let n = 0; n < extra.length; n += 3) {
    const i = extra[n] - AREA.x0, j = extra[n + 1] - AREA.y0;
    ctx.fillStyle = paleta[CHAVES[extra[n + 2]]];
    ctx.fillRect(Xt(i), Y(j), Xt(i + 1) - Xt(i), Y(j + 1) - Y(j));
  }
}

// Atalho: monta o quadro e pinta uma camada ('tras' | 'frente').
export function desenhar(ctx, camada, x, y, P, estado = {}, k = 1) {
  const paleta = PALETAS[estado.metal ?? metalDaPagina()] ?? PALETAS.bronze;
  pintarCamada(ctx, quadro(estado)[camada], x, y, P, k, estado.tremida ?? 0, paleta);
}

const metalDaPagina = () => document.documentElement.dataset.metal ?? 'bronze';

// Monta uma caixa em dois canvas (o de trás e o da frente, um sobre o outro, com o cartão entre eles).
// Devolve a caixa: estado, definir(parcial), dimensionar(P, k), em(sx, sy), pintar(), pixel, dpr, largura, altura.
export function montar(canvasTras, canvasFrente, { numeral = 'I', pixel = 4, dpr } = {}) {
  const ctxTras = canvasTras.getContext('2d'), ctxFrente = canvasFrente.getContext('2d');
  let camadas = null;      // último quadro montado: refeito só quando o estado muda, não quando só o P muda
  let tamanho = 0;         // P inteiro (para cima) que deu o tamanho atual dos canvas

  const bau = {
    // tampa (0…1,1), brilho (0…1), reflexo (inteiro | null), tremida (−1 | 0 | 1), tempo (s), faiscas, metal (null =
    // o da página)
    estado: { numeral, tampa: 0, brilho: 0, reflexo: null, tremida: 0, tempo: 0, faiscas: [], metal: null },
    pixel: 0, dpr: 0, largura: 0, altura: 0,

    // Só o que entra no quadro o refaz: tremida e metal são da pintura, e um valor igual ao de agora não muda nada
    // (projetos.js manda o estado inteiro a cada pintura). Faíscas vivas refazem sempre: elas andam no lugar.
    definir(parcial) {
      for (const [chave, valor] of Object.entries(parcial)) {
        if (chave === 'tremida' || chave === 'metal') continue;
        if (valor !== this.estado[chave] || (Array.isArray(valor) && valor.length)) camadas = null;
      }
      Object.assign(this.estado, parcial);
      return this;
    },

    // P em px CSS por px de sprite (pode ser fracionário no meio de um giro); k = razão de dispositivo, de 1 a 3.
    // O buffer acompanha o P arredondado para cima, para um giro não realocar os canvas a cada quadro.
    // Devolve se algo mudou.
    dimensionar(P, k = window.devicePixelRatio || 1) {
      k = Math.min(3, Math.max(1, k));
      if (P === this.pixel && k === this.dpr) return false;
      this.pixel = P; this.dpr = k;
      const teto = Math.max(1, Math.ceil(P - 1e-6));
      if (teto !== tamanho || canvasTras.dataset.k !== String(k)) {
        tamanho = teto;
        const w = Math.ceil(COLUNAS * teto * k), h = Math.ceil(LINHAS * teto * k);
        for (const canvas of [canvasTras, canvasFrente]) {
          canvas.width = w; canvas.height = h;
          canvas.style.width = `${w / k}px`; canvas.style.height = `${h / k}px`;
          canvas.dataset.k = String(k);
          canvas.getContext('2d').imageSmoothingEnabled = false;
        }
      }
      this.largura = COLUNAS * P; this.altura = LINHAS * P;
      return true;
    },

    // Ponto do sprite (px de sprite) em px CSS a partir do canto superior esquerdo dos canvas.
    em(sx, sy) { return { x: (sx - AREA.x0) * this.pixel, y: (sy - AREA.y0) * this.pixel }; },

    pintar() {
      if (!this.pixel) this.dimensionar(pixel, dpr ?? window.devicePixelRatio);
      camadas ??= quadro(this.estado);
      const e = this.estado;
      const paleta = PALETAS[e.metal ?? metalDaPagina()] ?? PALETAS.bronze;
      const o = this.em(0, 0);
      for (const [ctx, canvas, camada] of [[ctxTras, canvasTras, camadas.tras], [ctxFrente, canvasFrente, camadas.frente]]) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        pintarCamada(ctx, camada, o.x, o.y, this.pixel, this.dpr, e.tremida, paleta);
      }
      return this;
    },
  };
  return bau;
}
