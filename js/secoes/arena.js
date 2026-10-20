// A arena: LinkedIn × GitHub no interior do Coliseu (spec 04). Na primeira vez que a fileira aparece, um gladiador de
// pixel puxa cada estátua para dentro por uma corda, sete puxões, e o número do cartão conta junto com o avanço da
// estátua. As estátuas pousam, tremem e soltam areia; os gladiadores largam as cordas, dão um passo à frente e se
// encaram, um provocando o outro; o mascote senta no muro, olha um e outro e comenta. Com movimento reduzido tudo já
// nasce no lugar. Os jogos da areia (cabo de guerra, quiz, duelo de cartas) chegam depois e se penduram no que este
// módulo exporta (ver "Para os jogos", no fim).
import { desenhar as desenharColiseu } from '../arte/coliseu.js';
import { montar, MACO } from '../arte/escultor.js';
import { vestir } from '../arte/gladiadores.js';
import { redes, falas, contagem, numeroPt } from '../dados/redes.js';
import { registrar, acordar } from '../nucleo/relogio.js';
import { dpr, limitar, suave } from '../nucleo/pixel.js';
import { reduzido, aoMudar } from '../nucleo/movimento.js';
import { emitir } from '../nucleo/sinais.js';
import { mascote, trabalho, livre, falar, virar, sentarEm } from '../mascote.js';

const PUXOES = 7;          // puxões até a estátua chegar
const PUXAO = 0.5;         // s entre um puxão e o próximo
const ATRASO = 0.25;       // s: o segundo gladiador puxa defasado, para os dois não andarem em uníssono
const PASSO = 0.5;         // s do passo à frente, do ponto de reboque ao ponto de duelo
const NO_MURO = 4.2;       // s do mascote sentado no muro
const OLHAR = 1.3;         // s olhando para cada lado
const LARGO = matchMedia('(min-width: 1280px)');
const COR = { grao: '#c9b086', corda: '#8a6a3e', cordaEscura: '#5c4427', no: '#3a2b1b' };

// O estado da arena, aberto: os jogos leem e mexem nele (ver "Para os jogos").
export const arena = {
  secao: null, cabeca: null, palco: null, fileira: null, coliseu: null, efeitos: null, ctx: null,
  rivais: [],
  fase: 'espera',          // espera → reboque → passo → encarada; ou parado (movimento reduzido), vindo de qualquer uma
  t: 0,                    // s na fase atual
  geo: null,               // { W, H, P, cx, topo, pe, podio, chao } em px de palco
  k: 1,                    // pixels de dispositivo por px CSS (até 3)
  visivel: false,          // o palco está na tela: só então o canvas é redesenhado e a encarada anima
  graos: [],
  provocacao: { em: 0, quem: 0 },
  trabalho: null,          // a visita do mascote: { fase: 'espera' | 'indo' | 'muro', t, registro }
  falas: [...falas],       // o que o mascote diz no muro; os jogos podem acrescentar a deles
  jogo: null,              // { quadro(dt), ocupado() }: com um jogo, o quadro inteiro da arena é dele
  pintar: null,            // (ctx, k): desenha na areia, depois das cordas e antes dos gladiadores
};

let avisou = false;
const aoTocar = new Set();

// ---------- montagem ----------

function elemento(tag, classe, texto) {
  const el = document.createElement(tag);
  if (classe) el.className = classe;
  if (texto !== undefined) el.textContent = texto;
  return el;
}

function link(url, texto, classe) {
  const a = elemento('a', classe, texto);
  Object.assign(a, { href: url, target: '_blank', rel: 'noopener noreferrer' });
  return a;
}

// Uma figura (cartão + estátua) e o seu gladiador. dir 1 = lado esquerdo, olhando para a direita.
function criarRival(rede, dir) {
  const figura = elemento('figure', `rival rival-${rede.chave}`);
  figura.id = `rival-${rede.chave}`;

  const etiqueta = elemento('span', 'rival-etiqueta');
  etiqueta.append(elemento('span', 'rotulo-secao rival-nome', rede.nome.toUpperCase()), elemento('span', 'rotulo-secao rival-periodo', rede.periodo));
  // A marca de provisório vai na linha da unidade, que é curta: na etiqueta ela alargaria o cartão até a borda em 1280.
  const unidade = elemento('span', 'rotulo-secao rival-unidade', rede.unidade);
  if (rede.provisorio) unidade.append(' ', elemento('span', 'rival-provisorio', '· PROVISÓRIO'));

  // O número que conta é só visual; o leitor de tela ouve o total de uma vez, seguido da unidade.
  const numero = elemento('span', 'rival-numero');
  numero.setAttribute('aria-hidden', 'true');
  numero.dataset.final = contagem(rede.total, 1);
  const contador = elemento('span', 'rival-contagem');
  numero.append(contador);

  const estatisticas = elemento('dl', 'rival-estatisticas');
  for (const e of rede.estatisticas) {
    const valor = elemento('dd');
    if (e.url) {
      const a = link(e.url, e.texto);
      if (e.leitor) a.setAttribute('aria-label', e.leitor);
      valor.append(a);
    } else {
      valor.textContent = e.texto;
    }
    const par = elemento('div');
    par.append(elemento('dt', '', e.rotulo), valor);
    estatisticas.append(par);
  }

  const perfil = link(rede.perfil, 'Ver perfil', 'rival-link');
  const seta = elemento('span', 'seta', '↗');
  seta.setAttribute('aria-hidden', 'true');
  perfil.append(seta, elemento('span', 'sr-only', ` no ${rede.nome} (abre em nova aba)`));

  const cartao = elemento('figcaption', 'rival-cartao');
  cartao.append(etiqueta, numero, elemento('span', 'sr-only', numeroPt(rede.total)), unidade, estatisticas, perfil);

  // width/height no próprio <img>: o layout mede a estátua antes de a imagem chegar.
  const estatua = elemento('img', 'rival-estatua');
  Object.assign(estatua, { src: rede.estatua.src, width: rede.estatua.largura, height: rede.estatua.altura,
    alt: rede.estatua.alt, decoding: 'async', draggable: false });
  figura.append(cartao, estatua);

  const canvas = elemento('canvas', 'gladiador pixel');
  canvas.setAttribute('aria-hidden', 'true');

  return {
    chave: rede.chave, dir, rede, figura, cartao, estatua, contador, canvas,
    ator: null, P: 0, k: 0,
    caixaEstatua: null, ancora: { x: 0, y: 0 }, duelX: 0, fimX: 0, distancia: 0,
    x: 0, deslocamento: 0, passos: 0,
    // reboque (spec 04 §2.2): meta = progresso pedido, hp = do gladiador, sp = da estátua (move a figura e conta)
    meta: 0, hp: 0, sp: 0, ultimo: 0, puxao: 0, proximoPuxao: 0, pousou: false,
    corda: null, tremor: 0, puloEm: 0, exibido: null,
  };
}

// O metal do site agora; a arte em canvas lê ao desenhar (a onda que troca o metal é da Fase 2).
const metalDoSite = () => {
  const metal = document.documentElement.dataset.metal;
  return metal === 'prata' || metal === 'ouro' ? metal : null;
};

// Remonta quando o pixel ou a densidade mudam, guardando o estado (direção, kit, pulo...). Na primeira vez veste a
// armadura da rede, que esconde as asas dobradas.
function montarGladiador(r, P, k) {
  const antes = r.ator?.estado;
  r.ator = montar(r.canvas, { pixel: P, dpr: k, reduzido: false }); // o ator sempre anima; quem decide parar é a arena
  if (antes) r.ator.definir({ ...antes });
  else vestir(r.ator.definir({ dir: r.dir, asas: 'fechadas' }), r.rede.kit);
  r.P = P;
  r.k = k;
}

// ---------- layout para a largura e a altura atuais ----------

function layout() {
  const { rivais, secao, cabeca, palco, fileira } = arena;
  if (!rivais.length || !palco.clientWidth) return;
  const largo = LARGO.matches;

  // 1. O espaço do muro: a seção inteira cabe numa tela (a altura de 100svh dela), nunca menos que uma faixa de muro
  //    (aí ela fica mais alta e rola por dentro) e nunca tanto que os arcos engulam as estátuas.
  const estiloSecao = getComputedStyle(secao);
  const tela = parseFloat(estiloSecao.minHeight) || innerHeight;
  const inicio = palco.getBoundingClientRect().top - cabeca.getBoundingClientRect().top + parseFloat(estiloSecao.paddingTop);
  const sobra = tela - inicio - fileira.offsetHeight - parseFloat(getComputedStyle(palco).paddingBottom);
  const topo = Math.round(largo ? limitar(sobra, 150, 520) : limitar(sobra, 120, 320));
  palco.style.setProperty('--rivais-topo', `${topo}px`);

  // 2. Medir sem os deslocamentos do reboque, senão a geometria sai torta no meio dele.
  for (const r of rivais) r.figura.style.transform = '';
  const caixa = palco.getBoundingClientRect();
  const W = caixa.width, H = caixa.height;
  const noPalco = el => {
    const c = el.getBoundingClientRect();
    return { esquerda: c.left - caixa.left, direita: c.right - caixa.left, topo: c.top - caixa.top,
      base: c.bottom - caixa.top, largura: c.width, altura: c.height };
  };
  const figuras = rivais.map(r => noPalco(r.figura));
  for (const r of rivais) r.caixaEstatua = noPalco(r.estatua);
  const referencia = rivais[0].caixaEstatua;

  // 3. O pé do muro fica atrás das estátuas (a 20% da altura delas; no estreito, no meio) e, no largo, acima dos números.
  let pe = topo + referencia.altura * (largo ? 0.2 : 0.5);
  if (largo) for (const r of rivais) pe = Math.min(pe, noPalco(r.cartao).topo - 14);

  // 4. O Coliseu para esta largura: o topo do muro a 22 px do topo do palco no centro (16 px no estreito).
  const { svg, podioEm } = desenharColiseu({ largura: W, altura: H, pe, muro: pe - (largo ? 22 : 16), abertura: 0.72 });
  arena.coliseu.setAttribute('viewBox', `0 0 ${W} ${H}`);
  arena.coliseu.innerHTML = svg;

  // 5. Os pontos de cada gladiador.
  const P = largo ? 5 : 3, cx = W / 2, duelo = rivais.length === 2;
  const k = Math.min(3, dpr());
  arena.k = k;
  arena.geo = { W, H, P, cx, topo, pe, podio: podioEm(cx), chao: Math.round(referencia.base + (largo ? 8 : 4)) };
  rivais.forEach((r, i) => {
    const e = r.caixaEstatua, d = r.dir;
    const interna = d > 0 ? e.direita : e.esquerda;           // a borda da estátua voltada para o centro
    r.ancora = { x: interna - d * 0.18 * e.largura, y: e.topo + 0.6 * e.altura };
    r.duelX = duelo ? cx - d * 14 * P : interna + d * 10 * P;   // sozinho, para diante da própria estátua
    r.fimX = r.duelX - d * 6 * P;                              // o reboque acaba 6 px de sprite antes do duelo
    if (d * (r.fimX - r.ancora.x) < 4 * P) {                   // nunca rebocar de cima da corda
      r.fimX = r.ancora.x + d * 4 * P;
      if (d * (r.fimX - r.duelX) > 0) r.duelX = r.fimX;
    }
    // O bastante para tirar da tela a figura inteira (com o cartão) e o gladiador.
    const f = figuras[i];
    r.distancia = Math.max(d > 0 ? f.direita : W - f.esquerda, d > 0 ? r.fimX + 10 * P : W - r.fimX + 10 * P) + 24;
    if (!r.ator || r.P !== P || r.k !== k) montarGladiador(r, P, k);
    r.x = arena.fase === 'espera' ? r.fimX - d * r.distancia
      : arena.fase === 'reboque' ? r.fimX - d * r.distancia * (1 - r.hp)
      : arena.fase === 'passo' ? r.fimX
      : r.duelX;
  });

  arena.efeitos.width = Math.round(W * k);
  arena.efeitos.height = Math.round(H * k);
  posicionar();
  redesenhar();
}

// ---------- o quadro ----------

function comecarReboque() {
  arena.fase = 'reboque';
  arena.t = 0;
  arena.rivais.forEach((r, i) => Object.assign(r, {
    meta: 0, hp: 0, sp: 0, ultimo: 0, puxao: 0, proximoPuxao: i * ATRASO, pousou: false,
    corda: { alfa: 0, flecha: 1, cai: false, caiEm: 0 },
  }));
  acordar();
}

// Dois seguidores com taxas diferentes dão o puxão: o gladiador dá o bote (9/s), a corda estica, a estátua vem atrás
// devagar (5/s) e a corda afrouxa. Interpolar em linha reta mataria o efeito.
function rebocar(r, dt) {
  r.proximoPuxao -= dt;
  if (r.proximoPuxao <= 0 && r.meta < 1) {
    r.meta += 1 / PUXOES;
    if (r.meta > 0.9999) r.meta = 1;
    r.puxao = 1;
    r.proximoPuxao += PUXAO;
  }
  r.hp += (r.meta - r.hp) * (1 - Math.exp(-9 * dt));
  r.sp += (r.hp - r.sp) * (1 - Math.exp(-5 * dt));
  if (r.meta === 1 && r.sp > 0.997) r.hp = r.sp = 1;
  r.puxao = Math.max(0, r.puxao - 3 * dt);
  andarAte(r, r.fimX - r.dir * r.distancia * (1 - r.hp), 'reboque');
  const velocidade = ((r.sp - r.ultimo) * r.distancia) / Math.max(dt, 0.001);
  r.ultimo = r.sp;
  if (velocidade > 60 && Math.random() < 0.6) {
    // Areia da borda de trás (a estátua anda para o centro), 6 px para dentro, voando para trás.
    const e = r.caixaEstatua, desloc = -r.dir * r.distancia * (1 - r.sp);
    const borda = r.dir > 0 ? e.esquerda + 6 : e.direita - 6;
    soltarGrao(borda + desloc + (Math.random() * 2 - 1) * 12, e.base - 2, -r.dir * (20 + 50 * Math.random()), -20 - 40 * Math.random());
  }
  if (r.sp >= 1 && !r.pousou) pousar(r);
  escreverContagem(r);
}

// Chegou: treme 0,25 s, solta uma rajada de areia dos dois lados da base e, 0,3 s depois, o gladiador larga a corda.
function pousar(r) {
  r.pousou = true;
  r.tremor = 1;
  if (r.corda) r.corda.caiEm = 0.3;
  const e = r.caixaEstatua;
  for (let i = 0; i < 18; i++) {
    const lado = i % 2 ? 1 : -1;
    const x = lado > 0 ? e.direita - 6 - 10 * Math.random() : e.esquerda + 6 + 10 * Math.random();
    soltarGrao(x, e.base - 2, lado * (40 + 90 * Math.random()), -20 - 60 * Math.random());
  }
}

function soltarGrao(x, y, vx, vy) {
  if (reduzido()) return;
  arena.graos.push({ x, y, vx, vy, vida: 0, max: 0.45 + 0.4 * Math.random(), lado: Math.random() < 0.5 ? 2 : 3 });
  if (arena.graos.length > 160) arena.graos.shift();
}

function escreverContagem(r) {
  const texto = contagem(r.rede.total, r.sp);
  if (texto === r.exibido) return;
  r.contador.textContent = texto;
  r.exibido = texto;
}

// Os dois chegam ao lugar de duelo, de frente um para o outro, e pulam juntos. Pede-se o mascote (uma vez só).
function encarar() {
  arena.fase = 'encarada';
  arena.t = 0;
  arena.provocacao = { em: 1.8, quem: 0 };
  for (const r of arena.rivais) r.ator.definir({ passos: 0 }).pular();
  if (arena.rivais.length === 2 && !arena.trabalho) arena.trabalho = { fase: 'espera', t: 0, registro: null };
  avisarPronta();
}

function avisarPronta() {
  if (avisou) return;
  avisou = true;
  emitir('arena-pronta');
}

function animar(dt) {
  if (!arena.geo) return;
  if (arena.jogo) { arena.jogo.quadro(dt); return; }
  const { rivais } = arena;

  if (arena.fase === 'reboque') {
    arena.t += dt;
    for (const r of rivais) rebocar(r, dt);
    if (rivais.every(r => r.pousou)) { arena.fase = 'passo'; arena.t = 0; }
  } else if (arena.fase === 'passo') {
    arena.t += dt;
    const u = suave(Math.min(1, arena.t / PASSO));
    for (const r of rivais) andarAte(r, r.fimX + (r.duelX - r.fimX) * u, 'caminhada');
    if (arena.t >= PASSO) encarar();
  } else if (arena.fase === 'encarada' && rivais.length === 2) {
    // Provocação: um golpeia o ar na direção do outro, que pula 0,5 s depois; a vez troca a cada 2,6–4,0 s.
    arena.t += dt;
    if (arena.t >= arena.provocacao.em) {
      const { quem } = arena.provocacao, outro = 1 - quem;
      rivais[quem].ator.golpear();
      rivais[outro].puloEm = 0.5;
      arena.provocacao = { em: arena.t + 2.6 + 1.4 * Math.random(), quem: outro };
    }
  }

  for (const r of rivais) {
    if (r.puloEm > 0) { r.puloEm -= dt; if (r.puloEm <= 0) r.ator.pular(); }
    r.tremor = Math.max(0, r.tremor - 4 * dt);
    const c = r.corda;
    if (c) {
      if (c.caiEm > 0) { c.caiEm -= dt; if (c.caiEm <= 0) { c.cai = true; r.ator.pular(); } }
      if (c.cai) {
        c.alfa -= 3.5 * dt;
        c.flecha += 6 * dt;
        if (c.alfa <= 0) r.corda = null;
      } else {
        // Esticada logo depois do bote (o gladiador se adiantou), frouxa quando a estátua alcança.
        c.alfa = Math.min(1, c.alfa + 7 * dt);
        c.flecha += (Math.max(0, 1 - (r.hp - r.sp) * 30) - c.flecha) * (1 - Math.exp(-10 * dt));
      }
    }
    if (arena.fase !== 'parado') r.ator.avancar(dt);
  }

  let vivos = 0;
  for (const g of arena.graos) {
    g.vida += dt;
    g.vy += 70 * dt;
    g.x += g.vx * dt;
    g.y += g.vy * dt;
    if (g.vida < g.max) arena.graos[vivos++] = g;
  }
  arena.graos.length = vivos;

  // O mascote só vem se estiver livre logo (ou se ainda estiver estacionando depois do retrato); senão perde o duelo.
  const visita = arena.trabalho;
  if (visita?.fase === 'espera') {
    if (livre()) chamarMascote();
    else if ((visita.t += dt) > (mascote.ativo && !mascote.pronto ? 1.6 : 0.35)) arena.trabalho = null;
  } else if (visita?.fase === 'indo' && (!lugarDoMascote() || (mascote.trabalhoAtual ?? 'arena') !== 'arena')) {
    // O muro saiu de alcance, ou um trabalho mais importante (uma caixa aberta) pegou o mascote antes de ele sair:
    // sem isto o mascote nunca atende nem avisa, e a arena ficaria esperando para sempre.
    soltarMascote();
  }

  posicionar();
  if (arena.visivel) redesenhar();
}

// A encarada só anima com o palco na tela; o reboque termina mesmo fora dela.
function ocupada() {
  if (arena.jogo?.ocupado()) return true;
  return !!arena.trabalho || arena.fase === 'reboque' || arena.fase === 'passo' || arena.graos.length > 0
    || (arena.fase === 'encarada' && arena.visivel) || arena.rivais.some(r => r.corda || r.tremor > 0);
}

// ---------- posições e desenho ----------

export function andarAte(r, alvo, passada = 'caminhada') {
  const dx = alvo - r.x;
  r.passos += Math.abs(dx) / (3 * arena.geo.P);
  r.x = alvo;
  // No reboque cada bote abre as pernas; caminhando, elas alternam a cada 3 px de sprite andados (o ator abre as
  // pernas quando a parte inteira de `passos` é ímpar). Parado = 0.
  const passos = passada === 'reboque' ? (Math.abs(dx) > 0.4 ? 1 : 0) : Math.abs(dx) > 0.05 ? r.passos : 0;
  r.ator.definir({ passos });
}

export function posicionar() {
  const { geo, k } = arena;
  if (!geo) return;
  const tremer = !reduzido();
  for (const r of arena.rivais) {
    // O tremor do pouso é sorteado a cada quadro (não é uma senoide): até ±2 px, por 0,25 s.
    r.deslocamento = -r.dir * r.distancia * (1 - r.sp) + (tremer ? (Math.random() - 0.5) * 4 * r.tremor : 0);
    // Sem transform no repouso: texto nítido e nenhuma camada a mais.
    r.figura.style.transform = Math.abs(r.deslocamento) <= 0.01 ? '' : `translate3d(${r.deslocamento}px, 0, 0)`;
    const pes = r.ator.pes();
    const pulinho = Math.round(Math.sin(r.puxao * Math.PI) * 1.5 * geo.P);
    r.canvas.style.left = `${Math.round((r.x - pes.x) * k) / k}px`;
    r.canvas.style.top = `${Math.round((geo.chao - pulinho - pes.y) * k) / k}px`;
  }
}

// Um quadrado em px de palco, com as bordas no pixel de dispositivo: grãos e cordas nítidos em qualquer densidade.
function quadrado(x, y, lado) {
  const { ctx, k } = arena;
  const x0 = Math.round(x * k), y0 = Math.round(y * k);
  ctx.fillRect(x0, y0, Math.round((x + lado) * k) - x0, Math.round((y + lado) * k) - y0);
}

// A corda de reboque: da âncora na face da estátua às costas do gladiador, uma Bézier quadrática com o controle no
// meio, baixado pela flecha (a barriga visível é metade disso). Quadradinhos alternando de dois em dois: corda torcida.
function desenharCorda(r) {
  const { ctx } = arena, { P, chao } = arena.geo;
  const lado = Math.max(2, Math.round(P / 2));
  // As costas do desenho incluem o pulinho do puxão e o pulo do próprio ator: só a posição do canvas descolaria a corda.
  const pulo = Math.round(Math.sin(r.puxao * Math.PI) * 1.5 * P)
    + Math.round(Math.sin(Math.min(1, r.ator.estado.pulo) * Math.PI) * 3 * P);
  const ax = r.ancora.x + r.deslocamento, ay = r.ancora.y;
  const bx = r.x - 2 * P * r.dir, by = chao - pulo - 8 * P;
  const barriga = r.corda.flecha * 4 * P;
  const mx = (ax + bx) / 2, my = (ay + by) / 2 + barriga;
  const n = Math.max(2, Math.ceil((Math.hypot(bx - ax, by - ay) + barriga) / (0.8 * lado)));
  ctx.globalAlpha = Math.max(0, r.corda.alfa);
  for (let i = 0; i <= n; i++) {
    const u = i / n, v = 1 - u;
    ctx.fillStyle = Math.floor(i / 2) % 2 ? COR.cordaEscura : COR.corda;
    quadrado(v * v * ax + 2 * v * u * mx + u * u * bx - lado / 2, v * v * ay + 2 * v * u * my + u * u * by - lado / 2, lado);
  }
  ctx.fillStyle = COR.no;
  quadrado(ax - lado, ay - lado, 2 * lado);
  ctx.globalAlpha = 1;
}

export function redesenhar() {
  const { ctx, efeitos, geo } = arena;
  if (!geo) return;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.clearRect(0, 0, efeitos.width, efeitos.height);
  ctx.fillStyle = COR.grao;
  for (const g of arena.graos) {
    ctx.globalAlpha = Math.max(0, 0.8 * (1 - g.vida / g.max));
    quadrado(g.x, g.y, g.lado);
  }
  ctx.globalAlpha = 1;
  for (const r of arena.rivais) if (r.corda?.alfa > 0) desenharCorda(r);
  arena.pintar?.(ctx, arena.k);
  const metal = metalDoSite();
  for (const r of arena.rivais) r.ator.definir({ metal }).pintar();
}

// Salta para o fim: tudo no lugar, ninguém se mexe (nem pisca), sem cordas, sem areia, sem mascote.
export function finalizar() {
  soltarMascote();
  arena.graos.length = 0;
  arena.fase = 'parado';
  for (const r of arena.rivais) {
    Object.assign(r, { meta: 1, hp: 1, sp: 1, ultimo: 1, pousou: true, corda: null, tremor: 0, puxao: 0, puloEm: 0, x: r.duelX });
    r.ator?.definir({ passos: 0, pulo: 0, recuo: 0, maco: MACO.repouso });
    escreverContagem(r);
  }
  posicionar();
  redesenhar();
  avisarPronta();
}

// ---------- o mascote no muro (trabalho 'arena', prioridade 30) ----------

// Onde ele senta: o assento no topo do pódio, no centro, as pernas penduradas. Em px de viewport (a ponta do cinzel);
// nulo quando o lugar está fora de alcance (aí ele solta a arena).
export function lugarDoMascote() {
  if (!arena.geo || !mascote.ator) return null;
  const c = arena.palco.getBoundingClientRect();
  const p = sentarEm(c.left + arena.geo.cx, c.top + arena.geo.podio);
  return p.y < 60 || p.y > innerHeight - 40 ? null : p;
}

function chamarMascote() {
  const visita = arena.trabalho;
  visita.fase = 'indo';
  visita.registro = trabalho({
    nome: 'arena', prioridade: 30,
    livre: true,                 // sentado no muro, pode passar das bordas da janela
    alvo: lugarDoMascote,
    chegou() {
      visita.fase = 'muro';
      visita.t = 0;
      mascote.ator?.definir({ sentado: true, asas: 'fechadas' });
      virar(-1);
      falar(arena.falas);
    },
    quadro(dt) {
      if (visita.fase !== 'muro') return;
      visita.t += dt;
      if (visita.t >= NO_MURO) {  // olha para a esquerda, levanta, pula e vai embora; as falas seguem com ele
        virar(-1);
        mascote.ator?.definir({ sentado: false, asas: 'lentas' }).pular();
        arena.trabalho = null;
        visita.registro.soltar();
        return;
      }
      mascote.ator?.definir({ sentado: true, asas: 'fechadas' });
      virar(Math.floor(visita.t / OLHAR) % 2 ? 1 : -1);   // esquerda, direita, esquerda...
    },
    perdeu: soltarMascote,
  });
}

// Solta o mascote (lugar fora de alcance, outro trabalho mais importante, um jogo tomando a areia). Ele não volta.
export function soltarMascote() {
  const visita = arena.trabalho;
  if (!visita) return;
  arena.trabalho = null;
  if (visita.fase === 'muro') mascote.ator?.definir({ sentado: false, asas: 'lentas' });
  visita.registro?.soltar();
}

// ---------- início ----------

// Arrastar a janela para outra tela muda a densidade sem resize: Coliseu, gladiadores e efeitos refeitos nela.
function vigiarDensidade() {
  matchMedia(`(resolution: ${devicePixelRatio}dppx)`).addEventListener('change', () => {
    layout();
    acordar();
    vigiarDensidade();
  }, { once: true });
}

export function iniciar() {
  const secao = document.getElementById('redes');
  const palco = document.getElementById('arena-palco');
  const fileira = document.getElementById('rivais');
  const coliseu = document.getElementById('coliseu');
  const efeitos = document.getElementById('arena-fx');
  if (!secao || !palco || !fileira || !coliseu || !efeitos) return;
  Object.assign(arena, { secao, cabeca: secao.querySelector('.arena-cabeca'), palco, fileira, coliseu, efeitos,
    ctx: efeitos.getContext('2d') });

  // Cada rede tem o seu lado (a primeira à esquerda). Sem número ela some, a não ser que esteja marcada como
  // provisória, à espera dos números de verdade.
  const lados = redes.map((rede, i) => ({ rede, dir: i === 0 ? 1 : -1 }));
  const presentes = lados.filter(({ rede }) => rede.total > 0 || rede.provisorio);
  for (const { rede } of lados) if (!presentes.some(p => p.rede === rede)) secao.classList.add(`sem-${rede.chave}`);
  if (!presentes.length) return;
  arena.rivais = presentes.map(({ rede, dir }) => criarRival(rede, dir));
  fileira.replaceChildren(...arena.rivais.map(r => r.figura));
  palco.append(...arena.rivais.map(r => r.canvas));

  layout();
  registrar(dt => {
    if (!ocupada()) return false;
    // A preferência pode mudar com a página aberta. O aoMudar abaixo cobre o aviso do navegador, mas o Chromium não
    // avisa um MediaQueryList que é lido a cada quadro (a leitura já atualiza o valor guardado): confere aqui também.
    if (reduzido() && arena.fase !== 'parado') { finalizar(); return false; }
    animar(dt);
    return ocupada();
  });
  addEventListener('resize', () => { layout(); acordar(); }, { passive: true });
  vigiarDensidade();
  LARGO.addEventListener('change', () => { layout(); acordar(); });
  document.fonts?.ready.then(() => { layout(); acordar(); });   // as fontes mudam a altura dos cartões
  aoMudar(reduz => { if (reduz) finalizar(); });
  // Conserto: um link de cartão focado pelo teclado com a figura ainda fora da tela (ou entrando) ficaria invisível.
  // Pula para o fim: tudo no lugar e o foco à vista.
  fileira.addEventListener('focusin', () => { if (arena.fase === 'espera' || arena.fase === 'reboque') finalizar(); });
  palco.addEventListener('click', tocou);

  if (reduzido() || !('IntersectionObserver' in window)) {
    arena.visivel = true;
    finalizar();
    return;
  }
  new IntersectionObserver(entradas => {
    arena.visivel = entradas[entradas.length - 1].isIntersecting;
    acordar();
  }).observe(palco);
  // O reboque começa pela fileira (metade dela à vista), não pelo palco. A fileira nunca é deslocada, só as figuras
  // dentro dela: o observador funciona com as estátuas ainda fora da tela.
  new IntersectionObserver(entradas => {
    if (entradas[entradas.length - 1].intersectionRatio < 0.5 || arena.fase !== 'espera') return;
    if (reduzido()) finalizar();
    else comecarReboque();
  }, { threshold: [0, 0.5] }).observe(fileira);
}

// ---------- para os jogos (Fases 2 e 3) ----------
// Nomes da spec 04 → daqui: arena.rivals → arena.rivais (key/x/dir/duelX/yank/rope/actor → chave/x/dir/duelX/puxao/
// corda/ator), arena.game → arena.jogo { quadro, ocupado }, arena.paint → arena.pintar, arena.taunt.at →
// arena.provocacao.em, arena.geo.ground → arena.geo.chao, arenaFx/arenaCtx → arena.efeitos/arena.ctx,
// placeArena → posicionar, renderArena → redesenhar, walkTo → andarAte, finishArena → finalizar,
// arenaSpot → lugarDoMascote, letGoOfArena → soltarMascote. O palco é arena.palco e a seção, arena.secao.

// A arena está pronta para jogos: estátuas no lugar e gladiadores frente a frente.
export const pronta = () => arena.fase === 'encarada' || arena.fase === 'parado';

// A caixa de um gladiador em px de palco, da cabeça aos joelhos (o alvo de toque dos jogos).
export function caixaDoGladiador(r) {
  const { P, chao } = arena.geo;
  return { x: r.x - 8 * P, y: chao - 20 * P, largura: 16 * P, altura: 18 * P };
}

// fn(rival, evento) quando o visitante toca num gladiador com a arena pronta. Devolve a função que desliga.
// (Os botões acessíveis por teclado sobre os gladiadores vêm com os próprios jogos.)
export function aoTocarGladiador(fn) {
  aoTocar.add(fn);
  return () => aoTocar.delete(fn);
}

function tocou(evento) {
  if (!aoTocar.size || !pronta() || !arena.geo) return;
  const c = arena.palco.getBoundingClientRect();
  const x = evento.clientX - c.left, y = evento.clientY - c.top;
  const rival = arena.rivais.find(r => {
    const b = caixaDoGladiador(r);
    return x >= b.x && x < b.x + b.largura && y >= b.y && y < b.y + b.altura;
  });
  if (rival) for (const fn of aoTocar) fn(rival, evento);
}

// Refaz a geometria da arena agora (o duelo de cartas muda a altura do subtítulo ao fazê-lo narrador, e o muro tem de
// encolher para a seção continuar cabendo numa tela).
export function refazerLayout() {
  layout();
  acordar();
}
