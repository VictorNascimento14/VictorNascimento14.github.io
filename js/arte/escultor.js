// O escultor alado em pixel art: o ator que o site inteiro usa (mascote, rosto da caixa de ajuda, aprendizes da placa,
// lutadores da arena). CONTRATO (docs/arquitetura.md §4): nomes, assinaturas e unidades das exportações não mudam.
// O desenho é próprio, na linguagem da spec 01 §4.5: um chibi de boina, cinzel e maço, com duas asas nas costas.
//
// Espaço do sprite: o corpo (14 × 17) olha para a direita, com o pixel (0,0) no canto superior esquerdo do corpo.
// Um pixel de sprite é um quadrado de P × P pixels do canvas, com cada borda arredondada ao pixel de dispositivo
// (vizinhos dividem a borda: nítido até com dpr fracionário). Olhar à esquerda espelha a coluna i em 13 − i, em torno
// do corpo: o corpo fica no lugar e só a ponta do cinzel troca de lado. Por isso o corpo é simétrico em torno de x = 7.
//
// Cores por chave, uma letra por pixel:
//   b d m l h   metal, do mais escuro ao brilho (bronze; prata e ouro trocam só estas cinco)
//   e olhos · s aço · k aço escuro · t fio do cinzel · w cabo de madeira · c crista do elmo (estado.elmo, se for cor)
// estado.tom ('pedra' | 'gelo' | 'luz') cobre todas as chaves por um instante (os golpes da arena e do duelo).
//
// KIT (estado.kit): a armadura dos lutadores (spec 07 §4.8). Troca a boina, o cinzel e o maço por peças em pixel
// desenhadas nas chaves acima (então a armadura é fundida no metal do ator) e em chaves próprias de cor fixa.
//   {
//     cores:  { p, q, g, r?, n? }  p cor do lutador, q sombra, g luz, r/n corda clara e escura (padrão abaixo);
//                                  sob um tom viram m, d, h, l e d
//     sob:    [camada]             atrás do corpo, logo depois das asas
//     cabeca: [camada]             no lugar da boina; o 'c' sai na cor da crista (estado.elmo)
//     sobre:  [camada]             sobre o corpo e as pernas (túnica, peitoral)
//     topo:   [camada]             sobre os dois braços (a ombreira que cobre o ombro do braço que balança)
//     pernas: ['d', 'l', 'd']      chave de cada linha das pernas (14, 15, 16): as grevas
//     frente: { braco, item }      mão da frente, no ângulo estado.cinzel (null = repouso), do ombro (12,5; 10,5)
//     costas: { braco, item }      mão de trás, no ângulo estado.maco, do ombro (4,5; 10,5); sem a peça, sem o braço
//     guarda, repouso              ângulos (rad) do braço da frente ao defender e parado; quem anima põe a guarda
//                                  em estado.cinzel e volta a null
//   }
//   camada = { em: [coluna, linha], linhas: ['..ppq.', ...] }  canto superior esquerdo; '.' ou ' ' = vazio
//   braco  = [[ao longo, chave] ou [ao longo, de lado, chave], ...]  pixels a essa distância do ombro (px de
//            sprite); "de lado" anda na perpendicular, positivo no sentido horário (para baixo com o braço à frente)
//   item   = { linhas, pega: [coluna, linha], mao }  desenho que fica em pé (não gira) com a célula da pega na mão,
//            a `mao` px do ombro ao longo do braço
//   Com kit, as asas fechadas ficam escondidas sob a armadura: abrem para voar e golpear.
import { saidaCubica } from '../nucleo/pixel.js';

export const LARGURA_CORPO = 14;
export const PONTA = { x: 18.5, y: 11.5 };      // centro do pixel da ponta do cinzel, olhando à direita
export const PES = { x: 7, y: 17 };             // centro da base dos pés
export const ASSENTO = { x: 7, y: 15 };         // onde apoia sentado
export const CAIXA = { x0: -8, x1: 23, y0: -1, y1: 18 };            // contém qualquer quadro, nas duas direções
export const QUADRO = { x0: -9, y0: -5, largura: 33, altura: 24 };   // área do canvas de um ator montado
export const MACO = { repouso: -2.25, erguido: -2.5, batida: 0.16, recuo: -0.9 }; // ângulo do braço (rad)
export const GOLPE = { erguer: 0.16, segurar: 0.05, cair: 0.06, voltar: 0.14, impacto: 0.27, total: 0.41 }; // s
export const ASAS = { rapidas: 46, batendo: 32, lentas: 14 };       // velocidade da batida (rad/s)

// ---------- cores ----------

export const CORES = {
  b: '#3a2b1b', d: '#5c4427', m: '#8d6a3b', l: '#c09760', h: '#e8cb95',
  e: '#191410', s: '#c8cdd2', k: '#6d737a', t: '#f5f7f8', w: '#6b4a2a', c: '#a8432c',
  r: '#d8c49a', n: '#8a6a3e',
};
// Os mesmos degraus de --liga-0…4 do css/base.css: o ator funde junto com o resto do site.
export const METAIS = {
  prata: { b: '#2e3236', d: '#5b636a', m: '#939ca4', l: '#c3cbd1', h: '#eef2f4' },
  ouro: { b: '#5a3b0b', d: '#986810', m: '#cc961b', l: '#ecc145', h: '#fdeeab' },
};
const CLARAO = '#fff8e6';
const TONS = {
  pedra: { b: '#4a4743', d: '#6e6a64', m: '#9a958c', l: '#bdb8ae', h: '#d9d4ca', e: '#2f2d2a', s: '#a9a59d', k: '#6e6a64', t: '#d9d4ca', w: '#6e6a64', c: '#8a857d' },
  gelo: { b: '#1f4f6b', d: '#3b7ea3', m: '#7cc6e0', l: '#bfe9f5', h: '#ecfbff', e: '#103040', s: '#d8f3fb', k: '#3b7ea3', t: '#ffffff', w: '#3b7ea3', c: '#7cc6e0' },
  luz: Object.fromEntries([...'bdmlhesktwc'].map(chave => [chave, CLARAO])),
};
const TOM_DO_KIT = { p: 'm', q: 'd', g: 'h', r: 'l', n: 'd' };  // a chave do metal que cada cor do kit vira sob um tom
const SOMBRA = 'rgba(40, 30, 18, 0.22)';

// ---------- funções do contrato ----------

// Ponta do cinzel em px de sprite para a direção dada (o corpo fica no lugar; a ponta troca de lado).
export function ponta(dir = 1) {
  return { x: dir > 0 ? PONTA.x : LARGURA_CORPO - PONTA.x, y: PONTA.y };
}

// Ângulo do braço do maço t segundos depois do início do golpe; `de` é o ângulo em que o golpe começou.
// Sobe até erguido (saída cúbica), segura, cai na batida (entrada quadrática: o impacto é seco), volta até o recuo.
// Depois do golpe o ator devolve o maço ao repouso aos poucos (avancar).
export function anguloDoGolpe(t, de = MACO.repouso) {
  const { erguer, segurar, cair, voltar } = GOLPE;
  if (t < erguer) return de + (MACO.erguido - de) * saidaCubica(t / erguer);
  if (t < erguer + segurar) return MACO.erguido;
  if (t < erguer + segurar + cair) { const u = (t - erguer - segurar) / cair; return MACO.erguido + (MACO.batida - MACO.erguido) * u * u; }
  if (t < erguer + segurar + cair + voltar) return MACO.batida + (MACO.recuo - MACO.batida) * saidaCubica((t - erguer - segurar - cair) / voltar);
  return MACO.recuo;
}

// Ângulo do bordo de ataque das asas para o modo e o tempo ('rapidas' | 'batendo' | 'lentas' | 'fechadas' | 'nenhuma').
// Abertas oscilam entre −3,3 (esticadas para trás) e −2,2 (erguidas atrás da cabeça); fechadas descansam em −2,3.
export function anguloDasAsas(modo, tempo) {
  if (modo === 'fechadas' || modo === 'nenhuma') return -2.3;
  return -2.75 + 0.55 * Math.sin(tempo * (ASAS[modo] ?? ASAS.lentas));
}

// ---------- o desenho ----------

// Cabeça e tronco, linhas 3 a 13 (o chapéu e as pernas vêm à parte). Cabeça redonda de 10 px, luz de cima e de trás:
// borda das costas clara e um brilho no alto da nuca; olhos de 1 × 2 na metade da frente e a ponta do nariz saindo
// do perfil; avental claro com peitilho e o laço amarrado nas costas.
const CORPO = [
  '...lmmmmmmm...', // 3
  '..hmmmmmmmmm..', // 4
  '..lmmmmemmem..', // 5  olhos
  '..lmmmmemmemm.', // 6  nariz
  '..lmmmmmmmmm..', // 7
  '...lmmmmmmd...', // 8  queixo
  '...dddddddd...', // 9  gola
  '...mmllllmm...', // 10 peitilho do avental
  '...mllllllm...', // 11
  '..lmllllllm...', // 12 laço
  '...mmmmmmmm...', // 13 barra
];
const LINHA_DOS_OLHOS = 5;   // fechados, o pixel de cima de cada olho vira pele

const CHAPEUS = {
  // Pino de 2 px, alarga para 6 e cai numa aba de 11 que passa da testa; o volume pega luz de cima e de trás.
  boina: [
    '......bb......',
    '....bddbbb....',
    '..bdbbbbbbbbb.',
  ],
  // Crista de escova na cor de estado.elmo, de trás para a frente sobre a calota de metal, e aba dourada.
  elmo: [
    '.....ccccc....',
    '....ccccccc...',
    '...hllllllmm..',
    '..hhhhhhhhhhh.',
  ],
};

// Pernas (linhas 14 a 16): duas de 2 px com vão de 2, pés de 3 virados para fora.
const PERNAS = {
  paradas: ['....dd..dd....', '....dd..dd....', '...bbb..bbb...'],
  afastadas: ['....dd..dd....', '...dd....dd...', '..bbb....bbb..'],
  // Sentado na beira de algo: coxas para a frente e canelas penduradas.
  sentadas: ['....ddddddd...', '.....dd..dd...', '.....bbb.bbb..'],
};

// O braço da frente com o cinzel: antebraço, mão, colar, haste de 3 px e o fio. Reto, a ponta cai no pixel (18, 11).
const CINZEL = ['m', 'l', 'k', 's', 's', 's', 't'];
const OMBRO_FRENTE = [12.5, 10.5];
const OMBRO_TRAS = [4.5, 10.5];

// Asas: forma aberta e fechada (comprimento do bordo, tamanho da pena, penas, varredura das penas), arqueamento do
// bordo e os tons de cada asa. A de trás fica um tom abaixo: dá profundidade sem contorno.
const FORMAS = {
  aberta: { comp: 8, pena: 4, penas: 7, varre: [0.5, 1] },
  fechada: { comp: 4.5, pena: 3.5, penas: 5, varre: [1.2, 0.6] },
};
const ARCO = 0.35;
const ASA_DA_FRENTE = { raiz: [4, 10], osso: 'h', pena: 'h', ponta: 'l', base: 'd' };
const ASA_DE_TRAS = { raiz: [5, 9], osso: 'l', pena: 'l', ponta: 'm', base: 'd' };

// Ponto do bordo de ataque no parâmetro t: anda da raiz em passos curtos, cada um girando um pouco (o bordo arqueia).
function bordo(raiz, a, comp, t) {
  const passos = Math.max(1, Math.ceil(8 * t));
  const passo = comp * t / passos;
  let x = raiz[0], y = raiz[1];
  for (let i = 0; i < passos; i++) {
    const angulo = a + ARCO * t * (i + 0.5) / passos;
    x += Math.cos(angulo) * passo;
    y += Math.sin(angulo) * passo;
  }
  return [x, y];
}

function asa(pinta, tons, a, forma, escala, menos) {
  const comp = forma.comp * escala, pena = forma.pena * escala, n = forma.penas - menos;
  // Penas da ponta para a raiz (as da raiz ficam por cima), maiores na ponta, com a última pontinha mais escura.
  for (let k = n - 1; k >= 0; k--) {
    const t = 0.25 + 0.75 * k / (n - 1);
    const [bx, by] = bordo(tons.raiz, a, comp, t);
    const angulo = a + ARCO * t - forma.varre[0] - (1 - t) * forma.varre[1];
    const tamanho = pena * (0.45 + 0.55 * t);
    for (let s = 0; s <= tamanho; s += 0.4) {
      pinta(bx + Math.cos(angulo) * s, by + Math.sin(angulo) * s, s > tamanho - 1.2 ? tons.ponta : tons.pena);
    }
  }
  // Por fim o osso, escuro junto da raiz.
  for (let s = 0.3; s <= comp + 0.4; s += 0.4) {
    const [x, y] = bordo(tons.raiz, a, comp, s / comp);
    pinta(x, y, s < 1.4 ? tons.base : tons.osso);
  }
}

// Um braço que gira no ombro: pixels ao longo dele (com desvio de lado) e um item em pé preso pela pega à mão.
function braco(pinta, desenho, ombro, angulo, peca) {
  if (!peca) return;
  const cos = Math.cos(angulo), sen = Math.sin(angulo);
  for (const p of peca.braco ?? []) {
    const [ao, lado, chave] = p.length === 2 ? [p[0], 0, p[1]] : p;
    pinta(ombro[0] + cos * ao - sen * lado, ombro[1] + sen * ao + cos * lado, chave);
  }
  if (peca.item) {
    const { linhas, pega, mao = 1 } = peca.item;
    desenho(linhas, Math.floor(ombro[0] + cos * mao) - pega[0], Math.floor(ombro[1] + sen * mao) - pega[1]);
  }
}

// Todos os pixels do quadro, no espaço "olhando à direita": Map de (coluna, linha) → chave. O que vem depois cobre.
function celulas(estado) {
  const mapa = new Map();
  const por = (c, r, chave) => { if (chave && chave !== '.' && chave !== ' ') mapa.set((r + 32) * 128 + c + 64, chave); };
  const pinta = (x, y, chave) => por(Math.floor(x), Math.floor(y), chave);
  const desenho = (linhas, c0, r0, troca) => {
    linhas.forEach((linha, j) => {
      for (let i = 0; i < linha.length; i++) por(c0 + i, r0 + j, troca ? troca(linha[i], r0 + j) : linha[i]);
    });
  };
  const camadas = lista => { for (const camada of lista ?? []) desenho(camada.linhas, camada.em[0], camada.em[1]); };

  const kit = estado.kit;
  const modo = estado.asas ?? 'lentas';
  const sentado = !!estado.sentado;

  // 1. asas, a de trás primeiro (com kit, as fechadas ficam escondidas sob a armadura)
  if (modo !== 'nenhuma' && !(kit && modo === 'fechadas')) {
    const fechada = modo === 'fechadas';
    const a = anguloDasAsas(modo, estado.tempo ?? 0);
    const forma = fechada ? FORMAS.fechada : FORMAS.aberta;
    asa(pinta, ASA_DE_TRAS, a + (fechada ? 0.2 : 0.4), forma, 0.85, 1);
    asa(pinta, ASA_DA_FRENTE, a, forma, 1, 0);
  }
  camadas(kit?.sob);

  // 2. corpo: cabeça e tronco, chapéu, pernas
  const fechados = !!estado.dormindo;
  desenho(CORPO, 0, 3, (chave, r) => (fechados && r === LINHA_DOS_OLHOS && chave === 'e' ? 'm' : chave));
  const chapeu = kit?.cabeca || estado.semBoina ? null : estado.elmo ? CHAPEUS.elmo : CHAPEUS.boina;
  if (chapeu) desenho(chapeu, 0, 3 - chapeu.length);   // assenta na linha 3, o alto da cabeça
  const pernas = sentado ? PERNAS.sentadas : Math.floor(estado.passos ?? 0) % 2 === 1 ? PERNAS.afastadas : PERNAS.paradas;
  const grevas = kit?.pernas;
  desenho(pernas, 0, 14, grevas ? (chave, r) => (chave === '.' ? chave : grevas[r - 14] ?? chave) : null);

  // 3. por cima do corpo: cabeça e roupa do kit
  camadas(kit?.cabeca);
  camadas(kit?.sobre);

  // 4. braço da frente: o cinzel, ou a mão da frente do kit
  if (kit) {
    braco(pinta, desenho, OMBRO_FRENTE, estado.cinzel ?? kit.repouso ?? 0, kit.frente);
  } else if (estado.cinzel == null) {
    por(11, 11, 'm');
    CINZEL.forEach((chave, i) => por(12 + i, 11, chave));
  } else {
    por(11, 10, 'm');   // o ombro liga o braço ao tronco em qualquer ângulo
    braco(pinta, desenho, OMBRO_FRENTE, estado.cinzel, { braco: CINZEL.map((chave, i) => [0.3 + i, chave]) });
  }

  // 5. braço de trás: o maço (braço, mão, cabo e a cabeça 3 × 3 com a quina de cima clara), ou a mão de trás do kit
  const angulo = estado.maco ?? MACO.repouso;
  if (kit) {
    braco(pinta, desenho, OMBRO_TRAS, angulo, kit.costas);
  } else {
    braco(pinta, desenho, OMBRO_TRAS, angulo, { braco: [[0.5, 'm'], [1.5, 'm'], [2.5, 'l'], [3.5, 'w'], [4.5, 'w'], [5.5, 'w']] });
    const cx = Math.floor(OMBRO_TRAS[0] + Math.cos(angulo) * 7.6), cy = Math.floor(OMBRO_TRAS[1] + Math.sin(angulo) * 7.6);
    desenho(['lbb', 'bbb', 'bbb'], cx - 1, cy - 1);
  }

  // 6. o que cobre os braços
  camadas(kit?.topo);
  return mapa;
}

// Paleta do quadro: base → metal → kit → cor da crista → tom.
function paleta(estado) {
  const cores = { ...CORES, ...METAIS[estado.metal], ...estado.kit?.cores };
  if (typeof estado.elmo === 'string') cores.c = estado.elmo;
  const tom = TONS[estado.tom];
  if (tom) for (const chave in cores) cores[chave] = tom[chave] ?? tom[TOM_DO_KIT[chave]] ?? cores[chave];
  return cores;
}

// Quanto o quadro desenhado sai do repouso: o recuo (até 1 px de sprite para trás), o pulinho (até 3 para cima) e a
// flutuação no ar (±0,7), cada um arredondado em unidades de `px` (o tamanho de um px de sprite).
function deslocar(estado, px) {
  const dir = estado.dir < 0 ? -1 : 1;
  const modo = estado.asas ?? 'lentas';
  const noAr = modo !== 'fechadas' && modo !== 'nenhuma';
  return {
    x: -dir * Math.round((estado.recuo ?? 0) * px),
    y: -Math.round(Math.sin(Math.min(1, estado.pulo ?? 0) * Math.PI) * 3 * px)
      + (noAr ? Math.round(Math.sin((estado.tempo ?? 0) * 4.2) * 0.7 * px) : 0),
  };
}

// Desenha um quadro. (x, y): canto superior esquerdo do corpo, em pixels do canvas; P: pixels do canvas por pixel de
// sprite. estado: ver montar(). O pulinho, o recuo e a flutuação deslocam o quadro inteiro, arredondados em px CSS
// quando se informa o dpr do canvas (é o que a ponta desenhada usa); a sombra dura (1 px para a direita e para baixo,
// na tela) ou o anel de contorno vão por baixo.
export function desenhar(ctx, x, y, P, estado = {}, dpr = 1) {
  const dir = estado.dir < 0 ? -1 : 1;
  const desvio = deslocar(estado, P / dpr);
  const ox = x + desvio.x * dpr;
  const oy = y + desvio.y * dpr;
  const quadrado = (c, r) => {
    const x0 = Math.round(ox + c * P), y0 = Math.round(oy + r * P);
    ctx.fillRect(x0, y0, Math.round(ox + (c + 1) * P) - x0, Math.round(oy + (r + 1) * P) - y0);
  };

  // Agrupa por chave já na coluna da tela (espelhada em torno do corpo quando olha à esquerda).
  const cheias = new Set();
  const porChave = new Map();
  for (const [codigo, chave] of celulas(estado)) {
    const c = codigo % 128 - 64, r = Math.floor(codigo / 128) - 32;
    const tela = dir > 0 ? c : LARGURA_CORPO - 1 - c;
    cheias.add((r + 32) * 128 + tela + 64);
    if (!porChave.has(chave)) porChave.set(chave, []);
    porChave.get(chave).push(tela, r);
  }

  // Por baixo: o anel (vizinhança de 8) ou a sombra, cada célula uma vez só (a cor tem transparência).
  const baixo = new Set();
  for (const codigo of cheias) {
    if (estado.contorno) {
      for (let j = -128; j <= 128; j += 128) for (let i = -1; i <= 1; i++) if (!cheias.has(codigo + j + i)) baixo.add(codigo + j + i);
    } else if (estado.sombra !== false && !cheias.has(codigo + 129)) {
      baixo.add(codigo + 129);
    }
  }
  if (baixo.size) {
    ctx.fillStyle = estado.contorno || SOMBRA;
    for (const codigo of baixo) quadrado(codigo % 128 - 64, Math.floor(codigo / 128) - 32);
  }

  const cores = paleta(estado);
  for (const [chave, lista] of porChave) {
    if (!cores[chave]) continue;
    ctx.fillStyle = cores[chave];
    for (let i = 0; i < lista.length; i += 2) quadrado(lista[i], lista[i + 1]);
  }
}

// Metal do site agora (html[data-metal]); um ator nasce nele.
const metalDoSite = () => {
  const metal = document.documentElement.dataset.metal;
  return metal === 'prata' || metal === 'ouro' ? metal : null;
};

// Monta um ator animado num canvas próprio, que quem usa move pela tela.
// opções: pixel (px CSS por px de sprite, inteiro ≥ 1), dpr (padrão devicePixelRatio, limitado a [1, 3]), reduzido.
export function montar(canvas, { pixel = 4, dpr, reduzido } = {}) {
  const d = Math.min(3, Math.max(1, dpr ?? window.devicePixelRatio ?? 1));
  const P = Math.max(1, Math.round(pixel));
  const largura = QUADRO.largura * P;
  const altura = QUADRO.altura * P;
  // O backing store é inteiro; o tamanho CSS acompanha (backing / dpr) para o navegador não reamostrar o canvas.
  canvas.width = Math.round(largura * d);
  canvas.height = Math.round(altura * d);
  canvas.style.width = `${canvas.width / d}px`;
  canvas.style.height = `${canvas.height / d}px`;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  let golpe = null;
  let piscar = 2;   // segundos até o próximo piscar; olhos fechados enquanto negativo

  // O estado como vai para a tela. Com movimento reduzido as asas ficam fechadas (e sem flutuar) e ele não pisca; o
  // golpe e o pulinho seguem, porque quem os pede espera o impacto.
  const comoDesenhado = () => {
    const e = ator.estado;
    const fechar = ator.reduzido && e.asas !== 'nenhuma' && e.asas !== 'fechadas';
    const piscando = !ator.reduzido && piscar < 0 && !e.dormindo;
    return fechar || piscando ? { ...e, asas: fechar ? 'fechadas' : e.asas, dormindo: e.dormindo || piscando } : e;
  };

  const ator = {
    canvas, pixel: P, dpr: d, largura, altura,
    reduzido: reduzido ?? matchMedia('(prefers-reduced-motion: reduce)').matches,
    // dir (1 | -1), maco (rad), cinzel (rad | null), asas, tempo (s), dormindo, sentado, sombra, contorno (cor | null),
    // elmo (true | cor da crista), passos, recuo (0–1), pulo (0–1), metal (null | 'prata' | 'ouro'),
    // tom (null | 'pedra' | 'gelo' | 'luz'), semBoina, kit (armadura; formato no topo deste arquivo).
    estado: { dir: 1, maco: MACO.repouso, cinzel: null, asas: 'lentas', tempo: 0, dormindo: false, sentado: false,
      sombra: true, contorno: null, elmo: null, passos: 0, recuo: 0, pulo: 0, metal: metalDoSite(), tom: null,
      semBoina: false, kit: null },
    definir(parcial) { Object.assign(this.estado, parcial); return this; },
    // O golpe sai de onde o maço está; aoImpacto roda uma vez aos 0,27 s, junto com o tranco para trás.
    golpear(aoImpacto) { golpe = { t: 0, de: this.estado.maco, aoImpacto, bateu: false }; return this; },
    get golpeando() { return !!golpe; },
    pular() { this.estado.pulo = 1; return this; },
    avancar(dt) {
      const e = this.estado;
      e.tempo += dt;
      piscar -= dt;
      if (piscar < -0.12) piscar = 1.8 + 2.6 * Math.random();
      e.recuo = Math.max(0, e.recuo - 8 * dt);
      e.pulo = Math.max(0, e.pulo - 3.2 * dt);
      if (golpe) {
        golpe.t += dt;
        e.maco = anguloDoGolpe(golpe.t, golpe.de);
        if (!golpe.bateu && golpe.t >= GOLPE.impacto) { golpe.bateu = true; e.recuo = 1; golpe.aoImpacto?.(); }
        if (golpe.t >= GOLPE.total) golpe = null;
      } else {
        e.maco += (MACO.repouso - e.maco) * (1 - Math.exp(-10 * dt));
      }
      return this;
    },
    pintar() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const Pd = P * d;
      desenhar(ctx, -QUADRO.x0 * Pd, -QUADRO.y0 * Pd, Pd, comoDesenhado(), d);
      return this;
    },
    // Quanto o quadro pintado agora está fora do repouso (recuo, pulinho, flutuação), em px CSS: some a ponta(), os
    // pes() ou as costas para saber onde estão na tela de verdade (lascas, corda).
    deslocamento() { return deslocar(comoDesenhado(), P); },
    // Pontos em px CSS a partir do canto do canvas, em repouso (sem pulo nem recuo), na direção atual.
    origem() { return { x: -QUADRO.x0 * P, y: -QUADRO.y0 * P }; },
    ponta() { const p = ponta(this.estado.dir); return { x: (p.x - QUADRO.x0) * P, y: (p.y - QUADRO.y0) * P }; },
    pes() { const x = this.estado.dir > 0 ? PES.x : LARGURA_CORPO - PES.x; return { x: (x - QUADRO.x0) * P, y: (PES.y - QUADRO.y0) * P }; },
    assento() { const x = this.estado.dir > 0 ? ASSENTO.x : LARGURA_CORPO - ASSENTO.x; return { x: (x - QUADRO.x0) * P, y: (ASSENTO.y - QUADRO.y0) * P }; },
  };
  return ator.pintar();
}
