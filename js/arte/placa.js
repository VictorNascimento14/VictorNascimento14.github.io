// A placa de bronze do ano: o calendário do GitHub em pixel art. Moldura chanfrada com bisel, uma grega com rebites
// em cima e embaixo (e entre os registros, quando são dois) e um campo rebaixado onde cada dia é um pino 4 × 4: uma
// coluna por semana, domingo em cima. Os dias que ainda vão chegar são encaixes vazios até o fim do ano.
// Aqui ficam o desenho, a geometria, a grade e o hit-test; a gravação (aprendizes, mascote, dica) é de
// js/secoes/ano.js. As contas puras do fim do arquivo não tocam no DOM e são testadas em tests/ano.test.js.
//
// Unidade: o pixel de sprite (ps). Um ps é um quadrado de P × P px CSS (P inteiro, de 1 a 5) e cada borda cai no
// pixel físico mais próximo, então vizinhos encostam sem fresta nem sobreposição, mesmo com dpr fracionário.

export const PINO = 4;                              // lado do pino
export const PASSO = 5;                             // de um pino ao seguinte: o pino e 1 ps de vão
export const LINHAS = 7;                            // domingo … sábado
const MARGEM = 2;                                   // da borda do campo ao primeiro pino
const FAIXA = 6;                                    // altura da faixa da grega (= o módulo)
const BORDA = 4;                                    // da borda externa até a faixa ou o campo
const VAO = 2;                                      // da faixa até o campo
const CAMPO = 2 * MARGEM + LINHAS * PASSO - 1;      // altura do campo: 38
const DIA = 86400000;

export const SALTO = 0.2;                           // o pino golpeado fica 1 ps acima enquanto o lampejo passa disto (s)
export const VIDA_FAISCA = 0.5;                     // s
const FAISCA_NOVA = 0.12;                           // até aqui a faísca é cintilação pura; depois, realce

// As cores de cada metal, por papel. São as mesmas dos tokens --liga-*, --cravo-* e --placa-campo de css/base.css,
// então a legenda (feita em CSS) é literalmente uma tira da placa.
//   o recesso mais fundo · f fundo do campo · b bronze mais escuro · d escuro · m a face · l claro · h realce
//   G brilho · W cintilação · n N u o pino sem contribuição (corpo, luz, sombra)
export const PALETAS = {
  bronze: { o: '#211810', f: '#2c2116', b: '#3a2b1b', d: '#5c4427', m: '#8d6a3b', l: '#c09760', h: '#e8cb95', G: '#f8e9c2', W: '#fffaf0', n: '#46351f', N: '#4f3c24', u: '#36281a' },
  prata: { o: '#1d2023', f: '#272b2f', b: '#2e3236', d: '#5b636a', m: '#939ca4', l: '#c3cbd1', h: '#eef2f4', G: '#f7fafb', W: '#ffffff', n: '#3b4045', N: '#454b51', u: '#2f3337' },
  ouro: { o: '#231a08', f: '#2e2410', b: '#5a3b0b', d: '#986810', m: '#cc961b', l: '#ecc145', h: '#fdeeab', G: '#fff6cf', W: '#fffdf3', n: '#4d3a14', N: '#584318', u: '#3c2d0f' },
};
// O anel do mascote e dos aprendizes sobre a placa: sempre o recesso do bronze, seja qual for o metal.
export const CONTORNO = PALETAS.bronze.o;
const SOMBRA = 'rgba(40, 30, 18, .22)';             // a sombra dura não muda com o metal

// Nível → chaves de [corpo, luz (topo e esquerda), sombra (base e direita)]. Um dia ainda não gravado e um dia gravado
// sem contribuição são idênticos (nível 0): o que mostra que ele entrou é só o lampejo do golpe.
const NIVEIS = [['n', 'N', 'u'], ['m', 'l', 'd'], ['l', 'h', 'm'], ['h', 'G', 'l'], ['G', 'W', 'h']];

// O módulo da grega (6 × 6, '#' é sulco), desenhado para este site: a linha de cima corre sem parar, cada módulo desce
// uma haste até a base e, ao lado dela, um gancho pende da linha de cima e se enrola para dentro. A última coluna fica
// livre e separa um módulo do seguinte. O sulco é escuro e o pixel logo abaixo dele pega luz: é o lábio que faz parecer
// corte. A repetição começa na esquerda e é cortada na direita onde acabar.
const GREGA = [
  '######',
  '#...#.',
  '#.#.#.',
  '#.#.#.',
  '#.###.',
  '#.....',
];
// Rebite 3 × 3 iluminado de cima à esquerda; os cantos com '.' ficam no bronze da placa e arredondam a cabeça.
const REBITE = ['hl.', 'lmd', '.db'];

const metalDoSite = () => {
  const metal = globalThis.document?.documentElement.dataset.metal;
  return metal === 'prata' || metal === 'ouro' ? metal : 'bronze';
};

// Pinta retângulos em ps com as bordas no pixel físico: x0 = arredonda(X·k), x1 = arredonda((X + P)·k).
// cor null apaga (os cantos chanfrados).
function pincel(ctx, P, k) {
  const borda = v => Math.round(v * P * k);
  return (cor, x, y, w = 1, h = 1) => {
    const x0 = borda(x), y0 = borda(y), largura = borda(x + w) - x0, altura = borda(y + h) - y0;
    if (cor === null) { ctx.clearRect(x0, y0, largura, altura); return; }
    ctx.fillStyle = cor;
    ctx.fillRect(x0, y0, largura, altura);
  };
}

// Pino com bisel: luz no topo e na esquerda (menos o último pixel), sombra na base e na direita (menos o primeiro);
// o miolo e os cantos de cima à direita e de baixo à esquerda ficam no corpo.
function pintarPino(px, cor, x, y, nivel) {
  const [corpo, luz, sombra] = NIVEIS[nivel];
  px(cor[corpo], x, y, PINO, PINO);
  px(cor[luz], x, y, 3, 1);
  px(cor[luz], x, y + 1, 1, 2);
  px(cor[sombra], x + 1, y + 3, 3, 1);
  px(cor[sombra], x + 3, y + 1, 1, 2);
}

// A camada que só muda com o layout ou o metal: sombra, moldura, faixas, rebites, campos e os encaixes vazios.
function pintarRepouso(px, cor, L, encaixes, posicoes) {
  const { w, h } = L;
  px(SOMBRA, 1, h, w, 1);
  px(SOMBRA, w, 1, 1, h - 1);
  // Moldura: borda, face e bisel com a luz de cima à esquerda; nos dois cantos onde o claro cruza o escuro, vence o claro.
  px(cor.b, 0, 0, w, h);
  px(cor.m, 1, 1, w - 2, h - 2);
  px(cor.l, 1, 1, w - 2, 1);
  px(cor.l, 1, 2, 1, h - 3);
  px(cor.d, 2, h - 2, w - 3, 1);
  px(cor.d, w - 2, 2, 1, h - 3);
  for (const [x, y] of [[0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1]]) px(null, x, y);

  for (const y0 of L.faixas) {
    for (let x = 8; x <= w - 9; x++) {
      const coluna = (x - 8) % GREGA.length;
      for (let y = 0; y < FAIXA; y++) {
        if (GREGA[y][coluna] === '#') px(cor.d, x, y0 + y);
        else if (y > 0 && GREGA[y - 1][coluna] === '#') px(cor.l, x, y0 + y);
      }
    }
    for (const x0 of [4, w - 7]) {
      REBITE.forEach((linha, y) => [...linha].forEach((chave, x) => { if (chave !== '.') px(cor[chave], x0 + x, y0 + 1 + y); }));
    }
  }

  // Campo rebaixado: sombra interna em cima e à esquerda, e um lábio claro por fora, na base e na direita.
  for (const c of L.campos) {
    px(cor.f, c.x, c.y, c.w, c.h);
    px(cor.o, c.x, c.y, c.w, 1);
    px(cor.o, c.x, c.y + 1, 1, c.h - 1);
    px(cor.l, c.x, c.y + c.h, c.w + 1, 1);
    px(cor.l, c.x + c.w, c.y, 1, c.h);
  }

  // Encaixe: um buraco no recesso, com o lábio do fundo (base e direita) pegando luz.
  for (const e of encaixes) {
    const { x, y } = posicoes[e.indice];
    px(cor.o, x, y, PINO, PINO);
    px(cor.b, x + 1, y + 3, 3, 1);
    px(cor.b, x + 3, y + 1, 1, 2);
  }
}

// Monta a placa num canvas. dias: [[data, contagem, nível 0–4], …] contíguos desde 1º de janeiro; fim: "AAAA-12-31".
export function montar(canvas, { dias, fim }) {
  const { celulas, encaixes, semanas, inicio } = grade(dias, fim);
  const ctx = canvas.getContext('2d');
  const repouso = document.createElement('canvas');
  let repousoPronto = false;
  let metalDoRepouso = null;
  let posicoes = [];       // canto de cada pino (dias e encaixes) em ps, pelo índice do dia

  const indiceEm = (x, y) => {
    const p = placa.L && posicaoEm(placa.L, x / placa.pixel, y / placa.pixel);
    return p ? p.semana * LINHAS + p.linha - inicio : -1;
  };

  const placa = {
    canvas, celulas, encaixes, semanas,
    L: null, registros: 0, pixel: 0, dpr: 0,
    largura: 0, altura: 0,   // px CSS, com o ps a mais da sombra
    // gravados: 1 por dia gravado, ou null = todos · golpeados: índice → s de lampejo (dias e encaixes) ·
    // realce: índice com anel · faiscas: [{ x, y, vx, vy, idade }] em ps · marcas: { índice: true } (o golpe do dia)
    estado: { gravados: null, golpeados: new Map(), realce: null, faiscas: [], marcas: null },

    definir(parcial) { Object.assign(this.estado, parcial); return this; },

    // Pixel, densidade (limitada a [1, 3]) e registros (1 ou 2). Devolve se algo mudou.
    dispor(pixel, dpr, registros) {
      const k = Math.min(3, Math.max(1, dpr));
      if (this.L && pixel === this.pixel && k === this.dpr && registros === this.registros) return false;
      const L = medidas(semanas, registros);
      Object.assign(this, { L, pixel, dpr: k, registros, largura: (L.w + 1) * pixel, altura: (L.h + 1) * pixel });
      canvas.width = repouso.width = Math.round(this.largura * k);
      canvas.height = repouso.height = Math.round(this.altura * k);
      canvas.style.width = `${this.largura}px`;
      canvas.style.height = `${this.altura}px`;
      posicoes = [...celulas, ...encaixes].map(c => pino(L, c.semana, c.linha));
      repousoPronto = false;
      return true;
    },

    // Centro do pino em px CSS a partir do canto do canvas.
    centro(semana, linha) {
      const p = pino(this.L, semana, linha);
      return { x: (p.x + PINO / 2) * this.pixel, y: (p.y + PINO / 2) * this.pixel };
    },

    // O dia (ou o encaixe) sob um ponto em px CSS do canvas, ou null.
    diaEm(x, y) { const i = indiceEm(x, y); return i >= 0 && i < celulas.length ? celulas[i] : null; },
    encaixeEm(x, y) { const i = indiceEm(x, y) - celulas.length; return i >= 0 && i < encaixes.length ? encaixes[i] : null; },

    pintar() {
      if (!this.L) this.dispor(3, globalThis.devicePixelRatio || 1, 1);
      const metal = metalDoSite();
      if (metal !== metalDoRepouso) { repousoPronto = false; metalDoRepouso = metal; }
      const cor = PALETAS[metal];
      if (!repousoPronto) {
        const c = repouso.getContext('2d');
        c.clearRect(0, 0, repouso.width, repouso.height);
        pintarRepouso(pincel(c, this.pixel, this.dpr), cor, this.L, encaixes, posicoes);
        repousoPronto = true;
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(repouso, 0, 0);

      const px = pincel(ctx, this.pixel, this.dpr);
      const { gravados, golpeados, realce, faiscas, marcas } = this.estado;
      for (const c of celulas) {
        const gravado = !gravados || gravados[c.indice];
        const golpe = golpeados.get(c.indice) ?? 0;
        let nivel = marcas?.[c.indice] ? 4 : gravado ? c.nivel : 0;
        if (golpe > 0 && gravado) nivel = Math.min(4, nivel + 1);
        const { x, y } = posicoes[c.indice];
        pintarPino(px, cor, x, y - (golpe > SALTO ? 1 : 0), nivel);
      }
      // O golpe do dia num dia que ainda não chegou: um pino de ouro dentro do encaixe.
      if (marcas) {
        for (const e of encaixes) {
          if (!marcas[e.indice]) continue;
          const { x, y } = posicoes[e.indice];
          pintarPino(px, cor, x, y - ((golpeados.get(e.indice) ?? 0) > SALTO ? 1 : 0), 4);
        }
      }
      // O anel ocupa o vão em volta do pino e não acompanha o salto; vem depois de todos para nenhum vizinho cobri-lo.
      if (realce !== null && posicoes[realce]) {
        const { x, y } = posicoes[realce];
        px(cor.G, x - 1, y - 1, PINO + 2, 1);
        px(cor.G, x - 1, y + PINO, PINO + 2, 1);
        px(cor.G, x - 1, y, 1, PINO);
        px(cor.G, x + PINO, y, 1, PINO);
      }
      for (const f of faiscas) {
        ctx.globalAlpha = Math.max(0, 1 - f.idade / VIDA_FAISCA);
        px(f.idade < FAISCA_NOVA ? cor.W : cor.h, Math.floor(f.x), Math.floor(f.y));
      }
      ctx.globalAlpha = 1;
      return this;
    },
  };

  // A GPU reiniciada apaga o canvas e a camada guardada: refaz as duas.
  canvas.addEventListener('contextrestored', () => { repousoPronto = false; placa.pintar(); });
  return placa;
}

// ---------- contas puras (sem DOM) ----------

// Dias entre duas datas "AAAA-MM-DD", contados à meia-noite UTC.
export const indiceDoDia = (primeiro, data) => Math.round((Date.parse(`${data}T00:00:00Z`) - Date.parse(`${primeiro}T00:00:00Z`)) / DIA);

// Dias → colunas (semanas) e linhas. A posição vem do índice, nunca da data de cada item: os dados são contíguos e o
// dia da semana é o de 1º de janeiro em UTC, para o fuso de quem visita não deslocar a grade inteira.
export function grade(dias, fim) {
  const inicio = new Date(`${dias[0][0]}T00:00:00Z`).getUTCDay();   // 0 = domingo
  const posicao = indice => ({ semana: Math.floor((indice + inicio) / LINHAS), linha: (indice + inicio) % LINHAS, indice });
  const celulas = dias.map(([data, contagem, nivel], indice) => ({ data, contagem, nivel, ...posicao(indice) }));
  const ultimo = Math.max(dias.length - 1, fim ? indiceDoDia(dias[0][0], fim) || 0 : 0);
  const encaixes = [];
  for (let indice = dias.length; indice <= ultimo; indice++) encaixes.push(posicao(indice));
  return { celulas, encaixes, semanas: posicao(ultimo).semana + 1, inicio };
}

// Geometria em ps para S semanas em 1 ou 2 registros. Com dois, o 1º leva ⌈S/2⌉ semanas e os dois campos têm a largura
// dele (o 2º pode ficar com uma coluna vazia no fim).
export function medidas(semanas, registros = 1) {
  const porRegistro = registros === 2 ? [Math.ceil(semanas / 2), Math.floor(semanas / 2)] : [semanas];
  const larguraCampo = 2 * MARGEM + porRegistro[0] * PASSO - 1;
  const campos = [];
  let y = BORDA + FAIXA + VAO;
  let primeira = 0;
  for (const n of porRegistro) {
    campos.push({ x: BORDA, y, w: larguraCampo, h: CAMPO, primeira, semanas: n });
    primeira += n;
    y += CAMPO + VAO + FAIXA + VAO;
  }
  const faixas = [BORDA, ...campos.map(c => c.y + CAMPO + VAO)];
  return { w: 2 * BORDA + larguraCampo, h: faixas.at(-1) + FAIXA + BORDA, campos, faixas };
}

// Canto superior esquerdo do pino, em ps.
export function pino(L, semana, linha) {
  const campo = L.campos.find(c => semana >= c.primeira && semana < c.primeira + c.semanas) ?? L.campos[0];
  return { x: campo.x + MARGEM + (semana - campo.primeira) * PASSO, y: campo.y + MARGEM + linha * PASSO };
}

// Semana e linha sob um ponto em ps, ou null. A área de toque de cada pino é a célula do passo deslocada meio ps para
// cima e para a esquerda: o pino e metade do vão em volta. Decide o primeiro campo que contém o ponto.
export function posicaoEm(L, sx, sy) {
  for (const c of L.campos) {
    const gx = sx - c.x - MARGEM, gy = sy - c.y - MARGEM;
    if (gx < -0.5 || gy < -0.5 || gx >= c.semanas * PASSO || gy >= LINHAS * PASSO) continue;
    const coluna = Math.floor((gx + 0.5) / PASSO), linha = Math.floor((gy + 0.5) / PASSO);
    return coluna < c.semanas && linha < LINHAS ? { semana: c.primeira + coluna, linha } : null;
  }
  return null;
}

// O maior pixel inteiro (1 a 5) que cabe na largura útil e em 42% da altura da janela. Dois registros só quando dão um
// pixel estritamente maior: no empate fica um, que mostra o ano de uma vez. largura = clientWidth do documento (já sem a
// barra de rolagem); janela = innerWidth, que decide a margem (128 px acima de 760, 32 até lá, como o CSS).
export function disposicao(semanas, largura, altura, janela = largura) {
  const util = Math.min(largura - (janela > 760 ? 128 : 32), 1400);
  const alto = altura * 0.42;
  let melhor = { pixel: 1, registros: 1 };
  for (const registros of [1, 2]) {
    const L = medidas(semanas, registros);
    const pixel = Math.max(1, Math.min(5, Math.floor(util / (L.w + 1)), Math.floor(alto / (L.h + 1))));
    if (pixel > melhor.pixel) melhor = { pixel, registros };
  }
  return melhor;
}

// Dias com contribuição, a maior sequência do ano (não a atual), o maior dia (no empate fica o primeiro) e a soma de
// cada mês, em ordem.
export function estatisticas(dias) {
  let ativos = 0, maiorSequencia = 0, sequencia = 0, melhor = dias[0];
  const meses = new Map();
  for (const dia of dias) {
    const [data, contagem] = dia;
    if (contagem > 0) { ativos++; sequencia++; maiorSequencia = Math.max(maiorSequencia, sequencia); } else sequencia = 0;
    if (contagem > melhor[1]) melhor = dia;
    meses.set(data.slice(0, 7), (meses.get(data.slice(0, 7)) ?? 0) + contagem);
  }
  return { ativos, maiorSequencia, melhor: { data: melhor[0], contagem: melhor[1] }, meses: [...meses] };
}

// Para cada semana que já teve dia: [primeira, última] linha com dia (o ano começa e termina no meio da semana).
export function linhasPorSemana(celulas) {
  const linhas = [];
  for (const { semana, linha } of celulas) {
    if (linhas[semana]) linhas[semana][1] = linha;
    else linhas[semana] = [linha, linha];
  }
  return linhas;
}

// As semanas que já tiveram dia, divididas em trechos contíguos, um por aprendiz. Math.round arredonda .5 para cima, e
// é isso que decide quantos vêm no começo do ano (1 semana → 1 aprendiz, 2 → 2). Trecho vazio não ganha aprendiz.
export function trechos(semanas, equipe = 4) {
  const lista = [];
  for (let j = 0; j < equipe; j++) {
    const de = Math.round(semanas * j / equipe), ate = Math.round(semanas * (j + 1) / equipe);
    if (ate > de) lista.push({ de, ate });
  }
  return lista;
}

// A linha onde o cinzel bate na semana: de 3 em 3 (módulo 5), defasada por aprendiz, então cada um sobe e desce em
// zigue-zague (1, 4, 2, 5, 3…) em vez de andar reto. A trava só age nas semanas parciais, a primeira e a corrente.
export const linhaDoGolpe = (semana, n, lo, hi) => Math.min(hi, Math.max(lo, 1 + (3 * semana + 2 * n) % 5));
