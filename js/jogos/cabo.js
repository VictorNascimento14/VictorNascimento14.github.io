// O cabo de guerra na areia do Coliseu (spec 04 §1.7, §2.5, §4.9, §5.10, §6.7). Com os gladiadores frente a frente,
// uma corda frouxa fica na areia entre eles; apontada, a metade sob o ponteiro levanta e serpenteia ("puxa pelo
// LinkedIn"). Tocada, aquele lado é do visitante e o escultor puxa pelo outro: "3 2 1 PUXA!" e, por 10 s, cada toque,
// clique ou Espaço traz o nó um pouco. Quem trouxer o nó 22 puxões para o seu lado ganha (ou quem estiver na frente
// quando o tempo acaba). Vencer dá `cabo`, que libera o elmo no inventário.
//
// Durante a partida o quadro da arena é deste módulo (arena.jogo); a corda é desenhada na areia por arena.pintar.
import { registrar, acordar } from '../nucleo/relogio.js';
import { limitar, suave } from '../nucleo/pixel.js';
import { reduzido } from '../nucleo/movimento.js';
import { MACO } from '../arte/escultor.js';
import { mascote, falar } from '../mascote.js';
import { arena, pronta, posicionar, redesenhar, andarAte, soltarMascote } from '../secoes/arena.js';
import { desbloquear, placar, jogo as registrarJogo, ir } from './conquistas.js';

const TEMPO = 10;          // s de puxões
const VANTAGEM = 22;       // puxões de vantagem que encerram antes do tempo
const RITMO = 6.6;         // puxadas por segundo do escultor, em média (oscila 1,1 e arranca +0,9 nos 2 s finais)
const COR = {
  corda: '#8a6a3e', cordaEscura: '#5c4427', acesa: '#b08752', acesaEscura: '#7a5a34', risca: '#c4a874', pano: '#a8432c',
};
const FALAS = {
  comeco: 'Segura firme!',
  dica: 'A corda tá ali na areia. Toca numa metade.',
  venceu: ['Mais forte.', 'Tá, você é mais forte!'],
  perdeu: ['{Metal} é {pesado}.', 'Ganhei! {Metal} é {pesado}!'],
  empate: ['Empate.', 'Empate. Corda boa!'],
};
const umaCasa = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });

let jogo = null;             // a partida em curso (ver comecar)
let ponteiro = null, foco = null;   // o rival cuja metade da corda está sob o ponteiro / com o foco
let dica = 0;                // s de dica pedida pelo medalheiro: a corda inteira serpenteia e os alvos piscam
let pendente = null;         // s até a dica, contados só com a arena pronta e livre
let el = null;

const apontada = () => ponteiro ?? foco;
const outroRival = r => arena.rivais.find(x => x !== r);
const livreParaJogar = () => !jogo && !arena.jogo && arena.rivais.length === 2 && !!arena.geo && pronta();

// O escultor é de bronze até virar prata ou ouro: "Bronze é pesado.", "Prata é pesada."
function doMetal(texto) {
  const metal = document.documentElement.dataset.metal;
  const [nome, pesado] = metal === 'prata' ? ['Prata', 'pesada'] : metal === 'ouro' ? ['Ouro', 'pesado'] : ['Bronze', 'pesado'];
  return texto.replace('{Metal}', nome).replace('{pesado}', pesado);
}

function lerPlacar() {
  const p = placar('cabo') ?? {};
  const n = v => (Number.isInteger(v) && v > 0 ? v : 0);
  return { v: n(p.v), d: n(p.d), best: Number.isFinite(p.best) && p.best > 0 ? p.best : 0, jogou: !!p.jogou };
}

// Um quadrado (ou retângulo) em px de palco, com as bordas no pixel de dispositivo: a corda nítida em qualquer dpr.
function bloco(ctx, k, x, y, w, h = w) {
  const x0 = Math.round(x * k), y0 = Math.round(y * k);
  ctx.fillRect(x0, y0, Math.round((x + w) * k) - x0, Math.round((y + h) * k) - y0);
}

// ---------- a corda na areia ----------

// Frouxa, entre os dois, sobre a risca do meio, com o pano vermelho no centro. A metade apontada (ou as duas, durante
// a dica) acende, levanta 0,6 px de sprite e serpenteia; com movimento reduzido só acende.
function cordaFrouxa(ctx, k) {
  const { P, cx, chao } = arena.geo;
  const s = Math.max(2, Math.round(P / 2));
  const agora = performance.now() / 1000;
  const parado = reduzido();
  ctx.fillStyle = COR.risca;
  for (let i = 0; i < 4; i++) bloco(ctx, k, cx - s / 2, chao - P + i * s, s);
  const amostras = Math.ceil(52 * P / (0.8 * s));
  for (let i = 0; i <= amostras; i++) {
    const u = i / amostras;
    const lado = u < 0.5 ? 1 : -1;   // a metade esquerda é do rival que olha para a direita
    const acesa = dica > 0 || apontada()?.dir === lado;
    const ergue = acesa && !parado ? Math.sin(agora * 9 + u * 14) * 0.5 * P - 0.6 * P : 0;
    const x = cx - 26 * P + u * 52 * P;
    const y = chao + 0.4 * P + Math.sin(u * 2.5 * Math.PI + 0.6) * 0.45 * P + ergue;
    const escura = Math.floor(i / 2) % 2 === 1;
    ctx.fillStyle = acesa ? (escura ? COR.acesaEscura : COR.acesa) : (escura ? COR.cordaEscura : COR.corda);
    bloco(ctx, k, x - s / 2, y - s / 2, s);
  }
  const my = chao + 0.4 * P + Math.sin(1.25 * Math.PI + 0.6) * 0.45 * P;
  ctx.fillStyle = COR.pano;
  bloco(ctx, k, cx - s, my - s / 2, 2 * s, s);
  bloco(ctx, k, cx - s / 2, my + 1.5 * s, s);
}

// Tensa, de mão em mão, com uma barriga leve e o pano no meio: a risca da areia fica, e o pano anda em relação a ela.
function cordaTensa(ctx, k) {
  const { P, cx, chao } = arena.geo;
  const s = Math.max(2, Math.round(P / 2));
  // As mãos; quem senta na areia desce 2 px de sprite, e a corda desce com ele.
  const [a, b] = arena.rivais.map(r => ({
    x: r.x + 5 * P * r.dir,
    y: chao - 7 * P - Math.round(Math.sin(r.puxao * Math.PI) * 1.5 * P) + (jogo?.sentado === r ? 2 * P : 0),
  }));
  ctx.fillStyle = COR.risca;
  for (let i = 0; i < 4; i++) bloco(ctx, k, cx - s / 2, chao - 2 * P + i * s, s);
  const amostras = Math.max(2, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / (0.8 * s)));
  for (let i = 0; i <= amostras; i++) {
    const u = i / amostras;
    ctx.fillStyle = Math.floor(i / 2) % 2 ? COR.cordaEscura : COR.corda;
    bloco(ctx, k, a.x + (b.x - a.x) * u - s / 2, a.y + (b.y - a.y) * u + Math.sin(u * Math.PI) * 0.6 * P - s / 2, s);
  }
  const meio = (a.x + b.x) / 2, my = (a.y + b.y) / 2 + 0.6 * P;
  ctx.fillStyle = COR.pano;
  bloco(ctx, k, meio - s, my, 2 * s, s);
  bloco(ctx, k, meio - s / 2, my + 2 * s, s);
}

// arena.pintar: chamado a cada redesenho da arena, depois da areia e antes dos gladiadores.
function pintar(ctx, k) {
  posicionarAlvos();
  if (arena.rivais.length !== 2 || !arena.geo) return;
  if (jogo) { if (jogo.fase !== 'volta') cordaTensa(ctx, k); }
  else if (pronta() && !arena.jogo) cordaFrouxa(ctx, k);
}

// ---------- alvos e etiqueta ----------

// Uma metade da corda por botão: de cx − 26 px de sprite (ou de cx) e do chão − 3 ao chão + 5 (o original usava 7 de
// altura; com o pixel do celular dava 21 px de alvo, menos que os 24 de um toque confortável).
function caixaDaMetade(r) {
  const { P, cx, chao } = arena.geo;
  return { x: r.dir > 0 ? cx - 26 * P : cx, y: chao - 3 * P, largura: 26 * P, altura: 8 * P };
}

function posicionarAlvos() {
  if (!el) return;
  el.alvos.classList.toggle('ligado', livreParaJogar());
  if (!arena.geo) return;
  for (const { botao, rival } of el.metades) {
    const c = caixaDaMetade(rival);
    const estilo = { left: `${Math.round(c.x)}px`, top: `${Math.round(c.y)}px`, width: `${Math.round(c.largura)}px`, height: `${Math.round(c.altura)}px` };
    for (const [chave, valor] of Object.entries(estilo)) if (botao.style[chave] !== valor) botao.style[chave] = valor;
  }
  const r = apontada();
  if (r && !jogo) {
    const c = caixaDaMetade(r);
    el.etiqueta.textContent = `puxa pelo ${r.rede.nome}`;
    el.etiqueta.style.left = `${Math.round(c.x + c.largura / 2)}px`;
    el.etiqueta.style.top = `${Math.round(c.y + c.altura + 8)}px`;
  }
  el.etiqueta.hidden = !r || !!jogo || !livreParaJogar();
}

// Apontar muda a corda; com a arena parada o laço dela dorme, então redesenha daqui.
function apontar(tipo, r) {
  if (tipo === 'ponteiro') ponteiro = r; else foco = r;
  redesenhar();
  acordar();
}

// ---------- o placar (HUD) ----------

function posicionarPlacar() {
  const { W, P, cx, chao } = arena.geo;
  const alto = W < 600;   // no celular, no alto do muro: longe do mascote e da fala dele
  el.placar.classList.toggle('no-alto', alto);
  el.placar.style.left = `${Math.round(cx)}px`;
  el.placar.style.top = alto ? '12px' : `${Math.round(chao - 24 * P)}px`;
}

function grande(texto, classe = '') {
  const g = el.grande;
  g.textContent = texto;
  g.className = `cabo-grande ${classe}`.trim();
  if (!texto) return;
  void g.offsetWidth;   // reinicia a batida
  g.classList.add('batida');
}

function relogio(acesas) {
  el.relogio.forEach((i, n) => i.classList.toggle('acesa', n < acesas));
}

function anunciar(texto) {
  el.dito.textContent = texto;
}

// ---------- a partida ----------

const pontoDoCabo = r => arena.geo.cx - r.dir * 22 * arena.geo.P;

export function comecar(rival) {
  if (!livreParaJogar() || !arena.rivais.includes(rival)) return false;
  const outro = outroRival(rival);
  jogo = {
    fase: 'pronto', t: 0, lado: rival, outro,
    no: 0, exibido: 0,               // o nó (+ = para o lado do visitante) e o que se vê dele
    meus: 0, deles: 0, proximo: 0, ultimoToque: null, oscilacao: 6 * Math.random(),
    contagem: 3, de: new Map(arena.rivais.map(r => [r, r.x])), passos: new Map(arena.rivais.map(r => [r, 0])),
    sentado: null, focoNoPlacar: false,
  };
  arena.jogo = { quadro, ocupado: () => true };
  // Sentado no muro, o escultor assiste; no cabo ele é o adversário, e a fala dele no muro cobriria o placar no celular.
  soltarMascote();
  ponteiro = foco = null;
  dica = 0;
  el.alvos.removeAttribute('data-dica');
  for (const r of arena.rivais) {
    r.corda = null;
    r.puxao = 0;
    r.ator.definir({ sentado: false, passos: 0, contorno: null, cinzel: null, maco: MACO.repouso });
  }
  posicionarAlvos();
  posicionarPlacar();
  el.placar.hidden = false;
  el.placar.dataset.fase = 'pronto';
  el.sub.textContent = `você puxa pelo ${rival.rede.nome}`;
  relogio(10);
  grande('3');
  anunciar(`Cabo de guerra. Você puxa pelo ${rival.rede.nome}, o escultor pelo ${outro.rede.nome}. 3.`);
  if (mascote.ativo) falar(FALAS.comeco, 1.6);
  el.puxar.focus({ preventScroll: true });
  placar('cabo', { jogou: true });
  acordar();
  return true;
}

// Um passo de um lado: o nó anda 1 (limitado a ±22) e o gladiador dá um tranco e um passo de perna.
function passo(r, sentido) {
  jogo.no = limitar(jogo.no + sentido, -VANTAGEM, VANTAGEM);
  r.puxao = 1;
  const passos = jogo.passos.get(r) + 1;
  jogo.passos.set(r, passos);
  r.ator.definir({ passos });
  if (Math.abs(jogo.no) >= VANTAGEM) terminar();
}

export function puxar() {
  if (jogo?.fase !== 'puxa') return;
  jogo.meus++;
  jogo.ultimoToque = jogo.t;
  passo(jogo.lado, 1);
}

function terminar() {
  const g = jogo;
  const resultado = g.no > 0 ? 'venceu' : g.no < 0 ? 'perdeu' : 'empate';
  Object.assign(g, { fase: 'fim', t: 0, resultado });
  // O ritmo conta até o último toque (quem ganha antes dos 10 s não é punido pelo tempo que sobrou).
  const segundos = limitar(g.ultimoToque ?? TEMPO, 0.1, TEMPO);
  const ritmo = Math.round(g.meus / Math.max(1, Math.min(TEMPO, segundos)) * 10) / 10;
  const p = lerPlacar();
  const best = Math.max(p.best, ritmo);
  if (resultado === 'venceu') {
    placar('cabo', { v: p.v + 1, best });
    desbloquear('cabo', pontoDoNo());
  } else if (resultado === 'perdeu') placar('cabo', { d: p.d + 1, best });
  else placar('cabo', { best });
  const [titulo, fala] = FALAS[resultado].map(doMetal);
  el.placar.dataset.fase = 'fim';
  grande(titulo, resultado);
  const porSegundo = `${umaCasa.format(ritmo)} ${ritmo === 1 ? 'puxada' : 'puxadas'} por segundo`;
  el.sub.textContent = porSegundo;
  anunciar(`${titulo} ${porSegundo}.`);
  if (mascote.ativo) falar(fala, 2.6);
}

// A moeda nasce no nó: entre os dois gladiadores, na altura das mãos.
function pontoDoNo() {
  const c = arena.palco.getBoundingClientRect();
  const [a, b] = arena.rivais;
  return { x: c.left + (a.x + b.x) / 2, y: c.top + arena.geo.chao - 7 * arena.geo.P };
}

// Volta caminhando (0,6 s) ao ponto do duelo. Esc vale em qualquer fase; antes do fim, nada além de `jogou` fica.
export function fechar() {
  if (!jogo || jogo.fase === 'volta') return;
  jogo.focoNoPlacar = el.placar.contains(document.activeElement);
  Object.assign(jogo, { fase: 'volta', t: 0, sentado: null, de: new Map(arena.rivais.map(r => [r, r.x])) });
  for (const r of arena.rivais) r.ator.definir({ sentado: false, passos: 0 });
  el.placar.hidden = true;
  arena.palco.classList.remove('cabo-puxando');
  acordar();
}

// Encerra na hora, sem caminhar (o duelo de cartas, quando vier, precisa da areia livre).
export function desistir() {
  if (jogo) encerrar();
}

function encerrar() {
  const devolverFoco = jogo.focoNoPlacar || el.placar.contains(document.activeElement);
  jogo = null;
  arena.jogo = null;
  arena.provocacao.em = arena.t + 2.4;
  for (const r of arena.rivais) {
    r.puxao = 0;
    r.x = r.duelX;
    r.ator.definir({ sentado: false, passos: 0 });
  }
  el.placar.hidden = true;
  arena.palco.classList.remove('cabo-puxando');
  posicionar();
  redesenhar();
  if (devolverFoco) el.metades[0]?.botao.focus({ preventScroll: true });
}

// O quadro da arena durante a partida (arena.jogo.quadro).
function quadro(dt) {
  const g = jogo;
  if (!g || !arena.geo) return;
  g.t += dt;
  const { P } = arena.geo;
  for (const r of arena.rivais) r.puxao = Math.max(0, r.puxao - 4 * dt);

  if (g.fase === 'pronto') {
    // 0–0,6 s: cada um anda até o ponto do cabo (8 px de sprite mais afastado que no duelo). Contagem 3, 2, 1.
    const u = suave(Math.min(1, g.t / 0.6));
    for (const r of arena.rivais) andarAte(r, g.de.get(r) + (pontoDoCabo(r) - g.de.get(r)) * u, 'caminhada');
    const n = 3 - Math.floor(g.t);
    if (g.t >= 3) {
      Object.assign(g, { fase: 'puxa', t: 0 });
      el.placar.dataset.fase = 'puxa';
      grande('PUXA!', 'vai');
      anunciar('Puxa! Toque ou aperte espaço sem parar.');
      arena.palco.classList.add('cabo-puxando');
    } else if (n !== g.contagem) {
      g.contagem = n;
      grande(String(n));
      anunciar(String(n));
    }
  } else if (g.fase === 'puxa') {
    // O escultor puxa no ritmo dele: média 6,6 por segundo, oscilando, com arrancada nos 2 s finais.
    const taxa = RITMO + 1.1 * Math.sin(1.6 * g.t + g.oscilacao) + (g.t > 8 ? 0.9 : 0);
    g.proximo -= dt * taxa;
    while (jogo?.fase === 'puxa' && g.proximo <= 0) {
      g.proximo += 0.75 + 0.5 * Math.random();
      g.deles++;
      passo(g.outro, -1);
    }
    if (g.fase === 'puxa') {
      if (g.t >= 0.8 && el.grande.textContent) grande('');
      relogio(Math.ceil(TEMPO - g.t));
      if (g.t >= TEMPO) terminar();
    }
  } else if (g.fase === 'fim') {
    if (!g.sentado && g.resultado !== 'empate' && g.t >= 0.3) sentarPerdedor();
    else if (g.resultado === 'empate' && !g.pulou && g.t >= 0.3) { g.pulou = true; for (const r of arena.rivais) r.ator.pular(); }
    if (g.t >= 3.4) fechar();
  } else if (g.fase === 'volta') {
    const u = suave(Math.min(1, g.t / 0.6));
    for (const r of arena.rivais) andarAte(r, g.de.get(r) + (r.duelX - g.de.get(r)) * u, 'caminhada');
    if (g.t >= 0.6) { encerrar(); return; }
  }

  // Na puxada e no fim, os dois são arrastados juntos até 9 px de sprite para o lado de quem está ganhando.
  g.exibido += (g.no - g.exibido) * (1 - Math.exp(-(reduzido() ? 40 : 12) * dt));
  if (g.fase === 'puxa' || g.fase === 'fim') {
    for (const r of arena.rivais) r.x = pontoDoCabo(r) - g.lado.dir * (g.exibido / VANTAGEM) * 9 * P;
  }
  for (const r of arena.rivais) r.ator.avancar(dt);
  moverAreia(dt);
  posicionar();
  posicionarPlacar();   // a janela pode mudar de tamanho no meio da partida
  // Sentado na areia, o assento (2 px de sprite acima dos pés) desce até o chão.
  if (g.sentado) g.sentado.canvas.style.top = `${parseFloat(g.sentado.canvas.style.top) + 2 * P}px`;
  if (arena.visivel) redesenhar();
}

// O perdedor senta (e levanta areia); o outro pula.
function sentarPerdedor() {
  const g = jogo;
  const perdedor = g.resultado === 'venceu' ? g.outro : g.lado;
  g.sentado = perdedor;
  perdedor.ator.definir({ sentado: true, passos: 0 });
  outroRival(perdedor).ator.pular();
  if (reduzido()) return;
  const { P, chao } = arena.geo;
  for (let i = 0; i < 12; i++) {
    const lado = i % 2 ? 1 : -1;
    arena.graos.push({
      x: perdedor.x + lado * (2 + 4 * Math.random()) * P, y: chao - 2,
      vx: lado * (30 + 70 * Math.random()), vy: -20 - 50 * Math.random(),
      vida: 0, max: 0.45 + 0.4 * Math.random(), lado: Math.random() < 0.5 ? 2 : 3,
    });
  }
}

// A areia que o perdedor levanta (com um jogo, o quadro da arena não anda: a física é a mesma de lá).
function moverAreia(dt) {
  let vivos = 0;
  for (const grao of arena.graos) {
    grao.vida += dt;
    grao.vy += 70 * dt;
    grao.x += grao.vx * dt;
    grao.y += grao.vy * dt;
    if (grao.vida < grao.max) arena.graos[vivos++] = grao;
  }
  arena.graos.length = vivos;
}

// ---------- entradas ----------

// Teclas em captura, só com uma partida: Esc fecha; Espaço e Enter puxam (segurar não conta: tem de martelar) e, no
// fim, depois de 1 s, fecham. Campos de texto e janelas do site (conversa, medalheiro) ficam de fora, Esc inclusive:
// é ele que fecha a janela aberta por cima da arena.
function teclar(e) {
  if (!jogo || e.target.closest?.('input, textarea, select, [contenteditable="true"], [role="dialog"]')) return;
  if (e.key === 'Escape') {
    e.preventDefault();
    e.stopPropagation();
    fechar();
    return;
  }
  if (e.key !== ' ' && e.key !== 'Enter') return;
  e.preventDefault();
  e.stopPropagation();
  if (e.repeat) return;
  if (jogo.fase === 'puxa') puxar();
  else if (jogo.fase === 'fim' && jogo.t > 1) fechar();
}

// Qualquer toque no palco puxa (o toque que começou o jogo veio antes dele, então não conta).
function tocar(e) {
  if (!jogo || e.button !== 0) return;
  e.preventDefault();
  if (jogo.fase === 'puxa') puxar();
  else if (jogo.fase === 'fim' && jogo.t > 1) fechar();
}

// Pedido do medalheiro: leva até a arena e, com ela pronta e livre, a corda pisca e o escultor explica.
function mostrar() {
  ir(arena.palco);
  pendente = reduzido() ? 0 : 0.8;
  acordar();
}

function mostrarDica() {
  dica = 2.2;
  el.alvos.dataset.dica = '';
  if (mascote.ativo) falar(FALAS.dica, 3);
  el.metades[0]?.botao.focus({ preventScroll: true });
  redesenhar();
}

// O que não está no quadro da arena: o pedido pendente, a dica e o serpentear da corda com a arena parada (o laço dela
// dorme em 'parado').
function vigiar(dt) {
  if (pendente !== null && livreParaJogar() && (pendente -= dt) <= 0) {
    pendente = null;
    mostrarDica();
  }
  if (dica > 0 && (dica -= dt) <= 0) {
    dica = 0;
    el.alvos.removeAttribute('data-dica');
    redesenhar();
  }
  const serpenteia = !reduzido() && !jogo && (!!apontada() || dica > 0) && arena.fase === 'parado' && arena.visivel;
  if (serpenteia) redesenhar();
  return pendente !== null || dica > 0 || serpenteia;
}

function montar() {
  const alvos = document.createElement('div');
  alvos.className = 'cabo-alvos';
  const etiqueta = document.createElement('span');
  etiqueta.className = 'dica-pixel cabo-etiqueta';
  etiqueta.setAttribute('aria-hidden', 'true');
  etiqueta.hidden = true;
  alvos.append(etiqueta);
  // A metade da esquerda primeiro (é a do rival que olha para a direita): a ordem do Tab é a da tela.
  const metades = [...arena.rivais].sort((a, b) => b.dir - a.dir).map(rival => {
    const botao = document.createElement('button');
    botao.type = 'button';
    botao.className = 'cabo-metade';
    botao.setAttribute('aria-label', `Cabo de guerra: puxar pelo ${rival.rede.nome}`);
    botao.addEventListener('pointerenter', () => apontar('ponteiro', rival));
    botao.addEventListener('pointerleave', () => apontar('ponteiro', null));
    botao.addEventListener('focus', () => apontar('foco', rival));
    botao.addEventListener('blur', () => apontar('foco', null));
    botao.addEventListener('click', () => comecar(rival));
    alvos.append(botao);
    return { botao, rival };
  });

  const hud = document.createElement('div');
  hud.className = 'painel-pixel cabo-placar';
  hud.hidden = true;
  hud.innerHTML = `<span class="cabo-sub"></span><strong class="cabo-grande" aria-hidden="true"></strong>`
    + `<span class="cabo-relogio" aria-hidden="true">${'<i class="celula"></i>'.repeat(10)}</span>`
    + '<button class="sr-only cabo-puxar" type="button">Puxar a corda</button>'
    + '<p class="sr-only cabo-dito" aria-live="assertive"></p>';
  arena.palco.append(alvos, hud);
  const q = s => hud.querySelector(s);
  el = {
    alvos, etiqueta, metades, placar: hud, sub: q('.cabo-sub'), grande: q('.cabo-grande'),
    relogio: [...hud.querySelectorAll('.cabo-relogio i')], puxar: q('.cabo-puxar'), dito: q('.cabo-dito'),
  };
  // Os puxões vêm do teclado (Espaço/Enter) e do toque no palco. O clique sem ponteiro (detail 0) é o do leitor de tela
  // em modo de navegação, que não manda tecla para a página: ele também puxa (e, no fim, fecha). O teclado não gera
  // esse clique (Espaço e Enter já são cancelados em teclar), e o placar não recebe ponteiro: nada conta em dobro.
  el.puxar.addEventListener('click', e => {
    e.preventDefault();
    if (!jogo || e.detail !== 0) return;
    if (jogo.fase === 'puxa') puxar();
    else if (jogo.fase === 'fim' && jogo.t > 1) fechar();
  });
}

export function iniciar() {
  if (arena.rivais.length !== 2 || !arena.palco) return;
  montar();
  arena.pintar = pintar;
  arena.palco.addEventListener('pointerdown', tocar);
  document.addEventListener('keydown', teclar, true);
  registrar(vigiar);
  redesenhar();   // se a arena já estiver parada (movimento reduzido), a corda aparece agora

  registrarJogo('cabo', {
    nome: 'Cabo de guerra',
    onde: 'no Coliseu: a corda na areia',
    placar: () => {
      const { v, d, best } = lerPlacar();
      return best ? `${v} a ${d}, recorde ${umaCasa.format(best)} por segundo` : `${v} a ${d}`;
    },
    jogar: mostrar,
    oculto: () => arena.rivais.length !== 2,
  });
}
