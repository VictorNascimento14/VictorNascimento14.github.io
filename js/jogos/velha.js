// O jogo da velha na laje de mármore do Contato (spec 05 §2.5, §4.9, §6.9). Tocada, a laje sobe da grama para o meio
// da tela e a página escurece; o visitante risca o X e o escultor voa até a casa e entalha o O com um golpe do maço.
// A IA é minimax com 35% de palpite: vencível de propósito. Esc, "sair" ou um clique fora devolvem a laje à grama com a
// última partida riscada. Conquistas: `velha` (vencer o escultor) e `generoso` (ele chegar a 3 vitórias, somadas entre
// visitas).
//
// As regras, no topo, são puras e testadas no Node (tests/jogos.test.js). O resto depende da página (mascote, seção,
// conquistas) e só é carregado em iniciar().
import { registrar, acordar } from '../nucleo/relogio.js';
import { dpr, limitar, prepararCanvas } from '../nucleo/pixel.js';
import { ouvir } from '../nucleo/sinais.js';

// ---------- as regras ----------

export const LINHAS = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
const outro = m => (m === 'x' ? 'o' : 'x');

// O tabuleiro é uma lista de 9 casas ('x' | 'o' | null), de cima para baixo e da esquerda para a direita. Guardado,
// vira texto: "x...o...x".
export const deTexto = texto => [...texto].map(c => (c === 'x' || c === 'o' ? c : null));
export const paraTexto = t => t.map(m => m ?? '.').join('');

export function linhaVencedora(t) {
  return LINHAS.find(([a, b, c]) => t[a] && t[a] === t[b] && t[a] === t[c]) ?? null;
}

// 'x' ou 'o' (três em linha), 'velha' (cheio, sem linha) ou null (a partida segue).
export function vencedor(t) {
  const linha = linhaVencedora(t);
  if (linha) return t[linha[0]];
  return t.every(Boolean) ? 'velha' : null;
}

// Minimax: ganhar vale 10 − profundidade, perder profundidade − 10 e empatar 0, então ganhar cedo e perder tarde são
// melhores. Dentro de uma decisão a profundidade sai do próprio tabuleiro, e cada posição é contada uma vez só.
function valor(t, vez, eu, prof, memo) {
  const fim = vencedor(t);
  if (fim) return fim === 'velha' ? 0 : fim === eu ? 10 - prof : prof - 10;
  const chave = paraTexto(t) + vez;
  let v = memo.get(chave);
  if (v !== undefined) return v;
  v = vez === eu ? -Infinity : Infinity;
  for (let i = 0; i < 9; i++) {
    if (t[i]) continue;
    t[i] = vez;
    const filho = valor(t, outro(vez), eu, prof + 1, memo);
    t[i] = null;
    v = vez === eu ? Math.max(v, filho) : Math.min(v, filho);
  }
  memo.set(chave, v);
  return v;
}

// As melhores casas para `eu` jogar agora. Empates ficam todos: quem joga sorteia entre elas.
export function melhoresJogadas(t, eu) {
  const u = [...t], memo = new Map();
  let melhor = -Infinity, lista = [];
  for (let i = 0; i < 9; i++) {
    if (u[i]) continue;
    u[i] = eu;
    const v = valor(u, outro(eu), eu, 1, memo);
    u[i] = null;
    if (v > melhor) { melhor = v; lista = [i]; } else if (v === melhor) lista.push(i);
  }
  return lista;
}

// A casa do escultor: com chance `palpite`, uma livre qualquer (é o que o deixa vencível); senão, uma das melhores.
export function jogadaDoEscultor(t, eu = 'o', palpite = 0.35, sorteio = Math.random) {
  const livres = [...t.keys()].filter(i => !t[i]);
  if (!livres.length) return -1;
  const lista = sorteio() < palpite ? livres : melhoresJogadas(t, eu);
  return lista[Math.floor(sorteio() * lista.length)];
}

// ---------- o jogo na página ----------

const PALPITE = 0.35;
// Prioridade do trabalho do mascote: acima do contato (20), que o jogo solta ao abrir, e abaixo de tudo o mais. O palco
// cobre a tela, então nenhuma outra seção o chama enquanto a laje está no alto.
const PRIORIDADE = 25;
const TEMPO = {
  comeco: 0.9,                  // s até o escultor jogar, quando ele começa
  pensa: [0.38, 0.8],           // s até ele decidir, depois do X
  semEscultor: 0.42,            // s até o O aparecer sozinho
  seguranca: 2.6,               // o O é entalhado de qualquer jeito depois disso
  riscoX: 0.2, riscoO: 0.16,    // s para riscar cada marca, pixel a pixel
  tremor: 0.14, pulo: 0.2, velha: 0.5, generoso: 0.6,
};
const PADRAO = 'x...o...x';      // a laje que nunca foi jogada: a diagonal X·O·X
const FALAS = {
  vezDoVisitante: ['Sua vez! Você é o X.', 'De novo! Você começa.'],
  vezDoEscultor: ['Eu começo!', 'De novo? Eu começo!'],
  pensando: ['Hmm...', 'Deixa eu ver...', 'Interessante...'],
  ganhou: ['Ganhei! Três em linha, de {metal}.', 'Ganhei! Esculpi rapidinho.'],
  perdeu: ['Você ganhou! Essa doeu {no metal}.', 'Ok, essa foi sua!'],
  velha: ['Deu velha!', 'Velha. Ninguém perde, ninguém ganha.'],
  fim: 'toque na tábua para jogar de novo',
};
const DESAFIO = {
  primeiro: 'Tá vendo a tábua de pedra na grama? Duvido você me ganhar no jogo da velha!',
  visitante: 'Você {v}, eu {d}. Quero revanche!',
  escultor: 'Eu {d}, você {v}. Vai deixar assim?',
  empate: 'Empatados. A tábua decide!',
};
// Lascas (px de mármore por px da laje e cores, spec 05 §5).
const LASCAS = { marmore: ['#f2ece0', '#d8cfbf', '#b8aa91'], faisca: '#fdeeab', ouro: ['#ecc145', '#fdeeab', '#cc961b'] };
const FOLGA = 60;                // px em volta da laje onde as lascas voam

// O que vem da página, carregado em iniciar().
let mascote, falar, trabalho, virar, reduzido;
let contato, desenharLaje, soltarContato, TRACOS;
let desbloquear, placar, registrarJogo, ir, aqui, fecharConversa;

const jogo = {
  aberto: false, fechando: false,
  t: Array(9).fill(null),        // o tabuleiro
  risco: Array(9).fill(1),       // quanto de cada marca já foi riscado (0–1)
  vez: 'x', fim: null, linha: null,
  entalhe: null,                 // o O a caminho: { i, t, golpeou }
  u: 14, x: 0, y: 0, w: 0, h: 0, // pixel da laje e o retângulo dela na janela
  lascas: [], tremor: 0, sujo: false, remedir: false,
  placar: null,                  // { v, d, e, last, first, jogou }
  foco: null,                    // quem tinha o foco antes de abrir
  dica: '',                      // a fala vai para a dica quando o escultor não está por perto
};
// O desafio na conversa só é novidade enquanto o visitante não jogou nesta visita (nem disse "agora não") ou logo depois
// de uma partida terminada, para a revanche (ms, contados de quando a laje volta para a grama).
const visita = { jogou: false, dispensou: false, revancheAte: 0 };
const REVANCHE = 20000;
let el = null;                   // os elementos do palco
let pequena = null;              // a laje da grama (montada pelo contato)
let agenda = [];                 // [{ em, fn }]: os tempos do jogo, no relógio do site (param com a aba escondida)
let agora = 0;
let tarefa = null;               // o trabalho do mascote enquanto a laje está no alto
let anuncios = [];

const sortear = lista => lista[Math.floor(Math.random() * lista.length)];

function depois(segundos, fn) {
  agenda.push({ em: agora + segundos, fn });
  acordar();
}

// "de bronze", "na prata", "no ouro": o escultor fala do metal de que é feito agora.
function doMetal(texto) {
  const metal = document.documentElement.dataset.metal;
  const [nome, no] = metal === 'prata' ? ['prata', 'na prata'] : metal === 'ouro' ? ['ouro', 'no ouro'] : ['bronze', 'no bronze'];
  return texto.replace('{metal}', nome).replace('{no metal}', no);
}

function lerPlacar() {
  const p = placar('velha') ?? {};
  const n = v => (Number.isInteger(v) && v > 0 ? v : 0);
  const last = typeof p.last === 'string' && /^[xo.]{9}$/.test(p.last) ? p.last : null;
  return { v: n(p.v), d: n(p.d), e: n(p.e), last, first: p.first === 'o' ? 'o' : 'x', jogou: !!p.jogou };
}

const salvar = () => placar('velha', { ...jogo.placar });

// ---------- a laje da grama ----------

// A laje que o contato montou é cenário (aria-hidden, sem ponteiro); aqui ela vira o botão do jogo, com a etiqueta
// "jogo da velha?" em cima. É um div com papel de botão: o contato guarda a referência e a redesenha.
function prepararPequena() {
  pequena.removeAttribute('aria-hidden');
  pequena.firstElementChild?.setAttribute('aria-hidden', 'true');
  pequena.setAttribute('role', 'button');
  pequena.tabIndex = 0;
  pequena.setAttribute('aria-label', 'Jogar jogo da velha contra o escultor');
  pequena.classList.add('jogavel');
  const etiqueta = document.createElement('span');
  etiqueta.className = 'dica-pixel laje-etiqueta';
  etiqueta.setAttribute('aria-hidden', 'true');
  etiqueta.textContent = 'jogo da velha?';
  pequena.append(etiqueta);   // depois do svg: o contato redesenha o primeiro filho
  pequena.addEventListener('click', abrir);
  pequena.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); abrir(); }
    else if (e.key === ' ') e.preventDefault();   // o Espaço age ao soltar, como num botão, e não rola a página
  });
  pequena.addEventListener('keyup', e => { if (e.key === ' ') abrir(); });
}

// ---------- o palco ----------

function montarPalco() {
  const palco = document.createElement('div');
  palco.className = 'velha-palco';
  palco.hidden = true;
  palco.setAttribute('role', 'dialog');
  palco.setAttribute('aria-modal', 'true');
  palco.setAttribute('aria-label', 'Jogo da velha contra o escultor');
  palco.innerHTML = `
    <div class="velha-veu"></div>
    <div class="velha-laje">
      <svg viewBox="-2 0 36 35" shape-rendering="crispEdges" aria-hidden="true"></svg>
      <div class="velha-casas" role="group" aria-label="Tabuleiro, três por três"></div>
      <canvas class="velha-lascas pixel" aria-hidden="true"></canvas>
    </div>
    <div class="velha-pe">
      <p class="velha-placar"></p>
      <p class="velha-dica"></p>
      <button class="velha-sair" type="button">sair</button>
    </div>
    <p class="sr-only velha-dito" aria-live="polite"></p>`;
  const q = s => palco.querySelector(s);
  el = {
    palco, veu: q('.velha-veu'), laje: q('.velha-laje'), svg: q('svg'), grade: q('.velha-casas'), lascas: q('canvas'),
    pe: q('.velha-pe'), placar: q('.velha-placar'), dica: q('.velha-dica'), sair: q('.velha-sair'), dito: q('.velha-dito'),
    casas: [], ctx: null,
  };
  for (let i = 0; i < 9; i++) {
    const casa = document.createElement('button');
    casa.type = 'button';
    casa.className = 'velha-casa';
    casa.addEventListener('click', () => tocar(i));
    el.grade.append(casa);
    el.casas.push(casa);
  }
  el.sair.addEventListener('click', fechar);
  el.veu.addEventListener('click', fechar);
  palco.addEventListener('keydown', teclar);
  // A página não rola por trás do palco (roda, touchpad, dedo).
  palco.addEventListener('wheel', e => e.preventDefault(), { passive: false });
  palco.addEventListener('touchmove', e => e.preventDefault(), { passive: false });
  document.body.append(palco);
}

// O pixel da laje no alto: o maior que cabe (de 4 a 14 px, inteiro em px de dispositivo), com espaço em cima para o
// escultor e o balão e embaixo para o placar. Em 1440 × 900: 14 px, laje de 504 × 490 com o topo em 229.
function medir() {
  jogo.remedir = false;
  const vw = document.documentElement.clientWidth;
  const vh = Math.min(innerHeight, visualViewport?.height ?? innerHeight);
  const d = dpr();
  const u = limitar(Math.floor(Math.min((vw - 32) / 36, (vh - 230) / 35) * d) / d, 4, 14);
  const w = 36 * u, h = 35 * u;
  Object.assign(jogo, { u, w, h, x: Math.round((vw - w) / 2), y: Math.round(Math.max(120, (vh - h) / 2 + 24)) });
  Object.assign(el.laje.style, { left: `${jogo.x}px`, top: `${jogo.y}px`, width: `${w}px`, height: `${h}px` });
  el.svg.setAttribute('width', w);
  el.svg.setAttribute('height', h);
  // As casas cobrem os vãos entre os sulcos ([0,10), [11,20) e [21,31) em px da laje); o svg começa em x = −2.
  const faixas = [[0, 10], [11, 20], [21, 31]];
  el.casas.forEach((casa, i) => {
    const [x0, x1] = faixas[i % 3], [y0, y1] = faixas[Math.floor(i / 3)];
    Object.assign(casa.style, { left: `${(x0 + 2) * u}px`, top: `${y0 * u}px`, width: `${(x1 - x0) * u}px`, height: `${(y1 - y0) * u}px` });
  });
  el.ctx = prepararCanvas(el.lascas, w + 2 * FOLGA, h + 2 * FOLGA);
  el.ctx.clearRect(0, 0, el.lascas.width, el.lascas.height);
  Object.assign(el.lascas.style, { left: `${-FOLGA}px`, top: `${-FOLGA}px` });
  el.pe.style.top = `${Math.round(jogo.y + h + 14)}px`;
  jogo.sujo = true;
}

// A laje alta, no mesmo desenho da laje da grama (contato.js), com as marcas riscadas até onde já foram e a linha
// vencedora em ouro.
function pintarLaje() {
  jogo.sujo = false;
  const px = (classe, x, y, w = 1, h = 1) => `<rect class="${classe}" x="${x}" y="${y}" width="${w}" height="${h}"/>`;
  let s = px('lj-sombra', 1, 2, 32, 33) + px('lj-tampo', 0, 0, 31, 31)
    + px('lj-luz', 0, 0, 31, 1) + px('lj-luz', 0, 0, 1, 31) + px('lj-frente', 30, 1, 1, 30);
  for (const g of [10, 20]) s += px('lj-labio', g + 1, 2, 1, 27) + px('lj-labio', 2, g + 1, 27, 1);
  for (const g of [10, 20]) s += px('lj-sulco', g, 2, 1, 27) + px('lj-sulco', 2, g, 27, 1);
  s += px('lj-frente', -2, 31, 35, 3) + px('lj-luz', -2, 31, 35, 1);
  jogo.t.forEach((m, i) => {
    if (!m) return;
    const traco = TRACOS[m];
    const classe = jogo.linha?.includes(i) ? 'lj-ouro' : `lj-${m}`;
    const ox = 3 + 10 * (i % 3), oy = 3 + 10 * Math.floor(i / 3);
    for (const [x, y] of traco.slice(0, Math.ceil(jogo.risco[i] * traco.length))) s += px(classe, ox + x, oy + y);
  });
  el.svg.innerHTML = s;
}

// Casas, placar e dica a cada mudança. Casa ocupada, fora de vez ou com o O a caminho fica aria-disabled (nunca
// disabled: o foco do teclado não pode se perder).
function atualizar() {
  jogo.sujo = true;
  acordar();
  const emCurso = !jogo.fim;
  el.casas.forEach((casa, i) => {
    const m = jogo.t[i];
    const conteudo = m === 'x' ? 'X, seu' : m === 'o' ? 'O, do escultor' : 'livre';
    casa.setAttribute('aria-label', `Casa ${i + 1}: ${conteudo}${emCurso ? '' : '. Jogar de novo'}`);
    casa.setAttribute('aria-disabled', String(emCurso && (!!m || jogo.vez !== 'x' || !!jogo.entalhe)));
    casa.classList.toggle('livre', emCurso && !m);
  });
  const { v, d, e } = jogo.placar;
  el.placar.innerHTML = `Você <b>${v}</b> × <b>${d}</b> escultor${e ? ` · ${e} ${e === 1 ? 'empate' : 'empates'}` : ''}`;
  el.dica.textContent = [jogo.dica, jogo.fim && FALAS.fim].filter(Boolean).join(' · ');
}

// A região viva junta o que acontece no mesmo instante ("O escultor marcou a casa 3. Ganhei!..."): dois textos
// seguidos fariam o leitor de tela pular o primeiro.
function anunciar(texto) {
  if (!anuncios.length) {
    queueMicrotask(() => {
      el.dito.textContent = anuncios.join(' ');
      anuncios = [];
    });
  }
  anuncios.push(texto);
}

// A fala vai sempre para o leitor de tela; para o balão quando o escultor é companheiro, senão para a dica (na hora:
// o original só a mostrava uma jogada depois).
function dizer(texto, segundos = 2.4) {
  anunciar(texto);
  if (mascote.ativo) { falar(texto, segundos); jogo.dica = ''; }
  else jogo.dica = texto;
  atualizar();
}

// ---------- abrir e fechar ----------

const naJanela = r => r.width > 0 && r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth;
const transformeDe = r => `translate(${r.left - jogo.x}px, ${r.top - jogo.y}px) scale(${r.width / jogo.w})`;

export function abrir() {
  if (jogo.aberto || !el) return;
  Object.assign(jogo, { aberto: true, fechando: false, foco: document.activeElement, placar: lerPlacar() });
  Object.assign(visita, { jogou: true, revancheAte: 0 });
  agenda = [];
  fecharConversa?.();
  if (mascote.trabalhoAtual === 'contato') soltarContato();   // ele estava num telhado: o jogo precisa dele
  document.documentElement.classList.add('jogo-aberto');
  el.palco.classList.remove('fechando');
  el.palco.hidden = false;
  medir();
  // Sobe da grama: da laje pequena para a grande, passando um pouco e assentando.
  const r = pequena.getBoundingClientRect();
  if (!reduzido() && !pequena.hidden && naJanela(r)) {
    el.laje.animate([{ transform: transformeDe(r) }, { transform: 'none' }], { duration: 520, easing: 'cubic-bezier(.2, .9, .25, 1.04)' });
  }
  pequena.classList.add('longe');
  chamarMascote();
  comecar(false);
  el.casas[4].focus({ preventScroll: true });
  acordar();
}

export function fechar() {
  if (!jogo.aberto || jogo.fechando) return;
  jogo.fechando = true;
  agenda = [];
  jogo.lascas = [];
  jogo.entalhe = null;
  jogo.tremor = 0;
  soltarMascote();
  if (jogo.t.some(Boolean)) {
    jogo.placar.last = paraTexto(jogo.t);
    salvar();
  }
  desenharLaje(jogo.placar.last ?? PADRAO);
  el.palco.classList.add('fechando');
  // Volta para a grama, acelerando; o palco só some no fim.
  const r = pequena.getBoundingClientRect();
  if (reduzido() || pequena.hidden || !naJanela(r)) { recolher(); return; }
  const a = el.laje.animate([{ transform: 'none' }, { transform: transformeDe(r) }], { duration: 380, easing: 'cubic-bezier(.55, 0, .8, .2)', fill: 'forwards' });
  a.onfinish = () => { recolher(); a.cancel(); };
}

function recolher() {
  const ativo = document.activeElement;
  const devolver = !ativo || ativo === document.body || el.palco.contains(ativo);
  Object.assign(jogo, { aberto: false, fechando: false });
  if (jogo.fim) visita.revancheAte = performance.now() + REVANCHE;   // quem sai no meio da partida não é provocado
  el.palco.hidden = true;
  el.palco.classList.remove('fechando');
  el.laje.classList.remove('ganhou');
  el.laje.style.translate = '';
  pequena.classList.remove('longe');
  document.documentElement.classList.remove('jogo-aberto');
  if (!devolver) return;
  if (!pequena.hidden) pequena.focus({ preventScroll: true });
  else if (jogo.foco?.isConnected) jogo.foco.focus?.({ preventScroll: true });
}

// ---------- a partida ----------

function comecar(revanche) {
  agenda = [];
  Object.assign(jogo, {
    t: Array(9).fill(null), risco: Array(9).fill(1), fim: null, linha: null, entalhe: null, lascas: [],
    vez: jogo.placar.first, dica: '',
  });
  el.laje.classList.remove('ganhou');
  const falas = jogo.vez === 'x' ? FALAS.vezDoVisitante : FALAS.vezDoEscultor;
  dizer(falas[revanche ? 1 : 0]);
  if (jogo.vez === 'o') depois(TEMPO.comeco, decidir);
  atualizar();
}

function tocar(i) {
  if (!jogo.aberto || jogo.fechando) return;
  if (jogo.fim) { comecar(true); return; }   // tocar a laje no fim joga outra
  if (jogo.vez !== 'x' || jogo.t[i] || jogo.entalhe) return;
  marcar(i, 'x');
  if (conferir()) return;
  jogo.vez = 'o';
  if (Math.random() < 0.4) dizer(sortear(FALAS.pensando), 1.2);
  depois(TEMPO.pensa[0] + Math.random() * (TEMPO.pensa[1] - TEMPO.pensa[0]), decidir);
  atualizar();
}

function marcar(i, m) {
  jogo.t[i] = m;
  jogo.risco[i] = reduzido() ? 1 : 0;
  if (!reduzido()) lascar(i, m === 'x' ? 7 : 12, m === 'o' ? 'faisca' : 'marmore');
  jogo.sujo = true;
  acordar();
}

// O escultor escolhe a casa. Se ele está no jogo, voa até ela e o O sai no impacto do golpe; senão o O aparece sozinho.
function decidir() {
  if (!jogo.aberto || jogo.fim || jogo.vez !== 'o' || jogo.entalhe) return;
  const i = jogadaDoEscultor(jogo.t, 'o', PALPITE);
  if (i < 0) return;
  // Sem o escultor no jogo (movimento reduzido, ou ele longe), o O aparece sozinho e ninguém voa até a casa.
  const sozinho = !presente();
  jogo.entalhe = { i, t: 0, golpeou: false, sozinho };
  if (sozinho) depois(TEMPO.semEscultor, () => entalhar(i));
  atualizar();
}

const presente = () => !reduzido() && mascote.trabalhoAtual === 'velha';

function entalhar(i) {
  if (jogo.entalhe?.i !== i || !jogo.aberto || jogo.fechando) return;
  jogo.entalhe = null;
  marcar(i, 'o');
  if (!reduzido()) jogo.tremor = TEMPO.tremor;
  anunciar(`O escultor marcou a casa ${i + 1}.`);
  if (conferir()) return;
  jogo.vez = 'x';
  atualizar();
}

// Fim de partida: placar, falas, lascas de ouro na linha, conquistas. Quem começa alterna.
function conferir() {
  const fim = vencedor(jogo.t);
  if (!fim) return false;
  const p = jogo.placar;
  Object.assign(jogo, { fim, linha: linhaVencedora(jogo.t), vez: null });
  p.first = outro(p.first);
  p.jogou = true;
  p.last = paraTexto(jogo.t);
  // As moedas não são canceladas por quem fecha a laje logo depois: o tempo delas corre fora da agenda do jogo.
  const moeda = (id, atraso) => setTimeout(() => desbloquear(id, jogo.aberto ? el.laje : pequena), atraso * 1000);
  if (fim === 'x') {
    p.v++;
    dizer(doMetal(sortear(FALAS.perdeu)), 3);
    if (!reduzido()) for (const i of jogo.linha) lascar(i, 10, 'ouro');
    moeda('velha', reduzido() ? 0 : TEMPO.velha);
  } else if (fim === 'o') {
    p.d++;
    dizer(doMetal(sortear(FALAS.ganhou)), 3);
    depois(TEMPO.pulo, () => { if (!reduzido()) mascote.ator?.pular(); });
    if (p.d >= 3) moeda('generoso', TEMPO.generoso);
  } else {
    p.e++;
    dizer(sortear(FALAS.velha), 2.6);
  }
  salvar();
  el.laje.classList.toggle('ganhou', !!jogo.linha);
  atualizar();
  return true;
}

// ---------- o escultor no jogo ----------

// A ponta do cinzel para os pés dele ficarem em (x, y), na direção em que ele está.
function pontaComPesEm(x, y) {
  const a = mascote.ator, t = a.ponta(), p = a.pes();
  return { x: x + t.x - p.x, y: y + t.y - p.y };
}

// Paira sobre a borda de cima da laje, a 86% da largura; para entalhar, a ponta do cinzel vai ao centro da casa.
const pontoDePairar = () => pontaComPesEm(jogo.x + 0.86 * jogo.w, jogo.y - 6);
const pontoDaCasa = i => ({ x: jogo.x + (7.5 + 10 * (i % 3)) * jogo.u, y: jogo.y + (5.5 + 10 * Math.floor(i / 3)) * jogo.u });
const entalhando = () => !!jogo.entalhe && !jogo.entalhe.sozinho && !reduzido();

function chamarMascote() {
  if (tarefa) return;
  tarefa = trabalho({
    nome: 'velha',
    prioridade: PRIORIDADE,
    get meta() { return entalhando() ? `casa:${jogo.entalhe.i}` : 'pairar'; },
    alvo() {
      if (!jogo.aberto || jogo.fechando || !mascote.ator) return null;
      return entalhando() ? pontoDaCasa(jogo.entalhe.i) : pontoDePairar();
    },
    quadro() {
      const a = mascote.ator;
      if (!a) return;
      const e = jogo.entalhe;
      if (entalhando()) {
        a.definir({ asas: 'batendo' });
        if (!e.golpeou && !a.golpeando) { e.golpeou = true; a.golpear(() => entalhar(e.i)); }
        return;
      }
      virar(-1);
      a.definir({ asas: 'lentas', sentado: false });
    },
    // Se ele for chamado para outra coisa com um O a caminho, o O sai sem ele.
    perdeu() { if (jogo.entalhe && jogo.aberto) entalhar(jogo.entalhe.i); },
  });
}

function soltarMascote() {
  const t = tarefa;
  tarefa = null;
  t?.soltar();
}

// ---------- lascas ----------

function lascar(i, quantas, tipo) {
  const { u } = jogo;
  const cx = (7.5 + 10 * (i % 3)) * u, cy = (5.5 + 10 * Math.floor(i / 3)) * u;   // o centro da casa, em px da laje
  for (let k = 0; k < quantas; k++) {
    const faisca = tipo === 'faisca' && k % 3 === 0;
    const a = -Math.PI / 2 + (Math.random() * 2 - 1) * 1.3;
    const v = (60 + 140 * Math.random()) * (u / 8);
    jogo.lascas.push({
      x: cx + (Math.random() * 2 - 1) * 2 * u, y: cy + (Math.random() * 2 - 1) * 2 * u,
      vx: Math.cos(a) * v, vy: Math.sin(a) * v, vida: 0, max: 0.45 + 0.35 * Math.random(),
      lado: faisca ? Math.max(1, Math.round(0.45 * u)) : Math.max(1, Math.round(u * (0.5 + 0.5 * Math.random()))),
      cor: tipo === 'ouro' ? sortear(LASCAS.ouro) : faisca ? LASCAS.faisca : sortear(LASCAS.marmore),
    });
  }
}

function pintarLascas() {
  const { ctx } = el;
  const k = dpr();
  ctx.clearRect(0, 0, el.lascas.width, el.lascas.height);
  for (const l of jogo.lascas) {
    ctx.globalAlpha = Math.max(0, 1 - l.vida / l.max);
    ctx.fillStyle = l.cor;
    const x0 = Math.round((l.x + FOLGA) * k), y0 = Math.round((l.y + FOLGA) * k);
    ctx.fillRect(x0, y0, Math.round((l.x + FOLGA + l.lado) * k) - x0, Math.round((l.y + FOLGA + l.lado) * k) - y0);
  }
  ctx.globalAlpha = 1;
}

// ---------- teclado ----------

// Setas andam entre as casas (esquerda e direita não atravessam a linha); Tab e Shift+Tab giram entre as nove casas e
// "sair"; Esc fecha. Nenhuma tecla vaza para a página (rolagem, segredos digitados).
function teclar(e) {
  e.stopPropagation();
  if (e.key === 'Escape') { e.preventDefault(); fechar(); return; }
  if (e.key === 'Tab') {
    const ordem = [...el.casas, el.sair];
    const i = ordem.indexOf(document.activeElement);
    const j = i < 0 ? 0 : (i + (e.shiftKey ? -1 : 1) + ordem.length) % ordem.length;
    e.preventDefault();
    ordem[j].focus();
    return;
  }
  const i = el.casas.indexOf(document.activeElement);
  const para = i < 0 ? undefined
    : { ArrowLeft: i % 3 ? i - 1 : i, ArrowRight: i % 3 < 2 ? i + 1 : i, ArrowUp: i >= 3 ? i - 3 : i, ArrowDown: i < 6 ? i + 3 : i }[e.key];
  if (para !== undefined) {
    e.preventDefault();
    el.casas[para].focus();
  } else if (/^(Page(Up|Down)|Home|End|Arrow(Up|Down|Left|Right))$/.test(e.key)) {
    e.preventDefault();   // as teclas de página (e as setas no "sair") rolariam a página nativa por trás do palco
  }
}

// O foco não sai do palco aberto (um clique no escultor, por exemplo, o levaria embora). Outra janela aberta por cima
// (o medalheiro, pelo HUD) fica com ele; ao fechar, ela o devolve à casa de onde veio.
function vigiarFoco(e) {
  if (!jogo.aberto || jogo.fechando || el.palco.contains(e.target) || e.target.closest?.('[role="dialog"]')) return;
  (el.casas.find(c => c.getAttribute('aria-disabled') !== 'true') ?? el.casas[4]).focus({ preventScroll: true });
}

// ---------- o laço ----------

function quadro(dt) {
  if (!jogo.aberto) return false;
  agora += dt;
  if (jogo.remedir) medir();
  for (const item of agenda.filter(a => a.em <= agora)) {
    agenda.splice(agenda.indexOf(item), 1);
    item.fn();
  }
  if (jogo.entalhe && (jogo.entalhe.t += dt) >= TEMPO.seguranca) entalhar(jogo.entalhe.i);
  jogo.t.forEach((m, i) => {
    if (!m || jogo.risco[i] >= 1) return;
    jogo.risco[i] = Math.min(1, jogo.risco[i] + dt / (m === 'x' ? TEMPO.riscoX : TEMPO.riscoO));
    jogo.sujo = true;
  });
  if (jogo.sujo) pintarLaje();
  if (jogo.lascas.length || el.lascas.dataset.tinta) {
    const g = 520 * (jogo.u / 8);
    for (const l of jogo.lascas) { l.vida += dt; l.vy += g * dt; l.x += l.vx * dt; l.y += l.vy * dt; }
    jogo.lascas = jogo.lascas.filter(l => l.vida < l.max);
    pintarLascas();
    el.lascas.dataset.tinta = jogo.lascas.length ? '1' : '';
  }
  if (jogo.tremor > 0) {
    jogo.tremor = Math.max(0, jogo.tremor - dt);
    el.laje.style.translate = jogo.tremor > 0 ? `${Math.round(Math.sin(jogo.tremor * 90) * 2)}px 1px` : '';
  }
  return agenda.length > 0 || !!jogo.entalhe || jogo.lascas.length > 0 || jogo.tremor > 0 || jogo.risco.some(r => r < 1);
}

// ---------- entrada ----------

// O que o escultor propõe na conversa quando o visitante está no Contato, e só quando é novidade (ver `visita`): no
// resto, o Contato fica com a fala da conversa (copiar o e-mail, os links). A revanche também fica no medalheiro.
function desafio() {
  if (jogo.aberto || !contato.laje.visivel) return null;
  const revanche = performance.now() < visita.revancheAte;
  if (!revanche && (visita.jogou || visita.dispensou)) return null;
  const { v, d, jogou } = lerPlacar();
  const molde = !jogou ? DESAFIO.primeiro : v > d ? DESAFIO.visitante : d > v ? DESAFIO.escultor : DESAFIO.empate;
  return {
    fala: molde.replace('{v}', v).replace('{d}', d),
    chips: [
      ['jogar', () => { fecharConversa(); abrir(); }],
      ['agora não', () => { Object.assign(visita, { dispensou: true, revancheAte: 0 }); fecharConversa(); }],
    ],
    novo: true,
  };
}

export async function iniciar() {
  const [m, mov, sec, q, conv] = await Promise.all([
    import('../mascote.js'), import('../nucleo/movimento.js'), import('../secoes/contato.js'),
    import('./conquistas.js'), import('./conversa.js'),
  ]);
  ({ mascote, falar, trabalho, virar } = m);
  ({ reduzido } = mov);
  ({ contato, desenharLaje, soltarContato, TRACOS } = sec);
  ({ desbloquear, placar, jogo: registrarJogo, ir } = q);
  ({ aqui, fechar: fecharConversa } = conv);
  pequena = contato.laje?.el;
  if (!pequena || !contato.secao) return;

  prepararPequena();
  montarPalco();
  const { last } = lerPlacar();
  if (last) desenharLaje(last);   // a grama mostra a última partida
  registrar(quadro);
  document.addEventListener('focusin', vigiarFoco);
  const remedir = () => { if (jogo.aberto) { jogo.remedir = true; acordar(); } };
  addEventListener('resize', remedir);
  visualViewport?.addEventListener('resize', remedir);

  aqui('contato', desafio);
  // "Apagar meu progresso" com a laje aberta (o medalheiro abre por cima): o placar em memória era o de antes, e a
  // próxima derrota devolveria o Generoso.
  ouvir('reset', () => { if (jogo.aberto) jogo.placar = lerPlacar(); });
  registrarJogo('velha', {
    nome: 'Jogo da velha',
    onde: 'no Contato, a tábua na grama',
    placar: () => { const { v, d } = lerPlacar(); return `${v} a ${d}`; },
    jogar: () => { ir(contato.secao); setTimeout(abrir, 750); },
  });
}
