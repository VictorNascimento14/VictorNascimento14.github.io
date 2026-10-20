// Os segredos do ateliê (Fase 2): o que ninguém anuncia. Cutucar o escultor (cócegas, sino, terremoto), quebrar o
// nariz do busto, deixá-lo sem nada para fazer, digitar eureca ou deploy (ou o código Konami), pegar pétalas no
// Contato e, de madrugada, vê-lo cochilar no telhado. Cada segredo cunha a sua conquista (js/dados/conquistas.js).
// Números e falas da especificação 06 (§2.5, §4.9, §5.4, §6.8–6.12, §6.15–6.16, §7.4, §8.2) e da 08 (§6).
//
// O mascote só entra por recado (prioridade 10) e só quando está livre; ocupado, ele só fala. Com movimento reduzido
// nenhuma conquista fica impossível: os efeitos acontecem na hora, o tédio risca tudo de uma vez e as pétalas, paradas,
// também se pegam.
//
// As regras puras do topo (cutucadas, teclado, nariz, letras) têm teste em tests/segredos.test.js. Por isso o que mexe
// no DOM ao carregar (mascote, movimento, conquistas, contato) só é importado dentro de iniciar(): o arquivo abre no
// Node, e um contato ou umas conquistas quebradas não levam os outros segredos junto.
import { registrar, acordar } from '../nucleo/relogio.js';
import { ouvir } from '../nucleo/sinais.js';
import { dpr, suave, saidaCubica } from '../nucleo/pixel.js';
import { montar } from '../arte/escultor.js';
import { perfil } from '../dados/perfil.js';

// ---------- as regras (puras) ----------

export const JANELA_RAPIDA = 1200;   // ms: cutucadas mais próximas que isso são da mesma sequência
const COCEGAS = 3, SINO = 10, TERREMOTO = 20;
export const CUTUCADAS_ZERO = Object.freeze({ total: 0, sequencia: 0, ultima: null });

// Mais uma cutucada: o total da carga e a sequência rápida, que recomeça depois de uma pausa de 1,2 s. (A outra janela,
// de 1,4 s, é a das frases de cócegas na caixa de conversa: fica em js/jogos/conversa.js.)
export function contarCutucada(c, agora) {
  const rapida = c.ultima != null && agora - c.ultima < JANELA_RAPIDA;
  return { total: c.total + 1, sequencia: rapida ? c.sequencia + 1 : 1, ultima: agora };
}

// O que ela acorda. Cócegas a partir da 3ª no total, rápida ou não; sino e terremoto por igualdade, na 10ª e na 20ª
// da mesma sequência (da 11ª à 19ª e da 21ª em diante, nada).
export const efeitosDaCutucada = c => ({
  cocegas: c.total >= COCEGAS, sino: c.sequencia === SINO, terremoto: c.sequencia === TERREMOTO,
});

export const KONAMI = ['arrowup', 'arrowup', 'arrowdown', 'arrowdown', 'arrowleft', 'arrowright', 'arrowleft', 'arrowright', 'b', 'a'];
const PALAVRAS = [['eureca', ['eureca', 'eureka', 'eurecka']], ['deploy', ['deploy']]];
export const TECLADO_VAZIO = Object.freeze({ teclas: [], texto: '' });
const semAcento = texto => texto.normalize('NFD').replace(/[̀-ͯ]/g, '');

// Uma tecla a mais no ouvido do escultor (o `key` do evento): as 10 últimas guardam o código Konami e os 12 últimos
// caracteres, minúsculos e sem acento, as palavras. Devolve o estado novo e o segredo que ela completou: 'eureca',
// 'deploy' (a palavra ou o Konami) ou null.
export function teclar(estado, tecla) {
  const nome = String(tecla ?? '').toLowerCase();
  const teclas = [...estado.teclas, nome].slice(-KONAMI.length);
  if (KONAMI.every((k, i) => teclas[i] === k)) return { estado: TECLADO_VAZIO, segredo: 'deploy' };
  // Shift, setas e companhia entram na fila do Konami, mas não no texto: "eurec" + Shift + "a" ainda é eureca.
  if ([...nome].length !== 1) return { estado: { teclas, texto: estado.texto }, segredo: null };
  const texto = (estado.texto + semAcento(nome)).slice(-12);
  for (const [segredo, palavras] of PALAVRAS) {
    if (palavras.some(p => texto.endsWith(p))) return { estado: { teclas, texto: '' }, segredo };
  }
  return { estado: { teclas, texto }, segredo: null };
}

// O ponto, em frações da imagem do busto, cai na elipse do nariz (perfil.busto.nariz)?
export const noNariz = (x, y, nariz) => ((x - nariz.x) / nariz.raioX) ** 2 + ((y - nariz.y) / nariz.raioY) ** 2 <= 1;

// O que ele risca na base do busto quando fica entediado, numa fonte própria de 3 × 5 ('#' = um sulco). Só as letras
// que a inscrição usa (o teste confere que nenhuma falta).
export const INSCRICAO = semAcento(`${perfil.nome} esteve aqui`).toUpperCase();
const LETRAS = {
  A: ['.#.', '#.#', '###', '#.#', '#.#'],
  C: ['.##', '#..', '#..', '#..', '.##'],
  E: ['###', '#..', '##.', '#..', '###'],
  I: ['###', '.#.', '.#.', '.#.', '###'],
  O: ['.#.', '#.#', '#.#', '#.#', '.#.'],
  Q: ['.#.', '#.#', '#.#', '##.', '.##'],
  R: ['##.', '#.#', '##.', '#.#', '#.#'],
  S: ['.##', '#..', '.#.', '..#', '##.'],
  T: ['###', '.#.', '.#.', '.#.', '.#.'],
  U: ['#.#', '#.#', '#.#', '#.#', '###'],
  V: ['#.#', '#.#', '#.#', '.#.', '.#.'],   // a ponta em duas linhas: com uma só, riscado, parece um U
};

// Os sulcos das n primeiras letras do texto, em células [coluna, linha]; cada letra ocupa 4 colunas (3 e 1 de espaço).
export function sulcos(texto, n = texto.length) {
  const lista = [];
  [...texto].slice(0, n).forEach((letra, i) => {
    (LETRAS[letra] ?? []).forEach((linha, r) => {
      for (let c = 0; c < 3; c++) if (linha[c] === '#') lista.push([4 * i + c, r]);
    });
  });
  return lista;
}

// O contorno da quebra do nariz: 18 vértices sobre a elipse a 92%, uns mordidos para dentro e outros para fora.
function contornoDaQuebra(cx, cy, rx, ry) {
  return Array.from({ length: 18 }, (_, i) => {
    const a = (i / 18) * 2 * Math.PI;
    const k = 0.92 * (1 + (i % 2 ? -0.12 : 0.06) + 0.02 * ((37 * i) % 5));
    return [cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k];
  });
}

// ---------- o que vem de fora (carregado em iniciar) ----------

let mascote, falar, virar, recado, livre, extra, deOlharEsquerda, descanso, tamanhoDaTela;
let reduzido = () => false;
let conquistas = null;   // sem elas, os segredos acontecem do mesmo jeito, só sem moeda
let campo = null;        // js/secoes/contato.js: sem ele, sem pétalas nem cochilo
let cena = null, busto = null;

const desbloquear = (id, de) => conquistas?.desbloquear(id, de) ?? false;
const visual = () => conquistas?.visual() ?? { elmo: null, semBoina: false };
const densidade = () => Math.min(3, Math.max(1, dpr()));

const FALAS = {
  sino: 'BLÉÉÉM.',
  opa: 'Opa!',
  ninguemViu: 'Pronto! Ninguém viu...',
  quaseDerrubei: 'Quase derrubei tudo!',
  classico: 'Opa! Clássico!',
  colei: 'Colei! Ninguém percebe...',
  entediado: 'Tô entediado...',
  historia: 'Pronto! Agora tem história!',
  eureca: 'EURECA!',
  contagem: '3, 2, 1...',
  subiu: 'Subiu! Ninguém mexe agora.',
  zzz: 'zzz',
};

// Os segredos só falam com o companheiro: durante o show, o balão é do herói.
function dizer(texto, segundos) {
  if (mascote?.ativo) falar(texto, segundos);
}

// Dentro do sinal 'cutucar' o mascote ainda vai reclamar das cócegas depois de nós (ele avisa antes de falar): a fala
// do segredo espera o clique terminar e fica por cima, como no original, em que a página falava antes de avisar.
const dizerDepois = (texto, segundos) => queueMicrotask(() => dizer(texto, segundos));

// O recado em curso, quando é dos segredos: um de cada vez.
let meuRecado = null;

// Só com o alvo à vista. O mascote aceita um recado de alvo null (fora da tela), que fica esperando sem ser atendido;
// outro recado aceito nesse meio (o golpe do dia do Ano) toma o lugar dele no fimDoRecado(), e o nosso, atendido
// depois, prenderia o mascote no alvo. Por isso os segredos encerram o deles sem o fimDoRecado(): acabar(r).
function mandar(r) {
  if (meuRecado || !r.alvo()) return false;
  const { alvo, perdeu } = r;
  let fim = false;
  r.alvo = () => (r.acabou ? null : alvo.call(r));
  r.perdeu = () => {
    if (fim) return;
    fim = true;
    r.acabou = true;
    if (meuRecado === r) meuRecado = null;
    perdeu?.call(r);
  };
  if (!recado(r)) return false;
  meuRecado = r;
  return true;
}

// Encerra um recado dos segredos: o alvo vira null e o mascote o larga no quadro seguinte, chamando o perdeu(). Se ele
// não estava sendo atendido, ninguém vai largá-lo: o perdeu() roda daqui.
function acabar(r) {
  if (!r || r.acabou) return;
  r.acabou = true;
  if (mascote.trabalhoAtual === r.nome) acordar();
  else r.perdeu();
}

// Ponta do cinzel para os pés do ator ficarem em (x, y), na direção atual.
function pontaComPesEm(x, y) {
  const a = mascote.ator, t = a.ponta(), p = a.pes();
  return { x: x + t.x - p.x, y: y + t.y - p.y };
}

// ---------- efeitos na tela (canvas fixo) ----------
// Lascas do nariz, faíscas do foguete e o pedaço do nariz caindo. O canvas só ocupa memória enquanto tem o que mostrar.

const fx = { tela: null, k: 1, w: 0, h: 0, particulas: [], pedaco: null, chama: 0 };
// Do ouro claro ao bronze, pela idade (s): no papel claro do site, faísca branca some.
const FOGO = [[0.06, '#fdeeab'], [0.16, '#ecc145'], [0.34, '#cc961b'], [Infinity, '#986810']];
// A chama do foguete, em pixels do sprite sob o centro dos pés: três colunas, de cima para baixo.
const CHAMA = [['#fdeeab', '#fff8e6', '#fdeeab'], ['#ecc145', '#fdeeab', '#ecc145'], [null, '#ecc145', null], [null, '#cc961b', null]];

// O relógio dos segredos entra no fim da fila a cada efeito novo: assim roda depois do quadro do mascote e desenha a
// chama onde o sprite acabou de ser pintado, não um quadro atrás.
let relogio = null;
function ligarRelogio() {
  relogio ??= registrar(animar);
  acordar();
}

function telaFx() {
  const k = densidade(), w = innerWidth, h = innerHeight;
  if (!fx.tela) {
    fx.tela = document.createElement('canvas');
    fx.tela.className = 'segredos-fx pixel';
    fx.tela.setAttribute('aria-hidden', 'true');
    document.body.append(fx.tela);
  }
  if (fx.tela.width <= 1 || k !== fx.k || w !== fx.w || h !== fx.h) {
    fx.tela.width = Math.round(w * k);
    fx.tela.height = Math.round(h * k);
    fx.tela.style.width = `${fx.tela.width / k}px`;
    fx.tela.style.height = `${fx.tela.height / k}px`;
    Object.assign(fx, { k, w, h });
  }
  fx.tela.hidden = false;
  return fx.tela.getContext('2d');
}

function apagarFx() {
  fx.particulas = [];
  fx.pedaco = null;
  fx.chama = 0;
  if (fx.tela) {
    fx.tela.width = fx.tela.height = 1;
    fx.tela.hidden = true;
  }
}

function pintarFx(dt) {
  const ctx = telaFx(), k = fx.k;
  ctx.clearRect(0, 0, fx.tela.width, fx.tela.height);
  fx.particulas = fx.particulas.filter(p => (p.idade += dt) < p.vida);
  for (const p of fx.particulas) {
    p.vy += p.g * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    // Somem em 4 degraus no fim da vida, como tudo que é pixel no site.
    ctx.globalAlpha = Math.min(1, Math.ceil((1 - p.idade / p.vida) * 10) / 4);
    const l = Math.max(1, Math.round(p.lado * k));
    const x = Math.round(p.x * k - l / 2), y = Math.round(p.y * k - l / 2);
    if (p.sombra) {
      ctx.fillStyle = p.sombra;
      ctx.fillRect(x + Math.round(k), y + Math.round(k), l, l);
    }
    ctx.fillStyle = p.fogo ? FOGO.find(([ate]) => p.idade < ate)[1] : p.cor;
    ctx.fillRect(x, y, l, l);
  }
  ctx.globalAlpha = 1;
  if (fx.chama) pintarChama(ctx, k);
  if (fx.pedaco) pintarPedaco(ctx, dt, k);
  if (!fx.particulas.length && !fx.pedaco && !fx.chama) apagarFx();
}

// A chama sob os pés do escultor: cada quadro com um comprimento e umas falhas diferentes, para tremer.
function pintarChama(ctx, k) {
  const a = mascote.ator;
  if (!a) return;
  const p = mascote.ponto, t = a.ponta(), pes = a.pes(), P = a.pixel;
  const x0 = p.x - t.x + pes.x - 1.5 * P, y0 = p.y - t.y + pes.y;
  const linhas = 2 + Math.round(Math.random() * 2 * fx.chama);
  for (let r = 0; r < linhas; r++) {
    CHAMA[r].forEach((cor, c) => {
      if (!cor || (r > 0 && Math.random() < 0.2)) return;
      const x = Math.round((x0 + c * P) * k), y = Math.round((y0 + r * P) * k);
      ctx.fillStyle = cor;
      ctx.fillRect(x, y, Math.round((x0 + (c + 1) * P) * k) - x, Math.round((y0 + (r + 1) * P) * k) - y);
    });
  }
}

// O pedaço do nariz: cai com gravidade, girando em torno do centro, e some 80 px abaixo da janela.
function pintarPedaco(ctx, dt, k) {
  const p = fx.pedaco;
  p.vy += 900 * dt;
  p.x += p.vx * dt;
  p.y += p.vy * dt;
  p.angulo += p.giro * dt;
  if (p.y > innerHeight + 80) { fx.pedaco = null; return; }
  ctx.save();
  ctx.translate((p.x + p.w / 2) * k, (p.y + p.h / 2) * k);
  ctx.rotate(p.angulo);
  ctx.imageSmoothingEnabled = true;   // é um pedaço da foto do busto, não pixel art
  ctx.drawImage(p.tela, (-p.w / 2) * k, (-p.h / 2) * k, p.w * k, p.h * k);
  ctx.restore();
}

// O relógio dos segredos: efeitos e turma. Sem nada para mostrar, sai da fila (ligarRelogio põe de volta).
function animar(dt) {
  try {
    if (tremor) animarTerremoto(dt);
    if (fx.particulas.length || fx.pedaco || fx.chama) pintarFx(dt);
  } catch (erro) {
    relogio = null;   // o relógio tira da fila quem falha; o próximo efeito registra de novo
    throw erro;
  }
  const mais = !!tremor || fx.particulas.length > 0 || !!fx.pedaco || !!fx.chama;
  if (!mais) {
    relogio?.();
    relogio = null;
  }
  return mais;
}

// ---------- cutucadas: cócegas, sino e terremoto ----------

let cutucadas = CUTUCADAS_ZERO;
let repassando = false;

function aoCutucar() {
  // Cutucadas de antes de os segredos carregarem (o sinal guarda as recentes) contam para o total, não para a sequência.
  cutucadas = repassando ? { ...cutucadas, total: cutucadas.total + 1 } : contarCutucada(cutucadas, performance.now());
  const efeito = efeitosDaCutucada(cutucadas);
  if (efeito.cocegas) desbloquear('cocegas');
  if (efeito.sino) tocarSino();
  if (efeito.terremoto) terremoto();
}

let sinoTimer = 0;

function tocarSino() {
  desbloquear('sino');
  dizerDepois(FALAS.sino, 1.8);
  if (reduzido()) return;
  const raiz = document.documentElement;
  raiz.classList.add('segredos-sino');
  clearTimeout(sinoTimer);
  sinoTimer = setTimeout(() => raiz.classList.remove('segredos-sino'), 900);
}

// O que pode cair: títulos, a assinatura e a nota do cabeçalho, o letreiro, a apresentação, o atalho do rodapé, os
// controles do anel, rótulos, ledes, o total e os números da placa, o link do ano, os cartões dos rivais, o cabeçalho
// do Contato, os pergaminhos das casas e o crédito. Só o que está à vista e dentro do <main>.
const PECAS = [
  '.cabecalho .assinatura', '.cabecalho-nota', '.letreiro', '.apresentacao', '.descer',
  '.titulo-galeria', '.anel-seta', '.anel-legenda',
  '.rotulo-secao', '.titulo-secao', '.lede', '.placa-total', '.ano-numeros > div', '.placa-legenda', '.ano-link',
  '.rival-cartao', '.contato-cabeca h2', '.contato-cabeca p', '.casa-pergaminho', '.credito',
].join(', ');

let tremor = null;   // o terremoto em curso: { pecas, t, turma, camada }

function terremoto() {
  if (tremor) return;
  if (reduzido()) {
    dizerDepois(FALAS.quaseDerrubei, 2.4);
    desbloquear('terremoto');
    return;
  }
  const pecas = pecasVisiveis();
  if (!pecas.length) return;   // nada para derrubar: sem terremoto e sem moeda
  const chao = chaoDaQueda();
  tremor = { pecas: pecas.map((el, i) => derrubar(el, i, chao)), t: 0, turma: null, camada: null };
  dizerDepois(FALAS.opa, 1.2);
  ligarRelogio();
}

function pecasVisiveis() {
  const largura = tamanhoDaTela().largura, altura = innerHeight;
  const candidatas = [...document.querySelectorAll(PECAS)].filter(el => {
    if (!el.closest('main') || el.closest('[hidden], [role="dialog"], [aria-modal="true"]')) return false;
    // No show, o escultor pousa numa letra do letreiro: ele só cai depois.
    if (!mascote.ativo && el.classList.contains('letreiro')) return false;
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0 || r.height >= 0.7 * altura) return false;
    if (r.bottom <= 0 || r.top >= altura || r.right <= 0 || r.left >= largura) return false;
    const estilo = getComputedStyle(el);
    return estilo.visibility !== 'hidden' && Number(estilo.opacity) > 0;
  });
  // De cada aninhamento fica a de fora (o rótulo dentro do total cai com ele); no máximo 12, na ordem do documento.
  return candidatas.filter(el => !candidatas.some(outra => outra !== el && outra.contains(el))).slice(0, 12);
}

// O pé da janela; no celular, com a caixa de conversa encaixada embaixo (js/jogos/conversa.js), o topo dela: as peças
// caídas atrás da caixa sumiriam.
function chaoDaQueda() {
  const caixa = document.querySelector('.papo.acoplada:not([hidden])');
  return caixa ? Math.min(innerHeight, caixa.getBoundingClientRect().top) : innerHeight;
}

// A peça desliza até ficar 6–36 px acima do chão (nunca sobe), inclinada ±6–24°, uma depois da outra.
function derrubar(el, i, chao) {
  const r = el.getBoundingClientRect();
  const peca = { el, antes: { translate: el.style.translate, rotate: el.style.rotate }, volta: 0, limpa: false };
  if (getComputedStyle(el).display === 'inline') el.classList.add('segredos-em-bloco');
  const queda = Math.max(0, chao - (6 + Math.random() * 30) - r.bottom);
  const giro = (Math.random() < 0.5 ? -1 : 1) * (6 + Math.random() * 18);
  el.style.setProperty('--queda-atraso', `${(0.05 * i).toFixed(2)}s`);
  el.classList.add('segredos-caindo');
  el.style.translate = `0 ${Math.round(queda)}px`;
  el.style.rotate = `${giro.toFixed(1)}deg`;
  return peca;
}

// No impacto da marreta: a peça volta ao lugar em 4 degraus; as classes saem 500 ms depois.
function devolver(peca) {
  if (peca.volta || peca.limpa) return;
  peca.el.classList.remove('segredos-caindo');
  peca.el.classList.add('segredos-voltando');
  peca.el.style.translate = peca.antes.translate;
  peca.el.style.rotate = peca.antes.rotate;
  peca.volta = setTimeout(() => limparPeca(peca), 500);
}

function limparPeca(peca) {
  clearTimeout(peca.volta);
  if (peca.limpa) return;
  peca.limpa = true;
  peca.el.classList.remove('segredos-caindo', 'segredos-voltando', 'segredos-em-bloco');
  peca.el.style.removeProperty('--queda-atraso');
  peca.el.style.translate = peca.antes.translate;
  peca.el.style.rotate = peca.antes.rotate;
}

// A turma: até 4 aprendizes de pixel 2, de frente para a esquerda, no metal de agora. Entram pela direita, um abaixo do
// outro; cada um cuida das peças de índice ≡ n (mod 4).
function chamarTurma() {
  const camada = document.createElement('div');
  camada.className = 'segredos-turma';
  camada.setAttribute('aria-hidden', 'true');
  document.body.append(camada);
  const largura = tamanhoDaTela().largura;
  tremor.camada = camada;
  tremor.turma = Array.from({ length: Math.min(4, tremor.pecas.length) }, (_, n) => {
    const tela = document.createElement('canvas');
    tela.className = 'pixel';
    camada.append(tela);
    const aprendiz = {
      tela, fase: 'voo', voo: null, bateu: false,
      ator: montar(tela, { pixel: 2, reduzido: false }).definir({ dir: -1, asas: 'rapidas' }),
      fila: tremor.pecas.filter((_, j) => j % 4 === n),
      pos: { x: largura + 30 + 20 * n, y: 40 + 50 * n },
    };
    proximaPeca(aprendiz);
    return aprendiz;
  });
}

// A ponta da marreta encosta na ponta direita da peça caída (onde ela estiver agora).
function pontaDaPeca(peca) {
  const r = peca.el.getBoundingClientRect();
  return { x: Math.min(tamanhoDaTela().largura - 30, r.right - 4), y: r.top + Math.min(r.height / 2, 18) };
}

// Voa até a próxima peça da fila em 0,45 s, num arco de 18 px; sem peça, sai em 0,5 s para cima e para a esquerda.
function proximaPeca(a) {
  while (a.fila.length && !a.fila[0].el.isConnected) a.fila.shift();
  const de = { ...a.pos };
  if (a.fila.length) {
    a.fase = 'voo';
    a.voo = { de, para: null, t: 0, duracao: 0.45, arco: 18 };
  } else {
    a.fase = 'sai';
    a.voo = { de, para: { x: de.x - 60, y: -60 }, t: 0, duracao: 0.5, arco: 0 };
  }
}

// Devolve se o aprendiz ainda está na tela.
function moverAprendiz(a, dt) {
  if (a.fase === 'foi') return false;
  a.ator.avancar(dt);
  if (a.voo) {
    const v = a.voo;
    v.t += dt;
    const u = Math.min(1, v.t / v.duracao), s = suave(u);
    const para = v.para ?? pontaDaPeca(a.fila[0]);
    a.pos = { x: v.de.x + (para.x - v.de.x) * s, y: v.de.y + (para.y - v.de.y) * s - Math.sin(Math.PI * u) * v.arco };
    a.ator.definir({ asas: 'rapidas' });
    if (u >= 1) {
      a.voo = null;
      if (a.fase === 'sai') {
        a.fase = 'foi';
        a.tela.remove();
        return false;
      }
      a.fase = 'golpe';
      a.bateu = false;
    }
  } else if (a.fase === 'golpe') {
    const peca = a.fila[0];
    // Segue a peça até o impacto; dali ela sobe sozinha e ele fica onde bateu.
    if (!peca.volta) a.pos = pontaDaPeca(peca);
    a.ator.definir({ asas: 'batendo' });
    if (!a.bateu) {
      a.bateu = true;
      a.ator.golpear(() => devolver(peca));
    } else if (!a.ator.golpeando) {
      a.fila.shift();
      proximaPeca(a);
    }
  }
  const t = a.ator.ponta(), k = a.ator.dpr;
  a.tela.style.transform = `translate(${Math.round((a.pos.x - t.x) * k) / k}px, ${Math.round((a.pos.y - t.y) * k) / k}px)`;
  a.ator.pintar();
  return true;
}

function animarTerremoto(dt) {
  tremor.t += dt;
  if (!tremor.turma) {
    if (tremor.t >= 1.3) chamarTurma();
    return;
  }
  let alguem = false;
  for (const a of tremor.turma) if (moverAprendiz(a, dt)) alguem = true;
  if (!alguem) acabarTerremoto();
}

// O último aprendiz foi embora (ou o movimento reduzido ligou no meio): tudo no lugar, e só agora a moeda.
function acabarTerremoto() {
  const t = tremor;
  tremor = null;
  for (const peca of t.pecas) limparPeca(peca);
  t.camada?.remove();
  dizer(FALAS.ninguemViu, 2.4);
  desbloquear('terremoto');
}

// ---------- o busto: nariz e inscrição ----------

// O retrato inteiro à vista: esculpido até o fim, ou o busto sozinho quando o show falhou sem o bloco.
const retratoPronto = () => !!cena && !!busto?.naturalWidth
  && (cena.dataset.revelado === '100' || document.body.classList.contains('falhou'));

// O busto em px da cena (a cena pode estar transladada: a diferença dos retângulos não muda) e a cena na janela.
function quadroDoBusto() {
  const c = cena.getBoundingClientRect(), b = busto.getBoundingClientRect();
  return { x: b.left - c.left, y: b.top - c.top, w: b.width, h: b.height, cx: c.left, cy: c.top };
}

const caixaDe = pontos => {
  const xs = pontos.map(p => p[0]), ys = pontos.map(p => p[1]);
  const x = Math.min(...xs), y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
};

// As camadas de pedra sobre o retrato (uma para o nariz, outra para a inscrição), em px da cena, encaixadas no pixel de
// dispositivo. Redimensionar o canvas já o limpa.
const pedras = {};

function pedra(nome, x, y, w, h) {
  const k = densidade();
  let tela = pedras[nome];
  if (!tela) {
    tela = pedras[nome] = document.createElement('canvas');
    tela.className = `segredos-pedra segredos-${nome}`;
    tela.setAttribute('aria-hidden', 'true');
    cena.append(tela);
  }
  const x0 = Math.round(x * k) / k, y0 = Math.round(y * k) / k;
  tela.width = Math.max(1, Math.round(w * k));
  tela.height = Math.max(1, Math.round(h * k));
  Object.assign(tela.style, { left: `${x0}px`, top: `${y0}px`, width: `${tela.width / k}px`, height: `${tela.height / k}px` });
  return { ctx: tela.getContext('2d'), x: x0, y: y0, k };
}

function tirarPedra(nome) {
  pedras[nome]?.remove();
  delete pedras[nome];
}

// --- o nariz ---

const nariz = { toques: 0, quebrado: false, espera: 0 };
const NAO_E_NARIZ = 'a, button, input, textarea, select, label, summary, [role="button"], [role="dialog"], #ajuda';

function medidasDoNariz(q) {
  const n = perfil.busto.nariz;
  return { x: q.x + n.x * q.w, y: q.y + n.y * q.h, rx: n.raioX * q.w, ry: n.raioY * q.h };
}

function centroDoNariz() {
  const q = quadroDoBusto(), m = medidasDoNariz(q);
  return { x: q.cx + m.x, y: q.cy + m.y };
}

function aoTocarNoNariz(e) {
  if (e.button !== 0 || nariz.quebrado || !retratoPronto()) return;
  if (e.target?.closest?.(NAO_E_NARIZ)) return;
  const b = busto.getBoundingClientRect();
  if (!b.width || !noNariz((e.clientX - b.left) / b.width, (e.clientY - b.top) / b.height, perfil.busto.nariz)) return;
  nariz.toques += 1;
  if (!reduzido()) lascar(e.clientX, e.clientY);
  if (nariz.toques >= 5) quebrarNariz({ x: e.clientX, y: e.clientY });
}

// Quatro lascas de mármore saltam de cada golpe (com uma sombra dura, para não sumirem sobre o busto).
function lascar(x, y) {
  for (let i = 0; i < 4; i++) {
    fx.particulas.push({
      x, y, vx: (Math.random() * 2 - 1) * 70, vy: -(60 + Math.random() * 90), g: 520,
      vida: 0.7, idade: 0, lado: 3, cor: '#e9e3d8', sombra: '#9c907e',
    });
  }
  ligarRelogio();
}

function quebrarNariz(ponto = centroDoNariz()) {
  nariz.toques = 0;
  nariz.quebrado = true;
  pintarNariz();
  if (!reduzido()) soltarPedaco();
  dizer(FALAS.classico, 2.2);
  desbloquear('nariz', ponto);
  clearTimeout(nariz.espera);
  nariz.espera = setTimeout(colarNariz, 3200);
}

// No lugar do nariz, a fratura chapada: degradê na diagonal, pintinhas em espiral e o contorno mordido.
function pintarNariz() {
  const q = quadroDoBusto(), m = medidasDoNariz(q);
  const pontos = contornoDaQuebra(m.x, m.y, m.rx, m.ry);
  const caixa = caixaDe(pontos), margem = 3;
  const { ctx, x, y, k } = pedra('nariz', caixa.x - margem, caixa.y - margem, caixa.w + 2 * margem, caixa.h + 2 * margem);
  const cx = (m.x - x) * k, cy = (m.y - y) * k, rx = m.rx * k, ry = m.ry * k;
  const s = (q.w / 1024) * k;   // px do canvas por px da imagem do busto
  ctx.beginPath();
  pontos.forEach(([px, py], i) => ctx[i ? 'lineTo' : 'moveTo']((px - x) * k, (py - y) * k));
  ctx.closePath();
  const degrade = ctx.createLinearGradient(cx - rx, cy - ry, cx + rx, cy + ry);
  degrade.addColorStop(0, '#d8d0c2');
  degrade.addColorStop(0.6, '#c7bdac');
  degrade.addColorStop(1, '#b3a894');
  ctx.fillStyle = degrade;
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.fillStyle = 'rgba(90, 78, 62, 0.28)';
  const pw = Math.max(1, Math.round(4 * s)), ph = Math.max(1, Math.round(3 * s));
  for (let j = 0; j < 26; j++) {
    const a = j * 2.4, r = Math.sqrt((j + 0.5) / 26) * 0.85;
    ctx.fillRect(Math.round(cx + Math.cos(a) * r * rx - pw / 2), Math.round(cy + Math.sin(a) * r * ry - ph / 2), pw, ph);
  }
  ctx.restore();
  ctx.strokeStyle = 'rgba(80, 68, 52, 0.45)';
  ctx.lineWidth = 2.2 * s;
  ctx.lineJoin = 'round';
  ctx.stroke();
}

// O pedaço que cai é o recorte de verdade da imagem, no mesmo contorno da fratura; parte do canto de cima, à esquerda.
function soltarPedaco() {
  const q = quadroDoBusto(), m = medidasDoNariz(q), k = densidade();
  const pontos = contornoDaQuebra(m.x, m.y, m.rx, m.ry);
  const caixa = caixaDe(pontos);
  const tela = document.createElement('canvas');
  tela.width = Math.max(1, Math.round(caixa.w * k));
  tela.height = Math.max(1, Math.round(caixa.h * k));
  const ctx = tela.getContext('2d');
  ctx.beginPath();
  pontos.forEach(([px, py], i) => ctx[i ? 'lineTo' : 'moveTo']((px - caixa.x) * k, (py - caixa.y) * k));
  ctx.closePath();
  ctx.clip();
  const sx = busto.naturalWidth / q.w, sy = busto.naturalHeight / q.h;
  ctx.drawImage(busto, (caixa.x - q.x) * sx, (caixa.y - q.y) * sy, caixa.w * sx, caixa.h * sy, 0, 0, tela.width, tela.height);
  fx.pedaco = {
    tela, x: q.cx + caixa.x, y: q.cy + caixa.y, w: caixa.w, h: caixa.h,
    vx: 40 + Math.random() * 60, vy: -120, angulo: 0, giro: 3 + Math.random() * 3,
  };
  ligarRelogio();
}

// A ponta do cinzel do lado direito do nariz, ele olhando para a esquerda; null se a primeira tela saiu da vista.
function pontoDoNariz() {
  if (!retratoPronto()) return null;
  const q = quadroDoBusto(), m = medidasDoNariz(q);
  const p = { x: q.cx + m.x + 0.6 * m.rx, y: q.cy + m.y };
  return p.y < 60 || p.y > innerHeight - 20 ? null : deOlharEsquerda(p);
}

// 3,2 s depois de quebrar, ele vem colar: vira para o nariz e dá um golpe; no impacto o nariz volta. Se ele não puder
// vir, o nariz se ajeita sozinho 2,5 s depois; se o recado cair no meio, na hora.
function colarNariz() {
  if (!nariz.quebrado) return;
  let bateu = false, colou = false;
  const r = {
    nome: 'nariz', meta: 'nariz',
    alvo: pontoDoNariz,
    chegou() { virar(-1); },
    quadro() {
      const ator = mascote.ator;
      if (!ator) return;
      if (!bateu) {
        bateu = true;
        ator.definir({ asas: 'batendo' }).golpear(consertarNariz);
      } else if (!ator.golpeando && !colou) {
        colou = true;
        acabar(r);
        dizer(FALAS.colei, 2.4);
      }
    },
    perdeu() { if (!colou) consertarNariz(); },
  };
  if (!mandar(r)) nariz.espera = setTimeout(consertarNariz, 2500);
}

function consertarNariz() {
  clearTimeout(nariz.espera);
  nariz.quebrado = false;
  nariz.toques = 0;
  tirarPedra('nariz');
}

// --- o tédio ---

const OCIOSO = 40000;   // ms sem nenhum gesto do visitante
const SALTO = 0.22;     // s de uma letra à outra
// alvo: a letra em que ele trabalha · salto: { de, t } entre duas letras · golpe: 'pronto' | 'batendo' | null
const tedio = { riscou: false, letras: 0, alvo: 0, salto: null, golpe: null, fim: false };
let ociosoDesde = 0;

const mexeu = () => { ociosoDesde = performance.now(); };

// A inscrição em px da cena, centrada em perfil.busto.base (x, e y no meio da linha) com a largura dela: c é o lado de
// um sulco em px de dispositivo (inteiro, para as letras ficarem nítidas), cel o mesmo em px CSS.
function medidasDaInscricao(q) {
  const base = perfil.busto.base, k = densidade(), colunas = INSCRICAO.length * 4 - 1;
  const c = Math.max(2, Math.round((base.largura * q.w / colunas) * k));
  const largura = (colunas * c) / k, altura = (5 * c) / k;
  return {
    c, k, cel: c / k, largura, altura, cx: q.cx, cy: q.cy,
    x: Math.round((q.x + base.x * q.w - largura / 2) * k) / k,
    y: Math.round((q.y + base.y * q.h - altura / 2) * k) / k,
  };
}

const linhaNaTela = m => {
  const x = m.cx + m.x, y = m.cy + m.y;
  return x >= 0 && x + m.largura <= tamanhoDaTela().largura && y >= 60 && y + m.altura <= innerHeight;
};

// Cada sulco é um quadrado escuro com a borda clara para baixo e para a direita (a luz vem de cima, à esquerda).
function pintarInscricao() {
  if (!tedio.letras || !retratoPronto()) return;
  const m = medidasDaInscricao(quadroDoBusto());
  const { ctx } = pedra('inscricao', m.x, m.y, m.largura, m.altura);
  const c = m.c, g = Math.max(1, Math.round(c / 5)), lista = sulcos(INSCRICAO, tedio.letras);
  ctx.fillStyle = 'rgba(245, 240, 230, 0.75)';
  for (const [col, lin] of lista) ctx.fillRect(col * c + g, lin * c + g, c - g, c - g);
  ctx.fillStyle = 'rgba(92, 80, 64, 0.78)';
  for (const [col, lin] of lista) ctx.fillRect(col * c, lin * c, c - g, c - g);
}

const proximaLetra = i => {
  while (i < INSCRICAO.length && INSCRICAO[i] === ' ') i++;
  return i;
};

// A ponta na borda direita da letra i, na meia altura da linha, ele olhando para a esquerda; null fora da vista.
function pontoDaLetra(i) {
  if (!retratoPronto()) return null;
  const m = medidasDaInscricao(quadroDoBusto());
  if (!linhaNaTela(m)) return null;
  return deOlharEsquerda({ x: m.cx + m.x + (4 * i + 3) * m.cel + 1, y: m.cy + m.y + 2.5 * m.cel });
}

// 40 s sem input, com a primeira tela à vista, a aba visível e o escultor livre: uma vez por carga.
function conferirTedio(agora) {
  if (tedio.riscou || document.hidden || agora - ociosoDesde < OCIOSO) return;
  if (!mascote?.ativo || !mascote.pronto || !retratoPronto()) return;
  if (!linhaNaTela(medidasDaInscricao(quadroDoBusto()))) return;
  if (reduzido()) {
    if (!mascote.trabalhoAtual) riscarTudo();
  } else if (livre()) {
    comecarTedio();
  }
}

// Onde ele está: na letra de trabalho ou num saltinho da anterior até ela (o arco sobe 3 px). Saltando assim, sem
// voo novo, ele não se vira para a direita a cada letra.
function pontoDoTedio() {
  const b = pontoDaLetra(tedio.alvo);
  if (!tedio.salto || !b) return b;
  const a = pontoDaLetra(tedio.salto.de);
  const u = Math.min(1, tedio.salto.t / SALTO), s = suave(u);
  return { x: a.x + (b.x - a.x) * s, y: a.y + (b.y - a.y) * s - Math.sin(Math.PI * u) * 3 };
}

// Ele voa até a primeira letra e risca uma por uma: um golpe, a letra aparece no impacto, um saltinho até a próxima
// (espaço não leva golpe). Se o recado cair no meio, o que foi riscado fica e ele não recomeça nesta carga.
function comecarTedio() {
  tedio.alvo = proximaLetra(tedio.letras);
  tedio.salto = null;
  const r = {
    nome: 'tedio', meta: 'tedio',
    livre: true,   // a base fica rente ao pé da tela, além do limite do companheiro
    alvo: pontoDoTedio,
    chegou() {
      virar(-1);
      tedio.golpe = 'pronto';
    },
    quadro(dt) {
      const ator = mascote.ator;
      if (!ator) return;
      if (tedio.salto && (tedio.salto.t += dt) >= SALTO) {
        tedio.salto = null;
        tedio.golpe = 'pronto';
      }
      if (tedio.golpe === 'pronto') {
        const i = tedio.alvo;
        tedio.golpe = 'batendo';
        ator.definir({ asas: 'batendo' }).golpear(() => riscar(i));
        return;
      }
      if (tedio.golpe !== 'batendo' || ator.golpeando) return;
      tedio.golpe = null;
      const proxima = proximaLetra(tedio.letras);
      if (proxima < INSCRICAO.length) {
        tedio.salto = { de: tedio.alvo, t: 0 };
        tedio.alvo = proxima;
        return;
      }
      tedio.fim = true;
      acabar(r);
      dizer(FALAS.historia, 2.6);
      desbloquear('tedio');
    },
    perdeu() {
      if (tedio.fim) return;
      ociosoDesde = performance.now();
      if (reduzido()) riscarTudo();   // o movimento reduzido ligou no meio: o resto sai de uma vez
    },
  };
  if (!mandar(r)) return;
  tedio.riscou = true;
  dizer(FALAS.entediado, 1.8);
}

function riscar(i) {
  tedio.letras = Math.max(tedio.letras, i + 1);
  pintarInscricao();
}

// Movimento reduzido: sem voo, a inscrição aparece inteira de uma vez.
function riscarTudo() {
  tedio.riscou = tedio.fim = true;
  tedio.letras = INSCRICAO.length;
  pintarInscricao();
  dizer([FALAS.entediado, FALAS.historia]);
  const m = medidasDaInscricao(quadroDoBusto());
  desbloquear('tedio', { x: m.cx + m.x + m.largura / 2, y: m.cy + m.y });
}

function repintarPedras() {
  if (!retratoPronto()) return;
  if (nariz.quebrado) pintarNariz();
  if (tedio.letras) pintarInscricao();
}

// ---------- teclado: eureca e deploy ----------

const CAMPOS = 'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="dialog"], dialog';
let teclado = TECLADO_VAZIO;

// Fora de campos e janelas e sem Ctrl/Alt/Meta: senão quem digita na conversa ou joga dispara segredo sem querer.
function aoTeclar(e) {
  // O Esc que ninguém tratou solta o recado dos segredos, como o do mascote (que só alcança o último recado aceito).
  if (e.key === 'Escape' && meuRecado) setTimeout(() => { if (!e.defaultPrevented) acabar(meuRecado); });
  if (e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return;
  if (e.target?.closest?.(CAMPOS)) return;
  const { estado, segredo } = teclar(teclado, e.key);
  teclado = estado;
  if (segredo === 'eureca') eureca();
  else if (segredo === 'deploy') deploy();
}

const CORRIDA = { segundos: 2.6, passosPorSegundo: 9, chao: 24 };

// Eureca: a moeda na hora (e com ela a cabeça careca no inventário). Livre, ele voa para fora da tela, embaixo à
// direita, tira a boina (e o elmo), grita e atravessa a janela correndo pelo pé dela; depois volta como estava.
function eureca() {
  desbloquear('eureca');
  const e = { fase: 'ida', t: 0, ponto: null };
  const r = {
    nome: 'eureca', livre: true, meta: 'eureca',
    alvo: () => e.ponto ?? pontaComPesEm(tamanhoDaTela().largura + 40, innerHeight - CORRIDA.chao),
    chegou() {
      if (e.fase !== 'ida') return;
      e.fase = 'corrida';
      virar(-1);
      mascote.ator?.definir({ semBoina: true, elmo: null, asas: 'fechadas', passos: 0 });
      dizer(FALAS.eureca, 2.4);
    },
    quadro(dt) {
      if (e.fase !== 'corrida' || !mascote.ator) return;
      e.t += dt;
      const u = Math.min(1, e.t / CORRIDA.segundos), largura = tamanhoDaTela().largura;
      e.ponto = pontaComPesEm(largura + 40 - (largura + 140) * u, innerHeight - CORRIDA.chao);
      mascote.ator.definir({ asas: 'fechadas', passos: e.t * CORRIDA.passosPorSegundo });
      if (u < 1) return;
      e.fase = 'fim';
      acabar(r);
    },
    perdeu() { mascote.ator?.definir({ ...visual(), asas: 'lentas', passos: 0 }); },
  };
  if (!livre() || !mandar(r)) dizer(FALAS.eureca, 1.6);
}

const FOGUETE = { ignicao: 0.9, aceleracao: 1700, fora: 0.45, pouso: 1.1 };

// Deploy (a palavra ou o Konami): a moeda na hora. Livre, ele treme na contagem, decola como foguete com um rastro de
// faíscas, some pelo alto e desce devagar no lugar de descanso. Ocupado (ou com movimento reduzido), só avisa.
function deploy() {
  desbloquear('deploy');
  const f = { fase: 'ignicao', t: 0, base: null, ponto: null, pouso: null, sobra: 0 };
  const r = {
    nome: 'deploy', livre: true, meta: 'deploy',
    // Chega na hora (o alvo é onde ele já está); daí em diante o caminho é desenhado aqui, quadro a quadro.
    alvo: () => f.ponto ?? mascote.ponto,
    chegou() {
      if (f.base) return;
      f.base = mascote.ponto;
      f.ponto = { ...f.base };
      dizer(FALAS.contagem, FOGUETE.ignicao);
    },
    quadro(dt) { voarDeFoguete(f, dt); },
    perdeu() {
      fx.chama = 0;
      if (f.fase !== 'fim') mascote.ator?.definir({ asas: 'lentas' });
    },
  };
  if (!livre() || !mandar(r)) dizer(FALAS.subiu, 2.4);
}

function voarDeFoguete(f, dt) {
  const ator = mascote.ator;
  if (!ator || !f.base) return;
  f.t += dt;
  ator.definir({ asas: 'fechadas', sentado: false });
  if (f.fase === 'ignicao') {
    f.ponto = { x: f.base.x + (Math.random() < 0.5 ? -1 : 1), y: f.base.y };   // treme no lugar
    fx.chama = 0.3;
    soltarFaiscas(f, dt, 30, 0.45);
    if (f.t >= FOGUETE.ignicao) Object.assign(f, { fase: 'subida', t: 0 });
  } else if (f.fase === 'subida') {
    f.ponto = { x: f.base.x, y: f.base.y - 0.5 * FOGUETE.aceleracao * f.t * f.t };
    fx.chama = 1;
    soltarFaiscas(f, dt, 140, 1);
    // Sobe até o canvas inteiro passar do topo da janela.
    if (f.ponto.y - ator.ponta().y + ator.altura < -20) Object.assign(f, { fase: 'fora', t: 0 });
  } else if (f.fase === 'fora') {
    fx.chama = 0;
    if (f.t < FOGUETE.fora) return;
    virar(-1);
    Object.assign(f, { fase: 'pouso', t: 0, pouso: descanso() });
  } else if (f.fase === 'pouso') {
    const u = Math.min(1, f.t / FOGUETE.pouso);
    const alto = -(ator.altura - ator.ponta().y) - 20;   // a ponta com o canvas inteiro acima da janela
    f.ponto = { x: f.pouso.x, y: alto + (f.pouso.y - alto) * saidaCubica(u) };
    fx.chama = 1 - u;   // freia: a chama encolhe até o toque no chão
    // Descendo, as faíscas levam a velocidade dele (a derivada da saída cúbica): saem sempre por baixo dos pés.
    const descida = ((f.pouso.y - alto) * 3 * (1 - u) ** 2) / FOGUETE.pouso;
    soltarFaiscas(f, dt, 10 + 100 * (1 - u), 0.8, descida);
    if (u < 1) return;
    f.fase = 'fim';
    fx.chama = 0;
    ator.definir({ asas: 'lentas' });
    acabar(meuRecado);   // o do deploy: um recado dos segredos de cada vez
    dizer(FALAS.subiu, 2.4);
  }
}

// Faíscas saindo dos pés, para baixo (a cor muda com a idade: FOGO).
function soltarFaiscas(f, dt, porSegundo, forca, heranca = 0) {
  const a = mascote.ator, p = mascote.ponto, t = a.ponta(), pes = a.pes();
  const x = p.x - t.x + pes.x, y = p.y - t.y + pes.y + a.pixel;
  for (f.sobra += porSegundo * dt; f.sobra >= 1; f.sobra -= 1) {
    fx.particulas.push({
      x: x + (Math.random() - 0.5) * 3 * a.pixel, y,
      vx: (Math.random() - 0.5) * 90, vy: heranca + (100 + Math.random() * 160) * forca,
      g: 200, vida: 0.35 + Math.random() * 0.4, idade: 0, lado: Math.random() < 0.3 ? 2 : Math.max(3, a.pixel - 1), fogo: true,
    });
  }
  ligarRelogio();
}

// ---------- o Contato: pétalas e o cochilo de madrugada ----------

let petalasPegas = null;   // lido do placar no primeiro toque
const NAO_E_PETALA = 'a, button, input, textarea, select, label, [role="dialog"], .casa-pergaminho, .laje';

// Pega a pétala a até 24 px do toque. Em voo, ela renasce na borda esquerda; parada (movimento reduzido), em outro
// ponto do céu. A contagem é guardada até 12; a 12ª cunha a moeda ali mesmo.
function aoTocarNoCampo(e) {
  if (e.button > 0 || e.target?.closest?.(NAO_E_PETALA)) return;
  const { contato, petala } = campo;
  const { geo, petalas, secao } = contato;
  if (!geo.W || !petalas.length) return;
  const r = secao.getBoundingClientRect();
  const x = e.clientX - r.left, y = e.clientY - r.top, u = geo.larga ? 4 : 3;
  const pega = petalas.find(p => {
    const deitada = Math.floor(p.giro) % 2 === 0;
    return Math.hypot(p.x + (deitada ? u : u / 2) - x, p.y + (deitada ? u / 2 : u) - y) <= 24;
  });
  if (!pega) return;
  const parado = reduzido();
  Object.assign(pega, petala(parado ? 8 + Math.random() * Math.max(1, geo.W - 24) : -8));
  if (parado) campo.pintarPetalas();   // parado, o Contato não repinta sozinho
  petalasPegas ??= Math.min(12, Number(conquistas?.placar('petalas')?.n) || 0);
  if (petalasPegas < 12) {
    petalasPegas += 1;
    conquistas?.placar('petalas', { n: petalasPegas });
  }
  etiquetar(secao, x, y, petalasPegas >= 12 ? 'primavera!' : `${petalasPegas}/12`);
  if (petalasPegas >= 12) desbloquear('petalas', { x: e.clientX, y: e.clientY });
}

// A etiqueta fica centrada no toque, mas inteira dentro da seção (que corta o que passa da borda).
function etiquetar(secao, x, y, texto) {
  const el = document.createElement('span');
  el.className = 'petala-pega';
  el.setAttribute('aria-hidden', 'true');
  el.textContent = texto;
  el.style.top = `${Math.round(y)}px`;
  secao.append(el);
  const meia = el.offsetWidth / 2;
  el.style.left = `${Math.round(Math.min(Math.max(x, meia + 4), secao.clientWidth - meia - 4))}px`;
  setTimeout(() => el.remove(), 900);
}

// De madrugada, pousado num telhado do Contato, ele cochila: depois da última fala e de 1,5 s quieto, fecha os olhos,
// solta um "zzz" e outro a cada 6 s. Dormindo, não olha em volta.
let sono = null;   // { desde, proximo, dormindo }

function cuidarDoSono(agora, noQuadro) {
  const c = campo?.contato;
  const noTelhado = !!c?.noite && c.fase === 'poleiro' && mascote?.trabalhoAtual === 'contato';
  if (!noTelhado) {
    // Voou para outro telhado ou a noite acabou: abre os olhos. (Se ele largou o trabalho, o mascote já os abriu.)
    if (sono?.dormindo && mascote?.trabalhoAtual === 'contato') {
      mascote.ator?.definir({ dormindo: false });
      acordar();
    }
    sono = null;
    return;
  }
  sono ??= { desde: agora, proximo: 0, dormindo: false };
  if (!sono.dormindo) {
    if (mascote.falando) { sono.desde = agora; return; }
    if (agora - sono.desde < 1500) return;
    sono.dormindo = true;
    acordar();   // repinta de olhos fechados mesmo com o relógio parado (movimento reduzido)
  }
  mascote.ator?.definir({ dormindo: true });
  if (noQuadro) virar(-1);
  if (agora >= sono.proximo && !mascote.falando) {
    sono.proximo = agora + 6000;
    falar(FALAS.zzz, 2);
  }
}

// ---------- entrada ----------

// O que o movimento reduzido ligado no meio interrompe: tudo vai para o estado final.
function pararTudo() {
  if (tremor) acabarTerremoto();
  apagarFx();
  document.documentElement.classList.remove('segredos-sino');
  acabar(meuRecado);
}

function vigiar() {
  const agora = performance.now();
  cuidarDoSono(agora, false);
  conferirTedio(agora);
}

export async function iniciar() {
  cena = document.getElementById('cena');
  busto = document.getElementById('busto');
  const [m, movimento, c, contato] = await Promise.all([
    import('../mascote.js'),
    import('../nucleo/movimento.js'),
    import('./conquistas.js').catch(() => null),
    import('../secoes/contato.js').catch(() => null),
  ]);
  ({ mascote, falar, virar, recado, livre, extra, deOlharEsquerda, descanso, tamanhoDaTela } = m);
  reduzido = movimento.reduzido;
  conquistas = c;
  campo = contato?.contato?.secao ? contato : null;

  repassando = true;
  ouvir('cutucar', aoCutucar, { passados: true });
  repassando = false;
  // "Apagar meu progresso": o que esta carga contou recomeça (senão a próxima cutucada ou pétala devolveria a medalha).
  ouvir('reset', () => {
    cutucadas = CUTUCADAS_ZERO;
    teclado = TECLADO_VAZIO;
    nariz.toques = 0;
    petalasPegas = null;
  });

  ociosoDesde = performance.now();
  for (const tipo of ['pointermove', 'pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll']) {
    addEventListener(tipo, mexeu, { capture: true, passive: true });
  }
  document.addEventListener('keydown', aoTeclar);
  if (cena && busto) document.addEventListener('pointerdown', aoTocarNoNariz);
  campo?.contato.secao.addEventListener('pointerdown', aoTocarNoCampo);
  // O tédio e o sono também são conferidos fora do relógio, que dorme quando nada se mexe.
  setInterval(vigiar, 1000);
  extra({ quadro: () => cuidarDoSono(performance.now(), true) });
  movimento.aoMudar(parado => { if (parado) pararTudo(); });
  let pedido = 0;
  addEventListener('resize', () => { pedido ||= requestAnimationFrame(() => { pedido = 0; repintarPedras(); }); });
}

// Para testar à mão, no console: (await import('/js/jogos/segredos.js')).surpresas.terremoto()
export const surpresas = {
  sino: tocarSino,
  terremoto,
  eureca,
  deploy,
  nariz: () => { if (retratoPronto() && !nariz.quebrado) quebrarNariz(); },
  tedio: () => { ociosoDesde = -Infinity; conferirTedio(performance.now()); },
  get estado() {
    return { cutucadas: { ...cutucadas }, nariz: { ...nariz }, letras: tedio.letras, petalas: petalasPegas, tremor: !!tremor };
  },
};
