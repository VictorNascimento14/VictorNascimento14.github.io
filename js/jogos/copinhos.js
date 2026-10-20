// O jogo da luz ("copinhos") nas caixas de bronze dos Projetos (spec 02 §1.4, §2.4, §5.7, §6.11). Depois que o
// visitante abriu as cinco caixas, na primeira vez que o anel fica quieto e inteiro à vista o escultor começa sozinho:
// as plaquetas viram "?", a luz entra numa caixa (a tampa sobe uma fresta e a boca acende), a tampa desce, as caixas
// trocam de lugar pelo anel, mais rápido a cada rodada, e o visitante escolhe. Três acertos seguidos: `copinhos`.
// Enquanto o jogo dura, o anel é dele (anelDeCaixas.travar). Com movimento reduzido nada anda: o par que vai trocar
// ganha um contorno, a legenda diz quais são, e só então as duas trocam de lugar. Assim o jogo continua possível.
//
// As regras, no topo, são puras e testadas no Node (tests/jogos.test.js); o resto é carregado em iniciar().
import { registrar, acordar } from '../nucleo/relogio.js';
import { suave, limitar } from '../nucleo/pixel.js';
import { ouvir } from '../nucleo/sinais.js';

// ---------- as regras ----------

// Trocas por rodada e quanto dura cada uma (s). O original, com três caixas, fazia 5, 7 e 9 trocas de 0,62, 0,46 e
// 0,34 s, e um par sorteado entre três leva a caixa da luz 2 vezes em 3. Com cinco caixas um par ao acaso a levaria só
// 2 vezes em 5 e a rodada ficaria mais fácil de seguir. O sorteio abaixo mantém a luz andando na mesma proporção (o
// olho tem o mesmo trabalho do original, com mais caixas para despistar), e a troca que pula uma vaga ganha 25% de
// tempo, porque percorre o dobro do arco.
export const RODADAS = [{ trocas: 5, duracao: 0.62 }, { trocas: 7, duracao: 0.46 }, { trocas: 9, duracao: 0.34 }];
export const CHANCE_DA_LUZ = 2 / 3;
// Movimento reduzido: cada troca dura isto; o contorno do par fica 70% do tempo e então as duas trocam de lugar.
export const RODADAS_PARADAS = [1.2, 1.0, 0.85];

const modulo = (v, m) => ((v % m) + m) % m;

// Diferença assinada mais curta de `de` até `para` num anel de n vagas, em (−n/2, n/2].
export function diferenca(de, para, n) {
  let d = modulo(para - de, n);
  if (d > n / 2) d -= n;
  return d;
}

// Onde uma vaga fica para quem olha o anel: 'frente', 'direita', 'esquerda', 'fundo à direita', 'fundo à esquerda'.
export function lugar(vaga, frente, n) {
  const d = Math.round(diferenca(frente, vaga, n));
  if (d === 0) return 'frente';
  const lado = d > 0 ? 'direita' : 'esquerda';
  return Math.abs(d) === 1 ? lado : `fundo à ${lado}`;
}

export const duracaoDaTroca = (base, d) => base * (Math.abs(d) > 1 ? 1.25 : 1);

// As trocas de uma rodada: pares de vagas [a, b] (a caixa de `a` vai para `b` passando na frente; a de `b` vai para `a`
// por trás). Com chance `chance` o par leva a caixa da luz, com a outra ponta sorteada entre as demais; senão é um par
// das outras. Quem passa na frente é sorteado. Com três caixas é exatamente o sorteio do original. Devolve as trocas e
// a vaga onde a luz termina.
export function sortearTrocas(n, quantas, luz, sorteio = Math.random, chance = CHANCE_DA_LUZ) {
  const trocas = [];
  let onde = luz;
  for (let k = 0; k < quantas; k++) {
    let a, b;
    if (n < 3 || sorteio() < chance) {
      a = onde;
      b = modulo(onde + 1 + Math.floor(sorteio() * (n - 1)), n);
    } else {
      const outras = [...Array(n).keys()].filter(v => v !== onde);
      const i = Math.floor(sorteio() * outras.length);
      let j = Math.floor(sorteio() * (outras.length - 1));
      if (j >= i) j++;
      [a, b] = [outras[i], outras[j]];
    }
    if (sorteio() < 0.5) [a, b] = [b, a];
    trocas.push([a, b]);
    if (onde === a) onde = b;
    else if (onde === b) onde = a;
  }
  return { trocas, fim: onde };
}

// ---------- o jogo na página ----------

const OFERTA = 2.5;              // s de anel quieto e inteiro à vista até ele começar sozinho
// Prioridade do trabalho do mascote: acima do recado (10) e abaixo de tudo o que uma seção pede. Ocupado em outra
// parte, ele fica onde está e o jogo segue calado (a legenda continua narrando).
const PRIORIDADE = 12;
const FALAS = {
  comeco: ['Você viu as cinco. Agora acha a luz!', 'Olha a luz. Não perde ela!'],
  escolha: ['E aí? Qual?', 'Vai, escolhe!', 'Tenho minhas dúvidas...'],
  acerto: ['Sorte!', 'Hmm. Sorte de novo?'],
  tres: 'Três seguidas? Tá treinando, né!',
  erro: ['Rá! Tava aqui!', 'Quase!', 'Essa caixa tava vazia desde o começo!'],
};
const DESAFIO = 'Duvido você achar a luz!';

// O que vem da página, carregado em iniciar().
let mascote, falar, trabalho, livre, virar, tamanhoDaTela, dentroDaTela, reduzido, anelDeCaixas;
let desbloquear, tem, placar, registrarJogo, ir, aqui, fecharConversa, conversaAberta;

const jogo = {
  fase: null,           // null | espera | inicio | mostra | troca | escolha | revela | casa
  t: 0,                 // s na fase
  intro: false, rodada: 0, seguidas: 0,
  luz: null,            // a caixa (o registro do anel) que tem a luz
  trocas: [], troca: null,
  tampas: null,         // tampas que ficaram abertas e descem no começo da rodada
  escolhida: null, certo: false,
  volta: null,          // a volta de cada caixa para a própria vaga
  depois: null,         // { em, fn }: a próxima rodada ou o fim
  trava: null,
};
let caixas = [], n = 0, palco = null, anelEl = null, sair = null, tarefa = null;
let oferta = 0, ofereceu = false;
let direitaDoAnel = 0;           // px do palco até a borda da caixa mais à direita, com o anel parado
const abertas = new Set();       // caixas abertas nesta carga (o Colecionador soma entre visitas)

const sortear = lista => lista[Math.floor(Math.random() * lista.length)];
const vagaDe = c => modulo(Math.round(c.vaga ?? c.i), n);
const caixaNaVaga = v => caixas.find(c => vagaDe(c) === v);
const legendar = (numeral, nome) => anelDeCaixas.legendar(numeral, nome);
const redesenhar = c => anelDeCaixas.redesenhar(c);
const daRodada = () => `RODADA ${jogo.rodada + 1} · ${jogo.seguidas} DE 3`;
const comArtigo = lugarDaCaixa => (lugarDaCaixa.startsWith('fundo') ? `do ${lugarDaCaixa}` : `da ${lugarDaCaixa}`);

function lerPlacar() {
  const p = placar('copinhos') ?? {};
  return { best: Number.isInteger(p.best) && p.best > 0 ? p.best : 0, jogou: !!p.jogou };
}

const colecionou = () => tem('caixas') || abertas.size >= n;

// As falas do jogo só saem com o escultor nele (ou livre); ocupado em outra parte, ele não fala daqui.
function dizer(texto, segundos = 2.4) {
  if (mascote.ativo && (mascote.trabalhoAtual === 'luz' || livre())) falar(texto, segundos);
}

// A tampa sobe uma fresta e a boca acende: a luz, de 0 a 1.
function acender(c, k) {
  c.tampa = 0.28 * k;
  c.brilho = 0.9 * k;
  redesenhar(c);
}

function trocarPlaqueta(c, numeral) {
  c.bau.definir({ numeral });
  if (!reduzido()) c.fundicaoT = 0;   // cada plaqueta trocada passa o brilho de fundição
  redesenhar(c);
}

function agendar(segundos, fn) {
  jogo.depois = { em: segundos, fn };
}

// ---------- começar, rodar e parar ----------

export function comecar(intro = false) {
  if (jogo.fase || !n) return;
  Object.assign(jogo, {
    fase: 'espera', t: 0, intro, rodada: 0, seguidas: 0, luz: null, trocas: [], troca: null, tampas: null,
    escolhida: null, volta: null, depois: null,
  });
  placar('copinhos', { jogou: true });
  jogo.trava = anelDeCaixas.travar({ aoEscolher: escolher });
  fecharConversa?.();
  caixas.forEach((c, i) => { if (c.estado !== 'fechada') anelDeCaixas.fechar(i); });
  legendar('JOGO DA LUZ', 'Olha a luz.');
  anelEl.classList.add('luz-ligada');
  const focoNoAnel = caixas.some(c => c.tranca === document.activeElement);
  for (const c of caixas) c.tranca.tabIndex = -1;
  sair.hidden = false;
  if (focoNoAnel) sair.focus({ preventScroll: true });
  medirAnel();   // de novo quando as rodadas começam, com o anel já parado
  chamarMascote();
  acordar();
}

// Tudo fechado e o anel parado: as plaquetas viram "?" e a primeira rodada começa. A luz só entra 0,7 s depois, quando
// o brilho dos "?" (0,55 s) já passou; sem essa espera o visitante toma o brilho pela luz.
function iniciarRodadas() {
  jogo.fase = 'inicio';
  medirAnel();
  for (const c of caixas) {
    c.vaga = c.i;
    c.faixa = 0;
    trocarPlaqueta(c, '?');
  }
  dizer(FALAS.comeco[jogo.intro ? 0 : 1], 2.6);
  rodada();
  jogo.t = -0.7;
}

function rodada() {
  const { trocas } = RODADAS[Math.min(jogo.rodada, RODADAS.length - 1)];
  const vagaDaLuz = Math.floor(Math.random() * n);
  Object.assign(jogo, {
    fase: 'mostra', t: 0, luz: caixaNaVaga(vagaDaLuz), trocas: sortearTrocas(n, trocas, vagaDaLuz).trocas,
    troca: null, escolhida: null,
  });
  // As tampas da rodada anterior descem antes (0,25 s); a luz entra 0,5 s depois do começo.
  const levantadas = caixas.filter(c => c.tampa > 0.001 || c.brilho > 0.001);
  jogo.tampas = levantadas.length ? levantadas.map(c => ({ c, tampa: c.tampa, brilho: c.brilho })) : null;
  if (jogo.tampas) jogo.t = -0.5;
  anelEl.classList.remove('luz-escolha');
  legendar(daRodada(), 'Olha onde a luz entra.');
}

function escolha() {
  Object.assign(jogo, { fase: 'escolha', t: 0, troca: null });
  anelEl.classList.add('luz-escolha');
  const frente = anelDeCaixas.frente;
  for (const c of caixas) {
    c.tranca.tabIndex = 0;
    c.tranca.setAttribute('aria-label', `Escolher a caixa ${comArtigo(lugar(vagaDe(c), frente, n))}`);
  }
  legendar(daRodada(), 'Onde está a luz?');
  dizer(sortear(FALAS.escolha));
}

function desligarEscolha() {
  anelEl.classList.remove('luz-escolha');
  for (const c of caixas) {
    c.tranca.tabIndex = -1;
    c.tranca.removeAttribute('aria-label');
  }
}

// O clique numa caixa, com o anel travado. Fora da escolha, nada.
function escolher(c) {
  if (jogo.fase !== 'escolha') return;
  Object.assign(jogo, { fase: 'revela', t: 0, escolhida: c, certo: c === jogo.luz });
  const ativo = document.activeElement;
  desligarEscolha();
  if (caixas.some(x => x.tranca === ativo) || ativo === document.body) sair.focus({ preventScroll: true });
  if (jogo.certo) acertou(c); else errou(c);
  acordar();
}

// Faíscas que saltam da boca de uma caixa (px de sprite da caixa; o anel as anima e desenha).
function faiscar(c, quantas) {
  if (reduzido()) return;
  for (let k = 0; k < quantas; k++) {
    c.faiscas.push({ x: 44 + 6 * Math.random(), y: 13, vx: -26 + 52 * Math.random(), vy: -18 - 26 * Math.random(), vida: 0.12 * Math.random() });
  }
  redesenhar(c);
}

function acertou(c) {
  jogo.seguidas++;
  jogo.rodada++;
  faiscar(c, 10);
  if (jogo.seguidas > lerPlacar().best) placar('copinhos', { best: jogo.seguidas });
  if (jogo.seguidas >= 3) {
    legendar('TRÊS SEGUIDAS', 'Ninguém te engana.');
    dizer(FALAS.tres, 2.8);
    faiscar(c, 18);
    desbloquear('copinhos', c.el);
    agendar(2.6, parar);
  } else {
    legendar(`${jogo.seguidas} DE 3`, jogo.seguidas === 1 ? 'Achou.' : 'De novo.');
    dizer(FALAS.acerto[jogo.seguidas - 1]);
    agendar(1.5, rodada);
  }
}

function errou(c) {
  const perdidas = jogo.seguidas;
  jogo.seguidas = 0;
  jogo.rodada = 0;
  if (!reduzido()) c.tremidaT = 0.2;
  legendar(perdidas ? `PERDEU A SEQUÊNCIA DE ${perdidas}` : 'NÃO ERA ESSA', 'A luz estava na outra.');
  dizer(sortear(FALAS.erro));
  agendar(2.1, rodada);
}

// "sair", Esc, o terceiro acerto ou o anel saindo inteiro da janela: as tampas descem e todas as caixas voltam juntas
// para a própria vaga (0,5 s), pelo caminho mais curto.
export function parar() {
  if (!jogo.fase || jogo.fase === 'casa') return;
  if (jogo.fase === 'espera') { terminar(); return; }
  desligarEscolha();
  for (const c of caixas) c.el.classList.remove('luz-troca');
  Object.assign(jogo, {
    fase: 'casa', t: 0, depois: null, troca: null, trocas: [],
    volta: caixas.map(c => ({ c, de: c.vaga ?? c.i, d: diferenca(c.vaga ?? c.i, c.i, n), faixa: c.faixa || 0, tampa: c.tampa, brilho: c.brilho })),
  });
  acordar();
}

function terminar() {
  const focoEmSair = document.activeElement === sair;
  for (const c of caixas) {
    Object.assign(c, { vaga: undefined, faixa: 0, tampa: 0, brilho: 0 });
    c.el.classList.remove('luz-troca');
    c.tranca.removeAttribute('aria-label');
    c.tranca.tabIndex = c.i === anelDeCaixas.frente ? 0 : -1;
    if (c.bau.estado.numeral !== c.numeral) trocarPlaqueta(c, c.numeral);
    else redesenhar(c);
  }
  jogo.fase = null;
  jogo.trava?.soltar();   // devolve a legenda da caixa da frente
  jogo.trava = null;
  anelEl.classList.remove('luz-ligada', 'luz-escolha');
  sair.hidden = true;
  soltarMascote();
  if (focoEmSair) caixas[anelDeCaixas.frente]?.tranca.focus({ preventScroll: true });
}

// ---------- uma troca ----------

function proximaTroca() {
  const par = jogo.trocas.shift();
  if (!par) { escolha(); return; }
  const [a, b] = par;
  const A = caixaNaVaga(a), B = caixaNaVaga(b), d = diferenca(a, b, n);
  const i = Math.min(jogo.rodada, RODADAS.length - 1);
  const dur = reduzido() ? RODADAS_PARADAS[i] : duracaoDaTroca(RODADAS[i].duracao, d);
  jogo.troca = { A, B, a, b, d, t: 0, dur, trocou: false };
  if (reduzido()) {
    // Sem animação, trocar duas caixas iguais não se vê: o par ganha um contorno antes, e a legenda diz qual é.
    A.el.classList.add('luz-troca');
    B.el.classList.add('luz-troca');
    const frente = anelDeCaixas.frente;
    const total = RODADAS[i].trocas;
    const nome = `${lugar(a, frente, n)} e ${lugar(b, frente, n)}.`;
    legendar(`TROCA ${total - jogo.trocas.length} DE ${total}`, nome[0].toUpperCase() + nome.slice(1));
  }
}

function andarTroca(dt) {
  const tr = jogo.troca;
  tr.t += dt;
  const { A, B } = tr;
  if (reduzido()) {
    if (!tr.trocou && tr.t >= 0.7 * tr.dur) {
      tr.trocou = true;
      Object.assign(A, { vaga: tr.b, faixa: 0 });
      Object.assign(B, { vaga: tr.a, faixa: 0 });
      A.el.classList.remove('luz-troca');
      B.el.classList.remove('luz-troca');
      redesenhar(A);
      redesenhar(B);
    }
  } else {
    // A de `a` passa na frente (faixa +0,5: maior, por cima); a de `b`, por trás.
    const u = Math.min(1, tr.t / tr.dur), s = suave(u), faixa = 0.5 * Math.sin(Math.PI * u);
    Object.assign(A, { vaga: u < 1 ? tr.a + tr.d * s : tr.b, faixa: u < 1 ? faixa : 0 });
    Object.assign(B, { vaga: u < 1 ? tr.b - tr.d * s : tr.a, faixa: u < 1 ? -faixa : 0 });
    redesenhar(A);
    redesenhar(B);
  }
  if (tr.t >= tr.dur) jogo.troca = null;
}

// ---------- o laço ----------

function quadro(dt) {
  if (!jogo.fase) return oferecer(dt);
  jogo.t += dt;
  const parado = reduzido();

  // O jogo acaba se o anel sair inteiro da janela.
  const r = palco.getBoundingClientRect();
  if (jogo.fase !== 'casa' && (r.bottom < 0 || r.top > innerHeight)) parar();

  if (jogo.depois && (jogo.depois.em -= dt) <= 0) {
    const { fn } = jogo.depois;
    jogo.depois = null;
    fn();
  }

  switch (jogo.fase) {
    case 'espera':
      if (!anelDeCaixas.ocupado()) iniciarRodadas();
      break;
    case 'inicio':
      break;
    case 'mostra': {
      if (jogo.tampas && jogo.t < 0) {
        const u = parado ? 1 : Math.min(1, (jogo.t + 0.5) / 0.25);
        for (const { c, tampa, brilho } of jogo.tampas) Object.assign(c, { tampa: tampa * (1 - u * u), brilho: brilho * (1 - u * u) });
        for (const { c } of jogo.tampas) { if (u >= 1 && !parado) c.tremidaT = 0.12; redesenhar(c); }
        if (u >= 1) jogo.tampas = null;
      }
      if (jogo.t >= 0) {
        // Sobe em 0,3 s, fica até 1,2 s e desce em 0,25 s; parado, fica acesa inteira o mesmo tempo.
        const t = jogo.t;
        const k = parado ? (t < 1.45 ? 1 : 0) : t < 0.3 ? t / 0.3 : t < 1.2 ? 1 : Math.max(0, 1 - (t - 1.2) / 0.25);
        acender(jogo.luz, k);
        if (t >= 1.45) {
          acender(jogo.luz, 0);
          Object.assign(jogo, { fase: 'troca', t: 0 });
          legendar(daRodada(), 'Não tira o olho.');
        }
      }
      break;
    }
    case 'troca':
      if (!jogo.troca) proximaTroca();
      if (jogo.troca) andarTroca(dt);
      break;
    case 'revela': {
      const { escolhida: c, luz, t } = jogo;
      const u = parado ? 1 : Math.min(1, t / 0.3);
      if (jogo.certo) acender(c, u);
      else {
        // A errada abre só uma fresta, sem luz; a da luz acende de 0,45 a 0,75 s.
        Object.assign(c, { tampa: 0.28 * u, brilho: 0 });
        redesenhar(c);
        acender(luz, parado ? (t >= 0.45 ? 1 : 0) : limitar((t - 0.45) / 0.3, 0, 1));
      }
      break;
    }
    case 'casa': {
      const u = parado ? 1 : Math.min(1, jogo.t / 0.5), s = suave(u);
      for (const v of jogo.volta) {
        Object.assign(v.c, { vaga: v.de + v.d * s, faixa: v.faixa * (1 - s), tampa: v.tampa * (1 - s), brilho: v.brilho * (1 - s) });
        redesenhar(v.c);
      }
      if (u >= 1) terminar();
      break;
    }
  }

  // Os raios e os pontinhos de luz andam na boca acesa (o anel só os anima em caixa aberta).
  if (!parado) for (const c of caixas) if (c.brilho > 0.05) { c.tempo += dt; redesenhar(c); }

  // Esperando a escolha, o relógio pode dormir: o clique acorda.
  return !!jogo.fase && (jogo.fase !== 'escolha' || !!jogo.depois);
}

// Oferta automática: só na primeira vez, depois do Colecionador, com tudo quieto por 2,5 s e o anel inteiro à vista.
// Devolve se as condições valem (o relógio fica acordado contando).
function oferecer(dt) {
  const pode = !ofereceu && colecionou() && !anelDeCaixas.ocupado() && mascoteLivre() && !conversaAberta()
    && !lerPlacar().jogou && inteiroNaJanela();
  oferta = pode ? oferta + dt : 0;
  if (oferta >= OFERTA) {
    ofereceu = true;
    oferta = 0;
    comecar(true);
  }
  return pode;
}

function inteiroNaJanela() {
  const r = palco.getBoundingClientRect();
  return r.top >= 0 && r.bottom <= innerHeight;
}

const mascoteLivre = () => livre() || (reduzido() && mascote.ativo && mascote.pronto && !mascote.trabalhoAtual);

// ---------- o escultor assistindo ----------

// O palco das cinco caixas ocupa a seção inteira: o canto do anel é a borda da caixa mais à direita (a tranca cobre o
// desenho dela). Medido com o anel parado: no meio de uma troca a caixa da frente cresce e ele tremeria junto.
function medirAnel() {
  const r = palco.getBoundingClientRect();
  direitaDoAnel = Math.max(...caixas.map(c => c.tranca.getBoundingClientRect().right)) - r.left;
}

// Paira sobre o canto de cima, à direita, do anel, os pés 12% da altura do palco acima dele; se a janela o empurraria
// para baixo, fica com a cabeça 8 px abaixo do "sair". Em telas de até 760 px pode passar das bordas.
function pontoDeAssistir() {
  const a = mascote.ator;
  if (!a) return null;
  const r = palco.getBoundingClientRect();
  if (r.bottom < 60 || r.top > innerHeight - 40) return null;
  const t = a.ponta(), p = a.pes(), o = a.origem();
  const x = Math.min(tamanhoDaTela().largura - 40, r.left + direitaDoAnel - 24);
  const acima = { x, y: r.top - 0.12 * r.height + t.y - p.y };
  if (dentroDaTela(acima).y <= acima.y + 0.5) return acima;
  const s = sair.getBoundingClientRect();
  const abaixo = { x, y: s.bottom + 8 + t.y - o.y };
  return dentroDaTela(abaixo).y >= abaixo.y - 0.5 ? abaixo : acima;
}

function chamarMascote() {
  if (tarefa) return;
  tarefa = trabalho({
    nome: 'luz',
    prioridade: PRIORIDADE,
    get livre() { return innerWidth <= 760; },
    alvo: () => (jogo.fase && jogo.fase !== 'casa' ? pontoDeAssistir() : null),
    quadro() {
      virar(-1);
      mascote.ator?.definir({ asas: 'batendo', sentado: false });
    },
  });
}

function soltarMascote() {
  const t = tarefa;
  tarefa = null;
  t?.soltar();
}

// ---------- entrada ----------

// Na escolha, ← e → passam o foco para a caixa vizinha no anel (a ordem do Tab é a do HTML, não a da tela).
function setas(e) {
  if (jogo.fase !== 'escolha' || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
  const c = caixas.find(x => x.tranca === e.target);
  if (!c) return;
  e.preventDefault();
  caixaNaVaga(modulo(vagaDe(c) + (e.key === 'ArrowLeft' ? -1 : 1), n))?.tranca.focus({ preventScroll: true });
}

// Na conversa, o jogo só fala quando é novidade (cinco caixas abertas e nunca jogou): no resto, os Projetos ficam com o
// que a conversa diz deles (o quiz do Faro e as caixas). A revanche fica no medalheiro.
function desafio() {
  // No meio do jogo, a conversa não oferece outra coisa (nem marca o "!" do quiz em cima dele).
  if (jogo.fase) {
    return { fala: 'Shh, tô de olho na luz!', chips: [['sair do jogo', () => { fecharConversa(); parar(); }], ['continuar', () => fecharConversa()]] };
  }
  if (!colecionou() || lerPlacar().jogou) return null;
  return {
    fala: DESAFIO,
    chips: [['aceito', () => { fecharConversa(); comecar(false); }], ['agora não', () => fecharConversa()]],
    novo: true,
  };
}

export async function iniciar() {
  const [m, mov, sec, q, conv] = await Promise.all([
    import('../mascote.js'), import('../nucleo/movimento.js'), import('../secoes/projetos.js'),
    import('./conquistas.js'), import('./conversa.js'),
  ]);
  ({ mascote, falar, trabalho, livre, virar, tamanhoDaTela, limitar: dentroDaTela } = m);
  ({ reduzido } = mov);
  ({ anelDeCaixas } = sec);
  ({ desbloquear, tem, placar, jogo: registrarJogo, ir } = q);
  ({ aqui, fechar: fecharConversa, aberta: conversaAberta } = conv);
  caixas = anelDeCaixas.caixas;
  n = caixas.length;
  palco = anelDeCaixas.palco;
  anelEl = palco?.closest('.anel');
  if (n < 3 || !anelEl) { n = 0; return; }

  sair = document.createElement('button');
  sair.type = 'button';
  sair.className = 'luz-sair';
  sair.hidden = true;
  sair.textContent = 'sair';
  sair.setAttribute('aria-label', 'Sair do jogo da luz');
  sair.addEventListener('click', parar);
  (anelEl.querySelector('.anel-controles') ?? palco).after(sair);

  ouvir('caixa-aberta', d => { if (d?.id) abertas.add(d.id); }, { passados: true });
  // "Apagar meu progresso" no meio de uma partida (o medalheiro abre por cima): a sequência recomeça, senão o próximo
  // acerto devolveria o Olho vivo.
  ouvir('reset', () => { jogo.seguidas = 0; });
  // Esc encerra; o Esc de uma janela aberta por cima (a conversa, o medalheiro) é dela.
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape' || !jogo.fase || e.defaultPrevented || conversaAberta() || e.target.closest?.('[role="dialog"]')) return;
    e.preventDefault();
    parar();
  });
  anelEl.addEventListener('keydown', setas);
  addEventListener('resize', () => { if (jogo.fase) requestAnimationFrame(medirAnel); });
  registrar(quadro);

  aqui('projetos', desafio);
  registrarJogo('copinhos', {
    nome: 'Jogo da luz',
    onde: 'nas caixas de projetos',
    placar: () => { const { best } = lerPlacar(); return !best ? '' : best === 1 ? 'recorde 1 acerto' : `recorde ${best} seguidas`; },
    jogar: () => { ir(palco); setTimeout(() => comecar(false), 700); },
  });
}
