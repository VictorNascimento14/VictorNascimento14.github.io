// A primeira tela: o letreiro, o bloco de mármore e o show do escultor. Ele pousa no "t" do letreiro, procura o
// Victor, voa até o canto, arrasta o bloco com a ajuda do visitante e esculpe o retrato em 7 golpes (a cabeça só no
// último). Depois vira o companheiro da página. Especificação: spec 01 (herói e mascote); os números vêm de lá.
import { perfil, projetos } from '../dados/perfil.js';
import { github, numeroPt } from '../dados/redes.js';
import { mascote, falar, calar, virar, dirigir, colocar, virarCompanheiro, aoFicarPronto } from '../mascote.js';
import { montar, ponta as pontaDoSprite, QUADRO, GOLPE } from '../arte/escultor.js';
import { registrar, acordar } from '../nucleo/relogio.js';
import { dpr, encaixar, prepararCanvas, suave, limitar } from '../nucleo/pixel.js';
import { reduzido, aoMudar } from '../nucleo/movimento.js';
import { ler, gravar } from '../nucleo/memoria.js';
import { emitir } from '../nucleo/sinais.js';
import { prender, soltar, aoTentarDescer } from '../nucleo/rolagem.js';

const abertura = document.getElementById('inicio');
const nome = document.getElementById('nome');
const cena = document.getElementById('cena');
const busto = document.getElementById('busto');
const telaDaPedra = document.getElementById('escultura');
const camada = document.getElementById('camada-escultor');
const telaDoChao = document.getElementById('prologo-canvas');
const ajuda = document.getElementById('ajuda');
const ajudaRosto = document.getElementById('ajuda-rosto');
const ajudaFala = document.getElementById('ajuda-fala');
const medidor = document.getElementById('ajuda-medidor');
const puxar = document.getElementById('puxar');
const anuncio = document.getElementById('anuncio');

const FALAS = {
  oi: 'Ah, oi!',
  deNovo: 'Ah, você de novo!',
  sumiu: 'Sumiu, hein!',
  cade: `Cadê o ${perfil.nome}?`,
  ali: 'Ah, ali!',
  vindo: 'Hm, tá vindo...',
  essa: 'Essa aqui!',
  pesada: 'Pesadinha!',
  pronto: 'Pronto! Agora é hora de esculpir!',
  valeu: 'Valeu! Agora é hora de esculpir!',
  alguem: 'Parece que tem alguém por aqui...',
  bora: 'Boraa!',
  olhos: 'Aqui, achei os olhos!',
  calma: 'Calma, ainda não terminei!',
  fim: [
    'Sabia! Ele sempre esteve aqui...',
    `Esse é o ${perfil.nome}! Estuda Engenharia de Software e já opera sistemas em produção.`,
    'Constrói os produtos da Trynux e os sistemas da Campêlo Advocacia com agentes de IA, todo dia!',
    `Foram ${numeroPt(github.pullRequests)} PRs só em 2026! Vamos descendo que eu te mostro os ${projetos.length} projetos dele!`,
  ],
};
const CAIXA = {
  pedido: 'Me ajuda a puxar?',
  isso: 'Isso! De novo!',
  vindo: 'Tá vindo!',
  quase: 'Quase!',
  foi: 'Foi!',
  sozinho: 'Tá, eu puxo sozinho.',
};
const ANUNCIOS = {
  ajuda: 'O escultor pede ajuda: aperte Puxar algumas vezes para trazer o bloco.',
  fim: `O retrato de ${perfil.nome} está esculpido.`,
};

const LX = 1200, LY = 1000;          // unidades lógicas do canvas da pedra, esticado sobre a cena
const COLUNAS = 10, LINHAS = 16;     // a malha: 320 triângulos
const CABECA = 0.43;                 // célula que toca acima desta altura do bloco só cai no golpe final
const PUXOES = 8, PRIMEIRO = 0.1;    // o 1º puxão (sozinho) traz 10%; os 8 seguintes, o resto
// Os sete golpes em (u, v) do bloco: base, meio, ombros e, por último, a cabeça.
const ROTA = [[0.24, 0.89], [0.76, 0.89], [0.76, 0.7], [0.24, 0.7], [0.24, 0.5], [0.76, 0.5], [0.5, 0.24]];

let modo = 'carregando';   // carregando → prologo → escultura → fim | falhou
let blocoPronto = false;   // as duas imagens carregaram
let visita = { voltando: false, outroDia: false };
let heroiVisivel = true;
let cenaW = 1, cenaH = 1;
let geometriaSuja = true;
let geo = null;            // prólogo, px da camada: pouso, caminho, canto, chão
let geoPedra = null;       // o bloco no prólogo, px da cena: âncora da corda, translação escondida, ponto final
let pedra = null;          // a malha e as camadas do bloco, em unidades lógicas
let etapa = null;          // { nome, t, feitos }
let arrasto = null;
let obra = null;           // a escultura: voo, golpe, alvo
let corda = null;
let tremida = 0;
let translacao = { x: 0, y: 0 };
let rosto = null;          // o ator da caixa de ajuda
let lascas = [], poeiraDaPedra = [], poeiraDoChao = [];
let pedraSuja = false, chaoSujo = false;
let desenho = null;
let ultimoCutucao = -Infinity, ultimoAviso = -Infinity;
const bloco = new Image();

// ---------- utilidades ----------

function bezier(a, b, c, d, t) {
  const m = 1 - t;
  const k0 = m * m * m, k1 = 3 * m * m * t, k2 = 3 * m * t * t, k3 = t * t * t;
  return { x: k0 * a.x + k1 * b.x + k2 * c.x + k3 * d.x, y: k0 * a.y + k1 * b.y + k2 * c.y + k3 * d.y };
}

function novaTela(w, h) {
  const tela = document.createElement('canvas');
  tela.width = Math.max(1, Math.ceil(w));
  tela.height = Math.max(1, Math.ceil(h));
  return tela;
}

// Gerador de Park–Miller com semente fixa: a mesma malha em toda visita e em todo redimensionamento.
function sorteador(semente) {
  let s = semente;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function carregada(img) {
  if (img.complete && img.src) return img.naturalWidth ? Promise.resolve() : Promise.reject(new Error(img.src));
  return new Promise((ok, falha) => {
    img.addEventListener('load', ok, { once: true });
    img.addEventListener('error', () => falha(new Error(img.src)), { once: true });
  });
}

const anunciar = texto => { anuncio.textContent = texto; };

// ---------- a visita ----------

// Lembra a visita só neste navegador (a Fase 2, das conquistas, lê o mesmo registro). Quem já viu o retrato pronto
// volta sem trava e ganha outra saudação. Como `ultima` já sai regravada com hoje, o que valia antes vai no sinal
// 'visita' (quem ouvir depois recebe com `passados`).
function registrarVisita() {
  const hoje = new Date().toLocaleDateString('sv-SE');   // AAAA-MM-DD na data local
  const lida = ler('visita', null);
  const antes = lida && typeof lida === 'object' ? lida : {};
  const contagem = (Number(antes.contagem) || 0) + 1;
  visita = { voltando: !!antes.esculpido, outroDia: !!antes.ultima && antes.ultima !== hoje };
  gravar('visita', { primeira: antes.primeira ?? hoje, ultima: hoje, contagem, esculpido: !!antes.esculpido });
  emitir('visita', { ...visita, hoje, contagem });
}

function marcarEsculpido() {
  const lida = ler('visita', null);
  gravar('visita', { ...(lida && typeof lida === 'object' ? lida : {}), esculpido: true });
  emitir('esculpido');
}

const saudacao = () => (visita.voltando ? (visita.outroDia ? FALAS.sumiu : FALAS.deNovo) : FALAS.oi);

// ---------- geometria ----------

// O bloco sobre a caixa do busto: mesma altura e topo, 4,5% mais largo (px da cena; spec 01 §6.1).
function caixaDoBloco() {
  const c = cena.getBoundingClientRect(), b = busto.getBoundingClientRect();
  const h = Math.min(b.height, b.width * 1.5), w = h / 1.5;
  return { x: b.left - c.left + (b.width - 1.045 * w) / 2, y: b.top - c.top + (b.height - h) / 2, w: 1.045 * w, h };
}

const emPx = p => ({ x: (p.x * cenaW) / LX, y: (p.y * cenaH) / LY });
const emLogico = p => ({ x: (p.x * LX) / cenaW, y: (p.y * LY) / cenaH });
const paraUV = p => {
  const q = emLogico(p), r = pedra.r;
  return { u: (q.x - r.x) / r.w, v: (q.y - r.y) / r.h };
};
const deUV = ({ u, v }) => emPx({ x: pedra.r.x + u * pedra.r.w, y: pedra.r.y + v * pedra.r.h });

const rascunho = document.createElement('canvas');

// Topo da tinta da letra do pouso, em px da camada (spec 01 §6.7). Mede o glifo de verdade: a faixa de um caractere
// dá a caixa na tela; o mesmo glifo desenhado num rascunho dá onde a tinta começa e o meio da haste logo abaixo dele.
function topoDaLetra() {
  const texto = nome.firstChild, i = perfil.letraDoPouso;
  if (texto?.nodeType !== Node.TEXT_NODE || texto.length <= i) return null;
  const faixa = document.createRange();
  faixa.setStart(texto, i);
  faixa.setEnd(texto, i + 1);
  const r = faixa.getBoundingClientRect(), base = camada.getBoundingClientRect();
  const estilo = getComputedStyle(nome);
  const fonte = `${estilo.fontStyle} ${estilo.fontWeight} ${estilo.fontSize} ${estilo.fontFamily}`;
  const g = rascunho.getContext('2d', { willReadFrequently: true });
  g.font = fonte;
  const m = g.measureText(texto.data[i]);
  const sobe = m.actualBoundingBoxAscent, esquerda = m.actualBoundingBoxLeft;
  const largura = esquerda + m.actualBoundingBoxRight;
  if (!(r.width > 0 && sobe > 0 && largura > 0 && m.fontBoundingBoxAscent > 0)) return null;
  const margem = 4;
  rascunho.width = Math.ceil(largura) + 2 * margem;
  rascunho.height = Math.ceil(sobe) + 2 * margem;
  g.font = fonte;   // redimensionar o canvas zera o contexto
  g.fillText(texto.data[i], margem + esquerda, margem + sobe);
  const linha = g.getImageData(0, margem + Math.min(12, Math.max(1, Math.round(0.04 * sobe))), rascunho.width, 1).data;
  let x0 = -1, x1 = -1;
  for (let x = 0; x < rascunho.width; x++) {
    if (linha[x * 4 + 3] > 128) {
      if (x0 < 0) x0 = x;
      x1 = x;
    }
  }
  const tinta = x0 < 0 ? r.width / 2 : (x0 + x1) / 2 - margem - esquerda;
  return { x: r.left - base.left + tinta, y: r.top - base.top + m.fontBoundingBoxAscent - sobe };
}

// Caminho por comprimento de arco: trechos de Bézier amostrados (40 pontos cada) e interpolados.
function caminhoPorArco(trechos) {
  const pontos = [trechos[0][0]];
  for (const [a, b, c, d] of trechos) for (let k = 1; k <= 40; k++) pontos.push(bezier(a, b, c, d, k / 40));
  const acumulado = [0];
  for (let k = 1; k < pontos.length; k++) {
    acumulado.push(acumulado[k - 1] + Math.hypot(pontos[k].x - pontos[k - 1].x, pontos[k].y - pontos[k - 1].y));
  }
  const total = acumulado[acumulado.length - 1];
  return {
    total,
    em(s) {
      let k = 1;
      while (k < pontos.length - 1 && acumulado[k] < s) k++;
      const t = limitar((s - acumulado[k - 1]) / (acumulado[k] - acumulado[k - 1] || 1), 0, 1);
      return { x: pontos[k - 1].x + (pontos[k].x - pontos[k - 1].x) * t, y: pontos[k - 1].y + (pontos[k].y - pontos[k - 1].y) * t };
    },
  };
}

// O chão do prólogo, onde o bloco é arrastado: 4,5 px de sprite abaixo da amarração da corda (86% do bloco), px da cena.
const chaoDoBloco = (caixa, P) => caixa.y + 0.86 * caixa.h + 4.5 * P;

// Com a página no topo, o chão do prólogo fica à vista? Se não, a trava esconderia o show.
const showCabe = () =>
  cena.getBoundingClientRect().top + scrollY + chaoDoBloco(caixaDoBloco(), mascote.ator.pixel) <= innerHeight;

// O prólogo em px da camada: pouso no "t" (os pés 2 px de sprite abaixo do topo, o assento no topo), o chão a 86%
// do bloco, o canto esquerdo e o caminho: sobe para a direita, mergulha até o chão e desliza até o canto.
function medirPrologo() {
  const a = mascote.ator, P = a.pixel, pes = a.pes();
  const caixa = caixaDoBloco();
  const chao = Math.min(chaoDoBloco(caixa, P), cenaH - 2 * P - 4);
  const canto = { x: pes.x + 4, y: chao };
  const letra = topoDaLetra() ?? { x: 0.3 * cenaW, y: 0.35 * cenaH };
  const pouso = { x: letra.x, y: letra.y + 2 * P };
  const baixo = { x: Math.max(canto.x + 0.12 * cenaW, letra.x - 0.02 * cenaW), y: chao };
  const caminho = caminhoPorArco([
    [pouso, { x: pouso.x + 0.13 * cenaW, y: pouso.y - 0.08 * cenaH }, { x: baixo.x + 0.16 * cenaW, y: chao }, baixo],
    [baixo, { x: baixo.x + (canto.x - baixo.x) / 3, y: chao }, { x: baixo.x + ((canto.x - baixo.x) * 2) / 3, y: chao }, canto],
  ]);
  geo = { P, chao, canto, pouso, caminho };
  geoPedra = pedra ? medirPedraNoPrologo() : null;
}

// A corda vai das costas do mascote até a borda direita do bloco e tem o mesmo comprimento até o fim: o bloco
// começa inteiro escondido 8 px à esquerda da tela e termina no centro, com o mascote à direita dele.
function medirPedraNoPrologo() {
  const { borda, r } = pedra, a = mascote.ator;
  const ancora = emPx(borda.ancora);
  const direita = (borda.direita * cenaW) / LX;
  const escondido = -direita - 8;
  const corda = geo.canto.x - 2 * geo.P - (ancora.x + escondido);
  return {
    ancora,
    escondido,
    direita,
    esquerda: (r.x * cenaW) / LX,
    xFinal: Math.min(ancora.x + corda + 2 * geo.P, cenaW - (a.largura - a.pes().x) - 4),
    base: Math.min((borda.base * cenaH) / LY, cenaH) - 2,
  };
}

function recalcular() {
  geometriaSuja = false;
  cenaW = cena.offsetWidth || 1;
  cenaH = cena.offsetHeight || 1;
  if (blocoPronto) montarPedra();
  medirPrologo();
  chaoSujo = true;
}

// ---------- a pedra ----------

// Desenha o bloco na camada de pedra, mede a borda direita (onde a corda amarra) e monta a malha de triângulos com
// a capa (a pedra que ainda cobre o busto). Refeita num redimensionamento, o que já saiu continua fora.
function montarPedra() {
  const caixa = caixaDoBloco();
  const r = { x: (caixa.x * LX) / cenaW, y: (caixa.y * LY) / cenaH, w: (caixa.w * LX) / cenaW, h: (caixa.h * LY) / cenaH };
  const camadaDaPedra = novaTela(LX, LY);
  const g = camadaDaPedra.getContext('2d');
  g.drawImage(bloco, r.x, r.y, r.w, r.h);
  const alfa = g.getImageData(0, 0, LX, LY).data;
  const solido = (x, y) => x >= 0 && y >= 0 && x < LX && y < LY && alfa[(Math.floor(y) * LX + Math.floor(x)) * 4 + 3] > 50;

  // Borda direita: o x sólido mais à direita, de 6 em 6 linhas; a amarração fica a 86% da altura.
  const xMax = Math.min(LX - 1, Math.floor(r.x + r.w)), xMin = Math.max(0, Math.floor(r.x));
  const maisADireita = y => { for (let x = xMax; x >= xMin; x--) if (solido(x, y)) return x; return -1; };
  let direita = -1;
  for (let y = Math.max(0, Math.ceil(r.y)); y < Math.min(LY, r.y + r.h); y += 6) direita = Math.max(direita, maisADireita(y));
  const linha = Math.min(LY - 1, Math.round(r.y + 0.86 * r.h));
  const naLinha = maisADireita(linha);
  const borda = {
    direita: direita < 0 ? r.x + r.w : direita + 1,
    ancora: { x: naLinha < 0 ? r.x + 0.9 * r.w : naLinha - 3, y: linha },
    base: r.y + r.h,
  };

  // Malha: 11 × 17 pontos com tremor só nas linhas e colunas internas (a moldura fica reta), cada célula partida
  // por uma diagonal sorteada.
  const sorteio = sorteador(781);
  const cw = r.w / COLUNAS, ch = r.h / LINHAS;
  const pontos = [];
  for (let j = 0; j <= LINHAS; j++) {
    for (let i = 0; i <= COLUNAS; i++) {
      const x = r.x + i * cw + (i > 0 && i < COLUNAS ? (sorteio() - 0.5) * 0.82 * cw : 0);
      const y = r.y + j * ch + (j > 0 && j < LINHAS ? (sorteio() - 0.5) * 0.82 * ch : 0);
      pontos.push({ x, y });
    }
  }
  const pt = (i, j) => pontos[j * (COLUNAS + 1) + i];
  const triangulos = [];
  for (let j = 0; j < LINHAS; j++) {
    for (let i = 0; i < COLUNAS; i++) {
      const a = pt(i, j), b = pt(i + 1, j), c = pt(i + 1, j + 1), d = pt(i, j + 1);
      if (sorteio() > 0.5) triangulos.push([a, b, c], [a, c, d]);
      else triangulos.push([a, b, d], [b, c, d]);
    }
  }
  const antigas = pedra?.celulas;
  const celulas = triangulos.map((v, k) => {
    const c = { x: (v[0].x + v[1].x + v[2].x) / 3, y: (v[0].y + v[1].y + v[2].y) / 3 };
    const xs = v.map(p => p.x), ys = v.map(p => p.y);
    const caixaDaCelula = [
      Math.max(0, Math.floor(Math.min(...xs) - 2)), Math.max(0, Math.floor(Math.min(...ys) - 2)),
      Math.min(LX, Math.ceil(Math.max(...xs) + 2)), Math.min(LY, Math.ceil(Math.max(...ys) + 2)),
    ];
    return { v, c, caixa: caixaDaCelula, visivel: solido(c.x, c.y), saiu: antigas?.[k]?.saiu ?? false };
  });

  const capa = novaTela(LX, LY);
  const cg = capa.getContext('2d');
  cg.drawImage(camadaDaPedra, 0, 0);
  pedra = {
    r, borda, celulas, capa, cg, camada: camadaDaPedra,
    visiveis: celulas.filter(c => c.visivel).length,
    marcos: pedra?.marcos ?? {},
  };
  apagar(celulas.filter(c => c.saiu));
  lascas = [];
  poeiraDaPedra = [];
  if (!cena.dataset.revelado) cena.dataset.revelado = '0';
  // Pinta já, visível ou não: o busto nunca aparece sem a capa por cima.
  pintarPedra();
}

// Tira da capa as células que saíram, cada triângulo inflado 0,9 a partir do centro: sem frestas entre vizinhos.
function apagar(celulas) {
  const g = pedra.cg;
  g.globalCompositeOperation = 'destination-out';
  for (const { v, c } of celulas) {
    g.beginPath();
    v.forEach((p, i) => {
      const dx = p.x - c.x, dy = p.y - c.y, d = Math.hypot(dx, dy) || 1, k = (d + 0.9) / d;
      if (i) g.lineTo(c.x + dx * k, c.y + dy * k);
      else g.moveTo(c.x + dx * k, c.y + dy * k);
    });
    g.fill();
  }
  g.globalCompositeOperation = 'source-over';
}

// Um golpe em p (unidades lógicas): sai cada célula perto do golpe (elipse de 39% × 18% do bloco) que não toca a
// cabeça. No golpe final sai tudo o que sobrou de uma vez: o rosto aparece inteiro e nenhum golpe vem depois.
function golpearPedra(p, final) {
  const { r } = pedra;
  const linhaDaCabeca = r.y + CABECA * r.h;
  const soltas = pedra.celulas.filter(cel => !cel.saiu && (final || (
    !cel.v.some(q => q.y < linhaDaCabeca) &&
    ((cel.c.x - p.x) / (0.39 * r.w)) ** 2 + ((cel.c.y - p.y) / (0.18 * r.h)) ** 2 < 1)));
  for (const cel of soltas) cel.saiu = true;
  apagar(soltas);
  if (!reduzido() && heroiVisivel) for (const cel of soltas) if (cel.visivel) lascar(cel, p);
  pedraSuja = true;
  const progresso = Math.round((100 * pedra.celulas.filter(c => c.saiu && c.visivel).length) / Math.max(1, pedra.visiveis));
  cena.dataset.revelado = String(progresso);
  if (final) falar(FALAS.olhos, 2);
  else if (progresso > 25 && !pedra.marcos.bora) {
    pedra.marcos.bora = true;
    falar(FALAS.bora, 1.4);
  }
}

// A lasca é o próprio triângulo recortado da pedra, uma vez só (recortar a cada quadro é lento), mais 3 de poeira.
function lascar(cel, golpe) {
  const [x0, y0, x1, y1] = cel.caixa;
  const tela = novaTela(x1 - x0, y1 - y0);
  const g = tela.getContext('2d');
  g.beginPath();
  cel.v.forEach((q, i) => (i ? g.lineTo(q.x - x0, q.y - y0) : g.moveTo(q.x - x0, q.y - y0)));
  g.closePath();
  g.clip();
  g.drawImage(pedra.camada, -x0, -y0);
  const a = Math.random;
  lascas.push({
    cel, tela, x: 0, y: 0, angulo: 0, vida: 0,
    vx: (cel.c.x - golpe.x) * 2 + (a() - 0.5) * 75, vy: -35 - 100 * a(), giro: (a() - 0.5) * 5, duracao: 0.42 + 0.25 * a(),
  });
  if (lascas.length > 100) lascas.shift();
  for (let k = 0; k < 3; k++) {
    poeiraDaPedra.push({ x: cel.c.x, y: cel.c.y, vx: (a() - 0.5) * 95, vy: -50 * a(), vida: 0, lado: 1 + 2.5 * a() });
  }
  if (poeiraDaPedra.length > 220) poeiraDaPedra.splice(0, poeiraDaPedra.length - 220);
}

function animarPedra(dt) {
  if (!heroiVisivel) { lascas = []; poeiraDaPedra = []; }   // fora da vista, nem lasca nem poeira
  for (const l of lascas) {
    l.vida += dt;
    l.vy += 610 * dt;
    l.x += l.vx * dt;
    l.y += l.vy * dt;
    l.angulo += l.giro * dt;
  }
  for (const p of poeiraDaPedra) {
    p.vida += dt;
    p.vy += 130 * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
  }
  lascas = lascas.filter(l => l.vida < l.duracao);
  poeiraDaPedra = poeiraDaPedra.filter(p => p.vida < 0.65);
  const vivo = lascas.length > 0 || poeiraDaPedra.length > 0;
  if (heroiVisivel && (vivo || pedraSuja)) pintarPedra();
  return vivo;
}

const contextoDaPedra = () => telaDaPedra.getContext('2d');

function pintarPedra() {
  pedraSuja = false;
  const g = contextoDaPedra();
  g.clearRect(0, 0, LX, LY);
  g.drawImage(pedra.capa, 0, 0);
  for (const l of lascas) {
    const { c, caixa } = l.cel;
    g.globalAlpha = Math.max(0, 1 - l.vida / l.duracao);
    g.setTransform(1, 0, 0, 1, c.x + l.x, c.y + l.y);
    g.rotate(l.angulo);
    g.drawImage(l.tela, caixa[0] - c.x, caixa[1] - c.y);
  }
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.fillStyle = '#b8aa91';
  for (const p of poeiraDaPedra) {
    g.globalAlpha = Math.max(0, 0.65 - p.vida);
    g.fillRect(p.x - p.lado / 2, p.y - p.lado / 2, p.lado, p.lado);
  }
  g.globalAlpha = 1;
}

// Fim do show: a pedra toda fora e a memória das camadas devolvida.
function liberarPedra() {
  if (pedra) for (const cel of pedra.celulas) cel.saiu = true;
  pedra = null;
  lascas = [];
  poeiraDaPedra = [];
  telaDaPedra.width = telaDaPedra.height = 1;   // transparente e sem os 4,8 MB do canvas cheio
  cena.dataset.revelado = '100';
}

// ---------- o mascote no show ----------

// Põe os pés do mascote em p (px da camada); a ponta sai daí, para o lado onde ele olha.
function porPes(p) {
  const a = mascote.ator, pes = a.pes(), t = a.ponta();
  colocar({ x: p.x - pes.x + t.x, y: p.y - pes.y + t.y });
}

// Ponta no canvas do ator (px CSS) se ele olhasse para `dir`.
function pontaNoCanvas(dir) {
  const p = pontaDoSprite(dir), P = mascote.ator.pixel;
  return { x: (p.x - QUADRO.x0) * P, y: (p.y - QUADRO.y0) * P };
}

// No herói, o canvas do sprite fica a 8 px das laterais, 72 do topo (abaixo do cabeçalho) e 12 da base. `t`: a ponta
// no canvas (a da direção atual, ou a de outra direção quando o ponto é dela).
function limitarNoHeroi(p, t = mascote.ator.ponta()) {
  const a = mascote.ator;
  return {
    x: limitar(p.x, 8 + t.x, cenaW - 8 - (a.largura - t.x)),
    y: limitar(p.y, 72 + t.y, cenaH - 12 - (a.altura - t.y)),
  };
}

// A ponta como o visitante a vê no impacto: o canto do canvas encaixado como no desenho, mais o que o ator desloca
// o quadro naquele instante (recuo de 1 px de sprite para trás, pulinho e flutuação). As lascas nascem exatamente
// na ponta do cinzel.
function pontaDesenhada() {
  const a = mascote.ator, t = a.ponta(), p = mascote.ponto, d = a.deslocamento();
  return { x: encaixar(p.x - t.x) + t.x + d.x, y: encaixar(p.y - t.y) + t.y + d.y };
}

// As costas do mascote como desenhado (2 px de sprite atrás dos pés, 8 acima): onde a corda amarra nele.
function costas() {
  const a = mascote.ator, P = a.pixel, pes = a.pes(), t = a.ponta(), p = mascote.ponto, d = a.deslocamento();
  return {
    x: encaixar(p.x - t.x) + pes.x - 2 * P * a.estado.dir + d.x,
    y: encaixar(p.y - t.y) + pes.y - 8 * P + d.y,
  };
}

// ---------- o prólogo ----------

function entrar(nomeDaEtapa) {
  etapa = { nome: nomeDaEtapa, t: 0, feitos: new Set() };
}

// Um evento da etapa que acontece uma vez, no primeiro quadro em que o relógio dela passa do instante.
function quando(segundos, fn) {
  if (etapa.t >= segundos && !etapa.feitos.has(segundos)) {
    etapa.feitos.add(segundos);
    fn();
  }
}

// Uma cena translada o bloco (mais a tremida do pouso e a trepidação do arrasto).
function moverCena(tx, trepidacao) {
  const sx = tremida ? (Math.random() * 2 - 1) * 2.5 * tremida : 0;
  const sy = tremida ? (Math.random() * 2 - 1) * tremida : 0;
  translacao = { x: tx + sx, y: trepidacao + sy };
  cena.style.transform = `translate3d(${translacao.x}px, ${translacao.y}px, 0)`;
}

const ETAPAS = {
  // Sentado no topo do "t", asas fechadas: oi, cadê o Victor?, olha para um lado e para o outro.
  pouso() {
    mascote.ator.definir({ sentado: true, asas: 'fechadas' });
    porPes(geo.pouso);
    quando(0.35, () => falar(saudacao(), 1.2));
    quando(1.55, () => {
      falar(FALAS.cade, 1.3);
      virar(-1);
    });
    quando(2.05, () => virar(1));
    quando(2.55, () => virar(-1));
    if (etapa.t >= 2.9) entrar('voo');
  },

  // Levanta com um pulinho, sobe para a direita, mergulha até o chão e desliza rente a ele até o canto (~640 px/s,
  // suave nas pontas), sempre olhando para onde vai.
  voo() {
    const a = mascote.ator, { caminho } = geo;
    quando(0, () => {
      a.definir({ sentado: false, asas: 'rapidas' }).pular();
      falar(FALAS.ali, 1.1);
      etapa.x = geo.pouso.x;
      mascote.botao.classList.add('voando');
    });
    const u = Math.min(1, etapa.t / limitar(caminho.total / 640, 1.4, 2.4));
    const p = caminho.em(suave(u) * caminho.total);
    if (Math.abs(p.x - etapa.x) > 0.4) {
      virar(p.x < etapa.x ? -1 : 1);
      etapa.x = p.x;
    }
    porPes(p);
    if (u < 1) return;
    mascote.botao.classList.remove('voando');
    entrar('pega');
  },

  // No canto, batendo as asas. Sem o bloco ainda, espera (e avisa uma vez); com ele, o esconde logo à esquerda da
  // tela e amarra a corda.
  pega(dt) {
    const a = mascote.ator;
    a.definir({ asas: 'batendo', sentado: false });
    porPes(geo.canto);
    if (!pedra) {
      etapa.t = 0;
      etapa.espera = (etapa.espera ?? 0) + dt;
      if (etapa.espera >= 1.2 && !etapa.avisou) {
        etapa.avisou = true;
        falar(FALAS.vindo, 1.8);
      }
      return;
    }
    quando(0, () => {
      geoPedra ??= medirPedraNoPrologo();
      moverCena(geoPedra.escondido, 0);
    });
    quando(0.1, () => falar(FALAS.essa, 1.2));
    quando(0.6, () => {
      a.pular();
      virar(1);
      corda = { alfa: 0, folga: 1, alvo: 1, solta: false };
    });
    if (etapa.t < 0.95) return;
    arrasto = { meta: 0, hp: 0, sp: 0, tranco: 0, puxoes: 0, ocioso: 0, pediu: false, sozinho: false };
    entrar('arrasto');
  },

  // Duas molas: o mascote lidera (taxa 9) e o bloco vem atrás (taxa 5), arrastando no chão com poeira. É isso que
  // dá peso ao bloco; a corda estica quando ele está à frente e afrouxa quando o bloco o alcança.
  arrasto(dt) {
    const a = mascote.ator, h = arrasto, g = geoPedra;
    quando(0, () => {
      puxao();
      falar(FALAS.pesada, 1.3);
    });
    quando(1.1, pedirAjuda);
    if (h.pediu && h.meta < 1) {
      h.ocioso += dt;
      const limiar = !heroiVisivel ? 0.3 : h.sozinho ? 0.7 : h.puxoes ? 4 : 6;
      if (h.ocioso >= limiar) {
        if (!h.sozinho && heroiVisivel) {
          h.sozinho = true;
          ajudaFala.textContent = CAIXA.sozinho;
        }
        puxao();
      }
    }
    h.hp += (h.meta - h.hp) * (1 - Math.exp(-9 * dt));
    const antes = h.sp;
    h.sp += (h.hp - h.sp) * (1 - Math.exp(-5 * dt));
    if (h.meta === 1 && h.sp > 0.997) h.hp = h.sp = 1;
    h.tranco = Math.max(0, h.tranco - 3 * dt);
    a.definir({ asas: h.tranco > 0.35 ? 'rapidas' : 'batendo' });
    porPes({
      x: geo.canto.x + (g.xFinal - geo.canto.x) * h.hp,
      y: geo.chao - Math.round(Math.sin(h.tranco * Math.PI) * 1.5 * geo.P),
    });
    const andou = -g.escondido * (h.sp - antes);
    moverCena(g.escondido * (1 - h.sp), dt > 0 && andou / dt > 60 && Math.random() < 0.5 ? 1 : 0);
    poeiraDeArrasto(andou);
    if (corda) corda.alvo = Math.max(0, 1 - (h.hp - h.sp) * 30);
    if (h.sp < 1) return;
    esconderAjuda();
    entrar('assenta');
  },

  // O bloco chegou: baque com tremida e poeira dos dois lados; solta a corda, olha para o bloco e avisa.
  assenta() {
    const a = mascote.ator;
    quando(0, () => {
      tremida = 1;
      poeiraDePouso();
      a.definir({ asas: 'batendo' });
    });
    quando(0.25, () => {
      if (corda) corda.solta = true;
      a.pular();
      virar(-1);
    });
    quando(0.3, () => falar(arrasto.puxoes ? FALAS.valeu : FALAS.pronto, 2));
    porPes({ x: geoPedra.xFinal, y: geo.chao });
    moverCena(0, 0);
    if (etapa.t >= 2.3) comecarEscultura();
  },

  escultura(dt) {
    ESCULPIR[obra.fase](dt);
  },
};

// ---------- a caixa de ajuda ----------

function montarRosto() {
  return montar(ajudaRosto, { pixel: 3, reduzido: reduzido() }).definir({ dir: 1, asas: 'batendo' });
}

function acenderMedidor() {
  const acesas = Math.round((arrasto.meta - PRIMEIRO) / ((1 - PRIMEIRO) / PUXOES));
  medidor.querySelectorAll('.celula').forEach((celula, k) => celula.classList.toggle('acesa', k < acesas));
}

// Um puxão: o primeiro traz 10%, cada um dos 8 seguintes 1/8 do resto. O rostinho da caixa pula junto.
function puxao() {
  const h = arrasto;
  if (etapa?.nome !== 'arrasto' || !h || h.meta >= 1) return false;
  h.meta = h.meta < PRIMEIRO ? PRIMEIRO : Math.min(1, h.meta + (1 - PRIMEIRO) / PUXOES);
  if (h.meta > 0.9999) h.meta = 1;
  h.ocioso = 0;
  h.tranco = 1;
  acenderMedidor();
  rosto?.pular();
  return true;
}

function aoPuxar() {
  if (!puxao()) return;
  arrasto.puxoes++;
  arrasto.sozinho = false;
  const m = arrasto.meta;
  ajudaFala.textContent = m >= 1 ? CAIXA.foi : m >= 0.78 ? CAIXA.quase : m >= 0.5 ? CAIXA.vindo : CAIXA.isso;
  acordar();
}

// Pede ajuda. Fora da vista (quem chegou por um link ou já rolou para baixo) não há caixa: ele puxa sozinho, depressa.
function pedirAjuda() {
  arrasto.pediu = true;
  if (!heroiVisivel) return;
  calar();
  rosto ??= montarRosto();
  medidor.replaceChildren(...Array.from({ length: PUXOES }, () => Object.assign(document.createElement('i'), { className: 'celula' })));
  acenderMedidor();
  ajudaFala.textContent = CAIXA.pedido;
  ajuda.hidden = false;
  anunciar(ANUNCIOS.ajuda);
}

// Se o foco estava na caixa, ele vai para o mascote (sem rolar): ninguém fica com o foco num elemento sumido.
function esconderAjuda() {
  if (ajuda.hidden) return;
  const tinhaFoco = ajuda.contains(document.activeElement);
  ajuda.hidden = true;
  if (tinhaFoco) mascote.botao.focus({ preventScroll: true });
}

// Tentou descer com a página presa: com a caixa aberta o PUXAR dá pulinhos (no máximo a cada 0,9 s); sem ela, o
// escultor pede calma (no máximo a cada 6 s, e só se não estiver falando).
function aoTentar() {
  const agora = performance.now();
  if (!ajuda.hidden) {
    if (agora - ultimoCutucao < 900) return;
    ultimoCutucao = agora;
    puxar.classList.remove('cutucado');
    void puxar.offsetWidth;   // reinicia a animação
    puxar.classList.add('cutucado');
  } else if (modo !== 'carregando' && !mascote.falando && agora - ultimoAviso >= 6000) {
    ultimoAviso = agora;
    falar(FALAS.calma);
  }
}

// ---------- corda e poeira do chão ----------

function animarCorda(dt) {
  if (!corda) return;
  if (corda.solta) {
    corda.alfa -= 3.5 * dt;
    corda.folga += 6 * dt;
    if (corda.alfa <= 0) corda = null;
  } else {
    corda.alfa = Math.min(1, corda.alfa + 7 * dt);
    corda.folga += (corda.alvo - corda.folga) * (1 - Math.exp(-10 * dt));
  }
  chaoSujo = true;
}

function poeiraDeArrasto(andou) {
  if (!(andou > 0) || reduzido()) return;
  const g = geoPedra, x0 = g.esquerda + translacao.x, x1 = g.direita + translacao.x;
  const n = Math.floor(andou / 9 + Math.random());
  for (let k = 0; k < n; k++) {
    const x = x0 + Math.random() * (x1 - x0);
    if (x < 0 || x > cenaW) continue;
    poeiraDoChao.push({
      x, y: g.base, vx: -20 - 50 * Math.random(), vy: -18 - 46 * Math.random(),
      vida: 0, max: 0.45 + 0.4 * Math.random(), lado: Math.random() < 0.5 ? 2 : 3,
    });
  }
}

function poeiraDePouso() {
  if (reduzido()) return;
  const g = geoPedra;
  for (let k = 0; k < 18; k++) {
    const lado = k % 2 ? 1 : -1;
    poeiraDoChao.push({
      x: (lado > 0 ? g.direita : g.esquerda) + (Math.random() * 2 - 1) * 15, y: g.base,
      vx: lado * (40 + 90 * Math.random()), vy: -30 - 60 * Math.random(),
      vida: 0, max: 0.5 + 0.45 * Math.random(), lado: Math.random() < 0.5 ? 2 : 3,
    });
  }
}

function animarChao(dt) {
  for (const p of poeiraDoChao) {
    p.vida += dt;
    p.vy += 70 * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
  }
  poeiraDoChao = poeiraDoChao.filter(p => p.vida < p.max);
  const vivo = !!corda || poeiraDoChao.length > 0;
  if (vivo || chaoSujo) pintarChao();   // e uma última vez, para limpar
  chaoSujo = false;
  return vivo;
}

// Corda e poeira em quadrados de px CSS com as bordas no px de dispositivo, como o resto da arte em pixel.
function pintarChao() {
  const d = dpr();
  const g = prepararCanvas(telaDoChao, cenaW, cenaH);
  g.clearRect(0, 0, telaDoChao.width, telaDoChao.height);
  const quadrado = (x, y, lado) => {
    const x0 = Math.round(x * d), y0 = Math.round(y * d);
    g.fillRect(x0, y0, Math.round((x + lado) * d) - x0, Math.round((y + lado) * d) - y0);
  };
  if (corda && geoPedra && mascote.ator) {
    // Quadradinhos alternando claro e escuro a cada dois (corda torcida), numa curva que cede com a folga.
    const P = mascote.ator.pixel, lado = Math.max(2, Math.round(P / 2));
    const A = { x: geoPedra.ancora.x + translacao.x, y: geoPedra.ancora.y + translacao.y };
    const S = costas();
    const folga = corda.folga * 5 * P;
    const C = { x: (A.x + S.x) / 2, y: (A.y + S.y) / 2 + folga };
    const n = Math.max(2, Math.ceil((Math.hypot(S.x - A.x, S.y - A.y) + folga) / (0.8 * lado)));
    g.globalAlpha = Math.max(0, corda.alfa);
    for (let k = 0; k <= n; k++) {
      const t = k / n, m = 1 - t;
      g.fillStyle = Math.floor(k / 2) % 2 ? '#5c4427' : '#8a6a3e';
      quadrado(m * m * A.x + 2 * m * t * C.x + t * t * S.x - lado / 2, m * m * A.y + 2 * m * t * C.y + t * t * S.y - lado / 2, lado);
    }
    g.fillStyle = '#3a2b1b';   // o nó no bloco
    quadrado(A.x - lado, A.y - lado, 2 * lado);
  }
  g.fillStyle = '#c9bfad';
  for (const p of poeiraDoChao) {
    g.globalAlpha = 0.75 * (1 - p.vida / p.max);
    quadrado(p.x, p.y, p.lado);
  }
  g.globalAlpha = 1;
}

// ---------- a escultura ----------

function comecarEscultura() {
  modo = 'escultura';
  entrar('escultura');
  obra = { proximo: 0 };
  novoVoo();
}

// Alvo do golpe i: a ponta em px da camada, limitada à tela olhando para `dir`.
const alvoDoGolpe = (i, dir) => limitarNoHeroi(deUV({ u: ROTA[i][0], v: ROTA[i][1] }), pontaNoCanvas(dir));

// Voo até o próximo alvo (spec 01 §6.6). Se o alvo passa do alcance do braço, vira antes de sair (0,16 s): o golpe
// cai do lado para onde ele olha, então ele chega com o corpo do lado de onde veio. Cada voo arqueia para cima e
// curva para um lado diferente.
function novoVoo() {
  const i = obra.proximo++;
  const indice = obra.proximo;   // 1…7
  const a = mascote.ator;
  const alvo = alvoDoGolpe(i, a.estado.dir);
  const corpo = mascote.ponto.x - a.ponta().x + a.pes().x;
  const alcance = Math.abs(a.ponta().x - a.pes().x);
  const dir = alvo.x < corpo - alcance ? -1 : alvo.x > corpo + alcance ? 1 : a.estado.dir;
  const virou = virar(dir);
  const de = paraUV(mascote.ponto), para = paraUV(alvoDoGolpe(i, dir));
  const du = para.u - de.u, dv = para.v - de.v;
  const curva = Math.sin(indice * 2.4 + 0.8) * 0.25;
  obra.fase = 'voo';
  obra.alvo = i;
  obra.dir = dir;
  obra.voo = {
    de, para,
    entrada: indice === 1,
    c1: { u: de.u + 0.3 * du - curva * dv, v: de.v + 0.3 * dv + curva * du - 0.055 },
    c2: { u: para.u - 0.24 * du - curva * dv, v: para.v - 0.24 * dv + curva * du - 0.045 },
    t: virou ? -0.16 : 0,
    duracao: indice === 1 ? 1.05 : 0.3 + Math.min(0.85, Math.hypot(du, dv)) * 0.26,
  };
}

// Parado no alvo: a ponta no alvo olhando para o lado do golpe; olhando para o outro lado, o corpo fica onde está.
function segurarNoAlvo() {
  const alvo = alvoDoGolpe(obra.alvo, obra.dir), t = pontaNoCanvas(obra.dir), pes = mascote.ator.pes();
  porPes({ x: alvo.x - t.x + pes.x, y: alvo.y - t.y + pes.y });
}

function bater() {
  obra.fase = 'golpe';
  obra.t = 0;
  obra.bateu = false;
  mascote.ator.definir({ asas: 'batendo' }).golpear(impacto);
}

function impacto() {
  if (obra?.fase !== 'golpe' || obra.bateu) return;
  obra.bateu = true;
  golpearPedra(emLogico(pontaDesenhada()), obra.alvo === ROTA.length - 1);
}

const ESCULPIR = {
  voo(dt) {
    const v = obra.voo, a = mascote.ator;
    v.t += dt;
    if (v.t < 0) {   // virando antes de sair
      a.definir({ asas: 'batendo' });
      return;
    }
    a.definir({ asas: 'rapidas', sentado: false });
    mascote.botao.classList.add('voando');
    const u = Math.min(1, v.t / v.duracao), s = suave(u), m = 1 - s;
    const k0 = m * m * m, k1 = 3 * m * m * s, k2 = 3 * m * s * s, k3 = s * s * s;
    const p = deUV({
      u: k0 * v.de.u + k1 * v.c1.u + k2 * v.c2.u + k3 * v.para.u,
      v: k0 * v.de.v + k1 * v.c1.v + k2 * v.c2.v + k3 * v.para.v,
    });
    colocar(v.entrada ? p : limitarNoHeroi(p));   // o voo de entrada sai do chão: não é limitado no caminho
    if (u < 1) return;
    mascote.botao.classList.remove('voando');
    a.definir({ asas: 'batendo' });
    segurarNoAlvo();
    if (!v.entrada) {
      bater();
      return;
    }
    obra.fase = 'olhando';
    obra.t = 0;
    falar(FALAS.alguem, 2.1);
  },

  // Só antes do primeiro golpe: 2,4 s olhando para os lados a cada 0,48 s, terminando como começou.
  olhando(dt) {
    obra.t += dt;
    const vez = Math.min(4, Math.floor(obra.t / 0.48));
    virar(vez % 2 ? -obra.dir : obra.dir);
    segurarNoAlvo();
    if (obra.t < 2.4) return;
    virar(obra.dir);
    segurarNoAlvo();
    bater();
  },

  golpe(dt) {
    obra.t += dt;
    segurarNoAlvo();
    if (obra.t >= GOLPE.impacto) impacto();   // se o ator foi refeito no meio do golpe, o impacto não se perde
    if (obra.t < GOLPE.total) return;
    if (obra.alvo < ROTA.length - 1) novoVoo();
    else obra.fase = 'final';
  },

  // Depois do golpe final, a fala dos olhos fica ~1,5 s à vista antes de ele virar companheiro.
  final(dt) {
    obra.t += dt;
    segurarNoAlvo();
    if (obra.t >= GOLPE.impacto + 1.5) terminar();
  },
};

// ---------- o show ----------

function comecarPrologo() {
  if (modo !== 'carregando') return;
  modo = 'prologo';
  document.body.classList.add('esculpindo');
  mascote.botao.disabled = false;
  recalcular();
  mascote.ator.definir({ dir: 1, sentado: true, asas: 'fechadas' });
  entrar('pouso');
  porPes(geo.pouso);
  dirigir(show);
  desenho ??= registrar(desenhar);
}

// Roda dentro do quadro do mascote, antes de ele avançar e ser pintado. Um erro aqui não prende ninguém: o show
// termina como se tivesse acabado.
function show(dt) {
  try {
    if (geometriaSuja) recalcular();
    tremida = Math.max(0, tremida - 4 * dt);
    etapa.t += dt;
    ETAPAS[etapa.nome](dt);
    animarCorda(dt);
  } catch (erro) {
    console.error('[herói] o show parou:', erro);
    terminar();
  }
}

// O resto do quadro, depois do mascote: o rostinho da caixa, a pedra (lascas e poeira) e o chão (corda e poeira).
function desenhar(dt) {
  if (rosto && !ajuda.hidden) rosto.avancar(reduzido() ? 0 : dt).pintar();
  const pedraViva = pedra ? animarPedra(dt) : false;
  const chaoVivo = animarChao(dt);
  if (pedraViva || chaoVivo || modo === 'prologo' || modo === 'escultura') return pedraViva || chaoVivo;
  // Show encerrado e o chão já limpo: o herói sai do relógio e os canvases devolvem a memória.
  desenho?.();
  desenho = null;
  telaDoChao.width = telaDoChao.height = 1;
  return false;
}

// Fim do show (ou fim forçado: movimento reduzido ligado no meio, erro). O retrato fica inteiro, a página solta e
// o escultor vira companheiro saindo de onde está, mesmo fora da vista.
function terminar() {
  if (modo === 'fim' || modo === 'falhou') return;
  modo = 'fim';
  esconderAjuda();
  etapa = obra = arrasto = corda = null;
  poeiraDoChao = [];
  chaoSujo = true;
  tremida = 0;
  cena.style.transform = 'none';
  liberarPedra();
  soltar();
  marcarEsculpido();
  anunciar(ANUNCIOS.fim);
  aoFicarPronto(() => { if (!reduzido()) falar(FALAS.fim); });
  const caixa = camada.getBoundingClientRect(), p = mascote.ponto;
  dirigir(null);
  mascote.botao.classList.remove('voando');
  virarCompanheiro({ x: p.x + caixa.left, y: p.y + caixa.top });
}

// Movimento reduzido: sem show. Com as imagens prontas, o busto aparece esculpido e o escultor já está em casa.
function chegadaParada() {
  modo = 'fim';
  cena.style.transform = 'none';
  cena.dataset.revelado = '100';
  document.body.classList.add('esculpindo');
  soltar();
  marcarEsculpido();
  virarCompanheiro();
}

function imagensProntas() {
  document.body.classList.remove('carregando');
  if (modo === 'falhou') return;
  document.body.classList.add('pronto');
  if (modo === 'fim') return;
  if (reduzido()) {
    chegadaParada();
    return;
  }
  // A malha é montada (e a capa pintada) no próximo recálculo, antes de a cena entrar na tela: até lá ela segue
  // escondida à esquerda, então o busto nunca aparece sem a pedra por cima.
  blocoPronto = true;
  geometriaSuja = true;
  if (modo === 'carregando') comecarPrologo();
  acordar();
}

// Imagem do busto ou do bloco não veio: sem pedra e sem escultor, o busto no lugar e a página solta.
function falhar() {
  document.body.classList.remove('carregando');
  if (modo === 'fim' || modo === 'falhou') return;
  modo = 'falhou';
  document.body.classList.add('falhou');
  dirigir(null);
  esconderAjuda();
  etapa = obra = arrasto = corda = null;
  poeiraDoChao = [];
  chaoSujo = true;
  telaDaPedra.hidden = true;
  camada.hidden = true;
  cena.style.transform = 'none';
  soltar();
}

export function iniciar() {
  if (!abertura || !cena || !busto || !camada || !mascote.ator) return;
  registrarVisita();
  telaDaPedra.width = LX;
  telaDaPedra.height = LY;
  document.body.classList.add('carregando');
  // A primeira visita fica presa na primeira tela até o retrato ficar pronto. Quem volta, quem chega por um link
  // com âncora e quem prefere menos movimento rolam livres desde o começo; numa janela mais baixa que o show (celular
  // deitado, zoom de 200%) também, senão ele aconteceria abaixo da dobra, com a página presa no topo.
  if (reduzido()) cena.style.transform = 'none';
  else if (!location.hash && !visita.voltando && showCabe()) prender();

  aoTentarDescer(aoTentar);
  puxar.addEventListener('click', aoPuxar);
  new IntersectionObserver(([registro]) => {
    heroiVisivel = registro.isIntersecting;
    if (!heroiVisivel) return;
    pedraSuja = true;
    acordar();
  }).observe(abertura);
  addEventListener('resize', () => {
    geometriaSuja = true;
    if (rosto) rosto = montarRosto();
    // Virou o celular ou deu zoom no meio do show e ele não cabe mais: a página não fica presa.
    if (modo !== 'fim' && modo !== 'falhou' && !showCabe()) soltar();
    acordar();
  });
  document.fonts?.addEventListener('loadingdone', () => { geometriaSuja = true; });
  // Ligou o movimento reduzido no meio do show: termina na hora, tudo esculpido.
  aoMudar(parado => {
    if (!parado) return;
    if (modo === 'prologo' || modo === 'escultura') terminar();
    else if (modo === 'carregando') cena.style.transform = 'none';
  });

  // O show começa com a fonte do letreiro pronta (o pouso mede o glifo; teto de 1,5 s) ou com as imagens, o que
  // vier primeiro. Sem o bloco, o mascote espera no canto.
  Promise.race([document.fonts?.load('400 100px Italiana'), new Promise(ok => setTimeout(ok, 1500))])
    .catch(() => {})
    .then(() => { if (modo === 'carregando' && !reduzido()) comecarPrologo(); });
  Promise.all([carregada(busto), carregada(bloco)]).then(imagensProntas, falhar);
  bloco.src = 'assets/img/bloco.webp';
}
