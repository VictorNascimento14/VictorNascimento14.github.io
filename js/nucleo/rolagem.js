// A rolagem da página. Duas coisas moram aqui:
//  - a trava da primeira tela, que segura o visitante enquanto o escultor trabalha (o herói decide quando prender);
//  - a rolagem paginada: um gesto de roda (ou uma tecla, ou um link #) leva a uma parada, numa mola criticamente
//    amortecida. O dedo e a barra de rolagem ficam com o ímã do CSS (scroll-snap).
// Contrato em docs/arquitetura.md §6; números da spec 01 §6.17–6.18 e spec 08 §5.3.
import { registrar, acordar } from './relogio.js';
import { reduzido } from './movimento.js';

const raiz = document.documentElement;
const OMEGA = 7;            // 1/s: 90% do caminho em ~0,55 s, parada em ~1 s
const TETO_DA_TRAVA = 90;   // s de aba visível: ninguém fica preso para sempre

let travada = false;
let segundosPresa = 0;
let relogioDaTrava = 0;
let tentativas = [];
let toqueY = null;
let toqueContou = false;

// A mola: y(t) = alvo + (a + b·t)·e^(−ωt). `aplicado` é o último scrollY que ela mesma pôs.
let mola = null;
let gesto = null;

const ligada = () => !travada && !reduzido();

// ---------- a trava da primeira tela ----------

export const presa = () => travada;

export function prender() {
  if (travada || reduzido()) return;
  travada = true;
  raiz.classList.add('rolagem-presa');
  // Só com a página presa o arrasto precisa ser cancelável: fora disso o touchmove fica passivo (rolagem fluida).
  addEventListener('touchmove', aoArrastar, { passive: false });
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  pararDeslize();
  scrollTo({ top: 0, behavior: 'instant' });
  segundosPresa = 0;
  relogioDaTrava = setInterval(() => {
    if (!document.hidden && ++segundosPresa >= TETO_DA_TRAVA) soltar();
  }, 1000);
}

export function soltar() {
  if (!travada) return;
  travada = false;
  raiz.classList.remove('rolagem-presa');
  removeEventListener('touchmove', aoArrastar, { passive: false });
  clearInterval(relogioDaTrava);
  if ('scrollRestoration' in history) history.scrollRestoration = 'auto';
}

// Quem quer saber das tentativas de descer com a página presa (o herói: o PUXAR pula ou o escultor reclama).
export function aoTentarDescer(fn) {
  tentativas.push(fn);
  return () => { tentativas = tentativas.filter(f => f !== fn); };
}

function tentouDescer() {
  for (const fn of tentativas) fn();
}

// ---------- paradas ----------

const maximo = () => Math.max(0, raiz.scrollHeight - innerHeight);

// Topo de cada tela; numa tela mais alta que a janela (por mais que o próprio respiro de baixo), passos iguais de
// até 85% da janela até a base dela encostar na base da janela; e o fim da página.
export function paradas() {
  const vh = innerHeight, fim = maximo();
  const lista = [fim];
  for (const tela of document.querySelectorAll('main > .tela')) {
    const topo = tela.getBoundingClientRect().top + scrollY;
    const sobra = tela.offsetHeight - vh;
    lista.push(topo);
    if (sobra > parseFloat(getComputedStyle(tela).paddingBottom)) {
      const n = Math.ceil(sobra / (0.85 * vh));
      for (let i = 1; i <= n; i++) lista.push(topo + (sobra * i) / n);
    }
  }
  const ordenadas = lista.map(y => Math.round(Math.min(fim, Math.max(0, y)))).sort((a, b) => a - b);
  return ordenadas.reduce((unicas, y) => {
    if (!unicas.length || y - unicas[unicas.length - 1] > 2) unicas.push(y);
    return unicas;
  }, []);
}

// ---------- o deslize ----------

function estadoDaMola(t) {
  const e = Math.exp(-OMEGA * t);
  return { y: mola.alvo + (mola.a + mola.b * t) * e, v: (mola.b - OMEGA * (mola.a + mola.b * t)) * e };
}

// Um empurrão novo no meio do caminho parte da posição e da velocidade de agora: nada de tranco.
function deslizarPara(alvo) {
  alvo = Math.round(Math.min(maximo(), Math.max(0, alvo)));
  const agora = performance.now();
  let y = scrollY, v = 0;
  if (mola) ({ y, v } = estadoDaMola(Math.max(0, (agora - mola.t0) / 1000)));
  else if (Math.abs(alvo - y) < 1) return;
  mola = { alvo, t0: agora, a: y - alvo, b: v + OMEGA * (y - alvo), aplicado: scrollY };
  raiz.classList.add('deslizando');
  acordar();
}

function pararDeslize() {
  mola = null;
  raiz.classList.remove('deslizando');
}

function aplicar(y) {
  scrollTo({ top: y, behavior: 'instant' });
  mola.aplicado = scrollY;
}

// Tarefa do relógio: a mola anda; se outra coisa mexeu na página (barra, dedo, busca), ela solta na hora.
function deslizar(dt, agora) {
  if (!mola) return false;
  if (Math.abs(scrollY - mola.aplicado) > 2) { pararDeslize(); return false; }
  const { y, v } = estadoDaMola(Math.max(0, (agora - mola.t0) / 1000));
  if (Math.abs(y - mola.alvo) < 1 && Math.abs(v) < 30) {
    aplicar(mola.alvo);
    pararDeslize();
    return false;
  }
  aplicar(y);
  return true;
}

// Uma parada para baixo (1) ou para cima (−1). Já deslizando no mesmo sentido, conta a partir do alvo.
export function passo(dir) {
  const ref = mola && Math.sign(mola.alvo - scrollY) === dir ? mola.alvo : scrollY;
  const lista = paradas();
  const alvo = dir > 0 ? lista.find(y => y > ref + 2) : lista.findLast(y => y < ref - 2);
  if (alvo !== undefined) deslizarPara(alvo);
}

export function irPara(y) {
  if (travada) return;
  if (reduzido()) scrollTo({ top: y, behavior: 'instant' });
  else deslizarPara(y);
}

// ---------- entradas ----------

// Roda e touchpad: um gesto = uma parada. A cauda de inércia do touchpad não conta como gesto novo; um empurrão
// forte depois que a cauda caiu abaixo da metade do pico, sim.
function aoRodar(e) {
  if (travada) { if (e.deltaY > 0) tentouDescer(); return; }
  if (reduzido() || e.ctrlKey || e.defaultPrevented || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
  e.preventDefault();
  const dy = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? innerHeight : 1);
  const forca = Math.abs(dy);
  const novo = !gesto || e.timeStamp - gesto.ultimo > 180 ||
    (gesto.gasto && gesto.menor < gesto.pico / 2 && forca > Math.max(20, 3 * gesto.menor));
  if (novo) gesto = { soma: 0, gasto: false, pico: 0, menor: Infinity };
  gesto.ultimo = e.timeStamp;
  if (forca > gesto.pico) { gesto.pico = forca; gesto.menor = forca; } else gesto.menor = Math.min(gesto.menor, forca);
  if (gesto.gasto) return;
  gesto.soma += dy;
  if (Math.abs(gesto.soma) >= 30) {
    gesto.gasto = true;
    passo(Math.sign(gesto.soma));
  }
}

const editavel = el => el?.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el?.tagName ?? '');
const ehBotao = el => !!el?.closest?.('button, summary, [role="button"]');

// Com uma janela ou um jogo modal aberto, as teclas de página são dele: rolar o fundo por trás tiraria o foco de vista.
const modalAberto = alvo => raiz.classList.contains('janela-aberta') || raiz.classList.contains('jogo-aberto')
  || !!alvo?.closest?.('[aria-modal="true"]');

function aoTeclar(e) {
  if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || editavel(e.target) || modalAberto(e.target)) return;
  const espaco = e.key === ' ' && !ehBotao(e.target);
  if (travada) {
    const desce = e.key === 'ArrowDown' || e.key === 'PageDown' || e.key === 'End' || espaco;
    // Mesmo com overflow escondido o Chrome rola a página pelo teclado: com a trava, as teclas de rolagem não passam.
    if (desce || e.key === 'ArrowUp' || e.key === 'PageUp' || e.key === 'Home') e.preventDefault();
    if (desce) tentouDescer();
    return;
  }
  if (reduzido()) return;
  let dir = 0;
  if (e.key === 'ArrowDown' || e.key === 'PageDown') dir = 1;
  else if (e.key === 'ArrowUp' || e.key === 'PageUp') dir = -1;
  else if (espaco) dir = e.shiftKey ? -1 : 1;
  else if (e.key !== 'Home' && e.key !== 'End') return;
  e.preventDefault();
  if (e.repeat && mola) return;   // tecla segurada: um passo por vez
  if (dir) { passo(dir); return; }
  const lista = paradas();
  deslizarPara(e.key === 'Home' ? lista[0] : lista[lista.length - 1]);
}

// Links internos (#âncora): desliza até a última parada que mostra o alvo pelo topo e atualiza o endereço.
function aoClicar(e) {
  if (!ligada() || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const link = e.target.closest?.('a[href^="#"]');
  const id = link && decodeURIComponent(link.hash.slice(1));
  const alvo = id && document.getElementById(id);
  if (!alvo) return;
  e.preventDefault();
  const topo = alvo.getBoundingClientRect().top + scrollY;
  deslizarPara(paradas().findLast(y => y <= topo + 2) ?? 0);
  if (location.hash !== link.hash) history.pushState(null, '', link.hash);
}

// Com a página presa, alguns navegadores de celular rolam mesmo com overflow escondido: o arrasto de um dedo é
// cancelado (por isso o ouvinte não é passivo) e um puxão para cima de mais de 24 px conta uma tentativa por gesto.
function aoTocar(e) {
  if (e.touches.length !== 1) return;
  toqueY = e.touches[0].clientY;
  toqueContou = false;
}

function aoArrastar(e) {
  if (!travada || e.touches.length !== 1) return;
  e.preventDefault();
  if (!toqueContou && toqueY !== null && toqueY - e.touches[0].clientY > 24) {
    toqueContou = true;
    tentouDescer();
  }
}

export function iniciar() {
  addEventListener('wheel', aoRodar, { passive: false });
  addEventListener('keydown', aoTeclar);
  addEventListener('click', aoClicar);
  addEventListener('touchstart', aoTocar, { passive: true });
  // Válvulas da trava: um erro de script ou o foco (Tab) saindo da primeira tela soltam a página.
  addEventListener('error', soltar);
  addEventListener('unhandledrejection', soltar);
  document.addEventListener('focusin', e => {
    if (travada && !document.querySelector('main > .tela')?.contains(e.target)) soltar();
  });
  registrar(deslizar);
}
