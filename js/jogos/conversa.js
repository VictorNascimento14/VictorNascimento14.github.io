// A conversa com o escultor (Fase 2). Depois da escultura, clicar nele abre a caixa de fala ao lado dele (encaixada
// no pé da tela no celular), com o que ele tem a dizer naquela parte da página, respostas sugeridas (chips) e, ao
// contrário do original, um campo para perguntar o que quiser sobre o Victor. Um "!" pula sobre a cabeça quando há
// novidade ali. Com a caixa aberta, tudo o que ele diria no balão vai para dentro dela.
// API em docs/arquitetura.md §10; números e textos-base da spec 06 (§3.2, §4.8, §5.3, §6.3–6.8, §7.3, §8.1).
// O topo do módulo é puro, para os testes no Node (normalizar, intencao, INTENCOES, RESPOSTAS, HISTORIAS): o que mexe
// no DOM (mascote, rolagem, movimento, conquistas, projetos) só é importado dentro de iniciar().
import { perfil, projetos } from '../dados/perfil.js';
import { github, numeroPt, porcentagem } from '../dados/redes.js';
import { CONQUISTAS, LIMIAR_PRATA } from '../dados/conquistas.js';
import { PES } from '../arte/escultor.js';
import { encaixar, limitar } from '../nucleo/pixel.js';
import { emitir, ouvir } from '../nucleo/sinais.js';
import { acordar } from '../nucleo/relogio.js';

const LIMITE = 140;               // caracteres por mensagem
const LETRAS_POR_SEGUNDO = 60;    // a datilografia da fala
const PENSANDO = '…';             // por 380 ms + até mais 380 antes de cada resposta
const JANELA_DAS_COCEGAS = 1400;  // ms: cutucar de novo dentro disso, com a caixa aberta, vira cócega escrita
const FARO = 5;                   // acertos seguidos no quiz que valem a conquista
const ESTREITA = 560;             // abaixo disso a caixa encaixa no pé da tela
const LIVRE_EM_CIMA = 64;         // a caixa só fica acima da cabeça se sobrar isso até o topo (o HUD mora ali)

// As partes da página, na ordem em que aparecem (a de projetos é a tela do pórtico em volta da seção).
const PARTES = [['inicio', '#inicio'], ['projetos', '#projetos'], ['ano', '#ano'], ['redes', '#redes'], ['contato', '#contato']];

// ---------- texto ----------

// Minúsculas, sem acento, só letras, dígitos, espaço e @ / . - (o resto vira espaço). Vazio → null (nada é enviado).
export function normalizar(texto) {
  const t = String(texto ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9@/. -]+/g, ' ').replace(/\s+/g, ' ').trim();
  return t || null;
}

// O teclado do celular abrevia: troca antes de casar, palavra por palavra (a normalização fica como a da spec).
const ABREVIACOES = {
  vc: 'voce', vcs: 'voces', voc: 'voce', oq: 'o que', oque: 'o que', q: 'que', pq: 'por que', pra: 'para',
  tb: 'tambem', tbm: 'tambem', eh: 'e', vlw: 'valeu', flw: 'falou', obg: 'obrigado', obgd: 'obrigado',
  brigado: 'obrigado', tmj: 'tamo junto', msm: 'mesmo', td: 'tudo', blz: 'beleza', 'i.a': 'ia',
};
const expandir = t => t.split(' ').map(p => ABREVIACOES[p.replace(/\.+$/, '')] ?? p).join(' ');

const TRYNUX = 'tr[iy]nu[xs]';
const re = (...partes) => new RegExp(partes.join('|'));

// Em ordem: a primeira que casar vence. Por isso o específico vem antes do geral ("trabalhar com ele" é contato, não
// trabalho; "que site lindo" é elogio, não o site; "oi, quem é você?" é quem). Sobre o texto já normalizado e expandido.
export const INTENCOES = [
  // O comando do console digitado aqui (no celular não há console, e a medalha Dev não pode ficar impossível).
  ['console', /^(window\.)?escultor\.(oi|ola)$/],
  ['segredo', /\b(eure(c|k|ck)a|deploy|konami)\b/],
  ['sudo', /^sudo\b|\brm -rf\b|\b(root|chmod)\b/],
  ['admin', /\badmin|\b(login|senha)\b|\bhack|\barea restrita\b/],
  ['robo', re(
    String.raw`\b(voce|tu|isso|isto|esse chat|este chat) (e|es) (o |um |uma )?(robo|bot|chatbot|ia|chat ?gpt|gpt|claude|gemini|inteligencia artificial|maquina|programa)\b`,
    String.raw`\b(voce|tu) (usa|tem|roda) (uma )?(ia|gpt|chat ?gpt|llm)\b`,
    String.raw`\bcomo (voce|tu) (foi feito|funciona|responde|sabe)\b`,
  )],
  ['quem', re(
    String.raw`\bquem (e|es|sera) (voce|tu)\b`, String.raw`\b(voce|tu) (e|es) quem\b`, String.raw`\b(seu|teu) nome\b`,
    String.raw`\bcomo (voce|tu) se chama`,
    String.raw`\bo que (voce|tu) (e|es|faz)\b`, String.raw`\b(voce|tu) (e|es) (um|uma|o)\b`,
    String.raw`\bescultor`, String.raw`\bmascote`, String.raw`\bajudante\b`,
  )],
  // os cinco projetos, pelo nome, pelo que fazem e pelo número da caixa
  ['processual', re(
    String.raw`\bprocess?ual`, String.raw`\bprocess? ?ia\b`, String.raw`\bprazos?\b`, String.raw`\bpublicac`,
    String.raw`\bdiario oficial`, String.raw`\baudiencias?\b`, String.raw`\bminutas?\b`, String.raw`\bpecas?\b`,
    String.raw`\bjurisprud`, String.raw`\bcaixa (1|i|um)\b`,
  )],
  ['chat', re(
    String.raw`\bchat\b`, `\\bchat ?${TRYNUX}`, String.raw`\batendimento`, String.raw`\bkanban`,
    String.raw`\binstancias?\b`, `\\bwhats?app (da|do) ${TRYNUX}`, String.raw`\bcaixa (2|ii|dois)\b`,
  )],
  ['viral', re(
    String.raw`\bviral`, String.raw`\bcarross`, String.raw`\breels?\b`, String.raw`\bstories\b`,
    String.raw`\bconteudos?\b`, String.raw`\bvideo curto`, String.raw`\bwebcodecs`, String.raw`\bjev\b`,
    String.raw`\bcaixa (3|iii|tres)\b`,
  )],
  ['decalque', re(
    String.raw`\bdecal`, String.raw`\bextens(ao|oes)\b`, String.raw`\bplugin`, String.raw`\bchrome\b`,
    String.raw`\bfigma`, String.raw`\bdesign ?system`, String.raw`\btokens?\b`, String.raw`\bpinca\b`,
    String.raw`\bcaixa (4|iv|quatro)\b`,
  )],
  ['lab', re(
    String.raw`\blab\b`, `\\b${TRYNUX} ?lab`, String.raw`\bcomercial`, String.raw`\bleads?\b`, String.raw`\bclosers?\b`,
    String.raw`\bfechamentos?\b`, String.raw`\branking`, String.raw`\btv\b`, String.raw`\bcheck ?-?in\b`,
    String.raw`\bcobranca`, String.raw`\bpix\b`, String.raw`\bcaixa (5|v|cinco)\b`,
  )],
  ['quiz', /\bquiz|\bfaro\b|\bde que caixa|\badivinh|\bapost(a|o)\b|\bhistorias?\b/],
  ['velha', /\bvelha\b|\btic ?-?tac/],
  ['jogar', /\bjog|\bbrinc|\bgames?\b|\bentediad|\btedio\b|\bcopinho|\bdesafi|\bcabo de guerra|\bcorda\b|\bduelo|\bcartas?\b|\bdiversao/],
  ['inventario', re(
    String.raw`\binventario`, String.raw`\bequipament`, String.raw`\bficha\b`, String.raw`\bskins?\b`,
    String.raw`\bboina`, String.raw`\belmo\b`, String.raw`\bcareca`, String.raw`\bmetal\b`,
    String.raw`\btroca(r)? (de |o |a )?(cor|visual|roupa|cabeca)\b`, String.raw`\bvira(r)? (de )?(prata|ouro|bronze)\b`,
  )],
  ['conquistas', /\bconquist|\bmedalh|\btrofeu|\bpremi|\bmoedas?\b|\b(ouro|prata|bronze)\b/],
  ['segredos', /\bsegredo|\beaster|\bescondid|\bdicas?\b|\bmisteri|\bsurpresa|\bsecret/],
  ['contato', re(
    String.raw`\bcont[ae]t`, String.raw`\be-?mails?\b`, String.raw`\be mail\b`, String.raw`\bwhats`, String.raw`\bwpp\b`,
    String.raw`\bzap\b`, String.raw`\b(telefone|celular)\b`, String.raw`\bnumero (dele|do vi[ck]?tor|de (telefone|celular|whats))`,
    String.raw`\bcontrat`, String.raw`\borcamento`, String.raw`\bfreela`, String.raw`\bpropostas?\b`, String.raw`\bvagas?\b`,
    String.raw`\brecrut`, String.raw`\bentrevist`, String.raw`\boportunidade`, String.raw`\bdisponivel`,
    String.raw`\bfalar com (ele|o vi[ck]?tor)`, String.raw`\btrabalhar (com|junto|para)\b`,
  )],
  ['curriculo', /\bcurricul|\bcv\b|\bresume\b|\blattes/],
  ['pessoal', /\bidade\b|\bquantos anos|\bmora\b|\bmorar\b|\bcidade|\bnamor|\bcasad|\bsolteir|\bfilhos?\b|\bsigno|\baniversario|\bnasceu|\bhobb/],
  ['numeros', /\bprs?\b|\bpull ?requests?|\bcommits?\b|\bcontribui|\bplaca\b|\bpinos?\b|\bprodutiv/],
  ['redes', /\blinke?d ?i[nm]\b|\bgit ?hub|\bgitub|\bredes?\b|\bsociais|\bseguidor|\bcoliseu|\barena\b|\binsta|\btwitter|\byoutube|\btiktok/],
  ['ia', re(
    String.raw`\bias?\b`, String.raw`\binteligencia`, String.raw`\bagentes?\b`, String.raw`\bllms?\b`, String.raw`\bgpt`,
    String.raw`\bchat ?gpt`, String.raw`\bclaude\b`, String.raw`\bcopilot`, String.raw`\bopenrouter`, String.raw`\bdeepseek`,
    String.raw`\bmodelos?\b`, String.raw`\bprompts?\b`, String.raw`\bvibe`, String.raw`\bevals?\b`, String.raw`\bautomac`,
  )],
  ['stack', re(
    String.raw`\bstack`, String.raw`\btecnolog`, String.raw`\blinguage`, String.raw`\bferrament`, String.raw`\bframeworks?\b`,
    String.raw`\breact`, String.raw`\bnext`, String.raw`\btype ?script`, String.raw`\bts\b`, String.raw`\bjava ?script`,
    String.raw`\bjs\b`, String.raw`\bnode`, String.raw`\bpostgres`, String.raw`\bsupabase`, String.raw`\bbanco de dados`,
    String.raw`\bsql\b`, String.raw`\brls\b`, String.raw`\bpgtap`, String.raw`\btestes?\b`, String.raw`\bvitest`,
    String.raw`\bplaywright`, String.raw`\bpython`, String.raw`\bgolang`, String.raw`\bfront ?-?end`, String.raw`\bback ?-?end`,
    String.raw`\bfull ?-?stack`, String.raw`\bhtml`, String.raw`\bcss\b`, String.raw`\bvercel`, String.raw`\bgit\b`,
    String.raw`\bdocker`, String.raw`\btailwind`, String.raw`\bvite\b`, String.raw`\bprograma (em|com)\b`,
  )],
  ['estudos', /\bestud|\bfacul|\bcursos?\b|\bformac|\bformad|\bgradua|\buniversi|\bdiploma|\balunos?\b|\bsemestre|\bcertifica/],
  ['trabalho', re(
    String.raw`\btrabalh(a|o|ou|am|ando|ar)?\b`, String.raw`\bempresa`, String.raw`\bempreg`, `\\b${TRYNUX}\\b`,
    String.raw`\bcampelo`, String.raw`\bescritorio`, String.raw`\badvoca`, String.raw`\badvogad`, String.raw`\bjuridic`,
    String.raw`\bclientes?\b`, String.raw`\bexperiencia`, String.raw`\bcargo\b`, String.raw`\bprofiss`,
  )],
  ['projetos', /\bprojet|\bporti?folio|\bcaixas?\b|\bcases?\b|\bsistemas?\b|\bprodutos?\b|\bentregas?\b|\btrabalhos\b|\bapps?\b|\baplicativ/],
  ['elogio', /\b(legal|lindo|linda|massa|top|show|demais|foda|maneiro|brabo|sensacional|perfeito|perfeita|bacana|daora)\b|\bincrivel|\bbonit|\birad|\bcurti|\bgostei|\bamei\b|\bparabens/],
  ['valeu', /\bobrigad|\b(valeu|thanks?|thx|tamo junto)\b/],
  ['tchau', /\btchau|\b(falou|adeus|bye)\b|\bate (mais|logo|breve|a proxima)\b/],
  ['victor', re(
    String.raw`\bvi[ck]?tor`, String.raw`\bnascimento\b`, String.raw`\b(dono|autor)\b`,
    String.raw`\bquem (fez|criou|desenvolveu|programou|construiu)`, String.raw`\bele (e|faz)\b`, String.raw`\bquem e ele\b`,
    String.raw`\bengenheir`, String.raw`\bdesenvolvedor`, String.raw`\bprogramador`, String.raw`\bdev\b`, String.raw`\bsobre ele\b`,
  )],
  ['site', /\bsite\b|\bpixel|\bcodigo|\bfeito (com|em)\b|\bcomo (foi feito|fez|fizeram)\b|\bateli|\bcanvas|\bo que e (isso|isto|aqui)\b/],
  ['ajuda', /\bajud|\bhelp\b|\bsocorro|\bcomandos?\b|\bmenu\b|\bopcoes\b|\bo que (eu )?(posso|da para|consigo|devo) (fazer|perguntar)|\bpergunt/],
  ['tudobem', /\btudo (bem|bom|certo|joia|tranquilo|em cima)\b|\bcomo vai\b|\bcomo (voce|tu) (ta|esta|vai)\b|^beleza\b/],
  ['oi', /^(o+i+|ola+|e ai|eai|eae|iae|opa|salve|bom dia|boa tarde|boa noite|hey|hi|hello|fala|alo)\b/],
];

// id da intenção, 'nada' se nenhuma casar, null se o texto for vazio.
export function intencao(texto) {
  const n = normalizar(texto);
  if (!n) return null;
  const t = expandir(n);
  return INTENCOES.find(([, padrao]) => padrao.test(t))?.[0] ?? 'nada';
}

// "texto {{palavras|url}} texto" → [{ texto }, { texto, url }, …]. Só http(s) e mailto viram link, como no balão.
export function partir(texto) {
  const partes = [];
  for (const trecho of String(texto ?? '').split(/(\{\{[^}]+\}\})/)) {
    if (!trecho) continue;
    const link = trecho.match(/^\{\{([^|}]+)\|([^}]+)\}\}$/);
    if (link && /^(https?:|mailto:)/i.test(link[2])) partes.push({ texto: link[1], url: link[2] });
    else partes.push({ texto: link ? link[1] : trecho });
  }
  return partes;
}
const semLinks = texto => partir(texto).map(p => p.texto).join('');

// ---------- o que ele diz ----------

const NOME = perfil.nome;
const ANO = github.de.slice(0, 4);
const PRS = numeroPt(github.pullRequests);
const EMAIL = perfil.email;
const caixaDe = id => projetos.findIndex(p => p.id === id);
// Os PRs que o Victor abriu em cada projeto e o total dele: os mesmos números do cartão, de js/dados/perfil.js.
const prsDe = (id, campo = 'prs') => numeroPt(projetos.find(p => p.id === id)?.[campo] ?? 0);
const emLista = nomes => `${nomes.slice(0, -1).join(', ')} e ${nomes.at(-1)}`;
const sortear = lista => lista[Math.floor(Math.random() * lista.length)];

// Os seis assuntos sugeridos: cada um manda um texto fixo pelo mesmo casamento de intenções.
export const TOPICOS = [
  { rotulo: 'Quem é você?', texto: 'quem é você?', id: 'quem' },
  { rotulo: `Quem é o ${NOME}?`, texto: `quem é o ${NOME}?`, id: 'victor' },
  { rotulo: 'Projetos', texto: 'projetos', id: 'projetos' },
  { rotulo: 'Stack', texto: 'qual a stack?', id: 'stack' },
  { rotulo: 'Jogos', texto: 'jogos', id: 'jogar' },
  { rotulo: 'Contato', texto: 'contato', id: 'contato' },
];

// Chip = [rótulo, ação, legenda?]: ação texto = link externo; função = botão.
const pergunta = (rotulo, texto) => [rotulo, () => enviar(texto)];
const topicos = (sem = null) => TOPICOS.filter(t => t.id !== sem).map(t => pergunta(t.rotulo, t.texto));
const ir = (rotulo, parte) => [rotulo, () => irA(parte)];
const abrirCaixaChip = id => [`abrir a caixa ${projetos[caixaDe(id)]?.numeral ?? ''}`.trim(), e => abrirCaixa(caixaDe(id), e)];
const LINKS = {
  github: ['GitHub', perfil.github.url],
  linkedin: ['LinkedIn', perfil.linkedin.url],
  viral: ['viral.trynux.com', 'https://viral.trynux.com'],
  decalque: ['ver o código', `${perfil.github.url}/Decalque`],
};
const medalheiro = (rotulo = 'ver o medalheiro', aba = 'med') => [rotulo, () => abrirMedalheiro(aba)];
const linkDoEmail = `{{${EMAIL}|mailto:${EMAIL}}}`;

const COCEGAS = ['Ei!', 'SEM CÓCEGAS!!!', 'Se continuar eu quebro, viu!', 'Para!', 'Eu sinto isso, sabia?!'];

function saudacao() {
  if (!medalhas?.tem?.('papo')) return `Oi! Pode perguntar o que quiser sobre o ${NOME}. Eu respondo o que sei.`;
  return new Date().getHours() < 5 ? 'Você de novo. E de madrugada!' : sortear(['Fala!', 'Oi de novo!', 'Pergunta aí!']);
}

// Cada resposta: { fala, chips?, topicos? } (topicos: false tira os assuntos do fim). Texto do Victor, no tom do
// mascote: curto, brincalhão e só com o que é público (sigilo: arquitetura §0.7).
export const RESPOSTAS = {
  console: () => {
    medalhas?.desbloquear?.('console', caixa);   // vale como falar pelo console
    return { fala: 'Oi, dev! Esse comando é do console, mas aqui também atendo. O código tá todo aberto: pode olhar!' };
  },
  segredo: () => ({ fala: 'Isso não se fala, se digita. Fora daqui, em qualquer lugar do site.' }),
  sudo: () => ({ fala: sortear(['Sudo não funciona aqui. O mármore é meu!', 'Permissão negada. Eu sou o root deste ateliê!']) }),
  admin: () => ({ fala: 'Tem uma porta em /admin. Ninguém entra lá. Ou quase ninguém...' }),
  robo: () => ({
    fala: `Nada de IA aqui: sou de bronze! Respondo com o que o ${NOME} me ensinou. A IA ele guarda para os sistemas.`,
    chips: [pergunta('Como ele usa IA?', 'como ele usa IA?')],
  }),
  quem: () => ({ fala: `Sou o escultor do ateliê: de bronze, com asas, cinzel e maço. Fui eu que esculpi o retrato do ${NOME} lá em cima!` }),
  processual: () => ({
    fala: `O Processual é a gestão processual da Trynux, em uso na Campêlo Advocacia: prazos, publicações e a Process IA, que redige peças. O ${NOME} abriu ${prsDe('processual')} dos ${prsDe('processual', 'total')} PRs!`,
    chips: [abrirCaixaChip('processual')],
  }),
  chat: () => ({
    fala: `O chat.trynux é o atendimento por WhatsApp da Trynux, com agentes de IA que atendem, agendam e mandam o contrato. Ele abriu ${prsDe('chat')} dos ${prsDe('chat', 'total')} PRs.`,
    chips: [abrirCaixaChip('chat')],
  }),
  viral: () => ({
    fala: 'O Trynux Viral transforma o que o público de um advogado teme e quase nunca diz em carrossel, reels e vídeo curto. Do primeiro commit à produção em um dia!',
    chips: [LINKS.viral, abrirCaixaChip('viral')],
  }),
  decalque: () => ({
    fala: `O Decalque é uma extensão para Chrome que lê qualquer site, ou um Figma, e devolve o design system dele. Código aberto, publicado em ${prsDe('decalque')} PRs num dia só!`,
    chips: [LINKS.decalque, abrirCaixaChip('decalque')],
  }),
  lab: () => ({
    fala: `O Trynux Lab é onde a operação comercial do escritório acontece: leads, agenda dos closers, fechamentos e ranking na TV. Ele abriu ${prsDe('lab')} dos ${prsDe('lab', 'total')} PRs.`,
    chips: [abrirCaixaChip('lab')],
  }),
  quiz: () => ({
    fala: 'Aposto que você não sabe de que caixa é cada história. Topa?',
    chips: [['duvido', comecarQuiz], ['agora não', fechar]],
    topicos: false,
  }),
  velha: () => ({ fala: 'A laje de mármore tá no campo, lá no Contato. Duvido você me ganhar no jogo da velha!', chips: [ir('ir ao Contato', 'contato')] }),
  jogar: () => ({
    fala: 'Os jogos moram no próprio site: as caixas escondem uma luz, o Coliseu tem uma corda e o campo tem uma laje de mármore. E eu tenho um quiz!',
    chips: [['o quiz', comecarQuiz], medalheiro()],
  }),
  inventario: () => ({
    fala: 'Minha ficha fica no medalheiro, na primeira aba. Lá dá para trocar meu metal e o que eu tenho na cabeça.',
    chips: [medalheiro('abrir a ficha', 'inv')],
  }),
  conquistas: () => {
    const n = medalhas?.quantas?.() ?? 0, todas = CONQUISTAS.length;
    const falta = k => (k === 1 ? 'Falta 1' : `Faltam ${k}`);
    const fala = n >= todas ? `${n} de ${todas}. Tudo! Virei de ouro, e o ateliê inteiro também.`
      : n >= LIMIAR_PRATA ? `${n} de ${todas}. Já sou de prata! ${falta(todas - n)} para o ouro.`
        : `${n} de ${todas}. ${falta(LIMIAR_PRATA - n)} para eu virar de prata.`;
    return { fala, chips: [medalheiro()] };
  },
  segredos: () => {
    const d = dica();
    return {
      fala: d ? `Tem, sim. Uma dica: ${d}` : 'Você já achou tudo! Não sobrou nem poeira de mármore.',
      chips: d ? [['outra dica', outraDica], medalheiro()] : [medalheiro()],
    };
  },
  contato: () => ({
    fala: `O jeito mais rápido é o e-mail: ${linkDoEmail}. Ou escolhe uma porta lá no Contato.`,
    chips: [['copiar o e-mail', copiarEmail], ir('ir ao Contato', 'contato'), LINKS.linkedin, ...whatsapp()],
  }),
  curriculo: () => ({
    fala: 'Currículo eu não guardo, sou escultor! O LinkedIn conta a trajetória dele, e o GitHub mostra o trabalho.',
    chips: [LINKS.linkedin, LINKS.github],
  }),
  pessoal: () => ({ fala: 'Isso é com ele! Eu só sei o que sai do ateliê: projetos, stack, estudos. Pergunta aí!' }),
  numeros: () => ({
    fala: `Em ${ANO} foram ${PRS} PRs, ${porcentagem(github.mergeados / github.pullRequests)} mergeados, em ${github.repositorios} repositórios. No maior dia, ${github.maiorDia.pullRequests}! Eu contei um por um.`,
    chips: [ir('ver a placa', 'ano'), LINKS.github],
  }),
  redes: () => ({
    fala: 'No LinkedIn ele conta o trabalho; no GitHub, faz. No Coliseu, os dois brigam!',
    chips: [LINKS.github, LINKS.linkedin, ir('ver o Coliseu', 'redes')],
  }),
  ia: () => ({
    fala: `Ele programa com agentes de código todo dia e confere o que eles entregam: eval antes de trocar modelo, teste e revisão em cada PR. Foram ${PRS} PRs só em ${ANO}!`,
    chips: [pergunta('Quantos PRs?', 'quantos PRs?')],
  }),
  stack: () => ({ fala: 'Na tela, TypeScript, React e Next.js. Embaixo, Postgres no Supabase, com RLS, Edge Functions e pgTAP. A IA passa pelo OpenRouter. E este ateliê é HTML, CSS e JavaScript puro!' }),
  estudos: () => ({
    fala: 'Ele estuda Engenharia de Software. E não esperou o diploma: já opera sistemas em produção enquanto estuda.',
    chips: [pergunta('Onde ele trabalha?', 'onde ele trabalha?')],
  }),
  trabalho: () => ({
    fala: 'Ele constrói e opera os produtos da Trynux e os sistemas da Campêlo Advocacia: processos, WhatsApp, conteúdo com IA e a operação comercial do escritório.',
    chips: [ir('ver os projetos', 'projetos')],
  }),
  projetos: () => ({
    fala: `São ${projetos.length} caixas: ${emLista(projetos.map(p => p.nome))}. Cada uma guarda uma história por trás da entrega.`,
    chips: [ir('ver as caixas', 'projetos'), ...projetos.map(p => pergunta(p.nome, `o que é o ${p.nome}?`))],
    topicos: false,
  }),
  elogio: () => ({ fala: sortear([`Valeu! O ${NOME} vai gostar de saber. Eu fiz a parte difícil!`, 'Eu sei. Bronze não mente!']) }),
  valeu: () => ({ fala: sortear(['De nada!', 'Tamo junto!', 'Disponha! Esculpir fica mais fácil com companhia.']) }),
  tchau: () => ({ fala: 'Falou! Vou voltar a esculpir.', chips: [['tchau', fechar]], topicos: false }),
  victor: () => ({
    fala: `O ${NOME} é engenheiro de software full stack e IA. Estuda Engenharia de Software e já opera sistemas em produção para escritórios de advocacia, do Postgres à tela.`,
    chips: [pergunta('Estudos', 'o que ele estuda?'), pergunta('Onde trabalha', 'onde ele trabalha?'), pergunta('IA no dia a dia', 'como ele usa IA?')],
  }),
  site: () => ({ fala: `Este ateliê é o portfólio do ${NOME}: HTML, CSS e JavaScript puro, sem build nem biblioteca. Até eu sou desenhado pixel por pixel num canvas!` }),
  ajuda: () => ({ fala: `Pergunta sobre o ${NOME}: quem ele é, o que estuda, onde trabalha, os projetos, a stack ou como usa IA. Ou escolhe um assunto aí embaixo!` }),
  tudobem: () => ({ fala: 'Tudo ótimo! Bronze não enferruja. Pergunta aí!' }),
  oi: () => ({
    fala: new Date().getHours() < 5 ? 'Oi! Acordado essa hora? Eu também.'
      : sortear(['Oi! Pode perguntar.', 'Opa! Fala!', 'Oi! Tô ouvindo, mesmo sem orelha.']),
  }),
  nada: () => ({
    fala: sortear(['Não entendi. Sou de bronze, não de silício!', `Essa eu não sei. Pergunta sobre o ${NOME}, os projetos ou a stack.`,
      'Hmm. Isso eu não sei, só sei esculpir!']),
  }),
};

// O WhatsApp entra quando o número chegar em perfil.js (por enquanto é null e a casa do Contato diz "em breve").
const whatsapp = () => (perfil.whatsapp ? [['WhatsApp', `https://wa.me/${perfil.whatsapp}`]] : []);

// O quiz "De que caixa é essa história?": trechos reais dos cartões (o que o visitante pode ler nas caixas).
export const HISTORIAS = [
  { projeto: 'processual', trecho: 'Nenhuma troca de prompt ou de modelo entra sem passar por um eval de 35 casos. O primeiro mostrou que o defeito estava no juiz, não no gerador.' },
  { projeto: 'processual', trecho: 'Na lentidão ao trocar de aba, 1.432 navegações reais mostraram até 26 consultas ao banco por troca.' },
  { projeto: 'processual', trecho: 'Processos, prazos, audiências, publicações do diário oficial e uma IA que redige peças a partir do dossiê do caso.' },
  { projeto: 'chat', trecho: 'O histórico de algumas conversas sumia, e a pista era um número: a tela mostrava exatamente 30 mensagens.' },
  { projeto: 'chat', trecho: 'O detector de raciocínio vazado só conhecia inglês. Ganhou sinais em português e uma rede final que troca a fala por uma resposta segura.' },
  { projeto: 'chat', trecho: 'Várias instâncias numa tela, kanban por conversa e agentes de IA montados num canvas visual.' },
  { projeto: 'viral', trecho: 'Um modelo escreve; o outro toma decisões tipadas e só ficou com a que acertou num teste em português: a nota do post.' },
  { projeto: 'viral', trecho: 'O vídeo curto é editado e exportado no próprio navegador, com WebCodecs. O arquivo nunca sai do aparelho.' },
  { projeto: 'viral', trecho: 'Do primeiro commit à produção em um dia.' },
  { projeto: 'decalque', trecho: 'A interface é um painel lateral, não um popup, porque o popup fecha justo no clique de que a pinça precisa.' },
  { projeto: 'decalque', trecho: 'A revisão de cada diff achou 12 falhas de segurança, 6 delas altas, em código que já passava em lint e testes.' },
  { projeto: 'decalque', trecho: 'Site e Figma entram no mesmo modelo de dados, e todos os exportadores leem dele.' },
  { projeto: 'lab', trecho: 'A suspensão por falta de pagamento parecia um "if" no login. O corte entrou no db-pre-request do PostgREST, que cobre 100% das requisições.' },
  { projeto: 'lab', trecho: 'Quem sai do escritório não some do histórico: remover um membro grava um retrato dele e bane a conta em vez de apagá-la.' },
  { projeto: 'lab', trecho: 'Leads, agenda dos closers, check-in, fechamentos, metas e ranking na TV.' },
];

// ---------- estado (só depois de iniciar) ----------

let M = null;           // js/mascote.js
let medalhas = null;    // js/jogos/conquistas.js
let rolagem = null;     // js/nucleo/rolagem.js
let reduzido = () => false;
let caixa = null, corpo, eco, linha, dito, chips, campo, entrada, marca;
let telas = null;
const provedores = new Map();   // parte → [fn]
let pronto = false;             // o mascote virou companheiro e estacionou
let parteAberta = null;
let segmentos = [], total = 0, digitado = 0, desenhado = -1;   // a datilografia
let pensando = 0;               // o timer do "…"
let anuncio = 0;
let focoNosChips = false;
let ultimoCutucao = -Infinity, cocegas = 0;
let mensagens = 0, mensagensNoTotal = 0;   // nesta carga (vale para a conquista) e no placar
let abriu = false;
let espera = null;              // { parte, fn, ate }: abrir uma caixa depois que a rolagem chegar
let marcaVisivel = false, marcaParte, proximaOlhada = 0;
let dicasDadas = [];
const quiz = { atual: null, ultima: null, fila: [], seguidas: 0, melhor: 0, jogou: false };

// ---------- API ----------

// O que dizer numa parte: fn() → null | { fala, chips, novo?, larga? }. O primeiro provedor não nulo vence; as falas
// padrão desta trilha só valem quando nenhum outro tem o que dizer.
export function aqui(parte, fn) {
  if (!provedores.has(parte)) provedores.set(parte, []);
  provedores.get(parte).push(fn);
  return () => {
    const lista = provedores.get(parte) ?? [];
    const i = lista.indexOf(fn);
    if (i >= 0) lista.splice(i, 1);
  };
}

export const aberta = () => !!caixa && !caixa.hidden;

// A parte cuja tela contém a linha do meio da janela (topo ≤ meio < base), ou null.
export function ondeEstou() {
  if (typeof document === 'undefined') return null;
  telas ??= PARTES.map(([parte, seletor]) => [parte, document.querySelector(seletor)?.closest('.tela')]);
  const meio = innerHeight / 2;
  for (const [parte, tela] of telas) {
    if (!tela) continue;
    const r = tela.getBoundingClientRect();
    if (r.top <= meio && meio < r.bottom) return parte;
  }
  return null;
}

// Abre como se fosse pelo teclado (foca o 1º chip). Devolve se abriu (só depois da escultura).
export const abrir = () => abrirConversa(true);

export function fechar() {
  if (!aberta()) return;
  const tinhaFoco = caixa.contains(document.activeElement);
  caixa.hidden = true;
  clearTimeout(pensando);
  clearTimeout(anuncio);
  esquecerRetomada();
  pensando = 0;
  quiz.atual = null;
  parteAberta = null;
  digitado = total;
  dito.textContent = '';
  if (tinhaFoco) M.mascote.botao?.focus({ preventScroll: true });
  acordar();
}

// Escreve na caixa. chips omitido = mantém os atuais; [] = sem chips. opções.larga = chips em coluna (com a faixa).
// Com a caixa fechada só guarda (o próximo abrir() troca pelo que a parte tem a dizer).
export function dizer(texto, lista, opcoes = {}) {
  if (!caixa) return false;
  clearTimeout(pensando);
  pensando = 0;
  mostrar(texto, lista, { larga: opcoes.larga });
  return aberta();
}

// ---------- abrir e falar ----------

const podeConversar = () => pronto && !!M?.mascote.ativo && M.mascote.pronto && !document.body.classList.contains('falhou');

function consultar(parte) {
  const lista = provedores.get(parte) ?? [];
  for (const fn of [...lista]) {
    try {
      const v = fn();
      if (v) return v;
    } catch (erro) {
      // Um provedor quebrado sai da lista: o "!" pergunta a cada quarto de segundo e o console não pode encher.
      console.error(`[conversa] o que dizer em "${parte}" falhou:`, erro);
      lista.splice(lista.indexOf(fn), 1);
    }
  }
  return PADRAO[parte]?.() ?? { fala: saudacao(), chips: topicos() };
}

function abrirConversa(porTeclado) {
  if (!caixa || !podeConversar()) return false;
  if (aberta()) {
    if (porTeclado) setTimeout(focarPrimeiro);
    return true;
  }
  // Quem abriu quer conversar: o monólogo que ele fazia no balão para aqui.
  M.calar();
  parteAberta = ondeEstou();
  marcarAbertura();
  mostrarMarca(false);
  const v = consultar(parteAberta);
  caixa.hidden = false;
  mostrar(v.fala, v.chips ?? [], { larga: v.larga });
  posicionar();
  acordar();
  // Depois do quadro: quem abriu de dentro de uma janela (o medalheiro) devolve o foco antes de nós.
  if (porTeclado) setTimeout(focarPrimeiro);
  return true;
}

function focarPrimeiro() {
  if (!aberta()) return;
  (chips.querySelector('a, button') ?? entrada).focus({ preventScroll: true });
}

function marcarAbertura() {
  if (abriu) return;
  abriu = true;
  medalhas?.placar?.('papo', { abriu: true });
}

const jaAbriu = () => abriu || !!medalhas?.placar?.('papo')?.abriu;

// Troca a fala (datilografada) e, se vierem, os chips. eco: a pergunta que o visitante fez, em cima da resposta.
function mostrar(texto, lista, { larga = false, eco: perguntaFeita = null, interrompe = false } = {}) {
  if (!interrompe) esquecerRetomada();
  segmentos = partir(texto);
  total = segmentos.reduce((soma, p) => soma + p.texto.length, 0);
  digitado = reduzido() ? total : 0;
  desenharLinha();
  eco.hidden = !perguntaFeita;
  eco.textContent = perguntaFeita ? `você: ${perguntaFeita}` : '';
  if (lista !== undefined) desenharChips(lista, larga);
  anunciar(texto === PENSANDO ? '' : semLinks(texto));
  if (aberta()) {
    posicionar();
    acordar();
  }
}

// O que ele fala com a caixa aberta sem o visitante ter pedido (a vitrine dos projetos, um segredo, as cócegas) entra
// pelo tempo da fala e depois a caixa volta ao que mostrava: a pergunta do quiz ou a resposta não somem, e os chips
// continuam valendo para o texto que eles respondem.
let retomada = null;   // { segmentos, eco, ecoOculto, timer }

function interromper(texto, segundos) {
  retomada ??= { segmentos, eco: eco.textContent, ecoOculto: eco.hidden };
  clearTimeout(retomada.timer);
  mostrar(texto, undefined, { interrompe: true });
  retomada.timer = setTimeout(retomar, Math.max(1.2, segundos) * 1000);
}

function retomar() {
  const r = retomada;
  retomada = null;
  if (!r || !aberta()) return;
  segmentos = r.segmentos;
  total = digitado = segmentos.reduce((soma, p) => soma + p.texto.length, 0);
  desenharLinha();
  eco.hidden = r.ecoOculto;
  eco.textContent = r.eco;
  posicionar();
  acordar();
}

function esquecerRetomada() {
  clearTimeout(retomada?.timer);
  retomada = null;
}

// A linha inteira já ocupa o lugar desde o começo (o que falta digitar fica invisível): a caixa não cresce aos pulos.
// Ela é aria-hidden (o leitor de tela ouve a cópia inteira em `dito`), então os links dela ficam fora do Tab; o mesmo
// destino sempre existe num chip ou na página.
function desenharLinha() {
  let resta = Math.floor(digitado);
  const nos = [];
  for (const p of segmentos) {
    const visivel = p.texto.slice(0, Math.max(0, resta));
    const oculto = p.texto.slice(visivel.length);
    resta -= p.texto.length;
    let alvo = document.createDocumentFragment();
    if (p.url) {
      alvo = document.createElement('a');
      alvo.href = p.url;
      alvo.tabIndex = -1;
      if (!/^mailto:/i.test(p.url)) Object.assign(alvo, { target: '_blank', rel: 'noopener noreferrer' });
    }
    if (visivel) alvo.append(visivel);
    if (oculto) alvo.append(Object.assign(document.createElement('span'), { className: 'papo-oculto', textContent: oculto }));
    nos.push(alvo);
  }
  linha.replaceChildren(...nos);
  desenhado = Math.floor(digitado);
}

function desenharChips(lista, larga) {
  const foco = document.activeElement;
  const voltar = chips.contains(foco) || (foco === caixa && focoNosChips);
  chips.replaceChildren(...(lista ?? []).map(criarChip).filter(Boolean));
  chips.classList.toggle('larga', !!larga);
  if (!voltar) {
    focoNosChips = false;
    return;
  }
  // O chip com o foco sumiu: o foco vai para o primeiro chip novo, ou espera na caixa até eles chegarem.
  const primeiro = chips.querySelector('a, button');
  focoNosChips = !primeiro;
  (primeiro ?? caixa).focus({ preventScroll: true });
}

function criarChip(chip) {
  if (!chip) return null;
  const [rotulo, acao, legenda] = chip;
  const externo = typeof acao === 'string';
  if (externo && !/^https?:/i.test(acao)) return null;
  const el = document.createElement(externo ? 'a' : 'button');
  el.className = 'papo-chip';
  const nome = Object.assign(document.createElement('span'), { textContent: rotulo });
  el.append(nome);
  if (externo) {
    Object.assign(el, { href: acao, target: '_blank', rel: 'noopener noreferrer' });
    const seta = Object.assign(document.createElement('span'), { className: 'seta', textContent: '↗' });
    seta.setAttribute('aria-hidden', 'true');
    nome.append(seta);
  } else {
    el.type = 'button';
    el.addEventListener('click', e => {
      e.stopPropagation();
      acao?.(e);
    });
  }
  if (legenda) el.append(Object.assign(document.createElement('span'), { className: 'papo-legenda', textContent: legenda }));
  if (externo) el.append(Object.assign(document.createElement('span'), { className: 'sr-only', textContent: ' (abre em nova aba)' }));
  return el;
}

// A região viva só repete um aviso igual se o texto mudar: limpa e escreve de novo (e dá tempo de a caixa recém-aberta
// entrar na árvore de acessibilidade).
function anunciar(texto) {
  clearTimeout(anuncio);
  dito.textContent = '';
  if (texto && aberta()) anuncio = setTimeout(() => { dito.textContent = texto; }, 120);
}

// ---------- mensagens ----------

function enviar(texto) {
  const limpo = String(texto ?? '').trim().slice(0, LIMITE);
  if (!limpo || pensando || !aberta()) return false;
  const id = intencao(limpo);
  if (!id) return false;
  contarMensagem();
  // Com uma pergunta do quiz no ar, o nome (ou o número) de uma caixa é a resposta; "não sei" entrega o jogo.
  const resposta = quiz.atual && (caixaDoTexto(limpo, id) ?? (DESISTO.test(normalizar(limpo)) ? 'nenhuma' : null));
  if (resposta) {
    responderQuiz(resposta);
    return true;
  }
  quiz.atual = null;
  mostrar(PENSANDO, [], { eco: limpo });
  pensando = setTimeout(() => {
    pensando = 0;
    responder(id, limpo);
  }, 380 + Math.random() * 380);
  return true;
}

function responder(id, texto) {
  const r = (RESPOSTAS[id] ?? RESPOSTAS.nada)();
  const extras = r.chips ?? [];
  mostrar(r.fala, r.topicos === false ? extras : [...extras, ...topicos(id)], { eco: texto, larga: r.larga });
  pular();
}

function contarMensagem() {
  mensagens++;
  const salvo = Number(medalhas?.placar?.('papo')?.n) || 0;
  mensagensNoTotal = Math.max(salvo, mensagensNoTotal) + 1;
  medalhas?.placar?.('papo', { n: mensagensNoTotal });
  if (mensagens >= 3) medalhas?.desbloquear?.('papo', caixa);
}

// "Apagar meu progresso" (o sinal 'reset'): o que esta carga contou volta ao zero junto com o placar. Senão a próxima
// mensagem devolveria o Papo, e a próxima resposta do quiz regravaria o recorde. A pergunta no ar continua valendo.
function zerar() {
  mensagens = mensagensNoTotal = 0;
  abriu = false;
  dicasDadas = [];
  Object.assign(quiz, { seguidas: 0, melhor: 0, jogou: false });
}

const pular = () => {
  if (!reduzido()) M.mascote.ator?.pular();
  acordar();
};

// ---------- o que os chips fazem ----------

const telaDa = parte => document.querySelector(PARTES.find(([p]) => p === parte)?.[1])?.closest('.tela');

// Leva a página até a parte pela rolagem paginada (a mesma parada de um link #âncora).
function irA(parte) {
  fechar();
  const tela = telaDa(parte);
  if (!tela || !rolagem) return;
  const topo = tela.getBoundingClientRect().top + scrollY;
  rolagem.irPara(rolagem.paradas().findLast(y => y <= topo + 2) ?? Math.round(topo));
}

// Abre uma caixa de projeto: rola até o pórtico, se precisar, e pede ao anel (o mascote vem bater na tampa).
async function abrirCaixa(i, evento) {
  if (i < 0) return;
  const porTeclado = evento?.detail === 0;
  const naParte = ondeEstou() === 'projetos';
  if (naParte) fechar();
  else irA('projetos');
  let anel;
  try {
    ({ anelDeCaixas: anel } = await import('../secoes/projetos.js'));
  } catch {
    return;
  }
  if (!anel?.caixas?.length) return;
  const pedir = () => anel.abrir(i, porTeclado);
  if (naParte) pedir();
  else {
    espera = { parte: 'projetos', fn: pedir, ate: performance.now() + 2500 };
    acordar();
  }
}

function abrirMedalheiro(aba) {
  fechar();
  medalhas?.abrir?.(aba);
}

async function copiarEmail() {
  if (!navigator.clipboard?.writeText || !isSecureContext) {
    mostrar(`Não deu para copiar daqui. É ${linkDoEmail}.`);
    return;
  }
  try {
    await navigator.clipboard.writeText(EMAIL);
  } catch {
    mostrar(`Não deu para copiar. É ${linkDoEmail}.`);
    return;
  }
  interromper('Copiado!', 1.8);
  pular();
  // A moeda sai da caixa; o sinal é o mesmo do botão "copiar" do Contato (quem já deu a conquista não dá de novo).
  medalhas?.desbloquear?.('email', caixa);
  emitir('email-copiado', { de: 'conversa' });
}

// Uma dica de segredo ainda não achado, sem repetir até acabarem.
function dica() {
  const faltam = CONQUISTAS.filter(c => !medalhas?.tem?.(c.id));
  if (!faltam.length) return null;
  let novas = faltam.filter(c => !dicasDadas.includes(c.id));
  if (!novas.length) {
    dicasDadas = [];
    novas = faltam;
  }
  const c = sortear(novas);
  dicasDadas.push(c.id);
  return c.dica;
}

function outraDica() {
  const d = dica();
  mostrar(d ? `Outra: ${d}` : 'Você já achou tudo! Não sobrou nem poeira de mármore.');
}

// ---------- o quiz ----------

const NUMERAIS = [['1', 'i', 'um', 'primeira'], ['2', 'ii', 'dois', 'segunda'], ['3', 'iii', 'tres', 'terceira'],
  ['4', 'iv', 'quatro', 'quarta'], ['5', 'v', 'cinco', 'quinta']];
const DESISTO = /\b(nao sei|sei la|desisto|passo|pula|nenhuma)\b/;

// O projeto que o visitante digitou como resposta: pelo nome (intenção) ou pelo número da caixa.
function caixaDoTexto(texto, id) {
  if (projetos.some(p => p.id === id)) return id;
  const n = normalizar(texto)?.replace(/^(e )?(a |na |da )?(caixa )?/, '');
  const i = NUMERAIS.findIndex(formas => formas.includes(n));
  return i >= 0 ? projetos[i]?.id : null;
}

function placarDoFaro() {
  const p = medalhas?.placar?.('faro') ?? {};
  return { melhor: Math.max(Number(p.best) || 0, quiz.melhor), jogou: !!p.jogou || quiz.jogou };
}

function comecarQuiz() {
  quiz.jogou = true;
  perguntarQuiz();
}

function perguntarQuiz() {
  if (!quiz.fila.length) {
    quiz.fila = embaralhar(HISTORIAS.map((_, i) => i));
    // A última da rodada anterior não abre a seguinte.
    if (quiz.fila.at(-1) === quiz.ultima) quiz.fila.unshift(quiz.fila.pop());
  }
  quiz.ultima = quiz.fila.pop();
  quiz.atual = HISTORIAS[quiz.ultima];
  mostrar(`De que caixa é essa história? “${quiz.atual.trecho}”`,
    projetos.map(p => [p.nome, () => responderQuiz(p.id), `caixa ${p.numeral}`]));
}

function responderQuiz(id) {
  const h = quiz.atual;
  if (!h) return;
  quiz.atual = null;
  const certo = id === h.projeto;
  const nome = projetos.find(p => p.id === h.projeto)?.nome ?? h.projeto;
  quiz.seguidas = certo ? quiz.seguidas + 1 : 0;
  quiz.melhor = Math.max(placarDoFaro().melhor, quiz.seguidas);
  medalhas?.placar?.('faro', { jogou: true, best: quiz.melhor });
  let fala;
  if (id === 'nenhuma') {
    fala = `Era do ${nome}! Fica para a próxima.`;
  } else if (!certo) {
    fala = sortear([`Errou! Era do ${nome}. A sequência voltou para zero.`, `Quase! Era do ${nome}. Zerou a sequência.`]);
  } else if (quiz.seguidas === FARO) {
    fala = `${FARO} seguidas! Esse faro é de detetive.`;
    medalhas?.desbloquear?.('faro', caixa);
  } else {
    fala = `Acertou! Era do ${nome}. ${quiz.seguidas} ${quiz.seguidas === 1 ? 'seguida' : 'seguidas'}.`;
  }
  mostrar(fala, [['próxima', perguntarQuiz], ['chega', pararQuiz]]);
  if (certo) pular();
}

function pararQuiz() {
  quiz.atual = null;
  mostrar('Quando quiser revanche, é só me chamar!', topicos());
}

function embaralhar(lista) {
  for (let i = lista.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [lista[i], lista[j]] = [lista[j], lista[i]];
  }
  return lista;
}

// ---------- o que dizer em cada parte (o padrão, quando nenhum jogo tem nada) ----------

const PADRAO = {
  // Quem nunca abriu a conversa vê o "!" no começo: é o jeito de descobrir que ele conversa.
  inicio: () => ({ fala: saudacao(), chips: topicos(), novo: !jaAbriu() }),
  projetos: () => {
    const { melhor, jogou } = placarDoFaro();
    if (!jogou) {
      return { fala: 'Aposto que você não sabe de que caixa é cada história!', chips: [['duvido', comecarQuiz], ['agora não', fechar]], novo: true };
    }
    return {
      fala: `${projetos.length} caixas, ${projetos.length} projetos. Quer que eu abra uma?`,
      chips: [...projetos.map((p, i) => [p.nome, e => abrirCaixa(i, e), `caixa ${p.numeral}`]),
        ['o quiz', comecarQuiz, melhor ? `recorde: ${melhor}` : undefined]],
    };
  },
  ano: () => ({
    fala: `Essa placa é o ano do ${NOME} no GitHub: cada pino é um dia, e quanto mais brilha, mais trabalho saiu da pedra.`
      + (medalhas?.tem?.('golpe') ? '' : ' Psiu: o pino de hoje ainda espera um golpe.'),
    chips: [LINKS.github, ...topicos()],
  }),
  redes: () => ({
    fala: `No LinkedIn ele conta, no GitHub ele faz: ${PRS} PRs só em ${ANO}. Escolhe um lado!`,
    chips: [LINKS.github, LINKS.linkedin, ...topicos()],
  }),
  contato: () => ({
    fala: `Escolhe uma porta! A mais rápida é o e-mail: ${linkDoEmail}.`,
    chips: [['copiar o e-mail', copiarEmail], LINKS.linkedin, LINKS.github, ...whatsapp(), ...topicos('contato')],
  }),
};

// ---------- medalheiro ----------

// Registrados uma vez, com o placar lido na hora de desenhar (registrar de novo mudaria a ordem da lista).
function registrarDesafios() {
  medalhas?.jogo?.('conversa', {
    nome: 'Conversa', onde: 'clique no escultor',
    placar: () => {
      const n = Math.max(Number(medalhas.placar?.('papo')?.n) || 0, mensagensNoTotal);
      return n ? `${n} ${n === 1 ? 'mensagem' : 'mensagens'}` : '';
    },
    jogar: () => abrirConversa(true),
  });
  medalhas?.jogo?.('faro', {
    nome: 'De que caixa é essa história?', onde: 'na conversa com o escultor',
    placar: () => {
      const { melhor } = placarDoFaro();
      return melhor ? `recorde de ${melhor} ${melhor === 1 ? 'seguida' : 'seguidas'}` : '';
    },
    jogar: () => { if (abrirConversa(true)) comecarQuiz(); },
  });
}

// ---------- posição ----------

// A cabeça dele em px da janela, a partir da ponta do cinzel (o mesmo cálculo que põe o sprite no lugar): sem ler o
// layout e sem um quadro de atraso. O topo da cabeça é o topo do corpo, PES.y pixels de sprite acima dos pés.
function cabeca() {
  const a = M.mascote.ator, p = M.mascote.ponto, t = a.ponta(), pes = a.pes();
  const x = encaixar(p.x - t.x), y = encaixar(p.y - t.y);
  return { x: x + pes.x, topo: y + pes.y - PES.y * a.pixel, base: y + pes.y };
}

function posicionar() {
  if (!aberta() || !M.mascote.ator) return;
  const vv = window.visualViewport;
  const encaixada = innerWidth < ESTREITA;
  caixa.classList.toggle('acoplada', encaixada);
  if (encaixada) {
    // No pé da tela, acima do teclado virtual (o visualViewport encolhe quando ele abre).
    const fundo = Math.max(12, 12 + innerHeight - (vv ? vv.offsetTop + vv.height : innerHeight));
    caixa.style.translate = '';
    caixa.style.bottom = `${Math.round(fundo)}px`;
    caixa.style.maxHeight = `${Math.max(140, Math.round((vv?.height ?? innerHeight) - 24))}px`;
    caixa.classList.remove('abaixo');
    return;
  }
  const { largura, altura } = M.tamanhoDaTela();
  caixa.style.bottom = '';
  caixa.style.maxHeight = `${Math.max(140, altura - 24)}px`;
  const w = caixa.offsetWidth, h = caixa.offsetHeight, c = cabeca();
  const x = limitar(c.x - w / 2, 12, Math.max(12, largura - w - 12));
  const emCima = c.topo - h - 16;
  const cabe = emCima >= LIVRE_EM_CIMA;
  const y = cabe ? emCima : Math.max(12, Math.min(altura - h - 12, c.base + 12));
  caixa.classList.toggle('abaixo', !cabe);
  caixa.style.translate = `${encaixar(x)}px ${encaixar(y)}px`;
  caixa.style.setProperty('--rabicho-papo', `${Math.round(limitar(c.x - x, 14, w - 14))}px`);
}

// ---------- o "!" ----------

// Só com ele parado (sem voo, sem balão) e nada na frente: janela modal aberta (o medalheiro, um jogo) ou anel sendo
// arrastado.
function algoNaFrente() {
  const raiz = document.documentElement.classList;
  if (raiz.contains('arrastando-anel') || raiz.contains('janela-aberta')) return true;
  for (const el of document.querySelectorAll('[aria-modal="true"]')) {
    if (!el.hidden && (el.checkVisibility?.() ?? true)) return true;
  }
  return false;
}

function olharMarca(agora) {
  const descansando = podeConversar() && !aberta() && !M.mascote.falando
    && !M.mascote.botao.classList.contains('voando') && !algoNaFrente();
  if (!descansando) {
    marcaParte = undefined;
    if (marcaVisivel) mostrarMarca(false);
    return;
  }
  // Os provedores são perguntados a cada quarto de segundo, ou já, quando a parte muda.
  const parte = ondeEstou();
  if (parte !== marcaParte || agora >= proximaOlhada) {
    marcaParte = parte;
    proximaOlhada = agora + 250;
    const novo = !!consultar(parte)?.novo;
    if (novo !== marcaVisivel) mostrarMarca(novo);
  }
  if (marcaVisivel) {
    const c = cabeca();
    marca.style.translate = `${encaixar(c.x - 10)}px ${encaixar(c.topo - 34)}px`;
  }
}

function mostrarMarca(sim) {
  marcaVisivel = sim;
  marca.hidden = !sim;
  M?.mascote.botao?.classList.toggle('tem-novidade', sim);
}

// ---------- o quadro (no relógio do mascote) ----------

function quadro(dt) {
  if (!caixa || !M.mascote.ator) return;
  const agora = performance.now();
  if (espera && (agora > espera.ate
    || (ondeEstou() === espera.parte && !document.documentElement.classList.contains('deslizando')))) {
    const { fn } = espera;
    espera = null;
    fn();
  }
  if (aberta()) {
    if (digitado < total) {
      digitado = Math.min(total, digitado + LETRAS_POR_SEGUNDO * dt);
      if (Math.floor(digitado) !== desenhado) desenharLinha();
    }
    // Rolou para outra parte: a conversa era sobre a de antes. (Na tela de toque, com o campo em foco, não: o teclado
    // virtual pode mexer na página sozinho enquanto a pessoa digita.)
    const digitandoNoToque = document.activeElement === entrada && matchMedia('(pointer: coarse)').matches;
    if (ondeEstou() !== parteAberta && !digitandoNoToque) fechar();
    else posicionar();
  }
  olharMarca(agora);
}

// ---------- entradas ----------

function aoCutucar(detalhe) {
  if (!podeConversar()) return;   // antes da escultura terminar, as cócegas são do balão
  detalhe.atendido = true;
  const agora = performance.now();
  if (!aberta()) {
    cocegas = 0;
    ultimoCutucao = agora;
    abrirConversa(!!detalhe.teclado);
    return;
  }
  if (agora - ultimoCutucao < JANELA_DAS_COCEGAS) interromper(COCEGAS[cocegas++ % COCEGAS.length], 1.6);
  ultimoCutucao = agora;
}

function aoTocarFora(e) {
  if (!aberta()) return;
  const alvo = e.target;
  if (caixa.contains(alvo) || marca.contains(alvo) || M.mascote.botao?.contains(alvo)) return;
  fechar();
}

function aoTeclar(e) {
  if (e.key !== 'Escape' || !aberta() || e.defaultPrevented) return;
  e.preventDefault();
  fechar();
}

function montar() {
  const criar = (tag, classe) => Object.assign(document.createElement(tag), { className: classe });
  caixa = criar('div', 'papo');
  caixa.hidden = true;
  caixa.tabIndex = -1;
  caixa.setAttribute('role', 'dialog');
  caixa.setAttribute('aria-label', 'Conversa com o escultor');
  const fecharBotao = criar('button', 'papo-fechar');
  Object.assign(fecharBotao, { type: 'button', textContent: '×' });
  fecharBotao.setAttribute('aria-label', 'Fechar a conversa');
  corpo = criar('div', 'papo-corpo');
  eco = criar('p', 'papo-eco');
  eco.hidden = true;
  eco.setAttribute('aria-hidden', 'true');
  linha = criar('p', 'papo-fala');
  linha.setAttribute('aria-hidden', 'true');
  dito = criar('p', 'sr-only');
  dito.setAttribute('aria-live', 'polite');
  chips = criar('div', 'papo-chips');
  corpo.append(eco, linha, dito, chips);
  campo = criar('form', 'papo-campo');
  const rotulo = criar('label', 'sr-only');
  Object.assign(rotulo, { htmlFor: 'papo-pergunta', textContent: `Pergunte ao escultor sobre o ${NOME}` });
  entrada = criar('input', 'papo-pergunta');
  Object.assign(entrada, {
    id: 'papo-pergunta', type: 'text', maxLength: LIMITE, autocomplete: 'off', enterKeyHint: 'send',
    placeholder: `pergunte sobre o ${NOME}…`,
  });
  const enviarBotao = criar('button', 'botao-pixel papo-enviar');
  Object.assign(enviarBotao, { type: 'submit', textContent: 'enviar' });
  campo.append(rotulo, entrada, enviarBotao);
  caixa.append(fecharBotao, corpo, campo);

  marca = criar('button', 'papo-marca');
  Object.assign(marca, { type: 'button', hidden: true, tabIndex: -1 });
  marca.setAttribute('aria-hidden', 'true');
  marca.append(Object.assign(document.createElement('span'), { textContent: '!' }));
  document.body.append(caixa, marca);

  fecharBotao.addEventListener('click', fechar);
  campo.addEventListener('submit', e => {
    e.preventDefault();
    if (enviar(entrada.value)) entrada.value = '';
  });
  // Clicar na fala completa a datilografia.
  linha.addEventListener('click', () => {
    if (digitado >= total) return;
    digitado = total;
    desenharLinha();
  });
  // Teclas digitadas aqui não chegam à página (rolagem, segredos do teclado); Esc fecha.
  caixa.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      e.preventDefault();
      fechar();
    }
    e.stopPropagation();
  });
  // A roda rola a fala comprida por dentro; no fim dela (ou sem rolagem), passa para a página.
  caixa.addEventListener('wheel', e => {
    const desce = e.deltaY > 0;
    const pode = desce ? corpo.scrollTop + corpo.clientHeight < corpo.scrollHeight - 1 : corpo.scrollTop > 0;
    if (pode) e.stopPropagation();
  }, { passive: true });
  // O "!" é um atalho de mouse para o próprio escultor: pulinho, cutucada (os segredos contam) e a caixa abre.
  marca.addEventListener('click', () => {
    if (!reduzido()) M.mascote.ator?.pular();
    acordar();
    emitir('cutucar', { teclado: false, pronto: M.mascote.pronto, marca: true });
  });
}

export async function iniciar() {
  if (caixa || typeof document === 'undefined') return;
  const [mascote, movimento, rol, conquistas] = await Promise.all([
    import('../mascote.js'), import('../nucleo/movimento.js'), import('../nucleo/rolagem.js'), import('./conquistas.js'),
  ]);
  if (!mascote.mascote.botao) return;
  M = mascote;
  rolagem = rol;
  medalhas = conquistas;
  reduzido = movimento.reduzido;
  montar();
  M.desviarFala((texto, segundos) => {
    if (!aberta()) return false;
    // Com uma pergunta do quiz no ar ele não se distrai: a fala automática (a vitrine dos projetos narra listas
    // compridas) não entra na caixa nem vai para o balão.
    if (!quiz.atual) interromper(texto, segundos);
    return true;
  });
  ouvir('cutucar', aoCutucar);
  ouvir('reset', zerar);
  M.extra({ quadro, ocupado: () => (aberta() && digitado < total) || !!espera });
  // A caixa e o "!" vão logo depois da camada do mascote (que só então passa para o fim do body): do escultor, o
  // Tab entra direto na conversa.
  M.aoFicarPronto(() => {
    pronto = true;
    M.mascote.camada?.after(caixa, marca);
    acordar();
  });
  document.addEventListener('pointerdown', aoTocarFora, true);
  document.addEventListener('keydown', aoTeclar);
  addEventListener('resize', acordar);
  window.visualViewport?.addEventListener('resize', acordar);
  window.visualViewport?.addEventListener('scroll', acordar);
  mensagensNoTotal = Number(medalhas.placar?.('papo')?.n) || 0;
  registrarDesafios();
}
