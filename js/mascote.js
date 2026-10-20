// O mascote: o pequeno escultor alado. Durante o show da primeira tela ele é o ator que o herói comanda; depois da
// escultura vira o companheiro que acompanha a página, fala e trabalha para as seções.
// CONTRATO (docs/arquitetura.md §5): a API exportada não muda. `dirigir` e `colocar` são do herói (o show).
// Números da spec 01 (§5.6, §5.7, §6.11–6.16).
import { montar, ponta as pontaDoSprite, PONTA } from './arte/escultor.js';
import { registrar, acordar } from './nucleo/relogio.js';
import { dpr, encaixar, limitar as entre, suave } from './nucleo/pixel.js';
import { reduzido, aoMudar } from './nucleo/movimento.js';
import { emitir } from './nucleo/sinais.js';

const camada = document.getElementById('camada-escultor');
const botao = document.getElementById('escultor');
const sprite = botao?.querySelector('.escultor-sprite');
const balao = document.getElementById('escultor-balao');

// Quem cutuca o escultor no meio do trabalho ouve uma destas, em ciclo.
const COCEGAS = ['Ei! Tô trabalhando!', 'SEM CÓCEGAS!!!', 'Se continuar eu quebro, viu!'];

const trabalhos = new Set();
const extras = new Set();
const quandoPronto = [];
let ator = null;
let ponto = { x: 0, y: 0 };   // a ponta do cinzel: px da camada no show, px da janela depois
let diretor = null;           // o herói, enquanto o show dura
let laco = null;
let ativo = false;            // virou companheiro
let estacionando = false;     // voando para o descanso pela primeira vez (só então fica pronto)
let pronto = false;
let atual = null;             // o trabalho que tem o mascote agora
let ali = false;              // chegou ao alvo do trabalho atual
let metaAtual;
let voo = null;
let recadoAtual = null;
let impactoPendente = null;
let fila = [];                // falas por dizer: [{ texto, segundos }]
let falaRestante = 0;
let cocegas = 0;

// Pixel do mascote: 4 px CSS por px de sprite em telas largas, 3 até 1050 px.
const pixelDaTela = () => (innerWidth > 1050 ? 4 : 3);

// Curva de Bézier cúbica entre pontos { x, y }.
function bezier(a, b, c, d, t) {
  const m = 1 - t;
  const k0 = m * m * m, k1 = 3 * m * m * t, k2 = 3 * m * t * t, k3 = t * t * t;
  return { x: k0 * a.x + k1 * b.x + k2 * c.x + k3 * d.x, y: k0 * a.y + k1 * b.y + k2 * c.y + k3 * d.y };
}

// ---------- o ator ----------

// Recria o ator (mudou o pixel, a densidade da tela ou o movimento reduzido) com o mesmo estado à vista.
function remontar() {
  if (!sprite) return;
  const velho = ator;
  const pendente = velho?.golpeando ? impactoPendente : null;
  ator = montar(sprite, { pixel: pixelDaTela(), reduzido: reduzido() });
  if (velho) {
    const { maco, pulo, recuo, ...resto } = velho.estado;
    ator.definir(resto);
  }
  vestir(ator);
  // O golpe não recomeça no ator novo: se o impacto ainda não tinha acontecido, acontece agora (uma vez).
  pendente?.();
  posicionar();
}

// Guarda o impacto do golpe em curso, para a remontagem no meio de um golpe não engolir o impacto.
function vestir(a) {
  const golpear = a.golpear;
  a.golpear = function (aoImpacto) {
    let bateu = false;
    impactoPendente = () => {
      if (bateu) return;
      bateu = true;
      aoImpacto?.();
    };
    return golpear.call(this, impactoPendente);
  };
}

// ---------- geometria ----------

// Largura útil da janela (sem a calha da barra de rolagem) e altura.
export function tamanhoDaTela() {
  return { largura: Math.min(document.documentElement.clientWidth, document.body.clientWidth || Infinity), altura: innerHeight };
}

// Limites do companheiro: o canvas do sprite fica a 8 px das laterais, 90 do topo e 16 da base.
export function limitar(p) {
  if (!ator) return p;
  const { largura, altura } = tamanhoDaTela();
  const t = ator.ponta();
  return {
    x: Math.min(largura - 8 - (ator.largura - t.x), Math.max(8 + t.x, p.x)),
    y: Math.min(altura - 16 - (ator.altura - t.y), Math.max(90 + t.y, p.y)),
  };
}

// Descanso: o canvas a 22 px da borda direita, a ponta a 54% da altura.
export function descanso() {
  const { largura, altura } = tamanhoDaTela();
  if (!ator) return { x: largura - 60, y: altura * 0.54 };
  const t = ator.ponta();
  return limitar({ x: largura - 22 - ator.largura + t.x, y: altura * 0.54 });
}

// Deslocamento horizontal (px CSS) da ponta em relação a "olhando à direita", para a direção dada.
function deslocamentoDaPonta(dir) {
  return (pontaDoSprite(dir).x - PONTA.x) * (ator?.pixel ?? 4);
}

// Converte um ponto pensado "olhando à esquerda" para a direção atual (o corpo fica no mesmo lugar).
export function deOlharEsquerda(p) {
  const dir = ator?.estado.dir ?? -1;
  return { x: p.x - deslocamentoDaPonta(-1) + deslocamentoDaPonta(dir), y: p.y };
}

// Ponta para ele sentar com os pés centrados em xPes e o assento na altura yBorda (px de viewport).
export function sentarEm(xPes, yBorda) {
  if (!ator) return { x: xPes, y: yBorda };
  const t = ator.ponta(), s = ator.assento();
  return { x: xPes + t.x - s.x, y: yBorda + t.y - s.y };
}

// Vira mantendo o corpo no lugar: a ponta troca de lado. Devolve se virou.
export function virar(dir) {
  if (!ator || ator.estado.dir === dir) return false;
  ponto = { x: ponto.x - deslocamentoDaPonta(ator.estado.dir) + deslocamentoDaPonta(dir), y: ponto.y };
  ator.definir({ dir });
  posicionar();
  return true;
}

// O canto do canvas cai num px de dispositivo inteiro: o sprite nunca borra nem treme 1 px ao voar.
function posicionar() {
  if (!ator || !botao) return;
  const t = ator.ponta();
  const x = encaixar(ponto.x - t.x), y = encaixar(ponto.y - t.y);
  botao.style.transform = `translate(${x}px, ${y}px)`;
  if (falaRestante > 0) posicionarBalao(x, y);
}

// O balão fica 8 px acima do canvas, centrado no sprite mas dentro da largura útil; o rabicho aponta para os pés.
// Deslocamento inteiro (nada de translateY(-100%) numa altura de 31,8 px): as bordas do painel ficam nítidas.
function posicionarBalao(x, y) {
  const largura = balao.offsetWidth;
  const util = ativo ? tamanhoDaTela().largura : camada.clientWidth;
  const bx = encaixar(entre(x + ator.largura / 2 - largura / 2, 8, Math.max(8, util - largura - 8)));
  balao.style.transform = `translate(${bx}px, ${encaixar(y - 8 - balao.offsetHeight)}px)`;
  balao.style.setProperty('--rabicho', `${Math.round(entre(x + ator.pes().x - bx, 9, largura - 9))}px`);
}

// ---------- fala ----------

// Texto com links {{palavras|url}}: o balão mostra as palavras como link. Ele é aria-hidden e passageiro, então os
// links ficam fora da ordem do Tab (o mesmo destino sempre existe em outro lugar da página).
function preencherBalao(texto) {
  balao.replaceChildren();
  for (const parte of texto.split(/(\{\{[^}]+\}\})/)) {
    const link = parte.match(/^\{\{([^|}]+)\|([^}]+)\}\}$/);
    // Só http(s) e mailto viram link: as falas são do site, mas um esquema estranho nunca chega a ser clicável.
    if (!link || !/^(https?:|mailto:)/i.test(link[2])) { if (parte) balao.append(link ? link[1] : parte); continue; }
    const a = document.createElement('a');
    a.href = link[2];
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.tabIndex = -1;
    a.textContent = link[1];
    balao.append(a);
  }
}

const semLinks = texto => texto.replace(/\{\{([^|}]+)\|[^}]+\}\}/g, '$1');
// Numa lista, cada fala dura o tempo de ler: 1 s + 1 s a cada 14 letras, entre 2,2 e 6 s (10 s se tem link).
const tempoDeLeitura = texto => Math.min(/\{\{/.test(texto) ? 10 : 6, Math.max(2.2, 1 + semLinks(texto).length / 14));

export function falar(texto, segundos = 2.8) {
  if (!balao) return;
  const lista = Array.isArray(texto) ? texto.filter(Boolean) : [texto];
  if (!lista.length || !lista[0]) return;
  fila = Array.isArray(texto) ? lista.map(t => ({ texto: t, segundos: tempoDeLeitura(t) })) : [{ texto, segundos }];
  proximaFala();
  acordar();
}

// A caixa de conversa (Fase 2) pode tomar a fala: com ela aberta, o que ele diria no balão vai para lá, no mesmo
// ritmo da fila. `fn(texto com {{links}}, segundos)` devolve true quando ficou com a fala.
let desvio = null;
export function desviarFala(fn) {
  desvio = fn;
  return () => { if (desvio === fn) desvio = null; };
}

function proximaFala() {
  const fala = fila.shift();
  if (!fala) { calar(); return; }
  falaRestante = fala.segundos;
  if (desvio?.(fala.texto, fala.segundos)) { balao.classList.remove('falando'); return; }
  preencherBalao(fala.texto);
  balao.classList.add('falando');
  posicionar();
}

export function calar() {
  fila = [];
  falaRestante = 0;
  balao?.classList.remove('falando');
}

// ---------- trabalhos ----------
// trabalho = { nome, prioridade, alvo() → {x,y} | null, livre?, meta?, contorno?, chegou?(), quadro?(dt), perdeu?() }
// A cada quadro ele atende o de maior prioridade cujo alvo() não é null (empate: fica com o que já tem). Ver
// docs/arquitetura.md §5. `contorno` (opcional): cor do anel que ele ganha enquanto está no alvo, para não sumir
// sobre um fundo do mesmo bronze (a placa).

export function trabalho(t) {
  trabalhos.add(t);
  acordar();
  return {
    soltar: () => {
      if (atual === t) largar();
      trabalhos.delete(t);
      acordar();
    },
  };
}

function largar() {
  const t = atual;
  atual = null;
  ali = false;
  voo = null;
  botao.classList.remove('voando');
  ator?.definir({ sentado: false, contorno: null, dormindo: false, passos: 0 });
  t?.perdeu?.();
}

export const livre = () => ativo && pronto && !reduzido() && !atual && ![...trabalhos].some(t => t.alvo() !== null);

// Recado: trabalho de prioridade 10, aceito só com o mascote livre. Termina com fimDoRecado(), quando outro trabalho
// toma a vez ou quando alvo() devolve null; em todos os casos `perdeu()` é chamado uma vez.
export function recado(r) {
  if (!livre()) return false;
  let fim = false;
  const encerrar = () => {
    if (fim) return;
    fim = true;
    if (recadoAtual?.r === r) recadoAtual = null;
    registro.soltar();
    r.perdeu?.();
  };
  const registro = trabalho({
    nome: r.nome ?? 'recado',
    prioridade: 10,
    alvo: () => r.alvo(),
    get livre() { return r.livre; },
    get meta() { return r.meta; },
    get contorno() { return r.contorno; },
    chegou: () => r.chegou?.(),
    quadro: dt => r.quadro?.(dt),
    perdeu: encerrar,
  });
  recadoAtual = { r, encerrar };
  return true;
}

export function fimDoRecado() {
  recadoAtual?.encerrar();
}

// Partes que rodam no relógio do mascote (jogos, segredos): { quadro(dt), ocupado() }.
export function extra(parte) {
  extras.add(parte);
  acordar();
  return () => extras.delete(parte);
}

export function aoFicarPronto(fn) {
  if (pronto) fn();
  else quandoPronto.push(fn);
}

function escolher() {
  let melhor = null, alvo = null;
  for (const t of trabalhos) {
    const p = t.alvo();
    if (p && (!melhor || t.prioridade > melhor.prioridade || (t.prioridade === melhor.prioridade && t === atual))) {
      melhor = t;
      alvo = p;
    }
  }
  if (melhor !== atual) {
    if (atual) largar();
    atual = melhor;
    ali = false;
    voo = null;
    metaAtual = melhor?.meta;
  }
  return alvo;
}

// ---------- voo do companheiro ----------

// Vira antes de sair se o alvo está do outro lado (0,16 s); depois uma curva que sobe num arco e persegue o alvo
// de agora (ele pode estar rolando com a página).
function criarVoo(alvo) {
  const dx = alvo.x - ponto.x;
  const virou = Math.abs(dx) > 6 && virar(dx < 0 ? -1 : 1);
  const de = { ...ponto };
  voo = { de, t: virou ? -0.16 : 0, duracao: 0.55 + Math.min(0.55, Math.hypot(alvo.x - de.x, alvo.y - de.y) / 1100) };
  botao.classList.add('voando');
}

// Devolve true ao chegar.
function voar(dt, alvo) {
  voo.t += dt;
  if (voo.t < 0) {
    ator.definir({ asas: 'lentas', sentado: false });
    return false;
  }
  ator.definir({ asas: 'rapidas', sentado: false });
  const u = Math.min(1, voo.t / voo.duracao);
  const { de } = voo;
  const dx = alvo.x - de.x, dy = alvo.y - de.y;
  const arco = Math.min(85, Math.hypot(dx, dy) * 0.18);
  const c1 = { x: de.x + dx * 0.32, y: de.y + dy * 0.24 - arco };
  const c2 = { x: alvo.x - dx * 0.22, y: alvo.y - dy * 0.2 - arco * 0.6 };
  ponto = bezier(de, c1, c2, alvo, suave(u));
  if (u < 1) return false;
  voo = null;
  return true;
}

function ficarPronto() {
  if (!estacionando) return;
  estacionando = false;
  pronto = true;
  document.body.classList.add('completo');
  for (const fn of quandoPronto.splice(0)) fn();
}

function companheiro(dt) {
  const parado = reduzido();
  // Estacionando (a primeira ida ao descanso), nenhum trabalho o desvia: ele só fica pronto lá.
  const alvoDoTrabalho = estacionando ? null : escolher();
  if (atual && atual.meta !== metaAtual) {
    metaAtual = atual.meta;
    ali = false;
    voo = null;
  }
  const alvo = alvoDoTrabalho ? (atual.livre ? alvoDoTrabalho : limitar(alvoDoTrabalho)) : descanso();

  // Movimento reduzido: sem voo, ele aparece no alvo.
  if (parado) {
    voo = null;
    botao.classList.remove('voando');
    ponto = alvo;
    if (atual) {
      if (!ali) { ali = true; atual.chegou?.(); }
      atual.quadro?.(dt);
    } else {
      virar(-1);
      ponto = descanso();
      ator.definir({ asas: 'fechadas', sentado: false });
      ficarPronto();
    }
    return;
  }

  // No trabalho, gruda no alvo (acompanha a rolagem) e deixa o trabalho mexer no ator.
  if (atual && ali) {
    ponto = alvo;
    atual.quadro?.(dt);
    return;
  }

  if (!voo && Math.hypot(alvo.x - ponto.x, alvo.y - ponto.y) > 2) criarVoo(alvo);
  if (voo && !voar(dt, alvo)) return;

  ponto = alvo;
  botao.classList.remove('voando');
  if (atual) {
    ali = true;
    ator.definir({ asas: 'batendo' });
    atual.chegou?.();
    atual.quadro?.(dt);
    return;
  }
  // Em casa: olha para a página, asas devagar.
  virar(-1);
  ator.definir({ asas: 'lentas', sentado: false });
  ficarPronto();
}

// ---------- o laço ----------

function quadro(dt) {
  if (!ator || (!diretor && !ativo)) return false;
  const parado = reduzido();
  if (diretor) diretor(dt);
  else if (ativo) {
    companheiro(dt);
    // O anel do trabalho que pede `contorno` só aparece depois que ele chega (no voo de ida, não).
    if (atual && 'contorno' in atual) ator.definir({ contorno: (ali && atual.contorno) || null });
  }
  let ocupado = false;
  for (const parte of extras) {
    parte.quadro?.(dt);
    if (parte.ocupado?.()) ocupado = true;
  }
  // Parado (movimento reduzido), o relógio do ator não anda: sem asas, piscar nem pulinho. Só um golpe pedido
  // termina, para quem espera o impacto não ficar esperando para sempre.
  ator.avancar(parado && !ator.golpeando ? 0 : dt);
  ator.pintar();
  posicionar();
  if (falaRestante > 0 && (falaRestante -= dt) <= 0) proximaFala();
  return !parado || !!diretor || falaRestante > 0 || ocupado || ator.golpeando;
}

function ligarLaco() {
  laco ??= registrar(quadro);
  acordar();
}

// Uso do herói: durante o prólogo e a escultura, `fn(dt)` roda no começo de cada quadro do mascote (antes do ator
// avançar e ser pintado) e o posiciona com `colocar`. `dirigir(null)` encerra o show.
export function dirigir(fn) {
  diretor = fn;
  if (fn) ligarLaco();
}

// Uso do herói: põe a ponta em p (px da camada) já neste quadro.
export function colocar(p) {
  ponto = { x: p.x, y: p.y };
  posicionar();
}

// Vira companheiro: a camada vai para o fim do body e fica fixa, o ponto passa a ser da janela (sem salto visível)
// e ele voa ao descanso. Lá fica pronto. Com movimento reduzido, vai direto e fica parado.
export function virarCompanheiro(pontoInicial) {
  if (!camada || !ator || ativo) return;
  const caixa = camada.getBoundingClientRect();
  const inicio = pontoInicial ?? { x: ponto.x + caixa.left, y: ponto.y + caixa.top };
  const comFoco = document.activeElement === botao;
  diretor = null;
  document.body.append(camada);
  camada.classList.add('companheiro');
  if (comFoco) botao.focus({ preventScroll: true });
  botao.disabled = false;
  calar();
  ativo = true;
  estacionando = true;
  voo = null;
  ponto = { ...inicio };
  ator.definir({ sentado: false });
  if (reduzido()) companheiro(0);
  posicionar();
  ligarLaco();
}

// ---------- entradas ----------

function aoCutucar(evento) {
  if (!ator) return;
  if (!reduzido()) ator.pular();
  acordar();
  // A conversa (Fase 2) marca `atendido` quando o clique é dela; sem ninguém, ele reclama das cócegas.
  const detalhe = { teclado: evento.detail === 0, pronto };
  emitir('cutucar', detalhe);
  if (!detalhe.atendido) falar(COCEGAS[cocegas++ % COCEGAS.length]);
}

// Esc: quem fecha alguma coisa com ele (a caixa aberta, um jogo) cancela o evento. Sobrando, o companheiro larga o
// recado, volta para casa e se cala.
function aoTeclar(evento) {
  if (evento.key !== 'Escape' || !ativo) return;
  setTimeout(() => {
    if (evento.defaultPrevented) return;
    calar();
    fimDoRecado();
  });
}

function aoRedimensionar() {
  if (!ator) return;
  if (ator.pixel !== pixelDaTela()) remontar();
  if (ativo) voo = null;   // o descanso e os alvos mudaram de lugar
  posicionar();
  acordar();
}

// O dpr muda com zoom ou ao arrastar a janela para outro monitor: o sprite é refeito na densidade nova.
function vigiarDensidade() {
  matchMedia(`(resolution: ${dpr()}dppx)`).addEventListener('change', () => {
    remontar();
    acordar();
    vigiarDensidade();
  }, { once: true });
}

export function iniciar() {
  if (!sprite || !camada || !balao) return;
  remontar();
  botao.addEventListener('click', aoCutucar);
  addEventListener('keydown', aoTeclar);
  addEventListener('resize', aoRedimensionar);
  addEventListener('scroll', acordar, { passive: true });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) acordar(); });
  aoMudar(parado => {
    remontar();
    voo = null;
    if (!parado && ativo && !atual) ator.definir({ asas: 'lentas' });
    acordar();
  });
  vigiarDensidade();
}

// Leitura do estado para as outras partes (somente leitura).
export const mascote = {
  get ator() { return ator; },
  get ativo() { return ativo; },
  get pronto() { return pronto; },
  get ponto() { return { ...ponto }; },
  get falando() { return falaRestante > 0; },
  get trabalhoAtual() { return atual?.nome ?? null; },
  botao, sprite, camada, balao,
};
