// A última tela: o campo grego do Contato. Quatro casas, uma por canal, cada uma com um pergaminho de bronze lacrado ao
// pé. O mascote voa de lacre em lacre e abre cada um com um golpe de cinzel (se ele não pode vir, os lacres estouram
// sozinhos, em cascata) e depois senta no telhado do e-mail; apontar outra casa o leva ao telhado dela. Pétalas cruzam o
// campo atrás das casas. Antes das 5h, o campo é noturno. Ver docs/arquitetura.md §7 e a especificação 05.
//
// Para a Fase 2 (jogo da velha na laje, pétalas que se pegam, sono no telhado): o objeto `contato` e as funções
// exportadas no fim do arquivo.
import { registrar, acordar } from '../nucleo/relogio.js';
import { dpr, limitar, saidaCubica } from '../nucleo/pixel.js';
import { reduzido, aoMudar } from '../nucleo/movimento.js';
import { emitir } from '../nucleo/sinais.js';
import { mascote, trabalho, livre, falar, virar, sentarEm, deOlharEsquerda } from '../mascote.js';
import { perfil } from '../dados/perfil.js';
import { desenhar as desenharCampo } from '../arte/campo.js';
import { desenhar as desenharCasa } from '../arte/casas.js';
import { montar as montarPergaminho, POMO } from '../arte/pergaminho.js';

const secao = document.getElementById('contato');
const campo = document.getElementById('campo');
const fx = document.getElementById('campo-fx');
const lista = document.getElementById('casas');
const anuncio = document.getElementById('anuncio');

// Onde cada prédio fica: [fração da largura, largura na referência (1440 ou 390 px), camada do chão, afundamento em px
// na referência]. Na larga, stoa e teatro nas encostas do fundo e tesouro e tholos ladeando a trilha; na estreita,
// duas colunas.
const PONTOS = {
  larga: { stoa: [0.19, 340, 'encosta', 4], teatro: [0.8, 380, 'encosta', 4], tesouro: [0.36, 245, 'perto', 8], tholos: [0.64, 220, 'perto', 8] },
  estreita: { stoa: [0.27, 185, 'meio', 3], teatro: [0.74, 190, 'meio', 3], tesouro: [0.27, 165, 'perto', 24], tholos: [0.74, 150, 'perto', 24] },
};
// A ronda dos lacres termina no tesouro: o e-mail, ao lado do botão copiar, é o assento padrão.
const RONDA = ['teatro', 'tholos', 'stoa', 'tesouro'];
const FALAS = {
  chegada: ['Gostou de algo!? Aqui você consegue falar com o Victor.', 'Cada um prefere um jeito pra conversar, né?'],
  copiado: 'Copiado!',
};
const CORES_DAS_PETALAS = ['#eeb2a8', '#f5d3cb', '#fbf6ea', '#e9a198'];
const DESCIDA = 0.6;          // s para o papel descer
const OLHAR = 7;              // no telhado, a cada 7 s ele olha para a direita por 1,4 s

// Os pixels de um X e de um O na laje, na ordem em que são riscados (a Fase 2 risca pixel a pixel nessa ordem).
export const TRACOS = {
  x: [[0, 0], [1, 1], [2, 2], [3, 3], [4, 4], [4, 0], [3, 1], [1, 3], [0, 4]],
  o: [[2, 0], [3, 0], [4, 1], [4, 2], [4, 3], [3, 4], [2, 4], [1, 4], [0, 3], [0, 2], [0, 1], [1, 0]],
};

const geo = { W: 0, H: 0, k: 1, P: 3, larga: true, hz: 0, Wd: 0, off: 0, escala: 1, desenho: null };
const petalas = [];
const laje = { el: null, x: 0, y: 0, u: 3, largura: 0, altura: 0, camada: null, visivel: false, tabuleiro: 'x...o...x' };
let casas = [];
let assento = null;           // a casa em cujo telhado ele senta: a última apontada
let job = null;               // { fase: espera | ida | golpe | telhado | poleiro, t, pego, casa, bateu, sentouEm }
let cascata = null;           // { t }: os lacres abrindo sozinhos
let visivel = false, cheia = false, vista = false, saudou = false, noite = false;
let relogio = 0;

// ---------- montagem ----------

function prepararCasa(li) {
  const arte = li.querySelector('.casa-arte');
  const caixa = li.querySelector('.casa-pergaminho');
  const papel = caixa.querySelector('.casa-papel');
  const link = papel.querySelector('a[href]');
  // O desenho leva aonde o papel leva: o link do canal fica num lugar só, no papel. Papel sem link, casa sem link.
  if (link) {
    arte.setAttribute('href', link.getAttribute('href'));
    if (link.target) { arte.target = link.target; arte.rel = link.rel; }
  }
  return {
    li, arte, caixa, papel,
    tipo: li.dataset.tipo, nome: li.dataset.nome ?? '', simbolo: li.dataset.simbolo,
    svg: arte.querySelector('svg'), canvas: caixa.querySelector('.casa-canvas'), pergaminho: null,
    estado: 'enrolado', t: 0, aberto: 0, sujo: true,
    w: 0, altura: 0, queda: 0, assento: null, arteX: 0, arteY: 0, teto: null, x: 0, base: 0,
    P: 0, k: 0, pw: 0, ph: 0, caixaX: 0, caixaY: 0,
  };
}

// O WhatsApp sai de js/dados/perfil.js: com o número (55, DDD e número), o "em breve" do papel vira o link de mandar
// mensagem; sem ele (ou fora do formato), fica "em breve", e nem o papel nem a casa levam a um número quebrado.
function ligarWhatsapp() {
  const numero = String(perfil.whatsapp ?? '').replace(/\D/g, '');
  const linha = document.getElementById('contato-whatsapp');
  if (!linha || !/^55\d{10,11}$/.test(numero)) return;
  const a = document.createElement('a');
  a.href = `https://wa.me/${numero}`;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  const aviso = document.createElement('span');
  aviso.className = 'sr-only';
  aviso.textContent = ' (abre em nova aba)';
  a.append('Mandar mensagem', aviso);
  linha.replaceChildren(a);
}

// Refaz tudo para o tamanho atual (redimensionar, fontes carregadas, troca de dpr). Devolve se desenhou.
function layout() {
  const W = secao.clientWidth, H = secao.clientHeight;
  if (!W || !H) return false;
  const larga = W > 760 && W / H > 0.9;   // o modo do script não é o breakpoint do CSS: é assim no original
  const k = Math.min(dpr(), 3);
  const mudouTamanho = W !== geo.W || H !== geo.H;
  const mudouK = k !== geo.k;
  if (mudouTamanho) {
    // No celular o campo é desenhado mais largo e a seção mostra o miolo: o santuário fica no centro e as encostas
    // não somem.
    const hz = Math.round(larga ? 0.42 * H : 0.3 * H);
    const Wd = Math.max(W, 0.95 * H), off = (Wd - W) / 2;
    geo.desenho = desenharCampo({ largura: Wd, altura: H, horizonte: hz });
    campo.setAttribute('viewBox', `${off} 0 ${W} ${H}`);
    campo.innerHTML = geo.desenho.svg;
    Object.assign(geo, { W, H, larga, hz, Wd, off });
  }
  Object.assign(geo, { k, P: larga ? 3 : 2, escala: larga ? Math.min(W, 1.6 * H) / 1440 : W / 390 });
  for (const c of casas) posicionarCasa(c);
  lista.classList.add('desenhadas');       // daqui em diante as casas são desenho; sem isto, a fileira simples
  for (const c of casas) { Object.assign(c.papel.style, { maxWidth: '', whiteSpace: '' }); posicionarPergaminho(c); }
  afastarPapeis();
  if (mudouTamanho || mudouK) semearPetalas();
  pintarPetalas();
  posicionarLaje();
  return true;
}

function posicionarCasa(c) {
  const [fracao, largura, camada, afunda] = PONTOS[geo.larga ? 'larga' : 'estreita'][c.tipo];
  const w = Math.round(largura * geo.escala), x = Math.round(geo.W * fracao);
  if (w !== c.w) {
    const casa = desenharCasa(c.tipo, { largura: w, id: `casa-${c.tipo}`, nome: c.nome, simbolo: c.simbolo });
    c.svg.setAttribute('viewBox', casa.viewBox);
    c.svg.innerHTML = casa.svg;
    c.arte.style.width = `${w}px`;
    c.arte.style.height = `${casa.altura}px`;
    Object.assign(c, { w, altura: casa.altura, queda: casa.queda, assento: casa.assento });
  }
  // A casa pisa no chão MAIS BAIXO sob 90% da largura: pelo centro ou pelo mais alto, ela flutuaria na encosta.
  const chao = geo.desenho.chao[camada];
  let base = -Infinity;
  for (let i = 0; i < 9; i++) base = Math.max(base, chao(x - 0.45 * w + 0.9 * w * i / 8 + geo.off));
  base = Math.round(base + afunda * geo.escala);
  c.arteX = Math.round(x - w / 2);
  c.arteY = Math.round(base - c.queda);
  c.arte.style.left = `${c.arteX}px`;
  c.arte.style.top = `${c.arteY}px`;
  c.teto = { x: c.arteX + c.assento.x, y: c.arteY + c.assento.y };
  c.x = x;
  c.base = base;
}

function posicionarPergaminho(c) {
  const P = geo.P;
  // O papel mede o texto (com a fonte de verdade depois de fonts.ready) e arredonda PARA CIMA a múltiplos do pixel do
  // pergaminho; medido sem posição, para a borda da seção não espremer o texto.
  c.papel.style.width = c.papel.style.height = '';
  c.caixa.style.left = c.caixa.style.top = '0px';
  const r = c.papel.getBoundingClientRect();
  const pw = Math.ceil(r.width / P - 0.01) * P, ph = Math.ceil(r.height / P - 0.01) * P;
  c.papel.style.width = `${pw}px`;
  c.papel.style.height = `${ph}px`;
  if (P !== c.P || pw !== c.pw || ph !== c.ph || geo.k !== c.k) {
    c.pergaminho = montarPergaminho(c.canvas, { pixel: P, largura: pw, altura: ph, fino: true })
      .definir({ aberto: c.aberto, lacrado: c.estado === 'enrolado', metal: metalDoSite() });
    Object.assign(c, { P, pw, ph, k: geo.k });
  }
  const vara = c.pergaminho.vara * P, pomo = POMO * P;
  c.caixaX = Math.round(limitar(c.x - pw / 2, 8 + pomo, geo.W - 8 - pomo - pw));
  c.caixaY = c.base + Math.round((geo.larga ? 10 : 6) * geo.escala) + vara;   // a vara de cima logo abaixo do chão
  c.caixa.style.left = `${c.caixaX}px`;
  c.caixa.style.top = `${c.caixaY}px`;
  c.caixa.style.setProperty('--vara', `${vara}px`);
  c.caixa.style.setProperty('--pomo', `${pomo}px`);
  recortar(c);
  c.sujo = true;
}

// Dois papéis lado a lado não podem se encostar: o "@VictorNascimento14" do GitHub, mais longo que o handle do original,
// cobria a borda do papel do e-mail no celular e em janelas baixas. Primeiro eles se afastam para os lados, até a borda
// da tela; se ainda faltar espaço, o da direita fica com a largura que sobra e quebra a linha no <wbr>.
function afastarPapeis() {
  const pomo = POMO * geo.P, minimo = 8 + pomo;
  for (const a of casas) {
    for (const b of casas) {
      if (a === b || a.caixaX >= b.caixaX || a.caixaY >= b.caixaY + b.ph || b.caixaY >= a.caixaY + a.ph) continue;
      let falta = a.caixaX + a.pw + 2 * pomo + 4 - b.caixaX;
      if (falta <= 0) continue;
      const direita = Math.max(0, Math.min(falta, geo.W - minimo - b.pw - b.caixaX));
      const esquerda = Math.max(0, Math.min(falta - direita, a.caixaX - minimo));
      b.caixaX += direita;
      a.caixaX -= esquerda;
      falta -= direita + esquerda;
      if (falta > 0) {
        const cabe = Math.floor((geo.W - minimo - (a.caixaX + a.pw + 2 * pomo + 4)) / geo.P) * geo.P;   // múltiplo do pixel
        Object.assign(b.papel.style, { maxWidth: `${cabe}px`, whiteSpace: 'normal' });
        posicionarPergaminho(b);
        b.caixaX = Math.max(b.caixaX, Math.min(a.caixaX + a.pw + 2 * pomo + 4, geo.W - minimo - b.pw));
      }
      a.caixa.style.left = `${a.caixaX}px`;
      b.caixa.style.left = `${b.caixaX}px`;
    }
  }
}

// O texto só aparece onde o papel já desceu, cortado duas linhas acima da vara de baixo: texto antes do papel
// denunciaria o truque. (O recorte é só visual: leitores de tela leem o papel mesmo enrolado.) Aberto de todo, sem
// recorte, para não cortar o contorno de foco do link e do botão copiar.
function recortar(c) {
  if (!c.pergaminho) return;
  c.papel.style.clipPath = c.estado === 'aberto' ? '' : `inset(0 0 ${c.ph - c.pergaminho.mostrado()}px 0)`;
}

const metalDoSite = () => document.documentElement.dataset.metal ?? null;

// ---------- pergaminhos ----------

// O próximo lacre da ronda ainda fechado (ou nenhum).
const proximoLacre = () => RONDA.map(tipo => casas.find(c => c.tipo === tipo)).find(c => c?.estado === 'enrolado')
  ?? casas.find(c => c.estado === 'enrolado') ?? null;

// Estoura o lacre e o papel desce (só age em pergaminho fechado). pelo: mascote | visitante | cascata.
function abrir(c, pelo) {
  if (!c || c.estado !== 'enrolado') return;
  if (reduzido() || !c.pergaminho) abrirDeVez(c);
  else {
    c.caixa.classList.remove('enrolado');
    c.estado = 'abrindo';
    c.t = 0;
    c.pergaminho.estourar();
    c.sujo = true;
  }
  emitir('pergaminho-aberto', { tipo: c.tipo, pelo });
  acordar();
}

function abrirDeVez(c) {
  c.estado = 'aberto';
  c.aberto = 1;
  c.caixa.classList.remove('enrolado');
  // Lacrar de novo limpa as lascas que estivessem no ar; aí abre sem lacre.
  c.pergaminho?.definir({ lacrado: true }).definir({ lacrado: false, aberto: 1 });
  recortar(c);
  c.sujo = true;
}

// Termina tudo de uma vez, sem ninguém se mexer: movimento reduzido (no início ou ligado no meio da visita) e
// navegador sem IntersectionObserver.
function terminar() {
  job = null;                 // o alvo vira null e o mascote larga o trabalho no próximo quadro
  cascata = null;
  for (const c of casas) {
    if (c.estado === 'aberto') continue;
    const fechado = c.estado === 'enrolado';
    abrirDeVez(c);
    if (fechado) emitir('pergaminho-aberto', { tipo: c.tipo, pelo: 'sistema' });
  }
  pintarPetalas();
  acordar();
}

// ---------- o trabalho do mascote ----------

const podePegar = () => livre() || (reduzido() && mascote.ativo && mascote.pronto && !mascote.trabalhoAtual);

function seguirRonda() {
  const c = reduzido() ? null : proximoLacre();
  if (c) Object.assign(job, { fase: 'ida', casa: c, bateu: false });
  else {
    Object.assign(job, { fase: 'telhado', casa: null });
    mascote.ator?.definir({ sentado: false, asas: 'lentas' });
  }
}

// Apontar uma casa (ponteiro no desenho ou no pergaminho, ou foco no papel) muda o assento; sentado, ele levanta e voa.
function apontar(c) {
  if (assento === c) return;
  assento = c;
  if (job?.pego && job.fase === 'poleiro' && !reduzido() && job.sentouEm !== c) {
    job.fase = 'telhado';
    mascote.ator?.definir({ sentado: false, asas: 'lentas' });
  }
  acordar();
}

// Fração da TELA que a seção cobre agora: a conta do aoVer, sem esperar o observador (que chega um quadro depois).
function fracaoNaTela() {
  const r = secao.getBoundingClientRect();
  return Math.max(0, Math.min(r.bottom, innerHeight) - Math.max(r.top, 0)) / Math.min(r.height, innerHeight);
}

// Ponta do cinzel desejada, em px de viewport, ou null se fora de alcance.
function pontoDoTrabalho() {
  const r = secao.getBoundingClientRect();
  const alcance = y => y >= 60 && y <= innerHeight - 40;
  if (job.fase === 'ida' || job.fase === 'golpe') {
    // No lacre: a ponta 2 px de sprite à direita do centro dele, na junção das varas, já olhando à esquerda (o corpo
    // fica à direita do lacre).
    const c = job.casa, lacre = c.pergaminho.lacre();
    const p = { x: r.left + c.caixaX + lacre.x + 2 * c.P, y: r.top + c.caixaY + lacre.y };
    return alcance(p.y) ? deOlharEsquerda(p) : null;
  }
  // No telhado: o assento do sprite sobre o ponto de sentar da casa; as pernas ficam penduradas.
  const c = job.fase === 'poleiro' && !reduzido() ? job.sentouEm : assento;
  const p = sentarEm(r.left + c.teto.x, r.top + c.teto.y);
  return alcance(p.y) ? p : null;
}

const tarefa = {
  nome: 'contato',
  prioridade: 20,
  alvo() {
    if (!job?.pego) return null;
    const p = pontoDoTrabalho();
    // Fora de alcance: solta o trabalho. Com a seção ainda na tela (janela mais baixa que ela), os lacres que faltam
    // abrem sozinhos, em cascata, como quando ele não vem; se ela saiu, esperam: voltar a ela (≥ 60%) traz o mascote.
    if (!p) {
      if (proximoLacre() && fracaoNaTela() >= 0.6) cascata ??= { t: -0.4 };
      job = null;
      return null;
    }
    // A meta diz para onde ele voa: trocá-la no meio de um voo faz um voo novo a partir de onde ele está.
    tarefa.meta = job.fase === 'ida' || job.fase === 'golpe' ? `lacre:${job.casa.tipo}`
      : `teto:${(job.fase === 'poleiro' && !reduzido() ? job.sentouEm : assento).tipo}`;
    return p;
  },
  chegou() {
    if (job?.fase === 'ida') {
      virar(-1);
      Object.assign(job, { fase: 'golpe', bateu: false });
    } else if (job?.fase === 'telhado') {
      Object.assign(job, { fase: 'poleiro', t: 0, sentouEm: assento });
      mascote.ator?.definir({ sentado: true, asas: 'fechadas' });
      virar(-1);
      if (!saudou) { saudou = true; falar(FALAS.chegada); }
    }
  },
  quadro(dt) {
    const ator = mascote.ator;
    if (!job || !ator) return;
    if (job.fase === 'golpe') {
      if (!job.bateu) {
        job.bateu = true;
        const c = job.casa, este = job;
        // O lacre estoura no IMPACTO do cinzel, não no começo do golpe, e só se o trabalho ainda for o mesmo.
        if (c.estado === 'enrolado') ator.definir({ asas: 'batendo' }).golpear(() => { if (job === este) abrir(c, 'mascote'); });
      } else if (!ator.golpeando) {
        // Se o ator foi remontado no meio do golpe (troca de tamanho), o impacto não veio: abre agora.
        if (job.casa.estado === 'enrolado') abrir(job.casa, 'mascote');
        seguirRonda();
      }
    } else if (job.fase === 'poleiro') {
      job.t += dt;
      virar(!reduzido() && job.t % OLHAR > OLHAR - 1.4 ? 1 : -1);
      ator.definir({ sentado: true, asas: 'fechadas' });
    }
  },
  perdeu() { job = null; },
};

// ---------- pétalas ----------

// Uma pétala nova em x (px da seção), em algum lugar dos 80% de cima.
export function petala(x) {
  return {
    x, y: Math.random() * geo.H * 0.8,
    vx: 26 + Math.random() * 44, queda: 4 + Math.random() * 10, balanco: 8 + Math.random() * 14,
    freq: 0.7 + Math.random() * 1.3, fase: Math.random() * 7,
    giro: Math.random() * 2, rodar: 1.5 + Math.random() * 3,
    cor: CORES_DAS_PETALAS[Math.floor(Math.random() * CORES_DAS_PETALAS.length)],
  };
}

function semearPetalas() {
  petalas.length = 0;
  const quantas = Math.round(Math.min(46, geo.W * geo.H / 26000));
  for (let i = 0; i < quantas; i++) petalas.push(petala(Math.random() * geo.W));
  fx.width = Math.round(geo.W * geo.k);
  fx.height = Math.round(geo.H * geo.k);
  fx.style.width = `${geo.W}px`;
  fx.style.height = `${geo.H}px`;
}

function moverPetalas(dt) {
  for (const p of petalas) {
    p.x += p.vx * dt;
    p.y += (Math.sin(relogio * p.freq + p.fase) * p.balanco + p.queda) * dt;
    p.giro += p.rodar * dt;
    if (p.x > geo.W + 8 || p.y > geo.H + 8) Object.assign(p, petala(-8));   // renasce na borda esquerda
  }
}

// Retângulos 2:1 que viram 1:2 por um instante (nada de girar suave nem de forma de pétala): posição no px e as bordas
// no pixel de dispositivo. Exportada para os segredos: parado, a pétala pega muda de lugar e quem a pegou repinta.
export function pintarPetalas() {
  const ctx = fx.getContext('2d');
  const k = geo.k, u = geo.larga ? 4 : 3;
  ctx.clearRect(0, 0, fx.width, fx.height);
  for (const p of petalas) {
    const deitada = Math.floor(p.giro) % 2 === 0;
    const x = Math.round(p.x), y = Math.round(p.y);
    const x0 = Math.round(x * k), y0 = Math.round(y * k);
    ctx.fillStyle = p.cor;
    ctx.fillRect(x0, y0, Math.round((x + (deitada ? 2 * u : u)) * k) - x0, Math.round((y + (deitada ? u : 2 * u)) * k) - y0);
  }
}

// ---------- a laje do jogo da velha ----------
// Na Fase 1 ela é só cenário: a tábua de mármore na grama com uma partida antiga riscada. O jogo vem na Fase 2.

function montarLaje() {
  laje.el = document.createElement('div');
  laje.el.className = 'laje';
  laje.el.setAttribute('aria-hidden', 'true');
  laje.el.hidden = true;
  laje.el.innerHTML = '<svg viewBox="-2 0 36 35" shape-rendering="crispEdges"></svg>';
  secao.append(laje.el);
  desenharLaje(laje.tabuleiro);
}

// Desenha a laje com o tabuleiro dado: 9 caracteres x, o ou "." (a primeira visita mostra a diagonal X·O·X).
export function desenharLaje(tabuleiro = laje.tabuleiro) {
  if (!laje.el) return;
  laje.tabuleiro = tabuleiro;
  const px = (classe, x, y, w = 1, h = 1) => `<rect class="${classe}" x="${x}" y="${y}" width="${w}" height="${h}"/>`;
  let s = px('lj-sombra', 1, 2, 32, 33) + px('lj-tampo', 0, 0, 31, 31)
    + px('lj-luz', 0, 0, 31, 1) + px('lj-luz', 0, 0, 1, 31) + px('lj-frente', 30, 1, 1, 30);
  for (const g of [10, 20]) s += px('lj-labio', g + 1, 2, 1, 27) + px('lj-labio', 2, g + 1, 27, 1);   // o sulco do #
  for (const g of [10, 20]) s += px('lj-sulco', g, 2, 1, 27) + px('lj-sulco', 2, g, 27, 1);
  s += px('lj-frente', -2, 31, 35, 3) + px('lj-luz', -2, 31, 35, 1);                                  // o plinto
  [...tabuleiro].forEach((marca, i) => {
    if (!TRACOS[marca]) return;
    const ox = 3 + 10 * (i % 3), oy = 3 + 10 * Math.floor(i / 3);
    for (const [x, y] of TRACOS[marca]) s += px(`lj-${marca}`, ox + x, oy + y);
  });
  laje.el.firstElementChild.innerHTML = s;
}

// O que já ocupa a seção (px da seção): cada casa, cada pergaminho até onde o papel chega ABERTO (o espaço fica
// reservado mesmo com ele fechado) e o cabeçalho.
function areasOcupadas() {
  const s = secao.getBoundingClientRect();
  const areas = [];
  for (const c of casas) {
    areas.push({ x0: c.arteX, y0: c.arteY, x1: c.arteX + c.w, y1: c.arteY + c.altura });
    const vara = (c.pergaminho.vara + 1) * c.P, pomo = POMO * c.P;
    areas.push({ x0: c.caixaX - pomo, y0: c.caixaY - vara, x1: c.caixaX + c.pw + pomo, y1: c.caixaY + c.ph + vara + 2 });
  }
  const r = secao.querySelector('.contato-cabeca').getBoundingClientRect();
  areas.push({ x0: r.left - s.left, y0: r.top - s.top, x1: r.right - s.left, y1: r.bottom - s.top });
  return areas;
}

// Um retângulo encosta em alguma área (com 8 px de folga)?
const toca = (areas, x, y, w, h) => areas.some(a => x < a.x1 + 8 && x + w > a.x0 - 8 && y < a.y1 + 8 && y + h > a.y0 - 8);

// Põe a laje na grama da frente, longe das casas, dos pergaminhos, do cabeçalho e da trilha; a encosta do fundo só se a
// frente estiver toda ocupada. Sem lugar, ela some. Depois o crédito procura o lugar dele, longe da laje também.
export function posicionarLaje() {
  if (!laje.el || !geo.desenho) return;
  const lugar = lugarDaLaje(areasOcupadas());
  Object.assign(laje, lugar ?? {}, { visivel: !!lugar });
  laje.el.hidden = !lugar;
  if (lugar) {
    laje.el.style.left = `${lugar.x}px`;
    laje.el.style.top = `${lugar.y}px`;
    laje.el.firstElementChild.setAttribute('width', lugar.largura);
    laje.el.firstElementChild.setAttribute('height', lugar.altura);
  }
  posicionarCredito();
}

function lugarDaLaje(areas) {
  const { W, H, larga, off } = geo;
  const { chao, trilha } = geo.desenho;
  const naTrilha = (x, y, w, h) => Math.abs(x + off + w / 2 - trilha.x(y + h)) < trilha.meia(y + h) + w / 2 + 6;
  const ajustar = u => Math.max(1, Math.round(u * dpr())) / dpr();
  const unidades = [...new Set((larga ? [3] : [2, 1.6, 1.3, 1]).map(ajustar))];
  for (const grupo of [['frente', 'perto', 'meio'], ['encosta']]) {
    for (const u of unidades) {
      const largura = 36 * u, altura = 35 * u, ultimo = H - altura - 4;
      for (const camada of grupo) {
        for (const fracao of larga ? [0.8, 0.9, 0.1, 0.2] : [0.78, 0.22]) {
          const x = Math.round(limitar(W * fracao - largura / 2, 8, W - 8 - largura));
          let borda = -Infinity;
          for (let i = 0; i < 7; i++) borda = Math.max(borda, chao[camada](x + off + largura * i / 6));
          for (let y = Math.round(Math.min(ultimo, borda + (larga ? 44 : 26) - altura + 2 * u)); ; y = Math.min(ultimo, y + 10)) {
            if (!toca(areas, x, y, largura, altura) && !naTrilha(x, y, largura, altura)) return { x, y, u, largura, altura, camada };
            if (y >= ultimo) break;
          }
        }
      }
    }
  }
  return null;
}

// O crédito é nosso (o original não tem): uma etiqueta pequena no pé da seção, no centro se couber; senão no vão livre
// mais perto do centro, para nunca cobrir um papel, uma casa ou a laje.
function posicionarCredito() {
  const credito = secao.querySelector('.credito');
  if (!credito) return;
  credito.style.left = credito.style.right = '';
  const s = secao.getBoundingClientRect(), r = credito.getBoundingClientRect();
  const y = r.top - s.top, w = r.width, h = r.height, meio = (geo.W - w) / 2;
  const areas = areasOcupadas();
  if (laje.visivel) areas.push({ x0: laje.x, y0: laje.y, x1: laje.x + laje.largura, y1: laje.y + laje.altura });
  for (let d = 0; d <= meio; d += 4) {
    for (const x of [meio - d, meio + d]) {
      if (x < 8 || x + w > geo.W - 8 || toca(areas, x, y, w, h)) continue;
      credito.style.left = `${Math.round(x)}px`;
      credito.style.right = 'auto';
      return;
    }
  }
}

// ---------- copiar o e-mail ----------

let voltarTexto = 0;

async function copiarEmail() {
  const link = document.getElementById('contato-email');
  const botao = document.getElementById('copiar-email');
  if (!link || !botao) return;
  try {
    await navigator.clipboard.writeText(link.textContent.trim());   // o <wbr> não entra no texto
  } catch {
    // Sem área de transferência (ou sem permissão): o endereço fica selecionado para copiar à mão.
    const trecho = document.createRange();
    trecho.selectNodeContents(link);
    getSelection().removeAllRanges();
    getSelection().addRange(trecho);
    anunciar('E-mail selecionado.');
    return;
  }
  botao.textContent = 'copiado';
  clearTimeout(voltarTexto);
  voltarTexto = setTimeout(() => { botao.textContent = 'copiar'; }, 2200);
  emitir('email-copiado');
  anunciar('E-mail copiado.');
  if (mascote.trabalhoAtual === 'contato') {
    falar(FALAS.copiado, 1.6);
    if (job?.fase === 'poleiro') mascote.ator?.pular();
  }
}

// A região viva só repete um aviso igual se o texto mudar: limpa e escreve de novo.
function anunciar(texto) {
  if (!anuncio) return;
  anuncio.textContent = '';
  setTimeout(() => { anuncio.textContent = texto; }, 60);
}

// ---------- o laço ----------

function quadro(dt) {
  relogio += dt;
  if (job && !job.pego) {
    // Espera o mascote ficar livre; se ele não vem (0,35 s, ou 1,6 s se ainda estaciona no fim da escultura), os
    // lacres abrem sozinhos.
    if (podePegar()) { job.pego = true; seguirRonda(); }
    else if ((job.t += dt) > (mascote.ativo && !mascote.pronto ? 1.6 : 0.35)) {
      job = null;
      if (proximoLacre()) cascata = { t: -0.4 };
    }
  }
  if (job?.pego && job.fase === 'ida' && job.casa.estado !== 'enrolado') seguirRonda();   // o visitante abriu antes
  if (cascata && visivel) {
    cascata.t += dt;
    if (cascata.t >= 0) {
      const c = proximoLacre();
      if (c) { abrir(c, 'cascata'); cascata.t = -0.22; } else cascata = null;
    }
  }
  for (const c of casas) {
    const pergaminho = c.pergaminho;
    if (!pergaminho) continue;
    if (pergaminho.ocupado) { pergaminho.avancar(dt); c.sujo = true; }
    if (c.estado === 'abrindo') {
      c.t += dt;
      const u = Math.min(1, c.t / DESCIDA);
      c.aberto = saidaCubica(u);
      if (u >= 1) c.estado = 'aberto';
      pergaminho.definir({ aberto: c.aberto });   // a vara de baixo rola junto
      recortar(c);
      c.sujo = true;
    }
    // Fora da vista, só marca: redesenha quando a seção voltar.
    if (c.sujo && visivel) { pergaminho.pintar(); c.sujo = false; }
  }
  if (visivel && !reduzido()) { moverPetalas(dt); pintarPetalas(); }
  return (job && !(job.fase === 'poleiro' && reduzido())) || !!cascata
    || casas.some(c => c.estado === 'abrindo' || c.pergaminho?.ocupado)
    || (visivel && !reduzido() && petalas.length > 0);
}

function aoVer(entradas) {
  const e = entradas[entradas.length - 1];   // num lote, vale o mais recente
  visivel = e.isIntersecting;
  // Fração da TELA que a seção cobre: numa janela mais baixa que os 600 px mínimos da seção, a razão de interseção
  // nunca chegaria a 60% e os lacres nunca abririam.
  const fracao = e.intersectionRect.height / Math.min(e.boundingClientRect.height, innerHeight);
  if (fracao >= 0.5 && !vista) { vista = true; emitir('contato-visto', { noite }); }
  // Cada vez que a seção volta a ficar 60% à vista sem trabalho, o mascote volta (sem repetir a saudação).
  const agora = fracao >= 0.6;
  if (agora && !cheia && !job) job = { fase: 'espera', t: 0, pego: false };
  cheia = agora;
  for (const c of casas) c.sujo = true;
  acordar();
}

// A troca de densidade de pixels (arrastar a janela para outro monitor, zoom) nem sempre dispara resize.
function vigiarDpr() {
  matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`).addEventListener('change', () => { layout(); acordar(); vigiarDpr(); }, { once: true });
}

// ---------- entrada e o que a Fase 2 usa ----------

export function iniciar() {
  if (!secao || !campo || !fx || !lista) return;
  ligarWhatsapp();
  casas = [...lista.querySelectorAll('.casa')].map(prepararCasa);
  if (!casas.length) return;
  assento = casas.find(c => c.tipo === 'tesouro') ?? casas[0];
  definirNoite(new Date().getHours() < 5);
  montarLaje();
  if (!layout()) return;
  for (const c of casas) {
    c.arte.addEventListener('pointerenter', () => apontar(c));
    c.caixa.addEventListener('pointerenter', () => apontar(c));
    c.caixa.addEventListener('click', () => abrir(c, 'visitante'));
    c.caixa.addEventListener('focusin', () => { abrir(c, 'visitante'); apontar(c); });
    c.canvas.addEventListener('contextrestored', () => { c.sujo = true; acordar(); });
  }
  document.getElementById('copiar-email')?.addEventListener('click', copiarEmail);
  let pedido = 0;
  addEventListener('resize', () => { pedido ||= requestAnimationFrame(() => { pedido = 0; layout(); acordar(); }); });
  vigiarDpr();
  document.fonts?.ready.then(() => { layout(); acordar(); });
  aoMudar(ligado => { if (ligado) terminar(); acordar(); });
  new MutationObserver(() => {
    for (const c of casas) { c.pergaminho?.definir({ metal: metalDoSite() }); c.sujo = true; }
    acordar();
  }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-metal'] });
  trabalho(tarefa);
  registrar(quadro);
  if (!('IntersectionObserver' in window)) { visivel = true; terminar(); return; }
  if (reduzido()) terminar();
  else for (const c of casas) c.caixa.classList.add('enrolado');
  new IntersectionObserver(aoVer, { threshold: [0, 0.2, 0.4, 0.5, 0.6, 0.8, 1] }).observe(secao);
}

// O campo noturno (antes das 5h): paleta de noite, estrelas piscando, portas acesas e um halo nas casas.
export function definirNoite(ligada) {
  noite = !!ligada;
  secao?.classList.toggle('noite', noite);
}

// Solta o trabalho do mascote (o jogo da velha, ao abrir, precisa dele livre). Lacres fechados esperam a próxima visita.
export function soltarContato() {
  job = null;
  acordar();
}

// Estado para as outras partes (somente leitura): medidas, pétalas em voo (px da seção), casas, laje.
export const contato = {
  secao, lista, geo, petalas, laje,
  get casas() { return casas; },
  get visivel() { return visivel; },
  get noite() { return noite; },
  get fase() { return job?.pego ? job.fase : null; },        // 'poleiro' = sentado num telhado
  get assento() { return assento?.tipo ?? null; },
};
