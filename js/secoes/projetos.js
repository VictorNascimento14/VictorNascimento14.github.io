// Projetos: cinco caixas de bronze num anel, sob o pórtico. Cada caixa guarda um projeto. Aberta, a tampa voa, a boca
// acende e o cartão sobe de dentro dela (entre as duas camadas de pixel, recortado pela parede da frente); o mascote
// vem bater na emenda da tampa e depois paira ao lado do cartão contando o projeto.
// Especificação: spec 02 (anel, estados, cartão, vitrine, brilho, acessibilidade) e spec 08 §3.2 (pórtico).
import { projetos } from '../dados/perfil.js';
import { montar as montarBau, ALTURA, LARGURA, BORDA, CORPO, DESVIO, EMENDA, PE } from '../arte/bau.js';
import { modulo, diferenca, escalaDe, opacidadeDe, subidaDe } from '../arte/anel.js';
import { ponta as pontaDoAtor, QUADRO } from '../arte/escultor.js';
import { registrar, acordar } from '../nucleo/relogio.js';
import { suave, saidaCubica, limitar } from '../nucleo/pixel.js';
import { reduzido, aoMudar } from '../nucleo/movimento.js';
import { emitir } from '../nucleo/sinais.js';
import { mascote, trabalho, falar, calar, virar, deOlharEsquerda, tamanhoDaTela } from '../mascote.js';

// Os números que o mascote diz e o cartão também mostra moram em js/dados/perfil.js: um lugar só para os dois.
const numeroDe = (id, campo) => projetos.find(p => p.id === id)?.[campo]?.toLocaleString('pt-BR') ?? '';

// O que o mascote conta de cada projeto com o cartão aberto, uma fala depois da outra.
const FALAS = {
  processual: [
    `Esse aqui é o Processual. O Victor abriu ${numeroDe('processual', 'prs')} PRs nele desde julho, e eu contei um por um.`,
    'A IA daqui não inventa jurisprudência: citação sem fonte vai para as notas, não para a peça.',
    'E se alguém reclamar de lentidão, ele mede primeiro. Sempre.',
  ],
  chat: [
    'Psiu, aqui dentro o WhatsApp não para de tocar.',
    'O Victor ensinou os agentes a atender, agendar e mandar contrato. E a não pensar em voz alta na frente do cliente.',
  ],
  viral: [
    'Esse o Victor começou numa quinta e pôs no ar na sexta.',
    `Foram ${numeroDe('viral', 'prs')} PRs em ${numeroDe('viral', 'dias')} dias. Eu cansei só de contar.`,
    'E esse tem porta aberta: {{viral.trynux.com|https://viral.trynux.com}}.',
  ],
  decalque: [
    'Aponta para qualquer site que eu te devolvo as cores, as fontes e até as animações.',
    `O Victor publicou isso em ${numeroDe('decalque', 'prs')} PRs num dia só. O {{código está aberto|https://github.com/VictorNascimento14/Decalque}}: pode olhar à vontade.`,
  ],
  lab: [
    'Aqui é o quartel-general do escritório: o lead entra, o closer atende e o fechamento aparece na TV com festa.',
    'O Victor cuidou até da cobrança. Pix também conta.',
  ],
};
const FALA_PEDIDO = 'Deixa comigo!';
const FALA_VITRINE = `Ele tem ${projetos.length} projetos aqui. Começamos por esse!`;
const FALA_DEPOIS_DA_VITRINE = `Ainda tem ${projetos.length - 1} caixas, ok!? É só clicar nas próximas!`;
const FALA_PASSANDO = 'Vou abrir essa, ok?';
// Na tela estreita o mascote fica ao lado da caixa, com o balão entre ele e o pé do cartão: o espaço é o do balão mais
// alto dessas falas (4 linhas de 12 px × 1,4 mais o respiro). ponytail: fixo; uma fala de 5 linhas voltaria a cobrir
// o rodapé do cartão (aí, medir as falas do cartão num clone do balão).
const ALTURA_DO_BALAO = 82;

// Prioridades no mascote (docs/arquitetura.md §5): o pedido do visitante passa na frente de tudo; a vitrine espera as
// outras seções; a visita de passagem (ponteiro ou foco na caixa) não tira ninguém de um recado.
const PEDIDO = 50, VITRINE = 15, PASSANDO = 5;

const n = projetos.length;

const secao = document.getElementById('projetos');
const titulo = document.getElementById('projetos-titulo');
const anelEl = document.getElementById('anel');
const palco = document.getElementById('anel-palco');
const legendaNumeral = document.querySelector('#anel-legenda .anel-numeral');
const legendaNome = document.querySelector('#anel-legenda .anel-nome');
const cornija = document.querySelector('.portico .cornija');
const anuncio = document.getElementById('anuncio');

let caixas = [];
let visita = null;      // o trabalho do mascote nesta seção: { c, prioridade, golpe, comentou, parado, voltarEm, registro }
let arrastou = false;   // engole o clique que vem junto com o fim de um arrasto
let rolagemDoPedido = 0;   // scrollY no último pedido do visitante: se ele rolou depois, a página não volta ao cartão

const anel = {
  pos: -n,              // ângulo do anel em caixas (pos = i ⇒ a caixa i na frente); −n faz a volta de entrada
  giro: null,           // { de, para, t, dur, saida? }
  arrasto: null,        // { id, x0, y0, pos0, moveu }
  fila: null,           // { i, abrir, porTeclado }
  atual: -1,            // a caixa da frente (legenda, Tab, brilho)
  vitrine: { espera: 0 },
  visivel: false, visto: false, entrou: false,
  escuro: 0,            // 0→1 quando alguma caixa não está fechada (as fechadas escurecem)
  folgaAcima: 0, folgaAbaixo: 0, assentaEm: 0,
  relogio: 0, reflexoT: 2.5, girado: 0,
  P: 0, ladoP: 0, fundoP: 0, largura: 0, altura: 0, Rx: 0, k: 1,
  posicionar: true, trava: null,
};

const arred = v => Math.round(v * anel.k) / anel.k;      // em px de dispositivo
const tempoDeLeitura = texto => Math.min(6, Math.max(2.2, 1 + texto.length / 14));

// Pixel da caixa da frente: 5 em tela larga e alta, 4 em tela larga e baixa ou média, 3 no celular.
function pixelDaTela() {
  if (innerWidth > 1050) return innerHeight >= 760 ? 5 : 4;
  return innerWidth > 760 ? 4 : 3;
}

// ---------- o anel ----------

function medirLayout() {
  const P = pixelDaTela();
  anel.P = P;
  anel.ladoP = Math.max(2, Math.round(0.6 * P));
  anel.fundoP = Math.min(anel.ladoP - 1, Math.max(1, Math.round(0.4 * P)));
  anel.k = Math.min(3, Math.max(1, window.devicePixelRatio || 1));
  anel.largura = palco.clientWidth;
  anel.Rx = Math.min(0.37 * anel.largura, 380);
  anel.altura = (ALTURA + 2) * P;
  palco.style.setProperty('--palco-h', `${anel.altura}px`);
  anelEl.style.setProperty('--cartao-l', `${Math.min(640, anel.largura)}px`);
  posicionar();
  const aberta = caixas.find(c => c.estado === 'aberta');
  if (aberta) { colocarCartao(aberta, false); abrirEspaco(aberta); }
  acordar();
}

// Cada caixa no seu lugar do anel, redesenhada no seu próprio P (nunca escalada por CSS): só translate arredondado.
function posicionar() {
  anel.posicionar = false;
  const { largura, altura, Rx, P, k } = anel;
  for (const c of caixas) {
    let a = modulo((c.vaga ?? c.i) - anel.pos, n);
    if (a > n / 2) a -= n;
    const th = a * 2 * Math.PI / n;
    const prof = Math.cos(th) + (c.faixa || 0);
    const escala = escalaDe(prof, anel.ladoP / P, anel.fundoP / P);
    let Pc = P * escala;
    if (Math.abs(Pc - Math.round(Pc)) < 1e-6) Pc = Math.round(Pc);
    if (c.bau.dimensionar(Pc, k)) {
      const o = c.bau.em(0, 0), s = c.tranca.style;
      s.left = `${o.x}px`; s.top = `${o.y}px`; s.width = `${LARGURA * Pc}px`; s.height = `${ALTURA * Pc}px`;
      c.suja = true;
    }
    const pe = c.bau.em(PE.x, PE.y);
    const subida = subidaDe(prof) * altura;
    c.x = arred(largura / 2 + Math.sin(th) * Rx - pe.x);
    c.y = arred(altura - subida - pe.y);
    c.el.style.transform = `translate(${c.x}px, ${c.y}px)`;
    c.el.style.zIndex = String(Math.round(10 * prof) + 11);
    const op = opacidadeDe(prof) * (c.estado === 'fechada' ? 1 - 0.7 * anel.escuro : 1);
    c.el.style.opacity = op.toFixed(3);
  }
}

function legendar(numeral, nome) {
  if (legendaNumeral) legendaNumeral.textContent = numeral;
  if (legendaNome) legendaNome.textContent = nome;
}

function definirFrente(i) {
  i = modulo(Math.round(i), n);
  if (i === anel.atual) return;
  anel.atual = i;
  anel.reflexoT = 1.2;   // o próximo brilho vem 3,4 s depois
  for (const c of caixas) c.tranca.tabIndex = c.i === i ? 0 : -1;
  if (!anel.trava) legendar(`CAIXA ${caixas[i].numeral}`, caixas[i].nome);
}

function girarPara(i) {
  const d = diferenca(anel.pos, i);
  if (Math.abs(d) < 1e-6) return false;
  definirFrente(i);   // a legenda muda já no começo do giro
  if (reduzido()) {
    anel.girado += Math.abs(d);
    anel.pos += d;
    assentarGiro(false);
    return false;
  }
  anel.giro = { de: anel.pos, para: anel.pos + d, t: 0, dur: 0.55 + 0.3 * Math.abs(d) };
  acordar();
  return true;
}

function assentarGiro(seguirFila = true) {
  anel.pos = modulo(Math.round(anel.pos), n);
  definirFrente(anel.pos);
  anel.posicionar = true;
  if (anel.girado > 0.001) emitir('anel-girou', { posicoes: Math.round(anel.girado * 1000) / 1000 });
  anel.girado = 0;
  if (seguirFila) andarFila();
}

// Pedido do visitante (ou do jogo): fecha a aberta, gira pelo caminho mais curto e, se for o caso, abre.
function pedir(i, abrir, porTeclado = false) {
  anel.vitrine = null;
  anel.fila = { i: modulo(i, n), abrir, porTeclado };
  rolagemDoPedido = scrollY;
  andarFila();
  acordar();
}

function andarFila() {
  const f = anel.fila;
  if (!f || anel.giro || anel.arrasto) return;
  const aberta = caixas.find(c => c.estado !== 'fechada');
  if (aberta) {
    if (aberta.i === f.i && f.abrir) anel.fila = null;
    else fechar(aberta, andarFila);
    return;
  }
  if (girarPara(f.i)) return;
  anel.fila = null;
  if (f.abrir) comecarAbrir(caixas[f.i], f.porTeclado, false);
}

// Um passo (← traz a da esquerda, → a da direita). Cliques rápidos se somam: a base é o alvo que já está na fila.
function girar(dir) {
  if (anel.trava) return;
  const base = anel.fila ? anel.fila.i : anel.atual;
  const alvo = modulo(base + dir, n);
  const focoNaTranca = caixas.some(c => c.tranca === document.activeElement);
  pedir(alvo, false);
  if (focoNaTranca) caixas[alvo].tranca.focus({ preventScroll: true });
}

// ---------- cada caixa ----------

function medirCartao(c) {
  const r = c.revelacao, escondida = r.hidden;
  if (escondida) { r.style.visibility = 'hidden'; r.hidden = false; }
  c.alturaBase = c.cartao.offsetHeight;
  if (escondida) { r.hidden = true; r.style.visibility = ''; }
}

// O fundo do cartão fica 2 px de sprite acima da borda de trás da boca. Com recorte (subindo ou afundando), a caixa
// do cartão vai só até a borda da frente: o que passa dali some, como se estivesse atrás da parede da caixa.
function colocarCartao(c, recorte) {
  const { bau, revelacao, cartao } = c;
  const base = bau.em(0, BORDA - DESVIO.y - 2).y;
  const borda = bau.em(0, BORDA).y;
  const meio = bau.em(PE.x, 0).x;
  const L = revelacao.offsetWidth;
  if (!cartao.querySelector('details[open]')) c.alturaBase = cartao.offsetHeight;
  const escala = Math.min(1, 28 * bau.pixel / L);   // 28 px de sprite: a largura que cabe na boca
  const s = revelacao.style;
  s.left = `${Math.round(meio - L / 2)}px`;
  s.top = `${Math.round(base - c.alturaBase)}px`;   // o topo fica parado; a história aberta cresce para baixo
  s.height = recorte ? `${Math.round(borda - base + c.alturaBase)}px` : '';
  s.setProperty('--subida-s', escala.toFixed(3));
  s.setProperty('--subida-y', `${Math.ceil(borda - base + c.alturaBase * escala) + 2}px`);
}

// Abre espaço para o cartão: desce o anel até o topo do cartão ficar 14 px abaixo da cornija e cresce o palco
// embaixo se ele passa do chão. A seção centraliza o conteúdo, então 1 px de margem não anda 1 px: mede-se.
function abrirEspaco(c) {
  let acima = 0, abaixo = 0, sobreTitulo = false;
  if (c) {
    const base = c.bau.em(0, BORDA - DESVIO.y - 2).y;
    const topo = c.y + base - c.alturaBase;
    const alt = c.estado === 'aberta' ? c.cartao.offsetHeight : c.alturaBase;
    abaixo = Math.max(0, Math.ceil(topo + alt - anel.altura + 12));
    const limite = secao.getBoundingClientRect().top + (cornija?.offsetHeight ?? 0) + 14;
    const antes = [palco.style.getPropertyValue('--folga-acima'), palco.style.getPropertyValue('--folga-abaixo')];
    palco.style.transition = 'none';
    const topoNaJanela = r => {
      palco.style.setProperty('--folga-acima', `${r}px`);
      palco.style.setProperty('--folga-abaixo', `${abaixo}px`);
      return palco.getBoundingClientRect().top + topo;
    };
    // A resposta tem duas inclinações (½ enquanto o conteúdo cabe na altura mínima, 1 depois): passos de Newton com a
    // inclinação medida ali, corrigindo para os dois lados, param no limite em vez de passar dele.
    let y = topoNaJanela(0);
    for (let k = 0; k < 6 && (y < limite - 0.5 || (acima > 0 && y > limite + 0.5)); k++) {
      const fator = Math.max(0.2, (topoNaJanela(acima + 10) - topoNaJanela(acima)) / 10);
      acima = Math.max(0, Math.ceil(acima + (limite - y) / fator));
      y = topoNaJanela(acima);
    }
    sobreTitulo = y < titulo.getBoundingClientRect().bottom;
    palco.style.setProperty('--folga-acima', antes[0]);
    palco.style.setProperty('--folga-abaixo', antes[1]);
    void palco.offsetHeight;
    palco.style.transition = '';
  }
  if (acima !== anel.folgaAcima) {
    anel.folgaAcima = acima;
    anel.assentaEm = anel.relogio + (reduzido() ? 0 : 0.5);   // o mascote só bate depois que o anel assenta
  }
  anel.folgaAbaixo = abaixo;
  palco.style.setProperty('--folga-acima', `${acima}px`);
  palco.style.setProperty('--folga-abaixo', `${abaixo}px`);
  secao.classList.toggle('cartao-sobre-titulo', sobreTitulo);
}

// Pedido de abrir. Com o mascote à mão, a caixa fica "chamada" até ele bater; sem ele, abre sozinha.
function comecarAbrir(c, porTeclado, auto) {
  if (c.estado !== 'fechada') return;
  c.porTeclado = porTeclado;
  c.auto = auto;
  medirCartao(c);
  c.tranca.setAttribute('aria-expanded', 'true');
  if (!reduzido() && mascoteDisponivel(auto) && pontoDoMascote(c)) {
    c.estado = 'chamada';
    c.t = 0;
    abrirEspaco(c);
    falar(auto ? FALA_VITRINE : FALA_PEDIDO, auto ? tempoDeLeitura(FALA_VITRINE) : 1.3);
    visitar(c, { prioridade: auto ? VITRINE : PEDIDO, golpe: true });
  } else {
    estourar(c);
  }
  acordar();
}

function impacto(c) {
  if (c.estado !== 'chamada') return;
  if (!reduzido()) {
    for (let k = 0; k < 8; k++) {
      c.faiscas.push({ x: 46 + Math.random() * 2, y: 14.5, vx: -16 + Math.random() * 24, vy: -12 - Math.random() * 18, vida: Math.random() * 0.1 });
    }
    c.tremidaT = 0.2;
  }
  if (visita?.c === c && visita.golpe) visita.golpe.deu = true;
  estourar(c);
}

// A caixa chamada que o mascote não alcançou. Se era a vitrine e o anel saiu de vista, ela volta a fechar e a
// vitrine tenta de novo quando o anel voltar; senão abre assim mesmo, com faíscas.
function abrirSemVer(c) {
  if (c.estado !== 'chamada') return;
  if (c.auto && !anel.visto) {
    c.estado = 'fechada';
    c.tranca.setAttribute('aria-expanded', 'false');
    if (visita?.c === c) { soltarVisita(); calar(); }
    abrirEspaco(null);
    anel.vitrine = { espera: 0 };
    return;
  }
  impacto(c);
}

// A tampa voa; aos 0,16 s o cartão aparece e sobe (0,9 s).
function estourar(c) {
  c.estado = 'abrindo';
  c.t = 0;
  c.suja = true;
  c.tranca.setAttribute('aria-expanded', 'true');
  emitir('caixa-aberta', { id: c.id, pelo: c.auto ? 'mascote' : 'visitante' });
  if (anuncio) anuncio.textContent = `Caixa ${c.numeral} aberta: ${c.nome}.`;
  abrirEspaco(c);
  if (reduzido()) { c.tampa = 1; c.brilho = 1; assentar(c); }
}

function mostrarCartao(c) {
  c.revelacao.hidden = false;
  c.mostrando = true;
  c.el.classList.add('abrindo');
  colocarCartao(c, true);
}

function assentar(c) {
  c.estado = 'aberta';
  c.t = 0;
  c.tampa = 1;
  c.brilho = 1;
  c.suja = true;
  c.revelacao.hidden = false;
  c.mostrando = true;
  c.el.classList.remove('abrindo', 'fechando');
  c.el.classList.add('assentada');
  colocarCartao(c, false);
  abrirEspaco(c);
  if (c.porTeclado) c.cartao.focus({ preventScroll: true });
  // Quem rolou depois de pedir (para a placa, com o dedo ou a barra) não é puxado de volta.
  if (!c.auto && Math.abs(scrollY - rolagemDoPedido) <= 2) mostrarNaJanela(c);
  if (mascote.ativo) visitar(c, { prioridade: c.auto ? VITRINE : PEDIDO });
}

// Rola só o necessário para o cartão caber (a vitrine nunca rola a página).
function mostrarNaJanela(c) {
  const r = c.cartao.getBoundingClientRect();
  if (r.top >= 0 && r.bottom <= innerHeight) return;
  c.cartao.scrollIntoView({ block: 'nearest', behavior: reduzido() ? 'auto' : 'smooth' });
}

function fechar(c, entao) {
  if (c.estado === 'fechada') { entao?.(); return; }
  if (c.estado === 'chamada') {
    // ainda esperando o golpe: fecha na hora, e o mascote desiste
    c.estado = 'fechada';
    c.tranca.setAttribute('aria-expanded', 'false');
    if (visita?.c === c) { visita.golpe = null; visita.comentou = 'fechada'; calar(); voltarDepois(visita); }
    abrirEspaco(null);
    entao?.();
    return;
  }
  // Um segundo fechar (clique na caixa que já afunda) não apaga o que o primeiro pediu para depois (o giro da fila).
  c.entao = entao ?? c.entao;
  if (c.estado === 'fechando') return;
  for (const d of c.cartao.querySelectorAll('details[open]')) d.open = false;
  if (c.revelacao.contains(document.activeElement)) c.tranca.focus({ preventScroll: true });
  c.tranca.setAttribute('aria-expanded', 'false');
  if (visita?.c === c) congelar(visita);
  if (reduzido()) { fechou(c); return; }
  c.estado = 'fechando';
  c.t = 0;
  c.tampa0 = c.tampa;
  c.brilho0 = c.brilho;
  c.suja = true;
  c.el.classList.remove('abrindo', 'assentada');
  c.el.classList.add('fechando');
  c.mostrando = true;
  colocarCartao(c, true);
  acordar();
}

function esconderCartao(c) {
  c.revelacao.hidden = true;
  c.mostrando = false;
}

function fechou(c) {
  c.estado = 'fechada';
  c.t = 0;
  c.tampa = 0;
  c.brilho = 0;
  c.suja = true;
  if (!reduzido()) c.tremidaT = 0.12;   // a tampa bate
  esconderCartao(c);
  c.el.classList.remove('abrindo', 'assentada', 'fechando');
  c.tranca.setAttribute('aria-expanded', 'false');
  abrirEspaco(null);
  if (visita?.c === c) { calar(); visita.comentou = 'fechada'; voltarDepois(visita); }
  const entao = c.entao;
  c.entao = null;
  entao?.();
}

function animarCaixa(c, dt) {
  const parado = reduzido();
  if (c.estado !== 'fechada' && !parado) {
    c.tempo += dt;
    if (c.brilho > 0.05) c.suja = true;   // raios e pontinhos andam
  }
  if (c.estado === 'chamada') {
    c.t += dt;
    if (c.t >= 3.2 || (visita?.c === c && visita.golpe && !visita.golpe.deu && !pontoDoMascote(c))) abrirSemVer(c);
  } else if (c.estado === 'abrindo') {
    c.t += dt;
    const u = Math.min(1, c.t / 0.5);
    c.tampa = 1 + 2.9 * (u - 1) ** 3 + 1.9 * (u - 1) ** 2;   // passa do ponto (1,12) e assenta
    c.brilho = Math.min(1, c.t / 0.35);
    c.suja = true;
    if (c.t >= 0.16 && !c.mostrando) mostrarCartao(c);
    if (c.t >= 1.06) assentar(c);
  } else if (c.estado === 'fechando') {
    c.t += dt;
    if (c.t >= 0.5 && c.mostrando) esconderCartao(c);
    const u = limitar((c.t - 0.44) / 0.28, 0, 1);
    c.tampa = c.tampa0 * (1 - u * u);                  // cai acelerando, como uma batida
    c.brilho = Math.max(0, c.brilho0 * (1 - 1.4 * u));
    c.suja = true;
    if (u >= 1) fechou(c);
  }
  if (c.faiscas.length) {
    for (const f of c.faiscas) { f.vida += dt; f.vy += 70 * dt; f.x += f.vx * dt; f.y += f.vy * dt; }
    c.faiscas = c.faiscas.filter(f => f.vida < 0.55);
    c.suja = true;
  }
  if (c.tremidaT > 0) { c.tremidaT = Math.max(0, c.tremidaT - dt); c.suja = true; }
  if (c.fundicaoT != null) {
    c.fundicaoT += dt;
    if (c.fundicaoT >= 0.55) c.fundicaoT = null;
    c.suja = true;
  }
}

function pintarCaixa(c) {
  c.suja = false;
  const tremida = c.tremidaT > 0 ? (Math.floor(30 * c.tremidaT) % 2 ? 1 : -1) : 0;
  const reflexo = c.fundicaoT != null ? Math.round(-6 + (c.fundicaoT / 0.55) * 86) : c.reflexo;
  c.bau.definir({ tampa: c.tampa, brilho: c.brilho, tempo: c.tempo, faiscas: c.faiscas, tremida, reflexo, metal: c.metal }).pintar();
}

// Um brilho diagonal atravessa a frente da caixa da frente fechada a cada 4,6 s (em 0,8 s).
function brilhoPeriodico(dt) {
  const frente = caixas[anel.atual];
  let g = null;
  if (frente && !reduzido() && anel.visivel && !anel.giro && !anel.arrasto && !anel.trava && frente.estado === 'fechada') {
    anel.reflexoT += dt;
    const fase = anel.reflexoT % 4.6;
    if (fase < 0.8) g = Math.round(-6 + (fase / 0.8) * 86);
  }
  for (const c of caixas) {
    const r = c === frente ? g : null;
    if (c.reflexo !== r) { c.reflexo = r; c.suja = true; }
  }
}

// A vitrine: na primeira vez que tudo fica quieto com o anel à vista, o mascote abre a caixa da frente sozinho.
function vitrine(dt) {
  const v = anel.vitrine;
  if (!v) return;
  const heroiPronto = mascote.pronto || !mascote.sprite;
  const pronto = anel.entrou && anel.visto && !anel.giro && !anel.arrasto && !anel.fila && !anel.trava && heroiPronto
    && caixas.every(c => c.estado === 'fechada') && !ocupadoEmOutraSecao();
  v.espera = pronto ? v.espera + dt : 0;
  if (v.espera >= 0.6) {
    anel.vitrine = null;
    comecarAbrir(caixas[anel.atual], false, true);
  }
}

// ---------- o mascote nesta seção ----------

function ocupadoEmOutraSecao() {
  const t = mascote.trabalhoAtual;
  return !!t && t !== 'caixa' && t !== 'recado';
}

function mascoteDisponivel(auto) {
  if (!mascote.ativo || !mascote.pronto || !mascote.ator || reduzido()) return false;
  return !auto || !ocupadoEmOutraSecao();
}

// Ponta do cinzel olhando à esquerda, em px CSS a partir do canto do canvas do mascote.
function pontaEsquerda(ator) {
  const p = pontaDoAtor(-1);
  return { x: (p.x - QUADRO.x0) * ator.pixel, y: (p.y - QUADRO.y0) * ator.pixel };
}

// Onde o mascote fica para uma caixa (px da janela, ponta do cinzel na direção atual), ou null fora de alcance.
// Fechada: a ponta na emenda da tampa, ele à direita da caixa olhando para ela. Aberta: ao lado do cartão, à direita;
// sem espaço (tela estreita), ao lado da caixa, baixo o bastante para o balão caber entre ele e o pé do cartão.
function pontoDoMascote(c) {
  const ator = mascote.ator;
  if (!ator) return null;
  const { largura, altura } = tamanhoDaTela();
  const r = palco.getBoundingClientRect();
  const ox = r.left + c.x, oy = r.top + c.y;
  if (c.estado !== 'aberta' && c.estado !== 'fechando') {
    const e = c.bau.em(EMENDA.x, EMENDA.y);
    const p = { x: ox + e.x, y: oy + e.y };
    return p.y < 60 || p.y > altura - 40 ? null : deOlharEsquerda(p);
  }
  const rr = c.revelacao.getBoundingClientRect();
  const topo = rr.top, base = rr.top + c.cartao.offsetHeight;
  if (base < 80 || topo > altura - 80) return null;
  const t = pontaEsquerda(ator);
  const x = rr.right + 10;
  if (x - t.x + ator.largura <= largura - 8) return deOlharEsquerda({ x, y: topo + 8 + t.y });
  // O balão fica 8 px acima do sprite: o topo dele, 6 px abaixo do pé do cartão.
  const e = c.bau.em(EMENDA.x, BORDA + 0.55 * CORPO);
  return deOlharEsquerda({ x: ox + e.x, y: Math.max(oy + e.y, base + 6 + ALTURA_DO_BALAO + 8 + t.y) });
}

function visitar(c, { prioridade, golpe = false, repetir = false }) {
  if (!mascote.ativo) return;
  if (visita && visita.c !== c) soltarVisita();
  if (!visita) {
    const v = { c, prioridade, golpe: null, comentou: null, parado: null, voltarEm: null };
    v.registro = trabalho({
      nome: 'caixa',
      get prioridade() { return v.prioridade; },
      // trocar a meta faz ele voar de novo: da emenda para o lado do cartão, e de lá para onde ele espera ao sair
      get meta() { return v.parado ? 'saindo' : c.estado === 'aberta' || c.estado === 'fechando' ? 'cartao' : 'emenda'; },
      alvo: () => (visita !== v ? null : v.parado ? deOlharEsquerda(v.parado) : pontoDoMascote(c)),
      quadro: () => quadroDaVisita(v),
      perdeu: () => perdeuVisita(v),
    });
    visita = v;
  }
  visita.prioridade = prioridade;
  visita.parado = null;
  visita.voltarEm = null;
  if (golpe) visita.golpe = { deu: false };
  if (repetir && !mascote.falando && visita.comentou === 'fechada') visita.comentou = null;
  acordar();
}

function quadroDaVisita(v) {
  const ator = mascote.ator;
  if (!ator || visita !== v) return;
  virar(-1);
  const c = v.c;
  if (v.golpe) {
    if (!v.golpe.deu) {
      ator.definir({ asas: 'batendo' });
      // só bate com o anel parado e assentado (senão bateria no ar enquanto o anel desce)
      if (c.estado === 'chamada' && anel.relogio >= anel.assentaEm && !anel.giro && !ator.golpeando) {
        v.golpe.deu = true;
        ator.golpear(() => impacto(c));
      }
      return;
    }
    if (ator.golpeando) return;
    if (c.estado === 'chamada') impacto(c);   // o ator foi refeito no meio do golpe: o impacto vale assim mesmo
    v.golpe = null;
  }
  ator.definir({ asas: c.estado === 'aberta' && !v.parado ? 'lentas' : 'batendo' });
  if (!v.parado) comentar(v);
}

// Cada fala uma vez por (cartão, estado).
function comentar(v) {
  const c = v.c;
  const chave = c.estado === 'aberta' ? 'aberta' : c.estado === 'fechada' ? 'fechada' : null;
  if (!chave || v.comentou === chave) return;
  v.comentou = chave;
  if (chave === 'fechada') { falar(FALA_PASSANDO, 2.2); return; }
  const falas = FALAS[c.id] ?? [];
  falar(c.auto ? [...falas, FALA_DEPOIS_DA_VITRINE] : falas);
}

// Ele fica onde está (para não seguir o cartão que afunda) e, depois, volta ao canto.
function congelar(v) {
  if (v.parado || !mascote.ator) return;
  const p = mascote.ponto;
  const q = deOlharEsquerda(p);
  v.parado = { x: 2 * p.x - q.x, y: p.y };   // o mesmo corpo, com a ponta pensada olhando à esquerda
}

function voltarDepois(v) {
  congelar(v);
  v.voltarEm = 0.55;
  acordar();
}

function perdeuVisita(v) {
  if (visita !== v) return;
  visita = null;
  v.registro.soltar();
  if (v.golpe && !v.golpe.deu && v.c.estado === 'chamada') abrirSemVer(v.c);
}

function soltarVisita() {
  const v = visita;
  if (!v) return;
  visita = null;
  v.registro.soltar();
}

// ---------- o laço ----------

function quadro(dt) {
  if (!caixas.length) return false;
  anel.relogio += dt;
  vitrine(dt);

  if (anel.giro) {
    const g = anel.giro;
    g.t += dt;
    const u = Math.min(1, g.t / g.dur);
    const pos = g.de + (g.para - g.de) * (g.saida ? saidaCubica(u) : suave(u));
    if (!g.saida) anel.girado += Math.abs(pos - anel.pos);   // a volta de entrada não conta para a "tontura"
    anel.pos = pos;
    anel.posicionar = true;
    if (u >= 1) { anel.giro = null; assentarGiro(); }
  }

  const alvoEscuro = caixas.some(c => c.estado !== 'fechada') ? 1 : 0;
  if (anel.escuro !== alvoEscuro) {
    anel.escuro = reduzido() ? alvoEscuro : anel.escuro + (alvoEscuro - anel.escuro) * (1 - Math.exp(-9 * dt));
    if (Math.abs(alvoEscuro - anel.escuro) < 0.002) anel.escuro = alvoEscuro;
    anel.posicionar = true;
  }

  for (const c of caixas) animarCaixa(c, dt);
  brilhoPeriodico(dt);

  if (visita?.voltarEm != null) {
    visita.voltarEm -= dt;
    if (visita.voltarEm <= 0) soltarVisita();
  }

  if (anel.posicionar) posicionar();
  if (anel.visivel) for (const c of caixas) if (c.suja) pintarCaixa(c);

  const parado = reduzido();
  const frente = caixas[anel.atual];
  return !!(anel.giro || anel.arrasto || anel.posicionar || visita?.voltarEm != null)
    || (anel.vitrine && anel.entrou && anel.visto)
    || anel.escuro !== alvoEscuro
    || caixas.some(c => c.estado === 'chamada' || c.estado === 'abrindo' || c.estado === 'fechando'
      || (c.estado === 'aberta' && !parado && anel.visivel) || c.faiscas.length || c.tremidaT > 0 || c.fundicaoT != null)
    || (anel.visivel && !parado && !anel.trava && frente?.estado === 'fechada');
}

// ---------- montagem ----------

function criarCaixa(el, i) {
  const dados = projetos.find(p => p.id === el.dataset.projeto) ?? projetos[i];
  const revelacao = el.querySelector('.bau-revelacao');
  const cartao = revelacao.querySelector('.cartao');
  // O número escrito no HTML é a cópia para quem está sem script; o que vale é o de js/dados/perfil.js.
  for (const s of cartao.querySelectorAll('[data-numero]')) {
    s.textContent = numeroDe(dados.id, s.dataset.numero) || s.textContent;
  }
  const tras = document.createElement('canvas'), frente = document.createElement('canvas');
  tras.className = 'bau-tras pixel';
  frente.className = 'bau-frente pixel';
  for (const canvas of [tras, frente]) canvas.setAttribute('aria-hidden', 'true');
  const tranca = document.createElement('button');
  tranca.type = 'button';
  tranca.className = 'bau-tranca';
  tranca.tabIndex = -1;
  tranca.setAttribute('aria-controls', revelacao.id);
  tranca.setAttribute('aria-expanded', 'false');
  const nome = document.createElement('span');
  nome.className = 'sr-only';
  nome.textContent = `Caixa ${dados.numeral}: ${dados.nome}`;
  tranca.append(nome);
  el.prepend(tras);
  el.append(frente, tranca);
  el.dataset.numeral = dados.numeral;
  return {
    el, i, id: dados.id, numeral: dados.numeral, nome: dados.nome, tranca, revelacao, cartao,
    bau: montarBau(tras, frente, { numeral: dados.numeral }),
    estado: 'fechada', t: 0, tampa: 0, brilho: 0, tampa0: 0, brilho0: 0, tempo: 0,
    faiscas: [], tremidaT: 0, reflexo: null, fundicaoT: null, metal: document.documentElement.dataset.metal ?? null,
    x: 0, y: 0, alturaBase: 0, mostrando: false, porTeclado: false, auto: false, entao: null, suja: true,
    vaga: undefined, faixa: 0,   // o jogo da luz (Fase 2) põe a caixa em outra vaga do anel e numa faixa de profundidade
  };
}

// Arrastar a janela para outra tela muda a densidade sem resize: as caixas são refeitas no px de dispositivo novo.
function vigiarDensidade() {
  matchMedia(`(resolution: ${devicePixelRatio}dppx)`).addEventListener('change', () => {
    medirLayout();
    vigiarDensidade();
  }, { once: true });
}

function ligarEventos() {
  for (const c of caixas) {
    c.tranca.addEventListener('click', e => {
      if (arrastou) return;
      if (anel.trava) { anel.trava.aoEscolher?.(c); return; }
      if (c.i === anel.atual && !anel.giro && c.estado !== 'fechada') {
        if (c.estado === 'chamada') impacto(c); else fechar(c);
        acordar();
        return;
      }
      pedir(c.i, true, e.detail === 0);
    });
    const passar = () => {
      if (!anel.trava && c.i === anel.atual && c.estado === 'fechada' && mascoteDisponivel(true)) {
        visitar(c, { prioridade: PASSANDO, repetir: true });
      }
    };
    c.tranca.addEventListener('pointerenter', e => { if (e.pointerType !== 'touch' && !anel.giro) passar(); });
    c.tranca.addEventListener('focus', passar);
    const sair = () => { if (visita?.c === c && c.estado === 'fechada' && !visita.golpe) voltarDepois(visita); };
    c.tranca.addEventListener('pointerleave', sair);
    c.tranca.addEventListener('blur', sair);
    c.cartao.querySelector('.cartao-fechar')?.addEventListener('click', () => fechar(c));
    for (const d of c.cartao.querySelectorAll('details')) {
      d.addEventListener('toggle', () => { if (d.open) emitir('historia-aberta', { id: c.id }); });
    }
  }

  document.getElementById('anel-anterior')?.addEventListener('click', () => girar(-1));
  document.getElementById('anel-proximo')?.addEventListener('click', () => girar(1));
  anelEl.addEventListener('keydown', e => {
    if ((e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') || !e.target.closest('.bau-tranca, .anel-seta')) return;
    e.preventDefault();
    girar(e.key === 'ArrowLeft' ? -1 : 1);
  });

  // Esc fecha a caixa aberta (e avisa o mascote que já foi atendido); sem caixa aberta, ele sai da caixa. Só com o anel
  // à vista ou o foco nele: longe dali, o Esc é do resto da página (calar o mascote, largar o recado).
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape' || e.defaultPrevented || anel.trava) return;
    if (!anel.visivel && !anelEl.contains(document.activeElement)) return;
    const aberta = caixas.find(c => c.estado === 'chamada' || c.estado === 'abrindo' || c.estado === 'aberta');
    if (aberta) { e.preventDefault(); fechar(aberta); acordar(); return; }
    soltarVisita();
  });

  // Arrastar na horizontal gira o anel (só com tudo fechado); a rolagem vertical continua do navegador (pan-y).
  palco.addEventListener('pointerdown', e => {
    if (e.button !== 0 || anel.trava || e.target.closest('.bau-revelacao')) return;
    if (caixas.some(c => c.estado !== 'fechada')) return;
    anel.arrasto = { id: e.pointerId, x0: e.clientX, y0: e.clientY, pos0: anel.pos, moveu: false };
  });
  addEventListener('pointermove', e => {
    const a = anel.arrasto;
    if (!a || e.pointerId !== a.id) return;
    const dx = e.clientX - a.x0, dy = e.clientY - a.y0;
    if (!a.moveu) {
      if (Math.abs(dx) < 8 || Math.abs(dx) < Math.abs(dy)) return;
      a.moveu = true;
      anel.giro = null;
      anel.fila = null;
      anel.vitrine = null;
      document.documentElement.classList.add('arrastando-anel');
    }
    const pos = a.pos0 - dx / (anel.Rx * 0.87);
    anel.girado += Math.abs(pos - anel.pos);
    anel.pos = pos;
    anel.posicionar = true;
    acordar();
  }, { passive: true });
  const soltarArrasto = e => {
    const a = anel.arrasto;
    if (!a || e.pointerId !== a.id) return;
    anel.arrasto = null;
    if (!a.moveu) return;
    document.documentElement.classList.remove('arrastando-anel');
    arrastou = true;
    setTimeout(() => { arrastou = false; });
    // basta ter passado 0,15 de caixa para assentar na próxima, para o lado do arrasto
    const alvo = Math.round(anel.pos + 0.35 * Math.sign(anel.pos - a.pos0));
    definirFrente(alvo);
    anel.giro = { de: anel.pos, para: alvo, t: 0, dur: 0.42 };
    acordar();
  };
  addEventListener('pointerup', soltarArrasto);
  addEventListener('pointercancel', soltarArrasto);

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(registros => {
      const e = registros[registros.length - 1];   // num lote, vale o mais recente
      anel.visivel = e.isIntersecting;
      anel.visto = e.intersectionRatio >= 0.85;
      if (!anel.entrou && e.intersectionRatio >= 0.3) {
        anel.entrou = true;
        // a primeira vez à vista, o anel dá uma volta inteira e para com a caixa I na frente
        if (!reduzido() && !anel.giro && !anel.fila) anel.giro = { de: anel.pos, para: 0, t: 0, dur: 2.3, saida: true };
      }
      acordar();
    }, { threshold: [0, 0.3, 0.85] }).observe(palco);
  } else {
    anel.visivel = true;
    anel.vitrine = null;
  }

  new ResizeObserver(() => medirLayout()).observe(palco);
  const cartoes = new ResizeObserver(registros => {
    for (const r of registros) {
      const c = caixas.find(x => x.cartao === r.target);
      if (c?.estado === 'aberta') { colocarCartao(c, false); abrirEspaco(c); }
    }
  });
  for (const c of caixas) cartoes.observe(c.cartao);
  addEventListener('resize', () => {
    const k = Math.min(3, Math.max(1, window.devicePixelRatio || 1));
    if (pixelDaTela() !== anel.P || k !== anel.k) medirLayout();
  });
  vigiarDensidade();

  // Metal novo (prata, ouro): cada caixa troca a paleta com o brilho de fundição passando.
  new MutationObserver(() => {
    const metal = document.documentElement.dataset.metal ?? null;
    for (const c of caixas) {
      if (c.metal === metal) continue;
      c.metal = metal;
      c.fundicaoT = reduzido() ? null : 0;
      c.suja = true;
    }
    acordar();
  }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-metal'] });

  // Movimento reduzido ligado no meio de algo: tudo vai para o estado final.
  aoMudar(parado => {
    if (parado) {
      if (anel.giro) { anel.pos = anel.giro.para; anel.giro = null; assentarGiro(); }
      for (const c of caixas) {
        if (c.estado === 'chamada') impacto(c);
        else if (c.estado === 'abrindo') assentar(c);
        else if (c.estado === 'fechando') fechou(c);
        c.faiscas = [];
        c.tremidaT = 0;
        c.fundicaoT = null;
        c.suja = true;
      }
    }
    acordar();
  });
}

export function iniciar() {
  if (!secao || !palco || !anelEl) return;
  caixas = [...palco.querySelectorAll('.bau')].map(criarCaixa);
  if (!caixas.length) return;
  definirFrente(0);
  medirLayout();
  ligarEventos();
  registrar(quadro);
}

// ---------- para o jogo da luz (Fase 2) ----------
// O jogo não existe ainda: isto é a porta. Ele lê as caixas e o anel, gira até uma caixa, abre e fecha, e trava o
// anel para si (cliques nas caixas viram escolha, sem giro, arrasto, vitrine nem brilho). Para trocar a plaqueta,
// a tampa, o brilho, a tremida ou as faíscas de uma caixa, mexe no registro (c.bau, c.tampa, c.brilho, c.tremidaT,
// c.faiscas, c.vaga, c.faixa) e chama redesenhar(c).
export const anelDeCaixas = {
  get caixas() { return caixas; },
  get frente() { return anel.atual; },
  get posicao() { return anel.pos; },
  get palco() { return palco; },
  ocupado: () => !!(anel.giro || anel.arrasto || anel.fila) || caixas.some(c => c.estado !== 'fechada'),
  girarAte: i => pedir(i, false),
  abrir: (i, porTeclado = false) => pedir(i, true, porTeclado),
  fechar: (i, entao) => { if (caixas[i]) fechar(caixas[i], entao); acordar(); },
  // dono = { aoEscolher(caixa) }; devolve { soltar() }
  travar(dono = {}) {
    anel.trava = dono;
    anel.vitrine = null;
    anel.fila = null;
    acordar();
    return {
      soltar: () => {
        if (anel.trava !== dono) return;
        anel.trava = null;
        const c = caixas[anel.atual];
        if (c) legendar(`CAIXA ${c.numeral}`, c.nome);
        acordar();
      },
    };
  },
  legendar,
  redesenhar(c) { c.suja = true; anel.posicionar = true; acordar(); },
};
