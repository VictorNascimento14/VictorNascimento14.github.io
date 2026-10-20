// Mestre de obras: a área restrita (/admin/) e o Tetris dela (docs/arquitetura.md §10, trilha Admin).
//
// Três partes neste arquivo:
//  1. o motor, puro (sem DOM; tests/tetris.test.js): poço de 10 × 20 com duas fileiras escondidas em cima, as sete
//     peças na caixa do SRS, giro horário com chute simples (parede e chão), saco de sete, queda que acelera por
//     nível, meio segundo de folga antes de travar e a pontuação da diretriz (100/300/500/800 × nível; 1 ponto por
//     fileira descida, 2 por fileira solta);
//  2. a arte: blocos de mármore e de bronze em pixel art (8 × 8 px de arte por célula), moldura de bronze, o risco
//     de giz onde a peça vai cair, a rachadura, as lascas e o cadeado da porta;
//  3. a página: o login de mentira, a entrada do escultor, o jogo (teclado e toque), o placar e as conquistas.
// O teste importa este arquivo no Node, então nos imports estáticos só entra o que roda sem DOM; movimento, cursor e
// conquistas chegam por import() dentro de iniciar() (e uma conquista que falha não derruba o jogo).
import { registrar, acordar } from '../nucleo/relogio.js';
import { sorteio, suave, dpr, encaixar } from '../nucleo/pixel.js';
import { ouvir } from '../nucleo/sinais.js';
import { montar, QUADRO } from '../arte/escultor.js';

// ---------- 1. o motor ----------

export const COLUNAS = 10;
export const LINHAS = 20;
export const ESCONDIDAS = 2;                  // fileiras acima do poço, onde a peça nasce
export const ALTURA = LINHAS + ESCONDIDAS;
export const TIPOS = 'IOTSZJL';               // no tabuleiro, cada peça é a posição dela aqui + 1
// As sete peças no estado de nascença do SRS, cada uma na sua caixa (I 4 × 4, O 2 × 2, as outras 3 × 3): girar a
// caixa inteira é o giro do SRS, sem tabela.
export const PECAS = {
  I: ['....', 'IIII', '....', '....'],
  O: ['OO', 'OO'],
  T: ['.T.', 'TTT', '...'],
  S: ['.SS', 'SS.', '...'],
  Z: ['ZZ.', '.ZZ', '...'],
  J: ['J..', 'JJJ', '...'],
  L: ['..L', 'LLL', '...'],
};
// Chute simples: se o giro bate, tenta no lugar, um para cada lado, um para cima (o chão) e dois para cada lado (o I).
export const CHUTES = [[0, 0], [-1, 0], [1, 0], [0, -1], [-2, 0], [2, 0]];
export const PONTOS_POR_FILEIRA = [0, 100, 300, 500, 800];
export const LIMPEZA = 0.36;                  // s: a fileira racha (metade) e se desfaz em lascas (metade)
export const TRAVA = 0.5;                     // s apoiada antes de travar
export const AJUSTES = 15;                    // giros e passos que seguram a trava, por peça
export const QUEDA_RAPIDA = 0.035;            // s por fileira com ↓ segurado

export const vazio = () => Array.from({ length: ALTURA }, () => new Array(COLUNAS).fill(0));

// Uma peça nova, no alto e no meio (colunas 4 a 6 da diretriz; o I e o O também centrados).
export function peca(tipo, serie = 0) {
  const linhas = PECAS[tipo];
  const celulas = [];
  linhas.forEach((linha, y) => [...linha].forEach((c, x) => { if (c !== '.') celulas.push([x, y]); }));
  return { tipo, n: linhas.length, celulas, x: Math.floor((COLUNAS - linhas.length) / 2), y: 0, serie };
}

export const celulasDa = p => p.celulas.map(([x, y]) => [p.x + x, p.y + y]);

export function colide(tabuleiro, p) {
  return celulasDa(p).some(([x, y]) => x < 0 || x >= COLUNAS || y < 0 || y >= ALTURA || tabuleiro[y][x] !== 0);
}

// Gira a caixa (sentido 1 = horário). As células mantêm a ordem: a textura de cada bloco não troca ao girar.
export function girar(p, sentido = 1) {
  const n = p.n - 1;
  return { ...p, celulas: p.celulas.map(([x, y]) => (sentido > 0 ? [n - y, x] : [y, n - x])) };
}

export function mover(tabuleiro, p, dx, dy) {
  const q = { ...p, x: p.x + dx, y: p.y + dy };
  return colide(tabuleiro, q) ? null : q;
}

export function tentarGirar(tabuleiro, p, sentido = 1) {
  const girada = girar(p, sentido);
  for (const [dx, dy] of CHUTES) {
    const q = mover(tabuleiro, girada, dx, dy);
    if (q) return q;
  }
  return null;
}

// Quantas fileiras a peça ainda desce (o risco de giz e a queda instantânea).
export function queda(tabuleiro, p) {
  let d = 0;
  while (!colide(tabuleiro, { ...p, y: p.y + d + 1 })) d++;
  return d;
}

// Grava a peça no tabuleiro. O valor guarda a peça (1–7) e, de 8 em 8, qual das quatro texturas cada bloco usa.
export const codigo = (p, i) => TIPOS.indexOf(p.tipo) + 1 + 8 * ((p.serie + i) % 4);
export function fixar(tabuleiro, p) {
  const novo = tabuleiro.map(fileira => fileira.slice());
  celulasDa(p).forEach(([x, y], i) => { novo[y][x] = codigo(p, i); });
  return novo;
}

export const completas = tabuleiro => tabuleiro.flatMap((fileira, y) => (fileira.every(Boolean) ? [y] : []));

export function limpar(tabuleiro, fileiras) {
  const resto = tabuleiro.filter((_, y) => !fileiras.includes(y));
  return [...Array.from({ length: tabuleiro.length - resto.length }, () => new Array(COLUNAS).fill(0)), ...resto];
}

export const pontuar = (fileiras, nivel) => PONTOS_POR_FILEIRA[fileiras] * nivel;
export const nivelDe = linhas => 1 + Math.floor(linhas / 10);
// Segundos por fileira (curva da diretriz): 1 s no nível 1, 0,36 no 5, 0,064 no 10; do 15 em diante não acelera mais.
export function tempoDeQueda(nivel) {
  const n = Math.min(nivel, 15) - 1;
  return (0.8 - n * 0.007) ** n;
}

// Saco de sete: cada sequência de sete traz uma peça de cada, embaralhada (Fisher–Yates).
export function criarSaco(aleatorio = Math.random) {
  let saco = [];
  return () => {
    if (!saco.length) {
      saco = [...TIPOS];
      for (let i = saco.length - 1; i > 0; i--) {
        const j = Math.floor(aleatorio() * (i + 1));
        [saco[i], saco[j]] = [saco[j], saco[i]];
      }
    }
    return saco.pop();
  };
}

export function criarPartida(aleatorio = Math.random) {
  const proximo = criarSaco(aleatorio);
  const p = {
    tabuleiro: vazio(), proximo, proxima: proximo(), peca: null, serie: 0, linhas: 0, pontos: 0, nivel: 1,
    fim: false, queda: 0, travar: 0, ajustes: 0, fundo: 0, limpando: null,
  };
  nascer(p);
  return p;
}

// Nasce nas fileiras escondidas e desce uma na hora, como na diretriz: a base da peça já aparece. Sem lugar, desabou.
function nascer(p) {
  const nova = peca(p.proxima, ++p.serie);
  p.proxima = p.proximo();
  p.peca = mover(p.tabuleiro, nova, 0, 1) ?? (colide(p.tabuleiro, nova) ? null : nova);
  Object.assign(p, { queda: 0, travar: 0, ajustes: 0, fundo: p.peca?.y ?? 0 });
  if (!p.peca) p.fim = true;
  return !p.fim;
}

function travarPeca(p, eventos) {
  const celulas = celulasDa(p.peca);
  p.tabuleiro = fixar(p.tabuleiro, p.peca);
  eventos.push({ tipo: 'fixou', celulas });
  // Travou inteira acima do poço: não cabe mais nada.
  if (celulas.every(([, y]) => y < ESCONDIDAS)) {
    p.peca = null;
    p.fim = true;
    eventos.push({ tipo: 'fim' });
    return;
  }
  const fileiras = completas(p.tabuleiro);
  if (fileiras.length) {
    const ganho = pontuar(fileiras.length, p.nivel);
    const antes = p.nivel;
    p.pontos += ganho;
    p.linhas += fileiras.length;
    p.nivel = nivelDe(p.linhas);
    p.peca = null;
    p.limpando = { fileiras, t: 0 };
    eventos.push({ tipo: 'linhas', fileiras, quantas: fileiras.length, ganho });
    if (p.nivel > antes) eventos.push({ tipo: 'nivel', nivel: p.nivel });
    return;
  }
  if (!nascer(p)) eventos.push({ tipo: 'fim' });
}

// Um comando do jogador: 'esquerda' | 'direita' | 'girar' | 'descer' | 'soltar'. Devolve os eventos.
export function comandar(p, acao) {
  const eventos = [];
  if (p.fim || p.limpando || !p.peca) return eventos;
  if (acao === 'soltar') {
    const d = queda(p.tabuleiro, p.peca);
    p.peca = { ...p.peca, y: p.peca.y + d };
    p.pontos += 2 * d;
    eventos.push({ tipo: 'soltou', distancia: d });
    travarPeca(p, eventos);
    return eventos;
  }
  const apoiada = !mover(p.tabuleiro, p.peca, 0, 1);
  const nova = acao === 'girar'
    ? tentarGirar(p.tabuleiro, p.peca, 1)
    : mover(p.tabuleiro, p.peca, acao === 'esquerda' ? -1 : acao === 'direita' ? 1 : 0, acao === 'descer' ? 1 : 0);
  if (!nova) return eventos;
  p.peca = nova;
  // Fileira nova mais funda: a conta dos ajustes recomeça.
  if (nova.y > p.fundo) { p.fundo = nova.y; p.ajustes = 0; }
  if (acao === 'descer') {
    p.pontos += 1;
    p.queda = 0;
  } else if (apoiada && p.ajustes < AJUSTES) {
    // Ajeitar a peça apoiada segura a trava, mas não para sempre.
    p.travar = 0;
    p.ajustes++;
  }
  eventos.push({ tipo: acao === 'girar' ? 'girou' : 'moveu' });
  return eventos;
}

// O tempo passa: a fileira que racha termina de sair, a peça cai e, apoiada por TRAVA segundos, trava.
// rapido: ↓ segurado (queda rápida, 1 ponto por fileira).
export function avancarPartida(p, dt, rapido = false) {
  const eventos = [];
  if (p.fim) return eventos;
  if (p.limpando) {
    p.limpando.t += dt;
    if (p.limpando.t >= LIMPEZA) {
      p.tabuleiro = limpar(p.tabuleiro, p.limpando.fileiras);
      p.limpando = null;
      if (!nascer(p)) eventos.push({ tipo: 'fim' });
    }
    return eventos;
  }
  const intervalo = rapido ? Math.min(tempoDeQueda(p.nivel), QUEDA_RAPIDA) : tempoDeQueda(p.nivel);
  p.queda += dt;
  while (p.queda >= intervalo) {
    const abaixo = mover(p.tabuleiro, p.peca, 0, 1);
    if (!abaixo) { p.queda = 0; break; }
    p.queda -= intervalo;
    p.peca = abaixo;
    if (rapido) p.pontos += 1;
    if (abaixo.y > p.fundo) { p.fundo = abaixo.y; p.ajustes = 0; }
  }
  if (mover(p.tabuleiro, p.peca, 0, 1)) p.travar = 0;
  else if ((p.travar += dt) >= TRAVA) travarPeca(p, eventos);
  return eventos;
}

// ---------- 2. a arte ----------

const ARTE = 8;                               // px de arte por célula
const MOLDURA = 4;                            // px de arte da moldura de bronze
const TABULEIRO = { largura: COLUNAS * ARTE + 2 * MOLDURA, altura: LINHAS * ARTE + 2 * MOLDURA };   // 88 × 168
const PREVIA = { largura: 4 * ARTE + 4 + 2 * MOLDURA, altura: 2 * ARTE + 4 + 2 * MOLDURA };         // 44 × 28

// Uma pedra por peça, na ordem de TIPOS. O bronze (O) é o metal do site e funde junto quando o ateliê vira prata ou
// ouro; a pátina (L) é bronze velho, verde, com o metal aparecendo. Chaves: o junta, s sombra, m corpo, l luz,
// h brilho, v veio (ou pinta escura), w pinta clara.
const PEDRAS = [
  { nome: 'mármore de Carrara', desenho: 'veio', cores: { o: '#8f897c', s: '#bdb6a7', m: '#e1ddd2', l: '#f3f0e8', h: '#ffffff', v: '#a39d90', w: '#f9f7f2' } },
  { nome: 'bronze', desenho: 'metal', cores: null },
  { nome: 'mármore verde', desenho: 'veio', cores: { o: '#3e4534', s: '#636d4e', m: '#87936d', l: '#a8b38f', h: '#c7d0b0', v: '#5c6647', w: '#b6c09d' } },
  { nome: 'travertino', desenho: 'faixas', cores: { o: '#6b5732', s: '#a48d5c', m: '#cbb688', l: '#e0cfa7', h: '#f0e5c6', v: '#b19b6b', w: '#ddcca4' } },
  { nome: 'pórfiro', desenho: 'pontos', cores: { o: '#46190f', s: '#76301f', m: '#9e4632', l: '#bc644c', h: '#d6856b', v: '#6a2a1b', w: '#dc9d86' } },
  { nome: 'mármore cinza', desenho: 'veio', cores: { o: '#383f45', s: '#626b73', m: '#8a949c', l: '#aeb7be', h: '#d0d7dc', v: '#69727a', w: '#c3cbd0' } },
  { nome: 'bronze com pátina', desenho: 'patina', cores: { o: '#1f3f37', s: '#336657', m: '#4c8a7a', l: '#6fae9c', h: '#9bd0bf', v: '#8d6a3b', w: '#c09760' } },
];
// Quando a obra desaba, tudo vira pedra bruta, de baixo para cima.
const PEDRA_BRUTA = { o: '#2f2d2a', s: '#625e58', m: '#8c8880', l: '#ada99f', h: '#cbc7bd', v: '#77736c', w: '#bcb8ae' };
const GIZ = 'rgba(240, 239, 234, 0.4)';
const CLARAO = 'rgba(255, 248, 230, 0.5)';

// O cadeado da porta (11 × 15): alça de bronze e corpo com o buraco da chave; aberto, a alça sobe e solta a perna da
// esquerda. o contorno · d m l h os tons do metal · e o buraco.
const CADEADO = {
  fechado: ['...........', '...........', '...ooooo...', '..olllllo..', '.olooooodo.', '.olo...odo.', '.olo...odo.'],
  aberto: ['...ooooo...', '..olllllo..', '.olooooodo.', '.olo...odo.', '.olo...odo.', '.ooo...odo.', '.......odo.'],
  corpo: ['ooooooooooo', 'ohhhhhhhhmo', 'ollleeellmo', 'ollleeellmo', 'ollllelllmo', 'ollllelllmo', 'ommmmmmmmdo', '.ooooooooo.'],
};

// O desenho 8 × 8 de um bloco: bisel (luz em cima e à esquerda, sombra embaixo e à direita) e o miolo da pedra.
// Quatro variações por pedra, sempre as mesmas (semente fixa).
function desenhoDoBloco(desenho, variante, semente) {
  const r = sorteio(semente);
  const fim = ARTE - 1;
  const g = Array.from({ length: ARTE }, (_, y) => Array.from({ length: ARTE }, (_, x) => {
    if (x === 0 && y === 0) return 'h';
    if ((x === fim && y === 0) || (x === 0 && y === fim)) return 'm';
    if (x === 0 || y === 0) return 'l';
    if (x === fim && y === fim) return 'o';
    return x === fim || y === fim ? 's' : 'm';
  }));
  const dentro = () => 1 + Math.floor(r() * (ARTE - 2));
  if (desenho === 'veio') {
    // Um veio atravessa a pedra, subindo e descendo um pixel por vez, e uma pinta clara.
    let y = dentro();
    for (let x = 1; x < fim; x++) {
      g[y][x] = 'v';
      const passo = r();
      if (passo < 0.3 && y > 1) y--;
      else if (passo > 0.7 && y < fim - 1) y++;
    }
    g[dentro()][dentro()] = 'w';
  } else if (desenho === 'faixas') {
    for (const y of [2 + (variante & 1), 5]) for (let x = 1; x < fim; x++) if (r() < 0.65) g[y][x] = 'v';
    g[dentro()][dentro()] = 'o';
  } else if (desenho === 'pontos') {
    for (let i = 0; i < 5; i++) g[dentro()][dentro()] = 'w';
    g[dentro()][dentro()] = 'v';
  } else if (desenho === 'metal') {
    // Chapa fundida: o brilho no canto e um cravo, cada variação num canto.
    g[1][1] = 'h'; g[1][2] = 'l'; g[2][1] = 'l';
    const [cx, cy] = [[2, 2], [5, 2], [2, 5], [5, 5]][variante];
    g[cy][cx] = 'h';
    g[cy + 1][cx + 1] = 's';
  } else if (desenho === 'patina') {
    for (let i = 0; i < 3; i++) g[dentro()][dentro()] = 'v';
    for (let i = 0; i < 2; i++) g[dentro()][dentro()] = 'w';
  }
  return g;
}

function pintarGrade(ctx, grade, cores, x0, y0, p) {
  for (let y = 0; y < grade.length; y++) {
    for (let x = 0; x < grade[y].length; x++) {
      const cor = cores[grade[y][x]];
      if (!cor) continue;
      ctx.fillStyle = cor;
      ctx.fillRect(x0 + x * p, y0 + y * p, p, p);
    }
  }
}

// Moldura de bronze (4 px de arte: contorno, bisel, corpo, borda funda), cravos nos cantos e o poço com a grade de
// obra marcada nos cantos das células.
function pintarMoldura(ctx, largura, altura, p, cores) {
  const faixa = (x, y, w, h, cor) => { ctx.fillStyle = cor; ctx.fillRect(x * p, y * p, w * p, h * p); };
  const [l0, l1, l2, l3, l4] = cores.liga;
  faixa(0, 0, largura, altura, cores.contorno);
  faixa(1, 1, largura - 2, altura - 2, l1);
  faixa(1, 1, largura - 3, 1, l3);
  faixa(1, 1, 1, altura - 3, l3);
  faixa(2, 2, largura - 4, altura - 4, l2);
  faixa(3, 3, largura - 6, altura - 6, l3);
  faixa(3, 3, largura - 7, 1, l0);
  faixa(3, 3, 1, altura - 7, l0);
  for (const [x, y] of [[2, 2], [largura - 3, 2], [2, altura - 3], [largura - 3, altura - 3]]) faixa(x, y, 1, 1, l4);
  faixa(MOLDURA, MOLDURA, largura - 2 * MOLDURA, altura - 2 * MOLDURA, cores.poco);
  for (let y = ARTE; y < altura - 2 * MOLDURA; y += ARTE) {
    for (let x = ARTE; x < largura - 2 * MOLDURA; x += ARTE) faixa(MOLDURA + x - 1, MOLDURA + y - 1, 1, 1, cores.grade);
  }
}

// ---------- 3. a página ----------

const META = 10;                              // linhas no total, somando as partidas, para a medalha `tetris`
const ATRASO = 0.16;                          // s segurando ← ou → até começar a repetir
const CADENCIA = 0.05;                        // s entre as repetições
const PETRIFICAR = 0.03;                      // s por fileira virando pedra quando desaba
const numero = new Intl.NumberFormat('pt-BR');

const FALAS = {
  entrada: 'Admin? Aqui não tem admin nenhum.',
  admin: 'Usuário admin? Clássico. Mas não tem admin nenhum.',
  senha: 'Essa senha todo mundo tenta. Só que não tem admin.',
  vazio: 'Sem usuário e sem senha? Nem precisa: não tem admin.',
  esqueci: 'Esqueceu a senha? Relaxa: nunca teve senha.',
  deNovo: 'De novo por aqui? Já falei: não tem admin.',
  canteiro: 'Isto aqui é só um canteiro de obras.',
  convite: 'Já que entrou, me ajuda a empilhar esses blocos?',
  comecar: ['Fiada por fiada!', 'Bora levantar essa obra.', 'Capricha no prumo.'],
  linhas: [[], ['Uma fiada!', 'Rachou certinho.', 'Boa!'], ['Duas de uma vez!', 'Duas fiadas!'], ['Três! Tá pegando o jeito.'], ['QUATRO! Obra de mestre!']],
  nivel: n => `Nível ${n}. A pedra cai mais rápido!`,
  medalha: 'Dez linhas! Virou mestre de obras.',
  pausa: 'Pausa pro cafezinho.',
  fim: ['Desabou tudo! Bora de novo?', 'Ruiu. Nem Roma saiu de primeira.'],
  recorde: n => `Desabou, mas é recorde: ${n} pontos!`,
};
const SENHAS_MANJADAS = new Set(['123', '1234', '12345', '123456', '12345678', '0000', '000000', 'senha', 'password', 'admin', 'root', 'qwerty', 'abc123']);
const AVISOS = {
  espera: ['Blocos no canteiro.', 'Dez linhas, somando as partidas, valem uma medalha.', 'começar a obra'],
  pausa: ['Pausa.', 'O canteiro espera. P também continua.', 'continuar'],
  fim: ['Desabou.', '', 'recomeçar'],
};
const TECLAS = { ArrowLeft: 'esquerda', ArrowRight: 'direita', ArrowUp: 'girar', ArrowDown: 'descer', ' ': 'soltar' };

let el = {};
let reduzido = () => false;                   // o de js/nucleo/movimento.js, ao vivo, depois de iniciar()
let conquistas = null;                        // o módulo, se carregou
let fase = 'porta';                           // 'porta' | 'entrando' | 'obra'
let estado = 'espera';                        // 'espera' | 'jogando' | 'pausado' | 'fim'
let partida = null;
let cores = null;                             // tokens do metal de agora, lidos do CSS
let Pd = 0, PdPrevia = 0;                     // px de dispositivo por px de arte (inteiros: pixel sempre igual)
let ctx = null, ctxPrevia = null, fundo = null;
const blocos = new Map();                     // sprites prontos: (px, código, bruta) → canvas
let presas = [];                              // teclas e botões segurados: { fonte, acao, falta }
let lascas = [];
let tremor = { t: 0, forte: false };
let desabou = null;                           // { t, aviso } depois do fim: a pedra subindo e o aviso
let estilhacada = null;                       // a limpeza que já soltou as lascas
let previaDe = '';                            // a peça desenhada na prévia
let tabuleiroSujo = true;                     // fora da partida, só o aviso, o metal e o tamanho o mudam
let mostrados = '';
let recordeSalvo = 0;
let recordeAntes = 0;                         // o recorde quando a partida começou
let cadeadoAberto = false;
let anuncioPendente = 0;
const mestre = {
  ator: null, pos: { x: 0, y: 0 }, voo: null, visivel: false, poleiro: null, fala: 0, balao: null, pedra: 0,
  metal: null, visual: {},
};

const sortear = lista => lista[Math.floor(Math.random() * lista.length)];
const esperar = ms => new Promise(resolve => setTimeout(resolve, ms));
const plural = (n, um, varios) => `${numero.format(n)} ${n === 1 ? um : varios}`;

function naPagina(elemento) {
  const r = elemento.getBoundingClientRect();
  return { left: r.left + scrollX, top: r.top + scrollY, right: r.right + scrollX, width: r.width, height: r.height };
}

function lerCores() {
  const css = getComputedStyle(document.documentElement);
  const token = nome => css.getPropertyValue(nome).trim();
  const liga = [0, 1, 2, 3, 4].map(i => token(`--liga-${i}`));
  cores = {
    liga, contorno: token('--px-contorno'), poco: token('--placa-poco'), grade: token('--placa-relevo'),
    bronze: { o: liga[0], s: liga[1], m: liga[2], l: liga[3], h: liga[4], v: liga[1], w: liga[4] },
  };
}

const coresDoBloco = v => PEDRAS[(v & 7) - 1].cores ?? cores.bronze;

function bloco(v, bruta, p = Pd) {
  const chave = `${p}:${v}:${bruta ? 1 : 0}`;
  let c = blocos.get(chave);
  if (!c) {
    const tipo = (v & 7) - 1, variante = v >> 3;
    c = document.createElement('canvas');
    c.width = c.height = ARTE * p;
    const desenho = desenhoDoBloco(PEDRAS[tipo].desenho, variante, 101 + tipo * 16 + variante);
    pintarGrade(c.getContext('2d'), desenho, bruta ? PEDRA_BRUTA : coresDoBloco(v), 0, 0, p);
    blocos.set(chave, c);
  }
  return c;
}

// Canvas em px de dispositivo inteiros por px de arte; o tamanho CSS acompanha (sem reamostrar).
function dimensionar(canvas, largura, altura, p) {
  const d = dpr();
  if (canvas.width !== largura * p) canvas.width = largura * p;
  if (canvas.height !== altura * p) canvas.height = altura * p;
  canvas.style.width = `${canvas.width / d}px`;
  canvas.style.height = `${canvas.height / d}px`;
  const c = canvas.getContext('2d');
  c.imageSmoothingEnabled = false;
  return c;
}

// O canvas centrado no layout pode cair em meio pixel de tela: um translate mínimo o põe no pixel de dispositivo.
function alinhar(canvas) {
  canvas.style.translate = '';
  const r = canvas.getBoundingClientRect(), d = dpr();
  const dx = Math.round(r.left * d) / d - r.left, dy = Math.round(r.top * d) / d - r.top;
  if (Math.abs(dx) > 0.001 || Math.abs(dy) > 0.001) canvas.style.translate = `${dx}px ${dy}px`;
}

function pintarCadeado() {
  const p = Math.round(3 * dpr());
  const linhas = [...(cadeadoAberto ? CADEADO.aberto : CADEADO.fechado), ...CADEADO.corpo];
  const c = dimensionar(el.cadeado, 11, linhas.length, p);
  c.clearRect(0, 0, el.cadeado.width, el.cadeado.height);
  const [l0, l1, l2, l3, l4] = cores.liga;
  pintarGrade(c, linhas, { o: cores.contorno, e: l0, d: l1, m: l2, l: l3, h: l4 }, 0, 0, p);
  alinhar(el.cadeado);
}

// ---------- tamanhos ----------

// O tabuleiro ocupa a altura que sobra da janela abaixo do topo dele (e acima dos controles de toque), em px de
// dispositivo inteiros por px de arte: entre 2 e 4 px CSS.
function medir() {
  if (el.obra.hidden) return;
  const d = dpr();
  const largo = matchMedia('(min-width: 1050px)').matches;
  // Em pilha, a prévia fica acima do tabuleiro e o tamanho dela muda o topo dele: duas ou três voltas acertam.
  for (let volta = 0; volta < 3; volta++) {
    const topo = naPagina(el.poco).top;
    const toque = el.toque.offsetHeight ? el.toque.offsetHeight + 16 : 0;
    const altura = innerHeight - topo - toque - (largo ? 40 : 18);
    const largura = largo ? Infinity : el.poco.clientWidth;
    const cabe = Math.floor(Math.min(largura * d / TABULEIRO.largura, altura * d / TABULEIRO.altura));
    const p = Math.max(Math.round(2 * d), Math.min(Math.round(4 * d), cabe));
    const pPrevia = largo ? p : Math.max(Math.round(2 * d), p - Math.round(d));
    if (p === Pd && pPrevia === PdPrevia && ctx) break;
    Pd = p;
    PdPrevia = pPrevia;
    ctx = dimensionar(el.canvas, TABULEIRO.largura, TABULEIRO.altura, Pd);
    ctxPrevia = dimensionar(el.previa, PREVIA.largura, PREVIA.altura, PdPrevia);
    blocos.clear();
    fundo = null;
    previaDe = '';
  }
  alinhar(el.canvas);
  alinhar(el.previa);
  pintarPrevia();
}

function prepararFundo() {
  if (fundo) return;
  fundo = document.createElement('canvas');
  fundo.width = el.canvas.width;
  fundo.height = el.canvas.height;
  pintarMoldura(fundo.getContext('2d'), TABULEIRO.largura, TABULEIRO.altura, Pd, cores);
}

// ---------- desenho do jogo ----------

function pintarPrevia() {
  if (!ctxPrevia) return;
  const tipo = partida?.proxima ?? '';
  const chave = `${tipo}:${PdPrevia}:${cores.liga[2]}`;
  if (chave === previaDe) return;
  previaDe = chave;
  const p = PdPrevia;
  ctxPrevia.clearRect(0, 0, el.previa.width, el.previa.height);
  pintarMoldura(ctxPrevia, PREVIA.largura, PREVIA.altura, p, cores);
  el.previaNome.textContent = tipo ? `peça ${tipo}, ${PEDRAS[TIPOS.indexOf(tipo)].nome}` : 'nenhuma ainda';
  if (!tipo) return;
  const q = peca(tipo);
  const xs = q.celulas.map(c => c[0]), ys = q.celulas.map(c => c[1]);
  const [x0, y0] = [Math.min(...xs), Math.min(...ys)];
  const largura = (Math.max(...xs) - x0 + 1) * ARTE, altura = (Math.max(...ys) - y0 + 1) * ARTE;
  const ox = MOLDURA + 2 + (4 * ARTE - largura) / 2, oy = MOLDURA + 2 + (2 * ARTE - altura) / 2;
  q.celulas.forEach(([x, y], i) => {
    ctxPrevia.drawImage(bloco(codigo(q, i), false, p), (ox + (x - x0) * ARTE) * p, (oy + (y - y0) * ARTE) * p);
  });
}

// O risco de giz: só o contorno de fora de onde a peça vai cair, tracejado.
function riscarGiz(c, celulas, x0, y0) {
  const tem = new Set(celulas.map(([x, y]) => `${x},${y}`));
  c.fillStyle = GIZ;
  const S = ARTE * Pd;
  for (const [x, y] of celulas) {
    if (y < ESCONDIDAS) continue;
    const bx = x0 + x * S, by = y0 + (y - ESCONDIDAS) * S;
    for (let i = 0; i < ARTE; i += 2) {
      if (!tem.has(`${x},${y - 1}`)) c.fillRect(bx + i * Pd, by, Pd, Pd);
      if (!tem.has(`${x},${y + 1}`)) c.fillRect(bx + (i + 1) * Pd, by + (ARTE - 1) * Pd, Pd, Pd);
      if (!tem.has(`${x - 1},${y}`)) c.fillRect(bx, by + (i + 1) * Pd, Pd, Pd);
      if (!tem.has(`${x + 1},${y}`)) c.fillRect(bx + (ARTE - 1) * Pd, by + i * Pd, Pd, Pd);
    }
  }
}

// A rachadura corre da esquerda para a direita na primeira metade da limpeza (inteira, com movimento reduzido).
function rachar(c, limpando, x0, y0, parado) {
  const progresso = parado ? 1 : Math.min(1, limpando.t / (LIMPEZA / 2));
  const ate = Math.round(progresso * COLUNAS * ARTE);
  for (const fileira of limpando.fileiras) {
    const r = sorteio(fileira * 131 + partida.serie);
    const topo = y0 + (fileira - ESCONDIDAS) * ARTE * Pd;
    c.fillStyle = `rgba(255, 248, 230, ${0.28 * progresso})`;
    c.fillRect(x0, topo, COLUNAS * ARTE * Pd, ARTE * Pd);
    let dy = 3 + Math.floor(r() * 2);
    for (let x = 0; x < ate; x++) {
      if (r() < 0.35) dy = Math.min(5, Math.max(2, dy + (r() < 0.5 ? -1 : 1)));
      c.fillStyle = cores.contorno;
      c.fillRect(x0 + x * Pd, topo + dy * Pd, Pd, Pd);
      c.fillStyle = CLARAO;
      c.fillRect(x0 + x * Pd, topo + (dy + 1) * Pd, Pd, Pd);
    }
  }
}

function soltarLascas(limpando) {
  for (const fileira of limpando.fileiras) {
    for (let x = 0; x < COLUNAS; x++) {
      const tons = coresDoBloco(partida.tabuleiro[fileira][x]);
      for (let k = 0; k < 3; k++) {
        lascas.push({
          x: x * ARTE + 2 + Math.random() * 4, y: (fileira - ESCONDIDAS) * ARTE + 2 + Math.random() * 4,
          vx: (Math.random() - 0.5) * 150, vy: -40 - Math.random() * 120, vida: 0.45 + Math.random() * 0.35,
          tam: Math.random() < 0.3 ? 2 : 1, cor: k === 0 ? tons.h : k === 1 ? tons.l : tons.m,
        });
      }
    }
  }
}

function pintarTabuleiro(parado) {
  if (!ctx) return;
  prepararFundo();
  const c = ctx, S = ARTE * Pd;
  const x0 = MOLDURA * Pd, y0 = MOLDURA * Pd, w = COLUNAS * S, h = LINHAS * S;
  c.drawImage(fundo, 0, 0);
  c.save();
  c.beginPath();
  c.rect(x0, y0, w, h);
  c.clip();
  // O tremor mexe o que está no poço, nunca a moldura: 1 px de arte ao soltar, 1 px de cada lado num quatro.
  const dy = parado || tremor.t <= 0 ? 0 : (tremor.forte ? (Math.floor(tremor.t * 40) % 2 ? 1 : -1) : 1) * Pd;
  const p = partida;
  if (p) {
    const limpando = p.limpando, quebrou = limpando && limpando.t >= LIMPEZA / 2;
    const brutas = desabou ? (parado ? LINHAS : Math.min(LINHAS, Math.floor(desabou.t / PETRIFICAR))) : 0;
    for (let y = ESCONDIDAS; y < ALTURA; y++) {
      if (quebrou && limpando.fileiras.includes(y)) continue;
      const vy = y - ESCONDIDAS;
      for (let x = 0; x < COLUNAS; x++) {
        const v = p.tabuleiro[y][x];
        if (v) c.drawImage(bloco(v, vy >= LINHAS - brutas), x0 + x * S, y0 + vy * S + dy);
      }
    }
    if (p.peca && estado !== 'fim') {
      const d = queda(p.tabuleiro, p.peca);
      if (d > 0) riscarGiz(c, celulasDa({ ...p.peca, y: p.peca.y + d }), x0, y0 + dy);
      celulasDa(p.peca).forEach(([x, y], i) => {
        if (y >= ESCONDIDAS) c.drawImage(bloco(codigo(p.peca, i), false), x0 + x * S, y0 + (y - ESCONDIDAS) * S + dy);
      });
    }
    if (limpando && !quebrou) rachar(c, limpando, x0, y0 + dy, parado);
  }
  for (const l of lascas) {
    c.fillStyle = l.cor;
    c.fillRect(x0 + Math.round(l.x) * Pd, y0 + Math.round(l.y) * Pd + dy, l.tam * Pd, l.tam * Pd);
  }
  // Véu sobre o poço quando o aviso está aberto.
  if (!el.aviso.hidden) {
    c.fillStyle = 'rgba(25, 20, 16, 0.55)';
    c.fillRect(x0, y0, w, h);
  }
  c.restore();
}

function animarEfeitos(dt, parado) {
  let mais = false;
  if (tremor.t > 0) { tremor.t -= dt; mais = true; }
  const limpando = partida?.limpando;
  if (limpando && limpando !== estilhacada && limpando.t >= LIMPEZA / 2) {
    estilhacada = limpando;
    if (!parado) soltarLascas(limpando);
  }
  if (lascas.length) {
    for (const l of lascas) {
      l.vy += 420 * dt;
      l.x += l.vx * dt;
      l.y += l.vy * dt;
      l.vida -= dt;
    }
    lascas = lascas.filter(l => l.vida > 0 && l.y < LINHAS * ARTE);
    mais = true;
  }
  if (desabou && !desabou.aviso) {
    desabou.t += dt;
    if (parado || desabou.t >= LINHAS * PETRIFICAR + 0.25) {
      desabou.aviso = true;
      const estavaNoTabuleiro = document.activeElement === el.tabuleiro || document.activeElement === document.body;
      mostrarAviso('fim');
      if (estavaNoTabuleiro) el.acao.focus({ preventScroll: true });
    }
    mais = true;
  }
  return mais;
}

function tremer(segundos, forte) {
  if (reduzido()) return;
  tremor = { t: segundos, forte };
}

// ---------- o escultor ----------

function montarMestre() {
  const P = innerWidth > 760 ? 3 : 2;
  if (mestre.ator?.pixel === P) return;
  const antes = mestre.ator?.estado;
  mestre.ator = montar(el.escultor, { pixel: P, reduzido: reduzido() });
  mestre.ator.definir({ ...(antes ?? { dir: -1, asas: 'fechadas' }), metal: mestre.metal, ...mestre.visual });
}

// De pé na borda de cima do painel (o contorno de 2 px fica por fora), à direita do cadeado e olhando para ele: o maço
// alcança o cadeado.
function lugarNaPorta() {
  const cadeado = naPagina(el.cadeado), painel = naPagina(el.form), a = mestre.ator;
  a.definir({ dir: -1 });
  const pes = a.pes();
  return { x: cadeado.right + 2 + 7 * a.pixel - pes.x, y: painel.top - 2 - pes.y };
}

// Sentado na moldura da próxima peça, perto da ponta, de frente para o tabuleiro.
function lugarNaObra() {
  const previa = naPagina(el.previa), tabuleiro = naPagina(el.canvas), a = mestre.ator;
  a.definir({ dir: tabuleiro.left + tabuleiro.width / 2 < previa.left + previa.width / 2 ? -1 : 1 });
  const assento = a.assento();
  return { x: previa.right - 10 * a.pixel - assento.x, y: previa.top + 2 - assento.y };
}

function voar(destino, aoChegar, { de, duracao = 0.85, arco = 34 } = {}) {
  if (de) mestre.pos = { ...de };
  mestre.ator.definir({ asas: 'rapidas', sentado: false, dir: destino.x < mestre.pos.x ? -1 : 1 });
  mestre.voo = { de: { ...mestre.pos }, para: destino, t: 0, duracao, arco, aoChegar };
  acordar();
}

function animarMestre(dt, parado) {
  const m = mestre;
  if (m.voo) {
    m.voo.t += dt;
    const u = parado ? 1 : Math.min(1, m.voo.t / m.voo.duracao);
    const e = suave(u);
    m.pos.x = m.voo.de.x + (m.voo.para.x - m.voo.de.x) * e;
    m.pos.y = m.voo.de.y + (m.voo.para.y - m.voo.de.y) * e - Math.sin(Math.PI * u) * m.voo.arco;
    if (u >= 1) {
      const chegou = m.voo.aoChegar;
      m.voo = null;
      chegou?.();
    }
  }
  if (m.pedra > 0 && (m.pedra -= dt) <= 0) m.ator.definir({ tom: null });
  m.ator.reduzido = parado;
  m.ator.avancar(dt).pintar();
  el.escultor.style.transform = `translate(${encaixar(m.pos.x)}px, ${encaixar(m.pos.y)}px)`;
  if (m.fala > 0) {
    m.fala -= dt;
    if (m.fala <= 0) el.balao.hidden = true;
    else posicionarBalao();
  }
}

function falar(texto, segundos = 2.6) {
  el.balao.textContent = texto;
  el.balao.hidden = false;
  mestre.fala = segundos;
  medirBalao();
  posicionarBalao();
  acordar();
}

// O tamanho do balão só muda com o texto (ou a janela): medir a cada quadro forçaria o layout à toa.
function medirBalao() {
  mestre.balao = { largura: el.balao.offsetWidth, altura: el.balao.offsetHeight };
}

// O balão fica acima da boina, dentro da página (12 px de folga dos lados), com o rabicho apontando para ele.
function posicionarBalao() {
  if (el.balao.hidden || !mestre.ator || !mestre.balao) return;
  const P = mestre.ator.pixel;
  const cabeca = { x: mestre.pos.x + (7 - QUADRO.x0) * P, y: mestre.pos.y - QUADRO.y0 * P };
  const { largura, altura } = mestre.balao;
  const pagina = document.documentElement.clientWidth;
  const left = Math.round(Math.min(Math.max(12, cabeca.x - largura / 2), pagina - 12 - largura));
  el.balao.style.left = `${left}px`;
  el.balao.style.top = `${Math.round(cabeca.y - altura - 10)}px`;
  el.balao.style.setProperty('--rabicho', `${Math.round(Math.min(largura - 8, Math.max(8, cabeca.x - left)))}px`);
}

function anunciar(texto) {
  clearTimeout(anuncioPendente);
  el.anuncio.textContent = '';
  // Esvaziar antes faz o leitor de tela anunciar de novo, mesmo que o texto se repita.
  anuncioPendente = setTimeout(() => { el.anuncio.textContent = texto; }, 60);
}

// ---------- a porta ----------

function falaDaEntrada(motivo, usuario, senha) {
  if (motivo === 'esqueci') return FALAS.esqueci;
  if (motivo === 'desafio') return FALAS.entrada;
  if ((placarDaObra().jogou ?? 0) > 0) return FALAS.deNovo;
  if (!usuario && !senha) return FALAS.vazio;
  if (['admin', 'administrador', 'root'].includes(usuario)) return FALAS.admin;
  if (SENHAS_MANJADAS.has(senha)) return FALAS.senha;
  return FALAS.entrada;
}

// Qualquer tentativa: o que foi digitado só escolhe a fala e some dos campos na hora. Depois o escultor chega, dá um
// golpe no cadeado, conta a verdade e abre o canteiro.
async function entrar(motivo) {
  if (fase !== 'porta') return;
  fase = 'entrando';
  const fala = falaDaEntrada(motivo, el.usuario.value.trim().toLowerCase(), el.senha.value.trim().toLowerCase());
  el.usuario.value = '';
  el.senha.value = '';
  el.form.setAttribute('aria-busy', 'true');
  el.entrar.classList.add('verificando');
  el.entrar.textContent = 'verificando';
  await esperar(reduzido() ? 250 : 700);

  montarMestre();
  el.escultor.hidden = false;
  mestre.visivel = true;
  mestre.poleiro = lugarNaPorta;
  const perto = lugarNaPorta();
  await new Promise(resolve => {
    const pousar = () => { mestre.ator.definir({ asas: 'fechadas', dir: -1 }); resolve(); };
    if (reduzido()) { mestre.pos = perto; pousar(); acordar(); return; }
    voar(perto, pousar, { de: { x: document.documentElement.clientWidth + 30, y: perto.y - 150 }, duracao: 0.95 });
  });
  await new Promise(resolve => {
    mestre.ator.definir({ asas: 'batendo' }).golpear(() => {
      cadeadoAberto = true;
      pintarCadeado();
    });
    acordar();   // parado, o relógio pode estar dormindo: o golpe precisa dele para chegar ao impacto
    setTimeout(() => { mestre.ator.definir({ asas: 'fechadas' }); resolve(); }, 450);
  });
  el.entrar.textContent = 'entrar';
  el.entrar.classList.remove('verificando');
  falar(fala, 2.6);
  anunciar(`O escultor apareceu: ${fala} ${FALAS.canteiro}`);
  await esperar(2500);
  falar(FALAS.canteiro, 2.4);
  await esperar(2300);
  abrirObra();
}

function abrirObra() {
  const foco = document.activeElement;
  const tinhaFoco = !foco || foco === document.body || el.porta.contains(foco);
  el.porta.hidden = true;
  el.obra.hidden = false;
  el.form.removeAttribute('aria-busy');
  fase = 'obra';
  scrollTo({ top: 0, behavior: 'instant' });
  medir();
  mostrarAviso('espera');
  atualizarNumeros(true);
  mestre.poleiro = lugarNaObra;
  // Voa virado para onde vai; pousado, senta de frente para o tabuleiro.
  voar(lugarNaObra(), () => {
    mestre.pos = lugarNaObra();
    mestre.ator.definir({ sentado: true, asas: 'fechadas' });
  });
  falar(FALAS.convite, 3.2);
  anunciar(`${FALAS.convite} O canteiro abriu: um tabuleiro de 10 por 20.`);
  if (tinhaFoco) el.acao.focus({ preventScroll: true });
  registrarDesafio();
  acordar();
}

// ---------- o jogo ----------

function mostrarAviso(tipo) {
  const [titulo, texto, botao] = AVISOS[tipo];
  el.aviso.dataset.tipo = tipo;
  el.avisoTitulo.textContent = titulo;
  if (tipo === 'fim') {
    el.avisoTexto.textContent = `${plural(partida.linhas, 'linha', 'linhas')} · ${plural(partida.pontos, 'ponto', 'pontos')}${desabou?.recorde ? ' · recorde!' : ''}`;
  } else if (tipo === 'espera' && conquistas?.tem?.('tetris')) {
    el.avisoTexto.textContent = 'A medalha já é sua. Agora é pelo recorde.';
  } else {
    el.avisoTexto.textContent = texto;
  }
  el.acao.textContent = botao;
  el.aviso.hidden = false;
  tabuleiroSujo = true;   // o véu sobre o poço
}

function focarTabuleiro() {
  if (document.activeElement !== el.tabuleiro) el.tabuleiro.focus({ preventScroll: true });
}

function comecar() {
  partida = criarPartida();
  // O recorde é salvo a cada fileira (quem sai no meio não perde); no fim, compara-se com o de antes da partida.
  recordeAntes = recordeSalvo;
  estado = 'jogando';
  lascas = [];
  presas = [];
  desabou = null;
  el.aviso.hidden = true;
  el.pausa.disabled = false;
  el.pausa.textContent = 'pausa';
  mestre.ator?.definir({ dormindo: false, tom: null });
  pintarPrevia();
  atualizarNumeros(true);
  focarTabuleiro();
  falar(sortear(FALAS.comecar), 1.8);
  anunciar('A obra começou. Nível 1.');
  acordar();
}

function pausar(comFala) {
  if (estado !== 'jogando') return;
  estado = 'pausado';
  presas = [];
  mostrarAviso('pausa');
  el.pausa.textContent = 'continuar';
  mestre.ator?.definir({ dormindo: true });
  if (comFala) falar(FALAS.pausa, 2);
  anunciar('Pausado.');
  acordar();
}

function continuar() {
  if (estado !== 'pausado') return;
  estado = 'jogando';
  el.aviso.hidden = true;
  el.pausa.textContent = 'pausa';
  mestre.ator?.definir({ dormindo: false });
  focarTabuleiro();
  anunciar('Continuando.');
  acordar();
}

function acaoDoAviso() {
  if (fase !== 'obra') return;
  if (estado === 'pausado') continuar();
  else if (estado !== 'jogando') comecar();
}

const placarDaObra = () => conquistas?.placar?.('tetris') ?? {};

function salvarPlacar(patch) {
  conquistas?.placar?.('tetris', patch);
  if (patch.best !== undefined) recordeSalvo = patch.best;
  registrarDesafio();
}

// O desafio no medalheiro: nome, onde, placar e o "ir" (aqui mesmo: abre a porta ou volta ao tabuleiro).
function registrarDesafio() {
  const { lines = 0, best = 0 } = placarDaObra();
  conquistas?.jogo?.('tetris', {
    nome: 'Mestre de obras',
    onde: 'no /admin: empilhe os blocos',
    placar: lines ? `${plural(lines, 'linha', 'linhas')} · recorde ${numero.format(best)}` : '',
    jogar: () => {
      if (fase === 'porta') entrar('desafio');
      else if (fase === 'obra') acaoDoAviso();
      if (fase === 'obra') focarTabuleiro();
    },
  });
}

// Centro de uma fileira, na janela: de onde a moeda da medalha sai.
function pontoDaFileira(fileira) {
  const r = el.canvas.getBoundingClientRect(), escala = r.height / TABULEIRO.altura;
  return { x: r.left + r.width / 2, y: r.top + (MOLDURA + (fileira - ESCONDIDAS + 0.5) * ARTE) * escala };
}

function tratar(eventos) {
  const subiu = eventos.find(e => e.tipo === 'nivel');
  for (const e of eventos) {
    if (e.tipo === 'soltou' && e.distancia > 0) tremer(0.08, false);
    else if (e.tipo === 'linhas') fezLinhas(e, subiu);
    else if (e.tipo === 'fim') desabar();
  }
}

function fezLinhas({ fileiras, quantas }, subiu) {
  const antes = placarDaObra();
  const total = (antes.lines ?? 0) + quantas;
  salvarPlacar({ lines: total, best: Math.max(antes.best ?? 0, partida.pontos) });
  if (quantas === 4) tremer(0.24, true);
  let fala = sortear(FALAS.linhas[quantas]);
  if (total >= META && conquistas?.desbloquear?.('tetris', pontoDaFileira(fileiras[fileiras.length - 1]))) fala = FALAS.medalha;
  else if (subiu) fala = FALAS.nivel(subiu.nivel);
  mestre.ator?.definir({ asas: 'fechadas' }).golpear();
  if (quantas === 4 || subiu) mestre.ator?.pular();
  falar(fala, 2);
  const nivel = subiu ? ` Nível ${subiu.nivel}.` : '';
  anunciar(`${plural(quantas, 'linha completa', 'linhas completas')}. ${plural(partida.linhas, 'linha', 'linhas')}, ${plural(partida.pontos, 'ponto', 'pontos')}.${nivel}`);
}

function desabar() {
  estado = 'fim';
  presas = [];
  el.pausa.disabled = true;
  el.pausa.textContent = 'pausa';
  const antes = placarDaObra();
  const recorde = partida.pontos > recordeAntes;
  desabou = { t: 0, aviso: false, recorde };
  salvarPlacar({ best: Math.max(antes.best ?? 0, partida.pontos), jogou: (antes.jogou ?? 0) + 1 });
  mestre.ator?.definir({ tom: 'pedra', dormindo: false });
  mestre.pedra = 0.9;
  falar(recorde ? FALAS.recorde(numero.format(partida.pontos)) : sortear(FALAS.fim), 3);
  anunciar(`A obra desabou: ${plural(partida.linhas, 'linha', 'linhas')}, ${plural(partida.pontos, 'ponto', 'pontos')}.${recorde ? ' Novo recorde!' : ''}`);
}

function atualizarNumeros(forcar) {
  const p = partida ?? { linhas: 0, pontos: 0, nivel: 1 };
  const recorde = Math.max(recordeSalvo, p.pontos);
  const chave = `${p.linhas}|${p.pontos}|${p.nivel}|${recorde}`;
  if (chave === mostrados && !forcar) return;
  mostrados = chave;
  el.linhas.textContent = numero.format(p.linhas);
  el.pontos.textContent = numero.format(p.pontos);
  el.nivel.textContent = numero.format(p.nivel);
  el.recorde.textContent = numero.format(recorde);
}

// ---------- entradas ----------

function executar(acao) {
  if (estado === 'jogando') tratar(comandar(partida, acao));
}

function pressionar(acao, fonte) {
  if (estado !== 'jogando') return;
  largar(fonte);
  executar(acao);
  if (acao === 'esquerda' || acao === 'direita' || acao === 'descer') presas.push({ fonte, acao, falta: ATRASO });
  acordar();
}

function largar(fonte) {
  presas = presas.filter(p => p.fonte !== fonte);
}

// ← e → segurados repetem com atraso e cadência fixos (a repetição do sistema varia de máquina para máquina); só o
// último lado apertado vale. ↓ segurado é a queda rápida.
function repetir(dt) {
  const lado = presas.findLast(p => p.acao !== 'descer');
  if (!lado) return;
  lado.falta -= dt;
  while (lado.falta <= 0 && estado === 'jogando') {
    executar(lado.acao);
    lado.falta += CADENCIA;
  }
}

function aoTeclar(e) {
  if (fase !== 'obra' || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
  const alvo = e.target;
  // Num botão, link ou campo a tecla é dele (espaço aperta o botão); no tabuleiro ou solta na página, é do jogo.
  const livre = alvo === el.tabuleiro || alvo === document.body || alvo === document.documentElement;
  if (e.key === 'p' || e.key === 'P' || (e.key === 'Escape' && estado === 'jogando')) {
    if (!livre && !el.obra.contains(alvo)) return;
    e.preventDefault();
    if (e.repeat) return;
    if (estado === 'pausado') continuar();
    else pausar(true);
    return;
  }
  if (!livre) return;
  const acao = TECLAS[e.key];
  if (estado !== 'jogando') {
    // Parado, espaço e Enter no tabuleiro fazem o que o botão do aviso faz (só com o aviso à vista: quem ainda está
    // martelando o espaço enquanto a obra desaba não recomeça sem ver o placar); as setas não rolam a página.
    if ((e.key === ' ' || e.key === 'Enter') && alvo === el.tabuleiro && !el.aviso.hidden) {
      e.preventDefault();
      if (!e.repeat) acaoDoAviso();
    } else if (acao) e.preventDefault();
    return;
  }
  if (!acao) return;
  e.preventDefault();
  if (!e.repeat) pressionar(acao, `tecla:${e.key}`);
}

function ligarToque() {
  const botaoDe = e => e.target.closest?.('button[data-acao]');
  // pointerdown sem o padrão: o botão não rouba o foco (o tabuleiro continua com as teclas) e o dedo não rola nem
  // dá zoom. Segurar repete, como as teclas.
  el.toque.addEventListener('pointerdown', e => {
    const botao = botaoDe(e);
    if (!botao) return;
    e.preventDefault();
    if (estado !== 'jogando') return;
    try { botao.setPointerCapture(e.pointerId); } catch { /* sem captura, o pointerup ainda chega */ }
    botao.classList.add('apertado');
    pressionar(botao.dataset.acao, `toque:${e.pointerId}`);
  });
  const soltar = e => {
    largar(`toque:${e.pointerId}`);
    botaoDe(e)?.classList.remove('apertado');
  };
  for (const tipo of ['pointerup', 'pointercancel', 'lostpointercapture']) el.toque.addEventListener(tipo, soltar);
  // Leitor de tela e teclado chegam pelo click sem ponteiro (detail 0): um passo por clique.
  el.toque.addEventListener('click', e => {
    const botao = botaoDe(e);
    if (botao && e.detail === 0) executar(botao.dataset.acao);
  });
  el.toque.addEventListener('contextmenu', e => e.preventDefault());
}

// ---------- o relógio ----------

function quadro(dt) {
  const parado = reduzido();
  let mais = false;
  if (mestre.visivel) {
    animarMestre(dt, parado);
    // Com movimento, as asas e o piscar pedem quadro sempre (como o mascote do ateliê); parado, só o que tem fim.
    mais = !parado || !!mestre.voo || mestre.fala > 0 || mestre.pedra > 0 || !!mestre.ator?.golpeando;
  }
  if (fase === 'obra') {
    if (estado === 'jogando') {
      repetir(dt);
      tratar(avancarPartida(partida, dt, presas.some(p => p.acao === 'descer')));
      mais = true;
    }
    const efeitos = animarEfeitos(dt, parado);
    if (efeitos) mais = true;
    // No aviso, em pausa ou depois do fim, o tabuleiro não muda sozinho: repinta só quando algo o sujou (o metal e o
    // tamanho jogam o fundo fora).
    if (estado === 'jogando' || efeitos || tabuleiroSujo || !fundo) {
      tabuleiroSujo = false;
      pintarTabuleiro(parado);
    }
    pintarPrevia();
    atualizarNumeros();
  }
  return mais;
}

function refundir(metal) {
  mestre.metal = metal ?? null;
  lerCores();
  blocos.clear();
  fundo = null;
  previaDe = '';
  mestre.ator?.definir({ metal: mestre.metal });
  pintarCadeado();
  pintarPrevia();
  acordar();
}

function aoRedimensionar() {
  if (mestre.visivel) montarMestre();
  medir();
  alinhar(el.cadeado);
  if (mestre.visivel && !mestre.voo && mestre.poleiro) mestre.pos = mestre.poleiro();
  if (!el.balao.hidden) medirBalao();
  posicionarBalao();
  acordar();
}

export async function iniciar() {
  const $ = id => document.getElementById(id);
  el = {
    palco: document.querySelector('.admin-palco'),
    porta: $('porta'), form: $('porta-form'), usuario: $('usuario'), senha: $('senha'), entrar: $('entrar'),
    esqueci: $('esqueci'), cadeado: $('cadeado'),
    obra: $('obra'), poco: $('obra-poco'), tabuleiro: $('tabuleiro'), canvas: $('tabuleiro-canvas'),
    aviso: $('obra-aviso'), avisoTitulo: $('obra-aviso-titulo'), avisoTexto: $('obra-aviso-texto'), acao: $('obra-acao'),
    previa: $('proxima-canvas'), previaNome: $('proxima-nome'), pausa: $('obra-pausa'), toque: $('obra-toque'),
    linhas: $('obra-linhas'), pontos: $('obra-pontos'), nivel: $('obra-nivel'), recorde: $('obra-recorde'),
    escultor: $('admin-escultor'), balao: $('admin-balao'), anuncio: $('admin-anuncio'),
  };
  if (!el.porta || !el.obra) return;
  lerCores();
  pintarCadeado();

  // As entradas ligam antes de qualquer import: numa rede lenta, quem tenta entrar cedo não fica sem resposta.
  el.form.addEventListener('submit', e => { e.preventDefault(); entrar('entrar'); });
  el.esqueci.addEventListener('click', () => entrar('esqueci'));
  el.acao.addEventListener('click', acaoDoAviso);
  el.pausa.addEventListener('click', () => (estado === 'pausado' ? continuar() : pausar(true)));
  el.tabuleiro.addEventListener('click', () => { if (estado === 'pausado') continuar(); });
  addEventListener('keydown', aoTeclar);
  addEventListener('keyup', e => largar(`tecla:${e.key}`));
  // Saiu da janela, da aba ou do jogo (o foco foi para o HUD, um link, a janela das medalhas): pausa.
  addEventListener('blur', () => { presas = []; pausar(false); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) pausar(false); });
  el.obra.addEventListener('focusout', e => {
    if (e.relatedTarget && !el.obra.contains(e.relatedTarget)) pausar(false);
  });
  ligarToque();
  let pedido = 0;
  addEventListener('resize', () => {
    cancelAnimationFrame(pedido);
    pedido = requestAnimationFrame(aoRedimensionar);
  });
  document.fonts?.ready.then(aoRedimensionar);
  registrar(quadro);

  ({ reduzido } = await import('../nucleo/movimento.js'));
  // As conquistas e o cursor são partes isoladas, como no ateliê: se uma falhar, a porta e o jogo seguem.
  const [modulo, cursor] = await Promise.allSettled([import('./conquistas.js'), import('../arte/cursor.js')]);
  if (cursor.status === 'fulfilled') {
    try { cursor.value.iniciar(); } catch (erro) { console.error('[cursor] não iniciou:', erro); }
  }
  if (modulo.status === 'fulfilled') {
    try {
      await modulo.value.iniciar?.();
      conquistas = modulo.value;
    } catch (erro) {
      console.error('[conquistas] não iniciou:', erro);
    }
  } else {
    console.error('[conquistas] não carregou:', modulo.reason);
  }
  recordeSalvo = placarDaObra().best ?? 0;
  mestre.visual = conquistas?.visual?.() ?? {};
  mestre.ator?.definir(mestre.visual);
  ouvir('visual', visual => {
    mestre.visual = { elmo: visual.elmo, semBoina: visual.semBoina };
    mestre.ator?.definir(mestre.visual);
    acordar();
  });
  if (conquistas?.fundir) conquistas.fundir(el.palco, refundir);
  else refundir(document.documentElement.dataset.metal);
  registrarDesafio();

  // Entrar aqui já vale a medalha da porta; a moeda sai do cadeado depois que a página assenta (ou do tabuleiro, se
  // a rede foi tão lenta que a porta já abriu).
  setTimeout(() => conquistas?.desbloquear?.('admin', el.porta.hidden ? el.tabuleiro : el.cadeado), 700);
}
