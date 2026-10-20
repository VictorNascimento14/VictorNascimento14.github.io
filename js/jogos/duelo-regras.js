// O duelo de cartas da arena: as regras, puras e sem DOM (spec 07 §6; cartas §7.1; textos §7.3 e §7.4; arquitetura
// §11). LinkedIn × GitHub, dois lutadores por time e 16 cartas por metal. O visitante não joga em tempo real: monta a
// ordem do deck, e cada rodada vira as cartas dos dois lados, lance a lance, sozinha. A Interface (js/jogos/duelo.js) e
// os testes (tests/duelo.test.js) programam contra esta API; os números são os do original e não mudam com o tema.
//
// API do §11
//   TIMES        linkedin, github → { nome, lutadores: [{ id, nome, vida, marcos, assinatura, genero }] }
//   CARTAS       as 96 cartas (16 por time e metal, 8 por lutador), sem uid
//   rng(semente) → () ⇒ [0, 1): mulberry32 (o `sorteio` do núcleo)
//   novoJogo({ time, nivel, metal, aleatorio, metalRival })   lado 0 = o visitante (time, metal); lado 1 = o mascote,
//                com o outro time e o metal do nível (ou `metalRival`)
//   abrir(jogo, lado, ordem)              só na rodada 1: `ordem` = a carta que abre (0 | 1, ou a própria carta)
//   comprar(jogo, lado)                   → as 3 cartas da mão (chamar de novo devolve a mesma mão)
//   escolher(jogo, lado, carta, posicao)  carta = índice na mão ou a carta; posição presa a [0, tamanho do deck];
//                                         as outras duas vão para o fim do deck de compra
//   jogarRodada(jogo)  → { lances: [{ i, cartas: [c0, c1], eventos, segurado: [n0, n1], duas: [b0, b1] }], fim }
//                      `duas[s]`: a carta do lado s jogou duas vezes (Repost); a rodada para no lance de uma queda
//   fim(jogo)          → { vencedor: 0 | 1 | 'empate', como: 'queda' | 'foraDoAr' | 'pontos', pontos: [v0, v1], rodada }
//                        ou null (o duelo segue)
//   decidirIA(jogo, lado, nivel = jogo.nivel)  na rodada 1 escolhe quem abre; depois compra e escolhe carta e vão.
//                      Aplica a jogada e devolve { carta, posicao } (null se não há o que decidir)
//   prever(jogo, lado, carta, posicao)  → { tira, perde, ko: [eu, ele], fora: [eu, ele], conflitos, conflitosFinal,
//                      alcance, menor, recomendacao, anel }: uma rodada simulada contra o deck do rival como está, sem
//                      a carta nova dele ("se ele repetir a ordem"). Não mexe no jogo; null sem carta.
// Acrescentado: REGRAS, NIVEIS, METAIS, ESTILOS; o 3º argumento de decidirIA e `metalRival` (autojogo nos testes);
//   descrever(carta) (§7.3); selo(carta) → { texto, tipo } (o número do canto, §7.3; `tipo` diz o ícone);
//   resumir(lance, { eco }) → [texto0, texto1] (§7.4; com eco, só a 2ª passada) e resumir(evento) → texto do pop;
//   copiar(jogo) e aplicar(jogo, evento), para a Interface animar do começo da rodada até o fim, evento a evento.
//
// Uma partida contra o mascote:
//   jogo = novoJogo(...); decidirIA(jogo, 1)            o mascote abre às cegas
//   abrir(jogo, 0, cartaTocada); r = jogarRodada(jogo)
//   enquanto !r.fim: decidirIA(jogo, 1)                 compra e escolhe vendo o seu deck sem a sua carta nova
//                    comprar(jogo, 0); prever(…) nos vãos; escolher(jogo, 0, carta, vão); r = jogarRodada(jogo)
// A carta que um lado acabou de escolher fica em `lado.nova` (uid) até a rodada ser jogada: a Interface mostra o deck
// do mascote sem ela, e as previsões a ignoram (spec §10.9: nada de trapacear para nenhum dos dois lados).
//
// Estado
//   jogo     { rodada (1–10, a da vez), jogadas (rodadas já jogadas), nivel, aleatorio, lados: [lado0, lado1] }
//   lado     { time, metal, lutadores, conflitos (0–5), recomendacao (null = em casa, com a Conexão; senão o índice de
//              quem a tem), foraDoAr, luta (deck de luta, em ordem), compra, mao, nova, aberto }
//   lutador  { id, nome, i, vida, max, marcos, assinatura, alcance (0–5), cafe (já parou num marco), anel? (0–3: o
//              CI, só o Review) }
//   carta    { uid, id, nome, time, lutador (0 | 1), metal, tipo ('ataque' | 'defesa' | 'truque'), inicial?, golpe? }
//            + efeitos (spec §6.1 → aqui): dano (dmg), nosDois (both), combo, porConflito (perHate), forcePush (ind),
//            rouba (steal), alcance (alc), alcanceTime (alcTeam), alcanceParceiro (alcAlly), cura (heal), curaParceiro
//            (healAlly), ci (story), recomenda (indica), conflitos (hate), resolve (unhate), preco (selfDmg), repost
//            (verMais), seAcertar (onHit), seBloquear (onBlock; devolve = counter), depois (after)
//
// Eventos (spec §6.3), na ordem em que acontecem; `lado` e `lutador` dizem de quem é o número que muda, `card` é o uid
// da carta que causou, e os da 2ª passada do Repost levam echo: true.
//   hit    { tipo, lado, lutador, n, card }  a perda ANTES do marco. Marcas: held (bloqueou: n 0, held = força), token
//          (a Recomendação anulou: n 0), ind (Force push), counter (contra-ataque, junto com ind), self (preço)
//   heal   { lado, lutador, n, card }          alc { lado, lutador, n (com sinal), card, cosmo? (o Café; card null) }
//   ring   { lado, lutador, to (1–4; no 4 o CI fechou e volta a 0), card }
//   token  { lado, lutador, use: 'give' (recebeu a Recomendação) | 'saved' (ela anulou um ataque de força n), card }
//   hate   { lado, n (com sinal), total, card }  os Conflitos do time `lado`
//   mark   { lado, lutador, at, saved, cosmo }  parou no marco `at`; cosmo = 1ª vez (tomou um Café: +1 alcance)
//   cancel { lado }                             Fora do ar (5 Conflitos), conferido só no fim do lance
import { sorteio, limitar } from '../nucleo/pixel.js';

export const rng = sorteio;

// ---------- times, níveis e regras ----------

export const REGRAS = { alcance: 5, rodadas: 10, conflitos: 5, anel: 4, compra: 3, ruido: 0.35 };

// Cada time soma 44 de vida, para o fim por pontos ser justo. A perda de um lance para no primeiro marco abaixo da
// vida: o Artigo e o Review caem com 5 golpes, a Conexão com 6 e o Merge (marcos espaçados) com 4.
export const TIMES = {
  linkedin: {
    nome: 'LinkedIn',
    lutadores: [
      { id: 'artigo', nome: 'Artigo', genero: 'o', vida: 20, marcos: [16, 12, 8, 4], assinatura: 'repost' },
      { id: 'conexao', nome: 'Conexão', genero: 'a', vida: 24, marcos: [20, 16, 12, 8, 4], assinatura: 'recomendacao' },
    ],
  },
  github: {
    nome: 'GitHub',
    lutadores: [
      { id: 'merge', nome: 'Merge', genero: 'o', vida: 24, marcos: [18, 12, 6], assinatura: 'conflitos' },
      { id: 'review', nome: 'Review', genero: 'o', vida: 20, marcos: [16, 12, 8, 4], assinatura: 'ci' },
    ],
  },
};
const rival = time => (time === 'linkedin' ? 'github' : 'linkedin');

// O nível decide o metal do time do mascote e o quanto ele pensa (§6.5): `ruido` = chance de jogar ao acaso, `pior`
// = chance de escolher entre o pior terço, `ordem` = pensar também na abertura.
export const NIVEIS = {
  facil: { nome: 'Fácil', metal: 'bronze', ruido: 1, pior: 0.6 },
  medio: { nome: 'Médio', metal: 'prata', ruido: 0.5 },
  dificil: { nome: 'Difícil', metal: 'ouro', ruido: 0, ordem: true },
};
export const METAIS = ['bronze', 'prata', 'ouro'];
export const ESTILOS = { bronze: 'equilibrado', prata: 'segura e devolve', ouro: 'golpe grande, com preço' };

// ---------- as 96 cartas ----------
// Cada carta repete, na mesma vaga (time, metal, lutador e posição), a função mecânica da carta do original (spec
// §7.1): tipo e números iguais, nome novo. Não há custo de energia; o único preço é `preco` (vida do próprio lutador).
// As 16 com `golpe` são as especiais da arquitetura §11 (cena própria em js/jogos/golpes.js).
const ataque = (nome, dano, efeitos) => ({ nome, tipo: 'ataque', dano, ...efeitos });
const defesa = (nome, efeitos) => ({ nome, tipo: 'defesa', ...efeitos });
const truque = (nome, efeitos) => ({ nome, tipo: 'truque', ...efeitos });

const DECKS = {
  linkedin: {
    bronze: [
      [ // Artigo
        ataque('Bom dia, rede!', 1, { inicial: true }),
        ataque('Título chamativo', 2, { seAcertar: { alcance: 1 } }),
        ataque('Post viral', 3, { golpe: 'notificacoes' }),
        ataque('Era uma vez um bug', 1, { depois: { alcance: 1 } }),
        truque('Comenta “EU”', { forcePush: 2 }),
        truque('Modo criador', { alcance: 2 }),
        truque('Repost', { cura: 1, repost: true }),
        defesa('Desativar comentários', { seBloquear: { alcance: 1 } }),
      ],
      [ // Conexão
        defesa('Aceitar conexão', { inicial: true, seBloquear: { cura: 1 } }),
        truque('Parabéns pelo cargo', { curaParceiro: 3 }),
        defesa('Validar competência', { seBloquear: { recomenda: true } }),
        truque('Indicar para a vaga', { recomenda: true }),
        defesa('Entrevista técnica', { seBloquear: { devolve: 2 } }),
        defesa('Minha rede', { golpe: 'conexoes', seBloquear: { cura: 2 } }),
        truque('Reunião de alinhamento', { resolve: 2, cura: 1 }),
        ataque('Marcar o colega', 1, { depois: { alcanceParceiro: 1 } }),
      ],
    ],
    prata: [
      [ // Artigo
        ataque('Dica do dia', 1, { inicial: true }),
        defesa('Resposta nos comentários', { golpe: 'rollback', seBloquear: { devolve: 2 } }),
        defesa('Post editado', { seBloquear: { devolve: 1, cura: 1 } }),
        ataque('Hot take', 2, { golpe: 'hot-take', seAcertar: { alcance: 1 } }),
        ataque('Parte 2 de 5', 1, { combo: 1 }),
        truque('Atualizar o perfil', { cura: 1, alcance: 1 }),
        truque('Fixar no topo', { cura: 1, repost: true }),
        ataque('Post agendado', 1, { repost: true }),
      ],
      [ // Conexão
        defesa('Meetup', { inicial: true, seBloquear: { cura: 1 } }),
        truque('Mensagem de apoio', { curaParceiro: 2 }),
        defesa('Comunidade tech', { seBloquear: { devolve: 1, resolve: 1 } }),
        truque('Fazer a ponte', { recomenda: true, curaParceiro: 1 }),
        ataque('Coautoria', 1, { depois: { alcanceParceiro: 1 } }),
        defesa('Recomendação escrita', { golpe: 'endosso', seBloquear: { cura: 2, resolve: 1 } }),
        truque('Panos quentes', { resolve: 2 }),
        truque('InMail', { rouba: 2 }),
      ],
    ],
    ouro: [
      [ // Artigo
        ataque('Feliz em anunciar', 1, { inicial: true }),
        ataque('Thread polêmica', 5, { golpe: 'deploy-sexta', preco: 2 }),
        ataque('Lighthouse 100', 1, { forcePush: 1 }),
        ataque('Post de aprendizados', 1, { golpe: 'commits-atomicos', combo: 2 }),
        defesa('Citar a documentação', { seBloquear: { devolve: 3 } }),
        truque('Postar às 8h', { rouba: 2 }),
        ataque('Post que bombou', 2, { repost: true }),
        truque('Recado nas entrelinhas', { forcePush: 2 }),
      ],
      [ // Conexão
        defesa('Contato quente', { inicial: true, seBloquear: { recomenda: true } }),
        truque('Proposta de emprego', { golpe: 'headhunter', rouba: 3 }),
        truque('Kudos', { alcanceTime: 1 }),
        defesa('Turma da faculdade', { seBloquear: { devolve: 1, cura: 1 } }),
        ataque('Lightning talk', 2, { preco: 1 }),
        defesa('Desligar notificações', { seBloquear: { resolve: 2 } }),
        truque('Mentor de carreira', { recomenda: true, curaParceiro: 2 }),
        truque('Comunicado oficial', { resolve: 3 }),
      ],
    ],
  },
  github: {
    bronze: [
      [ // Merge
        ataque('Commit inicial', 1, { inicial: true }),
        truque('git pull', { alcance: 1, cura: 1 }),
        ataque('Merge sem review', 4, { golpe: 'merge-main', preco: 1 }),
        ataque('Pair programming', 1, { golpe: 'pair', nosDois: true }),
        ataque('PR gigante', 1, { seAcertar: { conflitos: 1 } }),
        truque('Abrir issue', { conflitos: 1, forcePush: 1 }),
        defesa('Branch protegida', { seBloquear: { cura: 2 } }),
        defesa('git blame', { seBloquear: { alcance: 1 } }),
      ],
      [ // Review
        defesa('Pre-commit', { inicial: true, ci: 1 }),
        defesa('LGTM', { seBloquear: { alcanceParceiro: 1 } }),
        truque('Nitpick', { rouba: 2, cura: 1 }),
        defesa('Check obrigatório', { seBloquear: { ci: 2 } }),
        truque('Daily', { alcanceTime: 1 }),
        ataque('Release', 3, { golpe: 'release' }),
        truque('Rodar a pipeline', { ci: 2 }),
        defesa('Ler o diff inteiro', { seBloquear: { cura: 1 } }),
      ],
    ],
    prata: [
      [ // Merge
        ataque('Commit WIP', 1, { inicial: true }),
        defesa('git revert', { seBloquear: { devolve: 2 } }),
        ataque('Sequência de commits', 1, { golpe: 'streak', combo: 1 }),
        truque('Refatoração', { alcance: 1, cura: 1 }),
        truque('Noite de sono', { cura: 2, alcance: 1 }),
        ataque('Mob programming', 1, { nosDois: true }),
        ataque('Branch desatualizada', 1, { seAcertar: { conflitos: 1 } }),
        ataque('Conflito de merge', 1, { porConflito: 1 }),
      ],
      [ // Review
        defesa('Teste unitário', { inicial: true, ci: 1 }),
        defesa('Sugestão no diff', { seBloquear: { devolve: 1, cura: 1 } }),
        truque('Retrospectiva', { alcanceTime: 1 }),
        defesa('Approve', { seBloquear: { alcanceParceiro: 1 } }),
        truque('README caprichado', { curaParceiro: 2 }),
        ataque('Code owner', 2, { golpe: 'mencao' }),
        truque('Fork', { rouba: 2 }),
        truque('Cache do build', { ci: 2, cura: 1 }),
      ],
    ],
    ouro: [
      [ // Merge
        ataque('git push', 2, { inicial: true }),
        ataque('Hotfix em produção', 5, { golpe: 'hotfix', preco: 2 }),
        ataque('Hackathon', 1, { combo: 1 }),
        truque('Force push', { golpe: 'push-force', forcePush: 3 }),
        truque('Cherry-pick', { rouba: 2, alcance: 1 }),
        defesa('Feature flag', { seBloquear: { alcance: 1 } }),
        ataque('Tabs × espaços', 1, { conflitos: 1, seAcertar: { conflitos: 1 } }),
        ataque('Rebase interativo', 1, { porConflito: 1 }),
      ],
      [ // Review
        defesa('Build verde', { inicial: true, seBloquear: { ci: 1 } }),
        defesa('Testes de integração', { seBloquear: { ci: 2 } }),
        defesa('Changes requested', { golpe: 'code-review', seBloquear: { devolve: 2 } }),
        ataque('Deploy manual', 3, { preco: 2 }),
        truque('Comentário gentil', { curaParceiro: 2 }),
        ataque('Smoke test', 1, { ci: 1 }),
        truque('Pipeline completa', { ci: 3 }),
        truque('Teste flaky', { forcePush: 1, ci: 1 }),
      ],
    ],
  },
};

// O id sai do nome: "Tabs × espaços" → "tabs-espacos".
const paraId = nome => nome.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export const CARTAS = Object.entries(DECKS).flatMap(([time, metais]) =>
  Object.entries(metais).flatMap(([metal, lutadores]) =>
    lutadores.flatMap((cartas, lutador) => cartas.map(c => ({ id: paraId(c.nome), time, metal, lutador, ...c })))));

// ---------- montagem ----------

let uids = 0;   // únicos na página e crescentes: a Interface reconhece cada carta (e a 1ª vez de cada golpe) por eles

function embaralhar(lista, aleatorio) {   // Fisher–Yates
  for (let i = lista.length - 1; i > 0; i--) {
    const j = Math.floor(aleatorio() * (i + 1));
    [lista[i], lista[j]] = [lista[j], lista[i]];
  }
  return lista;
}

function novoLado(time, metal, aleatorio) {
  if (!METAIS.includes(metal)) metal = 'bronze';
  const cartas = CARTAS.filter(c => c.time === time && c.metal === metal).map(c => ({ ...c, uid: ++uids }));
  return {
    time, metal,
    lutadores: TIMES[time].lutadores.map((l, i) => ({
      id: l.id, nome: l.nome, i, vida: l.vida, max: l.vida, marcos: l.marcos, assinatura: l.assinatura,
      alcance: 0, cafe: false, ...(l.assinatura === 'ci' && { anel: 0 }),
    })),
    conflitos: 0, recomendacao: null, foraDoAr: false,
    // O deck de luta começa com a carta inicial de cada lutador; as outras 14 são o deck de compra.
    luta: [0, 1].map(i => cartas.find(c => c.inicial && c.lutador === i)),
    compra: embaralhar(cartas.filter(c => !c.inicial), aleatorio),
    mao: [], nova: null, aberto: false,
  };
}

export function novoJogo({ time = 'linkedin', nivel = 'medio', metal = 'bronze', aleatorio = Math.random, metalRival } = {}) {
  if (!TIMES[time]) time = 'linkedin';
  if (!NIVEIS[nivel]) nivel = 'medio';
  return {
    rodada: 1, jogadas: 0, nivel, aleatorio,
    lados: [novoLado(time, metal, aleatorio), novoLado(rival(time), metalRival ?? NIVEIS[nivel].metal, aleatorio)],
  };
}

// Onde está a carta: o índice dado ou a própria carta (pelo uid, então vale uma cópia).
const indice = (lista, carta) => (typeof carta === 'number'
  ? (Number.isInteger(carta) && carta >= 0 && carta < lista.length ? carta : -1)
  : lista.findIndex(c => c.uid === carta?.uid));
const prender = (posicao, tamanho) => limitar(Math.round(posicao) || 0, 0, tamanho);

export function abrir(jogo, lado, ordem) {
  const l = jogo.lados[lado], i = indice(l.luta, ordem);
  if (jogo.jogadas > 0 || i < 0) throw new Error('abrir: só na rodada 1, com uma carta do próprio deck');
  l.luta.unshift(...l.luta.splice(i, 1));
  l.aberto = true;
  return l.luta;
}

export function comprar(jogo, lado) {
  const l = jogo.lados[lado];
  if (!l.mao.length) l.mao = l.compra.splice(0, REGRAS.compra);
  return [...l.mao];
}

// As cartas que já estão no deck nunca mudam de lugar; as duas que sobram voltam para o fim do deck de compra.
export function escolher(jogo, lado, carta, posicao) {
  const l = jogo.lados[lado], k = indice(l.mao, carta);
  if (k < 0) throw new Error('escolher: a carta não está na mão');
  const c = l.mao[k];
  l.luta.splice(prender(posicao, l.luta.length), 0, c);
  l.compra.push(...l.mao.filter((_, j) => j !== k));
  l.mao = [];
  l.nova = c.uid;
  return c;
}

// ---------- o lance (spec §6.3: a ordem é lei) ----------
// `ev` registra um evento (com echo na 2ª passada). Cada efeito só gera evento se mudou alguma coisa.

function mudarAlcance(ev, s, f, n, card, extra) {
  const novo = limitar(f.alcance + n, 0, REGRAS.alcance);
  if (novo === f.alcance) return;
  ev({ tipo: 'alc', lado: s, lutador: f.i, n: novo - f.alcance, card, ...extra });
  f.alcance = novo;
}

function curar(ev, s, f, n, card) {
  const novo = Math.min(f.max, f.vida + n);
  if (novo <= f.vida) return;
  ev({ tipo: 'heal', lado: s, lutador: f.i, n: novo - f.vida, card });
  f.vida = novo;
}

// O CI (lint, teste, build, deploy) anda uma etapa por vez: na 2ª o parceiro ganha +1 alcance; na 4ª fecha, volta a
// zero e o dono ganha +1 alcance e +2 de vida.
function girarCI(ev, lado, s, n, card) {
  const dono = lado.lutadores.find(f => f.assinatura === 'ci');
  if (!dono) return;
  const parceiro = lado.lutadores[1 - dono.i];
  for (let k = 0; k < n; k++) {
    dono.anel++;
    ev({ tipo: 'ring', lado: s, lutador: dono.i, to: dono.anel, card });
    if (dono.anel === 2) mudarAlcance(ev, s, parceiro, 1, card);
    if (dono.anel === REGRAS.anel) {
      dono.anel = 0;
      mudarAlcance(ev, s, dono, 1, card);
      curar(ev, s, dono, 2, card);
    }
  }
}

// A Recomendação sai da Conexão para o parceiro dela. "Em casa" não protege ninguém; dar a quem já tem não faz nada.
function recomendar(ev, lado, s, card) {
  const dono = lado.lutadores.find(f => f.assinatura === 'recomendacao');
  if (!dono || lado.recomendacao === 1 - dono.i) return;
  lado.recomendacao = 1 - dono.i;
  ev({ tipo: 'token', lado: s, lutador: 1 - dono.i, use: 'give', card });
}

function conflitar(ev, lado, s, n, card) {   // n com sinal; o total fica em [0, 5]
  const total = limitar(lado.conflitos + n, 0, REGRAS.conflitos);
  if (total === lado.conflitos) return;
  ev({ tipo: 'hate', lado: s, n: total - lado.conflitos, total, card });
  lado.conflitos = total;
}

// A ordem de cada grupo de efeitos é a do original (muda só a ordem dos eventos, não o resultado).
const TRUQUES = ['alcance', 'alcanceTime', 'alcanceParceiro', 'cura', 'curaParceiro', 'ci', 'recomenda', 'conflitos', 'resolve'];
const SE_ACERTAR = ['alcance', 'cura', 'conflitos'];
const SE_BLOQUEAR = ['cura', 'curaParceiro', 'alcance', 'alcanceParceiro', 'ci', 'recomenda', 'resolve'];
const DEPOIS = ['alcance', 'alcanceParceiro'];
const LADOS = [0, 1];   // o lado 0 sempre resolve antes do lado 1

function efeitos(ev, lados, s, f, valores, ordem, card) {
  const lado = lados[s], parceiro = lado.lutadores[1 - f.i];
  for (const k of ordem) {
    const n = valores[k];
    if (!n) continue;
    if (k === 'alcance') mudarAlcance(ev, s, f, n, card);
    else if (k === 'alcanceTime') lado.lutadores.forEach(g => mudarAlcance(ev, s, g, n, card));
    else if (k === 'alcanceParceiro') mudarAlcance(ev, s, parceiro, n, card);
    else if (k === 'cura') curar(ev, s, f, n, card);
    else if (k === 'curaParceiro') curar(ev, s, parceiro, n, card);
    else if (k === 'ci') girarCI(ev, lado, s, n, card);
    else if (k === 'recomenda') recomendar(ev, lado, s, card);
    else if (k === 'conflitos') conflitar(ev, lados[1 - s], 1 - s, n, card);
    else if (k === 'resolve') conflitar(ev, lado, s, -n, card);
  }
}

// Uma passada: `cartas` são as viradas neste lance, `agindo` as que agem agora (na 2ª passada, só a do Repost) e
// `antes` as viradas antes deste lance na rodada (o combo conta só essas, nas duas passadas).
function passada(lados, cartas, agindo, antes, eco, eventos, segurado) {
  const ev = eco ? e => eventos.push({ ...e, echo: true }) : e => eventos.push(e);
  const ativo = cartas.map((c, s) => (c ? lados[s].lutadores[c.lutador] : null));
  const alvo = o => ativo[o] ?? lados[o].lutadores[0];   // lado sem carta: apanha o 1º lutador, que não bloqueia

  // 1a. Roubo, antes de tudo: leva o alcance que o rival tinha ao começar o lance.
  for (const s of LADOS) {
    const c = agindo[s], o = 1 - s;
    if (!c?.rouba || !ativo[o] || ativo[o].alcance <= 0) continue;
    const n = Math.min(c.rouba, ativo[o].alcance);
    mudarAlcance(ev, o, ativo[o], -n, c.uid);
    mudarAlcance(ev, s, ativo[s], n, c.uid);
  }
  // 1b. Truques de qualquer tipo de carta, o lado 0 antes do lado 1.
  for (const s of LADOS) if (agindo[s]) efeitos(ev, lados, s, ativo[s], agindo[s], TRUQUES, agindo[s].uid);

  // 2a. Ataques, com o alcance de depois dos truques. O bloqueio segura tudo contra quem bloqueia; a Recomendação
  // anula um ataque inteiro contra quem a tem e volta para casa.
  const bloqueios = [0, 0], acertou = [false, false], perda = [[0, 0], [0, 0]];
  for (const s of LADOS) {
    const c = agindo[s], o = 1 - s, d = cartas[o];
    if (c?.tipo !== 'ataque') continue;
    const combo = (c.combo ?? 0) * antes[s].filter(x => x.lutador === c.lutador).length;
    const forca = (c.dano ?? 0) + combo + ativo[s].alcance + (c.porConflito ?? 0) * lados[o].conflitos;
    for (const g of c.nosDois ? lados[o].lutadores : [alvo(o)]) {
      if (d?.tipo === 'defesa' && ativo[o] === g) {
        bloqueios[o]++;
        segurado[o] += forca;
        ev({ tipo: 'hit', lado: o, lutador: g.i, n: 0, held: forca, card: c.uid });
      } else if (forca > 0 && lados[o].recomendacao === g.i) {
        lados[o].recomendacao = null;
        ev({ tipo: 'hit', lado: o, lutador: g.i, n: 0, token: true, card: c.uid });
        ev({ tipo: 'token', lado: o, lutador: g.i, use: 'saved', n: forca, card: c.uid });
      } else {
        perda[o][g.i] += forca;
        ev({ tipo: 'hit', lado: o, lutador: g.i, n: forca, card: c.uid });
        if (forca > 0) acertou[s] = true;
      }
    }
  }
  // 2b. Force push: passa por bloqueio e Recomendação.
  for (const s of LADOS) {
    const c = agindo[s], o = 1 - s;
    if (!c?.forcePush) continue;
    for (const g of c.nosDois ? lados[o].lutadores : [alvo(o)]) {
      perda[o][g.i] += c.forcePush;
      ev({ tipo: 'hit', lado: o, lutador: g.i, n: c.forcePush, ind: true, card: c.uid });
    }
  }
  // 2c. Contra-ataque: sai da defesa virada, uma vez por lance, se ela segurou algo; nunca na 2ª passada.
  if (!eco) {
    for (const s of LADOS) {
      const d = cartas[s], o = 1 - s, n = d?.seBloquear?.devolve;
      if (d?.tipo !== 'defesa' || !bloqueios[s] || !n || !ativo[o]) continue;
      perda[o][ativo[o].i] += n;
      ev({ tipo: 'hit', lado: o, lutador: ativo[o].i, n, ind: true, counter: true, card: d.uid });
    }
  }
  // 3a. Preço.
  for (const s of LADOS) {
    const c = agindo[s];
    if (!c?.preco) continue;
    perda[s][ativo[s].i] += c.preco;
    ev({ tipo: 'hit', lado: s, lutador: ativo[s].i, n: c.preco, self: true, card: c.uid });
  }
  // 3b. A perda da passada cai de uma vez e para no maior marco atravessado. Na 1ª parada, o Café: +1 alcance.
  for (const s of LADOS) {
    for (const f of lados[s].lutadores) {
      const n = perda[s][f.i];
      if (n <= 0) continue;
      const de = f.vida, para = de - n;
      const marco = Math.max(...f.marcos.filter(x => para <= x && x < de));
      if (marco === -Infinity) { f.vida = para; continue; }
      f.vida = marco;
      const primeiro = !f.cafe;
      f.cafe = true;
      ev({ tipo: 'mark', lado: s, lutador: f.i, at: marco, saved: marco - para, cosmo: primeiro });
      if (primeiro) mudarAlcance(ev, s, f, 1, null, { cosmo: true });
    }
  }
  // 4. Consequências: se acertou, se bloqueou (só na 1ª passada) e depois.
  for (const s of LADOS) {
    const c = agindo[s];
    if (!c) continue;
    if (c.seAcertar && acertou[s]) efeitos(ev, lados, s, ativo[s], c.seAcertar, SE_ACERTAR, c.uid);
    if (c.seBloquear && c.tipo === 'defesa' && !eco && bloqueios[s]) efeitos(ev, lados, s, ativo[s], c.seBloquear, SE_BLOQUEAR, c.uid);
    if (c.depois) efeitos(ev, lados, s, ativo[s], c.depois, DEPOIS, c.uid);
  }
}

// Um lance: a passada de todos; se a carta anterior de um deck era Repost, a passada só dela de novo; e só no fim,
// Fora do ar para quem chegou a 5 Conflitos.
function lance(lados, cartas, antes, duas) {
  const eventos = [], segurado = [0, 0];
  passada(lados, cartas, cartas, antes, false, eventos, segurado);
  if (duas[0] || duas[1]) passada(lados, cartas, cartas.map((c, s) => (duas[s] ? c : null)), antes, true, eventos, segurado);
  lados.forEach((l, s) => {
    if (l.conflitos < REGRAS.conflitos || l.foraDoAr) return;
    l.foraDoAr = true;
    eventos.push({ tipo: 'cancel', lado: s });
  });
  return { eventos, segurado };
}

const caiu = l => l.lutadores.some(f => f.vida <= 0);
const vidaTotal = l => l.lutadores.reduce((t, f) => t + Math.max(0, f.vida), 0);
const alcanceTotal = l => l.lutadores.reduce((t, f) => t + f.alcance, 0);

// ---------- rodada e fim (§6.4) ----------

// Vira os dois decks lado a lado; para no lance em que alguém cai ou sai do ar.
function rodada(lados) {
  const n = Math.max(lados[0].luta.length, lados[1].luta.length);
  const lances = [], antes = [[], []];
  let repost = [false, false];
  for (let i = 0; i < n; i++) {
    const cartas = [lados[0].luta[i] ?? null, lados[1].luta[i] ?? null];
    const duas = cartas.map((c, s) => !!c && repost[s]);
    lances.push({ i, cartas, ...lance(lados, cartas, antes, duas), duas });
    cartas.forEach((c, s) => c && antes[s].push(c));
    repost = cartas.map(c => !!c?.repost);   // vale para a próxima carta DESTE deck
    if (lados.some(l => l.foraDoAr || caiu(l))) break;
  }
  return lances;
}

export function fim(jogo) {
  const [a, b] = jogo.lados;
  const pontos = [vidaTotal(a), vidaTotal(b)];
  const r = (vencedor, como) => ({ vencedor, como, pontos, rodada: jogo.rodada });
  const porPontos = () => r(pontos[0] === pontos[1] ? 'empate' : pontos[0] > pontos[1] ? 0 : 1, 'pontos');
  if (a.foraDoAr || b.foraDoAr) return a.foraDoAr && b.foraDoAr ? porPontos() : r(a.foraDoAr ? 1 : 0, 'foraDoAr');
  const ko = [caiu(a), caiu(b)];
  if (ko[0] || ko[1]) return ko[0] && ko[1] ? porPontos() : r(ko[0] ? 1 : 0, 'queda');
  return jogo.jogadas >= REGRAS.rodadas ? porPontos() : null;
}

export function jogarRodada(jogo) {
  const acabou = fim(jogo);
  if (acabou) return { lances: [], fim: acabou };
  const lances = rodada(jogo.lados);
  jogo.jogadas++;
  for (const l of jogo.lados) l.nova = null;
  const resultado = fim(jogo);
  if (!resultado) jogo.rodada++;
  return { lances, fim: resultado };
}

// Cópia para animar (ou simular) sem mexer no jogo; as cartas são compartilhadas (ninguém as altera).
const copiaLado = (l, luta = [...l.luta]) => ({
  ...l, lutadores: l.lutadores.map(f => ({ ...f })), luta, compra: [...l.compra], mao: [...l.mao],
});
export const copiar = jogo => ({ ...jogo, lados: jogo.lados.map(l => copiaLado(l)) });

// Reaplica um evento numa cópia: aplicar todos os de uma rodada, em ordem, chega ao estado final. O `hit` desce a
// barra além do entalhe; o `mark` devolve a vida até ele (o "de pé!", spec §10.1).
export function aplicar(jogo, e) {
  const lado = jogo.lados[e.lado], f = lado.lutadores[e.lutador];
  if (e.tipo === 'hit') f.vida -= e.n;
  else if (e.tipo === 'heal') f.vida += e.n;
  else if (e.tipo === 'alc') f.alcance += e.n;
  else if (e.tipo === 'mark') { f.vida = e.at; f.cafe = true; }
  else if (e.tipo === 'ring') f.anel = e.to % REGRAS.anel;
  else if (e.tipo === 'token') lado.recomendacao = e.use === 'give' ? e.lutador : null;
  else if (e.tipo === 'hate') lado.conflitos = e.total;
  else if (e.tipo === 'cancel') lado.foraDoAr = true;
  return jogo;
}

// ---------- a IA do mascote (§6.5) ----------

const semNova = l => l.luta.filter(c => c.uid !== l.nova);

// Uma rodada simulada em cópias: `meu` é o deck candidato do lado `lado`, `dele` o do rival. Nada do jogo muda.
function simular(jogo, lado, meu, dele) {
  const lados = [];
  lados[lado] = copiaLado(jogo.lados[lado], meu);
  lados[1 - lado] = copiaLado(jogo.lados[1 - lado], dele);
  const a = lados[lado], b = lados[1 - lado];
  const vida = [vidaTotal(a), vidaTotal(b)], alcance = alcanceTotal(a), conflitos = [a.conflitos, b.conflitos];
  rodada(lados);
  return {
    tira: vida[1] - vidaTotal(b), perde: vida[0] - vidaTotal(a),
    ko: [caiu(a), caiu(b)], fora: [a.foraDoAr, b.foraDoAr],
    conflitos: [a.conflitos - conflitos[0], b.conflitos - conflitos[1]],   // quanto cada time ganhou na rodada
    conflitosFinal: [a.conflitos, b.conflitos],
    alcance: alcanceTotal(a) - alcance,
    menor: Math.min(...a.lutadores.map(f => f.vida)),
    recomendacao: a.recomendacao !== null,
    anel: a.lutadores.find(f => f.assinatura === 'ci')?.anel ?? 0,
  };
}

// Conflitos valem de forma convexa: o que ponho no rival vale mais quanto mais perto de 5; o que levo, idem.
const CONFLITO = [0, 1, 2.4, 4.2, 7, 10];
function valor(v) {
  const [meus, dele] = v.conflitosFinal;
  return v.tira - 1.1 * v.perde + 0.7 * v.alcance
    + (v.ko[1] || v.fora[1] ? 40 : 0) - (v.ko[0] || v.fora[0] ? 40 : 0)
    - (v.menor <= 3 ? 1.5 : 0)
    + CONFLITO[dele] - CONFLITO[dele - v.conflitos[1]]
    - CONFLITO[meus] + CONFLITO[meus - v.conflitos[0]]
    + (v.recomendacao ? 1 : 0) + 0.3 * v.anel;
}

// Se a carta já está no deck (a abertura), ela muda de lugar em vez de entrar de novo.
function comCarta(deck, carta, posicao) {
  const novo = deck.filter(c => c.uid !== carta.uid);
  novo.splice(prender(posicao, novo.length), 0, carta);
  return novo;
}

export function prever(jogo, lado, carta, posicao) {
  const l = jogo.lados[lado];
  const c = typeof carta === 'number' ? l.mao[carta] : carta;
  if (!c) return null;
  return simular(jogo, lado, comCarta(semNova(l), c, posicao), semNova(jogo.lados[1 - lado]));
}

export function decidirIA(jogo, lado, nivel = jogo.nivel) {
  if (fim(jogo)) return null;
  const cfg = NIVEIS[nivel] ?? { ruido: REGRAS.ruido };
  const l = jogo.lados[lado], acaso = jogo.aleatorio;

  // Abertura: às cegas, inverte com 50%. No Difícil, soma (tira − perde) das suas duas ordens contra as duas
  // possíveis do rival, que ainda não escolheu; empate mantém.
  if (jogo.jogadas === 0) {
    if (l.aberto) return null;
    let i = 0;
    if (cfg.ordem) {
      const ordens = deck => [deck, [...deck].reverse()];
      const nota = meu => ordens(jogo.lados[1 - lado].luta)
        .reduce((t, dele) => { const v = simular(jogo, lado, meu, dele); return t + v.tira - v.perde; }, 0);
      const [manter, inverter] = ordens(l.luta).map(nota);
      if (inverter > manter) i = 1;
    } else if (acaso() < 0.5) i = 1;
    abrir(jogo, lado, i);
    return { carta: l.luta[0], posicao: 0 };
  }

  // Compra: cada carta da mão em cada vão, uma rodada simulada contra o deck do rival sem a carta nova dele.
  if (l.nova !== null) return null;   // já escolheu nesta rodada
  const mao = comprar(jogo, lado);
  if (!mao.length) return null;
  const dele = semNova(jogo.lados[1 - lado]), opcoes = [];
  mao.forEach((c, k) => {
    for (let at = 0; at <= l.luta.length; at++) {
      opcoes.push({ k, at, v: valor(simular(jogo, lado, comCarta(l.luta, c, at), dele)) });
    }
  });
  opcoes.sort((x, y) => y.v - x.v);
  const n = opcoes.length;
  let escolha = opcoes[0];
  if (cfg.pior && acaso() < cfg.pior) escolha = opcoes[n - 1 - Math.floor(acaso() * Math.ceil(n / 3))];
  else if (acaso() < cfg.ruido) escolha = opcoes[Math.floor(acaso() * n)];
  return { carta: escolher(jogo, lado, escolha.k, escolha.at), posicao: escolha.at };
}

// ---------- textos (§7.3 e §7.4, com os nomes do tema) ----------

const MENOS = '−';
const oNome = l => `${l.genero} ${l.nome}`;      // o Artigo, a Conexão
const doNome = l => `d${l.genero} ${l.nome}`;    // do Artigo, da Conexão
const qtd = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
const conflitosTxt = n => qtd(n, 'Conflito', 'Conflitos');
const maiuscula = t => t[0].toUpperCase() + t.slice(1);

// A descrição gerada da carta: partes nesta ordem, cada uma com maiúscula, unidas por ". " e com ponto no fim.
export function descrever(c) {
  const time = TIMES[c.time], eu = time.lutadores[c.lutador], par = time.lutadores[1 - c.lutador];
  const noRival = `no ${TIMES[rival(c.time)].nome}`;
  const ci = time.lutadores.find(l => l.assinatura === 'ci');
  const recebe = time.lutadores.find(l => l.assinatura !== 'recomendacao');
  const anda = n => `o CI ${doNome(ci)} avança ${qtd(n, 'etapa', 'etapas')}`;   // só o time do CI tem essas cartas
  const nosDois = c.nosDois ? ' nos dois lutadores do rival' : '';
  const b = c.seBloquear ?? {}, h = c.seAcertar ?? {}, a = c.depois ?? {};
  const p = [];
  if (c.tipo === 'ataque') p.push(`ataque ${c.dano}${nosDois}`);
  if (c.combo) p.push(`+${c.combo} de dano para cada carta ${doNome(eu)} já virada na rodada`);
  if (c.porConflito) p.push(`+${c.porConflito} de dano para cada Conflito ${noRival}`);
  if (c.tipo === 'defesa') p.push(`bloqueio: segura todos os ataques contra ${oNome(eu)} neste lance`);
  if (c.forcePush) p.push(`${c.tipo === 'ataque' ? 'mais ' : ''}Force push ${c.forcePush}${nosDois}: nenhum bloqueio segura`);
  if (c.rouba) p.push(`rouba ${c.rouba} de alcance do rival`);
  if (c.alcance) p.push(`+${c.alcance} alcance`);
  if (c.alcanceTime) p.push(`+${c.alcanceTime} alcance para os dois`);
  if (c.alcanceParceiro) p.push(`+${c.alcanceParceiro} alcance para ${oNome(par)}`);
  if (c.cura) p.push(`recupera ${c.cura}`);
  if (c.curaParceiro) p.push(`${oNome(par)} recupera ${c.curaParceiro}`);
  if (c.ci) p.push(anda(c.ci));
  if (c.recomenda) {
    p.push(`passa a Recomendação para ${oNome(recebe)}: o próximo ataque que acertaria ${oNome(recebe)} não tira nada`);
  }
  if (c.conflitos) p.push(`+${conflitosTxt(c.conflitos)} ${noRival}`);
  if (c.resolve) p.push(`tira ${conflitosTxt(c.resolve)} do seu time`);
  if (b.devolve) p.push(`se bloquear, devolve ${b.devolve} com Force push`);
  if (b.cura) p.push(`se bloquear, recupera ${b.cura}`);
  if (b.curaParceiro) p.push(`se bloquear, ${oNome(par)} recupera ${b.curaParceiro}`);
  if (b.alcance) p.push(`se bloquear, +${b.alcance} alcance`);
  if (b.alcanceParceiro) p.push(`se bloquear, +${b.alcanceParceiro} alcance para ${oNome(par)}`);
  if (b.ci) p.push(`se bloquear, ${anda(b.ci)}`);
  if (b.recomenda) p.push(`se bloquear, passa a Recomendação para ${oNome(recebe)}`);
  if (b.resolve) p.push(`se bloquear, tira ${conflitosTxt(b.resolve)} do seu time`);
  if (h.alcance) p.push(`se acertar, +${h.alcance} alcance`);
  if (h.cura) p.push(`se acertar, recupera ${h.cura}`);
  if (h.conflitos) p.push(`se acertar, +${conflitosTxt(h.conflitos)} ${noRival}`);
  if (a.alcance) p.push(`+${a.alcance} alcance`);
  if (a.alcanceParceiro) p.push(`+${a.alcanceParceiro} alcance para ${oNome(par)}`);
  if (c.preco) p.push(`${oNome(eu)} perde ${c.preco} de vida`);
  if (c.repost) p.push('Repost: a próxima carta do seu deck nesta rodada joga duas vezes');
  return `${p.map(maiuscula).join('. ')}.`;
}

// O número do canto (a primeira regra que casa). `tipo` diz o ícone: um truque de Force push mostra o do Force push.
export function selo(c) {
  const s = (texto, tipo) => ({ texto, tipo });
  if (c.tipo === 'ataque') return s(`${c.dano}`, 'ataque');
  if (c.tipo === 'defesa') return s('tudo', 'defesa');
  if (c.forcePush) return s(`${c.forcePush}`, 'forcePush');
  if (c.rouba) return s(`${MENOS}${c.rouba}`, 'rouba');
  if (c.conflitos) return s(`#${c.conflitos}`, 'conflitos');
  if (c.repost) return s('2×', 'repost');
  if (c.recomenda) return s('★', 'recomenda');
  if (c.resolve) return s(`${MENOS}#${c.resolve}`, 'resolve');
  if (c.ci) return s(`◔${c.ci}`, 'ci');
  const alcance = c.alcance || c.alcanceTime || c.alcanceParceiro;
  if (alcance) return s(`+${alcance}`, 'alcance');
  return s(`♥${c.curaParceiro || c.cura || 0}`, 'cura');
}

// O texto curto que salta ao lado da cabeça quando um evento cai (§6.8).
function textoDoEvento(e) {
  const sinal = n => (n > 0 ? `+${n}` : `${MENOS}${-n}`);
  if (e.tipo === 'hit') return e.held !== undefined ? 'segurou' : e.token ? 'Recomendação' : `${MENOS}${e.n}`;
  if (e.tipo === 'heal') return `+${e.n}`;
  if (e.tipo === 'alc') return `${e.cosmo ? 'café: ' : ''}${sinal(e.n)} alcance`;
  if (e.tipo === 'token') return 'Recomendação';
  if (e.tipo === 'ring') return e.to === REGRAS.anel ? 'o CI fechou' : `CI ${e.to} de ${REGRAS.anel}`;
  if (e.tipo === 'hate') return `${e.n > 0 ? '+' : MENOS}${conflitosTxt(Math.abs(e.n))}`;
  if (e.tipo === 'mark') return 'de pé!';
  if (e.tipo === 'cancel') return 'fora do ar';
  return '';
}

// O resumo no pé de uma carta, a partir dos eventos de uma parte do lance (a passada ou o eco).
function resumoDaCarta(c, s, eventos, lutador) {
  const meus = eventos.filter(e => e.card === c.uid), golpes = meus.filter(e => e.tipo === 'hit');
  const nome = (lado, i) => oNome(lutador(lado, i));
  const soma = lista => lista.reduce((t, e) => t + e.n, 0);
  const comMarco = (texto, lado, i) => {
    const m = eventos.find(e => e.tipo === 'mark' && e.lado === lado && e.lutador === i);
    return m ? `${texto}, para no marco ${m.at}` : texto;
  };
  const QUATRO = [[0, 0], [0, 1], [1, 0], [1, 1]];
  const p = [];
  for (const [lado, i] of QUATRO) {   // ataque e Force push somados, por lutador atingido
    const n = soma(golpes.filter(e => !e.self && !e.counter && e.lado === lado && e.lutador === i));
    if (n > 0) p.push(comMarco(`${nome(lado, i)} perde ${n}`, lado, i));
  }
  for (const e of golpes) if (e.token) p.push(`a Recomendação salvou ${nome(e.lado, e.lutador)}`);
  for (const e of golpes) if (e.held !== undefined) p.push(`${nome(e.lado, e.lutador)} segurou tudo`);
  for (const e of golpes) if (e.self) p.push(comMarco(`${nome(e.lado, e.lutador)} perde ${e.n}`, e.lado, e.lutador));
  if (c.tipo === 'defesa') {
    const segurou = eventos.filter(e => e.tipo === 'hit' && e.lado === s && e.lutador === c.lutador && e.held !== undefined)
      .reduce((t, e) => t + e.held, 0);
    p.push(segurou ? `segurou ${segurou}` : 'ninguém atacou');
  }
  for (const e of golpes) if (e.counter) p.push(comMarco(`devolveu ${e.n}`, e.lado, e.lutador));
  const roubou = -soma(meus.filter(e => e.tipo === 'alc' && e.lado !== s && e.n < 0));
  if (roubou) p.push(`roubou ${roubou} de alcance`);
  for (const e of meus) if (e.tipo === 'token' && e.use === 'give') p.push(`Recomendação para ${nome(e.lado, e.lutador)}`);
  const pos = soma(meus.filter(e => e.tipo === 'hate' && e.lado !== s));
  const neg = -soma(meus.filter(e => e.tipo === 'hate' && e.lado === s));
  if (pos) p.push(`+${conflitosTxt(pos)}`);
  if (neg) p.push(`${MENOS}${conflitosTxt(neg)}`);
  const ci = meus.filter(e => e.tipo === 'ring');
  if (ci.some(e => e.to === REGRAS.anel)) p.push('o CI fechou');
  if (ci.length && ci.at(-1).to !== REGRAS.anel) p.push(`CI ${ci.at(-1).to} de ${REGRAS.anel}`);
  for (const [tipo, palavra] of [['heal', 'vida'], ['alc', 'alcance']]) {
    for (const i of [0, 1]) {   // ganhos do próprio time (o alcance roubado entra aqui)
      const n = soma(meus.filter(e => e.tipo === tipo && e.lado === s && e.lutador === i && e.n > 0));
      if (n) p.push(`${nome(s, i)} +${n} ${palavra}`);
    }
  }
  return p.join(', ') || (c.tipo === 'ataque' ? '' : 'nada mudou');
}

// resumir(evento) → o texto do pop; resumir(lance, { eco }) → [resumo da carta do lado 0, do lado 1]. Com eco, só a
// 2ª passada (o Repost) e só para a carta que jogou duas vezes; sem eco, a passada de todos.
export function resumir(x, { eco = false } = {}) {
  if (x.tipo) return textoDoEvento(x);
  const ref = x.cartas[0] ?? x.cartas[1];
  const times = x.cartas[0] ? [ref.time, rival(ref.time)] : [rival(ref.time), ref.time];
  const lutador = (lado, i) => TIMES[times[lado]].lutadores[i];
  const eventos = x.eventos.filter(e => !!e.echo === eco);
  return x.cartas.map((c, s) => (c && (!eco || x.duas?.[s]) ? resumoDaCarta(c, s, eventos, lutador) : ''));
}
