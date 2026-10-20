// O pergaminho de bronze do Contato, em pixel art: duas varas com pomos amarradas por uma fita vermelha com lacre de
// cera; aberto, o papel desce e a vara de baixo rola. Desenhado num canvas próprio em volta do papel HTML (que traz o
// texto e fica por cima). O papel é guardado como corridas de cor, não como imagem: se a GPU reiniciar e o canvas
// perder o conteúdo, basta pintar de novo.
//
// montar(canvas, { pixel, largura, altura, fino }) dimensiona e posiciona o canvas em volta de um papel de
// largura × altura px (múltiplos do pixel) e devolve a API do fim do arquivo. Coordenadas de sprite: (0, 0) é o canto
// de cima do papel; a vara de cima ocupa as linhas −vara..−1.

export const VARA = 6;     // linhas da vara normal; a fina (a da página) tem 4
export const POMO = 4;     // px de sprite que a vara passa de cada lado do papel
export const MARGEM = 14;  // folga em volta, para as lascas do lacre voarem

export const PALETA = {
  S: '#b89a6a', s: '#d8c39a', p: '#ecdcb9', P: '#f5ead2',   // pergaminho: borda escura, borda e grão, base, brilho
  R: '#6f2a1c', r: '#a8432c', e: '#cf6c4e',                 // fita e cera: escuro, base, brilho
  sombra: 'rgba(40,30,18,.2)',
};

// Varas e pomos trocam com o metal do site (as mesmas cores dos tokens --liga-* de css/base.css); papel, fita e cera não.
export const METAIS = {
  bronze: { b: '#3a2b1b', d: '#5c4427', m: '#8d6a3b', l: '#c09760', h: '#e8cb95', G: '#f8e9c2' },
  prata: { b: '#2e3236', d: '#5b636a', m: '#939ca4', l: '#c3cbd1', h: '#eef2f4', G: '#f7fafb' },
  ouro: { b: '#5a3b0b', d: '#986810', m: '#cc961b', l: '#ecc145', h: '#fdeeab', G: '#fff6cf' },
};

// O lacre: octógono 9 × 9 de cantos cortados, centrado na junção das varas. R aro, r corpo, e o arco de brilho em cima
// à esquerda; o V carimbado no meio é o sinete do Victor. Os pixels de SOMBRA saem em d, a cor escura do metal.
export const LACRE = [
  '  RRRRR  ',
  ' RreerrR ',
  'RrerrrrrR',
  'ReRrrrRrR',
  'RerRrRrrR',
  'RrrrRrrrR',
  'RrrrrrrrR',
  ' RrrrrrR ',
  '  RRRRR  ',
];
const SOMBRA_DO_LACRE = [[5, 1], [5, 2], [4, 3]];

// Linhas da vara de cima para baixo (iluminada de cima) e os pomos: brilho em cima à esquerda descendo em degraus até
// o mais escuro embaixo à direita; cantos de cima e de baixo vazios, para arredondar.
const LINHAS_DA_VARA = { 4: ['l', 'h', 'm', 'd'], 6: ['d', 'l', 'h', 'm', 'm', 'd'] };
const POMOS = {
  4: [' Gh ', 'hhlm', 'hlmd', 'lmdd', 'mddb', ' db '],
  6: [' Gh ', 'hhll', 'hllm', 'llmm', 'lmmd', 'mmdd', 'mddb', ' db '],
};
const ANEL = 14;           // um anel a cada 14 px de sprite: eles andam com o giro e mostram a vara rolando

// Hash inteiro 2D, uniforme em [0, 1): o mesmo papel sempre com o mesmo grão.
function hash(x, y) {
  let h = Math.imul(x + 0x9e37, 0x85ebca6b) ^ Math.imul(y + 0x7f4a, 0xc2b2ae35);
  h ^= h >>> 16; h = Math.imul(h, 0x7feb352d);
  h ^= h >>> 15; h = Math.imul(h, 0x846ca68b);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

// O papel como corridas [x0, x1, cor] por linha: bordas laterais mordidas, grão claro e escuro no miolo e, no alto, a
// sombra da vara de cima.
function tecer(PW, PH) {
  const linhas = [];
  for (let y = 0; y < PH; y++) {
    const corridas = [];
    let atual = null;
    for (let x = 0; x < PW; x++) {
      const v = hash(x, y), borda = Math.min(x, PW - 1 - x);
      let cor = borda === 0 ? (v < 0.3 ? null : 'S')
        : borda === 1 ? (v < 0.45 ? 'S' : 's')
        : borda === 2 ? 's'
        : v < 0.014 ? 's' : v > 0.982 ? 'P' : 'p';
      if (cor && y === 0) cor = 'S';
      else if (cor && y === 1 && cor !== 'S') cor = 's';
      if (atual && atual[2] === cor) atual[1] = x;
      else corridas.push(atual = [x, x, cor]);
    }
    linhas.push(corridas.filter(c => c[2]));
  }
  return linhas;
}

export function montar(canvas, { pixel: P, largura, altura, fino = false }) {
  const PW = Math.max(16, Math.round(largura / P));
  const PH = Math.max(8, Math.round(altura / P));
  const ROD = fino ? 4 : VARA;
  const meio = Math.floor(PW / 2);
  const colunas = PW + 2 * POMO + 2 * MARGEM;
  const linhas = PH + 2 * ROD + 2 * MARGEM;
  const papel = tecer(PW, PH);
  let k = 1, ctx = null;
  let aberto = 0, rolo = 0, lacrado = true, metal = METAIS.bronze;
  let lascas = [], fitas = [];

  // Cada pixel de sprite com as duas bordas arredondadas ao pixel de dispositivo: sem costura e sem borrão.
  const dx = x => Math.round((x + POMO + MARGEM) * P * k);
  const dy = y => Math.round((y + ROD + MARGEM) * P * k);
  const bloco = (cor, x, y, w = 1, h = 1) => {
    ctx.fillStyle = cor;
    const x0 = dx(x), y0 = dy(y);
    ctx.fillRect(x0, y0, dx(x + w) - x0, dy(y + h) - y0);
  };

  function redimensionar() {
    k = Math.min(3, window.devicePixelRatio || 1);
    canvas.width = Math.round(colunas * P * k);
    canvas.height = Math.round(linhas * P * k);
    Object.assign(canvas.style, {
      width: `${colunas * P}px`, height: `${linhas * P}px`,
      left: `${-(POMO + MARGEM) * P}px`, top: `${-(ROD + MARGEM) * P}px`,
    });
    ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
  }

  function vara(y0, fase) {
    LINHAS_DA_VARA[ROD].forEach((cor, i) => bloco(metal[cor], 0, y0 + i, PW, 1));
    for (let x = 0; x < PW; x++) {
      if ((x + fase) % ANEL !== ANEL / 2) continue;
      bloco(metal.m, x, y0 + 1, 1, 2);
      bloco(metal.d, x, y0 + 3, 1, 2);     // na vara fina, invade uma linha abaixo dela: é o desenho
    }
    for (const x0 of [-POMO, PW]) {
      POMOS[ROD].forEach((linha, i) => {
        for (let c = 0; c < POMO; c++) if (linha[c] !== ' ') bloco(metal[linha[c]], x0 + c, y0 - 1 + i);
      });
    }
  }

  function pintar() {
    if (!ctx) redimensionar();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const L = Math.round(aberto * PH);
    // Sombra dura 2 px para baixo e para a direita: a vara de cima, o papel à vista e a vara de baixo (sem os pomos).
    bloco(PALETA.sombra, 2, -ROD + 2, PW, ROD + L);
    bloco(PALETA.sombra, 2, L + 2, PW, ROD);
    for (let y = 0; y < L; y++) {
      if (y === L - 1) { bloco(PALETA.S, 0, y, PW, 1); continue; }            // a beira do papel ainda enrolado
      for (const [x0, x1, cor] of papel[y]) bloco(PALETA[cor], x0, y, x1 - x0 + 1, 1);
      if (y === L - 2) bloco(PALETA.s, 1, y, PW - 2, 1);
    }
    vara(-ROD, 0);
    vara(L, ((-Math.round(rolo)) % ANEL + ANEL) % ANEL);
    if (lacrado) {
      for (let y = -ROD - 1; y <= ROD; y++) {
        bloco(PALETA.e, meio - 1, y); bloco(PALETA.r, meio, y); bloco(PALETA.R, meio + 1, y);
      }
      for (const [c, r] of SOMBRA_DO_LACRE) bloco(metal.d, meio + c, r);
      LACRE.forEach((linha, i) => {
        for (let c = 0; c < 9; c++) if (linha[c] !== ' ') bloco(PALETA[linha[c]], meio - 4 + c, i - 4);
      });
    }
    for (const f of fitas) {
      ctx.globalAlpha = Math.max(0, f.alfa);
      bloco(PALETA.e, meio - 1, Math.round(f.y), 1, ROD + 1);
      bloco(PALETA.r, meio, Math.round(f.y), 1, ROD + 1);
      bloco(PALETA.R, meio + 1, Math.round(f.y), 1, ROD + 1);
    }
    for (const l of lascas) {
      ctx.globalAlpha = Math.max(0, 1 - l.vida / l.max);
      bloco(PALETA[l.cor], Math.round(l.x), Math.round(l.y));
    }
    ctx.globalAlpha = 1;
    return api;
  }

  const api = {
    vara: ROD,
    tamanho: { largura: PW * P, altura: PH * P },
    get ocupado() { return lascas.length > 0 || fitas.length > 0; },
    // aberto 0–1 (gira a vara de baixo junto), lacrado (true recoloca fita e lacre e limpa as lascas), metal.
    definir({ aberto: a, lacrado: l, metal: m } = {}) {
      if (a !== undefined) { rolo += (a - aberto) * PH; aberto = a; }
      if (l !== undefined) { lacrado = l; if (l) { lascas = []; fitas = []; } }
      if (m !== undefined) metal = METAIS[m] ?? METAIS.bronze;
      return api;
    },
    // O golpe: 16 lascas de cera sobem e caem, e as duas metades da fita despencam e somem.
    estourar() {
      if (!lacrado) return api;
      lacrado = false;
      lascas = Array.from({ length: 16 }, (_, i) => {
        const angulo = Math.PI * (1.1 + 0.8 * Math.random()) + (i % 2 ? 0.9 * Math.PI : 0);
        const v = 10 + 22 * Math.random();
        return {
          x: meio + 0.5 + (Math.random() * 6 - 3), y: Math.random() * 6 - 3,
          vx: Math.cos(angulo) * v, vy: -Math.abs(Math.sin(angulo)) * v - 6,
          vida: 0, max: 0.7 + 0.5 * Math.random(), cor: 'Rre'[i % 3],
        };
      });
      fitas = [{ y: -ROD - 1, vy: 0, alfa: 1 }, { y: 0, vy: 4, alfa: 1 }];
      return api;
    },
    // Avança as partículas (px de sprite e segundos); devolve se ainda há algo no ar.
    avancar(dt) {
      for (const l of lascas) { l.vida += dt; l.vy += 60 * dt; l.x += l.vx * dt; l.y += l.vy * dt; }
      lascas = lascas.filter(l => l.vida < l.max);
      for (const f of fitas) { f.vy += 50 * dt; f.y += f.vy * dt; f.alfa -= 2.2 * dt; }
      fitas = fitas.filter(f => f.alfa > 0);
      return api.ocupado;
    },
    pintar,
    redimensionar,
    // Pontos em px a partir do canto do papel: o centro do lacre, o fundo da vara de baixo e a altura de papel à vista
    // acima da parte ainda enrolada (é até ali que o texto aparece).
    lacre: () => ({ x: (meio + 0.5) * P, y: 0 }),
    fundo: () => (Math.round(aberto * PH) + ROD) * P,
    mostrado: () => Math.max(0, Math.round(aberto * PH) - 2) * P,
  };
  redimensionar();
  return api;
}
