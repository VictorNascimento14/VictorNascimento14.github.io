// As 25 medalhas do ateliê (Fase 2, docs/arquitetura.md §10). Aqui moram: a moeda que nasce onde a coisa aconteceu e
// voa girando até o canto; o HUD "n/25"; o medalheiro (Inventário e Medalhas); a janela pixel que as outras partes
// também usam; os metais (prata com 13, ouro com 25) e a onda que refunde o site quando o metal muda; e as conquistas
// passivas desta trilha: tontura, colecionador, golpe do dia, madrugada, e-mail, aba, console e retorno.
// Números da spec 06 (§1.3, §2, §4.2–4.7, §5.1–5.2, §6.1–6.2, §6.13, §6.17–6.20) e da spec 08 (§4.4–4.7).
//
// O módulo carrega no Node (tests/conquistas.test.js importa as contas puras): no topo nada toca o DOM, e o que
// depende da página (movimento, mascote, rolagem, seções) chega por import dinâmico no iniciar().
import { CONQUISTAS, LIMIAR_PRATA } from '../dados/conquistas.js';
import { perfil, projetos } from '../dados/perfil.js';
import { ler, gravar } from '../nucleo/memoria.js';
import { emitir, ouvir } from '../nucleo/sinais.js';
import { registrar, acordar } from '../nucleo/relogio.js';
import { montar, desenhar } from '../arte/escultor.js';
import { instalar as instalarCursor } from '../arte/cursor.js';

export { CONQUISTAS, LIMIAR_PRATA };

// ---------- números ----------

const TOTAL = CONQUISTAS.length;                          // 25
const POR_ID = new Map(CONQUISTAS.map((c, i) => [c.id, { ...c, i }]));
const LIGAS = ['bronze', 'prata', 'ouro'];
const POSTO = { bronze: 0, prata: 1, ouro: 2 };

// Voo da moeda (spec 06 §5.1): sobe nos primeiros 22%, depois um arco até a moeda do HUD, girando.
const VOO = 0.95;               // s
const SUBIDA = 0.22;            // fração do voo
const ALTURA_DA_SUBIDA = 46;    // px
const FOLGA_DO_ARCO = 90;       // px acima do mais alto entre o começo do arco e o HUD
const FILA = 0.35;              // s entre uma moeda e a próxima
const GIRO = 9;                 // rad/s: de perfil a cada ~0,35 s
// A onda do metal (§5.2): anéis de quadrados de 4 px a 1500 px/s, cinco faixas da frente para trás
// [deslocamento radial, cor, alfa]; as falhas cintilantes andam a cada 12 px de raio.
const ONDA = 1500;
const QUADRADO = 4;
const FAIXAS = [[0, 'd', 0.85], [-4, 'h', 1], [-8, 'l', 0.9], [-16, 'm', 0.45], [-28, 'l', 0.25]];
const FLASH = 700;              // ms com .fundido
const ROTULO = 2.8, ROTULO_METAL = 4.2;   // s
// Conquistas passivas.
const GIROS_DA_TONTURA = 15;    // 3 voltas do anel de 5 caixas
const QUIETO = 4000;            // ms sem girar zera a soma
const FORA_DA_ABA = 2500;       // ms
const ATRASO_DO_RETORNO = 4000; // ms
const TITULO_FORA = 'Volta! O mármore tá secando...';

// Tons da moeda: d aro na sombra e a marca (afundada), m face, l aro na luz, h face na luz, s borda no giro.
const TONS = {
  bronze: { d: '#5c4427', m: '#8d6a3b', l: '#c09760', h: '#e8cb95', s: '#3a2b1b' },
  prata: { d: '#4f575e', m: '#939ca4', l: '#c3cbd1', h: '#eef2f4', s: '#353b40' },
  ouro: { d: '#7d5509', m: '#cc961b', l: '#ecc145', h: '#fdeeab', s: '#5a3e07' },
  vazio: { d: '#191410', m: '#231d15', l: '#2c2116', h: '#3a2b1b', s: '#191410' },
};

const CABECAS = {
  boina: { nome: 'Boina', sobre: 'a de sempre' },
  elmo: { nome: 'Elmo', sobre: 'de gladiador', precisa: 'cabo' },
  careca: { nome: 'Sem boina', sobre: 'como no eureca', precisa: 'eureca' },
};

// ---------- as marcas ----------
// Uma grade 9 × 9 de uma cor por medalha, cunhada no meio da moeda ('#' = afundado). Os quatro cantos caem no aro e
// ficam sempre vazios. Desenho próprio, a partir do campo `marca` de js/dados/conquistas.js.
export const MARCAS = {
  cocegas: [
    '....#....',
    '....#....',
    '....#....',
    '....###..',
    '..#.####.',
    '..######.',
    '..######.',
    '...####..',
    '...####..',
  ],
  sino: [
    '....#....',
    '...###...',
    '..#####..',
    '..#####..',
    '..#####..',
    '.#######.',
    '#########',
    '.........',
    '....#....',
  ],
  terremoto: [
    '....#....',
    '....#....',
    '...#.....',
    '...#.....',
    '....#....',
    '.....#...',
    '....#.#..',
    '...#...#.',
    '..#......',
  ],
  nariz: [
    '.#.......',
    '.##......',
    '.##......',
    '.###.....',
    '.####....',
    '.#####...',
    '.######..',
    '.##..##..',
    '.##......',
  ],
  tedio: [
    '.........',
    '.#.....#.',
    '.#.....#.',
    '..#...#..',
    '..#...#..',
    '...#.#...',
    '....#....',
    '.........',
    '..#####..',
  ],
  eureca: [
    '...###...',
    '..#...#..',
    '.#.....#.',
    '.#..#..#.',
    '.#..#..#.',
    '..#.#.#..',
    '...###...',
    '...###...',
    '....#....',
  ],
  deploy: [
    '....#....',
    '...###...',
    '...#.#...',
    '...###...',
    '...###...',
    '..#####..',
    '.##.#.##.',
    '....#....',
    '...#.#...',
  ],
  tonto: [
    '.........',
    '.#######.',
    '.......#.',
    '.#####.#.',
    '.#...#.#.',
    '.#.###.#.',
    '.#.....#.',
    '.#######.',
    '.........',
  ],
  caixas: [
    '..#####..',
    '..#...#..',
    '..#####..',
    '.#######.',
    '.#.....#.',
    '.#######.',
    '.#.....#.',
    '.#######.',
    '.........',
  ],
  copinhos: [
    '.........',
    '...###...',
    '.##...##.',
    '#..###..#',
    '#..###..#',
    '#..###..#',
    '.##...##.',
    '...###...',
    '.........',
  ],
  golpe: [
    '.#######.',
    '.#######.',
    '.#######.',
    '....#....',
    '....#....',
    '....#....',
    '....#....',
    '...###...',
    '.........',
  ],
  petalas: [
    '..##.##..',
    '.#######.',
    '.###.###.',
    '.#######.',
    '..##.##..',
    '....#....',
    '..#.#....',
    '...##....',
    '....#....',
  ],
  madrugada: [
    '...##....',
    '..##.....',
    '.##......',
    '.##...#..',
    '.##..###.',
    '.##...#..',
    '.##......',
    '..##.....',
    '...##....',
  ],
  email: [
    '.........',
    '#########',
    '##.....##',
    '#.#...#.#',
    '#..#.#..#',
    '#...#...#',
    '#.......#',
    '#########',
    '.........',
  ],
  aba: [
    '...#.....',
    '..##.....',
    '.#######.',
    '..##...#.',
    '...#...#.',
    '.......#.',
    '......##.',
    '.#####...',
    '.........',
  ],
  console: [
    '.........',
    '..##.##..',
    '..#...#..',
    '..#...#..',
    '.#.....#.',
    '..#...#..',
    '..#...#..',
    '..##.##..',
    '.........',
  ],
  retorno: [
    '..#...#..',
    '.#######.',
    '.#######.',
    '.#.....#.',
    '.#.#.#.#.',
    '.#.....#.',
    '.#.#.#.#.',
    '.#.....#.',
    '.#######.',
  ],
  papo: [
    '.........',
    '.#######.',
    '#.......#',
    '#.#.#.#.#',
    '#.......#',
    '.#######.',
    '.##......',
    '.#.......',
    '.........',
  ],
  velha: [
    '.........',
    '.........',
    '.........',
    '#..#..##.',
    '.##..#..#',
    '.##..#..#',
    '#..#..##.',
    '.........',
    '.........',
  ],
  generoso: [
    '.........',
    '.##...##.',
    '####.####',
    '#########',
    '#########',
    '.#######.',
    '..#####..',
    '...###...',
    '....#....',
  ],
  cabo: [
    '.........',
    '.........',
    '.........',
    '...###...',
    '#.#####.#',
    '.#.###.#.',
    '...###...',
    '.........',
    '.........',
  ],
  cartas: [
    '.#####...',
    '.#.#.#...',
    '.#.#####.',
    '.#.#...#.',
    '.#.#...#.',
    '.#.#.#.#.',
    '.###...#.',
    '...#...#.',
    '...#####.',
  ],
  faro: [
    '..###....',
    '.#...#...',
    '.#...#...',
    '.#...#...',
    '..###....',
    '.....##..',
    '......##.',
    '.......##',
    '.........',
  ],
  admin: [
    '...###...',
    '..#...#..',
    '..#...#..',
    '.#######.',
    '.#######.',
    '.###.###.',
    '.###.###.',
    '.#######.',
    '.........',
  ],
  tetris: [
    '...###...',
    '...###...',
    '.........',
    '.###.###.',
    '.###.###.',
    '.........',
    '##.###.##',
    '##.###.##',
    '.........',
  ],
  // O encaixe vazio: um ponto de interrogação quase do tom da cavidade.
  vazio: [
    '..#####..',
    '.##...##.',
    '.##...##.',
    '.....##..',
    '....##...',
    '....##...',
    '.........',
    '....##...',
    '....##...',
  ],
};

// ---------- contas puras (os testes usam) ----------

export const nivelPara = n => (n >= TOTAL ? 'ouro' : n >= LIMIAR_PRATA ? 'prata' : 'bronze');
// A forma que os sprites usam: bronze é o desenho de base (null).
export const forma = liga => (liga === 'prata' || liga === 'ouro' ? liga : null);
// Só se veste um metal até o nível ganho.
export const metalLiberado = (liga, n) => Object.hasOwn(POSTO, liga) && POSTO[liga] <= POSTO[nivelPara(n)];

// "Falta 1 para a prata." · "Faltam 12 para o ouro." · null com as 25.
export function faltaPara(n) {
  if (n >= TOTAL) return null;
  const k = (n >= LIMIAR_PRATA ? TOTAL : LIMIAR_PRATA) - n;
  return `${k === 1 ? 'Falta' : 'Faltam'} ${k} para ${n >= LIMIAR_PRATA ? 'o ouro' : 'a prata'}.`;
}

// Lê o registro 'atelie' sem confiar nele: JSON estranho, campo faltando ou id desconhecido viram vazio. Assim a conta
// nunca passa de 25 e um navegador com lixo antigo não quebra o site.
export function lerAtelie(bruto) {
  const objeto = v => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
  const b = objeto(bruto);
  const encontradas = {};
  for (const [id, ms] of Object.entries(objeto(b.encontradas))) {
    if (POR_ID.has(id) && Number.isFinite(ms)) encontradas[id] = ms;
  }
  const placar = {};
  for (const [jogo, p] of Object.entries(objeto(b.placar))) placar[jogo] = { ...objeto(p) };
  const v = objeto(b.visual);
  const visual = {};
  if (Object.hasOwn(POSTO, v.metal)) visual.metal = v.metal;
  if (Object.hasOwn(CABECAS, v.cabeca)) visual.cabeca = v.cabeca;
  const atelie = { encontradas, placar, visual };
  if (typeof b.codigo === 'string' && /^OURO-[A-Z2-9]{4}$/.test(b.codigo)) atelie.codigo = b.codigo;
  if (Number.isFinite(b.zerado)) atelie.zerado = b.zerado;
  return atelie;
}

// Junta dois registros já lidos por lerAtelie: o desta aba e o que outra aba gravou no meio (sem isso, a aba com a
// memória antiga regravava o registro inteiro e apagava as medalhas da outra). `novo` é o mais recente: o visual e o
// texto dos placares vêm dele quando ele os tem. Medalha fica com a primeira data; nos placares, número fica com o
// maior, lista vira a união, "sim" vence "não" e objeto se junta por dentro. O que é de antes do último "apagar meu
// progresso" (`zerado`, a hora) não volta: o lado que ainda não sabia dele só traz as medalhas ganhas depois dessa hora
// (nada de placar, visual ou código); o lado que já sabia fica com tudo, mesmo que o relógio tenha voltado.
export function mesclarAtelie(antigo, novo) {
  const zerado = Math.max(antigo.zerado ?? 0, novo.zerado ?? 0);
  const valem = [antigo, novo].filter(r => (r.zerado ?? 0) === zerado);
  const atelie = { encontradas: {}, placar: {}, visual: {} };
  for (const r of [antigo, novo]) {
    const vale = valem.includes(r);
    for (const [id, ms] of Object.entries(r.encontradas)) {
      if ((vale || ms >= zerado) && !(atelie.encontradas[id] <= ms)) atelie.encontradas[id] = ms;
    }
  }
  for (const r of valem) {
    for (const [jogo, p] of Object.entries(r.placar)) atelie.placar[jogo] = juntar(atelie.placar[jogo] ?? {}, p);
    Object.assign(atelie.visual, r.visual);
  }
  const codigo = valem.find(r => r.codigo)?.codigo;
  if (codigo) atelie.codigo = codigo;
  if (zerado) atelie.zerado = zerado;
  return atelie;
}

const eObjeto = v => !!v && typeof v === 'object' && !Array.isArray(v);
function juntar(a, b) {
  const c = { ...a };
  for (const [k, v] of Object.entries(b)) {
    const w = c[k];
    if (typeof v === 'number' && typeof w === 'number') c[k] = Math.max(v, w);
    else if (Array.isArray(v) && Array.isArray(w)) c[k] = [...new Set([...w, ...v])];
    else if (typeof v === 'boolean' && typeof w === 'boolean') c[k] = v || w;
    else if (eObjeto(v) && eObjeto(w)) c[k] = juntar(w, v);
    else c[k] = v;
  }
  return c;
}

// A soma da tontura: posições giradas (cada vez que o anel assenta) enquanto o visitante não fica 4 s parado.
export function somarGiros(soma, posicoes, agora) {
  const antes = soma && agora - soma.em <= QUIETO ? soma.total : 0;
  return { total: antes + Math.max(0, Number(posicoes) || 0), em: agora };
}

// O código do prêmio: sem I, O, 0 e 1, que se confundem ao copiar à mão.
const LETRAS_DO_CODIGO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const gerarCodigo = (sorteio = Math.random) =>
  `OURO-${Array.from({ length: 4 }, () => LETRAS_DO_CODIGO[Math.floor(sorteio() * LETRAS_DO_CODIGO.length)]).join('')}`;

// A moeda de 15 × 15 com largura visível w (1 = de frente; o giro estreita): uma chave de cor por pixel ('.' fora).
// Disco com aro de ~2 px e luz de cima à esquerda; estreita, ganha a borda escura na silhueta direita e, abaixo de
// 0,6, perde a marca.
export function celulasDaMoeda(w = 1, marca = null, corDaMarca = 'd') {
  const k = Math.max(0.12, w);
  const linhas = [];
  for (let j = 0; j < 15; j++) {
    const linha = [];
    for (let i = 0; i < 15; i++) {
      const dx = (i + 0.5 - 7.5) / (7.5 * k), dy = (j + 0.5 - 7.5) / 7.5;
      const d = Math.hypot(dx, dy);
      const luz = dx + dy < -0.5;
      linha.push(d > 1 ? '.' : d > 0.74 ? (luz ? 'l' : 'd') : (luz ? 'h' : 'm'));
    }
    linhas.push(linha);
  }
  if (k < 0.95) {
    for (let j = 2; j <= 12; j++) {
      const c = Math.floor(7.5 + 7.5 * k * Math.sqrt(Math.max(0, 1 - ((j + 0.5 - 7.5) / 7.5) ** 2)) - 0.5);
      if (linhas[j][c] && linhas[j][c] !== '.') linhas[j][c] = 's';
    }
  }
  if (marca && k >= 0.6) {
    const c0 = Math.round(7.5 - 4.5 * k);
    marca.forEach((linha, mj) => {
      for (let mi = 0; mi < 9; mi++) if (linha[mi] === '#') linhas[3 + mj][c0 + Math.floor(mi * k + 1e-6)] = corDaMarca;
    });
  }
  return linhas.map(l => l.join(''));
}

// ---------- o registro ----------

let atelie = null;
const estado = () => (atelie ??= lerAtelie(ler('atelie', null)));
// Relê o disco e grava a mescla: outra aba aberta pode ter ganhado alguma coisa desde a última leitura.
function salvar() {
  atelie = mesclarAtelie(lerAtelie(ler('atelie', null)), estado());
  gravar('atelie', atelie);
}

export const tem = id => Object.hasOwn(estado().encontradas, id);
export const quantas = () => Object.keys(estado().encontradas).length;
export const nivel = () => nivelPara(quantas());

// O metal vestido ('bronze' | 'prata' | 'ouro'): o escolhido, se liberado; senão o nível ganho. Fica guardado aqui e
// só muda no pouso que sobe de nível, no inventário e ao apagar: a 13ª medalha conta já no desbloqueio, mas o metal
// só vira quando a moeda dela pousa.
let vestido = null;
function ligaVestida() {
  if (!vestido) {
    const escolhido = estado().visual.metal;
    vestido = escolhido && metalLiberado(escolhido, quantas()) ? escolhido : nivel();
  }
  return vestido;
}
export const metal = () => forma(ligaVestida());

const cabecaLiberada = c => Object.hasOwn(CABECAS, c) && (!CABECAS[c].precisa || tem(CABECAS[c].precisa));
export function cabeca() {
  const c = estado().visual.cabeca;
  return c && cabecaLiberada(c) ? c : 'boina';
}
const visualDa = c => ({ elmo: c === 'elmo' ? true : null, semBoina: c === 'careca' });
export const visual = () => visualDa(cabeca());

// Placar de cada jogo, guardado junto: sem patch só lê (e cria {} se faltar); com patch mescla, salva e atualiza.
export function placar(jogo, patch) {
  const todos = estado().placar;
  const atual = (todos[jogo] ??= {});
  if (patch && typeof patch === 'object') {
    Object.assign(atual, patch);
    salvar();
    atualizarMedalheiro();
  }
  return estado().placar[jogo] ?? atual;   // depois de salvar, o registro é a mescla com o disco
}

// Lê um número do placar sem criar nada (aceita os nomes da spec e os em português).
function numero(jogo, ...campos) {
  const p = estado().placar[jogo];
  for (const campo of campos) if (Number.isFinite(Number(p?.[campo]))) return Number(p[campo]);
  return 0;
}

// ---------- o que depende da página (preenchido no iniciar) ----------

let montado = false;
let reduzido = () => false;
let masc = null;         // js/mascote.js
let rolagem = null;      // js/nucleo/rolagem.js
let caixasDoAnel = null; // anelDeCaixas de js/secoes/projetos.js
let ponteiro = null;     // último ponto do mouse, para a onda alcançar o cursor

const dprAtual = () => Math.min(3, Math.max(1, globalThis.devicePixelRatio || 1));
function criar(tag, classe, texto) {
  const el = document.createElement(tag);
  if (classe) el.className = classe;
  if (texto != null) el.textContent = texto;
  return el;
}
const valorDe = (v, ...args) => {
  try { return typeof v === 'function' ? v(...args) : v; } catch (erro) { globalThis.reportError?.(erro); return null; }
};
const falar = (texto, segundos) => { if (masc?.mascote.ativo) masc.falar(texto, segundos); };

// ---------- desbloquear e o voo ----------

let hud = null, hudMoeda = null, hudConta = null, hudMedidor = null;
let rotulo = null, rotuloTipo = null, rotuloNome = null, rotuloPrazo = 0;
let anuncio = null, ceu = null, ctxCeu = null;
let tomDoHud = 'bronze';
const moedas = [];       // em voo (e na fila): { c, sobe, de, t, tom }
const faiscas = [];

export function desbloquear(id, de) {
  const c = POR_ID.get(id);
  if (!c || tem(id)) return false;
  const antes = nivel();
  estado().encontradas[id] = Date.now();
  salvar();
  const depois = nivel();
  const sobe = depois !== antes ? depois : null;
  emitir('conquista', { id });
  if (anuncio) anuncio.textContent = `Medalha: ${c.nome}. ${c.achada}${sobe ? ` O escultor virou de ${depois}.` : ''}`;
  if (!montado || reduzido()) { pousar({ c, sobe }); return true; }
  moedas.push({ c, sobe, de: origemDaMoeda(de), t: -FILA * moedas.length, tom: tomDoHud });
  pintarHud();   // o HUD aparece já com a moeda no ar: ela precisa de alvo
  acordar();
  return true;
}

// De onde a moeda sai: um elemento (centro, perto do topo), um ponto da janela, o mascote ou o meio da tela.
function origemDaMoeda(de) {
  if (de && typeof de.x === 'number' && typeof de.y === 'number' && !(de instanceof Element)) return { x: de.x, y: de.y };
  const r = de instanceof Element ? retanguloDe(de) : null;
  if (r) return { x: (r.x0 + r.x1) / 2, y: r.y0 + Math.min((r.y1 - r.y0) / 2, 40) };
  const m = mascoteVisivel();
  if (m) return { x: (m.x0 + m.x1) / 2, y: m.y0 + (m.y1 - m.y0) / 3 };
  return { x: innerWidth / 2, y: innerHeight * 0.45 };
}

// O mascote conta como visível com o meio do sprite dentro da janela (uma beirada aparecendo não basta).
function mascoteVisivel() {
  const botao = masc?.mascote.botao;
  const r = botao && retanguloDe(masc.mascote.sprite);
  if (!r) return null;
  const x = (r.x0 + r.x1) / 2, y = (r.y0 + r.y1) / 2;
  return x >= 0 && y >= 0 && x <= innerWidth && y <= innerHeight && getComputedStyle(botao).opacity !== '0' ? r : null;
}

function centroDaMoedaDoHud() {
  const r = hudMoeda.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

// Ponto da moeda em u (0–1) do voo: sobe 46 px com saída cúbica; depois uma Bézier quadrática até o HUD de agora.
function pontoDoVoo(m, u) {
  const alto = { x: m.de.x, y: m.de.y - ALTURA_DA_SUBIDA };
  if (u < SUBIDA) {
    const p = u / SUBIDA;
    return { x: m.de.x, y: m.de.y - ALTURA_DA_SUBIDA * (1 - (1 - p) ** 3) };
  }
  const v = (u - SUBIDA) / (1 - SUBIDA);
  const s = v * v * (3 - 2 * v);
  const alvo = centroDaMoedaDoHud();
  const meio = { x: alto.x + 0.35 * (alvo.x - alto.x), y: Math.min(alto.y, alvo.y) - FOLGA_DO_ARCO };
  const a = 1 - s;
  return { x: a * a * alto.x + 2 * a * s * meio.x + s * s * alvo.x, y: a * a * alto.y + 2 * a * s * meio.y + s * s * alvo.y };
}

function pousar({ c, sobe }) {
  if (sobe) {
    estado().visual.metal = sobe;   // ganhar um nível sobrescreve a escolha do inventário
    salvar();
  }
  if (montado) {
    pintarHud();
    if (!reduzido()) {
      hudMoeda.classList.remove('pulou');
      void hudMoeda.offsetWidth;
      hudMoeda.classList.add('pulou');
      soltarFaiscas();
    }
    const n = quantas() - moedas.length;
    mostrarRotulo(sobe ? `medalha · virei de ${sobe}` : `medalha ${n} de ${TOTAL}`, c.nome, sobe ? ROTULO_METAL : ROTULO);
    atualizarMedalheiro();
  }
  if (!sobe) return;
  emitir('nivel', { nivel: sobe });
  // Quem já vestiu esse metal no inventário enquanto a moeda voava não precisa de outra onda.
  if (sobe !== ligaVestida()) refundir(sobe);
  if (masc?.mascote.ativo && !reduzido()) masc.mascote.ator?.pular();
  falar(sobe === 'ouro'
    ? ['Virei de ouro! E o ateliê inteiro também!', 'Abre o medalheiro: o Victor deixou um recado lá.']
    : 'Virei de prata! E levei tudo junto!', 3.4);
}

// Dez faíscas radiais do centro da moeda do HUD (a cada 36°).
function soltarFaiscas() {
  const { x, y } = centroDaMoedaDoHud();
  for (let i = 0; i < 10; i++) {
    const angulo = (i * Math.PI) / 5, v = 60 + Math.random() * 50;
    faiscas.push({ x, y, vx: Math.cos(angulo) * v, vy: Math.sin(angulo) * v, idade: 0, vida: 0.35 + Math.random() * 0.2 });
  }
}

function mostrarRotulo(tipo, nome, segundos) {
  rotuloTipo.textContent = tipo;
  rotuloNome.textContent = nome;
  rotulo.hidden = false;
  rotulo.classList.remove('entra');
  void rotulo.offsetWidth;
  rotulo.classList.add('entra');
  clearTimeout(rotuloPrazo);
  rotuloPrazo = setTimeout(() => { rotulo.hidden = true; }, segundos * 1000);
}

// ---------- a moeda em pixel ----------

function pintarMoeda(ctx, x, y, Pd, tom, marca = null, w = 1) {
  const cores = TONS[tom] ?? TONS.bronze;
  const linhas = celulasDaMoeda(w, marca, tom === 'vazio' ? 'h' : 'd');
  for (let j = 0; j < 15; j++) {
    for (let i = 0; i < 15; i++) {
      const chave = linhas[j][i];
      if (chave === '.') continue;
      ctx.fillStyle = cores[chave];
      ctx.fillRect(x + i * Pd, y + j * Pd, Pd, Pd);
    }
  }
}

// Canvas de uma moeda parada: P px CSS por pixel de moeda, arredondado no px de dispositivo.
function moedaNoCanvas(canvas, P, tom, marca) {
  const d = dprAtual(), Pd = Math.max(1, Math.round(P * d)), lado = 15 * Pd;
  if (canvas.width !== lado || canvas.height !== lado) {
    canvas.width = canvas.height = lado;
    canvas.style.width = canvas.style.height = `${lado / d}px`;
  }
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, lado, lado);
  pintarMoeda(ctx, 0, 0, Pd, tom, marca);
}

// ---------- o HUD ----------

function pintarHud() {
  if (!hud) return;
  const n = quantas() - moedas.length;
  hudConta.textContent = `${n}/${TOTAL}`;
  [...hudMedidor.children].forEach((t, i) => t.classList.toggle('aceso', i < n));
  hud.dataset.metal = tomDoHud;
  hud.hidden = !(n > 0 || moedas.length);
  hud.setAttribute('aria-label', `Medalhas: ${quantas()} de ${TOTAL}. Abrir o inventário do escultor e o medalheiro.`);
  moedaNoCanvas(hudMoeda, 2, tomDoHud, null);
}

function montarHud() {
  hud = criar('button', 'med-hud');
  hud.type = 'button';
  hud.hidden = true;
  hudMoeda = criar('canvas', 'med-hud-moeda pixel');
  hudMoeda.setAttribute('aria-hidden', 'true');
  const texto = criar('span', 'med-hud-texto');
  texto.setAttribute('aria-hidden', 'true');
  hudConta = criar('span', 'med-hud-conta');
  hudMedidor = criar('span', 'med-hud-medidor');
  // O 13º tracinho é mais alto: ali o site vira prata.
  for (let i = 0; i < TOTAL; i++) hudMedidor.append(criar('i', i === LIMIAR_PRATA - 1 ? 'marco' : ''));
  texto.append(hudConta, hudMedidor);
  hud.append(hudMoeda, texto);
  hud.addEventListener('click', () => abrir());

  rotulo = criar('div', 'med-rotulo');
  rotulo.setAttribute('aria-hidden', 'true');
  rotulo.hidden = true;
  rotuloTipo = criar('span', 'med-rotulo-tipo');
  rotuloNome = criar('strong', 'med-rotulo-nome');
  rotulo.append(rotuloTipo, rotuloNome);
  rotulo.addEventListener('click', () => abrir('med'));

  anuncio = criar('p', 'sr-only');
  anuncio.setAttribute('role', 'status');
  anuncio.setAttribute('aria-live', 'polite');

  ceu = criar('canvas', 'med-ceu');
  ceu.setAttribute('aria-hidden', 'true');
  ctxCeu = ceu.getContext('2d');

  document.body.append(hud, rotulo, anuncio, ceu);
  pintarHud();

  // Sobre a 1ª tela (mais de 20% dela à vista), HUD e rótulo se alinham ao cabeçalho do herói.
  const inicio = document.getElementById('inicio');
  if (inicio && 'IntersectionObserver' in window) {
    new IntersectionObserver(([e]) => {
      const sobre = e.isIntersecting && e.intersectionRatio > 0.2;
      hud.classList.toggle('sobre-heroi', sobre);
      rotulo.classList.toggle('sobre-heroi', sobre);
    }, { threshold: [0, 0.2, 0.6] }).observe(inicio);
  }
}

// ---------- o céu: moedas, faíscas e a onda (um canvas fixo, em px de dispositivo) ----------

let onda = null;          // { x, y, t, alcance, liga }
let pendentes = [];       // { p, em, liga, aoVivo }: quem a onda ainda não alcançou
let rodada = 0;

function prepararCeu() {
  const d = dprAtual();
  const W = Math.round(document.documentElement.clientWidth * d), H = Math.round(innerHeight * d);
  if (ceu.width !== W || ceu.height !== H) { ceu.width = W; ceu.height = H; }
  ctxCeu.imageSmoothingEnabled = false;
  ctxCeu.globalAlpha = 1;
  ctxCeu.clearRect(0, 0, W, H);
  return d;
}

function quadro(dt) {
  if (!montado || !(moedas.length || faiscas.length || onda || pendentes.length)) return false;
  const parado = reduzido();
  const d = prepararCeu();

  // Moedas: a primeira da fila anda; as de trás esperam a vez (t negativo).
  for (const m of [...moedas]) {
    m.t += parado ? VOO : dt;
    if (m.t < VOO) continue;
    moedas.splice(moedas.indexOf(m), 1);
    pousar(m);
  }
  for (const m of moedas) {
    if (m.t < 0) continue;
    const u = m.t / VOO;
    const { x, y } = pontoDoVoo(m, u);
    const Pd = Math.max(1, Math.round((u < 0.8 ? 3 : 2) * d));
    const w = Math.abs(Math.cos(GIRO * m.t));
    const tom = m.sobe && u > 0.9 ? m.sobe : m.tom;
    pintarMoeda(ctxCeu, Math.round(x * d - 7.5 * Pd), Math.round(y * d - 7.5 * Pd), Pd, tom, MARCAS[m.c.id], w);
  }

  // Faíscas: amortecem 0,9 a cada 1/60 s e somem aos poucos.
  const amortece = 0.9 ** (60 * dt);
  for (let i = faiscas.length - 1; i >= 0; i--) {
    const f = faiscas[i];
    f.idade += dt;
    if (parado || f.idade >= f.vida) { faiscas.splice(i, 1); continue; }
    f.x += f.vx * dt;
    f.y += f.vy * dt;
    f.vx *= amortece;
    f.vy *= amortece;
    ctxCeu.globalAlpha = 1 - f.idade / f.vida;
    ctxCeu.fillStyle = f.idade < 0.1 ? '#fdeeab' : '#ecc145';
    const lado = Math.max(1, Math.round(3 * d));
    ctxCeu.fillRect(Math.round((f.x - 1.5) * d), Math.round((f.y - 1.5) * d), lado, lado);
  }
  ctxCeu.globalAlpha = 1;

  // A onda e quem ela alcança.
  if (onda) {
    onda.t += dt;
    if (parado || ONDA * onda.t + FAIXAS.at(-1)[0] > onda.alcance) onda = null;
    else desenharOnda(d);
  }
  if (pendentes.length) {
    const agora = onda?.t ?? Infinity;
    const chegou = pendentes.filter(x => x.em <= agora);
    pendentes = pendentes.filter(x => x.em > agora);
    for (const x of chegou) aplicar(x.p, x.liga, x.aoVivo);
  }
  return !!(moedas.length || faiscas.length || onda || pendentes.length);
}

function desenharOnda(d) {
  const { x, y, t, alcance, liga } = onda;
  const r = ONDA * t;
  const cores = TONS[liga];
  const W = ceu.width / d, H = ceu.height / d;
  const lado = Math.max(1, Math.round(QUADRADO * d));
  const desbota = 0.35 + 0.65 * Math.max(0, 1 - r / alcance);
  FAIXAS.forEach(([desvio, chave, alfa], faixa) => {
    const R = r + desvio;
    if (R <= 0) return;
    const n = Math.max(8, Math.round((2 * Math.PI * R) / 6));
    ctxCeu.globalAlpha = alfa * desbota;
    ctxCeu.fillStyle = cores[chave];
    for (let j = 0; j < n; j++) {
      if ((7 * j + 3 * faixa + Math.floor(r / 12)) % 11 === 0) continue;   // as falhas que cintilam
      const a = (2 * Math.PI * j) / n;
      const gx = Math.floor((x + R * Math.cos(a)) / QUADRADO) * QUADRADO;
      const gy = Math.floor((y + R * Math.sin(a)) / QUADRADO) * QUADRADO;
      if (gx < -QUADRADO || gy < -QUADRADO || gx > W || gy > H) continue;
      ctxCeu.fillRect(Math.round(gx * d), Math.round(gy * d), lado, lado);
    }
  });
  ctxCeu.globalAlpha = 1;
}

// ---------- fundir e refundir ----------
// Participante = { alvo: elemento | () => {x, y} | null, fn(metal, aoVivo), segurar?(liga), liga }.
// `segurar` é só para as seções que já trocam sozinhas ao mudar html[data-metal] (as caixas e os pergaminhos): logo
// depois da troca, elas voltam ao metal que mostravam e só mudam quando a onda chega.

const participantes = new Set();

function participante(p) {
  p.liga = ligaVestida();
  participantes.add(p);
  try { p.fn?.(metal(), false); } catch (erro) { globalThis.reportError?.(erro); }
  return () => { participantes.delete(p); };
}

export function fundir(alvo, fn) {
  return participante({ alvo, fn });
}

function aplicar(p, liga, aoVivo) {
  if (!participantes.has(p)) return;
  p.liga = liga;
  try { p.fn?.(forma(liga), aoVivo); } catch (erro) { globalThis.reportError?.(erro); }
  if (aoVivo) piscar(p.alvo);
}

const flashes = new WeakMap();
function piscar(alvo) {
  if (!(alvo instanceof Element) || reduzido()) return;
  const lista = alvo instanceof HTMLCanvasElement ? [alvo] : [...alvo.querySelectorAll('canvas')];
  if (!lista.length) lista.push(alvo);
  for (const el of lista) {
    el.classList.remove('fundido');
    void el.offsetWidth;
    el.classList.add('fundido');
    clearTimeout(flashes.get(el));
    flashes.set(el, setTimeout(() => el.classList.remove('fundido'), FLASH));
  }
}

function retanguloDe(alvo) {
  if (typeof alvo === 'function') {
    const p = valorDe(alvo);
    return p ? { x0: p.x, y0: p.y, x1: p.x, y1: p.y } : null;
  }
  if (!alvo?.getBoundingClientRect || !alvo.isConnected) return null;
  // Um contêiner sem tamanho próprio (a caixa do anel posiciona os canvases por fora dela) mede pelos canvases.
  const partes = [alvo, ...alvo.querySelectorAll('canvas')].map(el => el.getBoundingClientRect()).filter(r => r.width || r.height);
  if (!partes.length) return null;
  return {
    x0: Math.min(...partes.map(r => r.left)), y0: Math.min(...partes.map(r => r.top)),
    x1: Math.max(...partes.map(r => r.right)), y1: Math.max(...partes.map(r => r.bottom)),
  };
}
const naTela = r => !!r && r.x1 >= 0 && r.y1 >= 0 && r.x0 <= innerWidth && r.y0 <= innerHeight;

function aplicarNoHtml(liga) {
  if (typeof document === 'undefined') return;
  const raiz = document.documentElement;
  if (liga === 'bronze') raiz.removeAttribute('data-metal');
  else raiz.dataset.metal = liga;
}

// Troca o metal vestido. O <html> muda na hora (os painéis seguem pelo CSS); cada coisa registrada muda quando a onda
// a alcança, com o flash .fundido. Sem onda (bronze, movimento reduzido ou nada à vista para ela sair): tudo de uma vez.
function refundir(liga, origem = null) {
  const minha = ++rodada;
  vestido = liga;
  gravar('metal', liga);
  aplicarNoHtml(liga);
  tomDoHud = liga;
  pendentes = [];
  onda = null;
  if (montado) { pintarHud(); repintarJanelas(); vestirMascote(); }
  emitir('metal', { metal: forma(liga) });
  const centro = montado && liga !== 'bronze' && !reduzido() ? centroDaOnda(origem) : null;
  if (!centro) {
    for (const p of [...participantes]) aplicar(p, liga, false);
    return;
  }
  const W = document.documentElement.clientWidth, H = innerHeight;
  const alcance = Math.max(...[[0, 0], [W, 0], [0, H], [W, H]].map(([cx, cy]) => Math.hypot(cx - centro.x, cy - centro.y))) + 40;
  onda = { ...centro, t: 0, alcance, liga };
  const lista = [];
  for (const p of [...participantes]) {
    if (p.alvo instanceof Element && !p.alvo.isConnected) { participantes.delete(p); continue; }
    const r = retanguloDe(p.alvo);
    const dentro = naTela(r);
    const dx = dentro ? Math.max(r.x0 - centro.x, 0, centro.x - r.x1) : 0;
    const dy = dentro ? Math.max(r.y0 - centro.y, 0, centro.y - r.y1) : 0;
    lista.push({ p, liga, aoVivo: dentro, em: dentro ? Math.hypot(dx, dy) / ONDA : 0 });
  }
  // As seções que ouvem html[data-metal] já trocaram (num microtask, antes deste): segura cada uma no metal que
  // mostrava; daqui em diante o relógio solta cada participante quando a onda chega.
  queueMicrotask(() => {
    if (minha !== rodada) return;
    for (const { p } of lista) {
      try { p.segurar?.(p.liga); } catch (erro) { globalThis.reportError?.(erro); }
    }
    pendentes = lista;
    acordar();
  });
  acordar();
}

// De onde a onda sai: o elemento pedido (o retrato do inventário), o mascote ou a moeda do HUD, o primeiro à vista.
function centroDaOnda(origem) {
  for (const r of [retanguloDe(origem), mascoteVisivel(), retanguloDe(hud?.hidden ? null : hudMoeda)]) {
    if (naTela(r)) return { x: (r.x0 + r.x1) / 2, y: (r.y0 + r.y1) / 2 };
  }
  return null;
}

// As partes de metal das seções, registradas daqui pelos ganchos que elas já expõem.
function participarDasSecoes(projetosMod, arenaMod, contatoMod) {
  if (masc?.mascote.sprite) {
    participante({ alvo: masc.mascote.sprite, fn: m => { masc.mascote.ator?.definir({ metal: m }); acordar(); } });
  }
  // O cursor muda onde o ponteiro estiver (sem mouse, ou fora da tela, muda na hora).
  participante({ alvo: () => ponteiro, fn: m => instalarCursor(m) });
  // As caixas: o brilho de fundição atravessa cada uma quando a onda passa.
  const anel = projetosMod?.anelDeCaixas;
  for (const c of anel?.caixas ?? []) {
    participante({
      alvo: c.el,
      segurar: liga => { c.metal = liga; c.fundicaoT = null; c.suja = true; },
      fn: (m, aoVivo) => {
        c.metal = m ?? 'bronze';
        if (aoVivo && !reduzido()) c.fundicaoT = 0;
        anel.redesenhar(c);
      },
    });
  }
  // A placa lê o metal do <html> a cada pintura: troca sozinha, e a onda só passa o flash por ela.
  const placa = document.getElementById('placa-canvas');
  if (placa) participante({ alvo: placa, fn: () => {} });
  // Os gladiadores: cada um repinta no metal novo quando a onda chega.
  for (const r of arenaMod?.arena?.rivais ?? []) {
    participante({ alvo: r.canvas, fn: m => { r.ator?.definir({ metal: m }).pintar(); } });
  }
  // As varas dos pergaminhos do contato.
  for (const c of contatoMod?.contato?.casas ?? []) {
    participante({
      alvo: c.canvas,
      segurar: liga => { c.pergaminho?.definir({ metal: liga }); c.sujo = true; },
      fn: m => { c.pergaminho?.definir({ metal: m ?? 'bronze' }); c.sujo = true; acordar(); },
    });
  }
}

// ---------- vestir ----------

function vestirMascote() {
  masc?.mascote.ator?.definir(visual());
  acordar();
}

export function vestir({ metal: liga, cabeca: c } = {}) {
  if (liga !== undefined && !metalLiberado(liga, quantas())) return false;
  if (c !== undefined && !cabecaLiberada(c)) return false;
  if (c !== undefined) {
    estado().visual.cabeca = c;
    salvar();
    if (montado) { vestirMascote(); repintarJanelas(); }
    emitir('visual', visual());
  }
  if (liga !== undefined) {
    estado().visual.metal = liga;
    salvar();
    if (liga !== ligaVestida()) refundir(liga, painel?.j.aberta && abaAtual === 'inv' ? painel.pedestal : null);
  }
  return true;
}

// Apaga as medalhas, os placares, o visual e o código; a visita é do herói e fica. O `zerado` (a hora; se o relógio
// andou para trás, depois do apagar anterior e da medalha mais nova) avisa as outras abas, e o sinal 'reset', as partes
// desta, que zeram o que contaram em memória: nada do que veio antes volta.
function apagarProgresso() {
  const antes = estado();
  const zerado = Math.max(Date.now(), (antes.zerado ?? 0) + 1, ...Object.values(antes.encontradas).map(ms => ms + 1));
  const vazio = { ...lerAtelie(null), zerado };
  gravar('atelie', vazio);
  adotar(vazio);
}

// Outra aba gravou (ou a página voltou do cache do navegador com a memória parada): esta adota o registro do disco,
// mesclado com o dela, e o site passa a mostrá-lo, sem moeda (a medalha foi ganha lá). Um "apagar" feito lá zera aqui.
function adotar(bruto) {
  const antes = estado(), n = quantas(), c = cabeca(), liga = ligaVestida();
  atelie = mesclarAtelie(antes, lerAtelie(bruto));
  if ((atelie.zerado ?? 0) > (antes.zerado ?? 0)) {
    moedas.length = 0;
    giros = null;
    emitir('reset');
  }
  vestido = null;
  if (ligaVestida() !== liga) refundir(ligaVestida());
  if (nivel() !== nivelPara(n)) emitir('nivel', { nivel: nivel() });
  if (cabeca() !== c) {
    vestirMascote();
    emitir('visual', visual());
  }
  pintarHud();
  repintarJanelas();
}

// ---------- a janela pixel ----------
// Diálogo modal (spec 06 §3.1.1): uma aberta por vez, foco preso, Esc fecha, devolve o foco. O rosto é o escultor
// virado à direita, de asas recolhidas, no metal e na cabeça de agora. Aceita os nomes da spec em inglês também
// (title, className, look, onShow, onClose, keys; line, look, title, show, close), para quem programou por ela.

const janelas = new Set();
let janelaAberta = null;
let contadorDeJanelas = 0;
// O retrato parado do escultor: só o corpo, sem a folga do ator montado para as asas abertas e o maço erguido.
const RECORTE = { x0: -3, y0: -4, largura: 23, altura: 22 };

function pintarRetrato(canvas, P, estadoDoAtor) {
  const d = dprAtual(), Pd = P * d;
  const W = Math.round(RECORTE.largura * Pd), H = Math.round(RECORTE.altura * Pd);
  if (canvas.width !== W || canvas.height !== H) {
    canvas.width = W;
    canvas.height = H;
    canvas.style.width = `${W / d}px`;
    canvas.style.height = `${H / d}px`;
  }
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, W, H);
  desenhar(ctx, -RECORTE.x0 * Pd, -RECORTE.y0 * Pd, Pd, estadoDoAtor, d);
}

export function janela(opcoes = {}) {
  const o = {
    id: opcoes.id ?? String(++contadorDeJanelas),
    titulo: opcoes.titulo ?? opcoes.title ?? '',
    classe: opcoes.classe ?? opcoes.className ?? '',
    pixel: opcoes.pixel ?? 2,
    aoMostrar: opcoes.aoMostrar ?? opcoes.onShow,
    aoFechar: opcoes.aoFechar ?? opcoes.onClose,
    teclas: opcoes.teclas ?? opcoes.keys,
  };
  let extra = { ...(opcoes.visual ?? opcoes.look) };
  const idTitulo = `janela-${o.id}-titulo`;

  const el = criar('div', `janela ${o.classe}`.trim());
  el.hidden = true;
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-labelledby', idTitulo);
  const folha = criar('div', 'janela-folha');
  folha.tabIndex = -1;
  const cabecaEl = criar('header', 'janela-cabeca');
  const rosto = criar('canvas', 'janela-rosto pixel');
  rosto.setAttribute('aria-hidden', 'true');
  const titulos = criar('div', 'janela-titulos');
  const tituloEl = criar('h2', 'janela-titulo', o.titulo);
  tituloEl.id = idTitulo;
  const falaEl = criar('p', 'janela-fala');
  falaEl.setAttribute('aria-live', 'polite');
  titulos.append(tituloEl, falaEl);
  const botaoFechar = criar('button', 'janela-fechar', '×');
  botaoFechar.type = 'button';
  botaoFechar.setAttribute('aria-label', 'Fechar');
  cabecaEl.append(rosto, titulos, botaoFechar);
  const corpo = criar('div', 'janela-corpo');
  folha.append(cabecaEl, corpo);
  el.append(folha);
  document.body.append(el);

  let aberta = false, anterior = null, pulo = 0, animando = 0;
  const pintarRosto = () => pintarRetrato(rosto, o.pixel, { ...ator.estado, pulo });
  // O pulinho do rosto a cada fala nova: 0,6 s no relógio, depois dorme.
  registrar(dt => {
    if (!aberta || animando <= 0) return false;
    animando -= dt;
    pulo = Math.max(0, pulo - 3.2 * dt);
    pintarRosto();
    return animando > 0;
  });

  const focaveis = () => [...folha.querySelectorAll('button, [href], input, select, textarea, [tabindex]')]
    .filter(x => x.tabIndex >= 0 && !x.disabled && x.getClientRects().length);
  const pular = () => { if (aberta && !reduzido()) { pulo = 1; animando = 0.6; acordar(); } };
  // O rosto responde como um ator (definir, pular), para quem quiser mudar a cara dele: elmo, olhos fechados, tom.
  const ator = {
    canvas: rosto,
    get estado() { return { dir: 1, asas: 'fechadas', metal: metal(), ...visual(), ...extra }; },
    definir(parcial) { Object.assign(extra, parcial); if (aberta) pintarRosto(); return ator; },
    pular() { pular(); return ator; },
  };

  const api = {
    el, folha, corpo,
    get aberta() { return aberta; },
    get rosto() { return ator; },
    fala(texto, pulinho = true) {
      falaEl.textContent = texto ?? '';
      if (pulinho !== false) pular();
      return api;
    },
    visual(estadoExtra) { extra = { ...estadoExtra }; if (aberta) pintarRosto(); return api; },
    titulo(texto) { tituloEl.textContent = texto ?? ''; return api; },
    pintar() { if (aberta) pintarRosto(); return api; },
    mostrar() {
      if (aberta) return api;
      if (janelaAberta && janelaAberta !== api) janelaAberta.fechar();
      anterior = document.activeElement;
      aberta = true;
      janelaAberta = api;
      el.hidden = false;
      document.documentElement.classList.add('janela-aberta');
      pulo = 0;
      pintarRosto();
      folha.scrollTop = 0;
      folha.focus({ preventScroll: true });
      valorDe(o.aoMostrar, api);
      return api;
    },
    fechar() {
      if (!aberta) return api;
      aberta = false;
      el.hidden = true;
      if (janelaAberta === api) {
        janelaAberta = null;
        document.documentElement.classList.remove('janela-aberta');
      }
      valorDe(o.aoFechar, api);
      // Quem abriu pode ter sumido (o HUD se esconde ao apagar o progresso): aí o foco vai para o escultor, ou para o
      // tabuleiro do /admin, em vez de cair no <body>.
      const pode = x => x?.isConnected && !x.disabled && x.getClientRects().length;
      [anterior, document.getElementById('escultor'), document.getElementById('tabuleiro')].find(pode)
        ?.focus({ preventScroll: true });
      anterior = null;
      return api;
    },
  };
  // Os nomes da spec 06 §3.1.1, para quem programou por ela.
  Object.defineProperties(api, {
    sheet: { get: () => folha }, body: { get: () => corpo }, open: { get: () => aberta }, face: { get: () => ator },
  });
  Object.assign(api, { line: api.fala, look: api.visual, title: api.titulo, show: api.mostrar, close: api.fechar });

  botaoFechar.addEventListener('click', () => api.fechar());
  // Nada digitado aqui chega à página (rolagem, segredos, Esc do mascote).
  el.addEventListener('keydown', e => {
    e.stopPropagation();
    if (valorDe(o.teclas, e) === true) return;
    if (e.key === 'Escape') { e.preventDefault(); api.fechar(); return; }
    if (e.key !== 'Tab') return;
    const lista = focaveis();
    if (!lista.length) { e.preventDefault(); return; }
    const i = lista.indexOf(document.activeElement);
    if (e.shiftKey && i <= 0) { e.preventDefault(); lista.at(-1).focus(); }
    else if (!e.shiftKey && (i === -1 || i === lista.length - 1)) { e.preventDefault(); lista[0].focus(); }
  });
  el.addEventListener('pointerdown', e => { if (e.target === el) api.fechar(); });
  // A roda só rola a folha, e nunca encadeia para a página (nem para a rolagem paginada, que ouve na janela).
  el.addEventListener('wheel', e => {
    e.stopPropagation();
    const rola = folha.scrollHeight > folha.clientHeight + 1;
    const noFim = e.deltaY > 0 ? folha.scrollTop + folha.clientHeight >= folha.scrollHeight - 1 : folha.scrollTop <= 0;
    if (!folha.contains(e.target) || !rola || noFim) e.preventDefault();
  }, { passive: false });
  el.addEventListener('touchmove', e => {
    if (!folha.contains(e.target) || folha.scrollHeight <= folha.clientHeight + 1) e.preventDefault();
  }, { passive: false });

  janelas.add(api);
  return api;
}

function repintarJanelas() {
  for (const j of janelas) j.pintar();
  atualizarMedalheiro();
}

// ---------- o medalheiro ----------

let painel = null;
let abaAtual = 'inv';
let selecionada = 0;
let pedestalAtor = null;

const FALAS_AO_VESTIR = {
  bronze: 'Bronze, o clássico!', prata: 'Prata! Elegante!', ouro: 'Ouro! Agora sim!',
  boina: 'A boina de volta!', elmo: 'Pronto para o Coliseu!', careca: 'Sem boina. Que ventinho!',
};
const FALAS_DO_PEDESTAL = [
  'Sou eu, de corpo inteiro!', 'Cuidado, eu tô esculpindo!', 'As asas são folheadas, não encosta!',
  'Pode trocar meu metal aí embaixo!',
];
const ATRIBUTOS = [
  { nome: 'Força', jogo: 'cabo de guerra', meta: 5, tipo: 'vitoria', valor: () => numero('cabo', 'v', 'vitorias') },
  { nome: 'Tática', jogo: 'duelo de cartas', meta: 5, tipo: 'vitoria', valor: () => numero('cartas', 'v', 'vitorias') },
  { nome: 'Olho', jogo: 'jogo da luz', meta: 3, tipo: 'seguidas', valor: () => numero('copinhos', 'best', 'recorde') },
  {
    nome: 'Faro', jogo: 'quiz das histórias', meta: 5, tipo: 'seguidas',
    valor: () => Math.max(numero('faro', 'best', 'recorde'), numero('quiz', 'best', 'recorde')),
  },
  { nome: 'Pedra', jogo: 'jogo da velha', meta: 3, tipo: 'vitoria', valor: () => numero('velha', 'v', 'vitorias') },
  { nome: 'Obra', jogo: 'blocos do /admin', meta: 10, tipo: 'linha', valor: () => numero('tetris', 'lines', 'linhas') },
];
function porExtenso(v, tipo) {
  if (v <= 0) return 'ainda nada';
  if (tipo === 'vitoria') return v === 1 ? '1 vitória' : `${v} vitórias`;
  if (tipo === 'seguidas') return v === 1 ? '1 acerto' : `${v} seguidas`;
  return v === 1 ? '1 linha' : `${v} linhas`;
}
const jogos = new Map();

// Desafio listado no medalheiro; registrar de novo substitui o de mesmo id e vai para o fim.
export function jogo(id, opcoes = {}) {
  jogos.delete(id);
  jogos.set(id, { id, ...opcoes });
  atualizarMedalheiro();
}

const falaDasMedalhas = () => {
  const n = quantas();
  return n >= TOTAL ? `${n} de ${TOTAL}. Virei de ouro!` : `${n} de ${TOTAL}. Sou de ${nivel()}. ${faltaPara(n)}`;
};
const progresso = () => {
  const n = quantas();
  return n >= TOTAL ? `${n} de ${TOTAL} medalhas. Todas!` : `${n} de ${TOTAL} medalhas. ${faltaPara(n)}`;
};

function medalheiro() {
  if (painel) return painel;
  const j = janela({
    id: 'medalheiro', titulo: 'Inventário', classe: 'med-painel', pixel: 3,
    aoFechar: () => desarmarApagar(),
  });

  // as abas
  const abas = criar('div', 'med-abas');
  abas.setAttribute('role', 'tablist');
  abas.setAttribute('aria-label', 'Escultor');
  const aba = (id, texto) => {
    const b = criar('button', 'med-aba', texto);
    b.type = 'button';
    b.id = `med-aba-${id}`;
    b.dataset.aba = id;
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-controls', `med-${id}`);
    return b;
  };
  const abaInv = aba('inv', 'Inventário'), abaMed = aba('med', 'Medalhas');
  abas.append(abaInv, abaMed);
  abas.addEventListener('click', e => { const b = e.target.closest('.med-aba'); if (b) trocarAba(b.dataset.aba, true); });
  abas.addEventListener('keydown', e => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    trocarAba(abaAtual === 'inv' ? 'med' : 'inv', true);
  });

  // ----- Inventário -----
  const inv = criar('section', 'inv');
  inv.id = 'med-inv';
  inv.setAttribute('role', 'tabpanel');
  inv.setAttribute('aria-labelledby', abaInv.id);
  const heroi = criar('div', 'inv-heroi');
  const pedestal = criar('button', 'inv-pedestal');
  pedestal.type = 'button';
  pedestal.setAttribute('aria-label', 'O escultor');
  const retrato = criar('canvas', 'inv-retrato pixel');
  retrato.setAttribute('aria-hidden', 'true');
  pedestal.append(retrato);
  pedestal.addEventListener('click', () => {
    j.fala(FALAS_DO_PEDESTAL[Math.floor(Math.random() * FALAS_DO_PEDESTAL.length)]);
    pularPedestal();
  });
  const quem = criar('div', 'inv-quem');
  const invNome = criar('strong', 'inv-nome');
  const invNivel = criar('span', 'inv-nivel');
  quem.append(criar('span', 'inv-tipo', 'personagem'), invNome, invNivel);
  heroi.append(pedestal, quem);

  const encaixe = (tipo, valor, nome) => {
    const b = criar('button', 'inv-encaixe');
    b.type = 'button';
    const mini = criar('canvas', 'inv-mini pixel');
    mini.setAttribute('aria-hidden', 'true');
    const estadoEl = criar('span', 'inv-encaixe-estado');
    b.append(mini, criar('span', 'inv-encaixe-nome', nome), estadoEl);
    b.addEventListener('click', () => escolher(tipo, valor));
    return { b, mini, estadoEl, tipo, valor, nome };
  };
  const grupo = (classe, rotuloDoGrupo, itens) => {
    const g = criar('div', `inv-encaixes ${classe}`);
    g.setAttribute('role', 'group');
    g.setAttribute('aria-label', rotuloDoGrupo);
    g.append(...itens.map(i => i.b));
    return g;
  };
  const metais = LIGAS.map(l => encaixe('metal', l, l[0].toUpperCase() + l.slice(1)));
  const cabecas = Object.entries(CABECAS).map(([id, c]) => encaixe('cabeca', id, c.nome));
  const atributos = criar('dl', 'inv-atributos');
  const linhasDeAtributo = ATRIBUTOS.map(a => {
    const linha = criar('div', 'inv-atributo');
    const dt = criar('dt', null, a.nome);
    dt.append(criar('span', null, a.jogo));
    const barra = criar('dd', 'inv-barra');
    barra.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < 10; i++) barra.append(criar('span', 'celula'));
    const valor = criar('dd', 'inv-valor');
    linha.append(dt, barra, valor);
    atributos.append(linha);
    return { a, barra, valor };
  });
  inv.append(
    heroi,
    criar('h3', 'med-sub', 'Metal'), grupo('inv-metais', 'Metal', metais),
    criar('h3', 'med-sub', 'Cabeça'), grupo('inv-cabecas', 'Cabeça', cabecas),
    criar('h3', 'med-sub', 'Atributos'), atributos,
  );

  // ----- Medalhas -----
  const med = criar('section', 'med');
  med.id = 'med-med';
  med.setAttribute('role', 'tabpanel');
  med.setAttribute('aria-labelledby', abaMed.id);
  med.hidden = true;

  const trilha = criar('div', 'med-trilha');
  trilha.setAttribute('aria-hidden', 'true');
  const barra = criar('div', 'med-trilha-barra');
  for (let i = 0; i < TOTAL; i++) barra.append(criar('span', 'celula'));
  trilha.append(barra, criar('span', 'med-trilha-marca prata', 'prata'), criar('span', 'med-trilha-marca ouro', 'ouro'));

  // O fecho do ouro: um recado do Victor e o código para mandar por e-mail.
  const premio = criar('section', 'med-premio');
  premio.hidden = true;
  premio.setAttribute('aria-labelledby', 'med-premio-titulo');
  const premioTitulo = criar('h3', null, 'Você achou as 25.');
  premioTitulo.id = 'med-premio-titulo';
  const recado = criar('p');
  const link = criar('a', null, perfil.email);
  recado.append('Obrigado por fuçar o ateliê até o último canto. Isso merece um e-mail: manda este código para ', link,
    ' e me conta o que achou.');
  const linhaDoCodigo = criar('div', 'med-premio-linha');
  const codigoEl = criar('code', 'med-premio-codigo');
  const copiar = criar('button', 'botao-pixel pequeno', 'copiar');
  copiar.type = 'button';
  let prazoDoCopiar = 0;
  copiar.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(codigoEl.textContent);
      copiar.textContent = 'copiado';
      clearTimeout(prazoDoCopiar);
      prazoDoCopiar = setTimeout(() => { copiar.textContent = 'copiar'; }, 2000);
    } catch {
      getSelection()?.selectAllChildren(codigoEl);   // sem área de transferência: fica selecionado para o Ctrl+C
    }
  });
  linhaDoCodigo.append(codigoEl, copiar);
  premio.append(premioTitulo, recado, linhaDoCodigo, criar('p', 'med-premio-assinatura', '— Victor'));

  const quadroEl = criar('div', 'med-quadro');
  const grade = criar('ul', 'med-grade');
  grade.setAttribute('aria-label', `As ${TOTAL} medalhas`);
  const encaixes = CONQUISTAS.map((c, i) => {
    const li = criar('li');
    const b = criar('button', 'med-encaixe');
    b.type = 'button';
    b.tabIndex = i === 0 ? 0 : -1;
    const canvas = criar('canvas', 'pixel');
    canvas.setAttribute('aria-hidden', 'true');
    b.append(canvas);
    b.addEventListener('focus', () => selecionar(i));
    b.addEventListener('mouseenter', () => selecionar(i));
    b.addEventListener('click', () => selecionar(i));
    li.append(b);
    grade.append(li);
    return { b, canvas };
  });
  grade.addEventListener('keydown', e => {
    const passos = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 5, ArrowUp: -5 };
    let i = selecionada;
    if (Object.hasOwn(passos, e.key)) i += passos[e.key];
    else if (e.key === 'Home') i = 0;
    else if (e.key === 'End') i = TOTAL - 1;
    else return;
    e.preventDefault();
    selecionar(Math.max(0, Math.min(TOTAL - 1, i)), true);
  });
  const legenda = criar('p', 'med-legenda');
  legenda.setAttribute('aria-live', 'polite');
  const legendaNome = criar('span', 'med-legenda-nome');
  const legendaTexto = criar('span', 'med-legenda-texto');
  legenda.append(legendaNome, legendaTexto);
  quadroEl.append(grade, legenda);

  const tituloDesafios = criar('h3', 'med-sub med-desafios-titulo', 'Desafios pelo site');
  const desafios = criar('ul', 'med-desafios');

  const rodape = criar('div', 'med-rodape');
  const apagar = criar('button', 'med-apagar', 'apagar meu progresso');
  apagar.type = 'button';
  apagar.addEventListener('click', () => {
    if (!apagar.classList.contains('armado')) {
      apagar.classList.add('armado');
      apagar.textContent = 'tem certeza? clique de novo para apagar';
      return;
    }
    desarmarApagar();
    apagarProgresso();
    j.fala('Tudo do zero!');
  });
  rodape.append(apagar, criar('span', 'med-nota', 'Fica salvo só neste navegador.'));
  med.append(trilha, premio, quadroEl, tituloDesafios, desafios, rodape);

  j.corpo.append(abas, inv, med);

  painel = {
    j, abaInv, abaMed, inv, med, pedestal, retrato, invNome, invNivel, metais, cabecas, linhasDeAtributo,
    barra, premio, link, codigoEl, encaixes, legenda, legendaNome, legendaTexto, tituloDesafios, desafios, apagar,
  };
  registrar(animarPedestal);
  return painel;
}

function desarmarApagar() {
  if (!painel) return;
  painel.apagar.classList.remove('armado');
  painel.apagar.textContent = 'apagar meu progresso';
}

function trocarAba(aba, focar = false) {
  const p = painel;
  abaAtual = aba;
  for (const [b, secao, id] of [[p.abaInv, p.inv, 'inv'], [p.abaMed, p.med, 'med']]) {
    const sel = id === aba;
    b.setAttribute('aria-selected', String(sel));
    b.tabIndex = sel ? 0 : -1;
    secao.hidden = !sel;
  }
  p.j.titulo(aba === 'inv' ? 'Inventário' : 'Medalheiro');
  p.j.fala(aba === 'inv' ? 'Minha ficha! Troca o que estiver liberado.' : falaDasMedalhas(), false);
  renderizar();
  if (focar) (aba === 'inv' ? p.abaInv : p.abaMed).focus();
}

export function abrir(aba) {
  if (!montado) return;
  const p = medalheiro();
  if (aba === 'inv' || aba === 'med') abaAtual = aba;
  desarmarApagar();
  p.j.mostrar();
  trocarAba(abaAtual);
}

function atualizarMedalheiro() {
  if (painel?.j.aberta) renderizar();
}

function renderizar() {
  if (abaAtual === 'inv') renderizarInventario();
  else renderizarMedalhas();
}

function renderizarInventario() {
  const p = painel, n = quantas(), liga = ligaVestida(), c = cabeca();
  p.invNome.textContent = `Escultor de ${liga}`;
  p.invNivel.textContent = progresso();
  for (const e of p.metais) {
    const livre = metalLiberado(e.valor, n), usando = e.valor === liga;
    const k = (e.valor === 'ouro' ? TOTAL : LIMIAR_PRATA) - n;
    const motivo = k === 1 ? 'falta 1 medalha' : `faltam ${k} medalhas`;
    marcarEncaixe(e, livre, usando, usando ? 'em uso' : livre ? 'liberado' : motivo);
    pintarRetrato(e.mini, 2, { dir: 1, asas: 'fechadas', sombra: false, metal: forma(e.valor), ...visualDa(c) });
  }
  for (const e of p.cabecas) {
    const livre = cabecaLiberada(e.valor), usando = e.valor === c;
    const motivo = `vem com a medalha ${POR_ID.get(CABECAS[e.valor].precisa)?.nome}`;
    marcarEncaixe(e, livre, usando, usando ? 'em uso' : livre ? CABECAS[e.valor].sobre : motivo);
    pintarRetrato(e.mini, 2, { dir: 1, asas: 'fechadas', sombra: false, metal: metal(), ...visualDa(e.valor) });
  }
  for (const { a, barra, valor } of p.linhasDeAtributo) {
    const v = a.valor();
    const acesas = Math.round(Math.min(1, v / a.meta) * 10);
    [...barra.children].forEach((cel, i) => cel.classList.toggle('acesa', i < acesas));
    valor.textContent = porExtenso(v, a.tipo);
  }
  montarPedestal();
}

function marcarEncaixe(e, livre, usando, estadoTexto) {
  e.estadoEl.textContent = estadoTexto;
  e.b.classList.toggle('bloqueado', !livre);
  e.b.setAttribute('aria-pressed', String(usando));
  if (livre) e.b.removeAttribute('aria-disabled');
  else e.b.setAttribute('aria-disabled', 'true');
  e.b.setAttribute('aria-label', `${e.nome}: ${usando ? 'em uso' : livre ? estadoTexto : `bloqueado, ${estadoTexto}`}`);
}

function escolher(tipo, valor) {
  const p = painel;
  const e = [...p.metais, ...p.cabecas].find(x => x.tipo === tipo && x.valor === valor);
  if (e?.b.classList.contains('bloqueado')) {
    const motivo = e.estadoEl.textContent;
    p.j.fala(`${motivo[0].toUpperCase()}${motivo.slice(1)}.`);
    return;
  }
  const ja = tipo === 'metal' ? valor === ligaVestida() : valor === cabeca();
  vestir({ [tipo]: valor });
  p.j.fala(ja && tipo === 'metal' ? `Já sou de ${valor}!` : FALAS_AO_VESTIR[valor]);
  pularPedestal();
  renderizar();
}

// O escultor grande no pedestal: asas devagar e piscando enquanto a aba está aberta; os pés no topo do pedestal.
function montarPedestal() {
  const p = painel;
  const pixel = innerWidth < 520 ? 5 : 6;
  if (!pedestalAtor || pedestalAtor.pixel !== pixel || pedestalAtor.dpr !== dprAtual()) {
    pedestalAtor = montar(p.retrato, { pixel, reduzido: reduzido() });
  }
  pedestalAtor.definir({ dir: 1, asas: 'lentas', metal: metal(), ...visual() });
  // O pedestal tem 8 px e fica a 12 px do pé da caixa (css/conquistas.css).
  const pes = pedestalAtor.pes();
  const d = dprAtual();
  const x = Math.round((p.pedestal.clientWidth / 2 - pes.x) * d) / d;
  const y = Math.round((p.pedestal.clientHeight - 20 - pes.y) * d) / d;
  p.retrato.style.transform = `translate(${x}px, ${y}px)`;
  pedestalAtor.pintar();
  acordar();
}

function pularPedestal() {
  if (!pedestalAtor || reduzido()) return;
  pedestalAtor.pular();
  acordar();
}

function animarPedestal(dt) {
  if (!painel?.j.aberta || abaAtual !== 'inv' || !pedestalAtor || reduzido()) return false;
  pedestalAtor.avancar(dt).pintar();
  return true;
}

function renderizarMedalhas() {
  const p = painel, n = quantas(), liga = ligaVestida();
  [...p.barra.children].forEach((cel, i) => cel.classList.toggle('acesa', i < n));
  p.premio.hidden = n < TOTAL;
  if (n >= TOTAL) {
    if (!estado().codigo) { estado().codigo = gerarCodigo(); salvar(); }
    const { codigo } = estado();   // depois de salvar: se outra aba já tinha um, vale o dela
    p.codigoEl.textContent = codigo;
    p.link.href = `mailto:${perfil.email}?subject=${encodeURIComponent(`Ateliê de ouro: ${codigo}`)}`;
  }
  CONQUISTAS.forEach((c, i) => {
    const achada = tem(c.id);
    const { b, canvas } = p.encaixes[i];
    b.classList.toggle('achada', achada);
    b.setAttribute('aria-label', achada ? `${c.nome}: ${c.achada}` : `Ainda não achada. Dica: ${c.dica}`);
    moedaNoCanvas(canvas, 3, achada ? liga : 'vazio', MARCAS[achada ? c.id : 'vazio']);
  });
  selecionar(selecionada);
  // Desafios na ordem de registro, sem os ocultos. A lista é refeita a cada pouso de moeda e a cada placar: quem estava
  // num desafio continua nele (senão o foco cai no <body> e o Esc para de fechar a janela).
  const focado = p.desafios.contains(document.activeElement) ? document.activeElement.dataset.desafio : null;
  let refocar = null;
  p.desafios.replaceChildren();
  for (const g of jogos.values()) {
    if (valorDe(g.oculto) === true) continue;
    const pl = valorDe(g.placar);
    const li = criar('li');
    const b = criar('button', 'med-desafio');
    b.type = 'button';
    b.dataset.desafio = g.id;
    if (g.id === focado) refocar = b;
    const ir = criar('span', 'med-desafio-ir', 'ir');
    b.append(criar('span', 'med-desafio-nome', g.nome), criar('span', 'med-desafio-onde', g.onde),
      criar('span', 'med-desafio-placar', pl ?? ''), ir);
    b.setAttribute('aria-label', `${g.nome}, ${g.onde}${pl ? `, ${pl}` : ''}. Ir até lá.`);
    if (typeof g.jogar === 'function') b.addEventListener('click', () => { p.j.fechar(); valorDe(g.jogar); });
    else b.disabled = true;
    li.append(b);
    p.desafios.append(li);
  }
  p.tituloDesafios.hidden = !p.desafios.children.length;
  p.desafios.hidden = !p.desafios.children.length;
  if (focado) (refocar && !refocar.disabled ? refocar : p.j.folha).focus({ preventScroll: true });
}

function selecionar(i, focar = false) {
  const p = painel;
  selecionada = i;
  p.encaixes.forEach((e, k) => {
    e.b.classList.toggle('escolhido', k === i);
    e.b.tabIndex = k === i ? 0 : -1;
  });
  const c = CONQUISTAS[i], achada = tem(c.id);
  p.legenda.classList.toggle('achada', achada);
  p.legendaNome.textContent = achada ? c.nome : `Medalha ${i + 1}`;
  p.legendaTexto.textContent = achada ? c.achada : c.dica;
  if (focar) p.encaixes[i].b.focus();
}

// ---------- ir até uma parte ----------

// Leva a página à parada da rolagem paginada que mais mostra o elemento (empate: a que o deixa mais no meio).
export function ir(elemento) {
  if (!elemento?.getBoundingClientRect || typeof document === 'undefined') return;
  const r = elemento.getBoundingClientRect();
  const topo = r.top + scrollY, base = r.bottom + scrollY, vh = innerHeight;
  const lista = rolagem?.paradas?.() ?? [Math.max(0, topo - 16)];
  let melhor = lista[0], visto = -Infinity, longe = Infinity;
  for (const y of lista) {
    const v = Math.round(Math.min(base, y + vh) - Math.max(topo, y));
    const l = Math.abs((topo + base) / 2 - (y + vh / 2));
    if (v > visto || (v === visto && l < longe)) { melhor = y; visto = v; longe = l; }
  }
  if (rolagem?.irPara) rolagem.irPara(melhor);
  else scrollTo({ top: melhor, behavior: reduzido() ? 'instant' : 'smooth' });
}

// ---------- as conquistas passivas desta trilha ----------

let giros = null;

function tontura() {
  falar('Tô tonto...', 2.2);
  if (!masc?.mascote.ativo || reduzido()) return;
  [-1, 1, -1, 1].forEach((dir, i) => setTimeout(() => {
    masc.virar(dir);
    masc.mascote.ator?.pular();
    acordar();
  }, i * 180));
}

function ouvirPassivas(horaDaCarga) {
  ouvir('anel-girou', ({ posicoes } = {}) => {
    if (tem('tonto')) return;
    giros = somarGiros(giros, posicoes, performance.now());
    if (giros.total < GIROS_DA_TONTURA) return;
    giros = null;
    desbloquear('tonto', caixasDoAnel?.palco);
    tontura();
  }, { passados: true });

  ouvir('caixa-aberta', ({ id } = {}) => {
    const ids = caixasDoAnel?.caixas?.map(c => c.id) ?? projetos.map(p => p.id);
    if (!ids.includes(id)) return;
    // Lixo antigo no placar (um número no lugar da lista) não pode travar o Colecionador para sempre.
    const lista = placar('caixas').abertas;
    const abertas = new Set(Array.isArray(lista) ? lista : []);
    if (abertas.has(id)) return;
    abertas.add(id);
    placar('caixas', { abertas: [...abertas] });
    if (ids.every(x => abertas.has(x))) desbloquear('caixas', caixasDoAnel?.caixas.find(c => c.id === id)?.el);
  }, { passados: true });

  ouvir('golpe-do-dia', () => desbloquear('golpe', document.getElementById('placa-canvas')), { passados: true });
  ouvir('email-copiado', () => desbloquear('email', document.getElementById('copiar-email')), { passados: true });
  ouvir('contato-visto', () => { if (horaDaCarga < 5) desbloquear('madrugada'); }, { passados: true });
  ouvir('visita', ({ outroDia } = {}) => {
    if (outroDia) setTimeout(() => desbloquear('retorno'), ATRASO_DO_RETORNO);
  }, { passados: true });

  // A aba: o título chama de volta enquanto ela está escondida; mais de 2,5 s fora conta.
  let saiu = null, titulo = '';
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      titulo = document.title;
      document.title = TITULO_FORA;
      saiu = performance.now();
      return;
    }
    if (saiu === null) return;
    if (document.title === TITULO_FORA) document.title = titulo;
    const fora = performance.now() - saiu;
    saiu = null;
    if (fora > FORA_DA_ABA) desbloquear('aba');
  });

  // O console: um recado para quem abre as ferramentas, e o escultor atendendo por lá.
  const oi = () => {
    desbloquear('console');
    falar('Oi, dev! O código tá todo aberto. Pode olhar!', 3.4);
    return `Oi! Eu sou o escultor de ${ligaVestida()} do Victor. Tem mais coisa escondida pelo site!`;
  };
  window.escultor = { oi, ola: oi, 'olá': oi };
  console.info('%c▄█▄ ei, dev.\n%co escultor atende por aqui: escultor.oi()',
    'color:#c09760;font:700 14px ui-monospace,Consolas,monospace',
    'color:#8d6a3b;font:12px ui-monospace,Consolas,monospace');
}

// ---------- início ----------

// Uma vez só, mesmo que duas partes chamem ao mesmo tempo (o main.js no ateliê, o tetris no /admin).
let inicio = null;
export function iniciar() {
  if (typeof document === 'undefined') return Promise.resolve();
  return (inicio ??= montarTudo());
}

async function montarTudo() {
  const horaDaCarga = new Date().getHours();
  // Cada parte só vem se a página tem o lugar dela: o /admin (que também inicia este módulo) fica só com o HUD, a
  // janela, o cursor e o console.
  const se = (seletor, carregar) => (document.querySelector(seletor) ? carregar() : null);
  const [movimento, mascoteMod, rolagemMod, projetosMod, arenaMod, contatoMod] = (await Promise.allSettled([
    import('../nucleo/movimento.js'),
    se('#escultor', () => import('../mascote.js')),
    se('main > .tela', () => import('../nucleo/rolagem.js')),
    se('#projetos', () => import('../secoes/projetos.js')),
    se('#redes', () => import('../secoes/arena.js')),
    se('#contato', () => import('../secoes/contato.js')),
  ])).map(r => (r.status === 'fulfilled' ? r.value : null));
  if (movimento) reduzido = movimento.reduzido;
  masc = mascoteMod;
  rolagem = rolagemMod;
  caixasDoAnel = projetosMod?.anelDeCaixas ?? null;

  // O <head> já vestiu o metal guardado; se o registro discordar (memória antiga), vale o registro.
  const liga = ligaVestida();
  if ((document.documentElement.dataset.metal ?? 'bronze') !== liga) aplicarNoHtml(liga);
  gravar('metal', liga);
  tomDoHud = liga;

  montado = true;
  montarHud();
  registrar(quadro);
  addEventListener('pointermove', e => { if (e.pointerType === 'mouse') ponteiro = { x: e.clientX, y: e.clientY }; },
    { passive: true });
  // Duas abas: quando a outra grava, esta adota o registro (o HUD, a conta e o metal acompanham, e nenhuma medalha é
  // cunhada duas vezes). Voltando do cache do navegador (o "voltar" depois do /admin), a memória daqui ficou parada.
  addEventListener('storage', e => { if (e.key === 'victornascimento:atelie') adotar(ler('atelie', null)); });
  addEventListener('pageshow', e => { if (e.persisted) adotar(ler('atelie', null)); });
  movimento?.aoMudar(() => acordar());
  vestirMascote();
  participarDasSecoes(projetosMod, arenaMod, contatoMod);
  ouvirPassivas(horaDaCarga);
}
