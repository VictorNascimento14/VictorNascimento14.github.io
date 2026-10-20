// O duelo de cartas na areia do Coliseu (spec 07; docs/arquitetura.md §11). Tocar num gladiador escolhe o lado: a
// arena vira palco (estátuas e números somem, o subtítulo vira narrador), os dois times entram andando e um tabuleiro
// pergunta o nível e o metal do seu time. O visitante não joga em tempo real: ele só monta a ordem do deck. Na rodada
// as cartas viram sozinhas, lado a lado, e os donos delas se enfrentam no meio: marretada, escudo, os números saltando
// ao lado da cabeça, o narrador repetindo em texto e o escultor comentando da muralha. Entre rodadas, compra 3, fica
// com 1 e escolhe onde ela entra. Vencer cunha `cartas` (Duelista).
//
// As regras (números, IA, eventos) moram em js/jogos/duelo-regras.js; as cenas dos 16 golpes, em js/jogos/golpes.js
// (opcional: sem ele, o golpe vira só a etiqueta com o nome). Este módulo é a interface: anima o que as regras
// devolvem, evento a evento, no relógio da rodada (1,15 s por lance; ×2,4 no "rápido"; ×1,6 com movimento reduzido).
// Durante o duelo o quadro da arena é dele (arena.jogo); o cabo de guerra cede a areia.
import * as regras from './duelo-regras.js';
import { registrar, acordar } from '../nucleo/relogio.js';
import { dpr, encaixar, limitar } from '../nucleo/pixel.js';
import { reduzido, aoMudar } from '../nucleo/movimento.js';
import { emitir, ouvir } from '../nucleo/sinais.js';
import { irPara } from '../nucleo/rolagem.js';
import { montar, desenhar, GOLPE } from '../arte/escultor.js';
import { KITS, LUTADOR_KIT } from '../arte/gladiadores.js';
import { mascote, falar, trabalho, virar, sentarEm, tamanhoDaTela, limitar as dentroDaTela } from '../mascote.js';
import { arena, pronta, redesenhar, lugarDoMascote, soltarMascote, caixaDoGladiador, refazerLayout } from '../secoes/arena.js';
import {
  desbloquear, placar, jogo as registrarJogo, metal as metalDoSite, visual, quantas, LIMIAR_PRATA, CONQUISTAS, ir,
} from './conquistas.js';

// Opcionais: sem as cenas o duelo segue com a etiqueta do golpe; sem o cabo, não há quem ceder a areia.
let golpes = null;
import('./golpes.js').then(m => { golpes = m; }, () => {});
let desistirDoCabo = null;
import('./cabo.js').then(m => { desistirDoCabo = m.desistir ?? null; }, () => {});

// ---------- números (spec 07 §2.2, §4.1, §5) ----------

const LANCE = 1.15;        // s de um lance comum, no relógio da rodada
const QUEDA = 0.55;        // s: quando os golpes caem
const JOELHO = 0.42;       // s de joelho depois de parar num marco
const DE_NOVO = 0.3;       // s antes do segundo uso do Repost
const ESPERA = 0.35;       // s antes do primeiro lance
const RAPIDO = 2.4;        // o "rápido"
const PARADO = 1.6;        // movimento reduzido: há menos para ver
const ENTRADA = 0.8;       // s dos times entrando
const LARGO = 900;         // px de palco: abaixo disso, o duelo é estreito
const DIGITA = 60;         // letras por segundo no "Como joga"
const RODADAS = 10;
const TOTAL = CONQUISTAS.length;
const ALCANCE = 5;         // teto do alcance (quadradinhos sob a vida)
const CONFLITOS = 5;       // casas da caixa de Conflitos: cheia, o time sai do ar
const IMPACTO = GOLPE.impacto;   // 0,27 s do maço subindo até bater

const NIVEIS = {
  facil: { nome: 'Fácil', metal: 'bronze', sobre: 'o escultor joga no chute', fala: 'Bronze. Vou jogar no chute!' },
  medio: { nome: 'Médio', metal: 'prata', sobre: 'ele pensa de vez em quando', fala: 'Prata. Vou pensar às vezes.' },
  dificil: { nome: 'Difícil', metal: 'ouro', sobre: 'ele pensa em toda jogada', fala: 'Ouro. Vou pensar em tudo!' },
};
const { METAIS, ESTILOS } = regras;   // bronze, prata, ouro: "equilibrado", "segura e devolve", "golpe grande, com preço"
const NOME_DO_METAL = { bronze: 'Bronze', prata: 'Prata', ouro: 'Ouro' };

const FALAS = {
  abrir: ['Duelo de cartas! Escolhe o nível.', 'Mais um? Escolhe o nível.'],
  compra: 'Carta nova! Eu também já escolhi a minha.',
  comeco: ['Valendo!', 'Vai!', 'Lá vamos nós!'],
  tirou: ['Ai!', 'Essa doeu!', 'Ok, essa foi boa.'],
  tomou: ['Toma!', 'Direto pra produção!', 'Essa é minha!'],
  segurei: ['Segurei!', 'Defendi!'],
  golpeSeu: ['Eita! Golpe especial!', 'De onde saiu isso?', 'Isso é café puro?!'],
  golpeMeu: ['Olha o meu golpe!', 'Compila essa!', 'Segura essa!'],
  venceu: { facil: 'Ganhou no fácil. E no médio?', medio: 'Ganhou no médio. O ouro te espera!', dificil: 'Ganhou do meu time de ouro. Respeito!' },
  perdeu: { facil: 'Ganhei! Dessa vez foi sorte.', medio: 'Ganhei! Quer revanche?', dificil: 'O ouro é duro. Tenta o médio?' },
  empate: 'Empate. Ninguém fez merge!',
  foraDoAr: ['Fora do ar! Conflito demais.', 'Caiu em produção. Acontece nas melhores equipes!'],
  arena: 'Toca num gladiador. Você luta por ele.',
  muro: 'Ou toca num gladiador e joga!',
};

// Faíscas do choque: clarão, bits A e bits B (spec §4.2).
const TONS_DA_FAISCA = {
  golpe: ['#fffdf3', '#ecc145', '#e0775a'],
  force: ['#fdf4ff', '#d8a4e8', '#8a3a6e'],
  bloqueio: ['#ffffff', '#c3cbd1', '#ecc145'],
  ficha: ['#fffdf3', '#fde68a', '#cc961b'],
  cafe: ['#fffbe6', '#fde68a', '#d99a0b'],
};

const sortear = lista => lista[Math.floor(Math.random() * lista.length)];
const plural = (n, um, varios) => (Math.abs(n) === 1 ? um : varios);

// ---------- a ponte com as regras ----------
// O jogo, os lados, os lutadores e as cartas são os das regras (formato no topo de duelo-regras.js); só os eventos
// ganham nomes em português aqui, e a assinatura de cada lutador vira o papel dela na tela.

const ASSINATURAS = { repost: 'eco', recomendacao: 'ficha', conflitos: 'conflitos', ci: 'anel' };
// Sem js/jogos/golpes.js o golpe ainda tem nome: o grito da arquitetura §11.
const GRITOS = {
  notificacoes: 'Chuva de notificações!', conexoes: 'Corrente de conexões!', 'merge-main': 'Merge direto na main!',
  pair: 'Pair programming!', release: 'Release v1.0!', rollback: 'Rollback!', 'hot-take': 'Hot take!',
  endosso: 'Endosso!', streak: 'Streak de commits!', mencao: '@menção!', 'deploy-sexta': 'Deploy na sexta!',
  'commits-atomicos': 'Commits atômicos!', headhunter: 'Headhunter!', hotfix: 'Hotfix às 3 da manhã!',
  'push-force': 'git push --force!', 'code-review': 'Code review!',
};

const times = () => regras.TIMES;

function timeDe(chave) {
  const t = regras.TIMES[chave];
  if (!t) return null;
  return {
    chave, nome: t.nome,
    lutadores: t.lutadores.map(f => ({ ...f, assinatura: ASSINATURAS[f.assinatura] ?? null })),
  };
}

const outroTime = chave => Object.keys(regras.TIMES).find(c => c !== chave) ?? null;

// Um evento das regras com nomes da Interface; `bruto` volta para regras.aplicar e regras.resumir.
function normalizarEvento(e) {
  return {
    tipo: e.tipo, lado: e.lado, lutador: e.lutador ?? 0, n: e.n ?? 0, carta: e.card ?? null,
    bloqueou: e.tipo === 'hit' && e.held !== undefined, segurou: e.held ?? 0,
    ficha: e.tipo === 'hit' && !!e.token, forcePush: !!e.ind, contra: !!e.counter, preco: !!e.self, eco: !!e.echo,
    cafe: !!e.cosmo, uso: e.use === 'give' ? 'deu' : e.use === 'saved' ? 'salvou' : null,
    total: e.tipo === 'ring' ? e.to ?? 0 : e.total ?? 0, delta: e.tipo === 'hate' ? e.n ?? 0 : 0, marco: e.at ?? 0,
    bruto: e,
  };
}

const descricao = c => regras.descrever(c);
const seloDa = c => regras.selo(c);
const golpeDa = c => (c?.golpe ? (golpes?.ESPECIAIS?.[c.golpe] ?? null) : null);
const gritoDo = c => (c?.golpe ? golpeDa(c)?.grito ?? GRITOS[c.golpe] ?? c.nome : '');
const nomeDoGolpe = c => (c?.golpe ? String(gritoDo(c)).replace(/!$/, '') : '');

// ---------- arte pequena: ícones em pixel (7 × 7) ----------

const ICONES = {
  ataque: ['......#', '.....##', '....##.', '#..##..', '.###...', '.##....', '#.#....'],
  defesa: ['#######', '#######', '#######', '#######', '.#####.', '..###..', '...#...'],
  truque: ['...#...', '...#...', '..###..', '#######', '..###..', '...#...', '...#...'],
  force: ['...#...', '...#.#.', '...#..#', '#######', '...#..#', '...#.#.', '...#...'],
};
// O emblema de cada lutador, pela assinatura: linhas de texto (Artigo), nó de rede (Conexão), dois ramos que se
// juntam (Merge) e o check do Review.
const EMBLEMAS = {
  eco: ['#######', '.......', '#####..', '.......', '#######', '.......', '###....'],
  ficha: ['##...##', '##...##', '..#.#..', '...#...', '..#.#..', '##...##', '##...##'],
  conflitos: ['#...#..', '#...#..', '#...#..', '#..#...', '#.#....', '##.....', '#......'],
  anel: ['.......', '......#', '.....##', '#...##.', '##.##..', '.###...', '..#....'],
};
const ESTRELA = ['...#...', '..###..', '#######', '.#####.', '..###..', '.##.##.', '##...##'];
const ESTRELA_DO_VERSO = ['#..#..#', '.#.#.#.', '..###..', '#######', '..###..', '.#.#.#.', '#..#..#'];
const ESCUDINHO = ['#######', '#######', '#######', '.#####.', '..###..', '...#...'];

// Um desenho de '#' vira um path só, um retângulo por trecho de linha: nítido em qualquer tamanho.
function pixelSvg(linhas, classe) {
  let d = '';
  linhas.forEach((linha, y) => {
    for (let x = 0; x < linha.length;) {
      if (linha[x] !== '#') { x++; continue; }
      let w = 1;
      while (linha[x + w] === '#') w++;
      d += `M${x} ${y}h${w}v1h-${w}z`;
      x += w;
    }
  });
  return `<svg class="${classe}" viewBox="0 0 ${linhas[0].length} ${linhas.length}" aria-hidden="true" shape-rendering="crispEdges"><path d="${d}"/></svg>`;
}

// O CI do Review: grade 7 × 7, as células a 2–3,5 do centro, sem a linha e a coluna do meio (os vãos). Segmento 1 em
// cima à direita, 2 embaixo à direita, 3 embaixo à esquerda, 4 em cima à esquerda (lint, teste, build, deploy).
function anelSvg() {
  const partes = [[], [], [], []];
  for (let y = 0; y < 7; y++) {
    for (let x = 0; x < 7; x++) {
      const dx = x - 3, dy = y - 3, r = Math.hypot(dx, dy);
      if (r < 2 || r > 3.5 || !dx || !dy) continue;
      partes[dy < 0 ? (dx > 0 ? 0 : 3) : (dx > 0 ? 1 : 2)].push(`M${x} ${y}h1v1h-1z`);
    }
  }
  return `<svg class="dl-ring" viewBox="0 0 7 7" aria-hidden="true" shape-rendering="crispEdges">${
    partes.map((p, i) => `<path class="dl-seg" data-seg="${i + 1}" d="${p.join('')}"/>`).join('')}</svg>`;
}

const ESCAPE = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
const esc = texto => String(texto ?? '').replace(/[&<>"]/g, c => ESCAPE[c]);

function criar(tag, classe, texto) {
  const el = document.createElement(tag);
  if (classe) el.className = classe;
  if (texto !== undefined) el.textContent = texto;
  return el;
}

// Escreve um estilo só quando ele muda (o quadro chama isto 60 vezes por segundo).
function estilo(el, propriedade, valor) {
  if (propriedade.startsWith('--')) {
    if (el.style.getPropertyValue(propriedade) !== valor) el.style.setProperty(propriedade, valor);
  } else if (el.style[propriedade] !== valor) el.style[propriedade] = valor;
}

function botao(classe, texto, rotulo) {
  const b = criar('button', classe, texto);
  b.type = 'button';
  if (rotulo) b.setAttribute('aria-label', rotulo);
  return b;
}

// ---------- os lutadores na arte: kit, cores, padrão do papel ----------

const PADROES = { eco: 'linhas', ficha: 'rede', conflitos: 'ramos', anel: 'barras' };
const CORES_DE_RESERVA = {
  eco: ['#0a66c2', '#004182', '#9cd0fa'],
  ficha: ['#1f7a5c', '#134d3a', '#8fd6b8'],
  conflitos: ['#6e40c9', '#46278a', '#cbb4ff'],
  anel: ['#c97a14', '#8a520c', '#f6d28a'],
};

function arteDo(time, i) {
  const t = timeDe(time);
  const f = t?.lutadores[i];
  const id = f?.id ?? `${time}-${i}`;
  const sig = f?.assinatura ?? (time === 'github' ? (i ? 'anel' : 'conflitos') : (i ? 'ficha' : 'eco'));
  const kit = KITS[LUTADOR_KIT?.[id] ?? id] ?? null;
  const [cor, sombra, luz] = kit?.cores?.p ? [kit.cores.p, kit.cores.q ?? kit.cores.p, kit.cores.g ?? kit.cores.p]
    : CORES_DE_RESERVA[sig] ?? CORES_DE_RESERVA.eco;
  return {
    id, nome: f?.nome ?? '', assinatura: sig, kit,
    crista: KITS[time]?.crista ?? kit?.crista ?? '#a8432c',
    cor, sombra, luz, padrao: PADROES[sig] ?? 'linhas', emblema: EMBLEMAS[sig] ?? EMBLEMAS.eco,
  };
}

// As cores de cada lutador viram classes .f-<id> { --f, --f-sombra, --f-luz } (cartas, padrões, anel).
function injetarCores() {
  let css = '';
  for (const time of Object.keys(times())) {
    for (const i of [0, 1]) {
      const a = arteDo(time, i);
      css += `.dl-arena .f-${CSS.escape(a.id)}{--f:${a.cor};--f-sombra:${a.sombra};--f-luz:${a.luz}}\n`;
    }
  }
  let estilo = document.getElementById('dl-cores');
  if (!estilo) {
    estilo = criar('style');
    estilo.id = 'dl-cores';
    document.head.append(estilo);
  }
  estilo.textContent = css;
}

// ---------- o céu das cartas de golpe ----------

// O grafo de commits numa nuvem de bits é de golpes.js (cacheado lá por golpe e metal); sem ele, a carta fica só escura.
const ceuDaCarta = c => (golpes?.ceu?.(c.golpe, c.metal) ?? '')
  .replace('<svg ', '<svg class="dl-sky" preserveAspectRatio="xMidYMid slice" ');

// ---------- as cartas ----------

// variante: 'mini' (fileiras), 'big' (mão) ou 'over' (sobre a cabeça). tag: 'button' ou 'div'.
function cartaEl(c, variante, { tag = 'button', costas = false } = {}) {
  const el = criar(tag, `dl-card ${variante}`);
  if (tag === 'button') el.type = 'button';
  if (costas) {
    el.classList.add('back', `m-${c.metal}`);
    el.innerHTML = `<span class="dl-card-back">${pixelSvg(ESTRELA_DO_VERSO, 'dl-back-star')}</span>`;
    return el;
  }
  const a = arteDo(c.time, c.lutador);
  el.classList.add(`k-${c.tipo}`, `net-${c.time}`, `f-${a.id}`, `m-${c.metal}`, `p-${a.padrao}`);
  if (c.golpe) el.classList.add('golpe');
  el.dataset.uid = c.uid;
  const { texto: numero, tipo } = seloDa(c);
  const grande = variante !== 'mini';
  const icone = tipo === 'forcePush' ? 'force' : c.tipo;
  let html = c.golpe ? ceuDaCarta(c) : '';
  html += `<span class="dl-card-who">${pixelSvg(a.emblema, 'dl-card-em')}<span>${esc(a.nome)}</span></span>`;
  html += `<span class="dl-card-top">${pixelSvg(ICONES[icone] ?? ICONES.ataque, `dl-icon i-${icone}`)}`;
  if (grande && c.tipo === 'ataque' && c.forcePush) html += `<span class="dl-card-ind">${pixelSvg(ICONES.force, 'dl-icon i-force')}<b>${c.forcePush}</b></span>`;
  html += `<span class="dl-card-n${[...numero].length > 2 ? ' word' : ''}">${esc(numero)}</span></span>`;
  html += `<span class="dl-card-name">${esc(c.nome)}</span>`;
  if (grande && c.golpe) html += `<span class="dl-card-golpe">${esc(nomeDoGolpe(c))}</span>`;
  if (variante === 'big' || variante === 'over') {
    const texto = descricao(c);
    if (texto) html += `<span class="dl-card-text${texto.length > 110 ? ' long' : ''}">${esc(texto)}</span>`;
  }
  // A grande de ouro ganha o reflexo que atravessa a carta a cada 5 s.
  if (variante === 'big' && c.metal === 'ouro') html += '<span class="dl-brilho" aria-hidden="true"></span>';
  el.innerHTML = html;
  return el;
}

// O que o leitor de tela ouve de uma carta (spec §7.7).
function rotuloDaCarta(c, abrir = false) {
  const a = arteDo(c.time, c.lutador);
  const golpe = c.golpe ? ` Golpe especial: ${nomeDoGolpe(c)}.` : '';
  const texto = descricao(c);
  return `${abrir ? 'Abrir a luta com ' : ''}${c.nome}, de ${a.nome}${texto ? `: ${texto}` : '.'}${golpe}`;
}

// ---------- estado ----------

let el = null;              // os elementos do duelo (montarDom)
let g = null;               // a geometria do palco agora (medir)
let ligado = false;
let fase = null;            // 'setup' | 'order' | 'draft' | 'fight' | 'over'
let time = 'linkedin';      // o time do visitante (lado 0)
let nivel = 'medio';
let metal = 'bronze';       // o metal (o deck) do time do visitante
let jogo = null;            // o jogo das regras
let vis = null;             // o retrato à vista: anda evento a evento durante a rodada
let lutadores = [[], []];   // [lado][i] → o lutador na areia
let caixaDeConflitos = null;
let mao = [];               // as cartas da mão (abertura: as 2 iniciais; compra: 3)
let escolhida = null;       // índice da carta escolhida na compra
let armado = null;          // no toque, o vão tocado uma vez: o 1º toque mostra a previsão, o 2º solta
let toque = false;          // o último ponteiro foi um dedo
let trocouEm = 0;           // quando uma fileira foi redesenhada (ms): o ponteiro parado não conta como apontar
let voando = false;         // a carta escolhida a caminho da fileira
let run = null;             // a rodada passando
let rapido = false;
let tour = null;            // { k, digitado, texto }
let primeiraVez = true;     // a entrada sai dos gladiadores da arena só na primeira vez
let vistas = new Set();     // cartas de golpe já vistas neste duelo (a cena longa é só a primeira)
let explicadas = new Set(); // assinaturas já explicadas neste duelo
let frente = [0, 0];        // no estreito, o lutador da frente de cada lado (o da última carta virada)
let tarefa = null;          // o trabalho do mascote durante o duelo
let faiscas = [];
let textoOriginal = '';
let textoDaFase = '';
let pedidoDeLayout = 0;
let relogioDaMedalha = 0;
let pendente = null;        // s até a dica pedida pelo medalheiro
let dica = 0;               // s de dica: os alvos dos gladiadores piscam
let explicandoAte = 0;      // ms (performance.now) até a explicação de uma assinatura sair do balão
// Um erro no quadro (numa cena, no próprio duelo) não pode congelar a areia: o relógio descarta de vez a tarefa que
// lança, e este quadro roda dentro da tarefa da arena. O duelo fecha, a arena volta e o visitante fica sabendo.
const meuJogo = {
  quadro: dt => { try { quadro(dt); } catch (erro) { quebrou(erro); } },
  ocupado: () => ligado && arena.visivel,
};

// Para um callback atrasado (fim de voo, timer): ele só age se ainda é o mesmo duelo. Sair e voltar no meio liga
// outro, com outro jogo.
const mesmoDuelo = () => { const doJogo = jogo; return () => ligado && jogo === doJogo; };

const todos = () => [...lutadores[0], ...lutadores[1]];
const ritmo = () => (rapido ? RAPIDO : 1) * (reduzido() ? PARADO : 1);
const liso = x => { const t = limitar(x, 0, 1); return t * t * (3 - 2 * t); };
const forma = m => (m === 'prata' || m === 'ouro' ? m : null);
const timeDoLado = lado => (lado === 0 ? time : outroTime(time));
const nomeDoTime = chave => timeDe(chave)?.nome ?? chave;
const esquerda = () => Object.keys(times())[0];
const dirDo = chave => (chave === esquerda() ? 1 : -1);
const metalDoNivel = n => NIVEIS[n]?.metal ?? 'prata';
const metalDoLado = lado => (lado === 0 ? metal : metalDoNivel(nivel));
const falarSe = (texto, segundos) => { if (mascote.ativo && texto) falar(texto, segundos); };
const explicando = () => performance.now() < explicandoAte;
const rodadaAtual = () => vis?.rodada ?? 1;

// Metal do deck: bronze sempre; prata com 13 medalhas; ouro com as 25.
const liberado = m => m === 'bronze' || (m === 'prata' && quantas() >= LIMIAR_PRATA) || (m === 'ouro' && quantas() >= TOTAL);
const faltam = m => Math.max(0, (m === 'ouro' ? TOTAL : LIMIAR_PRATA) - quantas());

// ---------- o palco: DOM ----------

function montarDom() {
  const raiz = criar('div', 'dl-arena');
  raiz.hidden = true;
  raiz.setAttribute('role', 'region');
  raiz.setAttribute('aria-label', 'Duelo de cartas');

  const fxTras = criar('canvas', 'dl-fx tras');
  const fxFrente = criar('canvas', 'dl-fx frente');
  for (const c of [fxTras, fxFrente]) c.setAttribute('aria-hidden', 'true');
  const veu = criar('div', 'dl-scrim');
  veu.hidden = true;

  // A fileira do rival vem antes no DOM (spec §3.3): no estreito ela fica em cima.
  const fileiras = [];
  for (const lado of [1, 0]) {
    const row = criar('div', 'dl-row');
    row.dataset.side = lado;
    const rotulo = criar('span', 'dl-row-label');
    const lista = criar('ol', 'dl-cards');
    row.append(rotulo, lista);
    fileiras[lado] = { row, rotulo, lista };
  }

  const pista = criar('div', 'dl-fighters');
  const gritos = criar('div', 'dl-gritos');
  gritos.setAttribute('aria-hidden', 'true');

  const maoEl = criar('div', 'dl-hand');
  maoEl.setAttribute('role', 'group');
  maoEl.setAttribute('aria-label', 'Sua mão');

  const vs = criar('div', 'dl-vs');
  vs.setAttribute('aria-hidden', 'true');
  const slots = [0, 1].map(lado => {
    const slot = criar('div', 'dl-vs-slot');
    slot.dataset.side = lado;
    const carta = criar('div', 'dl-vs-card');
    const saida = criar('span', 'dl-vs-out');
    const rabo = criar('i', 'dl-vs-tail');
    slot.append(carta, saida, rabo);
    vs.append(slot);
    return { slot, carta, saida, rabo };
  });

  const setup = montarTabuleiro();
  const fim = montarFim();
  const tourEl = montarTour();

  const ctrl = criar('div', 'dl-ctrl');
  const controles = {};
  for (const [acao, texto] of [['tour', 'como joga'], ['rapido', 'rápido'], ['pular', 'pular'], ['sair', 'sair']]) {
    const b = botao('dl-ctrl-b', texto);
    b.dataset.do = acao;
    if (acao === 'tour' || acao === 'rapido') b.setAttribute('aria-pressed', 'false');
    ctrl.append(b);
    controles[acao] = b;
  }

  raiz.append(fxTras, veu, fileiras[1].row, fileiras[0].row, pista, fxFrente, gritos, maoEl, vs, setup.raiz, fim.raiz,
    tourEl.raiz, ctrl);
  arena.palco.append(raiz);

  el = {
    raiz, fxTras, fxFrente, ctxTras: fxTras.getContext('2d'), ctxFrente: fxFrente.getContext('2d'), veu, fileiras,
    pista, gritos, mao: maoEl, vs, slots, setup, fim, tour: tourEl, ctrl, controles,
    narrador: arena.cabeca?.querySelector('.lede') ?? null,
    alvos: null,
  };

  raiz.addEventListener('click', aoClicar);
  raiz.addEventListener('pointerdown', e => { toque = e.pointerType === 'touch'; }, true);
  raiz.addEventListener('pointerover', aoApontar);
  raiz.addEventListener('pointerout', aoDesapontar);
  raiz.addEventListener('focusin', aoApontar);
  raiz.addEventListener('focusout', aoDesapontar);
}

function montarTabuleiro() {
  const raiz = criar('div', 'dl-setup dl-painel');
  raiz.setAttribute('role', 'group');
  raiz.setAttribute('aria-label', 'Antes do duelo');
  const niveis = criar('div', 'dl-levels');
  const botoesDeNivel = Object.entries(NIVEIS).map(([chave, n]) => {
    const b = botao('dl-tile dl-level');
    b.dataset.nivel = chave;
    b.setAttribute('aria-pressed', 'false');
    const canvas = criar('canvas', 'dl-tile-sprite');
    canvas.setAttribute('aria-hidden', 'true');
    b.append(canvas, criar('span', 'dl-level-nome', n.nome), criar('span', 'dl-level-sub', `time de ${n.metal}`),
      criar('span', 'dl-level-nota', n.sobre));
    niveis.append(b);
    return { b, canvas, chave };
  });
  const metais = criar('div', 'dl-metals');
  const botoesDeMetal = METAIS.map(m => {
    const b = botao(`dl-tile dl-metal metal-${m}`);
    b.dataset.metal = m;
    b.setAttribute('aria-pressed', 'false');
    const canvas = criar('canvas', 'dl-tile-sprite');
    canvas.setAttribute('aria-hidden', 'true');
    const texto = criar('span', 'dl-metal-texto');
    const estado = criar('span', 'dl-metal-estado');
    texto.append(criar('span', 'dl-metal-nome', NOME_DO_METAL[m]), criar('span', 'dl-metal-sobre', ESTILOS[m]), estado);
    b.append(canvas, texto);
    metais.append(b);
    return { b, canvas, estado, metal: m };
  });
  const vai = criar('div', 'dl-setup-go');
  const comoJoga = botao('dl-link', 'como joga');
  comoJoga.dataset.go = 'tour';
  const comecar = botao('dl-go', 'começar');
  comecar.dataset.go = 'start';
  vai.append(comoJoga, comecar);
  raiz.append(criar('p', 'dl-setup-h', 'Escolha o nível'), niveis, criar('p', 'dl-setup-h', 'Seu time: cada metal é um deck'),
    metais, vai);
  return { raiz, niveis: botoesDeNivel, metais: botoesDeMetal, comecar, comoJoga };
}

function montarFim() {
  const raiz = criar('div', 'dl-end');
  raiz.hidden = true;
  const faixa = criar('div', 'dl-banner dl-painel');
  const titulo = criar('strong', 'dl-banner-title');
  const texto = criar('p', 'dl-banner-text');
  const pontos = criar('p', 'dl-banner-score');
  faixa.append(titulo, texto, pontos);
  const vai = criar('div', 'dl-end-go');
  const deNovo = botao('dl-go', 'jogar de novo');
  deNovo.dataset.end = 'again';
  const sair = botao('dl-go dl-out', 'sair');
  sair.dataset.end = 'sair';
  vai.append(deNovo, sair);
  raiz.append(faixa, vai);
  return { raiz, faixa, titulo, texto, pontos, deNovo, sair };
}

function montarTour() {
  const raiz = criar('div', 'dl-tour dl-painel');
  raiz.hidden = true;
  raiz.setAttribute('role', 'group');
  raiz.setAttribute('aria-label', 'Como joga');
  const rosto = criar('canvas', 'dl-tour-face');
  rosto.setAttribute('aria-hidden', 'true');
  const corpo = criar('div', 'dl-tour-body');
  const passo = criar('p', 'dl-tour-step');
  const linha = criar('p', 'dl-tour-line');
  // O texto inteiro, invisível, reserva o espaço: a caixa não cresce enquanto as letras chegam.
  const cheio = criar('span', 'dl-tour-cheio');
  cheio.setAttribute('aria-hidden', 'true');
  const digitado = criar('span', 'dl-tour-digitado');
  digitado.setAttribute('aria-hidden', 'true');
  const dito = criar('span', 'sr-only');
  dito.setAttribute('aria-live', 'polite');
  linha.append(cheio, digitado, dito);
  const legenda = criar('p', 'dl-tour-legend');
  legenda.innerHTML = [['ataque', 'ataque'], ['defesa', 'bloqueio'], ['truque', 'truque'], ['force', 'Force push']]
    .map(([icone, texto]) => `<span class="k-${icone}">${pixelSvg(ICONES[icone], 'dl-icon')}${texto}</span>`).join('');
  const vai = criar('div', 'dl-tour-go');
  const pular = botao('dl-link', 'pular');
  pular.dataset.tour = 'pular';
  const proximo = botao('dl-go', 'próximo');
  proximo.dataset.tour = 'proximo';
  vai.append(pular, proximo);
  corpo.append(passo, linha, legenda, vai);
  raiz.append(rosto, corpo);
  return { raiz, rosto, passo, cheio, digitado, dito, legenda, pular, proximo, ator: null };
}

// ---------- geometria (spec §4.1) ----------

function medir() {
  const palco = arena.palco;
  if (!palco?.clientWidth || !arena.secao) return false;
  const W = palco.clientWidth;
  // O duelo cabe no que uma tela mostra sob o título: com a seção no topo da janela, o palco aparece daqui para baixo.
  const dentro = palco.getBoundingClientRect().top - arena.secao.getBoundingClientRect().top;
  const espaco = innerHeight - dentro;
  const H = Math.floor(espaco >= 380 ? Math.min(palco.clientHeight, espaco) : palco.clientHeight);
  const largo = W >= LARGO;
  const P = largo ? (W >= 1280 ? 5 : 4) : (W >= 360 ? 3 : 2);
  let bigW, bigH, miniW;
  if (largo) {
    bigW = Math.min(W >= 1280 ? 168 : 146, Math.floor(H * 0.4 / 1.38));
    bigH = Math.round(bigW * 1.38);
    miniW = Math.min(W >= 1280 ? 88 : 76, Math.floor(H * 0.19 / 1.36));
  } else {
    bigW = Math.min(120, Math.floor((W - 44) / 3));
    bigH = Math.round(bigW * (H < 520 ? 1.15 : 1.38));
    miniW = W >= 375 ? 46 : 40;
  }
  const miniH = Math.round(miniW * 1.36);
  const maoTopo = H - bigH - (largo ? 8 : 14);
  const chao = Math.round(largo ? H - 58 : maoTopo - 30);
  const sobreBase = chao - 17 * P - 42;
  const sobreW = Math.max(56, Math.round(Math.min(bigW * 0.75, (sobreBase - 8) * bigW / bigH)));
  const sobreH = Math.round(sobreW * bigH / bigW);
  const distancia = Math.max(230, Math.min(380, Math.max(W * 0.24, (3 * bigW + 20) / 2 + 14 * P)));
  // O topo das cartas de cada fileira (o rótulo fica 10 px acima delas).
  const cartas = largo ? Math.min(chao - 17 * P - 44 - miniH - 16, maoTopo - miniH - 35) : chao - 17 * P - 46 - miniH;
  g = {
    W, H, P, largo, cx: W / 2, k: Math.min(3, Math.max(1, dpr())),
    bigW, bigH, miniW, miniH, maoTopo, chao, sobreBase, sobreW, sobreH, distancia,
    frenteX: Math.max(15 * P, 42), atras: largo ? 19 * P : Math.max(24 * P, 70),
    fileira: [cartas, largo ? cartas : cartas - miniH - 32],
    tabuleiro: Math.round(Math.min(560, 2 * (distancia - 10 * P) - 32)),
    faixa: Math.round(Math.min(460, 2 * (distancia - 10 * P) - 24)),
  };
  return true;
}

// Onde cada lutador fica (spec §4.1): fora do lance o 1º na frente do time e o 2º atrás; no lance, cara a cara no
// meio (ou afastados, com golpe especial, para a cena ter espaço). No estreito o "da frente" é o da última carta.
function alvoX(f) {
  const { cx, P, largo } = g;
  const d = f.dir;
  const lance = run?.lance;
  if (lance?.ativos[f.lado] === f) {
    if (!lance.cena || lance.solto) return cx - d * 11 * P;
    return largo ? cx - d * (g.bigW + 21 + 12 * P) : cx - d * g.frenteX;
  }
  if (largo) return cx - d * (f.i === 0 ? g.distancia : g.distancia + g.atras);
  return cx - d * (frente[f.lado] === f.i ? g.frenteX : g.frenteX + g.atras);
}

function aplicarLayout() {
  if (!el || !medir()) return;
  const { raiz } = el;
  raiz.classList.toggle('narrow', !g.largo);
  raiz.style.height = `${g.H}px`;
  const vars = {
    '--P': g.P, '--big-w': `${g.bigW}px`, '--big-h': `${g.bigH}px`, '--mini-w': `${g.miniW}px`,
    '--mini-h': `${g.miniH}px`, '--over-w': `${g.sobreW}px`, '--over-h': `${g.sobreH}px`, '--hand-top': `${g.maoTopo}px`,
    '--setup-w': g.largo ? `${g.tabuleiro}px` : 'calc(100% - 24px)', '--banner-w': g.largo ? `${g.faixa}px` : 'calc(100% - 32px)',
  };
  for (const [nome, valor] of Object.entries(vars)) raiz.style.setProperty(nome, valor);
  for (const c of [el.fxTras, el.fxFrente]) {
    c.width = Math.round(g.W * g.k);
    c.height = Math.round(g.H * g.k);
    c.style.width = `${g.W}px`;
    c.style.height = `${g.H}px`;
  }
  for (const f of todos()) if (f.ator.pixel !== g.P || f.ator.dpr !== g.k) remontarAtor(f);
  posicionarFileiras();
  posicionarConflitos();
  if (fase === 'setup') pintarTabuleiro();   // os retratos dos ladrilhos mudam de pixel com a largura
  posicionarPaineis();
  posicionarSobre();
  if (tour) posicionarTour();
  for (const f of todos()) posicionarLutador(f);
}

function pedirLayout() {
  if (!ligado || pedidoDeLayout) return;
  pedidoDeLayout = requestAnimationFrame(() => {
    pedidoDeLayout = 0;
    if (!ligado) return;
    aplicarLayout();
    acordar();
  });
}

// O tabuleiro fica sobre a areia, entre os times, acima das cabeças; a faixa do fim, onde estava a mão.
function posicionarPaineis() {
  const { setup, fim } = el;
  if (!setup.raiz.hidden) {
    const h = setup.raiz.offsetHeight;
    setup.raiz.style.top = `${Math.max(g.largo ? 8 : 46, Math.round(g.chao - 17 * g.P - 46 - h - 10))}px`;
  }
  if (!fim.raiz.hidden) {
    const h = fim.raiz.offsetHeight;
    fim.raiz.style.top = `${Math.max(8, Math.min(g.maoTopo + (g.largo ? 8 : 4), g.H - h - 10))}px`;
  }
}

// ---------- os lutadores ----------

function criarLutador(chave, i, lado) {
  const a = arteDo(chave, i);
  const base = timeDe(chave).lutadores[i];
  const dir = dirDo(chave);
  const raiz = criar('div', `dl-fighter net-${chave} f-${a.id}`);
  raiz.dataset.side = lado;
  raiz.dataset.dir = dir;

  const barra = criar('span', 'dl-bar');
  barra.setAttribute('role', 'img');
  const preenche = criar('i');
  barra.append(preenche);
  const entalhes = base.marcos.map(m => {
    const s = criar('s');
    s.dataset.at = m;
    s.style.left = `${(m / base.vida) * 100}%`;
    barra.append(s);
    return s;
  });
  const numero = criar('b');
  barra.append(numero);

  const alcance = criar('span', 'dl-alc');
  alcance.setAttribute('aria-hidden', 'true');
  const studs = Array.from({ length: ALCANCE }, () => alcance.appendChild(criar('i')));

  // A estrela da Recomendação existe nos dois do time que a tem (ela anda); o CI, só no Review.
  let sig = null;
  const doTime = timeDe(chave).lutadores;
  if (doTime.some(x => x.assinatura === 'ficha')) {
    sig = criar('span', 'dl-sig token');
    sig.innerHTML = pixelSvg(ESTRELA, 'dl-star');
    sig.hidden = true;
  } else if (a.assinatura === 'anel') {
    sig = criar('span', 'dl-sig ring');
    sig.innerHTML = anelSvg();
  }
  if (sig) sig.setAttribute('aria-hidden', 'true');

  const canvas = criar('canvas', 'dl-sprite');
  canvas.setAttribute('aria-hidden', 'true');
  const nome = criar('span', 'dl-name', a.nome);
  nome.setAttribute('aria-hidden', 'true');
  const pops = criar('span', 'dl-pops');
  pops.setAttribute('aria-hidden', 'true');
  const hit = botao('dl-hit', '', `Outro duelo pelo ${nomeDoTime(chave)}`);
  hit.tabIndex = -1;
  hit.dataset.time = chave;
  raiz.append(barra, alcance, ...(sig ? [sig] : []), canvas, nome, pops, hit);
  el.pista.append(raiz);

  const f = {
    lado, i, time: chave, dir, id: a.id, nome: a.nome, assinatura: a.assinatura, kit: a.kit, crista: a.crista,
    raiz, barra, preenche, entalhes, numero, studs, sig, canvas, nomeEl: nome, pops, hit, ator: null,
    x: 0, y: 0, walk: 0, entrada: null, desloc: [], guarda: false, piscaAte: -1, joelho: null, contorno: null,
    pose: null, metal: metalDoLado(lado),
  };
  remontarAtor(f);
  return f;
}

// O ator pinta numa tela fora da página; o canvas à vista é um quadrado de 36 × 36 px de sprite com o pivô dos giros
// (8 px de sprite acima dos pés) no centro, onde o quadro do ator é carimbado a cada pintura: girado em quartos de volta
// quando a cena pede (o §3 proíbe girar canvas por CSS; 90° em pixels inteiros continua nítido).
const LADO = 36, PIVO = 18;
function remontarAtor(f) {
  const antes = f.ator?.estado;
  f.tela ??= document.createElement('canvas');
  f.ator = montar(f.tela, { pixel: g.P, dpr: g.k, reduzido: false });
  const lado = Math.round(LADO * g.P * g.k);
  f.canvas.width = f.canvas.height = lado;
  f.canvas.style.width = f.canvas.style.height = `${lado / g.k}px`;
  f.ctx = f.canvas.getContext('2d');
  f.ctx.imageSmoothingEnabled = false;
  if (antes) {
    const { maco, pulo, recuo, ...resto } = antes;
    f.ator.definir(resto);
  } else {
    f.ator.definir({ dir: f.dir, asas: 'fechadas', kit: f.kit, elmo: f.kit ? f.crista : true, metal: forma(f.metal) });
  }
}

function montarLutadores() {
  el.pista.replaceChildren();
  lutadores = [0, 1].map(lado => [0, 1].map(i => criarLutador(timeDoLado(lado), i, lado)));
  // Os Conflitos ficam sob o time que pode recebê-los: o rival de quem tem a assinatura de pressão.
  caixaDeConflitos = null;
  for (const lado of [0, 1]) {
    const rival = timeDe(timeDoLado(1 - lado));
    if (!rival?.lutadores.some(x => x.assinatura === 'conflitos')) continue;
    const raiz = criar('div', 'dl-hate');
    raiz.dataset.side = lado;
    raiz.setAttribute('role', 'img');
    const casas = criar('span', 'dl-hate-houses');
    const lista = Array.from({ length: CONFLITOS }, () => casas.appendChild(criar('i')));
    const pops = criar('span', 'dl-pops');
    pops.setAttribute('aria-hidden', 'true');
    raiz.append(criar('span', 'dl-hate-name', 'Conflitos'), casas, criar('span', 'dl-hate-out', 'fora do ar'), pops);
    el.pista.append(raiz);
    caixaDeConflitos = { raiz, casas: lista, pops, lado };
  }
}

function posicionarConflitos() {
  const c = caixaDeConflitos;
  if (!c || !g) return;
  const d = dirDo(timeDoLado(c.lado));
  const x = g.cx - d * ((g.largo ? g.distancia : g.frenteX) + g.atras / 2);
  estilo(c.raiz, 'left', `${Math.round(x)}px`);
  estilo(c.raiz, 'top', `${Math.round(g.chao + (g.largo ? 22 : 16))}px`);
}

// O lutador fica no seu ponto da areia com tudo o que é dele (barra, alcance, nome, números, posto pelo CSS a partir
// de --P); o sprite é que investe, recua, ajoelha (1 px de sprite abaixo) e voa nas poses da cena.
function posicionarLutador(f) {
  if (!g) return;
  const p = f.pose;
  const transform = `translate(${encaixar(f.x)}px, ${encaixar(g.chao + f.y)}px)`;
  if (f.raiz.style.transform !== transform) f.raiz.style.transform = transform;
  const dx = (p?.dx ?? 0) + deslocamento(f) * g.P * f.dir;
  const dy = (p?.dy ?? 0) + (f.joelho ? g.P : 0);
  // Os pés ficam em (18, 26) px de sprite no quadrado do carimbo.
  estilo(f.canvas, 'left', `${encaixar(dx - PIVO * g.P)}px`);
  estilo(f.canvas, 'top', `${encaixar(dy - (PIVO + 8) * g.P)}px`);
  empurrarPops(f);
  const opacidade = p?.opacidade ?? '';
  if (f.canvas.style.opacity !== String(opacidade)) f.canvas.style.opacity = opacidade;
  const ativo = run?.lance?.ativos[f.lado] === f;
  f.raiz.classList.toggle('ativo', ativo);
  f.raiz.classList.toggle('caiu', estaCaido(f));
  estilo(f.raiz, 'zIndex', ativo || (!g.largo && frente[f.lado] === f.i) ? '3' : '2');
}

const estaCaido = f => {
  const v = vis?.lados[f.lado];
  return !!v && (v.lutadores[f.i].vida <= 0 || v.foraDoAr);
};

// ---------- HUD: barra, alcance, assinatura, Conflitos ----------

function pintarHud(f) {
  const v = vis?.lados[f.lado]?.lutadores[f.i];
  if (!v) return;
  const vida = Math.max(0, v.vida);
  f.preenche.style.width = `${limitar(vida / v.max, 0, 1) * 100}%`;
  f.numero.textContent = vida;
  f.barra.classList.toggle('low', vida > 0 && vida <= 5);
  for (const s of f.entalhes) s.classList.toggle('past', vida <= Number(s.dataset.at));
  f.studs.forEach((s, k) => s.classList.toggle('on', k < v.alcance));
  const lado = vis.lados[f.lado];
  if (f.sig?.classList.contains('token')) {
    const dono = lutadores[f.lado].find(x => x.assinatura === 'ficha')?.i ?? 1;
    const com = lado.recomendacao ?? dono;
    f.sig.hidden = com !== f.i;
  }
  if (f.sig?.classList.contains('ring') && !f.sig.classList.contains('fechou')) {
    const anel = v.anel ?? 0;
    f.sig.querySelectorAll('.dl-seg').forEach((s, k) => s.classList.toggle('on', k < anel));
  }
  const proximo = v.marcos.find(m => m < vida);
  const deQuem = f.lado === 0 ? 'seu' : 'do escultor';
  const ficha = f.sig?.classList.contains('token') && !f.sig.hidden ? ', com a Recomendação' : '';
  const anel = f.assinatura === 'anel' ? `, CI ${v.anel ?? 0} de 4` : '';
  f.barra.setAttribute('aria-label', `${f.nome}, ${deQuem}: ${vida} de ${v.max} de vida${proximo !== undefined ? `, próximo marco ${proximo}` : ''}, `
    + `alcance ${v.alcance}${ficha}${anel}${lado.foraDoAr ? ', fora do ar' : ''}`);
}

function pintarConflitos() {
  const c = caixaDeConflitos;
  if (!c || !vis) return;
  const lado = vis.lados[c.lado];
  const n = limitar(lado.conflitos, 0, CONFLITOS);
  c.casas.forEach((i, k) => i.classList.toggle('on', k < n));
  c.raiz.classList.toggle('full', n >= CONFLITOS);
  c.raiz.classList.toggle('cancelado', !!lado.foraDoAr);
  c.raiz.setAttribute('aria-label', `Conflitos no ${nomeDoTime(lado.time ?? timeDoLado(c.lado))}: ${n} de ${CONFLITOS}${lado.foraDoAr ? ', fora do ar' : ''}`);
}

function pintarHuds() {
  for (const f of todos()) { pintarHud(f); posicionarLutador(f); }
  pintarConflitos();
}

// Os números que saltam ao lado da cabeça (do lado de fora do time), empilhados 28 px por número vivo: cada um na
// primeira linha livre, para dois vivos nunca se cobrirem.
const larguras = new WeakMap();
function pop(alvo, texto, classes = '', { icone = null } = {}) {
  const pops = alvo?.pops;
  if (!pops || !texto) return null;
  const p = criar('span', `dl-pop ${classes}`.trim());
  if (icone) p.innerHTML = icone;
  p.append(texto);
  const usadas = new Set([...pops.querySelectorAll('.dl-pop:not(.sai)')].map(x => Number(x.style.getPropertyValue('--row'))));
  let linha = 0;
  while (usadas.has(linha)) linha++;
  p.style.setProperty('--row', linha);
  pops.append(p);
  larguras.set(p, p.offsetWidth);
  empurrarPops(alvo);
  setTimeout(() => p.remove(), reduzido() ? 1000 : 1150);
  return p;
}

// Nunca fora da arena: cada número é empurrado para dentro (a 4 px da borda) a partir de onde o dono está agora.
function empurrarPops(alvo) {
  const lista = alvo?.pops?.children;
  if (!g || !lista?.length) return;
  let x, paraFora;
  if (alvo === caixaDeConflitos) {
    x = parseFloat(alvo.raiz.style.left) + alvo.raiz.offsetWidth / 2 + 8;
    paraFora = 1;
  } else {
    paraFora = alvo.dir > 0 ? -1 : 1;
    x = alvo.x + paraFora * 9 * g.P;
  }
  for (const p of lista) {
    const w = larguras.get(p) ?? p.offsetWidth;
    const de = paraFora < 0 ? x - w : x, ate = paraFora < 0 ? x : x + w;
    const empurra = de < 4 ? 4 - de : ate > g.W - 4 ? g.W - 4 - ate : 0;
    estilo(p, '--empurra', empurra ? `${Math.round(empurra)}px` : '');
  }
}

// Saída rápida dos números de um lutador (no "de pé!": dão lugar ao próximo).
function popsSaem(f) {
  for (const p of f.pops.querySelectorAll('.dl-pop:not(.sai)')) {
    p.classList.add('sai');
    setTimeout(() => p.remove(), 160);
  }
}

// ---------- faíscas (canvas da frente; não desenha durante uma cena) ----------

function faisca(tipo, f) {
  if (reduzido() || !g) return;
  const P = g.P;
  const perto = tipo === 'bloqueio' || tipo === 'ficha';
  faiscas.push({
    tipo, t: 0, dur: tipo === 'cafe' ? 0.5 : 0.32, giro: Math.random() * Math.PI * 2,
    x: f.x + f.dir * (perto ? 8 : tipo === 'cafe' ? 0 : 4) * P, y: g.chao - (perto ? 8 : 9) * P,
  });
}

function pintarFaiscas(dt) {
  const ctx = el.ctxFrente;
  const { k, P } = g;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, el.fxFrente.width, el.fxFrente.height);
  if (!faiscas.length) return false;
  const u = Math.max(2, Math.round(0.8 * P));
  const bloco = (x, y, lado, cor) => {
    ctx.fillStyle = cor;
    const x0 = Math.round((x - lado / 2) * k), y0 = Math.round((y - lado / 2) * k);
    ctx.fillRect(x0, y0, Math.round((x + lado / 2) * k) - x0, Math.round((y + lado / 2) * k) - y0);
  };
  for (const s of faiscas) {
    s.t += dt;
    const a = Math.min(1, s.t / s.dur);
    const [t1, t2, t3] = TONS_DA_FAISCA[s.tipo] ?? TONS_DA_FAISCA.golpe;
    if (s.tipo === 'cafe') {
      // Anel de 16 quadrados que abre, achatado em y; depois de 60% somem os ímpares.
      const r = (6 + a * 10) * P;
      for (let i = 0; i < 16; i++) {
        if (a > 0.6 && i % 2) continue;
        const ang = s.giro + i * Math.PI / 8;
        bloco(s.x + Math.cos(ang) * r, s.y - 4 * P + Math.sin(ang) * r / 1.2, u, [t1, t2, t3][i % 3]);
      }
      continue;
    }
    if (a < 0.35) {
      bloco(s.x, s.y, u, t1);
      for (let d = 1; d <= 3; d++) {
        bloco(s.x + d * u, s.y, u, t1); bloco(s.x - d * u, s.y, u, t1);
        bloco(s.x, s.y + d * u, u, t1); bloco(s.x, s.y - d * u, u, t1);
      }
      for (const [dx, dy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) bloco(s.x + dx * u, s.y + dy * u, u, t1);
    }
    for (let i = 0; i < 8; i++) {
      if (a > 0.7 && i % 2) continue;
      const ang = i * Math.PI / 4;
      const r = (2.5 + a * 9) * u * (i % 2 ? 0.65 : 1);
      bloco(s.x + Math.cos(ang) * r, s.y + Math.sin(ang) * r, u, i % 2 ? t3 : t2);
    }
  }
  faiscas = faiscas.filter(s => s.t < s.dur);
  return faiscas.length > 0;
}

// O palco treme: [n,0] → [−n,1] → [n/2,0] → [0,0] em 180 ms.
function tremer(n) {
  if (reduzido() || !arena.palco) return;
  const p = arena.palco;
  p.style.setProperty('--tremor', n);
  p.classList.remove('dl-treme');
  void p.offsetWidth;
  p.classList.add('dl-treme');
  clearTimeout(tremer.relogio);
  tremer.relogio = setTimeout(() => p.classList.remove('dl-treme'), 200);
}

// ---------- fileiras, vãos e mão ----------

function pintarFileira(lado, { vaos = false, vazia = false, chegando = -1 } = {}) {
  const { row, rotulo, lista } = el.fileiras[lado];
  trocouEm = performance.now();
  const v = vis.lados[lado];
  rotulo.textContent = `${lado === 0 ? 'Você' : 'Escultor'} · ${nomeDoTime(v.time ?? timeDoLado(lado))} de ${v.metal ?? metalDoLado(lado)}`;
  lista.replaceChildren();
  const deck = vazia ? [] : lado === 1 && fase === 'draft' ? v.luta.filter(c => c.uid !== v.nova) : v.luta;
  deck.forEach((c, k) => {
    if (vaos) lista.append(vao(k));
    const li = criar('li', 'dl-slot-card');
    if (k === chegando) li.classList.add('chegando');
    const costas = lado === 1;
    const carta = cartaEl(c, 'mini', { costas });
    carta.dataset.lado = lado;
    carta.dataset.k = k;
    if (vaos) carta.tabIndex = -1;   // posicionando, o Tab anda de vão em vão
    carta.setAttribute('aria-label', costas ? 'Carta do escultor, ainda virada para baixo' : rotuloDaCarta(c));
    li.append(carta);
    lista.append(li);
  });
  if (vaos) lista.append(vao(deck.length));
  row.classList.toggle('placing', vaos);
  posicionarFileira(lado);
}

function vao(k) {
  const li = criar('li', 'dl-gap');
  const b = botao('dl-gap-button', '', k === 0 ? 'Pôr a carta nova no começo do deck' : `Pôr a carta nova depois da carta ${k}`);
  b.dataset.vao = k;
  li.append(b);
  return li;
}

// Fileiras que não cabem se sobrepõem: cada carta depois da primeira chega mais perto (spec §4.1).
function posicionarFileira(lado) {
  if (!g || !vis) return;
  const { row, lista } = el.fileiras[lado];
  const doLadoEsquerdo = (vis.lados[lado].time ?? timeDoLado(lado)) === esquerda();
  const x0 = g.largo ? (doLadoEsquerdo ? 16 : g.cx + g.sobreW + 16) : 16;
  const x1 = g.largo ? (doLadoEsquerdo ? g.cx - g.sobreW - 16 : g.W - 16) : g.W - 16;
  row.style.left = `${Math.round(x0)}px`;
  row.style.width = `${Math.round(x1 - x0)}px`;
  row.style.top = `${Math.round(g.fileira[lado])}px`;
  const cartas = [...lista.querySelectorAll('.dl-slot-card')];
  const vaos = lista.querySelectorAll('.dl-gap').length;
  const n = cartas.length;
  const preciso = n * g.miniW + (vaos ? 12 * vaos : 6 * Math.max(0, n - 1));
  const sobra = x1 - x0 - preciso;
  const junta = n > 1 && sobra < 0 ? Math.floor(sobra / (n - 1)) : 0;
  cartas.forEach((li, k) => { li.style.marginLeft = k ? `${(vaos ? 0 : 6) + junta}px` : ''; });
}

function posicionarFileiras() {
  for (const lado of [0, 1]) posicionarFileira(lado);
}

function cartaNaFileira(lado, k) {
  return el.fileiras[lado].lista.querySelectorAll('.dl-slot-card')[k] ?? null;
}

// A coluna k acende nas duas fileiras; a carta do rival vira (só a da vez aparece).
function acenderColuna(k, lance) {
  trocouEm = performance.now();
  for (const lado of [0, 1]) {
    el.fileiras[lado].lista.querySelectorAll('.dl-slot-card').forEach((li, j) => li.classList.toggle('live', j === k));
  }
  const li = cartaNaFileira(1, k);
  const c = lance.cartas[1];
  if (li && c) {
    const carta = cartaEl(c, 'mini');
    carta.dataset.lado = 1;
    carta.dataset.k = k;
    carta.setAttribute('aria-label', rotuloDaCarta(c));
    if (!reduzido()) carta.classList.add('flip');
    li.replaceChildren(carta);
  }
}

function apagarColuna(k, lance) {
  trocouEm = performance.now();
  for (const lado of [0, 1]) el.fileiras[lado].lista.querySelectorAll('.live').forEach(li => li.classList.remove('live'));
  const li = cartaNaFileira(1, k);
  const c = lance.cartas[1];
  if (li && c) {
    const costas = cartaEl(c, 'mini', { costas: true });
    costas.dataset.lado = 1;
    costas.dataset.k = k;
    costas.setAttribute('aria-label', 'Carta do escultor, ainda virada para baixo');
    li.replaceChildren(costas);
  }
}

function pintarMao(abrindo) {
  el.mao.replaceChildren();
  const n = mao.length;
  mao.forEach((c, k) => {
    const b = cartaEl(c, 'big');
    b.dataset.mao = k;
    b.style.setProperty('--i', k - (n - 1) / 2);
    b.setAttribute('aria-label', rotuloDaCarta(c, abrindo));
    if (!abrindo) b.setAttribute('aria-pressed', String(escolhida === k));
    if (escolhida === k) b.classList.add('picked');
    el.mao.append(b);
  });
}

const subirMao = sobe => el.mao.classList.toggle('up', sobe);

// ---------- as cartas sobre as cabeças ----------

function mostrarSobre(lance) {
  for (const s of [0, 1]) {
    const { slot, carta, saida } = el.slots[s];
    const c = lance.cartas[s];
    carta.replaceChildren();
    // Numa cena as cartas só aparecem depois da queda: o resumo já escrito volta junto.
    saida.textContent = lance.resumos?.[s] ?? '';
    saida.classList.remove('rise');
    slot.hidden = !c;
    if (!c) continue;
    const card = cartaEl(c, 'over', { tag: 'div' });
    if (s === 0) card.classList.add('minha');
    carta.append(card);
  }
  el.vs.classList.remove('up');
  void el.vs.offsetWidth;   // reinicia a entrada
  el.vs.classList.add('up');
  posicionarSobre();
}

function esconderSobre() {
  el.vs.classList.remove('up');
}

// Centradas no lugar de cada lutador; perto demais, afastadas a partir do meio; o rabinho aponta para o dono.
function posicionarSobre() {
  const lance = run?.lance;
  if (!lance || !g) return;
  const xs = [0, 1].map(s => (lance.ativos[s] ? alvoX(lance.ativos[s]) : null));
  const cs = [...xs];
  if (cs[0] !== null && cs[1] !== null && Math.abs(cs[0] - cs[1]) < g.sobreW + 10) {
    const meio = (cs[0] + cs[1]) / 2;
    for (const s of [0, 1]) cs[s] = meio - dirDo(timeDoLado(s)) * (g.sobreW + 10) / 2;
  }
  for (const s of [0, 1]) {
    if (cs[s] === null) continue;
    const c = limitar(cs[s], 8 + g.sobreW / 2, g.W - 8 - g.sobreW / 2);
    const esquerda = Math.round(c - g.sobreW / 2);
    const { slot } = el.slots[s];
    estilo(slot, 'left', `${esquerda}px`);
    estilo(slot, 'top', `${Math.round(g.sobreBase - g.sobreH)}px`);
    estilo(slot, '--tail', `${Math.round(limitar(xs[s] - esquerda, 12, g.sobreW - 12))}px`);
  }
}


// ---------- o narrador (o subtítulo da seção) ----------

function narrar(texto, daFase = true) {
  // Fora do duelo o subtítulo é da arena (um focusout tardio, ao sair, não pode reescrevê-lo).
  if (!el?.narrador || !ligado) return;
  if (daFase) textoDaFase = texto;
  if (el.narrador.textContent !== texto) el.narrador.textContent = texto;
}

// Um aparte só para o leitor de tela, no fim do que o narrador acabou de dizer; o próximo narrar() o apaga.
function narrarAParte(texto) {
  if (!el?.narrador || !ligado) return;
  el.narrador.append(criar('span', 'sr-only', ` ${texto}`));
}

const prefixo = () => `Rodada ${rodadaAtual()} de ${RODADAS}`;

// Ao abrir, ele guarda o texto da arena e fixa a altura em N linhas (pelo menos 2): o palco não pula.
function prepararNarrador() {
  const p = el.narrador;
  if (!p) return;
  textoOriginal = p.textContent;
  p.style.removeProperty('--linhas');
  p.removeAttribute('data-narrador');
  const linha = parseFloat(getComputedStyle(p).lineHeight) || 26;
  const linhas = Math.max(2, Math.round(p.getBoundingClientRect().height / linha));
  p.style.setProperty('--linhas', linhas);
  p.dataset.narrador = '';
  p.setAttribute('aria-live', 'polite');
}

function devolverNarrador() {
  const p = el.narrador;
  if (!p) return;
  p.textContent = textoOriginal;
  p.removeAttribute('aria-live');
  p.removeAttribute('data-narrador');
  p.style.removeProperty('--linhas');
}

// ---------- o escultor durante o duelo (trabalho 'duelo', prioridade 30) ----------

function pesEm(x, y) {
  const a = mascote.ator;
  if (!a) return { x, y };
  const t = a.ponta(), p = a.pes();
  return { x: x + t.x - p.x, y: y + t.y - p.y };
}

// Onde ele fica: sentado no tabuleiro (perto da ponta direita), na muralha entre os times ou, no estreito, no canto
// das arquibancadas se as fileiras chegam na muralha. No "Como joga", de pé ao lado do que está aceso.
function poleiro() {
  if (!ligado || !g || !mascote.ator || !arena.palco) return null;
  const c = arena.palco.getBoundingClientRect();
  const Pm = mascote.ator.pixel;
  const obstaculos = [el.narrador?.getBoundingClientRect(), caixaDoTexto(arena.cabeca?.querySelector('.titulo-secao')),
    el.ctrl?.getBoundingClientRect()].filter(r => r?.width);
  const livre = q => !balaoTapa(q, obstaculos);
  let p = null, meta = null;
  if (tour) {
    ({ p, meta } = poleiroDoTour(Pm));
  } else if (fase === 'setup' && !el.setup.raiz.hidden) {
    ({ p, meta } = poleiroDoTabuleiro(c, Pm, livre));
  } else if (!g.largo && arena.geo && g.fileira[1] - 34 < arena.geo.podio + 6) {
    ({ p, meta } = poleiroDoCanto(c, Pm, livre));
  } else {
    p = lugarDoMascote();
    meta = 'muro';
  }
  if (!p || p.y < 60 || p.y > innerHeight - 40) return null;
  return { p, meta };
}

// O balão nasce 8 px acima do canvas dele, centrado nele, com até 250 px; as falas do duelo têm até 3 linhas (66 px).
// Os poleiros da spec ficam logo abaixo do narrador, e no celular e em telas baixas o balão tapava a voz do duelo: um
// poleiro só serve se o balão previsto não cobre o narrador, o título nem os controles do palco.
const BALAO = { largura: 250, altura: 66 };
function caixaDoTexto(e) {   // o h2 do título ocupa a largura toda; o texto dele, não
  if (!e) return null;
  const faixa = document.createRange();
  faixa.selectNodeContents(e);
  return faixa.getBoundingClientRect();
}
function balaoTapa(q, obstaculos) {
  const a = mascote.ator, t = a.ponta();
  const util = tamanhoDaTela().largura;
  const largura = Math.min(BALAO.largura, util - 24);
  const x = limitar(q.x - t.x + a.largura / 2 - largura / 2, 8, Math.max(8, util - largura - 8));
  const base = q.y - t.y - 8;
  return obstaculos.some(r => x < r.right + 4 && x + largura > r.left - 4 && base - BALAO.altura < r.bottom + 4 && base > r.top - 4);
}

// Na borda de cima do tabuleiro, perto da ponta direita (spec). Se dali o balão tapa o narrador: na beirada da
// arquibancada à direita do tabuleiro (largo) ou na areia livre sob os times (estreito; no tabuleiro não há mão).
function poleiroDoTabuleiro(c, Pm, livre) {
  const b = el.setup.raiz.getBoundingClientRect();
  const borda = sentarEm(b.right - 16 - 7 * Pm, b.top);
  if (livre(borda)) return { p: borda, meta: 'tabuleiro' };
  for (let x = b.right + 12 + 7 * Pm; x <= c.right - 12 - 7 * Pm; x += 8) {
    const q = sentarEm(x, c.top);
    if (livre(q)) return { p: q, meta: 'tabuleiro-beirada' };
  }
  const areia = sentarEm(c.right - 16 - 7 * Pm, Math.min(c.top + g.H, innerHeight) - 36);
  if (!g.largo && livre(areia)) return { p: areia, meta: 'tabuleiro-areia' };
  return { p: borda, meta: 'tabuleiro' };
}

// No canto de cima da arquibancada (spec), sem sair da tela. Se dali o balão tapa o narrador ou os controles, ele desce
// pela coluna à esquerda das fileiras (no estreito elas ficam no meio) até o balão passar por baixo, com os pés acima
// das barras de vida dos lutadores.
function poleiroDoCanto(c, Pm, livre) {
  const canto = dentroDaTela(sentarEm(c.left + 12 + 7 * Pm, c.top + 8 + 15 * Pm));
  const pes = mascote.ator.pes().y - mascote.ator.ponta().y;
  const fundo = c.top + g.chao - 17 * g.P - 40;
  for (let dy = 0; canto.y + dy + pes <= fundo; dy += 4) {
    const q = { x: canto.x, y: canto.y + dy };
    if (livre(q)) return { p: q, meta: dy ? `canto-${dy}` : 'canto' };
  }
  return { p: canto, meta: 'canto' };
}

function poleiroDoTour(Pm) {
  const passo = PASSOS[tour.k];
  const caixa = uniao(passo.acende());
  const t = el.tour.raiz.getBoundingClientRect();
  const larg = 14 * Pm, alt = 18 * Pm;
  let x, y;
  if (g.largo && passo.lado !== undefined) {
    // Ao lado do time, do lado do meio, olhando para ele.
    const d = dirDo(timeDoLado(passo.lado));
    x = d > 0 ? caixa.right + 10 + larg / 2 : caixa.left - 10 - larg / 2;
    y = caixa.bottom - 4;
  } else if (g.largo && passo.meio) {
    // Entre as duas fileiras, que ficam uma de cada lado.
    x = (caixa.left + caixa.right) / 2;
    y = caixa.bottom;
  } else {
    x = (caixa.left + caixa.right) / 2;
    y = caixa.top - (passo.lutadores ? 40 : 12);
  }
  // Nunca sob a caixa do tour: logo abaixo dela (ou acima, se embaixo não couber).
  if (x + larg / 2 > t.left && x - larg / 2 < t.right && y > t.top && y - alt < t.bottom) {
    y = t.bottom + 8 + alt < innerHeight - 40 ? t.bottom + 8 + alt : t.top - 8;
  }
  return { p: pesEm(x, y), meta: `tour-${tour.k}` };
}

function uniao(lista) {
  const r = { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity };
  for (const e of lista) {
    const b = (e.classList?.contains('dl-fighter') ? e.querySelector('.dl-sprite') : e)?.getBoundingClientRect();
    if (!b || (!b.width && !b.height)) continue;
    r.left = Math.min(r.left, b.left); r.top = Math.min(r.top, b.top);
    r.right = Math.max(r.right, b.right); r.bottom = Math.max(r.bottom, b.bottom);
  }
  if (r.left === Infinity) {
    const c = el.raiz.getBoundingClientRect();
    return { left: c.left, top: c.top, right: c.right, bottom: c.top + c.height / 2 };
  }
  return r;
}

function chamarMascote() {
  if (tarefa) return;
  tarefa = trabalho({
    nome: 'duelo', prioridade: 30, livre: true,
    alvo: () => poleiro()?.p ?? null,
    get meta() { return poleiro()?.meta ?? null; },
    quadro: poseDoMascote,
  });
}

function soltarTarefa() {
  tarefa?.soltar();
  tarefa = null;
}

// Sentado de asas fechadas; no tabuleiro e fora dos lances olha à esquerda; num lance, para o lado do visitante
// (o lado 0, se ele tem carta; senão o do rival). No tour, de pé, asas lentas, virado para o que está aceso.
function poseDoMascote() {
  const a = mascote.ator;
  if (!a) return;
  if (tour) {
    a.definir({ sentado: false, asas: 'lentas' });
    const caixa = uniao(PASSOS[tour.k].acende());
    const meio = (caixa.left + caixa.right) / 2;
    virar(meio < mascote.ponto.x ? -1 : 1);
    return;
  }
  a.definir({ sentado: true, asas: 'fechadas' });
  const lance = run?.lance;
  if (lance && fase === 'fight') {
    const lado = lance.cartas[0] ? 0 : 1;
    virar(dirDo(timeDoLado(lado)) > 0 ? -1 : 1);
  } else {
    virar(-1);
  }
}

// ---------- o modelo à vista: um evento por vez ----------

function aplicarEvento(e) {
  if (vis?.lados[e.lado]) regras.aplicar(vis, e.bruto);
}

const lutadorDaCarta = (uid, lance) => {
  const s = lance?.cartas.findIndex(c => c?.uid === uid) ?? -1;
  return s < 0 ? null : lutadores[s][lance.cartas[s].lutador] ?? null;
};

// ---------- o choque fora de cena (spec §5.2) ----------

const DURACAO = { investida: 0.45, recuo: 0.4, quique: 0.3 };

function deslocar(f, tipo) {
  if (!f || reduzido() || !run) return;
  f.desloc.push({ tipo, t0: run.t, dur: DURACAO[tipo] });
}

// Em px de sprite ao longo do dir: investida (vai 3, volta), recuo (−5) e quique (−2,5).
function deslocamento(f) {
  if (!run?.lance || !f.desloc.length) return 0;
  let dx = 0;
  for (const d of f.desloc) {
    const u = (run.t - d.t0) / d.dur;
    if (u < 0 || u > 1) continue;
    if (d.tipo === 'investida') dx += 3 * (u < 0.6 ? 1 - (1 - u / 0.6) ** 2 : (1 - (u - 0.6) / 0.4) ** 2);
    else if (d.tipo === 'recuo') dx -= 5 * (u < 0.15 ? u / 0.15 : (1 - (u - 0.15) / 0.85) ** 2);
    else dx -= 2.5 * Math.sin(Math.PI * u);
  }
  return dx;
}

function golpear(f) {
  if (!f) return;
  f.ator.definir({ asas: 'batendo' }).golpear();
}

function piscar(f) {
  if (f && run && !reduzido()) f.piscaAte = run.t + 0.09;
}

// A estrela da Recomendação chega (ou volta para casa) do alto, grande, em degraus.
function chegar(sig) {
  if (!sig || reduzido()) return;
  sig.classList.remove('chega');
  void sig.offsetWidth;
  sig.classList.add('chega');
}

function mexerNoAnel(f, para) {
  const sig = f?.sig;
  if (!sig?.classList.contains('ring')) return;
  const segs = [...sig.querySelectorAll('.dl-seg')];
  if (para >= 4) {
    // Fechou: os quatro acesos por 0,75 s, o anel gira e zera.
    segs.forEach(s => s.classList.add('on'));
    sig.classList.add('fechou');
    pop(f, 'o CI fechou', 'alc');
    const vale = mesmoDuelo();
    setTimeout(() => { sig.classList.remove('fechou'); if (vale()) pintarHud(f); }, reduzido() ? 0 : 750);
    return;
  }
  const s = segs[para - 1];
  if (s && !reduzido()) {
    s.classList.remove('new');
    void s.getBoundingClientRect();
    s.classList.add('new');
  }
}

function mexerNosConflitos(e) {
  const c = caixaDeConflitos;
  if (!c || c.lado !== e.lado) return;
  const d = e.delta ?? 0;
  if (!d) return;
  pop(c, regras.resumir(e.bruto), d > 0 ? 'hate' : 'hate menos');
  if (d > 0 && !reduzido()) {
    c.casas.forEach((i, k) => {
      if (k >= e.total - d && k < e.total) { i.classList.remove('new'); void i.offsetWidth; i.classList.add('new'); }
    });
  }
}

// Um time fora do ar: a caixa treme, cada um dele ganha o aviso e recua, o palco treme 5.
function sairDoAr(lado) {
  const c = caixaDeConflitos;
  if (c && !reduzido()) { c.raiz.classList.remove('cai'); void c.raiz.offsetWidth; c.raiz.classList.add('cai'); }
  for (const f of lutadores[lado]) {
    pop(f, 'fora do ar', 'cancel');
    deslocar(f, 'recuo');
  }
  tremer(5);
}

// Mostra um evento: aplica no modelo à vista, salta o número e, fora de cena, o choque (recuo, pisca, faísca, quique).
function mostrarEvento(e, lance) {
  const f = lutadores[e.lado]?.[e.lutador];
  const autor = lutadorDaCarta(e.carta, lance);
  const semCena = !lance?.cena;
  aplicarEvento(e);
  switch (e.tipo) {
    case 'hit':
      if (e.bloqueou) {
        pop(f, e.segurou > 0 ? `segurou ${e.segurou}` : 'segurou', 'held', { icone: pixelSvg(ESCUDINHO, 'dl-pop-icon') });
        if (semCena) { faisca('bloqueio', f); if (autor && autor !== f) deslocar(autor, 'quique'); }
      } else if (e.ficha) {
        pop(f, 'Recomendação', 'token', { icone: pixelSvg(ESTRELA, 'dl-pop-icon') });
        if (semCena) { faisca('ficha', f); if (autor && autor !== f) deslocar(autor, 'quique'); }
      } else if (e.n > 0) {
        pop(f, `−${e.n}`, `hit${e.forcePush ? ' ind' : ''}${e.preco ? ' self' : ''}`);
        if (semCena) { deslocar(f, 'recuo'); piscar(f); faisca(e.forcePush ? 'force' : 'golpe', f); }
      }
      break;
    case 'heal':
      if (e.n > 0) pop(f, `+${e.n}`, 'heal');
      break;
    case 'alc':
      if (e.n) pop(f, regras.resumir(e.bruto), e.cafe ? 'cosmo' : `alc${e.n < 0 ? ' menos' : ''}`);
      break;
    case 'token': {
      const quem = e.uso === 'deu' ? lutadores[e.lado]?.[e.lutador] : lutadores[e.lado]?.find(x => x.assinatura === 'ficha');
      if (e.uso === 'deu') pop(quem, 'Recomendação', 'token', { icone: pixelSvg(ESTRELA, 'dl-pop-icon') });
      pintarHuds();
      chegar(quem?.sig);
      break;
    }
    case 'ring': mexerNoAnel(f, e.total); break;
    case 'hate': mexerNosConflitos(e); break;
    case 'mark': pop(f, 'de pé!', 'up'); break;
    case 'cancel': sairDoAr(e.lado); break;
    default: break;
  }
}

// ---------- marco, joelho, "de pé!" e café (spec §5.3) ----------

function ajoelhar(e, lance) {
  const f = lutadores[e.lado]?.[e.lutador];
  if (!f) { aplicarEvento(e); return; }
  const assenta = lance.cena ? (lance.assenta?.get(f) ?? 0) : 0;
  f.joelho = { ate: run.t + Math.max(JOELHO, assenta - 0.3 - run.t), marco: e, cafe: [] };
}

function levantar(f, comEfeitos) {
  const j = f.joelho;
  if (!j) return;
  f.joelho = null;
  aplicarEvento(j.marco);
  for (const e of j.cafe) aplicarEvento(e);
  pintarHud(f);
  pintarConflitos();
  if (!comEfeitos) return;
  popsSaem(f);
  pop(f, 'de pé!', 'up');
  // O entalhe onde ele parou pisca em ouro; o sprite pula; na primeira vez, o café: contorno dourado e +1 alcance.
  const s = f.entalhes.find(x => Number(x.dataset.at) === j.marco.marco);
  if (s && !reduzido()) { s.classList.remove('hold'); void s.offsetWidth; s.classList.add('hold'); }
  f.ator.pular();
  if (j.marco.cafe) {
    f.contorno = { ate: run.t + 0.8, cor: '#ecc145' };
    faisca('cafe', f);
    for (const e of j.cafe) if (e.n) pop(f, regras.resumir(e.bruto), 'cosmo');
  } else {
    f.contorno = { ate: run.t + 0.3, cor: '#fff3c4' };
  }
}

// ---------- a rodada (spec §2.2) ----------

function rolar(lances, antes) {
  if (tour) fecharTour(true);
  fase = 'fight';
  el.raiz.dataset.phase = fase;
  vis = antes;
  run = { lances, k: 0, t: 0, espera: ESPERA, pular: false, lance: null };
  for (const f of todos()) Object.assign(f, { desloc: [], guarda: false, joelho: null, contorno: null, pose: null });
  subirMao(false);
  pintarFileira(0);
  pintarFileira(1);
  pintarHuds();
  if (Math.random() < 0.5 && !explicando()) falarSe(sortear(FALAS.comeco), 1.2);
  narrar(prefixo());
  atualizarControles();
  const foco = document.activeElement;
  if (!foco || foco === document.body || el.raiz.contains(foco)) el.controles.rapido.focus({ preventScroll: true });
  acordar();
}

function deixa(lance, em, fn) {
  lance.deixas.push({ em: Math.max(0, em), fn, feita: false });
}

function iniciarLance() {
  const r = run;
  const l = r.lances[r.k];
  const k = ritmo();
  const parado = reduzido();
  const cartas = [l.cartas[0] ?? null, l.cartas[1] ?? null];
  const eventos = l.eventos.map(normalizarEvento);
  // Parte 0: a passada de todos; parte 1: o Repost (a 2ª passada, marcada echo).
  const iEco = eventos.findIndex(e => e.eco);
  const partes = [iEco < 0 ? eventos : eventos.slice(0, iEco), iEco < 0 ? null : eventos.slice(iEco)];
  const lance = { i: l.i ?? r.k, bruto: l, cartas, eventos, partes, deixas: [], queda: QUEDA, dur: LANCE,
    ativos: [null, null], cena: null, solto: false, falou: false, assenta: null };
  r.lance = lance;
  r.t = 0;

  // Quem vai ao meio: o dono de cada carta virada; um lado sem carta manda o alvo do ataque (o 1º lutador).
  for (const s of [0, 1]) if (cartas[s]) lance.ativos[s] = lutadores[s][cartas[s].lutador] ?? null;
  for (const s of [0, 1]) if (!lance.ativos[s] && cartas[1 - s]?.tipo === 'ataque') lance.ativos[s] = lutadores[s][0];
  for (const s of [0, 1]) if (cartas[s]) frente[s] = cartas[s].lutador;
  acenderColuna(r.k, lance);

  if (golpes?.mostrar && !parado && cartas.some(c => c?.golpe)) montarCena(lance);
  if (!lance.cena) mostrarSobre(lance);

  for (const s of [0, 1]) {
    const c = cartas[s];
    if (!c) continue;
    const f = lutadores[s][c.lutador];
    if (c.tipo === 'defesa') f.guarda = true;
    if (lance.cena) continue;
    if (c.tipo === 'ataque') {
      deixa(lance, lance.queda - IMPACTO * k, () => golpear(f));
      deixa(lance, lance.queda - IMPACTO, () => deslocar(f, 'investida'));
    } else if (c.tipo === 'truque') {
      deixa(lance, lance.queda - 0.25, () => { if (!reduzido()) f.ator.pular(); });
    }
    if (c.golpe) gritar(c, f);
  }

  deixa(lance, lance.queda, () => cairParte(lance, 0));
  if (!parado && partes[0].some(e => e.tipo === 'mark')) lance.dur = Math.max(lance.dur, lance.queda + JOELHO + 0.45);
  if (partes[1]) {
    // Repost: a carta pisca de novo, as defesas do outro lado reerguem a guarda e a segunda passada cai.
    const em = lance.dur;
    const s = Math.max(0, l.duas?.findIndex(Boolean) ?? cartas.findIndex(c => c && partes[1].some(e => e.carta === c.uid)));
    const c = cartas[s];
    deixa(lance, em, () => deNovo(lance, s));
    if (c?.tipo === 'ataque') deixa(lance, em + DE_NOVO, () => golpear(lutadores[s][c.lutador]));
    const cai = em + DE_NOVO + IMPACTO * k;
    deixa(lance, cai, () => cairParte(lance, 1));
    lance.dur = cai + (LANCE - QUEDA) + (!parado && partes[1].some(e => e.tipo === 'mark') ? JOELHO : 0);
  }
  narrar(`${prefixo()} · ${[0, 1].filter(s => cartas[s]).map(s => `${s === 0 ? 'você' : 'escultor'}: ${cartas[s].nome}${cartas[s].golpe ? `, ${nomeDoGolpe(cartas[s])}` : ''}`).join('  ×  ')}`);
}

function cairParte(lance, p) {
  const eventos = lance.partes[p];
  if (!eventos || run?.lance !== lance) return;
  const parado = reduzido();
  const k = ritmo();
  // Contra-ataque fora de cena: o defensor investe e bate; o número, o marco e o Café de quem leva caem no impacto.
  const contras = parado || lance.cena ? [] : eventos.filter(e => e.tipo === 'hit' && e.contra);
  const atrasados = new Set(contras);
  for (const e of eventos) {
    const deQuemLeva = contras.some(x => x.lado === e.lado && x.lutador === e.lutador);
    if (deQuemLeva && (e.tipo === 'mark' || (e.tipo === 'alc' && e.cafe))) atrasados.add(e);
  }
  let comumForte = 0;
  for (const e of eventos) {
    if (atrasados.has(e)) continue;
    if (!parado && e.tipo === 'mark') { ajoelhar(e, lance); continue; }
    if (!parado && e.tipo === 'alc' && e.cafe) {
      const f = lutadores[e.lado]?.[e.lutador];
      if (f?.joelho) { f.joelho.cafe.push(e); continue; }
    }
    mostrarEvento(e, lance);
    if (e.tipo === 'hit' && e.n > 0 && !e.preco && !lance.cena) comumForte = Math.max(comumForte, e.n);
  }
  if (contras.length) {
    const defensor = lutadorDaCarta(contras[0].carta, lance);
    deslocar(defensor, 'investida');
    golpear(defensor);
    const em = run.t + IMPACTO * k;
    deixa(lance, em, () => {
      for (const e of eventos) {
        if (!atrasados.has(e)) continue;
        const f = lutadores[e.lado]?.[e.lutador];
        if (e.tipo === 'mark') ajoelhar(e, lance);
        else if (e.tipo === 'alc' && f?.joelho) f.joelho.cafe.push(e);   // o Café sai no "de pé!"
        else mostrarEvento(e, lance);
      }
      pintarHuds();
    });
    lance.dur = Math.max(lance.dur, em + JOELHO + 0.45);
  }
  pintarHuds();
  if (comumForte >= 5) tremer(3);

  // O resumo no pé de cada carta e no narrador (os textos das regras); uma fala do escultor. No Repost, só a carta que
  // jogou de novo.
  const textos = regras.resumir(lance.bruto, { eco: p === 1 });
  const resumos = [0, 1].map(s => (lance.cartas[s] && (p === 0 || lance.bruto.duas?.[s]) ? textos[s] ?? '' : null));
  lance.resumos ??= ['', ''];
  for (const s of [0, 1]) {
    if (resumos[s] === null) continue;
    lance.resumos[s] = resumos[s];
    const saida = el.slots[s].saida;
    saida.textContent = resumos[s];
    saida.classList.remove('rise');
    void saida.offsetWidth;
    if (resumos[s]) saida.classList.add('rise');
  }
  const ditos = [0, 1].filter(s => resumos[s] !== null).map(s => `${lance.cartas[s].nome}${resumos[s] ? `: ${resumos[s]}` : ''}`);
  narrar(`${prefixo()} · ${p === 1 ? 'repost… ' : ''}${ditos.join('  ×  ')}`);
  falaDoLance(lance, eventos);
}

// O Repost: a carta (em cima e na fileira) pisca de novo, o pé dela diz "repost…" e a guarda do outro lado sobe.
function deNovo(lance, s) {
  const c = lance.cartas[s];
  if (!c) return;
  const reinicia = alvo => { if (!alvo || reduzido()) return; alvo.classList.remove('de-novo'); void alvo.offsetWidth; alvo.classList.add('de-novo'); };
  reinicia(el.slots[s].carta.firstElementChild);
  reinicia(cartaNaFileira(s, lance.i)?.firstElementChild);
  el.slots[s].saida.textContent = 'repost…';
  if (lance.resumos) lance.resumos[s] = 'repost…';
  const outro = lance.cartas[1 - s];
  if (outro?.tipo === 'defesa') lutadores[1 - s][outro.lutador].guarda = true;
  narrar(`${prefixo()} · repost… ${c.nome} de novo`);
}

function proximoLance() {
  const r = run;
  const lance = r.lance;
  encerrarCena(lance);
  for (const f of todos()) {
    levantar(f, false);
    Object.assign(f, { guarda: false, desloc: [], pose: null, contorno: null, piscaAte: -1 });
    f.ator.definir({ tom: null, contorno: null, cinzel: null });
  }
  apagarColuna(lance.i, lance);
  esconderSobre();
  el.gritos.replaceChildren();
  r.k++;
  r.lance = null;
  r.t = 0;
  if (r.k >= r.lances.length) fimDaRodada();
}

// "pular": encerra a cena e resolve o resto da rodada na hora, em silêncio.
function pularResto() {
  const r = run;
  if (r.lance) {
    encerrarCena(r.lance);
    apagarColuna(r.lance.i, r.lance);
  }
  for (const f of todos()) {
    f.joelho = null;
    Object.assign(f, { guarda: false, desloc: [], pose: null, contorno: null, piscaAte: -1 });
    f.ator.definir({ tom: null, contorno: null, cinzel: null });
  }
  esconderSobre();
  el.gritos.replaceChildren();
  fimDaRodada();
}

function fimDaRodada() {
  run = null;
  faiscas = [];
  vis = regras.copiar(jogo);
  pintarFileira(0);
  pintarFileira(1);
  pintarHuds();
  const v = regras.fim(jogo);
  if (v) { terminar(v); return; }
  abrirCompra();
}

// ---------- o que se diz de cada lance (spec §6.8, §7.4) ----------

function explicacao(tipo) {
  const dono = sig => {
    for (const lado of [0, 1]) {
      const f = lutadores[lado].find(x => x.assinatura === sig);
      if (f) return { f, parceiro: lutadores[lado][1 - f.i], lado };
    }
    return null;
  };
  if (tipo === 'eco') return 'Repost: a próxima carta deste deck joga duas vezes.';
  if (tipo === 'ficha') {
    const d = dono('ficha');
    return d ? `A Recomendação da ${d.f.nome}: o próximo golpe no ${d.parceiro.nome} não tira nada.` : null;
  }
  if (tipo === 'conflitos') {
    const d = dono('conflitos');
    return d ? `Conflitos: com cinco, o ${nomeDoTime(timeDoLado(1 - d.lado))} sai do ar e perde.` : null;
  }
  if (tipo === 'anel') {
    const d = dono('anel');
    return d ? `O CI do ${d.f.nome}: na metade, +1 alcance pro ${d.parceiro.nome}; passou, alcance e vida pro ${d.f.nome}.` : null;
  }
  return null;
}

// Uma fala por lance, por prioridade: fora do ar; a assinatura que aparece pela primeira vez; fora do "rápido",
// quem tirou ou tomou 4 ou mais, ou o escultor segurando.
function falaDoLance(lance, eventos) {
  if (lance.falou || !mascote.ativo) return;
  let fala = null, segundos = 0;
  if (eventos.some(e => e.tipo === 'cancel')) { fala = sortear(FALAS.foraDoAr); segundos = 2.4; }
  if (!fala) {
    const novas = [
      ['eco', eventos.some(e => e.eco)], ['ficha', eventos.some(e => e.tipo === 'token')],
      ['conflitos', eventos.some(e => e.tipo === 'hate' && e.delta > 0)], ['anel', eventos.some(e => e.tipo === 'ring')],
    ];
    for (const [tipo, apareceu] of novas) {
      if (!apareceu || explicadas.has(tipo)) continue;
      explicadas.add(tipo);
      fala = explicacao(tipo);
      segundos = 3.6;
      if (fala) {
        // O balão é aria-hidden: a regra nova vai também para o narrador, a voz do duelo (só para o leitor de tela;
        // à vista ela está no balão). Enquanto ela está lá, as falas menores esperam: a seguinte a trocaria.
        narrarAParte(fala);
        explicandoAte = performance.now() + segundos * 1000;
        break;
      }
    }
  }
  if (!fala && !rapido && !explicando()) {
    const dado = lado => eventos.filter(e => e.tipo === 'hit' && e.lado === 1 - lado && !e.preco && e.n > 0)
      .reduce((a, e) => a + e.n, 0);
    const segurou = eventos.filter(e => e.tipo === 'hit' && e.lado === 1 && e.bloqueou).reduce((a, e) => a + e.segurou, 0);
    if (dado(0) >= 4) { fala = sortear(FALAS.tirou); segundos = 1.4; }
    else if (dado(1) >= 4) { fala = sortear(FALAS.tomou); segundos = 1.4; }
    else if (segurou >= 2 && Math.random() < 0.5) { fala = sortear(FALAS.segurei); segundos = 1.2; }
  }
  if (fala) {
    lance.falou = true;
    falarSe(fala, segundos);
  }
}

// ---------- o grito (o nome do golpe) ----------

// A etiqueta curta com o grito, sem cena (com cena, quem desenha a placa do grito é o canvas de golpes.js).
function gritar(c, f) {
  const grito = criar('div', `dl-grito m-${c.metal} curto`);
  grito.append(criar('strong', '', golpeDa(c)?.grito ?? nomeDoGolpe(c)));
  el.gritos.append(grito);
  const largura = grito.offsetWidth, altura = grito.offsetHeight;
  const meio = g.largo ? alvoX(f) : g.cx;
  // Fica sobre a cabeça: acima da carta que já está lá, para não cobrir o nome dela.
  const fundo = g.sobreBase - g.sobreH - 6;
  let topo = fundo - altura;
  for (const outro of el.gritos.children) {
    if (outro === grito) continue;
    const o = outro.offsetTop;
    if (Math.abs(o - topo) < altura) topo = o - altura - 4 < 8 ? o + outro.offsetHeight + 4 : o - altura - 4;
  }
  grito.style.left = `${Math.round(limitar(meio - largura / 2, 8, g.W - 8 - largura))}px`;
  grito.style.top = `${Math.round(Math.max(8, topo))}px`;
  return grito;
}

// ---------- a cena de um golpe especial (golpes.js, spec §5.6 e §6.6) ----------

// As cenas do lance: os dois ficam afastados, o Café queima, o grafo de commits se desenha atrás de quem golpeia, o
// grito aparece e o golpe cai em `queda`. A longa (com a noite) só na 1ª vez de cada carta especial no duelo, fora do
// "rápido". Os números continuam caindo em `queda`, sem o choque fora de cena; quem é atingido voa pela pose da cena.
function montarCena(lance) {
  const ESP = golpes.ESPECIAIS;
  const especiais = [0, 1].filter(s => ESP[lance.cartas[s]?.golpe]);
  if (!especiais.length) return;
  const longa = !rapido && especiais.some(s => !vistas.has(lance.cartas[s].uid));
  const intro = longa ? 1.1 : 0.3;
  const hitDe = c => (!c || c.tipo !== 'ataque' ? 0 : ESP[c.golpe]?.hit ?? QUEDA);
  const queda = intro + Math.max(0.5, hitDe(lance.cartas[0]), hitDe(lance.cartas[1]));
  const cena = { longa, shows: [] };
  lance.cena = cena;   // já: alvoX passa a afastar os dois
  lance.queda = queda;
  especiais.forEach(s => {
    const c = lance.cartas[s], o = 1 - s;
    vistas.add(c.uid);
    const eu = lutadores[s][c.lutador];
    const meus = lance.eventos.filter(e => e.carta === c.uid);
    const acertos = meus.filter(e => e.tipo === 'hit' && e.lado === o && !e.preco && !e.contra && !e.eco
      && (c.tipo !== 'ataque' || !e.forcePush));
    const alvos = acertos.length
      ? acertos.map(e => ({ f: lutadores[o][e.lutador], n: e.n, segurou: e.bloqueou || e.ficha }))
      : [{ f: lance.ativos[o] ?? lutadores[o][frente[o]], n: 0, segurou: false }];
    const guarda = f => (lance.cartas[o]?.tipo === 'defesa' && lance.cartas[o].lutador === f.i) || vis.lados[o].recomendacao === f.i;
    const show = golpes.mostrar({
      id: c.golpe, metal: c.metal, P: g.P, dir: eu.dir,
      eu: { x: alvoX(eu), y: g.chao },
      rivais: alvos.map(a => ({ x: alvoX(a.f), y: g.chao, n: a.n, segurou: a.segurou, guarda: guarda(a.f) })),
      contagem: run.lances.slice(0, run.k).filter(l => l.cartas[s]?.lutador === c.lutador).length,
      roubado: meus.filter(e => e.tipo === 'alc' && e.lado === o && e.n < 0).reduce((a, e) => a - e.n, 0),
      recebendo: lance.eventos.some(e => e.tipo === 'hit' && e.lado === s && e.lutador === eu.i && !e.preco && !e.contra && !e.eco),
      contra: meus.filter(e => e.tipo === 'hit' && e.contra).reduce((a, e) => a + e.n, 0),
      sprite: { metal: forma(eu.metal), elmo: eu.crista, kit: eu.kit },
      reagir: c.tipo === 'ataque' ? undefined : queda - intro,
      semente: c.uid * 97 + rodadaAtual(),
      curta: !longa, noite: longa && !cena.shows.length, indice: cena.shows.length,
    });
    if (!show) return;
    if (c.tipo === 'ataque') show.inicio = queda - show.hit;
    cena.shows.push({ show, eu, alvos: alvos.map(a => a.f) });
  });
  if (!cena.shows.length) {
    lance.cena = null;
    lance.queda = QUEDA;
    return;
  }
  const exclamacoes = especiais.includes(0) ? FALAS.golpeSeu : FALAS.golpeMeu;
  if (longa) deixa(lance, 0.8, () => { if (!explicando()) falarSe(sortear(exclamacoes), 1.8); });
  // A cena diz quanto o palco treme na queda (6 se tirou 5 ou mais de alguém, 4 se tirou vida).
  const tremida = Math.max(0, ...cena.shows.map(x => x.show.tremida ?? 0));
  if (tremida) deixa(lance, queda, () => tremer(tremida));
  // O lance dura até a cena assentar; os dois voltam cara a cara (e as cartas aparecem) 0,55 s antes do fim.
  lance.dur = Math.max(queda + 0.65, ...cena.shows.map(x => x.show.fim));
  lance.assenta = new Map();
  for (const x of cena.shows) for (const f of x.alvos) lance.assenta.set(f, Math.max(lance.assenta.get(f) ?? 0, x.show.fim));
  deixa(lance, Math.max(queda + 0.2, lance.dur - 0.55), () => { lance.solto = true; mostrarSobre(lance); });
}

// A noite da longa: escurece até 90% na intro, fica até o golpe cair e clareia em 0,4 s.
const curvaDaNoite = show => {
  const t = show.t, q = show.queda;
  return 0.9 * (t < 0.25 ? t / 0.25 : t < q + 0.3 ? 1 : Math.max(0, 1 - (t - q - 0.3) / 0.4));
};

// Poses de duas cenas no mesmo lutador se somam (o deslocamento); o resto, a última manda.
function juntarPose(f, p) {
  if (!f || !p || !Object.keys(p).length) return;
  const atual = f.pose ?? {};
  f.pose = { ...atual, ...p, dx: (atual.dx ?? 0) + (p.dx ?? 0), dy: (atual.dy ?? 0) + (p.dy ?? 0) };
}

// A cada quadro as cenas acompanham os lutadores (o lugar pedido antes de "solta", o lugar de verdade depois).
function atualizarCena(lance, dt) {
  const cena = lance.cena;
  const k = ritmo();
  const onde = f => ({ x: lance.solto ? f.x : alvoX(f), y: g.chao });
  for (const f of todos()) f.pose = null;
  let acabou = true;
  for (const x of cena.shows) {
    x.show.atualizar(dt * k, { eu: onde(x.eu), rivais: x.alvos.map(onde) });
    if (!x.show.terminou) acabou = false;
    const p = x.show.poses();
    juntarPose(x.eu, p.eu);
    x.alvos.forEach((f, i) => juntarPose(f, p.rivais[i]));
  }
  el.raiz.classList.toggle('cosmo', cena.longa && curvaDaNoite(cena.shows[0].show) > 0.3);
  if (acabou) encerrarCena(lance);
}

function pintarCena(lance) {
  for (const ctx of [el.ctxTras, el.ctxFrente]) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  }
  const cena = lance.cena;
  if (!cena) return;
  for (const x of cena.shows) x.show.desenhar(el.ctxTras, g.P, g.k, 'atras');
  for (const x of cena.shows) x.show.desenhar(el.ctxFrente, g.P, g.k, 'frente');
}

function encerrarCena(lance) {
  if (!lance?.cena) return;
  lance.cena = null;
  for (const f of todos()) f.pose = null;
  for (const ctx of [el.ctxTras, el.ctxFrente]) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  }
  el.raiz.classList.remove('cosmo');
}

// ---------- preferências e placar ----------

function lerPlacar() {
  const p = placar('cartas') ?? {};
  const n = v => (Number.isInteger(v) && v > 0 ? v : 0);
  const lv = {};
  for (const chave of Object.keys(NIVEIS)) {
    const x = p.lv?.[chave] ?? {};
    lv[chave] = { v: n(x.v), d: n(x.d), e: n(x.e) };
  }
  return { v: n(p.v), d: n(p.d), e: n(p.e), lv, nivel: p.nivel, metal: p.metal, tour: !!p.tour };
}

// O nível e o metal da última vez voltam (o metal só se ainda puder ser usado; senão o metal de agora do site).
function lerPreferencias() {
  const p = lerPlacar();
  nivel = NIVEIS[p.nivel] ? p.nivel : 'medio';
  const doSite = metalDoSite() ?? 'bronze';
  metal = METAIS.includes(p.metal) && liberado(p.metal) ? p.metal : liberado(doSite) ? doSite : 'bronze';
}

const gravarPreferencias = () => placar('cartas', { nivel, metal });

const focar = alvo => alvo?.focus({ preventScroll: true });
function focarSeNoDuelo(alvo) {
  const foco = document.activeElement;
  if (!foco || foco === document.body || el.raiz.contains(foco)) focar(alvo);
}

function reiniciar(alvo, classe) {
  alvo.classList.remove(classe);
  void alvo.offsetWidth;
  alvo.classList.add(classe);
}

// O artigo do nome (das regras): "o Merge", "a Conexão".
const comArtigo = (lado, i) => {
  const f = vis?.lados[lado]?.lutadores[i];
  const genero = regras.TIMES[timeDoLado(lado)]?.lutadores[i]?.genero ?? 'o';
  return `${genero} ${f?.nome ?? ''}`;
};
const maiuscula = t => (t ? t[0].toUpperCase() + t.slice(1) : t);

// ---------- abrir, preparar e sair ----------

// Tocar num gladiador (ou num lutador, no fim) abre o duelo por aquele time. Com outro jogo na areia, o cabo cede.
export function abrirDuelo(chave, { deNovo = false } = {}) {
  if (!el || !timeDe(chave) || !outroTime(chave)) return false;
  if (ligado && !deNovo && (fase === 'fight' || fase === 'setup')) return false;
  if (!ligado) {
    if (arena.jogo && arena.jogo !== meuJogo) desistirDoCabo?.();
    if ((arena.jogo && arena.jogo !== meuJogo) || !pronta() || !arena.geo) return false;
  }
  pendente = null;
  const novoDuelo = !ligado;
  const trocou = time !== chave || !lutadores[0].length;
  time = chave;
  lerPreferencias();
  if (novoDuelo) ligar();
  if (novoDuelo || trocou) {
    // Os times ficam nos seus lados (o LinkedIn à esquerda): quem já estava na areia não sai do lugar.
    const onde = new Map(todos().map(f => [`${f.time}-${f.i}`, f.x]));
    montarLutadores();
    aplicarLayout();
    if (novoDuelo) entrar();
    else for (const f of todos()) f.x = onde.get(`${f.time}-${f.i}`) ?? alvoX(f);
  }
  const jogou = lerPlacar();
  abrirTabuleiro();
  falarSe(FALAS.abrir[jogou.v + jogou.d + jogou.e > 0 || !novoDuelo ? 1 : 0], 2.8);
  focar(el.setup.comecar);
  acordar();
  return true;
}

function ligar() {
  ligado = true;
  soltarMascote();
  arena.jogo = meuJogo;
  arena.secao.classList.add('duelo');
  el.raiz.hidden = false;
  prepararNarrador();
  refazerLayout();   // o narrador ficou mais alto: o muro encolhe e a seção segue cabendo na tela
  aplicarLayout();
  for (const r of arena.rivais) r.ator?.definir({ contorno: null });
  if (el.alvos) el.alvos.apontado = null;
  redesenhar();   // a corda some da areia: o cabo só a desenha com a arena livre
  posicionarAlvos();
  chamarMascote();
  mostrarPalco();
}

// O duelo cabe no que a tela mostra sob o título: se o palco não está todo à vista, a página vai ao topo da seção.
function mostrarPalco() {
  const topo = arena.secao.getBoundingClientRect().top;
  const base = arena.palco.getBoundingClientRect().top + g.H;
  if (topo < -2 || base > innerHeight + 2) irPara(Math.round(topo + scrollY));
}

// Os dois times entram andando (0,8 s): na primeira vez, o 1º de cada um sai de onde estava o gladiador da arena; o
// resto vem da borda do palco.
function entrar() {
  const parado = reduzido();
  for (const f of todos()) {
    const gladiador = primeiraVez && f.i === 0 ? arena.rivais.find(r => r.chave === f.time) : null;
    const de = gladiador ? { x: gladiador.x, y: (arena.geo?.chao ?? g.chao) - g.chao } : { x: f.dir > 0 ? -30 : g.W + 30, y: 0 };
    if (parado) {
      Object.assign(f, { x: alvoX(f), y: 0, entrada: null });
    } else {
      Object.assign(f, { x: de.x, y: de.y, entrada: { de, t: 0 } });
    }
  }
  primeiraVez = false;
}

export function sair() {
  if (!ligado) return;
  const tinhaFoco = el.raiz.contains(document.activeElement);
  if (tour) fecharTour(false);
  if (run?.lance) encerrarCena(run.lance);
  run = null;
  fase = null;
  ligado = false;
  voando = false;
  el.raiz.querySelectorAll('.dl-ghost').forEach(x => x.remove());
  el.raiz.hidden = true;
  el.raiz.dataset.phase = '';
  subirMao(false);
  esconderSobre();
  el.gritos.replaceChildren();
  faiscas = [];
  arena.secao.classList.remove('duelo');
  arena.palco.classList.remove('dl-treme');
  devolverNarrador();
  soltarTarefa();
  if (arena.jogo === meuJogo) arena.jogo = null;
  refazerLayout();
  posicionarAlvos();
  emitir('duelo-fim');
  if (tinhaFoco) focar(el.alvos?.botoes.find(b => b.time === time)?.botao);
  acordar();
}

// O fim de emergência (um erro no quadro): o que sair() conseguir desfazer e, aconteça o que acontecer, a areia de
// volta para a arena. O narrador já voltou a ser o subtítulo, então o aviso ao leitor de tela vai pelo #anuncio.
function quebrou(erro) {
  console.error('[duelo] o quadro falhou e o duelo fechou:', erro);
  try { sair(); } catch (outro) { console.error('[duelo] sair também falhou:', outro); }
  ligado = false;
  run = null;
  if (arena.jogo === meuJogo) arena.jogo = null;
  anunciar('O duelo de cartas travou e fechou. A arena voltou ao normal: toque num gladiador para jogar de novo.');
  falarSe('Opa, o duelo travou. Toca num gladiador e bora de novo!', 3);
  acordar();
}

function anunciar(texto) {
  const regiao = document.getElementById('anuncio');
  if (!regiao) return;
  regiao.textContent = '';
  setTimeout(() => { regiao.textContent = texto; }, 60);   // limpo antes: o mesmo texto de novo também é lido
}

// ---------- o tabuleiro de preparação ----------

// Um jogo de mentira só para a areia mostrar os times inteiros (vida cheia) enquanto o visitante escolhe.
function jogoDeVitrine() {
  jogo = regras.novoJogo({ time, nivel, metal });
  vis = regras.copiar(jogo);
}

function abrirTabuleiro() {
  fase = 'setup';
  el.raiz.dataset.phase = fase;
  run = null;
  mao = [];
  escolhida = null;
  armado = null;
  voando = false;   // um voo do jogo anterior acaba sozinho e não age (mesmoDuelo)
  subirMao(false);
  esconderSobre();
  el.gritos.replaceChildren();
  el.fim.raiz.hidden = true;
  jogoDeVitrine();
  for (const f of todos()) {
    Object.assign(f, { metal: metalDoLado(f.lado), joelho: null, contorno: null, guarda: false, desloc: [], pose: null });
    f.hit.tabIndex = -1;
  }
  frente = [0, 0];
  pintarHuds();
  el.setup.raiz.hidden = false;
  pintarTabuleiro();
  reiniciar(el.setup.raiz, 'entra');
  posicionarPaineis();
  narrar('Escolha o nível e o metal do seu time');
  atualizarControles();
}

// Um retrato parado: o 1º lutador de um time, no metal pedido, sem sombra (os ladrilhos do tabuleiro).
function desenharFigura(canvas, arte, P, m, dir) {
  const k = g?.k ?? Math.min(3, Math.max(1, dpr()));
  canvas.width = Math.round(26 * P * k);
  canvas.height = Math.round(21 * P * k);
  canvas.style.width = `${canvas.width / k}px`;
  canvas.style.height = `${canvas.height / k}px`;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  desenhar(ctx, 6 * P * k, 3 * P * k, P * k, { dir, asas: 'fechadas', kit: arte.kit, elmo: arte.crista, metal: forma(m), sombra: false }, k);
}

function pintarTabuleiro() {
  const P = g?.largo ? 3 : 2;
  const rival = arteDo(timeDoLado(1), 0), meu = arteDo(time, 0);
  for (const { b, canvas, chave } of el.setup.niveis) {
    b.setAttribute('aria-pressed', String(chave === nivel));
    desenharFigura(canvas, rival, P, NIVEIS[chave].metal, dirDo(timeDoLado(1)));
  }
  for (const { b, canvas, estado, metal: m } of el.setup.metais) {
    const livre = liberado(m);
    const n = faltam(m);
    b.setAttribute('aria-pressed', String(m === metal));
    b.setAttribute('aria-disabled', String(!livre));
    b.classList.toggle('bloqueado', !livre);
    estado.textContent = m === metal ? 'no seu time' : livre ? 'liberado' : n === 1 ? 'falta 1 medalha' : `faltam ${n} medalhas`;
    desenharFigura(canvas, meu, 2, m, dirDo(time));
  }
}

// Trocar o metal de um time o refunde na areia: o flash de fundição passa pelos sprites.
function refundir(lado) {
  for (const f of lutadores[lado]) {
    f.metal = metalDoLado(lado);
    if (reduzido()) continue;
    reiniciar(f.canvas, 'fundido');
    setTimeout(() => f.canvas.classList.remove('fundido'), 600);
  }
}

function escolherNivel(chave) {
  if (fase !== 'setup' || !NIVEIS[chave]) return;
  const mudou = chave !== nivel;
  nivel = chave;
  gravarPreferencias();
  jogoDeVitrine();
  pintarTabuleiro();
  pintarHuds();
  narrar(`${NIVEIS[chave].nome}: ${NIVEIS[chave].sobre}`);
  falarSe(NIVEIS[chave].fala, 2.2);
  if (mudou) refundir(1);
  acordar();
}

function escolherMetal(m) {
  if (fase !== 'setup' || !METAIS.includes(m)) return;
  if (!liberado(m)) {
    const porque = m === 'prata' ? `A prata vem com ${LIMIAR_PRATA} medalhas.` : `O ouro vem com as ${TOTAL} medalhas.`;
    narrar(porque, false);
    falarSe(porque, 2.4);
    return;
  }
  const mudou = m !== metal;
  metal = m;
  gravarPreferencias();
  jogoDeVitrine();
  pintarTabuleiro();
  pintarHuds();
  narrar(`Deck de ${m}: ${ESTILOS[m]}`);
  if (mudou) refundir(0);
  acordar();
}

// "começar": o jogo de verdade nasce agora; o escultor decide a abertura dele às cegas.
function comecar(comTour) {
  if (fase !== 'setup') return;
  gravarPreferencias();
  jogo = regras.novoJogo({ time, nivel, metal });
  regras.decidirIA(jogo, 1);
  vis = regras.copiar(jogo);
  vistas = new Set();
  explicadas = new Set();
  explicandoAte = 0;
  rapido = false;
  frente = [0, 0];
  el.setup.raiz.hidden = true;
  fase = 'order';
  el.raiz.dataset.phase = fase;
  mao = [...vis.lados[0].luta];
  escolhida = null;
  pintarFileira(0, { vazia: true });
  pintarFileira(1);
  pintarMao(true);
  subirMao(true);
  pintarHuds();
  narrar(`${prefixo()} · toque na carta que abre a luta`);
  atualizarControles();
  if (comTour || !lerPlacar().tour) abrirTour();
  else focar(el.mao.querySelector('.dl-card'));
  acordar();
}

// ---------- abertura, compra e o voo da carta ----------

function abrirCom(k) {
  if (fase !== 'order' || voando || !mao[k]) return;
  const origem = el.mao.querySelector(`[data-mao="${k}"]`);
  regras.abrir(jogo, 0, mao[k]);
  vis = regras.copiar(jogo);
  pintarFileira(0, { chegando: 0 });
  voar(origem, cartaNaFileira(0, 0), jogarRodada);
}

function jogarRodada() {
  if (!ligado) return;
  const antes = regras.copiar(jogo);
  const r = regras.jogarRodada(jogo);
  if (!r.lances.length) {
    vis = regras.copiar(jogo);
    if (r.fim) terminar(r.fim);
    return;
  }
  rolar(r.lances, antes);
}

// Sem veredito: o escultor compra e escolhe (vendo o seu deck sem a sua carta nova), e você compra 3.
function abrirCompra() {
  regras.decidirIA(jogo, 1);
  mao = regras.comprar(jogo, 0);
  vis = regras.copiar(jogo);
  fase = 'draft';
  el.raiz.dataset.phase = fase;
  escolhida = null;
  armado = null;
  if (!mao.length) { jogarRodada(); return; }   // deck de compra esgotado: não acontece em 10 rodadas
  pintarFileira(0);
  pintarFileira(1);
  pintarMao(false);
  subirMao(true);
  pintarHuds();
  narrar(`${prefixo()} · escolha uma carta para o seu deck`);
  if (vis.rodada === 2 && !explicando()) falarSe(FALAS.compra, 2.6);
  atualizarControles();
  focarSeNoDuelo(el.mao.querySelector('.dl-card'));
  acordar();
}

// Tocar numa carta a escolhe (tocar de novo desmarca); a fileira ganha os vãos piscando e o foco vai ao último.
function escolherNaMao(k, doTeclado = true) {
  if (fase !== 'draft' || voando || !mao[k]) return;
  escolhida = escolhida === k ? null : k;
  armado = null;
  for (const b of el.mao.querySelectorAll('.dl-card')) {
    const sim = Number(b.dataset.mao) === escolhida;
    b.classList.toggle('picked', sim);
    b.setAttribute('aria-pressed', String(sim));
  }
  pintarFileira(0, { vaos: escolhida !== null });
  if (escolhida === null) {
    narrar(`${prefixo()} · escolha uma carta para o seu deck`);
    return;
  }
  const instrucao = `${prefixo()} · agora toque num espaço do seu deck`;
  narrar(instrucao);
  const vaos = el.fileiras[0].lista.querySelectorAll('.dl-gap-button');
  focar(vaos[vaos.length - 1]);
  // O foco narra a previsão do vão. No teclado ele acende e ela fica; com mouse ou toque ele não acende
  // (:focus-visible) e a previsão apontaria para um vão apagado: a instrução volta.
  if (!doTeclado) narrar(instrucao);
}

// No toque, o 1º toque num vão mostra a previsão (o ponteiro não passa por cima no celular) e o 2º solta a carta.
function tocarVao(k, porToque) {
  if (fase !== 'draft' || escolhida === null || voando) return;
  if (porToque && armado !== k) {
    armado = k;
    el.fileiras[0].lista.querySelectorAll('.dl-gap-button').forEach(b => b.classList.toggle('armado', Number(b.dataset.vao) === k));
    mostrarPrevisao(k);
    return;
  }
  soltarNoVao(k);
}

function soltarNoVao(k) {
  const origem = el.mao.querySelector(`[data-mao="${escolhida}"]`);
  regras.escolher(jogo, 0, escolhida, k);
  vis = regras.copiar(jogo);
  armado = null;
  pintarFileira(0, { chegando: k });
  voar(origem, cartaNaFileira(0, k), jogarRodada);
}

// "Aqui, se o escultor repetir a ordem dele: você tira 6 de vida e perde 2."
function mostrarPrevisao(k) {
  if (fase !== 'draft' || escolhida === null) return;
  const p = regras.prever(jogo, 0, escolhida, k);
  if (!p) return;
  const fim = p.fora?.[1] ? '. Derruba o time dele do ar.' : p.fora?.[0] ? '. Cuidado: o seu time sai do ar.'
    : p.ko?.[1] ? '. Derruba um lutador dele.' : p.ko?.[0] ? '. Cuidado: um dos seus cai.' : '.';
  narrar(`Aqui, se o escultor repetir a ordem dele: ${p.tira > 0 ? `você tira ${p.tira} de vida` : 'você não tira vida'} e `
    + `${p.perde > 0 ? `perde ${p.perde}` : 'não perde nada'}${fim}`, false);
}

// A carta grande voa até o lugar dela na fileira (360 ms), encolhendo; a rodada começa quando ela chega. O voo é do
// duelo em que nasceu: sair e voltar durante ele não pode jogar a rodada no jogo novo (o de vitrine do tabuleiro).
function voar(origem, destino, depois) {
  const vale = mesmoDuelo();
  const fim = () => {
    if (!vale()) return;
    voando = false;
    destino?.classList.remove('chegando');
    depois();
  };
  if (reduzido() || !origem || !destino || !origem.animate || !g) { fim(); return; }
  voando = true;
  const base = el.raiz.getBoundingClientRect(), a = origem.getBoundingClientRect(), b = destino.getBoundingClientRect();
  const ax = a.left + a.width / 2 - base.left, ay = a.top + a.height / 2 - base.top;
  const bx = b.left + b.width / 2 - base.left, by = b.top + b.height / 2 - base.top;
  const fantasma = origem.cloneNode(true);
  fantasma.classList.add('dl-ghost');
  fantasma.classList.remove('picked');
  fantasma.removeAttribute('data-mao');
  fantasma.setAttribute('aria-hidden', 'true');
  fantasma.tabIndex = -1;
  Object.assign(fantasma.style, { left: `${ax - g.bigW / 2}px`, top: `${ay - g.bigH / 2}px` });
  el.raiz.append(fantasma);
  origem.style.visibility = 'hidden';
  const voo = fantasma.animate([
    { transform: 'none', opacity: 1 },
    { transform: `translate(${bx - ax}px, ${by - ay}px) scale(${g.miniW / g.bigW})`, opacity: 0.4 },
  ], { duration: 360, easing: 'cubic-bezier(.4, 0, .2, 1)', fill: 'forwards' });
  const terminou = () => { fantasma.remove(); fim(); };
  voo.finished.then(terminou, terminou);
}

// ---------- o fim ----------

function comoAcabou(v) {
  const n = v.rodada ?? rodadaAtual();
  const [voce, ele] = v.pontos ?? [0, 0];
  if (v.como === 'foraDoAr') return `O ${nomeDoTime(timeDoLado(v.vencedor === 0 ? 1 : 0))} saiu do ar na rodada ${n}.`;
  if (v.como === 'queda') {
    const lado = v.vencedor === 0 ? 1 : 0;
    const caidos = (vis?.lados[lado]?.lutadores ?? []).filter(f => f.vida <= 0).map(f => comArtigo(lado, f.i));
    return caidos.length > 1 ? `${maiuscula(caidos.join(' e '))} caíram na rodada ${n}.` : `${maiuscula(caidos[0] ?? '')} caiu na rodada ${n}.`;
  }
  const doisCaidos = vis?.lados.every(l => l.lutadores.some(f => f.vida <= 0));
  const doisFora = vis?.lados.every(l => l.foraDoAr);
  const motivo = doisFora ? 'Os dois times saíram do ar' : doisCaidos ? 'Caiu um de cada lado' : `Fim das ${RODADAS} rodadas`;
  return `${motivo}: você ficou com ${voce} de vida, o escultor com ${ele}.`;
}

function terminar(v) {
  fase = 'over';
  el.raiz.dataset.phase = fase;
  run = null;
  vis = regras.copiar(jogo);
  pintarFileira(0);
  pintarFileira(1);
  pintarHuds();
  subirMao(false);
  esconderSobre();
  const nomeDoNivel = NIVEIS[nivel].nome.toLowerCase();
  const venceu = v.vencedor === 0, perdeu = v.vencedor === 1;
  const p = lerPlacar();
  const campo = venceu ? 'v' : perdeu ? 'd' : 'e';
  const lv = { ...p.lv, [nivel]: { ...p.lv[nivel], [campo]: p.lv[nivel][campo] + 1 } };
  placar('cartas', { v: p.v + (venceu ? 1 : 0), d: p.d + (perdeu ? 1 : 0), e: p.e + (!venceu && !perdeu ? 1 : 0), lv });
  const este = lv[nivel];
  const titulo = venceu ? `Você ganhou no ${nomeDoNivel}.` : perdeu ? `O escultor ganhou no ${nomeDoNivel}.` : `Empate no ${nomeDoNivel}.`;
  const texto = comoAcabou(v);
  const f = el.fim;
  f.faixa.className = `dl-banner dl-painel ${venceu ? 'win' : perdeu ? 'lose' : 'tie'}`;
  f.titulo.textContent = titulo;
  f.texto.textContent = texto;
  f.pontos.textContent = `no ${nomeDoNivel}: você ${este.v} × ${este.d} escultor${este.e ? ` · ${este.e} ${plural(este.e, 'empate', 'empates')}` : ''}`;
  f.raiz.hidden = false;
  reiniciar(f.raiz, 'entra');
  posicionarPaineis();
  narrar(`${titulo} ${texto}`);
  for (const x of todos()) x.hit.tabIndex = 0;
  // Os vencedores ainda de pé dão um pulinho cada; a vitória cunha a Duelista, saindo da faixa.
  const lado = venceu ? 0 : perdeu ? 1 : null;
  if (lado !== null) {
    const vale = mesmoDuelo();
    lutadores[lado].filter(x => !estaCaido(x)).forEach((x, i) => setTimeout(() => {
      if (vale() && fase === 'over') { x.ator.pular(); acordar(); }
    }, i ? 280 : 120));
  }
  if (venceu) {
    clearTimeout(relogioDaMedalha);
    relogioDaMedalha = setTimeout(() => desbloquear('cartas', f.faixa), reduzido() ? 0 : 700);
  }
  falarSe(venceu ? FALAS.venceu[nivel] : perdeu ? FALAS.perdeu[nivel] : FALAS.empate, 3);
  atualizarControles();
  focar(f.deNovo);
  acordar();
}

// ---------- "Como joga" (7 passos, spec §7.10) ----------

const PASSOS = [
  {
    lado: 0, acende: () => lutadores[0].map(f => f.raiz),
    texto: () => `Este é o seu time: ${lutadores[0][0].nome} e ${lutadores[0][1].nome}. A barra em cima de cada um é a vida, e os entalhes nela são marcos.`,
  },
  {
    lado: 1, acende: () => lutadores[1].map(f => f.raiz),
    texto: () => `E esse é o meu, de ${metalDoLado(1)}: ${lutadores[1][0].nome} e ${lutadores[1][1].nome}. Derrubou um lutador do outro time, ganhou o duelo.`,
  },
  {
    legenda: true, acende: () => [el.mao],
    texto: () => 'Cada carta é a jogada de um lutador, com o nome dele no alto. O número é a força; no bloqueio, "tudo". Cada metal tem cartas próprias, e as escuras, com um grafo de commits, são golpes especiais.',
  },
  {
    meio: true, acende: () => [el.fileiras[0].row, el.fileiras[1].row],
    texto: () => 'Aqui ficam os decks, o seu e o meu, virado. Na rodada eles viram sozinhos, da esquerda para a direita: a primeira carta sua contra a primeira minha, depois a segunda, e assim por diante.',
  },
  {
    lutadores: true, acende: () => todos().map(f => f.raiz),
    texto: () => 'O dono de cada carta virada vem para o meio e luta. O bloqueio segura todos os ataques contra quem bloqueia e, se segurou, dá o bônus da carta. O Force push passa por tudo. Os quadradinhos sob a vida são o alcance: cada um soma 1 nos ataques.',
  },
  {
    lutadores: true, acende: () => todos().map(f => f.raiz),
    texto: () => 'O que um lutador perde num lance para no primeiro marco: ele cai de joelho e levanta. Na primeira vez, ele toma um café: +1 alcance. E cada lutador tem uma assinatura; eu explico quando ela aparecer.',
  },
  {
    acende: () => [el.mao, el.fileiras[0].row],
    texto: () => `Depois de cada rodada você escolhe uma carta nova e toca no espaço do deck onde ela entra. São ${RODADAS} rodadas; se ninguém cair, ganha quem tiver mais vida.${fase === 'order' ? ' Agora toque na carta que abre a luta.' : ''}`,
  },
];

function abrirTour() {
  if (fase !== 'order' && fase !== 'draft') return;
  tour = { k: 0, digitado: 0, texto: '' };
  el.raiz.classList.add('touring');
  el.veu.hidden = false;
  el.tour.raiz.hidden = false;
  el.tour.ator ??= montar(el.tour.rosto, { pixel: 3, dpr: g.k, reduzido: false });
  atualizarControles();
  irAoPasso(0);
  focar(el.tour.proximo);
}

function irAoPasso(k) {
  for (const e of el.raiz.querySelectorAll('.dl-lit')) e.classList.remove('dl-lit');
  tour.k = k;
  const passo = PASSOS[k];
  tour.texto = passo.texto();
  tour.digitado = reduzido() ? tour.texto.length : 0;
  for (const e of passo.acende()) e.classList.add('dl-lit');
  const t = el.tour;
  t.passo.textContent = `Como joga · ${k + 1} de ${PASSOS.length}`;
  t.cheio.textContent = tour.texto;
  t.digitado.textContent = tour.texto.slice(0, Math.floor(tour.digitado));
  t.dito.textContent = tour.texto;
  t.legenda.hidden = !passo.legenda;
  t.proximo.textContent = k < PASSOS.length - 1 ? 'próximo' : fase === 'order' ? 'jogar' : 'entendi';
  narrar(`Como joga · ${k + 1} de ${PASSOS.length}`, false);
  t.ator?.pular();
  posicionarTour();
  acordar();
}

// "próximo": ainda digitando, completa o texto; senão avança. No último passo, fecha (como visto).
function proximoPasso() {
  if (!tour) return;
  if (tour.digitado < tour.texto.length) {
    tour.digitado = tour.texto.length;
    el.tour.digitado.textContent = tour.texto;
    return;
  }
  if (tour.k < PASSOS.length - 1) irAoPasso(tour.k + 1);
  else fecharTour(true);
}

function fecharTour(visto) {
  if (!tour) return;
  tour = null;
  for (const e of el.raiz.querySelectorAll('.dl-lit')) e.classList.remove('dl-lit');
  el.raiz.classList.remove('touring');
  el.veu.hidden = true;
  el.tour.raiz.hidden = true;
  if (visto) placar('cartas', { tour: true });
  atualizarControles();
  if (!ligado) return;
  narrar(textoDaFase);
  if (fase === 'order' || fase === 'draft') focar(el.mao.querySelector('.dl-card'));
}

// A caixa fica no alto do palco; se o que está aceso está lá em cima, ela desce para 10 px do fundo.
function posicionarTour() {
  if (!tour || !g) return;
  const caixa = el.tour.raiz;
  const h = caixa.offsetHeight;
  const topo = g.largo ? 12 : 48;
  const aceso = uniao(PASSOS[tour.k].acende());
  const palco = el.raiz.getBoundingClientRect();
  const embaixo = aceso.top - palco.top < topo + h + 8;
  caixa.style.top = `${embaixo ? Math.max(8, g.H - h - 10) : topo}px`;
}

function animarTour(dt, parado) {
  if (tour.digitado < tour.texto.length) {
    tour.digitado = parado ? tour.texto.length : Math.min(tour.texto.length, tour.digitado + dt * DIGITA);
    el.tour.digitado.textContent = tour.texto.slice(0, Math.floor(tour.digitado));
  }
  const a = el.tour.ator;
  if (!a) return;
  a.definir({ dir: 1, asas: 'lentas', metal: metalDoSite(), ...visual() });
  a.avancar(parado ? 0 : dt);
  a.pintar();
}

// ---------- controles ----------

function atualizarControles() {
  const c = el.controles;
  c.tour.hidden = !(fase === 'order' || fase === 'draft');
  c.tour.setAttribute('aria-pressed', String(!!tour));
  c.rapido.hidden = fase !== 'fight';
  c.rapido.setAttribute('aria-pressed', String(rapido));
  c.pular.hidden = fase !== 'fight';
  c.sair.hidden = !ligado || fase === 'over';
}

function controle(acao) {
  if (acao === 'tour') { if (tour) fecharTour(true); else abrirTour(); }
  else if (acao === 'rapido') { rapido = !rapido; atualizarControles(); }
  else if (acao === 'pular') { if (run) run.pular = true; acordar(); }
  else if (acao === 'sair') sair();
}

// ---------- entradas ----------

function aoClicar(e) {
  const b = e.target.closest?.('button');
  if (!b || !el.raiz.contains(b) || b.classList.contains('dl-ghost')) return;
  const d = b.dataset;
  if (d.do) controle(d.do);
  else if (d.go === 'start') comecar(false);
  else if (d.go === 'tour') comecar(true);
  else if (d.nivel) escolherNivel(d.nivel);
  else if (d.metal) escolherMetal(d.metal);
  else if (d.end === 'again') abrirDuelo(time, { deNovo: true });
  else if (d.end === 'sair') sair();
  else if (d.tour === 'pular') fecharTour(true);
  else if (d.tour === 'proximo') proximoPasso();
  else if (b.classList.contains('dl-hit')) { if (fase === 'over') abrirDuelo(d.time, { deNovo: true }); }
  else if (d.mao !== undefined) { if (fase === 'order') abrirCom(Number(d.mao)); else escolherNaMao(Number(d.mao), e.detail === 0); }
  else if (d.vao !== undefined) tocarVao(Number(d.vao), toque && e.detail !== 0);
  else if (b.classList.contains('mini')) narrarCarta(b);
  acordar();
}

// As cartas da fileira narram a descrição (no ponteiro, no foco e no toque); os vãos, a previsão.
function narrarCarta(b) {
  if (b.classList.contains('back')) return;
  const uid = Number(b.dataset.uid);
  const c = vis?.lados.flatMap(l => l.luta).find(x => x.uid === uid);
  if (!c) return;
  narrar(`${c.nome} · ${arteDo(c.time, c.lutador).nome}. ${descricao(c)}`, false);
}

function aoApontar(e) {
  if (e.pointerType === 'touch') return;
  // Uma carta nova que nasce sob o ponteiro parado dispara um pointerover sem ninguém mexer: não é apontar (e
  // apagaria do narrador o lance ou o fim do duelo).
  if (e.type === 'pointerover' && performance.now() - trocouEm < 400) return;
  const b = e.target.closest?.('button');
  if (!b || !el.raiz.contains(b)) return;
  if (b.dataset.vao !== undefined) mostrarPrevisao(Number(b.dataset.vao));
  else if (b.classList.contains('mini')) narrarCarta(b);
}

function aoDesapontar(e) {
  if (e.pointerType === 'touch') return;
  const b = e.target.closest?.('button');
  if (!b || (e.relatedTarget && b.contains(e.relatedTarget))) return;
  if ((b.dataset.vao !== undefined && armado === null) || b.classList.contains('mini')) narrar(textoDaFase);
}

// Esc: fecha o tour; senão sai do duelo (a não ser que outra janela ou jogo do site esteja aberto).
function aoTeclar(e) {
  if (e.key !== 'Escape' || !ligado || e.defaultPrevented) return;
  if (tour) { e.preventDefault(); fecharTour(true); return; }
  const raiz = document.documentElement.classList;
  if (raiz.contains('janela-aberta') || raiz.contains('jogo-aberto')) return;
  e.preventDefault();
  sair();
}

// ---------- o quadro (arena.jogo.quadro) ----------

function animarLutador(f, dt, parado) {
  let andando = false;
  const alvo = alvoX(f);
  if (f.entrada) {
    f.entrada.t += dt;
    const u = liso(f.entrada.t / ENTRADA);
    f.x = f.entrada.de.x + (alvo - f.entrada.de.x) * u;
    f.y = f.entrada.de.y * (1 - u);
    f.walk += dt * 9;
    andando = u < 1;
    if (u >= 1) { f.entrada = null; f.y = 0; }
  } else {
    const falta = alvo - f.x;
    if (parado || Math.abs(falta) < 0.8) f.x = alvo;
    else {
      f.x += falta * (1 - Math.exp(-dt * (rapido ? 26 : 13)));
      f.walk += dt * 12;
      andando = true;
    }
  }
  const t = run?.t ?? 0;
  let contorno = null;
  if (f.contorno) {
    const resta = f.contorno.ate - t;
    if (resta <= 0 || !run) f.contorno = null;
    else if (Math.floor(resta * 14) % 2 === 0) contorno = f.contorno.cor;
  }
  const caido = estaCaido(f);
  const golpeando = f.ator.golpeando;
  const p = f.pose;
  f.ator.definir({
    dir: p?.virar ? -f.dir : f.dir,
    passos: p?.passos ?? (andando ? Math.floor(f.walk) : 0),
    sentado: p?.sentado ?? (!!f.joelho || caido),
    dormindo: !!p?.dormindo,
    cinzel: p?.cinzel !== undefined ? p.cinzel : f.guarda && !caido ? (f.kit?.guarda ?? -0.55) : null,
    tom: run && t < f.piscaAte ? 'luz' : (p?.tom ?? null),
    contorno,
    asas: p?.asas ?? (golpeando ? f.ator.estado.asas : 'fechadas'),
    metal: forma(f.metal),
  });
  if (p?.maco !== undefined && !golpeando) f.ator.estado.maco = p.maco;
  f.ator.avancar(parado && !golpeando ? 0 : dt);
  f.ator.pintar();
  carimbar(f);
  posicionarLutador(f);
}

// O quadro do ator (QUADRO: x −9…24, y −5…19 em px de sprite) vai para o quadrado com o ponto (7, 9) no centro.
function carimbar(f) {
  const { ctx, canvas, ator } = f;
  const u = ator.pixel * ator.dpr;
  const meio = Math.round(PIVO * u);
  const ox = Math.round((PIVO - 16) * u), oy = Math.round((PIVO - 14) * u);
  const quartos = Math.round((f.pose?.giro ?? 0) / 90) & 3;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (quartos) {
    ctx.translate(meio, meio);
    ctx.rotate(quartos * Math.PI / 2);
    ctx.translate(-meio, -meio);
  }
  ctx.drawImage(f.tela, ox, oy);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

function quadro(dt) {
  if (!ligado || !g || !arena.visivel) return;
  const parado = reduzido();
  avancarRodada(dt);
  if (!ligado) return;
  if (tour) animarTour(dt, parado);
  const cena = run?.lance?.cena;
  if (cena) atualizarCena(run.lance, dt);
  for (const f of todos()) animarLutador(f, dt, parado);
  if (cena) pintarCena(run.lance);
  else pintarFaiscas(dt * ritmo());
  if (run?.lance) posicionarSobre();
  posicionarConflitos();
}

function avancarRodada(dt) {
  const r = run;
  if (!r || fase !== 'fight') return;
  const k = ritmo();
  if (r.espera > 0) { r.espera -= dt * k; return; }
  if (r.pular) { pularResto(); return; }
  if (!r.lance) {
    if (r.k >= r.lances.length) { fimDaRodada(); return; }
    iniciarLance();
  }
  r.t += dt * k;
  const lance = r.lance;
  for (let i = 0; i < lance.deixas.length; i++) {
    const d = lance.deixas[i];
    if (!d.feita && r.t >= d.em) { d.feita = true; d.fn(); }
    if (run?.lance !== lance) return;
  }
  for (const f of todos()) if (f.joelho && r.t >= f.joelho.ate) levantar(f, true);
  if (r.t >= lance.dur) proximoLance();
}

// ---------- a porta de entrada: os gladiadores da arena ----------

function montarAlvos() {
  const raiz = criar('div', 'duelo-alvos');
  const etiqueta = criar('span', 'dica-pixel duelo-etiqueta');
  etiqueta.setAttribute('aria-hidden', 'true');
  etiqueta.hidden = true;
  raiz.append(etiqueta);
  // O da esquerda primeiro: a ordem do Tab é a da tela.
  const botoes = [...arena.rivais].sort((a, b) => b.dir - a.dir).map(rival => {
    const b = botao('duelo-alvo', '', `Duelo de cartas: lutar pelo ${rival.rede.nome}`);
    b.addEventListener('pointerenter', () => apontarGladiador(rival, true));
    b.addEventListener('pointerleave', () => apontarGladiador(rival, false));
    b.addEventListener('focus', () => apontarGladiador(rival, true));
    b.addEventListener('blur', () => apontarGladiador(rival, false));
    b.addEventListener('click', () => abrirDuelo(rival.chave));
    raiz.append(b);
    return { botao: b, rival, time: rival.chave };
  });
  arena.palco.append(raiz);
  el.alvos = { raiz, etiqueta, botoes, apontado: null };
}

// Os alvos cobrem os gladiadores (cabeça aos joelhos) com a arena pronta e sem outro jogo puxando a corda.
function posicionarAlvos() {
  const a = el?.alvos;
  if (!a || !arena.geo) return;
  const livre = !ligado && pronta() && arena.rivais.length === 2 && !arena.palco.classList.contains('cabo-puxando');
  a.raiz.classList.toggle('ligado', livre);
  for (const { botao: b, rival } of a.botoes) {
    const c = caixaDoGladiador(rival);
    const estilo = { left: `${Math.round(c.x)}px`, top: `${Math.round(c.y)}px`, width: `${Math.round(c.largura)}px`, height: `${Math.round(c.altura)}px` };
    for (const [chave, valor] of Object.entries(estilo)) if (b.style[chave] !== valor) b.style[chave] = valor;
  }
  const r = a.apontado;
  if (r && livre) {
    const c = caixaDoGladiador(r);
    a.etiqueta.textContent = `lutar pelo ${r.rede.nome}`;
    a.etiqueta.style.left = `${Math.round(c.x + c.largura / 2)}px`;
    a.etiqueta.style.top = `${Math.round(c.y - 8)}px`;
  }
  a.etiqueta.hidden = !r || !livre;
}

// Apontado ou com foco, o gladiador ganha um contorno escuro e a etiqueta "lutar pelo LinkedIn".
function apontarGladiador(rival, sim) {
  const a = el.alvos;
  if (sim) a.apontado = rival;
  else if (a.apontado === rival) a.apontado = null;
  if (!ligado) for (const r of arena.rivais) r.ator?.definir({ contorno: r === a.apontado ? '#191410' : null });
  redesenhar();
  posicionarAlvos();
  acordar();
}

// Pedido do medalheiro: leva até a arena e, com ela pronta e livre, os gladiadores piscam e o escultor explica.
function mostrar() {
  ir(arena.palco);
  pendente = reduzido() ? 0 : 0.8;
  registrar(vigiar);
}

function vigiar(dt) {
  if (pendente !== null && !ligado && pronta() && !arena.jogo && (pendente -= dt) <= 0) {
    pendente = null;
    dica = 2.2;
    el.alvos.raiz.dataset.dica = '';
    falarSe(FALAS.arena, 3);
    focar(el.alvos.botoes[0]?.botao);
  }
  if (dica > 0 && (dica -= dt) <= 0) {
    dica = 0;
    el.alvos.raiz.removeAttribute('data-dica');
  }
  return pendente !== null || dica > 0;
}

// ---------- início ----------

export function iniciar() {
  if (arena.rivais.length !== 2 || !arena.palco || !arena.secao || !regras.TIMES) return;
  montarDom();
  injetarCores();
  montarAlvos();
  // Os alvos seguem os gladiadores a cada redesenho da arena (o cabo também desenha por aqui).
  const pintarAntes = arena.pintar;
  arena.pintar = (ctx, k) => { pintarAntes?.(ctx, k); posicionarAlvos(); };
  if (!arena.falas.includes(FALAS.muro)) arena.falas.push(FALAS.muro);
  document.addEventListener('keydown', aoTeclar);
  addEventListener('resize', () => { pedirLayout(); posicionarAlvos(); }, { passive: true });
  aoMudar(() => {
    if (ligado && run?.lance) encerrarCena(run.lance);
    pedirLayout();
    posicionarAlvos();
  });
  ouvir('arena-pronta', () => posicionarAlvos(), { passados: true });
  ouvir('nivel', () => { if (fase === 'setup') pintarTabuleiro(); });
  registrarJogo('cartas', {
    nome: 'Duelo de cartas',
    onde: 'no Coliseu: clique num gladiador',
    placar: () => {
      const p = lerPlacar();
      return p.v + p.d + p.e ? `${p.v} a ${p.d}` : null;
    },
    jogar: mostrar,
    oculto: () => arena.rivais.length !== 2,
  });
  posicionarAlvos();
}

