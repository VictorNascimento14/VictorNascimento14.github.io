// Os golpes especiais do duelo de cartas: os 16 golpes do mundo dev e as cenas que a Interface do duelo desenha no
// canvas de efeitos da arena (spec 07 §5.6–5.7, §6.6–6.9; tema em docs/arquitetura.md §11). Desenho próprio: no lugar
// da constelação, um grafo de commits; no lugar da poeira estelar, uma nuvem de bits; no lugar do cosmo, o Café.
//
// API (a Interface programa contra ela; nomes do §11):
//
//   ESPECIAIS[id] = { nome, grito, subtitulo, lutador, metal, cores: { nuvem, borda }, grafo: { nos, ramos }, hit,
//                     tail, sobe?, reage?, espelha? }
//     nome       a carta ("Post viral"); grito: o texto da placa, tal como está (o do §11: caixa alta, com "v1.0");
//                subtitulo: o ramo do grafo, que vai sob o grito (em caixa alta na placa)
//     lutador    artigo | conexao | merge | review; metal: bronze | prata | ouro (o deck da carta)
//     grafo      nós [x, y, brilhante?] numa caixa unitária (x à direita, y para baixo) e ramos [i, j]
//     hit/tail   s (spec §5.7). reage = a carta não é ataque (defesa ou truque): o hit dela é o `reagir` recebido
//     sobe       joga o atingido para o alto; espelha: o grafo vira junto com o lado de quem golpeia
//
//   mostrar(opções) → cena (null se o id não existe). Opções (spec §6.6, em português):
//     id, metal, P, dir (1 | −1), eu: { x, y } (os pés, em px CSS do palco), rivais: [{ x, y, n, segurou, guarda }]
//     (n = vida perdida; segurou = bloqueou; guarda = tinha defesa virada ou a Recomendação), contagem (lances
//     anteriores desta rodada com carta deste lutador), roubado (alcance roubado), recebendo (algum golpe mirou este
//     lutador), contra (n do contra-ataque desta carta), sprite: { metal, elmo, kit } (kit: objeto ou nome em KITS),
//     reagir (land − intro, para defesas e truques), semente (uid × 97 + rodada).
//     Acréscimos: curta (true = versão curta: a carta já apareceu no duelo; `longa: false` vale o mesmo),
//     inicio (s no relógio da cena em que o golpe começa; padrão: o fim da intro, 1,1 na longa e 0,3 na curta),
//     noite (padrão: a longa escurece o palco; passe false na 2ª cena do mesmo lance), indice (0 | 1: o 2º grito vai
//     acima do 1º), grito (false = a Interface põe a placa no DOM com ESPECIAIS[id].grito e .subtitulo).
//
//   cena = { hit, tail, inicio, queda, espera, fim, tremida, t, terminou, atualizar(dt, posicoes), desenhar(ctx, P,
//            dpr, camada?), poses() }
//     O relógio da cena começa em 0 quando mostrar é chamado (chame no começo do lance). hit: do início do golpe ao
//     impacto; queda = inicio + hit; espera: o settle do §6.6 (tail, voo e recuperação dos atingidos); fim = queda +
//     espera; terminou = t ≥ fim; tremida: px da tremida do palco na queda (0 = nenhuma). `inicio` aceita escrita
//     (cena.inicio = land − hit, se outra carta do lance atrasar a queda). A cena desenha a noite (longa), o Café, o
//     grafo na nuvem de bits, a placa do grito, o efeito, o clarão do impacto; a tremida e os números são da Interface.
//     atualizar(dt, posicoes)  avança o relógio. posicoes (opcional) = { eu: { x, y }, rivais: [{ x, y }] }: onde os
//              lutadores estão agora, sem a pose (a cena acompanha quem anda até o lugar).
//     desenhar(ctx, P, dpr, camada)  ctx em px de dispositivo sem transformação, do tamanho do palco (px CSS × dpr).
//              camada 'atras' (pintar antes dos lutadores) | 'frente' (depois) | omitida (as duas, nessa ordem).
//     poses()  { eu: pose, rivais: [pose] }: o que a cena pede aos sprites agora (spec §5.7, fim). Só valem os campos
//              presentes: dx, dy (px CSS, somar à posição), giro (graus, múltiplo de 90, em torno do ponto 8P acima
//              dos pés; quarto de volta é exato: carimbe o ator girado num canvas, como capturas/vitrine-golpes.html),
//              opacidade, cinzel, maco, asas, virar (olha para o outro lado), sentado, dormindo, tom ('luz' | 'gelo' |
//              'pedra'), passos.
//
//   Também (puros, testados): unidade(P), recuperacao(n, sobe), voo(u, perda, opções), repeticoes(id, contagem),
//   densidade(id), nuvem(id, colunas, linhas, área?), ceu(id, metal) → SVG do céu da carta (viewBox 0 0 100 140).
//
// Pixel art nítido: os efeitos andam numa grade de u = max(2, round(0,6P)) px CSS presa ao palco (cada quadrado com
// as bordas no pixel de dispositivo); os sprites seguem no P deles. Movimento reduzido: a Interface não chama cena.
import { sorteio, limitar, misturar, suave, saidaCubica } from '../nucleo/pixel.js';
import { desenhar as desenharAtor, CORES, METAIS } from '../arte/escultor.js';
import { KITS } from '../arte/gladiadores.js';

const TAU = Math.PI * 2;
const BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
const NOITE = '#110e1c';
const CREME = '#fffaf0';
const ESCURO = '#191410';

// O Café de cada metal (núcleo, brilho, fundo): a aura que queima em volta de quem golpeia.
const CAFE = {
  bronze: { nucleo: '#fff6d8', brilho: '#f3c66b', fundo: '#b9772d' },
  prata: { nucleo: '#ffffff', brilho: '#cfe3f3', fundo: '#7f9fbb' },
  ouro: { nucleo: '#fffbe6', brilho: '#fde68a', fundo: '#d99a0b' },
};
const metalDe = m => (m === 'prata' || m === 'ouro' ? m : 'bronze');
// Os degraus do metal (m0 escuro … m4 brilho), os mesmos do ator e das cartas.
const liga = metal => { const c = { ...CORES, ...METAIS[metal] }; return [c.b, c.d, c.m, c.l, c.h]; };

// ---------- os 16 grafos de commits (caixa unitária, y para baixo) ----------
// Cada um é um ícone do golpe desenhado com commits e ramos, como as constelações desenhavam figuras.

const GRAFOS = {
  // um sino: alça, ombros, boca larga e o badalo
  sino: {
    nos: [[0.5, 0.06, 1], [0.33, 0.2], [0.67, 0.2], [0.27, 0.46], [0.73, 0.46], [0.12, 0.72], [0.5, 0.72],
      [0.88, 0.72], [0.5, 0.93, 1]],
    ramos: [[0, 1], [0, 2], [1, 3], [2, 4], [3, 5], [4, 7], [5, 6], [6, 7], [6, 8]],
  },
  // a rede: sete contatos em volta de você, ligados entre si e quatro direto (irregular, como rede de verdade)
  rede: {
    nos: [[0.48, 0.5, 1], [0.14, 0.18], [0.46, 0.06], [0.86, 0.2, 1], [0.94, 0.6], [0.7, 0.92], [0.3, 0.86],
      [0.06, 0.58]],
    ramos: [[1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 7], [7, 1], [0, 1], [0, 3], [0, 5], [0, 7]],
  },
  // o ícone de merge: o ramo sai da main, volta no commit de merge e a main sobe numa seta
  merge: {
    nos: [[0.3, 0.94], [0.3, 0.64], [0.3, 0.36, 1], [0.3, 0.06, 1], [0.74, 0.74], [0.74, 0.48], [0.14, 0.22],
      [0.46, 0.22]],
    ramos: [[0, 1], [1, 2], [2, 3], [0, 4], [4, 5], [5, 2], [3, 6], [3, 7]],
  },
  // duas pistas lado a lado, amarradas a cada commit: dois autores, um grafo
  par: {
    nos: [[0.28, 0.08, 1], [0.28, 0.38], [0.28, 0.66], [0.28, 0.94], [0.72, 0.08, 1], [0.72, 0.38], [0.72, 0.66],
      [0.72, 0.94]],
    ramos: [[0, 1], [1, 2], [2, 3], [4, 5], [5, 6], [6, 7], [1, 5], [2, 6], [3, 7]],
  },
  // um foguete: bico, corpo, aletas, bocal e o fogo
  foguete: {
    nos: [[0.5, 0.04, 1], [0.36, 0.3], [0.64, 0.3], [0.36, 0.62], [0.64, 0.62], [0.18, 0.84], [0.82, 0.84],
      [0.5, 0.76], [0.5, 0.97, 1]],
    ramos: [[0, 1], [0, 2], [1, 3], [2, 4], [3, 5], [4, 6], [3, 7], [4, 7], [7, 8]],
  },
  // o histórico: um relógio com a seta dando a volta para trás
  historico: {
    nos: [[0.81, 0.31], [0.5, 0.1], [0.19, 0.31], [0.19, 0.73], [0.5, 0.94], [0.81, 0.73, 1], [0.86, 0.9],
      [0.66, 0.82], [0.5, 0.52, 1], [0.5, 0.3], [0.66, 0.52]],
    ramos: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [5, 7], [8, 9], [8, 10]],
  },
  // uma chama de duas línguas, com a língua de dentro acesa
  chama: {
    nos: [[0.6, 0.02, 1], [0.46, 0.22], [0.38, 0.38], [0.27, 0.16], [0.18, 0.5], [0.24, 0.78], [0.42, 0.95],
      [0.64, 0.96], [0.82, 0.8], [0.86, 0.54], [0.74, 0.32], [0.52, 0.6, 1]],
    ramos: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 7], [7, 8], [8, 9], [9, 10], [10, 0], [6, 11], [11, 7]],
  },
  // um visto com o "+1" de quem aprova
  aprovado: {
    nos: [[0.12, 0.58], [0.26, 0.72], [0.4, 0.88, 1], [0.56, 0.62], [0.72, 0.38], [0.9, 0.12, 1], [0.24, 0.1],
      [0.24, 0.38], [0.1, 0.24], [0.38, 0.24], [0.24, 0.24]],
    ramos: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [10, 6], [10, 7], [10, 8], [10, 9]],
  },
  // uma sequência que atravessa o calendário em zigue-zague, dia após dia
  sequencia: {
    nos: [[0.08, 0.18], [0.36, 0.18], [0.64, 0.18], [0.92, 0.18], [0.92, 0.5], [0.64, 0.5], [0.36, 0.5],
      [0.08, 0.5], [0.08, 0.82], [0.36, 0.82], [0.64, 0.82], [0.92, 0.82, 1]],
    ramos: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 7], [7, 8], [8, 9], [9, 10], [10, 11]],
  },
  // a arroba: o "a" fechado e a volta de fora
  arroba: {
    nos: [[0.6, 0.38], [0.42, 0.4], [0.4, 0.6], [0.58, 0.62], [0.66, 0.72], [0.84, 0.6], [0.86, 0.34],
      [0.66, 0.1, 1], [0.36, 0.1], [0.14, 0.34], [0.16, 0.68], [0.4, 0.9], [0.72, 0.88, 1]],
    ramos: [[0, 1], [1, 2], [2, 3], [3, 0], [3, 4], [4, 5], [5, 6], [6, 7], [7, 8], [8, 9], [9, 10], [10, 11],
      [11, 12]],
  },
  // o triângulo de alerta com a exclamação
  alerta: {
    nos: [[0.5, 0.05, 1], [0.28, 0.47], [0.06, 0.9], [0.5, 0.9], [0.94, 0.9], [0.72, 0.47], [0.5, 0.33],
      [0.5, 0.6], [0.5, 0.77, 1]],
    ramos: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0], [6, 7]],
  },
  // um grafo de git de verdade: commits pequenos, dois ramos e o HEAD no alto
  atomicos: {
    nos: [[0.3, 0.95], [0.3, 0.77], [0.72, 0.66], [0.72, 0.5], [0.3, 0.57], [0.3, 0.38, 1], [0.72, 0.28],
      [0.72, 0.13], [0.3, 0.2], [0.3, 0.03, 1]],
    ramos: [[0, 1], [1, 2], [2, 3], [1, 4], [4, 5], [3, 5], [5, 6], [6, 7], [5, 8], [8, 9], [7, 9]],
  },
  // um ímã: puxa
  ima: {
    nos: [[0.2, 0.06, 1], [0.2, 0.34], [0.2, 0.6], [0.32, 0.84], [0.5, 0.92], [0.68, 0.84], [0.8, 0.6],
      [0.8, 0.34], [0.8, 0.06, 1]],
    ramos: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 7], [7, 8]],
  },
  // o raio
  raio: {
    nos: [[0.62, 0.04], [0.8, 0.04], [0.3, 0.52], [0.52, 0.4], [0.5, 0.52], [0.72, 0.4], [0.26, 0.97, 1]],
    ramos: [[0, 1], [0, 2], [2, 4], [4, 6], [1, 3], [3, 5], [5, 6]],
  },
  // a seta que passa por cima: o ramo de cima fica para trás, órfão
  forca: {
    nos: [[0.06, 0.64], [0.3, 0.64], [0.56, 0.64], [0.92, 0.64, 1], [0.78, 0.48], [0.78, 0.8], [0.3, 0.3],
      [0.5, 0.22], [0.7, 0.28]],
    ramos: [[0, 1], [1, 2], [2, 3], [3, 4], [3, 5], [1, 6], [6, 7], [7, 8]],
  },
  // o anel do CI (lint, teste, build, deploy) com o visto no meio
  ci: {
    nos: [[0.91, 0.59], [0.8, 0.81, 1], [0.59, 0.93], [0.41, 0.93], [0.2, 0.81, 1], [0.09, 0.59], [0.09, 0.41],
      [0.2, 0.19, 1], [0.41, 0.07], [0.59, 0.07], [0.8, 0.19, 1], [0.91, 0.41], [0.32, 0.52], [0.45, 0.66],
      [0.7, 0.36]],
    ramos: [[0, 1], [1, 2], [3, 4], [4, 5], [6, 7], [7, 8], [9, 10], [10, 11], [12, 13], [13, 14]],
  },
};

// ---------- os 16 golpes ----------

export const ESPECIAIS = {
  notificacoes: {
    nome: 'Post viral', grito: 'CHUVA DE NOTIFICAÇÕES!', subtitulo: 'feat/post-viral', lutador: 'artigo',
    metal: 'bronze', cores: { nuvem: '#3d8bfd', borda: '#f0506e' }, grafo: GRAFOS.sino, hit: 0.75, tail: 1.2,
  },
  conexoes: {
    nome: 'Minha rede', grito: 'CORRENTE DE CONEXÕES!', subtitulo: 'feat/minha-rede', lutador: 'conexao',
    metal: 'bronze', cores: { nuvem: '#2fc4b2', borda: '#3d8bfd' }, grafo: GRAFOS.rede, hit: 0, tail: 0.55,
    reage: true,
  },
  'merge-main': {
    nome: 'Merge sem review', grito: 'MERGE DIRETO NA MAIN!', subtitulo: 'feat → main', lutador: 'merge',
    metal: 'bronze', cores: { nuvem: '#2ea043', borda: '#1fb6a8' }, grafo: GRAFOS.merge, hit: 0.55, tail: 1.05,
    sobe: true,
  },
  pair: {
    nome: 'Pair programming', grito: 'PAIR PROGRAMMING!', subtitulo: 'co-authored-by', lutador: 'merge',
    metal: 'bronze', cores: { nuvem: '#3fb950', borda: '#a371f7' }, grafo: GRAFOS.par, hit: 0.7, tail: 1.3,
  },
  release: {
    nome: 'Release', grito: 'RELEASE v1.0!', subtitulo: 'tag v1.0.0', lutador: 'review', metal: 'bronze',
    cores: { nuvem: '#a371f7', borda: '#f0883e' }, grafo: GRAFOS.foguete, hit: 0.65, tail: 1.2, sobe: true,
  },
  rollback: {
    nome: 'Resposta nos comentários', grito: 'ROLLBACK!', subtitulo: 'git revert HEAD', lutador: 'artigo',
    metal: 'prata', cores: { nuvem: '#58a6ff', borda: '#a5b4fc' }, grafo: GRAFOS.historico, hit: 0, tail: 1.45,
    reage: true,
  },
  'hot-take': {
    nome: 'Hot take', grito: 'HOT TAKE!', subtitulo: 'opinião/forte', lutador: 'artigo', metal: 'prata',
    cores: { nuvem: '#fb7a3c', borda: '#3d8bfd' }, grafo: GRAFOS.chama, hit: 0.6, tail: 0.9,
  },
  endosso: {
    nome: 'Recomendação escrita', grito: 'ENDOSSO!', subtitulo: 'review: approve +1', lutador: 'conexao',
    metal: 'prata', cores: { nuvem: '#5eead4', borda: '#9be15d' }, grafo: GRAFOS.aprovado, hit: 0, tail: 0.55,
    reage: true,
  },
  streak: {
    nome: 'Sequência de commits', grito: 'STREAK DE COMMITS!', subtitulo: 'main · 365 dias', lutador: 'merge',
    metal: 'prata', cores: { nuvem: '#39d353', borda: '#1fb6a8' }, grafo: GRAFOS.sequencia, hit: 0.78, tail: 1,
  },
  mencao: {
    nome: 'Code owner', grito: '@MENÇÃO!', subtitulo: 'CODEOWNERS', lutador: 'review', metal: 'prata',
    cores: { nuvem: '#8957e5', borda: '#58a6ff' }, grafo: GRAFOS.arroba, hit: 0.5, tail: 0.95,
  },
  'deploy-sexta': {
    nome: 'Thread polêmica', grito: 'DEPLOY NA SEXTA!', subtitulo: 'prod · sexta, 17h59', lutador: 'artigo',
    metal: 'ouro', cores: { nuvem: '#f0453a', borda: '#f0883e' }, grafo: GRAFOS.alerta, hit: 1, tail: 1.3,
  },
  'commits-atomicos': {
    nome: 'Post de aprendizados', grito: 'COMMITS ATÔMICOS!', subtitulo: 'git add -p', lutador: 'artigo',
    metal: 'ouro', cores: { nuvem: '#22c3e6', borda: '#3d8bfd' }, grafo: GRAFOS.atomicos, hit: 0.72, tail: 1,
  },
  headhunter: {
    nome: 'Proposta de emprego', grito: 'HEADHUNTER!', subtitulo: 'offer/irrecusável', lutador: 'conexao',
    metal: 'ouro', cores: { nuvem: '#f5c542', borda: '#2fc4b2' }, grafo: GRAFOS.ima, hit: 0, tail: 0.55,
    reage: true,
  },
  hotfix: {
    nome: 'Hotfix em produção', grito: 'HOTFIX ÀS 3 DA MANHÃ!', subtitulo: 'hotfix/03h00', lutador: 'merge',
    metal: 'ouro', cores: { nuvem: '#f2cc60', borda: '#3fb950' }, grafo: GRAFOS.raio, hit: 0.8, tail: 1.3,
  },
  'push-force': {
    nome: 'Force push', grito: 'GIT PUSH --FORCE!', subtitulo: 'origin/main', lutador: 'merge', metal: 'ouro',
    cores: { nuvem: '#d8a4e8', borda: '#e5484d' }, grafo: GRAFOS.forca, hit: 0.45, tail: 1.3, reage: true,
    espelha: true,
  },
  'code-review': {
    nome: 'Changes requested', grito: 'CODE REVIEW!', subtitulo: 'changes requested', lutador: 'review',
    metal: 'ouro', cores: { nuvem: '#a371f7', borda: '#3fb950' }, grafo: GRAFOS.ci, hit: 0, tail: 0.9, reage: true,
  },
};

// ---------- contas puras ----------

// O pixel dos efeitos (px CSS) para um P de sprite.
export const unidade = P => Math.max(2, Math.round(P * 0.6));

// Quanto quem foi atingido demora para voltar (§6.6): longe (perda ≥ 3 ou jogado para cima), médio ou só o tranco.
export const recuperacao = (n, sobe = false) => (n >= 3 || (sobe && n > 0) ? 1.15 : n > 0 ? 0.7 : 0.2);

// Quantas vezes o golpe que cresce bate (§5.7): a sequência ganha 2 blocos e os commits atômicos ganham 3 picadas por
// carta do lutador já virada na rodada. Os outros golpes batem uma vez.
export function repeticoes(id, contagem = 0) {
  const c = Math.max(0, Math.floor(contagem));
  if (id === 'streak') return Math.min(9, 3 + 2 * c);
  if (id === 'commits-atomicos') return Math.min(15, 3 + 3 * c);
  return 1;
}

const entre = (v, a, b) => limitar((v - a) / (b - a), 0, 1);
const ease = x => { const v = limitar(x, 0, 1); return v * v * (3 - 2 * v); };
const bezier = (a, b, c, t) => {
  const v = 1 - t;
  return { x: v * v * a.x + 2 * v * t * b.x + t * t * c.x, y: v * v * a.y + 2 * v * t * b.y + t * t * c.y };
};
const mistura = (a, b, t) => ({ x: misturar(a.x, b.x, t), y: misturar(a.y, b.y, t) });

// Como quem é atingido voa (§5.6), u segundos depois do golpe: longe girando em quartos de volta, deita, volta
// andando; ou um pulinho para trás; ou só um tranco. `lado` = para longe de quem bateu.
export function voo(u, perda, { P = 4, lado = 1, sobe = false, empurrao, alto, forcado = false } = {}) {
  const pose = { dx: 0, dy: 0, giro: 0 };
  if (!(u >= 0)) return pose;
  if (perda > 0 && (u < 0.05 || (u > 0.09 && u < 0.13))) pose.tom = 'luz';
  if (forcado || perda >= 3 || (sobe && perda > 0)) {
    const longe = (empurrao ?? (perda >= 5 ? 20 : 16)) * P;
    const altura = (alto ?? (sobe ? 24 : perda >= 5 ? 12 : 9)) * P;
    if (u < 0.5) {
      const p = u / 0.5;
      pose.dx = lado * longe * saidaCubica(p);
      pose.dy = -altura * 4 * p * (1 - p);
      pose.giro = lado * 90 * Math.floor(p * 4);
    } else if (u < 0.78) {
      pose.dx = lado * longe;
      pose.dy = P;
      pose.giro = lado * 90;
    } else if (u < 1.15) {
      const v = (u - 0.78) / 0.37;
      pose.dx = lado * longe * (1 - suave(v));
      pose.passos = Math.floor(v * 8);
    }
  } else if (perda > 0) {
    if (u < 0.32) {
      const p = u / 0.32;
      pose.dx = lado * 9 * P * saidaCubica(p);
      pose.dy = -4 * P * 4 * p * (1 - p);
    } else if (u < 0.7) {
      const v = (u - 0.32) / 0.38;
      pose.dx = lado * 9 * P * (1 - suave(v));
      pose.passos = Math.floor(v * 6);
    }
  } else if (u < 0.2) {
    pose.dx = lado * P * (1 - u / 0.2);
  }
  return pose;
}

// ---------- a nuvem de bits (campo de densidade, §6.7) ----------

function hashTexto(texto) {
  let h = 2166136261;
  for (let i = 0; i < texto.length; i++) { h ^= texto.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
// Um número em [0, 1) para uma lista de inteiros: o mesmo sempre (cintilações re-sorteadas a cada 0,05 s, grãos).
function ruido(...ns) {
  let h = 0x9e3779b9;
  for (const n of ns) { h ^= Math.imul((n | 0) + 0x7f4a7c15, 0x85ebca6b); h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35); }
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
// Ruído de valor suavizado sobre a grade inteira (smoothstep entre os cantos).
function ruidoDeValor(semente) {
  return (x, y) => {
    const i = Math.floor(x), j = Math.floor(y), fx = ease(x - i), fy = ease(y - j);
    const a = ruido(semente, i, j), b = ruido(semente, i + 1, j), c = ruido(semente, i, j + 1), d = ruido(semente, i + 1, j + 1);
    return misturar(misturar(a, b, fx), misturar(c, d, fx), fy);
  };
}

// Densidade (0–1) da nuvem em volta do grafo do golpe, em unidades da caixa: uma faixa que atravessa o grafo num
// ângulo sorteado, mais cheia em volta de até 4 commits, sumindo para longe, com ruído.
export function densidade(id) {
  const { grafo } = ESPECIAIS[id];
  const semente = hashTexto(id);
  const rng = sorteio(semente);
  const cx = grafo.nos.reduce((s, n) => s + n[0], 0) / grafo.nos.length;
  const cy = grafo.nos.reduce((s, n) => s + n[1], 0) / grafo.nos.length;
  const angulo = (rng() < 0.5 ? -1 : 1) * (0.35 + rng() * 0.5);
  const cos = Math.cos(angulo), sen = Math.sin(angulo);
  const nuvens = grafo.nos.filter((n, i) => n[2] || i % 3 === 0).slice(0, 4)
    .map(n => ({ x: n[0] + (rng() - 0.5) * 0.2, y: n[1] + (rng() - 0.5) * 0.2, r: 0.16 + rng() * 0.12 }));
  const ruidoA = ruidoDeValor(semente), ruidoB = ruidoDeValor(semente ^ 0x5bd1e995);
  return (x, y) => {
    const d = -(x - cx) * sen + (y - cy) * cos;
    const faixa = Math.exp(-d * d / 0.07);
    let perto = 0;
    for (const n of nuvens) perto += Math.exp(-((x - n.x) ** 2 + (y - n.y) ** 2) / (n.r * n.r));
    const longe = Math.hypot((x - cx) / 1.25, (y - cy) / 1.05);
    const r = 0.62 * ruidoA(4 * x + 3, 4 * y + 7) + 0.38 * ruidoB(9 * x, 9 * y);
    return limitar(Math.exp(-1.6 * longe * longe) * (0.8 * faixa + 0.55 * perto) * (0.25 + 1.05 * r), 0, 1);
  };
}

// Os níveis (0 vazio, 1 borda, 2 nuvem, 3 miolo) de uma grade colunas × linhas sobre a área dada (em unidades da
// caixa do grafo), com dither ordenado 4 × 4. Padrão: a área da cena, −0,75…1,75 × −0,6…1,7, com a borda esmaecida.
export function nuvem(id, colunas, linhas, { x0 = -0.75, x1 = 1.75, y0 = -0.6, y1 = 1.7, suave: borda = true } = {}) {
  const campo = densidade(id);
  const niveis = new Uint8Array(colunas * linhas);
  const menor = Math.min(colunas, linhas);
  for (let j = 0; j < linhas; j++) {
    for (let i = 0; i < colunas; i++) {
      const x = x0 + (x1 - x0) * (i + 0.5) / colunas, y = y0 + (y1 - y0) * (j + 0.5) / linhas;
      const b = borda ? limitar(Math.min(i, j, colunas - 1 - i, linhas - 1 - j) / (0.18 * menor), 0, 1) : 1;
      const v = campo(x, y) * b * 3.4 + BAYER[j & 3][i & 3] / 16 - 0.5;
      niveis[j * colunas + i] = limitar(Math.floor(v), 0, 3);
    }
  }
  return niveis;
}

// A cor da nuvem clareada com branco (o miolo).
function clarear(hex, t) {
  const n = parseInt(hex.slice(1), 16);
  const canal = s => Math.round(misturar((n >> s) & 255, 255, t));
  return `#${((1 << 24) | (canal(16) << 16) | (canal(8) << 8) | canal(0)).toString(16).slice(1)}`;
}

// ---------- o céu da carta (SVG, §4.4 e §6.7) ----------

const CACHE_CEU = new Map();
// Fundo da carta de golpe: a nuvem de bits em quadrados (grade 25 × 35 de 4 unidades), 16 grãos e o grafo na metade de
// baixo (x 14–88, y 58–130) com ramos tracejados na cor do metal e commits quadrados. Cacheado por golpe e metal.
export function ceu(id, metal = 'bronze') {
  const especial = ESPECIAIS[id];
  if (!especial) return '';
  const m = metalDe(metal), chave = `${id}|${m}`;
  if (CACHE_CEU.has(chave)) return CACHE_CEU.get(chave);
  const niveis = nuvem(id, 25, 35, { x0: -14 / 74, x1: 86 / 74, y0: -58 / 72, y1: 82 / 72, suave: false });
  const cores = [null, especial.cores.borda, especial.cores.nuvem, clarear(especial.cores.nuvem, 0.45)];
  const alfas = [0, 0.2, 0.3, 0.46];
  let svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 140" aria-hidden="true">';
  for (let nivel = 1; nivel <= 3; nivel++) {
    let d = '';
    for (let j = 0; j < 35; j++) {
      for (let i = 0; i < 25; i++) {
        if (niveis[j * 25 + i] !== nivel) continue;
        let fim = i;
        while (fim + 1 < 25 && niveis[j * 25 + fim + 1] === nivel) fim++;
        d += `M${i * 4} ${j * 4}h${(fim - i + 1) * 4}v4h${-(fim - i + 1) * 4}z`;
        i = fim;
      }
    }
    if (d) svg += `<path fill="${cores[nivel]}" fill-opacity="${(alfas[nivel] * 0.6).toFixed(3)}" d="${d}"/>`;
  }
  const rng = sorteio(hashTexto(id) ^ 0x2545f491);
  for (let g = 0; g < 16; g++) {
    svg += `<rect x="${(rng() * 98).toFixed(1)}" y="${(rng() * 138).toFixed(1)}" width="1.4" height="1.4" `
      + `fill="#c9c3e6" fill-opacity="${(0.3 + rng() * 0.5).toFixed(2)}"/>`;
  }
  const ponto = ([x, y]) => [14 + x * 74, 58 + y * 72];
  const d = especial.grafo.ramos.map(([a, b]) => {
    const [ax, ay] = ponto(especial.grafo.nos[a]), [bx, by] = ponto(especial.grafo.nos[b]);
    return `M${ax.toFixed(1)} ${ay.toFixed(1)}L${bx.toFixed(1)} ${by.toFixed(1)}`;
  }).join('');
  svg += `<path d="${d}" fill="none" stroke="${liga(m)[3]}" stroke-width="1.1" stroke-dasharray="2 2" stroke-opacity="0.6"/>`;
  for (const no of especial.grafo.nos) {
    const [x, y] = ponto(no), lado = no[2] ? 4 : 2.6;
    svg += `<rect x="${(x - lado / 2).toFixed(1)}" y="${(y - lado / 2).toFixed(1)}" width="${lado}" height="${lado}" fill="#fffaf0"/>`;
  }
  svg += '</svg>';
  CACHE_CEU.set(chave, svg);
  return svg;
}

// ---------- pixel art: fonte, ícones e o pincel ----------

// Fonte de 3 × 5 para os poucos textos desenhados dentro das cenas (números, código, tags).
const FONTE = {
  ' ': ['...', '...', '...', '...', '...'],
  0: ['###', '#.#', '#.#', '#.#', '###'], 1: ['.#.', '##.', '.#.', '.#.', '###'], 2: ['##.', '..#', '.#.', '#..', '###'],
  3: ['##.', '..#', '.#.', '..#', '##.'], 4: ['#.#', '#.#', '###', '..#', '..#'], 5: ['###', '#..', '##.', '..#', '##.'],
  6: ['.##', '#..', '###', '#.#', '###'], 7: ['###', '..#', '.#.', '.#.', '.#.'], 8: ['###', '#.#', '###', '#.#', '###'],
  9: ['###', '#.#', '###', '..#', '##.'],
  '+': ['...', '.#.', '###', '.#.', '...'], '-': ['...', '...', '###', '...', '...'],
  ':': ['...', '.#.', '...', '.#.', '...'], '.': ['...', '...', '...', '...', '.#.'],
  v: ['...', '...', '#.#', '#.#', '.#.'], '{': ['.##', '.#.', '#..', '.#.', '.##'],
  '}': ['##.', '.#.', '..#', '.#.', '##.'], '(': ['.#.', '#..', '#..', '#..', '.#.'],
  ')': ['.#.', '..#', '..#', '..#', '.#.'], ';': ['...', '.#.', '...', '.#.', '#..'],
  '=': ['...', '###', '...', '###', '...'], '<': ['..#', '.#.', '#..', '.#.', '..#'],
  '>': ['#..', '.#.', '..#', '.#.', '#..'], '/': ['..#', '..#', '.#.', '#..', '#..'],
  '*': ['#.#', '.#.', '###', '.#.', '#.#'], '!': ['.#.', '.#.', '.#.', '...', '.#.'],
  _: ['...', '...', '...', '...', '###'], $: ['.##', '##.', '.#.', '.##', '##.'],
};
const ICONES = {
  sino: { linhas: ['..y..', '.yhy.', '.yyy.', 'yyyyy', '..o..'], cores: { y: '#fcd34d', h: '#fff3b0', o: '#b45309' } },
  coracao: { linhas: ['.r.r.', 'rhrrr', 'rrrrr', '.rrr.', '..r..'], cores: { r: '#f0506e', h: '#ffc2cf' } },
  selo: { linhas: ['.rrr.', 'rrwrr', 'rwwrr', 'rrwrr', '.rrr.'], cores: { r: '#e5484d', w: CREME } },
  balao: { linhas: ['bbbbb', 'bwbwb', 'bbbbb', '.b...'], cores: { b: '#3d8bfd', w: CREME } },
};
const VISTO = ['....#', '...#.', '#.#..', '.#...'];
const VISTO_GRANDE = ['......##', '.....##.', '##..##..', '.####...', '..##....'];
const XIS = ['#...#', '.#.#.', '..#..', '.#.#.', '#...#'];
const CRUZ = ['..g..', '..g..', 'ggwgg', '..g..', '..g..'];
const ARROBA = ['.#####.', '#.....#', '#.###.#', '#.#.#.#', '#.####.', '#......', '.#####.'];
const TRIANGULO = ['...r...', '..rwr..', '..rwr..', '.rrwrr.', '.rrrrr.', 'rrrwrrr'];
const CIRCULO_X = ['.rrr.', 'rwrwr', 'rrwrr', 'rwrwr', '.rrr.'];
const CONECTAR = ['.nnn.', 'nnwnn', 'nwwwn', 'nnwnn', '.nnn.'];
const REBOBINAR = ['..#..#', '.##.##', '######', '.##.##', '..#..#'];
const CURSOR = ['cccc', 'cccc', 'c...', 'c...', 'c...', 'c...', 'c...', 'c...', 'c...'];
const SIRENE = ['...rrr...', '..rhhrr..', '.rrhrrrr.', '.rrrrrrr.', 'kkkkkkkkk', 'kmmmmmmmk'];
const MOEDA = ['.y.', 'yhy', '.y.'];
const FOGO = ['.o.', 'oyo', 'yhy', '.y.'];
// O foguete do release (olhando à direita), em dois quadros de chama.
const FOGUETE = [
  ['....pp........', '....ppwwww....', 'yo..wwwwwwwr..', 'oyyswwbbwwwrrh', 'yo..wwwwwwwr..', '....ppwwww....', '....pp........'],
  ['....pp........', '....ppwwww....', '.y..wwwwwwwr..', 'yoysswbbwwwrrh', '.y..wwwwwwwr..', '....ppwwww....', '....pp........'],
];
const CORES_DO_FOGUETE = { w: '#f0f3f6', s: '#8c959f', b: '#58a6ff', p: '#8250df', r: '#a371f7', h: CREME, y: '#fcd34d', o: '#f0883e' };

// Um canvas fora da tela (página) ou nada (testes no Node).
function criarCanvas(largura, altura) {
  if (typeof OffscreenCanvas === 'function') return new OffscreenCanvas(Math.max(1, largura), Math.max(1, altura));
  if (typeof document !== 'undefined') {
    const c = document.createElement('canvas');
    c.width = Math.max(1, largura);
    c.height = Math.max(1, altura);
    return c;
  }
  return null;
}

// O pincel de uma pintura: tudo na grade de u px CSS presa ao palco, cada célula com as bordas no pixel de
// dispositivo (vizinhas dividem a borda). Posições em px CSS.
function pincel(ctx, k, u) {
  let cor = '';
  const tinta = c => { if (c !== cor) { ctx.fillStyle = c; cor = c; } };
  const cel = (i, j, c, w = 1, h = w) => {
    tinta(c);
    const x0 = Math.round(i * u * k), y0 = Math.round(j * u * k);
    ctx.fillRect(x0, y0, Math.round((i + w) * u * k) - x0, Math.round((j + h) * u * k) - y0);
  };
  const f = {
    ctx, k, u, cel,
    alfa(a) { ctx.globalAlpha = limitar(a, 0, 1); },
    esquecer() { cor = ''; },
    // quadrado de `lado` células centrado em (x, y)
    q(x, y, c, lado = 1) { cel(Math.floor(x / u - (lado - 1) / 2), Math.floor(y / u - (lado - 1) / 2), c, lado); },
    // reta de Bresenham entre as células dos dois pontos; passo 2 = pontilhada
    linha(x0, y0, x1, y1, c, { passo = 1, lado = 1 } = {}) {
      let i = Math.floor(x0 / u), j = Math.floor(y0 / u);
      const i1 = Math.floor(x1 / u), j1 = Math.floor(y1 / u), m = (lado - 1) >> 1;
      const di = Math.abs(i1 - i), dj = -Math.abs(j1 - j), si = i < i1 ? 1 : -1, sj = j < j1 ? 1 : -1;
      let erro = di + dj;
      for (let n = 0; n < 4000; n++) {
        if (n % passo === 0) cel(i - m, j - m, c, lado);
        if (i === i1 && j === j1) break;
        const e2 = 2 * erro;
        if (e2 >= dj) { erro += dj; i += si; }
        if (e2 <= di) { erro += di; j += sj; }
      }
    },
    // as células de uma caixa em que teste(x, y) dá densidade (0–1, ou true): cheia em 1, pontilhada (Bayer) no meio;
    // células vizinhas da mesma linha viram um retângulo só
    regiao(x0, y0, x1, y1, c, teste) {
      const i0 = Math.floor(x0 / u), i1 = Math.ceil(x1 / u), j0 = Math.floor(y0 / u), j1 = Math.ceil(y1 / u);
      for (let j = j0; j < j1; j++) {
        const cy = (j + 0.5) * u;
        let ini = null;
        for (let i = i0; i <= i1; i++) {
          const v = i < i1 ? teste((i + 0.5) * u, cy) : 0;
          if (v > 0 && BAYER[j & 3][i & 3] < v * 16) { if (ini === null) ini = i; }
          else if (ini !== null) { cel(ini, j, c, i - ini, 1); ini = null; }
        }
      }
    },
    disco(x, y, r, c) { f.regiao(x - r, y - r, x + r, y + r, c, (a, b) => (a - x) ** 2 + (b - y) ** 2 <= r * r); },
    // contorno amostrado de uma elipse (ou de um arco dela)
    elipse(x, y, rx, ry, c, { passo = 1, de = 0, ate = TAU, lado = 1 } = {}) {
      const n = Math.max(8, Math.ceil(Math.max(rx, ry) * Math.abs(ate - de) / u));
      for (let i = 0; i <= n; i += passo) { const a = de + (ate - de) * i / n; f.q(x + Math.cos(a) * rx, y + Math.sin(a) * ry, c, lado); }
    },
    poligono(pts, c) {
      const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
      f.regiao(Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys), c, (x, y) => {
        let dentro = false;
        for (let a = 0, b = pts.length - 1; a < pts.length; b = a++) {
          const p = pts[a], q = pts[b];
          if ((p.y > y) !== (q.y > y) && x < (q.x - p.x) * (y - p.y) / (q.y - p.y) + p.x) dentro = !dentro;
        }
        return dentro;
      });
    },
    // desenho por chaves centrado em (x, y); contorno = anel de 1 célula em volta (lê na areia clara)
    sprite(linhas, x, y, cores, { escala = 1, espelho = false, contorno = null } = {}) {
      const w = linhas[0].length, h = linhas.length;
      const i0 = Math.round(x / u - (w * escala) / 2), j0 = Math.round(y / u - (h * escala) / 2);
      const chave = (i, j) => linhas[j][espelho ? w - 1 - i : i];
      const cheia = (i, j) => i >= 0 && j >= 0 && i < w && j < h && !!cores[chave(i, j)];
      if (contorno) {
        for (let j = -1; j <= h; j++) for (let i = -1; i <= w; i++) {
          if (!cheia(i, j) && (cheia(i - 1, j) || cheia(i + 1, j) || cheia(i, j - 1) || cheia(i, j + 1))) {
            cel(i0 + i * escala, j0 + j * escala, contorno, escala);
          }
        }
      }
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
        const c = cores[chave(i, j)];
        if (c) cel(i0 + i * escala, j0 + j * escala, c, escala);
      }
    },
    texto(str, x, y, c, { escala = 1, contorno = null } = {}) {
      const linhas = ['', '', '', '', ''];
      for (const ch of String(str)) { const g = FONTE[ch] ?? FONTE[' ']; for (let r = 0; r < 5; r++) linhas[r] += `${g[r]}.`; }
      f.sprite(linhas.map(l => l.slice(0, -1)), x, y, { '#': c }, { escala, contorno });
    },
    // plaquinha de cantos cortados com um texto
    etiqueta(str, x, y, fundo, c, { escala = 1, contorno = ESCURO } = {}) {
      const w = String(str).length * 4 + 1;
      const linhas = Array.from({ length: 7 }, (_, j) => (j === 0 || j === 6 ? `.${'f'.repeat(w - 2)}.` : 'f'.repeat(w)));
      f.sprite(linhas, x, y, { f: fundo }, { escala, contorno });
      f.texto(str, x, y, c, { escala });
    },
    // cintila: núcleo e quatro braços
    cintila(x, y, braco, c, nucleo = CREME, lado = 1) {
      const i = Math.floor(x / u), j = Math.floor(y / u), m = lado >> 1;
      for (let a = 1; a <= braco; a++) {
        cel(i - m - a, j, c); cel(i - m + lado - 1 + a, j, c);
        cel(i, j - m - a, c); cel(i, j - m + lado - 1 + a, c);
      }
      cel(i - m, j - m, nucleo, lado);
    },
  };
  return f;
}

// Meia-largura da chama do Café na altura y (relativa ao centro): oval esticado para cima, tremendo mais no alto.
function chama(y, rx, ry, t, u) {
  if (y < -1.5 * ry || y > ry) return -1;
  const q = y < 0 ? y / (1.5 * ry) : y / ry;
  const subida = Math.max(0, -q);
  return rx * Math.sqrt(Math.max(0, 1 - q * q)) * (1 - 0.3 * subida) + Math.sin(y / u * 0.7 + t * 24) * u * 1.5 * (subida + 0.3);
}

// ---------- os 16 roteiros ----------
// Cada roteiro recebe o estado da cena (s) e devolve ganchos opcionais, com τ = t − inicio (o relógio do golpe):
//   eu(τ) / rival(i, τ) → pose parcial · atraso(i) / perda(i) → quando e com quanto o rival i voa · voo: { empurrao… }
//   passo(dt, τ) → estado que anda · atras(f, τ) / frente(f, τ) → pintura (sem sortear nada: desenhar é puro)

const ROTEIROS = {
  // Post viral: socos rápidos lançam sinos, curtidas, selos e balões que sobem e caem como meteoros no rival.
  notificacoes(s) {
    const tipos = Object.values(ICONES);
    const n = Math.max(1, s.rivais.length);
    const lista = Array.from({ length: 48 }, (_, k) => ({
      parte: 0.04 + 0.52 * k / 48 + s.rng() * 0.02, icone: tipos[Math.floor(s.rng() * tipos.length)], alvo: k % n,
      ex: (s.rng() - 0.5) * 5, ey: (s.rng() - 0.5) * 11, arco: 24 + s.rng() * 14, saida: (s.rng() - 0.5) * 4,
      meio: 0.55 + s.rng() * 0.2,
    }));
    const VOO = 0.24;
    // sobe alto e cai quase reto no rival, como meteoro: o ponto de controle fica perto do alvo e bem acima
    const caminho = (it, v) => {
      const a = s.punho(), P = s.P, r = s.rivais[it.alvo];
      if (!r) return a;
      const c = s.corpoDe(r);
      const fim = r.segurou ? { x: c.x - s.dir * 6 * P, y: c.y + it.ey * P * 0.4 } : { x: c.x + it.ex * P, y: c.y + it.ey * P };
      const meio = { x: misturar(a.x, fim.x, it.meio) + it.saida * P, y: Math.min(a.y, fim.y) - it.arco * P };
      return bezier({ x: a.x, y: a.y + it.saida * P }, meio, fim, v);
    };
    return {
      eu(τ) {
        if (τ < 0 || τ >= s.hit) return null;
        const a = Math.floor(τ * 28) % 2;
        return { asas: 'batendo', maco: a ? -0.75 : 0.15, cinzel: a ? 0.15 : -0.1, dx: a ? 0 : s.dir * s.P };
      },
      rival: (i, τ) => (τ > 0.3 && τ < s.hit ? { dx: (Math.floor(τ * 48) % 2 ? 0.6 : -0.6) * s.P } : null),
      frente(f, τ) {
        for (const it of lista) {
          const v = (τ - it.parte) / VOO;
          if (v < 0 || v > 1.6) continue;
          if (v <= 1) {
            for (let k = 8; k >= 1; k--) {
              const p = caminho(it, Math.max(0, v - k * 0.04));
              f.q(p.x, p.y, k <= 2 ? CREME : k <= 5 ? s.cafe.brilho : s.cafe.fundo, k <= 2 ? 2 : 1);
            }
            const p = caminho(it, v);
            f.sprite(it.icone.linhas, p.x, p.y, it.icone.cores, { contorno: ESCURO });
          } else {
            const p = caminho(it, 1);
            f.cintila(p.x, p.y, v < 1.2 ? 3 : v < 1.4 ? 2 : 1, s.cafe.brilho);
          }
        }
        // o selo de notificações estoura sobre quem perdeu vida
        const w = τ - s.hit;
        if (w < 0 || w > 0.8) return;
        for (const r of s.rivais) {
          if (r.n <= 0) continue;
          const c = s.corpoDe(r);
          f.alfa(w > 0.65 ? 0.5 : 1);
          f.etiqueta('99+', c.x - s.dir * 2 * s.P, c.y - 16 * s.P - Math.min(1, w / 0.2) * 2 * f.u, '#e5484d', CREME,
            { escala: w < 0.06 ? 3 : 2 });
          f.alfa(1);
        }
      },
    };
  },

  // Minha rede: três anéis de contatos ligados giram em volta; o golpe que chega é preso por um elo lançado até o meio
  // do caminho, e o bloqueio cura (cruzes verdes subindo).
  conexoes(s) {
    const ANEIS = [{ h: 14, rx: 13, vel: 7 }, { h: 9, rx: 15, vel: -5.5 }, { h: 4, rx: 13, vel: 6.5 }];
    const COR = { no: '#5eead4', elo: '#8fe3d6', tras: '#13857e', fundo: '#0b524e', cura: '#7ee787' };
    const curas = Array.from({ length: 6 }, (_, k) => ({ dx: (s.rng() - 0.5) * 16, atraso: k * 0.03, alto: 8 + s.rng() * 8 }));
    const faiscas = Array.from({ length: 11 }, (_, k) => ({ a: (k / 10 - 0.5) * 2.4, v: 18 + s.rng() * 16 }));
    const H = s.hit;
    const escala = τ => (τ < 0 ? 0 : τ < 0.2 ? saidaCubica(τ / 0.2) : τ < H + 0.25 ? 1 : 1 - entre(τ, H + 0.25, H + 0.4));
    const aneis = (f, τ, frente) => {
      const e = escala(τ);
      if (e <= 0) return;
      const pe = s.pe(), P = s.P, branco = s.recebendo && τ >= H && τ < H + 0.1;
      ANEIS.forEach((a, k) => {
        const cy = pe.y - a.h * P, rx = a.rx * P * e, ry = 4 * P * e;
        const pts = Array.from({ length: 12 }, (_, i) => {
          const ang = τ * a.vel + i * TAU / 12 + k * 0.9;
          return [pe.x + Math.cos(ang) * rx, cy + Math.sin(ang) * ry, Math.sin(ang) >= 0];
        });
        pts.forEach((p, i) => {
          const q = pts[(i + 1) % 12];
          if (p[2] === frente) f.linha(p[0], p[1], q[0], q[1], branco ? CREME : frente ? COR.elo : COR.fundo, { passo: frente ? 1 : 2 });
        });
        for (const p of pts) {
          if (p[2] !== frente) continue;
          if (frente) f.sprite(['.n.', 'nwn', '.n.'], p[0], p[1], { n: branco ? CREME : COR.no, w: CREME }, { contorno: COR.fundo });
          else f.q(p[0], p[1], COR.tras, 2);
        }
      });
    };
    return {
      eu: τ => (τ >= 0 && τ < H + 0.4 ? { cinzel: -0.5, maco: -1 } : null),
      atras: (f, τ) => aneis(f, τ, false),
      frente(f, τ) {
        aneis(f, τ, true);
        if (!s.recebendo) return;
        const P = s.P, pe = s.pe(), r = s.rivais[0];
        const o = { x: pe.x + s.dir * 5 * P, y: pe.y - 9 * P };
        const m = mistura(o, r ? s.corpoDe(r) : { x: o.x + s.dir * 40 * P, y: o.y }, 0.5);
        const w = τ - (H - 0.14);
        if (w >= 0 && w <= 0.46) {
          const ext = w < 0.14 ? saidaCubica(w / 0.14) : w < 0.3 ? 1 : 1 - (w - 0.3) / 0.16;
          const dx = m.x - o.x, dy = m.y - o.y, len = Math.hypot(dx, dy) || 1;
          const ponto = v => {
            const onda = Math.sin(v * Math.PI * 3 - τ * 25) * 2 * P * (1 - v * 0.6);
            return { x: o.x + dx * v - dy / len * onda, y: o.y + dy * v + dx / len * onda };
          };
          let antes = ponto(0);
          for (let j = 1; j <= 10; j++) {
            const p = ponto(ext * j / 10);
            f.linha(antes.x, antes.y, p.x, p.y, COR.elo);
            if (j < 10) f.q(p.x, p.y, COR.no, 2);
            antes = p;
          }
          f.sprite(CONECTAR, antes.x, antes.y, { n: COR.no, w: CREME }, { contorno: COR.fundo });
          const choque = τ - H;
          if (choque >= 0 && choque < 0.3) {
            f.cintila(antes.x, antes.y, Math.max(1, 4 - Math.floor(choque / 0.06)), COR.no);
            const base = s.dir > 0 ? 0 : Math.PI;
            for (const fa of faiscas) {
              const d = fa.v * P * 0.6 * saidaCubica(choque / 0.3);
              f.q(antes.x + Math.cos(base + fa.a) * d, antes.y + Math.sin(base + fa.a) * d, fa.a > 0 ? CREME : COR.no, 2);
            }
          }
        }
        // o bloqueio cura
        for (const c of curas) {
          const v = (τ - H - c.atraso) / 0.4;
          if (v < 0 || v > 1) continue;
          f.alfa(v > 0.7 ? 0.5 : 1);
          f.sprite(CRUZ, pe.x + c.dx * P * 0.5, pe.y - 10 * P - c.alto * P * saidaCubica(v), { g: COR.cura, w: CREME }, { contorno: '#0b3d1e' });
          f.alfa(1);
        }
      },
    };
  },

  // Merge sem review: agacha, sobe num gancho e lança uma seta verde enorme que dá um laço e se funde no rival,
  // subindo com ele para a main.
  'merge-main'(s) {
    const COR = { sombra: '#0f3d22', corpo: '#2ea043', luz: '#56d364', barriga: '#aff5b4' };
    const alvo = s.rivais[0];
    const alcance = () => (alvo ? Math.max(0, Math.abs(alvo.x - s.eu.x) - 9 * s.P) : 0);
    const pose = τ => {
      if (τ < 0 || τ > 1.5) return null;
      const P = s.P, d = s.dir;
      if (τ < 0.22) return { dy: P, cinzel: 0.3, maco: -2.4 };
      if (τ < 0.95) {
        const v = ease((τ - 0.22) / 0.33);
        return { dx: d * alcance() * v, dy: -7 * P * v, cinzel: -1.25, maco: -1.6, asas: 'rapidas' };
      }
      const v = ease((τ - 0.95) / 0.55);
      return { dx: d * alcance() * (1 - v), dy: -7 * P * (1 - v), asas: 'batendo' };
    };
    const caminho = τ => {
      const P = s.P, d = s.dir, p = pose(τ) ?? {};
      const o = { x: s.eu.x + (p.dx ?? 0) + d * 6 * P, y: s.eu.y + (p.dy ?? 0) - 4 * P };
      const T = alvo ? { x: alvo.x, y: alvo.y - 8 * P } : { x: o.x + d * 30 * P, y: o.y - 4 * P };
      if (τ <= s.hit) {
        const v = ease(entre(τ, 0.18, s.hit));
        return {
          x: o.x + (T.x - o.x) * v - d * 8 * P * Math.sin(Math.PI * v) * (1 - v),
          y: o.y + (T.y - o.y) * v - 20 * P * Math.sin(Math.PI * v) + 3 * P * Math.sin(3 * Math.PI * v),
        };
      }
      const w = τ - s.hit;
      return { x: T.x + Math.sin(w * 14) * 4 * P, y: T.y - 120 * P * w };
    };
    return {
      eu: pose,
      frente(f, τ) {
        if (τ < 0.18 || τ > s.hit + 0.7) return;
        f.alfa(τ > s.hit + 0.55 ? 0.5 : 1);
        const u = f.u;
        // o corpo: uma faixa grossa e contínua que afina até a cauda, com a sombra embaixo e trechos de luz
        const pontos = Array.from({ length: 31 }, (_, k) => caminho(Math.max(0.18, τ - 0.012 * k)));
        const grossura = k => Math.max(1, Math.round(4.4 - k * 0.12));
        for (let k = 30; k >= 1; k--) {
          const a = pontos[k], b = pontos[k - 1];
          f.linha(a.x + u, a.y + u, b.x + u, b.y + u, COR.sombra, { lado: grossura(k) });
        }
        for (let k = 30; k >= 1; k--) {
          const a = pontos[k], b = pontos[k - 1];
          f.linha(a.x, a.y, b.x, b.y, Math.floor(k / 3) % 3 === 0 ? COR.luz : COR.corpo, { lado: grossura(k) });
          if (k % 6 === 3 && grossura(k) > 2) f.q(b.x, b.y, COR.barriga);
        }
        // a cauda é o commit de onde o ramo saiu
        const cauda = pontos[30];
        f.sprite(['.l.', 'lwl', '.l.'], cauda.x, cauda.y, { l: COR.luz, w: CREME }, { contorno: COR.sombra });
        // a ponta da seta, virada para onde ela anda
        const p = pontos[0], q = caminho(τ - 0.02);
        let vx = p.x - q.x, vy = p.y - q.y;
        const n = Math.hypot(vx, vy) || 1;
        vx /= n; vy /= n;
        const ponta = { x: p.x + vx * 7 * u, y: p.y + vy * 7 * u };
        const tri = [ponta, { x: p.x - vx * 1.5 * u - vy * 5 * u, y: p.y - vy * 1.5 * u + vx * 5 * u },
          { x: p.x - vx * 1.5 * u + vy * 5 * u, y: p.y - vy * 1.5 * u - vx * 5 * u }];
        f.poligono(tri.map(t => ({ x: t.x + u, y: t.y + u })), COR.sombra);
        f.poligono(tri, COR.luz);
        f.q(p.x + vx * u, p.y + vy * u, CREME);
        // o merge: anéis verdes no rival que perdeu vida
        const w = τ - s.hit;
        if (alvo && alvo.n > 0 && w >= 0 && w < 0.35) {
          const c = { x: alvo.x, y: alvo.y - 8 * s.P };
          f.alfa(1);
          f.elipse(c.x, c.y, (3 + 40 * w) * s.P, (3 + 40 * w) * s.P, COR.luz);
          f.elipse(c.x, c.y, (2 + 24 * w) * s.P, (2 + 24 * w) * s.P, CREME, { passo: 2 });
        }
        f.alfa(1);
      },
    };
  },

  // Pair programming: gira entre os dois papéis, o par aparece atrás dele e dois cursores (um de cada) digitam código
  // até os dois rivais. Quem perde vida fica selecionado (azul) e é apagado em caracteres antes de voar.
  pair(s) {
    const CORES_PAR = ['#3fb950', '#a371f7'];
    const GLIFOS = '{};=<>/()*+';
    const glifos = Array.from({ length: 40 }, (_, k) => ({
      parte: 0.34 + 0.32 * k / 40, quem: k % 2, ch: GLIFOS[Math.floor(s.rng() * GLIFOS.length)], onda: (s.rng() - 0.5) * 2,
      fase: s.rng() * TAU,
    }));
    const cacos = Array.from({ length: 16 }, () => ({
      x: (s.rng() - 0.5) * 14, y: (s.rng() - 0.5) * 18, vx: (s.rng() - 0.5) * 50, vy: -30 - s.rng() * 50,
      ch: GLIFOS[Math.floor(s.rng() * GLIFOS.length)],
    }));
    const alvoDe = quem => s.rivais[quem] ?? s.rivais[0];
    const pouso = quem => {
      const pe = s.pe(), P = s.P;
      return { x: pe.x + (quem ? 4 : -4) * P, y: pe.y - 24 * P + Math.sin(s.t * 6 + quem * 2) * P };
    };
    const destino = quem => {
      const r = alvoDe(quem);
      if (!r) return null;
      const c = s.corpoDe(r);
      return { x: c.x - s.dir * (r.segurou ? 8 : 5) * s.P, y: c.y - 3 * s.P };
    };
    const cursor = (quem, τ) => {
      const a = pouso(quem), b = destino(quem);
      if (!b || τ < 0.34) return a;
      return bezier(a, { x: (a.x + b.x) / 2, y: Math.min(a.y, b.y) - 8 * s.P }, b, ease(entre(τ, 0.34, s.hit)));
    };
    return {
      eu(τ) {
        if (τ < 0 || τ > s.hit + 0.2) return null;
        if (τ < 0.34) {
          const vez = Math.floor(τ / 0.085) % 2;
          return { virar: vez === 1, maco: -1.3, cinzel: -1, dy: -vez * s.P, asas: 'batendo' };
        }
        return { cinzel: 0, maco: 0.1, asas: 'batendo' };
      },
      rival: (i, τ) => (s.rivais[i]?.n > 0 && τ >= s.hit && τ < s.hit + 0.65 ? { tom: 'gelo' } : null),
      atraso: i => (s.rivais[i]?.n > 0 ? 0.65 : 0),
      perda: i => Math.min(4, s.rivais[i]?.n ?? 0),
      atras(f, τ) {
        // o par: uma cópia dele, translúcida e contornada na cor do segundo cursor
        if (τ < 0.05 || τ > s.hit + 0.35) return;
        const pe = s.pe(), pose = s.poseEu;
        f.fantasma(pe.x - s.dir * 13 * s.P, s.eu.y, { dir: s.dir, maco: pose.maco ?? -1.3, cinzel: pose.cinzel ?? -1, asas: 'fechadas', contorno: CORES_PAR[1] },
          τ < 0.11 ? 0.2 : 0.4);
      },
      frente(f, τ) {
        const P = s.P;
        for (const g of glifos) {
          const v = (τ - g.parte) / 0.22;
          if (v < 0 || v > 1) continue;
          const a = cursor(g.quem, g.parte), b = destino(g.quem) ?? a;
          const p = mistura(a, b, v), onda = Math.sin(v * TAU + g.fase) * 3 * P * g.onda * (1 - v);
          f.texto(g.ch, p.x, p.y + onda, CORES_PAR[g.quem], { contorno: ESCURO });
        }
        const w = τ - s.hit;
        s.rivais.forEach(r => {
          if (r.n <= 0) return;
          const c = s.corpoDe(r);
          if (w >= 0 && w < 0.65) {
            // a seleção: retângulo azul de texto selecionado, bordas pontilhadas e o cursor piscando na ponta
            f.alfa(0.32);
            f.regiao(c.x - 8 * P, c.y - 10 * P, c.x + 8 * P, c.y + 10 * P, '#388bfd', () => 1);
            f.alfa(1);
            f.linha(c.x - 8 * P, c.y - 10 * P, c.x + 8 * P, c.y - 10 * P, CREME, { passo: 2 });
            f.linha(c.x - 8 * P, c.y + 10 * P, c.x + 8 * P, c.y + 10 * P, CREME, { passo: 2 });
            if (Math.floor(w * 6) % 2 === 0) f.linha(c.x + s.dir * 8 * P, c.y - 11 * P, c.x + s.dir * 8 * P, c.y + 11 * P, CORES_PAR[0], { lado: 2 });
          } else if (w >= 0.65 && w < 1.2) {
            const q = w - 0.65;
            for (const k of cacos) {
              f.alfa(q > 0.4 ? 0.5 : 1);
              f.texto(k.ch, c.x + k.x * P + k.vx * q, c.y + k.y * P + k.vy * q + 260 * q * q * P / 5, '#79c0ff', { contorno: ESCURO });
            }
            f.alfa(1);
          }
        });
        // os dois cursores, com a bandeirinha de quem está digitando
        if (τ < 0 || τ > s.hit + 0.6) return;
        for (const quem of [0, 1]) {
          const voando = τ >= 0.34 && τ < s.hit;
          if (!voando && Math.floor(s.t * 4) % 2) continue;
          const p = cursor(quem, Math.min(τ, s.hit));
          f.sprite(CURSOR, p.x, p.y, { c: CORES_PAR[quem] }, { contorno: ESCURO, escala: P >= 4 ? 2 : 1, espelho: s.dir < 0 });
        }
      },
    };
  },

  // Release: sobe nas asas, o foguete do v1.0 cruza o céu até o rival e a coluna de lançamento o joga para o alto.
  release(s) {
    const brasas = Array.from({ length: 70 }, () => ({
      x: (s.rng() - 0.5) * 8, v: 60 + s.rng() * 140, fase: s.rng() * TAU, vida: 0.4 + s.rng() * 0.3,
      atraso: s.rng() * 0.3, grande: s.rng() < 0.45,
    }));
    const fumaca = Array.from({ length: 10 }, (_, k) => ({ lado: k % 2 ? 1 : -1, v: 30 + s.rng() * 60, sobe: s.rng() * 3 }));
    const foguete = τ => {
      const P = s.P, r = s.rivais[0];
      const ini = { x: s.eu.x - s.dir * 2 * P, y: s.eu.y - 26 * P };
      const fim = r ? s.corpoDe(r) : { x: ini.x + s.dir * 30 * P, y: s.eu.y - 8 * P };
      const v = ease(entre(τ, 0.35, s.hit));
      return { x: misturar(ini.x, fim.x, v), y: misturar(ini.y, fim.y, v) - 6 * P * Math.sin(Math.PI * v) };
    };
    const COLUNA = ['#fff3b0', '#fcd34d', '#f0883e', '#c9361f'];
    return {
      eu(τ) {
        if (τ < 0 || τ > s.hit + 0.35) return null;
        const v = τ < 0.35 ? saidaCubica(τ / 0.35) : τ < s.hit ? 1 : 1 - (τ - s.hit) / 0.35;
        return { dy: -3 * s.P * v, maco: -1.9, cinzel: -0.7, asas: 'rapidas' };
      },
      atras(f, τ) {
        const w = τ - s.hit;
        if (w < 0 || w > 0.45) return;
        const P = s.P, u = f.u;
        for (const r of s.rivais) {
          if (r.n <= 0 || r.segurou) continue;
          // a coluna de lançamento: sobe rápido, afina para cima, ondula e esfria do creme ao vermelho
          const altura = 36 * P * saidaCubica(Math.min(1, w / 0.14)), largura = 10 * P * (1 - 0.6 * w / 0.45);
          f.alfa(0.9 * (w < 0.3 ? 1 : 1 - (w - 0.3) / 0.15));
          for (let y = 0; y < altura; y += u) {
            const q = y / (36 * P), meia = (largura / 2) * (1 - 0.55 * q);
            const cx = r.x + Math.sin(y / (2 * u) + τ * 30) * P;
            const cor = COLUNA[q < 0.25 ? 0 : q < 0.5 ? 1 : q < 0.8 ? 2 : 3];
            f.regiao(cx - meia, r.y - y - u, cx + meia, r.y - y, cor, () => 1);
          }
          f.alfa(1);
        }
      },
      frente(f, τ) {
        const P = s.P, w = τ - s.hit;
        // o foguete, aparecendo em três degraus
        if (τ >= 0.2 && τ < s.hit) {
          f.alfa(τ < 0.25 ? 0.33 : τ < 0.3 ? 0.66 : 1);
          for (let k = 6; k >= 1; k--) {
            const p = foguete(τ - 0.03 * k);
            f.q(p.x - s.dir * 3 * P, p.y, k < 3 ? '#d0d7de' : '#8c959f', k < 4 ? 2 : 1);
          }
          const p = foguete(τ);
          f.sprite(FOGUETE[Math.floor(s.t / 0.08) % 2], p.x, p.y, CORES_DO_FOGUETE,
            { escala: P >= 4 ? 2 : 1, espelho: s.dir < 0, contorno: ESCURO });
          f.alfa(1);
        }
        if (w < 0) return;
        for (const r of s.rivais) {
          const c = s.corpoDe(r);
          if (r.n <= 0 || r.segurou) {
            // segurou: o foguete estoura na guarda
            if (w < 0.3) for (let k = 0; k < 12; k++) {
              const a = k * TAU / 12, d = (2 + 14 * w / 0.3) * P;
              f.q(c.x - s.dir * 5 * P + Math.cos(a) * d, c.y + Math.sin(a) * d, k % 2 ? '#fcd34d' : CREME, 2);
            }
            continue;
          }
          for (const b of brasas) {
            const v = w - b.atraso;
            if (v < 0 || v > b.vida) continue;
            const idade = v / b.vida;
            f.q(r.x + b.x * P + Math.sin(v * 8 + b.fase) * 2 * P, r.y - b.v * P / 5 * v - 2 * P,
              COLUNA[idade < 0.3 ? 0 : idade < 0.6 ? 1 : idade < 0.85 ? 2 : 3], b.grande ? 2 : 1);
          }
          if (w < 0.7) {
            for (const m of fumaca) {
              f.alfa(w > 0.45 ? 0.45 : 0.8);
              f.q(r.x + m.lado * (5 * P + m.v * w), r.y - 1.5 * P - m.sobe * P - w * 10, w < 0.25 ? '#d0d7de' : '#8c959f', 3);
            }
            f.alfa(1);
          }
          if (w > 0.1 && w < 0.7) f.texto('v1.0', r.x, r.y - 38 * P - (w - 0.1) * 10 * P, CREME, { escala: 2, contorno: '#4c2889' });
        }
      },
    };
  },

  // Resposta nos comentários: o escudo do histórico (um relógio com a seta para trás) segura o golpe e o devolve pelo
  // mesmo caminho, desfazendo commit por commit; quem bateu fica cinza (revertido) e então voa.
  rollback(s) {
    const H = s.hit;
    const temContra = s.recebendo && s.contra > 0 && !!s.rivais[0];
    const escudo = () => {
      const pe = s.pe();
      return { x: pe.x + s.dir * 10 * s.P, y: pe.y - 9 * s.P };
    };
    return {
      eu: τ => (τ >= 0 && τ < H + 0.9 ? { cinzel: 0, maco: -1.1 } : null),
      rival: (i, τ) => (i === 0 && temContra && τ >= H + 0.3 && τ < H + 0.95 ? { tom: 'pedra' } : null),
      atraso: () => 0.95,
      perda: i => (i === 0 && temContra ? Math.min(s.contra, 2) : 0),
      frente(f, τ) {
        if (τ < 0 || τ > H + 1.15) return;
        const P = s.P, S = escudo();
        const R = [2, 4, 6][Math.min(2, Math.floor(τ / 0.05))] * P;
        f.alfa(τ > H + 1 ? 0.5 : 1);
        f.disco(S.x, S.y, R, '#0d2a4a');
        f.disco(S.x, S.y, R - f.u, '#58a6ff');
        f.disco(S.x, S.y, R - 2 * f.u, '#0a66c2');
        // o ícone do histórico: ponteiros e a seta dando a volta para trás (rápido quando o golpe chega)
        const aceso = s.recebendo && τ >= H - 0.08;
        const giro = -s.dir * (aceso ? 2 + (τ - H) * 14 : τ * 2);
        const cor = aceso ? CREME : '#9cd0fa', r = R * 0.58;
        if (R >= 4 * P) {
          f.elipse(S.x, S.y, r, r, cor, { de: giro, ate: giro + 1.6 * Math.PI });
          const fim = giro + 1.6 * Math.PI, px = S.x + Math.cos(fim) * r, py = S.y + Math.sin(fim) * r;
          f.cintila(px, py, 1, cor, cor);
          f.linha(S.x, S.y, S.x, S.y - r * 0.6, cor);
          f.linha(S.x, S.y, S.x + s.dir * r * 0.45, S.y, cor);
        }
        f.alfa(1);
        if (!s.recebendo || !s.rivais[0]) return;
        const A = s.corpoDe(s.rivais[0]);
        const borda = { x: S.x + s.dir * R, y: S.y };
        // o caminho do golpe, com commits a cada 4P
        if (τ >= H - 0.3 && τ < H + 0.35) {
          f.linha(A.x, A.y, borda.x, borda.y, '#58a6ff', { passo: 2 });
          const n = Math.max(2, Math.floor(Math.hypot(A.x - borda.x, A.y - borda.y) / (4 * P)));
          const volta = τ < H ? 0 : ease((τ - H) / 0.3);
          for (let k = 1; k < n; k++) {
            const v = k / n;
            if (1 - v < volta) continue;  // o pacote que volta já passou: commit desfeito
            const p = mistura(borda, A, v);
            f.sprite(['.b.', 'bwb', '.b.'], p.x, p.y, { b: '#58a6ff', w: CREME });
          }
        }
        if (τ >= H - 0.25 && τ < H) {
          const v = (τ - H + 0.25) / 0.25;
          for (let k = 2; k >= 0; k--) {
            const p = mistura(A, borda, Math.max(0, v - k * 0.07));
            f.q(p.x, p.y, k ? '#c2410c' : '#f0883e', 3 - k);
          }
        }
        if (τ >= H && τ < H + 0.3) {
          const v = ease((τ - H) / 0.3);
          for (let k = 4; k >= 0; k--) {
            const p = mistura(borda, A, Math.max(0, v - k * 0.05));
            f.q(p.x, p.y, k ? '#58a6ff' : CREME, k ? 2 : 4);
          }
          if (τ < H + 0.08) f.cintila(borda.x, borda.y, 3, '#9cd0fa');
        }
        if (τ >= H + 0.3 && τ < H + 0.45) f.cintila(A.x, A.y, 3, '#9cd0fa');
        // revertido: o carimbo de rebobinar (◀◀, o ícone de sempre) sobre quem bateu
        if (temContra && τ >= H + 0.3 && τ < H + 0.95 && Math.floor((τ - H) * 6) % 3 !== 2) {
          f.sprite(REBOBINAR, A.x, A.y - 11 * P, { '#': CREME }, { contorno: '#0a66c2', escala: P >= 4 ? 2 : 1 });
        }
      },
    };
  },

  // Hot take: salto alto com asas de brasa e mergulho em diagonal; acertou, o Café dele aviva (o bônus).
  'hot-take'(s) {
    const alvo = s.rivais[0];
    const BRASA = ['#fff3b0', '#fdba74', '#f0883e', '#c2410c'];
    const alcance = () => (alvo ? Math.max(0, Math.abs(alvo.x - s.eu.x) - 8 * s.P) : 0);
    const pose = τ => {
      if (τ < 0 || τ > s.hit + 0.6) return null;
      const P = s.P, d = s.dir, A = alcance();
      if (τ < 0.3) {
        const v = τ / 0.3;
        return { dx: d * 0.55 * A * saidaCubica(v), dy: -20 * P * Math.sin(v * Math.PI / 2), cinzel: -1.2, maco: -1.6, asas: 'rapidas' };
      }
      if (τ < s.hit) {
        const v = ((τ - 0.3) / (s.hit - 0.3)) ** 2;
        return { dx: d * A * misturar(0.55, 1, v), dy: -misturar(20, 3, v) * P, cinzel: 0.9, maco: -0.4, asas: 'rapidas' };
      }
      const v = (τ - s.hit) / 0.6;
      return { dx: d * A * (1 - ease(v)), dy: -3 * P * (1 - v) - 9 * P * Math.sin(Math.PI * v), cinzel: τ < s.hit + 0.15 ? 0.9 : -0.4, asas: 'batendo' };
    };
    const corpoEm = τ => { const p = pose(τ) ?? {}; return { x: s.eu.x + (p.dx ?? 0), y: s.eu.y + (p.dy ?? 0) - 8 * s.P }; };
    const rastro = Array.from({ length: 24 }, (_, k) => ({ k, vx: (s.rng() - 0.5) * 40, fase: s.rng() * TAU }));
    const estouro = Array.from({ length: 14 }, (_, k) => ({ a: k * TAU / 14 + s.rng() * 0.3, v: 40 + s.rng() * 60 }));
    let avivou = false;
    return {
      eu: pose,
      passo(dt, τ) { if (!avivou && τ >= s.hit && alvo?.n > 0) { avivou = true; s.avivar(); } },
      atras(f, τ) {
        if (τ < 0.12 || τ > s.hit + 0.12) return;
        const P = s.P, c = s.corpo(), bate = 0.12 * Math.sin(τ * 26);
        f.alfa(τ < 0.16 ? 0.5 : τ > s.hit ? 0.5 : 1);
        // as asas de brasa: seis penas por camada, traços cheios saindo das costas, com a ponta acesa
        const ox = c.x - s.dir * 3 * P, oy = c.y - 4 * P;
        for (const [camada, cor, ponta] of [[0, '#c2410c', '#f0883e'], [1, '#fdba74', '#fff3b0']]) {
          for (let i = 0; i < 6; i++) {
            const ang = -Math.PI / 2 - s.dir * (0.2 + 0.26 * i + camada * 0.12) + bate * s.dir;
            const L = (17 - 1.4 * i) * P * (camada ? 1 : 0.9), cos = Math.cos(ang), sen = Math.sin(ang);
            const meio = L - 3 * f.u;
            f.linha(ox + cos * 2 * P, oy + sen * 2 * P, ox + cos * meio, oy + sen * meio, cor, { lado: camada ? 1 : 2 });
            f.linha(ox + cos * meio, oy + sen * meio, ox + cos * L, oy + sen * L, ponta, { lado: camada ? 1 : 2 });
          }
        }
        f.alfa(1);
        if (τ >= 0.3 && τ < s.hit) {
          const topo = corpoEm(0.3);
          f.linha(topo.x, topo.y, c.x, c.y, '#fed7aa', { passo: 3 });
        }
      },
      frente(f, τ) {
        const P = s.P;
        // brasas que caem do mergulho
        for (const b of rastro) {
          const nasce = 0.3 + (s.hit - 0.3) * b.k / 24, v = τ - nasce;
          if (v < 0 || v > 0.4) continue;
          const o = corpoEm(nasce);
          f.q(o.x + b.vx * v, o.y + 4 * P + 200 * v * v, BRASA[Math.min(3, Math.floor(v / 0.1))], v < 0.15 ? 2 : 1);
        }
        // ecos em V atrás dele
        if (τ >= 0.05 && τ < s.hit + 0.1) {
          for (let k = 1; k <= 5; k++) {
            const p = corpoEm(τ - 0.035 * k), q = corpoEm(τ - 0.035 * k - 0.02);
            let vx = p.x - q.x, vy = p.y - q.y;
            const n = Math.hypot(vx, vy);
            if (n < 0.5) continue;
            vx /= n; vy /= n;
            f.alfa(1 - k / 6);
            const cor = k % 2 ? CREME : '#fdba74';
            for (const lado of [-1, 1]) f.linha(p.x, p.y, p.x - vx * 3 * P + vy * lado * 3 * P, p.y - vy * 3 * P - vx * lado * 3 * P, cor);
          }
          f.alfa(1);
        }
        const w = τ - s.hit;
        if (w < 0 || w > 0.45 || !alvo) return;
        const c = s.corpoDe(alvo);
        for (const e of estouro) {
          const d = e.v * w * P / 5;
          f.q(c.x - s.dir * 3 * P + Math.cos(e.a) * d, c.y + Math.sin(e.a) * d + 150 * w * w, BRASA[Math.min(3, Math.floor(w / 0.12))], w < 0.15 ? 2 : 1);
        }
        if (alvo.n > 0 && w < 0.3) {
          const me = s.corpo(), r = (6 + 30 * w) * P;
          f.elipse(me.x, me.y, r, r * 0.8, '#fdba74', { passo: 2 });
        }
      },
    };
  },

  // Recomendação escrita: uma cúpula de aprovações (vistos, "+1", pontos) gira por cima; o golpe escorrega pela borda,
  // o visto grande acende no alto e o bloqueio cura.
  endosso(s) {
    const H = s.hit;
    const COR = { cupula: '#bdf5e8', visto: CREME, mais: '#7ee2c8', ponto: '#2fc4b2', verde: '#3fb950' };
    const ANEIS = [{ r: 18, vel: 0.35, marca: 'visto' }, { r: 14.5, vel: -0.45, marca: 'mais' }, { r: 11, vel: 0.55, marca: 'ponto' }];
    const curas = Array.from({ length: 5 }, (_, k) => ({ dx: (s.rng() - 0.5) * 16, atraso: k * 0.03, alto: 8 + s.rng() * 8 }));
    const escala = τ => (τ < 0 ? 0 : τ < 0.2 ? saidaCubica(τ / 0.2) : τ < H + 0.3 ? 1 : 1 - entre(τ, H + 0.3, H + 0.45));
    return {
      eu: τ => (τ >= 0 && τ < H + 0.45 ? { maco: -1.3, cinzel: -0.6 } : null),
      atras(f, τ) {
        const e = escala(τ);
        if (e <= 0) return;
        const pe = s.pe(), R = 18 * s.P * e, flash = s.recebendo && τ >= H && τ < H + 0.12;
        const dentro = (x, y) => (x - pe.x) ** 2 + (y - pe.y) ** 2 <= R * R;
        f.alfa(flash ? 0.32 : 0.14);
        f.regiao(pe.x - R, pe.y - R, pe.x + R, pe.y, flash ? CREME : COR.cupula, dentro);
        f.alfa(flash ? 0.9 : 0.5);
        f.regiao(pe.x - R, pe.y - R, pe.x + R, pe.y, flash ? CREME : COR.cupula, (x, y) => (dentro(x, y) ? (flash ? 0.4 : 0.14) : 0));
        f.alfa(1);
      },
      frente(f, τ) {
        const e = escala(τ);
        const pe = s.pe(), P = s.P;
        if (e > 0) {
          f.alfa(0.75);
          f.elipse(pe.x, pe.y, 18 * P * e, 18 * P * e, CREME, { de: Math.PI, ate: TAU });
          f.alfa(0.4);
          f.elipse(pe.x, pe.y, 18 * P * e - f.u, 18 * P * e - f.u, COR.mais, { de: Math.PI, ate: TAU });
          f.alfa(1);
          for (const a of ANEIS) {
            for (let n = 0; n < 9; n++) {
              const fr = ((n / 9 + τ * a.vel) % 1 + 1) % 1;
              const ang = Math.PI + fr * Math.PI, r = a.r * P * e;
              const x = pe.x + Math.cos(ang) * r, y = pe.y + Math.sin(ang) * r;
              if (a.marca === 'visto') f.sprite(VISTO, x, y, { '#': COR.visto }, { contorno: '#0b524e' });
              else if (a.marca === 'mais') f.texto('+', x, y, COR.mais);
              else f.q(x, y, COR.ponto, 2);
            }
          }
        }
        if (!s.recebendo) return;
        const w = τ - H;
        if (w >= 0 && w < 0.35) {
          // o golpe escorrega pela cúpula do lado de quem bateu
          const R = 18 * P + f.u;
          for (let k = 0; k < 8; k++) {
            const v = ease((w - 0.03 * k) / 0.3);
            if (v <= 0) continue;
            const ang = 1.5 * Math.PI + s.dir * v * 0.5 * Math.PI - s.dir * k * 0.05;
            for (let j = 0; j < 4; j++) {
              const a = ang - s.dir * j * 0.035;
              f.q(pe.x + Math.cos(a) * R, pe.y + Math.sin(a) * R, CREME);
            }
          }
        }
        if (w >= 0 && w < 0.5) {
          f.alfa(w > 0.35 ? 0.5 : 1);
          f.sprite(VISTO_GRANDE, pe.x, pe.y - 18 * P - 4 * f.u, { '#': COR.verde }, { contorno: CREME, escala: w < 0.06 ? 3 : 2 });
          f.alfa(1);
        }
        for (const c of curas) {
          const v = (τ - H - c.atraso) / 0.4;
          if (v < 0 || v > 1) continue;
          f.alfa(v > 0.7 ? 0.5 : 1);
          f.sprite(CRUZ, pe.x + c.dx * P * 0.5, pe.y - 10 * P - c.alto * P * saidaCubica(v), { g: '#7ee787', w: CREME }, { contorno: '#0b3d1e' });
          f.alfa(1);
        }
      },
    };
  },

  // Sequência de commits: ele vira os próprios dias de contribuição. Blocos verdes do calendário surgem dos dois lados do
  // rival e batem um depois do outro; o contador da sequência acende em cima. Quantos: cresce como a carta.
  streak(s) {
    const n = repeticoes('streak', s.contagem);
    const VERDES = ['#0e4429', '#006d32', '#26a641', '#39d353'];
    // cada bloco nasce num ângulo diferente em volta do rival (ângulo áureo): batem de todos os lados
    const blocos = Array.from({ length: n }, (_, k) => ({
      surge: 0.12 + 0.5 * k / n, ang: k * 2.39996 + s.rng() * 0.4, dist: 10 + s.rng() * 4,
      cores: [0, 1, 2, 3].map(() => VERDES[1 + Math.floor(s.rng() * 3)]),
    }));
    const BATE = 0.12;
    const alvo = s.rivais[0];
    const posicao = (b, τ) => {
      const c = s.corpoDe(alvo), P = s.P;
      const ini = { x: c.x + Math.cos(b.ang) * b.dist * P, y: c.y + Math.sin(b.ang) * b.dist * P * 0.8 };
      return mistura(ini, c, ease((τ - b.surge - BATE + 0.05) / 0.05));
    };
    return {
      eu: τ => (τ >= 0.05 && τ < s.hit + 0.05 ? { opacidade: 0.25, asas: 'batendo' } : null),
      rival(i, τ) {
        if (i !== 0) return null;
        let dx = 0, branco = false;
        for (const b of blocos) {
          const w = τ - b.surge - BATE;
          if (w < 0 || w >= 0.08) continue;
          dx += -Math.sign(Math.cos(b.ang)) * s.P * (1 - w / 0.08);
          if (w < 0.04) branco = true;
        }
        return dx || branco ? { dx, ...(branco ? { tom: 'luz' } : {}) } : null;
      },
      atras(f, τ) {
        if (!alvo) return;
        const me = s.corpo();
        for (const b of blocos) {
          const w = τ - b.surge;
          if (w < 0 || w > 0.1) continue;
          const p = posicao(b, τ);
          f.linha(me.x, me.y, p.x, p.y, VERDES[2], { passo: 2 });
        }
      },
      frente(f, τ) {
        if (!alvo) return;
        const P = s.P, c = s.corpoDe(alvo), escala = P >= 5 ? 3 : 2;
        let acesos = 0;
        for (const b of blocos) {
          const w = τ - b.surge;
          if (w >= BATE) acesos++;
          if (w < 0 || w > BATE + 0.2) continue;
          if (w < BATE) {
            const p = posicao(b, τ);
            f.alfa(w < 0.05 ? 0.4 : 1);
            const [a, bb, cc, d] = b.cores;
            f.sprite(['aa.bb', 'aa.bb', '.....', 'cc.dd', 'cc.dd'], p.x, p.y, { a, b: bb, c: cc, d }, { escala, contorno: ESCURO });
            f.alfa(1);
          } else {
            const q = w - BATE;
            for (let k = 0; k < 8; k++) {
              const ang = k * TAU / 8 + b.ang, d = (3 + 50 * q) * P / 2;
              f.q(c.x + Math.cos(ang) * d, c.y + Math.sin(ang) * d, VERDES[3 - (k % 2)], 2);
            }
          }
        }
        // o contador da sequência: um dia de contribuição aceso a cada bloco que bate; completo, pega fogo
        if (τ < 0.1 || τ > s.hit + 0.4) return;
        const u = f.u, passo = 4 * u, x0 = c.x - ((n - 1) * passo) / 2, y = c.y - 16 * P;
        for (let k = 0; k < n; k++) {
          const x = x0 + k * passo;
          f.q(x, y, k < acesos ? VERDES[1 + Math.min(2, Math.floor(k * 3 / n))] : '#30363d', 3);
          if (k >= acesos) f.q(x, y, '#161b22');
          else f.q(x - u, y - u, VERDES[3]);
        }
        if (acesos >= n) {
          f.sprite(FOGO, x0 + n * passo, y - u, { o: '#f0883e', y: '#fcd34d', h: CREME }, { contorno: ESCURO, escala: P >= 4 ? 2 : 1 });
        }
      },
    };
  },

  // Code owner: salta até o rival e varre três garras de luz, cada uma saindo de uma arroba; os pings da menção estalam.
  mencao(s) {
    const alvo = s.rivais[0];
    const alcance = () => (alvo ? Math.max(0, Math.abs(alvo.x - s.eu.x) - 10 * s.P) : 0);
    const COR = { roxo: '#8957e5', lilas: '#d2a8ff' };
    return {
      eu(τ) {
        if (τ < 0 || τ > s.hit + 0.7) return null;
        const P = s.P, d = s.dir, A = alcance();
        if (τ < 0.3) return { dx: d * A * ease(τ / 0.3), dy: -8 * P * Math.sin(Math.PI * τ / 0.3), cinzel: -1.3, asas: 'rapidas' };
        if (τ < s.hit + 0.1) return { dx: d * A, cinzel: misturar(-1.3, 0.9, entre(τ, 0.3, 0.42)), maco: -1, asas: 'batendo' };
        const v = (τ - s.hit - 0.1) / 0.6;
        return { dx: d * A * (1 - ease(v)), dy: -3 * P * Math.sin(Math.PI * limitar(v, 0, 1)) };
      },
      frente(f, τ) {
        if (!alvo) return;
        const P = s.P, c = s.corpoDe(alvo), d = s.dir;
        for (let k = -1; k <= 1; k++) {
          const ini = 0.36 + 0.03 * (k + 1);
          if (τ < ini || τ > 0.82) continue;
          const v = entre(τ, ini, ini + 0.06);
          const a = { x: c.x - d * 8 * P + k * 3.5 * P, y: c.y - 12 * P + k * P };
          const b = { x: c.x + d * 6 * P + k * 3.5 * P, y: c.y + 9 * P + k * P };
          const fim = mistura(a, b, v);
          f.alfa(τ > 0.62 ? 1 - entre(τ, 0.62, 0.82) : 1);
          f.linha(a.x, a.y, fim.x, fim.y, COR.roxo, { lado: 3 });
          f.linha(a.x, a.y, fim.x, fim.y, CREME);
          f.sprite(ARROBA, a.x, a.y - 2 * f.u, { '#': CREME }, { contorno: COR.roxo });
          f.alfa(1);
        }
        // os pings: anéis que estalam e faíscas re-sorteadas a cada 0,05 s
        if (τ < 0.45 || τ > 0.82) return;
        for (let k = 0; k < 3; k++) {
          const w = τ - 0.45 - k * 0.1;
          if (w < 0 || w > 0.18) continue;
          const r = (2 + 60 * w) * P;
          f.elipse(c.x, c.y, r, r, k % 2 ? COR.lilas : CREME, { passo: 2 });
        }
        const vez = Math.floor(s.t / 0.05);
        for (let k = 0; k < 4; k++) {
          const ang = s.ruido(vez, k) * TAU, d1 = (2 + s.ruido(vez, k, 1) * 6) * P;
          f.linha(c.x, c.y, c.x + Math.cos(ang) * d1, c.y + Math.sin(ang) * d1, k % 2 ? COR.lilas : CREME);
        }
      },
    };
  },

  // Thread polêmica: a sirene gira sobre ele, desce até o punho e solta uma onda de alertas vermelhos que explode no
  // rival; o preço é ficar de joelho.
  'deploy-sexta'(s) {
    const H = s.hit;
    const ALERTAS = [TRIANGULO, CIRCULO_X];
    const onda = Array.from({ length: 70 }, (_, k) => ({
      atraso: k * 0.0025, lado: (s.rng() - 0.5) * 2, tipo: k % 3, fase: s.rng(),
    }));
    const destrocos = Array.from({ length: 48 }, () => ({
      a: s.rng() * TAU, v: 60 + s.rng() * 160, cor: ['#ef4444', '#fb923c', CREME][Math.floor(s.rng() * 3)], grande: s.rng() < 0.3,
    }));
    const sirene = τ => {
      const pe = s.pe(), P = s.P;
      const alto = { x: s.eu.x, y: s.eu.y - 30 * P }, punho = { x: pe.x + s.dir * 8 * P, y: pe.y - 8 * P };
      const v = ease(entre(τ, 0.55, 0.75));
      return { ...mistura(alto, punho, v), raio: misturar(19 * P * saidaCubica(Math.min(1, τ / 0.4)), 7 * P, v), giro: τ < 0.55 ? τ * 5 : 0.55 * 5 + (τ - 0.55) * 9 };
    };
    return {
      eu(τ) {
        if (τ < 0 || τ > H + 0.8) return null;
        const P = s.P;
        if (τ < 0.55) return { maco: -1.57, cinzel: -1.5, dy: -P, asas: 'batendo' };
        if (τ < H + 0.15) return { maco: 0.1, cinzel: 0, asas: 'batendo' };
        return { sentado: true, dx: -s.dir * 2 * P };
      },
      voo: { empurrao: 22 },
      atras(f, τ) {
        if (τ < 0 || τ > 0.75) return;
        const g = sirene(τ), P = s.P;
        // o brilho em volta e dois fachos girando, abrindo em cone como luz de sirene
        f.alfa(0.3);
        f.disco(g.x, g.y, 5 * P, '#ef4444');
        for (const [cor, alfa, abre, cheio] of [['#fb923c', 0.45, 0.26, 0.5], ['#ef4444', 0.75, 0.14, 1]]) {
          f.alfa(alfa);
          for (const lado of [0, Math.PI]) {
            const a0 = g.giro + lado;
            f.regiao(g.x - g.raio, g.y - g.raio, g.x + g.raio, g.y + g.raio, cor, (x, y) => {
              const dx = x - g.x, dy = y - g.y, r = Math.hypot(dx, dy);
              if (r > g.raio || r < 2 * P) return 0;
              const d = Math.atan2(dy, dx) - a0, dd = Math.atan2(Math.sin(d), Math.cos(d));
              return Math.abs(dd) < abre * (0.5 + 0.5 * r / g.raio) ? cheio : 0;
            });
          }
        }
        f.alfa(1);
        f.sprite(SIRENE, g.x, g.y, { r: '#ef4444', h: '#fecaca', k: '#1f2937', m: '#4b5563' }, { escala: P >= 4 ? 2 : 1, contorno: ESCURO });
      },
      frente(f, τ) {
        const P = s.P, alvo = s.rivais[0];
        if (!alvo) return;
        const c = s.corpoDe(alvo);
        if (τ >= 0.75 && τ < H) {
          const punho = s.punho(), vMax = entre(τ, 0.75, H);
          for (const a of onda) {
            const v = limitar(vMax - a.atraso * 4, 0, 1);
            if (v <= 0) continue;
            const p = mistura(punho, c, v), abre = (2 + 12 * v) * P * a.lado;
            const x = p.x, y = p.y + abre;
            if (a.tipo === 2) f.texto('!', x, y, '#fb923c', { contorno: ESCURO });
            else f.sprite(ALERTAS[a.tipo], x, y, { r: '#ef4444', w: CREME }, { contorno: ESCURO });
          }
          const ponta = mistura(punho, c, vMax);
          f.disco(ponta.x, ponta.y, 3 * P, CREME);
        }
        const w = τ - H;
        if (w < 0 || w > 0.7) return;
        if (w < 0.1) f.disco(c.x, c.y, 16 * P, CREME);
        for (const [vel, cor] of [[50, CREME], [38, '#fb923c'], [26, '#ef4444']]) {
          const r = vel * w * P;
          f.alfa(1 - w / 0.7);
          f.elipse(c.x, c.y, r, r, cor, { lado: 2 });
        }
        f.alfa(1);
        for (const d of destrocos) {
          const dist = d.v * w * P / 5;
          f.q(c.x + Math.cos(d.a) * dist, c.y + Math.sin(d.a) * dist + 300 * w * w, d.cor, d.grande ? 2 : 1);
        }
      },
    };
  },

  // Post de aprendizados: a ponta do dedo cintila e cada picada crava um commit no rival; os commits se ligam no grafo do
  // golpe (o HEAD por último, branco, piscando). Quantas picadas: cresce como a carta.
  'commits-atomicos'(s) {
    const { nos, ramos } = ESPECIAIS['commits-atomicos'].grafo;
    const n = repeticoes('commits-atomicos', s.contagem), N = nos.length;
    const desvio = (N - (n % N)) % N;
    const vezes = new Array(N).fill(0);
    const agulhas = Array.from({ length: n }, (_, k) => {
      const no = (k + desvio) % N, volta = vezes[no]++;
      return { no, volta, parte: 0.1 + 0.55 * k / n, ultima: k === n - 1 };
    });
    const alvo = s.rivais[0];
    // o ponto do commit no corpo do rival (caixa 14P × 16P, espelhada pelo lado), girando junto com ele
    const ponto = a => {
      const P = s.P, c = s.corpoDe(alvo), [x0, y0] = nos[a.no];
      const x = (s.dir < 0 ? x0 : 1 - x0) + a.volta * 0.06, y = y0 + a.volta * 0.06;
      let dx = (x - 0.5) * 14 * P, dy = (y - 0.5) * 16 * P;
      const giro = Math.round((alvo.pose.giro ?? 0) / 90) & 3;
      for (let g = 0; g < giro; g++) [dx, dy] = [-dy, dx];
      return { x: c.x + dx, y: c.y + dy };
    };
    const dedo = () => { const pe = s.pe(); return { x: pe.x + s.dir * 9 * s.P, y: pe.y - 7 * s.P }; };
    return {
      eu: τ => (τ >= 0 && τ < s.hit ? { dx: (Math.floor(τ * 40) % 2 ? 1 : -1) * s.P * 0.5, cinzel: -0.2, maco: -0.6 } : null),
      rival(i, τ) {
        if (i !== 0) return null;
        for (const a of agulhas) { const w = τ - a.parte - 0.1; if (w >= 0 && w < 0.05) return { dx: (Math.floor(w * 80) % 2 ? 0.6 : -0.6) * s.P }; }
        return null;
      },
      frente(f, τ) {
        if (!alvo || τ < 0) return;
        const P = s.P, w = τ - s.hit;
        if (w > 0.35) return;
        if (τ < s.hit) f.cintila(dedo().x, dedo().y, Math.floor(s.t * 20) % 2 ? 3 : 2, '#56d4dd');
        f.alfa(w > 0.15 ? 1 - (w - 0.15) / 0.2 : 1);
        const cravados = new Set();
        for (const a of agulhas) {
          const v = (τ - a.parte) / 0.1;
          if (v < 0) continue;
          const fim = ponto(a);
          if (v < 1) {
            const o = dedo(), p = mistura(o, fim, v), q = mistura(o, fim, Math.max(0, v - 0.35));
            f.linha(q.x, q.y, p.x, p.y, '#1f6feb');
            f.linha(mistura(o, fim, Math.max(0, v - 0.15)).x, mistura(o, fim, Math.max(0, v - 0.15)).y, p.x, p.y, '#79c0ff');
            f.q(p.x, p.y, CREME, 2);
          } else if (!alvo.segurou) cravados.add(a);
          else if (v < 1.5) f.cintila(fim.x - s.dir * 4 * P, fim.y, 1, '#79c0ff');
        }
        if (alvo.n > 0) {
          const nosCravados = new Map([...cravados].map(a => [a.no, a]));
          for (const [i, j] of ramos) {
            if (!nosCravados.has(i) || !nosCravados.has(j)) continue;
            const a = ponto(nosCravados.get(i)), b = ponto(nosCravados.get(j));
            f.linha(a.x, a.y, b.x, b.y, '#58a6ff');
          }
        }
        for (const a of cravados) {
          const p = ponto(a);
          if (a.ultima) {
            if (Math.floor(s.t * 8) % 2 === 0) f.sprite(['.www.', 'wwwww', 'wwwww', 'wwwww', '.www.'], p.x, p.y, { w: CREME }, { contorno: '#1f6feb' });
            else f.cintila(p.x, p.y, 2, '#79c0ff');
          } else f.sprite(['.b.', 'bwb', '.b.'], p.x, p.y, { b: '#58a6ff', w: CREME }, { contorno: '#0d2a4a' });
        }
        f.alfa(1);
      },
    };
  },

  // Proposta de emprego: sentado de olhos fechados, com o leque de propostas aberto atrás e moedas em órbita, ele puxa
  // o brilho do rival (o alcance roubado voa da cabeça dele em luzinhas) e abre os olhos.
  headhunter(s) {
    const H = s.hit;
    const roubo = Math.round(3 * s.roubado);
    const luzes = Array.from({ length: roubo }, (_, k) => ({ parte: H - 0.35 + 0.05 * k, lado: (s.rng() - 0.5) * 6 }));
    // o leque de propostas: cartas de papel com borda, a faixa azul no alto, as linhas do texto e o selo dourado
    const leque = (f, τ, interno) => {
      const abre = saidaCubica(limitar(τ / 0.35, 0, 1));
      if (abre <= 0) return;
      const pe = s.pe(), P = s.P, u = f.u, n = interno ? 7 : 9;
      const comp = (interno ? 15 : 20) * P, larg = (interno ? 3.6 : 4.6) * P;
      const base = { x: pe.x, y: pe.y - P };
      for (let i = 0; i < n; i++) {
        const ang = -Math.PI / 2 + (i / (n - 1) - 0.5) * 2 * (Math.PI / 2.2) * abre;
        const ux = Math.cos(ang), uy = Math.sin(ang), vx = -uy, vy = ux;
        const ponto = (a, b) => ({ x: base.x + ux * a + vx * b, y: base.y + uy * a + vy * b });
        const carta = (a0, a1, b) => [ponto(a0, -b), ponto(a1, -b), ponto(a1, b), ponto(a0, b)];
        f.poligono(carta(3 * P - u, comp + u, larg / 2 + u), '#475569');
        f.poligono(carta(3 * P, comp, larg / 2), interno ? '#e2e8f0' : CREME);
        const faixa = [ponto(comp - 1.5 * u, -larg / 2 + u), ponto(comp - 1.5 * u, larg / 2 - u)];
        f.linha(faixa[0].x, faixa[0].y, faixa[1].x, faixa[1].y, '#0a66c2', { lado: 2 });
        for (const a of [0.52, 0.64, 0.76]) {
          const l0 = ponto(comp * a, -larg / 2 + 1.5 * u), l1 = ponto(comp * a, larg / 2 - (a > 0.7 ? 3 : 1.5) * u);
          f.linha(l0.x, l0.y, l1.x, l1.y, '#94a3b8');
        }
        if (!interno) { const selo = ponto(comp * 0.34, 0); f.q(selo.x, selo.y, '#fbbf24', 2); }
      }
    };
    const moedas = (f, τ, frente) => {
      if (τ < 0 || τ > H + 0.45) return;
      const pe = s.pe(), P = s.P;
      for (let k = 0; k < 12; k++) {
        const a = τ * 1.6 + k * TAU / 12;
        if ((Math.sin(a) >= 0) !== frente) continue;
        f.sprite(MOEDA, pe.x + Math.cos(a) * 18 * P, pe.y - 8 * P + Math.sin(a) * 6 * P, { y: '#fbbf24', h: '#fffbe6' }, { contorno: frente ? '#7a5208' : null });
      }
    };
    return {
      eu: τ => (τ >= 0 && τ < H + 0.45 ? { sentado: true, dormindo: τ < H - 0.05, asas: 'fechadas' } : null),
      rival(i, τ) {
        if (i !== 0 || !roubo || τ < H - 0.35 || τ > H + 0.3) return null;
        return { opacidade: Math.floor(τ * 28) % 2 ? 0.45 : 0.7 };
      },
      atras(f, τ) {
        if (τ < 0 || τ > H + 0.45) return;
        const pe = s.pe(), P = s.P;
        f.alfa(0.5);
        f.elipse(pe.x, pe.y - 12 * P, 10 * P, 10 * P, '#fde68a');
        f.elipse(pe.x, pe.y - 12 * P, 11 * P, 11 * P, '#fbbf24', { passo: 2 });
        f.alfa(τ > H + 0.3 ? 0.5 : 1);
        leque(f, τ, false);
        leque(f, τ, true);
        moedas(f, τ, false);
        f.alfa(1);
      },
      frente(f, τ) {
        moedas(f, τ, true);
        const P = s.P, me = s.corpo(), r = s.rivais[0];
        if (r) {
          for (const l of luzes) {
            const v = (τ - l.parte) / 0.25;
            if (v < 0 || v > 1) continue;
            const ini = { x: r.x + (r.pose.dx ?? 0) + l.lado * P * 0.5, y: r.y + (r.pose.dy ?? 0) - 19 * P };
            const fim = { x: me.x, y: me.y - 2 * P };
            for (let k = 3; k >= 0; k--) {
              const p = bezier(ini, { x: (ini.x + fim.x) / 2, y: Math.min(ini.y, fim.y) - 10 * P }, fim, Math.max(0, ease(v) - k * 0.05));
              f.q(p.x, p.y, k ? '#fbbf24' : CREME, k ? 1 : 2);
            }
          }
        }
        const w = τ - H;
        if (w >= 0 && w < 0.3) {
          const olho = { x: me.x, y: me.y - 4 * P };
          f.elipse(olho.x, olho.y, 60 * w * P, 60 * w * P, '#fde68a', { passo: 2 });
          f.elipse(olho.x, olho.y, 44 * w * P, 44 * w * P, CREME);
        }
      },
    };
  },

  // Hotfix em produção: um terminal abre atrás dele às 03:00 com logs correndo e raios dentro; agachado, ele solta uma
  // tempestade de raios no rival e paga o preço de joelho.
  hotfix(s) {
    const H = s.hit;
    const linhas = Array.from({ length: 12 }, () => ({ largura: 0.3 + s.rng() * 0.6, erro: s.rng() < 0.2 }));
    const terminal = () => { const pe = s.pe(); return { x: s.eu.x - s.dir * 13 * s.P, y: pe.y - 17 * s.P }; };
    const raio = (f, a, b, vez, i, cores) => {
      // zigue-zague re-sorteado a cada 0,05 s: passos de 2–5P com desvio de ±3P
      const P = s.P, dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
      let antes = a, feito = 0, k = 0;
      while (feito < len) {
        feito = Math.min(len, feito + (2 + s.ruido(vez, i, k) * 3) * P);
        const lado = feito >= len ? 0 : (s.ruido(vez, i, k, 7) - 0.5) * 6 * P;
        const p = { x: a.x + dx * feito / len - dy / len * lado, y: a.y + dy * feito / len + dx / len * lado };
        f.linha(antes.x, antes.y + f.u, p.x, p.y + f.u, cores[0]);
        f.linha(antes.x, antes.y, p.x, p.y, cores[1]);
        antes = p;
        k++;
      }
    };
    return {
      eu(τ) {
        if (τ < 0 || τ > H + 0.75) return null;
        const P = s.P;
        if (τ < 0.3) return { dy: P, cinzel: -0.3, maco: -2.4 };
        if (τ < H) { const a = Math.floor(τ * 30) % 2; return { dx: s.dir * P * a, cinzel: a ? 0.15 : -0.1, maco: a ? -0.75 : 0.15, asas: 'batendo' }; }
        if (τ < H + 0.15) return { cinzel: 0.15, maco: 0.15 };
        return { sentado: true };
      },
      rival: (i, τ) => (τ > 0.35 && τ < H && Math.floor(τ * 20) % 3 === 0 ? { tom: 'luz' } : null),
      atras(f, τ) {
        if (τ < 0.05 || τ > H + 0.6) return;
        const P = s.P, T = terminal(), u = f.u;
        const esc = τ < 0.1 ? 0.4 : τ < 0.15 ? 0.7 : 1;
        const L = 22 * P * esc, A = 14 * P * esc, x0 = T.x - L / 2, y0 = T.y - A / 2;
        f.alfa(τ > H + 0.45 ? 0.5 : 1);
        f.regiao(x0 - u, y0 - u, x0 + L + u, y0 + A + u, '#30363d', () => 1);
        f.regiao(x0, y0 + 3 * u, x0 + L, y0 + A, '#0d1117', () => 1);
        ['#f85149', '#d29922', '#3fb950'].forEach((cor, k) => f.q(x0 + (2 + 2 * k) * u, y0 + 1.5 * u, cor));
        if (esc === 1) {
          f.texto('03:00', x0 + L - 10 * u, y0 + 1.6 * u, Math.floor(s.t * 3) % 2 ? '#f85149' : '#ffa198');
          // os logs sobem: uma linha nova a cada 0,06 s
          const desce = Math.floor(s.t / 0.06), cabem = Math.floor((A - 5 * u) / (2 * u));
          for (let j = 0; j < cabem; j++) {
            const l = linhas[(desce + j) % linhas.length];
            const y = y0 + 4.5 * u + j * 2 * u;
            f.linha(x0 + 2 * u, y, x0 + 2 * u + (L - 4 * u) * l.largura, y, l.erro ? '#f85149' : '#3fb950');
          }
          if (Math.floor(s.t * 4) % 2) f.q(x0 + 2 * u, y0 + 4.5 * u + cabem * 2 * u, CREME);
          // raios dentro do terminal
          if (τ > 0.3 && τ < H) raio(f, { x: x0 + L * 0.3, y: y0 + 3 * u }, { x: x0 + L * 0.6, y: y0 + A - u }, Math.floor(s.t / 0.05), 99, ['#f59e0b', '#fff7c2']);
        }
        f.alfa(1);
      },
      frente(f, τ) {
        const alvo = s.rivais[0];
        if (!alvo || τ < 0.3) return;
        const P = s.P, punho = s.punho(), c = s.corpoDe(alvo), vez = Math.floor(s.t / 0.05);
        if (τ < H) f.cintila(punho.x, punho.y, Math.floor(s.t * 30) % 2 ? 2 : 3, '#fde047');
        for (let i = 0; i < 36; i++) {
          const parte = 0.3 + 0.46 * i / 36, v = τ - parte;
          if (v < 0 || v > 0.14) continue;
          const alvoX = c.x + (s.ruido(i, 1) - 0.5) * 9 * P, alvoY = c.y + (s.ruido(i, 2) - 0.5) * 10 * P;
          const longe = 1 + s.ruido(i, 3) * 0.4;
          const a = { x: punho.x + (s.ruido(i, 4) - 0.5) * 2 * P, y: punho.y + (s.ruido(i, 5) - 0.5) * 4 * P };
          f.alfa(1 - v / 0.14);
          raio(f, a, { x: a.x + (alvoX - a.x) * longe, y: a.y + (alvoY - a.y) * longe }, vez, i, ['#f59e0b', '#fff7c2']);
        }
        f.alfa(1);
      },
    };
  },

  // Force push: braço erguido, a lâmina de luz corre rente ao chão e atravessa tudo — a guarda vira estilhaço e o rival
  // é cortado na diagonal; a lâmina segue além dele e deixa o corte na areia.
  'push-force'(s) {
    const H = s.hit;
    const COR = ['#8a3a6e', '#d8a4e8', '#fdf4ff'];
    const areia = Array.from({ length: 30 }, () => ({ parte: 0.33 + s.rng() * (H - 0.33), vx: -20 - s.rng() * 60, vy: -40 - s.rng() * 80 }));
    const estilhacos = Array.from({ length: 14 }, () => ({ a: (s.rng() - 0.5) * 1.2, v: 80 + s.rng() * 120, cor: s.rng() < 0.5 ? '#c3cbd1' : CREME }));
    const alvo = s.rivais[0];
    const xDaLamina = τ => {
      const P = s.P, ini = s.eu.x + s.dir * 8 * P, fim = alvo ? alvo.x : ini + s.dir * 40 * P;
      if (τ <= H) return misturar(ini, fim, ease(entre(τ, 0.33, H)));
      return fim + s.dir * 30 * P * saidaCubica(entre(τ, H, H + 0.3));
    };
    // a lâmina crescente: cinco colunas, escura atrás, branca no miolo e lilás no fio da frente
    const COLUNAS = [COR[0], COR[1], COR[2], COR[2], COR[1]];
    const lamina = (f, x, chao, alto) => {
      const P = s.P;
      COLUNAS.forEach((cor, col) => {
        for (let h = 0; h < alto; h += f.u) {
          const curva = Math.sin(Math.PI * h / alto) * 4 * P;
          f.q(x + s.dir * (curva + (col - 2) * f.u), chao - h, cor);
        }
      });
    };
    return {
      eu(τ) {
        if (τ < 0 || τ > H + 0.5) return null;
        if (τ < 0.3) return { cinzel: -1.45, maco: -1.2, asas: 'batendo' };
        return { cinzel: misturar(-1.45, 0.8, entre(τ, 0.3, 0.36)), maco: -1.2 };
      },
      rival: (i, τ) => (i === 0 && τ >= H && τ < H + 0.05 ? { tom: 'luz' } : null),
      atraso: () => 0.2,
      atras(f, τ) {
        if (τ < 0.33 || τ > H + 1.1) return;
        const chao = s.eu.y, ini = s.eu.x + s.dir * 8 * s.P, x = xDaLamina(Math.min(τ, H + 0.3));
        const quente = τ < H + 0.35;
        f.alfa(τ > H + 0.7 ? 1 - (τ - H - 0.7) / 0.4 : 1);
        f.linha(ini, chao, x, chao, quente ? '#fdf4ff' : '#5b4a39', { lado: 1 });
        if (quente) f.linha(ini, chao - f.u, x, chao - f.u, '#d8a4e8', { passo: 2 });
        f.alfa(1);
      },
      frente(f, τ) {
        const P = s.P, pe = s.pe();
        if (τ >= 0.06 && τ < 0.32) {
          const brilho = { x: pe.x + s.dir * 1.5 * P, y: pe.y - 17 * P };
          f.cintila(brilho.x, brilho.y, 1 + Math.floor(entre(τ, 0.06, 0.32) * 3), COR[1]);
        }
        if (τ >= 0.33 && τ < H + 0.3) {
          const alto = 18 * P * (τ > H ? 1 - entre(τ, H, H + 0.3) * 0.8 : 1);
          [[0.05, 0.4], [0.025, 0.7], [0, 1]].forEach(([atras, alfa]) => {
            f.alfa(alfa);
            lamina(f, xDaLamina(τ - atras), s.eu.y, alto);
          });
          f.alfa(1);
          for (const g of areia) {
            const v = τ - g.parte;
            if (v < 0 || v > 0.35) continue;
            f.q(xDaLamina(g.parte) - s.dir * g.vx * v * -1, s.eu.y + g.vy * v + 200 * v * v, v < 0.15 ? '#e8d6b0' : '#c9b086', 1);
          }
        }
        const w = τ - H;
        if (!alvo || w < 0 || w > 0.5) return;
        if (w < 0.22) {
          const a = { x: alvo.x - s.dir * 10 * P, y: alvo.y - 22 * P }, b = { x: alvo.x + s.dir * 10 * P, y: alvo.y + P };
          f.linha(a.x, a.y, b.x, b.y, COR[1], { lado: 3 });
          f.linha(a.x, a.y, b.x, b.y, CREME);
          if (w < 0.1) f.cintila(alvo.x, alvo.y - 10 * P, 3, COR[1]);
        }
        if (alvo.guarda || alvo.segurou) {
          // a guarda vira estilhaço e voa no sentido da lâmina: o force push passa por cima de qualquer defesa
          for (const e of estilhacos) {
            const d = e.v * w * P / 5;
            const x = alvo.x - s.dir * 4 * P + s.dir * Math.cos(e.a) * d, y = alvo.y - 8 * P + Math.sin(e.a) * d + 120 * w * w;
            f.q(x, y, '#2e3236', 3);
            f.q(x, y, e.cor, 2);
          }
        }
      },
    };
  },

  // Changes requested: sobe uma parede de checks pendentes; o golpe bate, os checks viram "mudanças pedidas" (✗) e um
  // feixe volta em quem bateu. Depois a parede se desfaz em cacos.
  'code-review'(s) {
    const H = s.hit;
    const temContra = s.recebendo && s.contra > 0 && !!s.rivais[0];
    const linhas = Array.from({ length: 8 }, () => 0.35 + s.rng() * 0.5);
    const cacos = Array.from({ length: 14 }, () => ({ x: s.rng(), y: s.rng(), vx: (s.rng() - 0.5) * 60, cor: ['#161b22', '#8957e5', CREME, '#30363d'][Math.floor(s.rng() * 4)] }));
    const parede = () => {
      const pe = s.pe(), P = s.P;
      return { x: pe.x + s.dir * 12 * P, chao: s.eu.y, largura: 11 * P, alto: 30 * P };
    };
    return {
      eu: τ => (τ >= 0 && τ < H + 0.5 ? { cinzel: -0.55, maco: -1 } : null),
      atraso: () => 0.25,
      perda: i => (i === 0 && temContra ? s.contra : 0),
      frente(f, τ) {
        if (τ < 0 || τ > H + 0.9) return;
        const P = s.P, u = f.u, W = parede();
        if (τ < H + 0.45) {
          const alto = W.alto * Math.min(1, Math.ceil(τ / 0.06) / 4);
          const x0 = W.x - W.largura / 2, y0 = W.chao - alto;
          const flash = s.recebendo && τ >= H && τ < H + 0.12;
          f.alfa(0.14);
          f.regiao(x0 - 2 * P, y0 - 2 * P, x0 + W.largura + 2 * P, W.chao, '#d2a8ff', () => 1);
          f.alfa(flash ? 0.8 : 0.85);
          f.regiao(x0, y0, x0 + W.largura, W.chao, flash ? CREME : '#161b22', () => 1);
          f.alfa(1);
          f.regiao(x0, y0, x0 + W.largura, y0 + 3 * u, '#8957e5', () => 1);
          ['#f85149', '#d29922', '#3fb950'].forEach((cor, k) => f.q(x0 + (1.5 + 2 * k) * u, y0 + 1.5 * u, cor));
          f.linha(x0, y0, x0, W.chao, '#d2a8ff');
          f.linha(x0 + W.largura - u, y0, x0 + W.largura - u, W.chao, '#d2a8ff');
          // as linhas de checks: pendentes (bolinha amarela piscando) e, depois do golpe, uma a uma, "mudanças pedidas"
          const cabem = Math.floor((alto - 5 * u) / (6 * u));
          for (let j = 0; j < Math.min(cabem, linhas.length); j++) {
            const y = y0 + 7 * u + j * 6 * u, x = x0 + 3.5 * u;
            const virou = s.recebendo && τ >= H + 0.03 * j;
            if (virou) f.sprite(XIS, x, y, { '#': '#f85149' }, {});
            else f.sprite(['.o.', 'ooo', '.o.'], x, y, { o: Math.floor(s.t * 4 + j) % 2 ? '#d29922' : '#9e6a03' });
            const larg = (W.largura - 9 * u) * linhas[j];
            f.linha(x + 4 * u, y - u, x + 4 * u + larg, y - u, virou ? '#c9d1d9' : '#8b949e');
            f.linha(x + 4 * u, y + u, x + 4 * u + larg * 0.6, y + u, '#484f58');
          }
          for (let k = 0; k < 6; k++) {
            if (Math.floor(s.t * 5 + k * 1.7) % 3) continue;
            f.cintila(x0 + W.largura * s.ruido(k, 1), y0 + alto * s.ruido(k, 2), 1, '#d2a8ff');
          }
        } else {
          const q = τ - H - 0.45;
          for (const c of cacos) {
            f.alfa(q > 0.3 ? 0.5 : 1);
            f.q(W.x - W.largura / 2 + c.x * W.largura + c.vx * q, W.chao - W.alto * (1 - c.y) + 400 * q * q * P / 5, c.cor, 2);
          }
          f.alfa(1);
        }
        if (!temContra) return;
        const w = τ - H - 0.02;
        if (w < 0 || w > 0.35) return;
        const de = { x: W.x, y: W.chao - 10 * P }, para = s.corpoDe(s.rivais[0]);
        const p = mistura(de, para, Math.min(1, w / 0.2));
        f.linha(de.x, de.y, p.x, p.y, '#f85149', { lado: 3 });
        f.linha(de.x, de.y, p.x, p.y, CREME);
        if (w >= 0.2) f.cintila(para.x, para.y, w < 0.27 ? 3 : 2, '#f85149');
      },
    };
  },
};

// ---------- a estrutura comum da cena (§5.6) ----------

// 80 estrelinhas da noite, sempre nos mesmos lugares (semente 11).
const ESTRELAS = (() => { const r = sorteio(11); return Array.from({ length: 80 }, () => [r(), r()]); })();
const CACHE_PO = new Map();
let sementeGlobal = 0x2f6b;

// O que o kit pedido vira no estado do ator: nome em KITS ou o próprio kit.
function spriteDe(sprite) {
  if (!sprite) return null;
  const kit = typeof sprite.kit === 'string' ? KITS[sprite.kit] ?? null : sprite.kit ?? null;
  const metal = sprite.metal === 'prata' || sprite.metal === 'ouro' ? sprite.metal : null;
  return { metal, elmo: sprite.elmo ?? kit?.crista ?? null, kit };
}

// A caixa do grafo (px CSS): acima de onde o lutador está, sem acompanhar os saltos.
function caixa(s, W) {
  const P = s.P, L = s.longa ? Math.min(52 * P, W * 0.34) : Math.min(34 * P, W * 0.26), A = 0.82 * L;
  const x = limitar(s.eu.x - s.dir * 3 * P - L / 2, 4, Math.max(4, W - 4 - L));
  const base = s.eu.y - 17 * P - (s.longa ? 2 * P : 0);
  return { x, y: base - A, L, A };
}

const curvaDaNoite = s => 0.9 * (s.t < 0.25 ? s.t / 0.25 : s.t < s.queda + 0.3 ? 1 : Math.max(0, 1 - (s.t - s.queda - 0.3) / 0.4));

// A nuvem pronta para uma caixa: os níveis, a pintura (canvas fora da tela, quando há) e os grãos que cintilam. A
// pintura tem 1 px por célula (~50 KB) e vai ampliada para a tela, sem suavização: na resolução do dispositivo eram até
// 11 MB por nuvem, e as 24 do cache (que vive no módulo) chegavam a ~190 MB que nunca saíam.
function poeiraPronta(id, L, celula) {
  const chave = `${id}|${Math.round(L)}|${celula}`;
  if (CACHE_PO.has(chave)) return CACHE_PO.get(chave);
  const largura = 2.5 * L, altura = 2.3 * 0.82 * L;
  const colunas = Math.max(4, Math.round(largura / celula)), linhas = Math.max(4, Math.round(altura / celula));
  const niveis = nuvem(id, colunas, linhas);
  const { nuvem: cor, borda } = ESPECIAIS[id].cores;
  const camadas = [null, [borda, 0.2], [cor, 0.3], [clarear(cor, 0.45), 0.46]];
  const corridas = [];
  for (let j = 0; j < linhas; j++) {
    for (let i = 0; i < colunas; i++) {
      const nivel = niveis[j * colunas + i];
      if (!nivel) continue;
      let fim = i;
      while (fim + 1 < colunas && niveis[j * colunas + fim + 1] === nivel) fim++;
      corridas.push([nivel, i, j, fim - i + 1]);
      i = fim;
    }
  }
  const tela = criarCanvas(colunas, linhas);
  if (tela) {
    const g = tela.getContext('2d');
    for (const [nivel, i, j, n] of corridas) {
      g.globalAlpha = camadas[nivel][1];
      g.fillStyle = camadas[nivel][0];
      g.fillRect(i, j, n, 1);
    }
  }
  const rng = sorteio(hashTexto(id) ^ 0x1b873593);
  const cheias = [];
  niveis.forEach((v, i) => { if (v === 3) cheias.push(i); });
  const graos = [];
  for (let g = 0; g < 30 && cheias.length; g++) {
    const i = cheias.splice(Math.floor(rng() * cheias.length), 1)[0];
    graos.push({ i: i % colunas, j: Math.floor(i / colunas), fase: rng() * TAU, branco: rng() < 0.4 });
  }
  const pronto = { colunas, linhas, celula, corridas, camadas, tela, graos, clara: camadas[3][0] };
  if (CACHE_PO.size >= 24) CACHE_PO.delete(CACHE_PO.keys().next().value);
  CACHE_PO.set(chave, pronto);
  return pronto;
}

function pintarPoeira(s, f, cx) {
  const t = s.t;
  const alfa = s.longa
    ? (curvaDaNoite(s) / 0.9) * entre(t, 0.1, 0.7)
    : 0.4 * entre(t, s.inicio - 0.3, s.inicio - 0.1) * (1 - entre(t, s.queda + 0.15, s.queda + 0.45));
  if (alfa <= 0.01) return;
  const celula = Math.max(2, Math.round(s.P * (s.longa ? 1 : 0.75)));
  const po = poeiraPronta(s.id, cx.L, celula);
  const x0 = cx.x - 0.75 * cx.L, y0 = cx.y - 0.6 * cx.A, { ctx, k } = f;
  ctx.globalAlpha = alfa;
  if (po.tela) {
    // Ampliada célula a célula, do tamanho que ela tinha em px de dispositivo (o desenhar() já desligou a suavização).
    ctx.drawImage(po.tela, Math.round(x0 * k), Math.round(y0 * k), Math.round(po.colunas * celula * k), Math.round(po.linhas * celula * k));
  } else {
    for (const [nivel, i, j, n] of po.corridas) {
      ctx.globalAlpha = alfa * po.camadas[nivel][1];
      ctx.fillStyle = po.camadas[nivel][0];
      ctx.fillRect(Math.round((x0 + i * celula) * k), Math.round((y0 + j * celula) * k), Math.round(n * celula * k), Math.round(celula * k));
    }
  }
  f.esquecer();
  // os grãos: até 30 bits nas células mais cheias, cintilando
  ctx.globalAlpha = Math.min(1, alfa * 1.4);
  for (const g of po.graos) {
    const v = Math.sin(t * 5 + g.fase);
    if (v <= 0.2) continue;
    ctx.fillStyle = g.branco ? CREME : po.clara;
    const x = Math.round((x0 + g.i * celula) * k), y = Math.round((y0 + g.j * celula) * k), lado = Math.round(celula * k);
    ctx.fillRect(x, y, lado, lado);
    if (v > 0.85) { ctx.fillRect(x - lado, y, 3 * lado, lado); ctx.fillRect(x, y - lado, lado, 3 * lado); }
  }
  f.esquecer();
  // e, na longa, uns bits soltos subindo devagar pela nuvem
  if (!s.longa) return;
  for (let b = 0; b < 10; b++) {
    const sobe = (ruido(s.semente, b, 3) + t * 0.12) % 1;
    const x = cx.x + (0.05 + 0.9 * ruido(s.semente, b, 1)) * cx.L, y = cx.y + cx.A * (1.15 - 1.3 * sobe);
    f.alfa(alfa * 0.7 * Math.sin(Math.PI * sobe));
    f.texto(ruido(s.semente, b, 2) < 0.5 ? '0' : '1', x, y, po.clara);
  }
  f.alfa(1);
}

// O grafo de commits se desenhando: cada commit aparece na sua vez e cada ramo cresce quando as duas pontas existem.
function pintarGrafo(s, f, cx) {
  const { nos, ramos } = s.especial.grafo;
  const t0 = s.longa ? 0.1 : s.inicio - 0.3;
  const fim = s.queda + (s.longa ? 0.35 : 0.15);
  if (s.t < t0) return;
  const alfa = (s.longa ? 1 : 0.55) * (s.t < fim ? 1 : 1 - (s.t - fim) / 0.3);
  if (alfa <= 0) return;
  const nasce = i => t0 + (s.longa ? 0.08 + 0.55 * i / nos.length : 0.15 * i / nos.length);
  const espelha = s.especial.espelha && s.dir < 0;
  const pos = i => ({ x: cx.x + (espelha ? 1 - nos[i][0] : nos[i][0]) * cx.L, y: cx.y + nos[i][1] * cx.A });
  f.alfa(alfa);
  for (const [a, b] of ramos) {
    const pronto = Math.max(nasce(a), nasce(b));
    const v = entre(s.t, pronto, pronto + (s.longa ? 0.12 : 0.08));
    if (v <= 0) continue;
    const pa = pos(a), pb = pos(b);
    f.linha(pa.x, pa.y, misturar(pa.x, pb.x, v), misturar(pa.y, pb.y, v), s.cafe.brilho);
  }
  nos.forEach((no, i) => {
    if (s.t < nasce(i)) return;
    const p = pos(i);
    if (no[2]) {
      f.sprite(['.bbb.', 'bwwwb', 'bwwwb', 'bwwwb', '.bbb.'], p.x, p.y, { b: s.cafe.brilho, w: CREME });
      if (Math.floor(s.t * 6 + i) % 3 === 0) f.cintila(p.x, p.y, 4, s.cafe.brilho, CREME, 1);
    } else {
      f.sprite(['.b.', 'bwb', '.b.'], p.x, p.y, { b: s.cafe.brilho, w: CREME });
    }
  });
  f.alfa(1);
}

// O Café queimando em volta do corpo: chama cheia e fraca, a mesma pontilhada e o núcleo pontilhado (dither preso ao
// palco), mais a fumacinha subindo da cabeça.
function pintarAura(s, f) {
  if (s.burn <= 0.01) return;
  const c = s.corpo(), P = s.P, pulso = 0.5 + 0.5 * Math.sin(s.t * 18);
  const forma = (rx, ry) => (x, y) => { const w = chama(y - c.y, rx, ry, s.t, f.u); return w >= 0 && Math.abs(x - c.x) <= w; };
  const rx = (12 + pulso) * P, ry = (14 + pulso) * P;
  const caixaDe = (a, b) => [c.x - a * 1.3, c.y - 1.5 * b - 2 * P, c.x + a * 1.3, c.y + b];
  const fora = forma(rx, ry), dentro = forma(8 * P, 10 * P);
  f.alfa(s.burn * 0.12);
  f.regiao(...caixaDe(rx, ry), s.cafe.brilho, fora);
  f.alfa(s.burn * 0.85);
  f.regiao(...caixaDe(rx, ry), s.cafe.brilho, (x, y) => (fora(x, y) ? 0.16 + 0.08 * pulso : 0));
  f.alfa(s.burn * 0.9);
  f.regiao(...caixaDe(8 * P, 10 * P), s.cafe.nucleo, (x, y) => (dentro(x, y) ? 0.28 + 0.1 * pulso : 0));
  f.alfa(1);
}

function pintarChamas(s, f) {
  const pe = s.pe(), P = s.P;
  for (const ch of s.chamas) {
    const idade = ch.vida / ch.max;
    f.q(ch.x + Math.sin(ch.vida * 10 + ch.fase) * f.u, ch.y, idade < 0.25 ? s.cafe.nucleo : idade < 0.65 ? s.cafe.brilho : s.cafe.fundo, ch.grande ? 2 : 1);
  }
  // a fumaça do café: três fios que sobem da cabeça, ondulando
  if (s.burn < 0.2) return;
  const sobe = (s.t * 18) % (1.6 * P);
  for (let fio = -1; fio <= 1; fio++) {
    for (let j = 0; j < 5; j++) {
      const y = pe.y - 15 * P - j * 1.6 * P - sobe;
      f.alfa(s.burn * 0.7 * (1 - j / 5));
      f.q(pe.x + fio * 3 * P + Math.sin(y / (2.5 * P) + s.t * 5 + fio) * 1.2 * P, y, s.cafe.nucleo);
    }
  }
  f.alfa(1);
}

// A noite (só na longa): o palco escurece e 80 estrelinhas piscam; e os traços do Café saindo do corpo na intro.
function pintarNoite(s, f, W, H) {
  const a = s.noite ? curvaDaNoite(s) : 0;
  const { ctx, k } = f;
  if (a > 0) {
    ctx.globalAlpha = a;
    ctx.fillStyle = NOITE;
    ctx.fillRect(0, 0, Math.round(W * k), Math.round(H * k));
    const lado = Math.max(2, Math.round(s.P * 0.5));
    ctx.globalAlpha = Math.min(1, a / 0.9);
    ESTRELAS.forEach(([ex, ey], i) => {
      const acesa = Math.floor(s.t * 4 + i) % 5 === 0, l = acesa ? lado : Math.max(1, Math.round(lado / 2));
      ctx.fillStyle = acesa ? '#ffffff' : '#6f6a8a';
      ctx.fillRect(Math.round(ex * W * k), Math.round(ey * H * k), Math.round(l * k), Math.round(l * k));
    });
    f.esquecer();
  }
  if (!s.longa || s.t >= s.inicio) return;
  const c = s.corpo(), P = s.P, alfa = Math.max(0.3, a) * 0.7 * (1 - s.t / s.inicio);
  f.alfa(alfa);
  for (let i = 0; i < 24; i++) {
    const ang = i * TAU / 24 + s.t * 0.4, r0 = (22 + (i % 3) * 6) * P + 140 * s.t, comp = (i % 2 ? 26 : 16) * P;
    f.linha(c.x + Math.cos(ang) * r0, c.y + Math.sin(ang) * r0, c.x + Math.cos(ang) * (r0 + comp), c.y + Math.sin(ang) * (r0 + comp),
      i % 3 === 2 ? CREME : s.cafe.brilho, { passo: 2 });
  }
  f.alfa(1);
}

// O clarão do impacto (ataque especial que tirou vida): a tela toda num lampejo, raios e um anel em cada atingido.
function pintarClarao(s, f, W, H) {
  if (s.especial.reage) return;
  const w = s.t - s.queda;
  if (w < 0 || w > 0.16) return;
  const atingidos = s.rivais.filter(r => r.n > 0);
  if (!atingidos.length) return;
  const { ctx, k } = f, P = s.P, p = w / 0.16;
  ctx.globalAlpha = w < 0.05 ? 0.18 : 0.06;
  ctx.fillStyle = CREME;
  ctx.fillRect(0, 0, Math.round(W * k), Math.round(H * k));
  f.esquecer();
  f.alfa(1);
  for (const r of atingidos) {
    const c = s.corpoDe(r);
    for (let i = 0; i < 14; i++) {
      const a = i * TAU / 14, r0 = (7 + p * 10) * P, comp = (i % 2 ? 14 : 8) * P * (1 - p);
      f.linha(c.x + Math.cos(a) * r0, c.y + Math.sin(a) * r0, c.x + Math.cos(a) * (r0 + comp), c.y + Math.sin(a) * (r0 + comp),
        i % 2 ? CREME : s.cafe.brilho, { passo: 2 });
    }
    f.alfa(1 - p);
    f.elipse(c.x, c.y, (4 + p * 16) * P, (4 + p * 16) * P, CREME);
    f.alfa(1);
  }
}

// A placa do grito, pintada uma vez fora da tela (moldura do metal da carta, §4.7) e carimbada a cada quadro.
function imagemDaPlaca(s, k, W) {
  const estreito = W < 900;
  const tamanho = s.longa ? (estreito ? 18 : limitar(W * 0.029, 20, 40)) : estreito ? 9.5 : 10.5;
  const pronta = typeof document === 'undefined' || !document.fonts?.check || document.fonts.check(`600 ${Math.round(tamanho)}px Cinzel`);
  const chave = `${k}|${Math.round(tamanho * 10)}|${pronta}`;
  if (s.placa?.chave === chave) return s.placa;
  const tela = criarCanvas(4, 4);
  if (!tela) return null;
  const g = tela.getContext('2d');
  const [m0, m1, m2, m3, m4] = s.liga;
  const grito = s.especial.grito, sub = s.especial.subtitulo.toLocaleUpperCase('pt-BR');
  const fonteGrito = s.longa ? `600 ${tamanho * k}px Cinzel, Georgia, serif` : `700 ${tamanho * k}px ui-monospace, Consolas, monospace`;
  const espacoGrito = s.longa ? 0.05 * tamanho : 1.2, fonteSub = `700 ${9 * k}px ui-monospace, Consolas, monospace`;
  const medir = (fonte, espaco, texto) => {
    g.font = fonte;
    if ('letterSpacing' in g) g.letterSpacing = `${espaco * k}px`;
    return g.measureText(texto).width / k;
  };
  const largGrito = medir(fonteGrito, espacoGrito, grito);
  const largSub = s.longa ? medir(fonteSub, 2.4, sub) : 0;
  const [cima, lados, baixo] = s.longa ? [10, 18, 9] : [6, 9, 5];
  const moldura = s.longa ? 10 : 2;
  const linhaGrito = tamanho * (s.longa ? 1.05 : 1.2), linhaSub = s.longa ? 15 : 0;
  const w = Math.ceil(Math.max(largGrito, largSub) + 2 * lados + 2 * moldura);
  const h = Math.ceil(cima + linhaGrito + linhaSub + baixo + 2 * moldura);
  tela.width = Math.round(w * k);
  tela.height = Math.round((h + (s.longa ? 6 : 0)) * k);
  const R = (x, y, l, a, cor) => {
    g.fillStyle = cor;
    const x0 = Math.round(x * k), y0 = Math.round(y * k);
    g.fillRect(x0, y0, Math.round((x + l) * k) - x0, Math.round((y + a) * k) - y0);
  };
  if (s.longa) {
    R(0, 6, w, h, 'rgba(25, 20, 16, 0.25)');
    R(0, 0, w, h, ESCURO);
    R(2, 2, w - 4, h - 4, m0);
    R(2, 2, w - 5, h - 5, m4);
    R(3, 3, w - 6, h - 6, m2);
    R(6, 6, w - 12, h - 12, m1);
    g.clearRect(Math.round(10 * k), Math.round(10 * k), Math.round((w - 20) * k), Math.round((h - 20) * k));
    R(10, 10, w - 20, h - 20, 'rgba(17, 14, 28, 0.92)');
  } else {
    R(0, 0, w, h, m2);
    g.clearRect(Math.round(2 * k), Math.round(2 * k), Math.round((w - 4) * k), Math.round((h - 4) * k));
    R(2, 2, w - 4, h - 4, 'rgba(17, 14, 28, 0.92)');
  }
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const meio = w / 2, yGrito = moldura + cima + linhaGrito / 2;
  g.font = fonteGrito;
  if ('letterSpacing' in g) g.letterSpacing = `${espacoGrito * k}px`;
  if (s.longa) { g.fillStyle = m1; g.fillText(grito, meio * k, (yGrito + 3) * k); }
  g.fillStyle = m4;
  g.fillText(grito, meio * k, yGrito * k);
  if (s.longa) {
    g.font = fonteSub;
    if ('letterSpacing' in g) g.letterSpacing = `${2.4 * k}px`;
    g.fillStyle = m3;
    g.fillText(sub, meio * k, (moldura + cima + linhaGrito + 9) * k);
  }
  s.placa = { chave, tela, w, h };
  return s.placa;
}

function pintarPlaca(s, f, W, cx) {
  if (!s.comGrito) return;
  const comeca = s.longa ? 0.35 + 0.18 * s.indice : 0, acaba = s.queda + (s.longa ? 0.6 : 0.4);
  const w = s.t - comeca;
  if (w < 0 || s.t > acaba + 0.2) return;
  const placa = imagemDaPlaca(s, f.k, W);
  if (!placa) return;
  // entra em 4 degraus (grande e invisível → menor → um pouco maior → no lugar), sai em 2
  const degrau = Math.floor(w / (s.longa ? 0.36 : 0.2) * 4);
  const [escala, alfa] = degrau >= 4 ? [1, 1] : [[1.7, 0], [1.325, 0.5], [0.95, 1], [1.03, 1]][degrau];
  const saida = s.t <= acaba ? 1 : s.t - acaba < 0.1 ? 0.6 : 0.25;
  if (alfa * saida <= 0) return;
  const x = W < 900 ? W / 2 : s.eu.x;
  let base = cx.y - 10 - s.indice * (placa.h + 6);
  if (base - placa.h < 8) base = 8 + placa.h * (1 + s.indice) + 6 * s.indice;
  const cxp = limitar(x, 8 + placa.w / 2, W - 8 - placa.w / 2), cyp = base - placa.h / 2;
  const { ctx, k } = f;
  const dw = Math.round(placa.tela.width * escala), dh = Math.round(placa.tela.height * escala);
  ctx.globalAlpha = alfa * saida;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(placa.tela, Math.round(cxp * k - dw / 2), Math.round(cyp * k - (placa.h * k * escala) / 2), dw, dh);
  ctx.globalAlpha = 1;
}

// ---------- mostrar ----------

export function mostrar(opcoes = {}) {
  const o = opcoes;
  const especial = ESPECIAIS[o.id];
  if (!especial) return null;
  const longa = o.curta ? false : o.longa !== false;
  const intro = longa ? 1.1 : 0.3;
  const hit = especial.reage ? (o.reagir > 0 ? o.reagir : Math.max(0.5, especial.hit)) : especial.hit;
  const metal = metalDe(o.metal);
  const semente = Number.isFinite(o.semente) ? o.semente >>> 0 : (sementeGlobal = (sementeGlobal + 0x9e3779b9) >>> 0);
  if (typeof document !== 'undefined' && longa) document.fonts?.load?.('600 40px Cinzel').catch(() => {});

  const s = {
    id: o.id, especial, longa, intro, hit, t: 0,
    inicio: Number.isFinite(o.inicio) ? o.inicio : intro,
    P: Math.max(1, Math.round(o.P || 4)), dir: o.dir < 0 ? -1 : 1, metal, cafe: CAFE[metal], liga: liga(metal),
    eu: { x: o.eu?.x ?? 0, y: o.eu?.y ?? 0 },
    rivais: (o.rivais ?? []).map(r => ({
      x: r?.x ?? 0, y: r?.y ?? 0, n: Math.max(0, r?.n ?? 0), segurou: !!r?.segurou, guarda: !!r?.guarda, pose: {},
    })),
    contagem: Math.max(0, o.contagem ?? 0), roubado: Math.max(0, o.roubado ?? 0), recebendo: !!o.recebendo,
    contra: Math.max(0, o.contra ?? 0), sprite: spriteDe(o.sprite), semente, rng: sorteio(semente),
    noite: o.noite ?? longa, indice: o.indice ? 1 : 0, comGrito: o.grito !== false,
    burn: 0, acumulado: 0, chamas: [], poseEu: {}, placa: null,
    get queda() { return this.inicio + this.hit; },
    pe() { return { x: this.eu.x + (this.poseEu.dx ?? 0), y: this.eu.y + (this.poseEu.dy ?? 0) }; },
    corpo() { const p = this.pe(); return { x: p.x, y: p.y - 8 * this.P }; },
    punho() { const p = this.pe(); return { x: p.x + this.dir * 11 * this.P, y: p.y - 6 * this.P }; },
    corpoDe(r) { return { x: r.x + (r.pose.dx ?? 0), y: r.y + (r.pose.dy ?? 0) - 8 * this.P }; },
    ruido: (...ns) => ruido(semente, ...ns),
    avivar() { this.burn = 1; },
  };
  const roteiro = ROTEIROS[o.id](s);
  const sobe = !!especial.sobe;
  const voos = s.rivais.map((r, i) => ({ atraso: roteiro.atraso?.(i) ?? 0, perda: roteiro.perda?.(i) ?? r.n }));
  const espera = Math.max(especial.tail, ...voos.map(v => v.atraso + recuperacao(v.perda, sobe)));

  const calcularPoses = () => {
    const τ = s.t - s.inicio, ativo = s.t < s.inicio + s.hit + espera;
    s.poseEu = (ativo && roteiro.eu?.(τ)) || {};
    s.rivais.forEach((r, i) => {
      const base = (ativo && roteiro.rival?.(i, τ)) || {};
      const w = τ - s.hit - voos[i].atraso;
      if (!ativo || w < 0) { r.pose = { ...base }; return; }
      const v = voo(w, voos[i].perda, { P: s.P, lado: s.dir, sobe, ...roteiro.voo });
      r.pose = { ...base, ...v, dx: (base.dx ?? 0) + v.dx, dy: (base.dy ?? 0) + v.dy };
    });
  };

  const cena = {
    hit, tail: especial.tail, espera,
    // a tremida do palco na queda (§6.6): 6 px se o ataque tirou 5 ou mais de alguém, 4 se tirou vida, 0 se não
    tremida: especial.reage ? 0 : s.rivais.some(r => r.n >= 5) ? 6 : s.rivais.some(r => r.n > 0) ? 4 : 0,
    get inicio() { return s.inicio; },
    set inicio(v) { if (Number.isFinite(v)) s.inicio = v; },
    get queda() { return s.queda; },
    get fim() { return s.queda + espera; },
    get t() { return s.t; },
    get terminou() { return s.t >= s.queda + espera; },
    atualizar(dt, posicoes) {
      const passo = Number.isFinite(dt) && dt > 0 ? dt : 0;
      if (posicoes?.eu) { s.eu.x = posicoes.eu.x ?? s.eu.x; s.eu.y = posicoes.eu.y ?? s.eu.y; }
      posicoes?.rivais?.forEach((p, i) => { const r = s.rivais[i]; if (r && p) { r.x = p.x ?? r.x; r.y = p.y ?? r.y; } });
      s.t += passo;
      // o Café: acende na intro, cai até 0,6 durante o golpe e apaga depois
      if (s.t < s.inicio) s.burn = Math.min(1, s.t / 0.25);
      else if (s.t < s.queda + 0.1) s.burn = s.burn > 0.6 ? Math.max(0.6, s.burn - 2 * passo) : s.burn;
      else s.burn = Math.max(0, s.burn - 3 * passo);
      calcularPoses();
      // as chamas do Café nascem num anel em volta do corpo e sobem
      const taxa = s.t < s.inicio ? (s.longa ? 160 : 100) : s.t < s.queda + 0.1 ? 60 : 0;
      s.acumulado = Math.min(12, s.acumulado + taxa * passo);   // um quadro longo (aba escondida) não despeja um monte
      const c = s.corpo(), P = s.P;
      while (s.acumulado >= 1) {
        s.acumulado -= 1;
        const a = s.rng() * TAU;
        s.chamas.push({
          x: c.x + Math.cos(a) * 8 * P, y: c.y + Math.sin(a) * 11 * P, vx: (s.rng() - 0.5) * 24, vy: -(50 + s.rng() * 90) * P / 5,
          fase: s.rng() * TAU, vida: 0, max: 0.35 + s.rng() * 0.35, grande: s.rng() < 0.4,
        });
      }
      for (const ch of s.chamas) { ch.vida += passo; ch.x += ch.vx * passo; ch.y += ch.vy * passo; }
      s.chamas = s.chamas.filter(ch => ch.vida < ch.max);
      roteiro.passo?.(passo, s.t - s.inicio);
      return cena;
    },
    desenhar(ctx, P, dpr = 1, camada) {
      if (!ctx) return;
      if (P > 0) s.P = Math.max(1, Math.round(P));
      const k = dpr > 0 ? dpr : 1;
      const W = ctx.canvas.width / k, H = ctx.canvas.height / k;
      const f = pincel(ctx, k, unidade(s.P));
      f.fantasma = (x, y, estado, alfa) => {
        if (!s.sprite) return;
        f.alfa(alfa);
        desenharAtor(ctx, Math.round((x - 7 * s.P) * k), Math.round((y - 17 * s.P) * k), s.P * k,
          { ...s.sprite, sombra: false, tempo: s.t, ...estado }, k);
        f.esquecer();
        f.alfa(1);
      };
      const τ = s.t - s.inicio, cx = caixa(s, W);
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      ctx.globalAlpha = 1;
      if (camada !== 'frente') {
        pintarNoite(s, f, W, H);
        pintarPoeira(s, f, cx);
        pintarGrafo(s, f, cx);
        pintarAura(s, f);
        roteiro.atras?.(f, τ);
      }
      if (camada !== 'atras') {
        f.alfa(1);
        pintarChamas(s, f);
        roteiro.frente?.(f, τ);
        f.alfa(1);
        pintarClarao(s, f, W, H);
        pintarPlaca(s, f, W, cx);
      }
      ctx.restore();
    },
    poses() {
      return { eu: { ...s.poseEu }, rivais: s.rivais.map(r => ({ ...r.pose })) };
    },
  };
  calcularPoses();
  return cena;
}
