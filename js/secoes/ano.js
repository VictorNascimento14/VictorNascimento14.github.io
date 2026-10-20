// Seção "Golpe a golpe": o ano do Victor no GitHub numa placa de bronze (spec 03; o golpe do dia é da spec 06 §6.14).
// Na primeira vez que a placa aparece, uma equipe de até quatro aprendizes (o ator do escultor em pixel 2) grava as
// semanas a golpe, o mascote senta na borda de cima e narra, e o total embaixo é esculpido da esquerda para a direita
// conforme os dias entram. Depois, o ponteiro (ou o dedo) mostra cada dia, e o pino de hoje aceita um golpe do
// visitante por dia. Nada mais é salvo: recarregar a página grava tudo de novo.
import {
  montar as montarPlaca, pino, disposicao, estatisticas, trechos, linhaDoGolpe, linhasPorSemana, indiceDoDia,
  PINO, CONTORNO, SALTO, VIDA_FAISCA,
} from '../arte/placa.js';
import { montar as montarAtor } from '../arte/escultor.js';
import { mascote, trabalho, livre, recado, fimDoRecado, falar, virar, sentarEm, deOlharEsquerda } from '../mascote.js';
import { perfil } from '../dados/perfil.js';
import { registrar, acordar } from '../nucleo/relogio.js';
import { suave, dpr } from '../nucleo/pixel.js';
import { reduzido } from '../nucleo/movimento.js';
import { ler, gravar } from '../nucleo/memoria.js';
import { emitir } from '../nucleo/sinais.js';

// O ritmo é o que dá a sensação de "golpe a golpe": ~0,34 s por semana (0,216 s até o impacto e 0,12 s de pulo),
// 0,16 s entre as entradas e 35 ms por linha na cascata. Tempos em s, distâncias em px CSS do palco.
const LIMIAR = 0.85;                    // fração do canvas visível que dispara a gravação…
const PERMANENCIA = 0.2;                // …por este tempo: passar pela placa num deslize não gasta a cena
const ESPERA = 0.35;                    // quanto a placa espera o mascote ficar livre…
const ESPERA_ESTACIONANDO = 1.6;        // …ou terminar de estacionar depois do retrato
const PIXEL_APRENDIZ = 2;               // fixo: numa placa pequena eles parecem grandes; numa grande, pequenos
const RITMO_APRENDIZ = 1.25;            // golpe e asas 25% mais rápidos que os do mascote
const ENTRADA = { atraso: 0.16, duracao: 0.42, arco: 10, dx: -26, y: -28 };
const PULO = { minimo: 0.12, velocidade: 700, longe: 60, arcoLongo: 14, arcoCurto: 3 };
const SAIDA = { duracao: 0.45, dx: 24, y: -44 };
const CASCATA = 0.035;                  // por linha de distância do dia golpeado
const LAMPEJO = 0.3;                    // o dia que entra salta e brilha um nível acima por este tempo
const OLHAR = 1.8;                      // sentado, ele olha para um lado e para o outro
const ADMIRAR = 3.6;                    // com a placa pronta, antes de levantar
const POLEIRO = 0.82;                   // pés a 82% da largura da placa: o balão não cobre o título
const ALCANCE = { topo: 60, base: 40 }; // mais perto que isso das bordas da janela, a placa fica sem ele
const GOLPE_DO_DIA = { brilho: 0.5, faiscas: 8 };

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const numeroPt = n => n.toLocaleString('pt-BR');
const rotuloDoMes = data => `${MESES[Number(data.slice(5, 7)) - 1]} ${data.slice(0, 4)}`;
const rotuloDoDia = data => `${Number(data.slice(8, 10))} ${rotuloDoMes(data)}`;

const FALAS = {
  equipe: ['Bora, time!', `Cada quadradinho é um dia em que o ${perfil.nome} mexeu em código.`],
  fim: (total, ano, dias) => [
    `${total} contribuições no GitHub em ${ano}.`,
    `O ${perfil.nome} programou em ${dias} dias só este ano!`,
    'Bom trabalho, equipe! Agora, recolher!',
  ],
  golpe: 'Esse é seu!',
};

let secao, canvas, palco, dica, numero;
let dados = null;          // assets/dados/contribuicoes.js
let numeros = null;        // estatisticas() dos dias
let placa = null;          // js/arte/placa.js montada
let gravados = null;       // 1 por dia já gravado (o mesmo array que a placa desenha)
let linhas = [];           // por semana que já teve dia: [primeira, última] linha com dia
let porSemana = [];        // os dias de cada semana
let contagem = 0;          // dias gravados
let feito = false;         // a placa está completa
let iniciada = false;      // a gravação já foi disparada (uma vez por carregamento)
let comEquipe = false;     // a equipe já foi criada
let visivel = false;
let aVista = false;        // ao menos 85% do canvas na janela
let tempoAVista = 0;       // há quanto tempo, antes de a gravação começar
let sujo = true;           // precisa redesenhar (só desenha visível; a lógica roda mesmo fora da tela)
let papel = null;          // o mascote nesta seção: { fase: 'esperar' | 'ir' | 'poleiro' | 'admirar', t, trabalho, registro }
let equipe = [];           // os aprendizes em cena
let pendentes = [];        // dias que vão acender: { indice, em }
let relogio = 0;           // relógio próprio (soma de dt)
let corte = -1;            // o último --gravado escrito
let dicaEm = null;         // o índice que a dica mostra agora
let hoje = null;           // o golpe do dia: { data, indice, feito }, ou null se hoje está fora da placa

export async function iniciar() {
  secao = document.getElementById('ano');
  if (!secao) return;
  try {
    dados = (await import('../../assets/dados/contribuicoes.js')).default;
  } catch (erro) {
    console.error('[ano] sem os dados de contribuições:', erro);
  }
  if (!dados?.days?.length) { secao.classList.add('sem-dados'); return; }

  canvas = document.getElementById('placa-canvas');
  palco = document.getElementById('placa-palco');
  dica = document.getElementById('placa-dica');
  numero = document.getElementById('placa-total');
  placa = montarPlaca(canvas, { dias: dados.days, fim: dados.end });
  gravados = new Uint8Array(placa.celulas.length);
  placa.definir({ gravados });
  linhas = linhasPorSemana(placa.celulas);
  for (const c of placa.celulas) (porSemana[c.semana] ??= []).push(c);

  preencherTextos();
  prepararGolpeDoDia();
  dispor();
  escreverCorte(0);
  placa.pintar();
  registrar(quadro);

  addEventListener('resize', () => { dispor(); acordar(); });
  vigiarDensidade();
  // A Fase 2 troca o metal com uma onda; aqui basta redesenhar no metal novo.
  new MutationObserver(() => {
    const metal = document.documentElement.dataset.metal;
    for (const a of equipe) a.ator.definir({ metal: metal === 'prata' || metal === 'ouro' ? metal : null });
    sujo = true;
    acordar();
  }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-metal'] });

  canvas.addEventListener('pointermove', apontar);
  canvas.addEventListener('pointerdown', apontar);
  // O dedo levantado não esconde a dica: ela fica até um toque em outro lugar.
  canvas.addEventListener('pointerleave', e => { if (e.pointerType !== 'touch') esconderDica(); });
  document.addEventListener('pointerdown', e => { if (e.target !== canvas) esconderDica(); });
  canvas.addEventListener('click', e => { if (conviteAberto() && itemSob(e)?.indice === hoje.indice) darGolpeDoDia(); });

  if (!('IntersectionObserver' in window)) {
    visivel = true;
    iniciada = true;
    finalizar(false);
    return;
  }
  new IntersectionObserver(entradas => {
    for (const e of entradas) {
      visivel = e.isIntersecting;
      // Uma folga de arredondamento: há navegador que entrega 0,8499 ao cruzar 0,85.
      aVista = e.intersectionRatio >= LIMIAR - 0.001;
      if (visivel || aVista) { sujo = true; acordar(); }
    }
  }, { threshold: [0, LIMIAR] }).observe(canvas);
  if (reduzido()) { iniciada = true; finalizar(false); }
}

// ---------- textos e layout ----------

function preencherTextos() {
  numeros = estatisticas(dados.days);
  const primeiro = dados.days[0][0], ultimo = dados.days.at(-1)[0];
  const fim = dados.end > ultimo ? dados.end : ultimo;
  for (const el of secao.querySelectorAll('[data-ano]')) el.textContent = dados.year;
  numero.textContent = numeroPt(dados.total);
  document.getElementById('ano-dias').textContent = numeroPt(numeros.ativos);
  document.getElementById('ano-seguidos').textContent = numeroPt(numeros.maiorSequencia);
  document.getElementById('ano-recorde').textContent = numeroPt(numeros.melhor.contagem);
  document.getElementById('placa-de').textContent = rotuloDoMes(primeiro).toUpperCase();
  document.getElementById('placa-ate').textContent = rotuloDoMes(fim).toUpperCase();
  canvas.setAttribute('aria-label', `Calendário de contribuições de ${perfil.nome} no GitHub em ${dados.year}, `
    + `de ${rotuloDoDia(primeiro)} a ${rotuloDoDia(ultimo)}: ${numeroPt(dados.total)} contribuições em `
    + `${numeroPt(numeros.ativos)} dias. O dia mais intenso foi ${rotuloDoDia(numeros.melhor.data)}, `
    + `com ${numeroPt(numeros.melhor.contagem)} contribuições.`);
  // O substituto acessível da grade: o total de cada mês.
  document.getElementById('ano-meses').replaceChildren(...numeros.meses.map(([mes, soma]) => {
    const item = document.createElement('li');
    item.textContent = `${rotuloDoMes(`${mes}-01`)}: ${numeroPt(soma)}`;
    return item;
  }));
}

// O maior pixel inteiro que cabe (1 ou 2 registros): recalculado no resize e na troca de densidade.
function dispor() {
  const k = placa.dpr;
  const { pixel, registros } = disposicao(placa.semanas, document.documentElement.clientWidth, innerHeight, innerWidth);
  if (!placa.dispor(pixel, dpr(), registros)) return;
  secao.style.setProperty('--placa-largura', `${placa.largura}px`);
  if (k && placa.dpr !== k) remontarEquipe();
  esconderDica();
  placa.pintar();   // o canvas redimensionado nasce em branco: desenha já, visível ou não
  sujo = false;
}

// Arrastar a janela para outra tela muda a densidade sem resize.
function vigiarDensidade() {
  matchMedia(`(resolution: ${devicePixelRatio}dppx)`).addEventListener('change', () => {
    dispor();
    acordar();
    vigiarDensidade();
  }, { once: true });
}

// --gravado revela o total da esquerda para a direita pela fração de dias gravados (não de contribuições).
function escreverCorte(valor) {
  if (Math.abs(valor - corte) < 0.001 && !(valor === 1 && corte !== 1)) return;
  corte = valor;
  numero.style.setProperty('--gravado', valor.toFixed(4));
}

// ---------- a gravação ----------

function comecar() {
  iniciada = true;
  if (reduzido()) { finalizar(false); return; }
  papel = { fase: 'esperar', t: 0 };
  acordar();
}

function quadro(dt) {
  if (!placa) return false;
  // Movimento reduzido ligado no meio: lido a cada quadro, porque o evento de mudança do núcleo (aoMudar) se perdeu
  // nos testes no Chrome; e só há o que interromper enquanto este laço está acordado.
  if (reduzido() && iniciada && (papel || equipe.length || !feito)) { pararGravacao(); return false; }
  // A gravação começa com a placa parada à vista por um instante. Um link para o contato desliza pela página inteira
  // e deixa a placa 85% visível por uns 70 ms: sem esta espera, a cena toda aconteceria fora da tela.
  if (!iniciada) {
    tempoAVista = aVista ? tempoAVista + dt : 0;
    if (tempoAVista >= PERMANENCIA) comecar();
  }
  relogio += dt;
  const { golpeados } = placa.estado;

  if (pendentes.length) pendentes = pendentes.filter(p => (p.em <= relogio ? (acender(p.indice), false) : true));

  // O lampejo é discreto (pixel art): só redesenha quando um dia desce do salto ou apaga o brilho.
  for (const [i, t] of golpeados) {
    const resto = t - dt;
    if (resto <= 0) { golpeados.delete(i); sujo = true; } else golpeados.set(i, resto);
    if (t > SALTO && resto <= SALTO) sujo = true;
  }

  if (placa.estado.faiscas.length) {
    for (const f of placa.estado.faiscas) {
      f.idade += dt;
      f.vy += 120 * dt;
      f.x += f.vx * dt;
      f.y += f.vy * dt;
    }
    placa.estado.faiscas = placa.estado.faiscas.filter(f => f.idade < VIDA_FAISCA);
    sujo = true;
  }

  if (papel?.fase === 'esperar') {
    if (livre()) chamarMascote();
    else if ((papel.t += dt) > (mascote.ativo && !mascote.pronto ? ESPERA_ESTACIONANDO : ESPERA)) {
      papel = null;
      iniciarEquipe();
    }
  } else if (papel?.fase === 'ir' && (!poleiro() || (mascote.trabalhoAtual && mascote.trabalhoAtual !== 'placa'))) {
    // Uma caixa pedida tomou o mascote, ou o poleiro saiu do alcance antes de ele chegar: a equipe vai sozinha.
    soltarPlaca();
  }

  for (const a of equipe) animarAprendiz(a, dt);
  equipe = equipe.filter(a => a.fase !== 'foi');

  if (!feito && contagem >= placa.celulas.length) finalizar(true);
  if (sujo && visivel) { placa.pintar(); sujo = false; }
  return ocupado();
}

const ocupado = () => !!papel || equipe.length > 0 || pendentes.length > 0 || placa.estado.faiscas.length > 0
  || placa.estado.golpeados.size > 0 || (sujo && visivel) || (!iniciada && aVista);

function acender(indice) {
  if (!gravados[indice]) { gravados[indice] = 1; contagem++; }
  placa.estado.golpeados.set(indice, LAMPEJO);
  sujo = true;
  escreverCorte(contagem / placa.celulas.length);
}

function finalizar(comFalas) {
  if (feito) return;
  feito = true;
  gravados.fill(1);
  contagem = placa.celulas.length;
  pendentes = [];
  placa.definir({ gravados: null });
  escreverCorte(1);
  if (papel?.fase === 'poleiro') {
    papel.fase = 'admirar';
    papel.t = 0;
    if (comFalas) {
      virar(-1);
      falar(FALAS.fim(numeroPt(dados.total), dados.year, numeroPt(numeros.ativos)));
    }
  }
  emitir('placa-gravada');
  placa.pintar();   // garante o desenho final, inclusive parado
  sujo = false;
  acordar();
}

// Movimento reduzido ligado no meio: termina na hora, sem equipe e sem falas.
function pararGravacao() {
  if (papel) soltarPlaca();
  for (const a of equipe) a.tela.remove();
  equipe = [];
  placa.estado.faiscas = [];
  placa.estado.golpeados.clear();
  finalizar(false);
}

// ---------- a equipe de aprendizes ----------

function iniciarEquipe() {
  if (comEquipe || feito || reduzido()) return;
  comEquipe = true;
  trechos(linhas.length).forEach(({ de, ate }, n) => equipe.push(criarAprendiz(de, ate, n)));
  acordar();
}

function criarAprendiz(de, ate, n) {
  const tela = document.createElement('canvas');
  tela.className = 'aprendiz pixel';
  tela.setAttribute('aria-hidden', 'true');
  palco.append(tela);
  // Sempre virados para a direita (golpeiam o pino à direita do corpo), com contorno para destacar sobre o bronze.
  const ator = montarAtor(tela, { pixel: PIXEL_APRENDIZ, reduzido: false })
    .definir({ dir: 1, asas: 'rapidas', contorno: CONTORNO, sombra: false });
  return { tela, ator, n, semana: de, ate, fase: 'espera', atraso: n * ENTRADA.atraso, voo: null, pos: { x: 0, y: 0 } };
}

// Na troca de densidade, cada aprendiz é remontado no mesmo canvas e continua de onde estava.
function remontarEquipe() {
  for (const a of equipe) {
    const estado = { ...a.ator.estado };
    a.ator = montarAtor(a.tela, { pixel: PIXEL_APRENDIZ, reduzido: false }).definir(estado);
  }
}

// A ponta do cinzel encosta 1 px para dentro da borda esquerda do pino, na altura do meio dele; o corpo fica sobre as
// colunas já gravadas.
function pontoDoGolpe(a) {
  const [lo, hi] = linhas[a.semana];
  const linha = linhaDoGolpe(a.semana, a.n, lo, hi);
  const p = pino(placa.L, a.semana, linha);
  return { x: p.x * placa.pixel + PIXEL_APRENDIZ * 0.5, y: (p.y + PINO / 2) * placa.pixel, linha };
}

function animarAprendiz(a, dt) {
  a.ator.avancar(dt * RITMO_APRENDIZ);   // o impacto (golpeDaEquipe) dispara daqui de dentro
  if (a.fase === 'foi') return;
  if (a.fase === 'espera') {
    if ((a.atraso -= dt) > 0) return;
    const alvo = pontoDoGolpe(a);
    a.fase = 'entra';
    a.tela.classList.add('dentro');
    a.voo = { de: { x: alvo.x + ENTRADA.dx, y: ENTRADA.y }, t: 0, duracao: ENTRADA.duracao, arco: ENTRADA.arco };
  }
  if (a.voo) {
    const v = a.voo;
    v.t += dt;
    const u = Math.min(1, v.t / v.duracao), s = suave(u);
    // O destino segue a placa a cada quadro (um resize no meio só redireciona); o da saída é fixo.
    const para = v.para ?? pontoDoGolpe(a);
    // O arco usa o tempo linear, não a curva: sobe e desce simétrico.
    a.pos = { x: v.de.x + (para.x - v.de.x) * s, y: v.de.y + (para.y - v.de.y) * s - Math.sin(Math.PI * u) * v.arco };
    a.ator.definir({ asas: 'rapidas' });
    if (u >= 1) {
      a.voo = null;
      if (a.fase === 'sai') { a.fase = 'foi'; a.tela.remove(); return; }
      a.fase = 'trabalho';
    }
  }
  if (a.fase === 'trabalho' && !a.voo) {
    a.pos = pontoDoGolpe(a);
    a.ator.definir({ asas: 'batendo' });
    // O próximo golpe espera o pulo terminar e o maço voltar.
    if (!a.ator.golpeando) a.ator.golpear(() => golpeDaEquipe(a));
  }
  const t = a.ator.ponta(), k = Math.min(3, Math.max(1, dpr()));
  a.tela.style.transform = `translate(${Math.round((a.pos.x - t.x) * k) / k}px, ${Math.round((a.pos.y - t.y) * k) / k}px)`;
  if (visivel) a.ator.pintar();
}

// No impacto: a semana inteira acende em cascata a partir do dia golpeado, saem faíscas, e o aprendiz pula para a
// semana seguinte (ou vai embora).
function golpeDaEquipe(a) {
  if (a.fase !== 'trabalho') return;
  const ponto = pontoDoGolpe(a);
  for (const c of porSemana[a.semana]) pendentes.push({ indice: c.indice, em: relogio + Math.abs(c.linha - ponto.linha) * CASCATA });
  const P = placa.pixel;
  for (let i = 0; i < 5; i++) {
    placa.estado.faiscas.push({
      x: ponto.x / P + 0.5, y: ponto.y / P - 0.5,
      vx: 10 + Math.random() * 34, vy: -16 - Math.random() * 30, idade: Math.random() * 0.08,
    });
  }
  sujo = true;
  a.semana++;
  if (a.semana < a.ate) {
    const para = pontoDoGolpe(a);
    const distancia = Math.hypot(para.x - a.pos.x, para.y - a.pos.y);
    a.voo = {
      de: { ...a.pos }, t: 0,
      duracao: Math.max(PULO.minimo, distancia / PULO.velocidade),
      arco: distancia > PULO.longe ? PULO.arcoLongo : PULO.arcoCurto,
    };
  } else {
    a.fase = 'sai';
    a.tela.classList.remove('dentro');
    a.voo = { de: { ...a.pos }, para: { x: a.pos.x + SAIDA.dx, y: SAIDA.y }, t: 0, duracao: SAIDA.duracao, arco: 0 };
  }
}

// ---------- o mascote no poleiro (trabalho 'placa', prioridade 40) ----------

// livre: o poleiro pode passar das bordas da janela. contorno: o mascote ganha o anel escuro só quando chega (no voo de
// ida, não), para não sumir sobre o bronze.
function chamarMascote() {
  const t = {
    nome: 'placa', prioridade: 40, livre: true, contorno: CONTORNO,
    alvo: poleiro,
    chegou: sentarNaPlaca,
    quadro: noPoleiro,
    perdeu: () => { if (papel?.trabalho === t) soltarPlaca(); },
  };
  papel = { fase: 'ir', t: 0, trabalho: t, registro: null };
  papel.registro = trabalho(t);
}

// Os pés a 82% da largura e o assento na borda de cima: as canelas ficam penduradas na frente da placa. Recalculado a
// cada quadro, então ele acompanha a rolagem sem voar.
function poleiro() {
  if (!mascote.ator) return null;
  const r = canvas.getBoundingClientRect();
  const p = sentarEm(r.left + POLEIRO * placa.largura, r.top);
  return p.y < ALCANCE.topo || p.y > innerHeight - ALCANCE.base ? null : p;
}

function sentarNaPlaca() {
  if (!papel) return;
  papel.fase = 'poleiro';
  papel.t = 0;
  mascote.ator?.definir({ sentado: true, asas: 'fechadas' });
  virar(-1);
  falar(FALAS.equipe);
  iniciarEquipe();
}

function noPoleiro(dt) {
  if (!papel || !mascote.ator) return;
  mascote.ator.definir({ sentado: true, asas: 'fechadas' });
  papel.t += dt;
  if (papel.fase === 'poleiro') virar(Math.floor(papel.t / OLHAR) % 2 ? 1 : -1);
  else if (papel.fase === 'admirar' && papel.t >= ADMIRAR) levantar();
}

function levantar() {
  const { registro } = papel;
  papel = null;
  mascote.ator?.definir({ sentado: false, asas: 'lentas' }).pular();
  registro.soltar();
}

// O mascote larga a placa (poleiro fora de alcance, caixa pedida, movimento reduzido): a equipe termina sem ele.
function soltarPlaca() {
  const { registro } = papel;
  papel = null;
  registro?.soltar();
  iniciarEquipe();
}

// ---------- a dica sobre o dia ----------

function itemSob(e) {
  if (!placa?.L) return null;
  const r = canvas.getBoundingClientRect();
  const x = e.clientX - r.left, y = e.clientY - r.top;
  return placa.diaEm(x, y) ?? placa.encaixeEm(x, y);
}

function apontar(e) {
  const item = itemSob(e);
  const convite = !!item && conviteAberto() && item.indice === hoje.indice;
  canvas.classList.toggle('convite', convite);
  // Só os dias já gravados respondem; encaixes e dias ainda foscos, não (a não ser o convite de hoje).
  const dia = !convite && item && item.indice < placa.celulas.length && (feito || gravados[item.indice]) ? item : null;
  const alvo = convite || dia ? item.indice : null;
  if (alvo === dicaEm) return;
  if (alvo === null) { esconderDica(); return; }
  dicaEm = alvo;
  placa.definir({ realce: alvo });
  sujo = true;
  acordar();
  const texto = convite
    ? `hoje · ${e.pointerType === 'touch' ? 'toque' : 'clique'} e dê o seu golpe`
    : `${rotuloDoDia(dia.data)} · ${dia.contagem ? `${numeroPt(dia.contagem)} ${dia.contagem === 1 ? 'contribuição' : 'contribuições'}` : 'nenhuma contribuição'}`;
  mostrarDica(texto, item);
}

// Centrada no pino, com a base 10 px acima do anel (o CSS sobe a dica inteira) e presa às bordas da placa; o rabicho
// continua apontando para o pino. A largura só é certa depois de pôr o texto e mostrar.
function mostrarDica(texto, item) {
  dica.textContent = texto;
  dica.hidden = false;
  const meia = dica.offsetWidth / 2;
  const a = placa.centro(item.semana, item.linha);
  const x = Math.min(placa.largura - meia, Math.max(meia, a.x));
  dica.style.left = `${Math.round(x)}px`;
  dica.style.top = `${Math.round(a.y - 3 * placa.pixel)}px`;
  dica.style.setProperty('--rabicho', `${Math.round(a.x - x + meia)}px`);
}

function esconderDica() {
  if (!dica || dicaEm === null) return;
  dicaEm = null;
  dica.hidden = true;
  canvas.classList.remove('convite');
  placa.definir({ realce: null });
  sujo = true;
  acordar();
}

// ---------- o golpe do dia ----------

// Hoje pela data local de quem visita, contra as datas da placa à meia-noite UTC. Vale um golpe por dia, guardado só
// para o dia: amanhã o pino de amanhã espera de novo.
function prepararGolpeDoDia() {
  const agora = new Date();
  const dois = n => String(n).padStart(2, '0');
  const data = `${agora.getFullYear()}-${dois(agora.getMonth() + 1)}-${dois(agora.getDate())}`;
  const indice = indiceDoDia(dados.days[0][0], data);
  if (!(indice >= 0 && indice < placa.celulas.length + placa.encaixes.length)) return;
  hoje = { data, indice, feito: ler('golpe')?.dia === data };
  if (hoje.feito) placa.definir({ marcas: { [indice]: true } });
}

// O pino de hoje aceita o golpe depois de gravado (ou, se é um encaixe, com a placa pronta).
const conviteAberto = () => !!hoje && !hoje.feito && (feito || (hoje.indice < placa.celulas.length && gravados[hoje.indice] === 1));

const itemDeHoje = () => placa.celulas[hoje.indice] ?? placa.encaixes[hoje.indice - placa.celulas.length];

function darGolpeDoDia() {
  hoje.feito = true;
  esconderDica();
  let aplicado = false;
  const aplicar = () => {
    if (aplicado) return;
    aplicado = true;
    const { indice, data } = hoje;
    const { semana, linha } = itemDeHoje();
    const p = pino(placa.L, semana, linha);
    placa.definir({ marcas: { ...placa.estado.marcas, [indice]: true } });
    // Brilho e faíscas saem da coluna direita do pino, onde o cinzel do mascote encosta; parado, só a marca.
    if (!reduzido()) {
      placa.estado.golpeados.set(indice, GOLPE_DO_DIA.brilho);
      for (let i = 0; i < GOLPE_DO_DIA.faiscas; i++) {
        placa.estado.faiscas.push({ x: p.x + 3.5, y: p.y + 1.5, vx: (Math.random() * 2 - 1) * 25, vy: -20 - Math.random() * 30, idade: 0 });
      }
    }
    gravar('golpe', { dia: data });
    emitir('golpe-do-dia', { dia: data });
    sujo = true;
    acordar();
  };

  // O mascote voa até o pino e martela pela direita; ocupado (ou com movimento reduzido), o golpe entra sozinho.
  let bateu = false;
  const aceito = !reduzido() && recado({
    livre: true, contorno: CONTORNO,
    alvo() {
      const r = canvas.getBoundingClientRect();
      const { semana, linha } = itemDeHoje();
      const a = placa.centro(semana, linha);
      const p = { x: r.left + a.x + 2 * placa.pixel, y: r.top + a.y };
      return p.y < ALCANCE.topo || p.y > innerHeight - ALCANCE.base ? null : deOlharEsquerda(p);
    },
    quadro() {
      const ator = mascote.ator;
      if (!ator) return;
      virar(-1);
      ator.definir({ asas: 'batendo' });
      if (!bateu) { bateu = true; ator.golpear(aplicar); }
      else if (!ator.golpeando) { falar(FALAS.golpe, 2); fimDoRecado(); }
    },
    // Cancelado antes do impacto, o golpe entra do mesmo jeito.
    perdeu: aplicar,
  });
  if (!aceito) aplicar();
}
