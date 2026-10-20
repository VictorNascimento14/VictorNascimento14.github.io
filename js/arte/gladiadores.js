// Os kits de armadura dos gladiadores da arena (LinkedIn × GitHub), no formato documentado no topo de
// js/arte/escultor.js. Desenho próprio, em cima do corpo do escultor (tronco nas colunas 3–10, gola na linha 9).
// A armadura comum (túnica, peitoral com gema, ombreiras e grevas) usa as chaves do metal, então funde junto com o
// ator; a cor de cada lutador vai nas chaves próprias (p cor, q sombra, g luz; o GitHub usa r e n como mais dois
// verdes).
//
//   vestir(ator, 'linkedin' | 'github' | 'conexao' | 'review')   veste o kit e a crista; null (ou um nome
//                                                                 desconhecido) despe
//   LUTADOR_KIT   lutador do duelo → kit: artigo e conexao (LinkedIn), merge e review (GitHub)

// ---------- armas ----------

// Espada reta ao longo do braço: braço, punho, cabo, guarda de 3 px atravessada, lâmina larga (o fio de baixo em aço
// escuro, para a lâmina não sumir no papel claro) e ponta.
function espada(lamina) {
  const pontos = [[0.5, 'm'], [1.5, 'm'], [2.5, 'l'], [3.4, 'w'], [4.2, -1, 'k'], [4.2, 0, 'k'], [4.2, 1, 'k']];
  for (let u = 5; u < 4.2 + lamina; u += 0.8) pontos.push([u, 0.7, 'k'], [u, 's']);
  pontos.push([4.5 + lamina, 't']);
  return pontos;
}

// Tridente (o "fork" do GitHub): haste comprida que passa atrás da mão, travessa de aço e três dentes de ponta clara.
function tridente() {
  const pontos = [];
  for (let u = -2.4; u <= 8.1; u += 0.8) pontos.push([u, 'w']);
  pontos.push([0.5, 'm'], [1.5, 'm'], [2.5, 'l']);
  for (let lado = -2; lado <= 2; lado++) pontos.push([8.6, lado, 'k']);
  for (const lado of [-2, 0, 2]) pontos.push([9.4, lado, 's'], [10.2, lado, 's'], [11, lado, 't']);
  return pontos;
}

// Arpão da Conexão: haste que passa atrás da mão, ponta de aço com duas farpas viradas para trás e a corda amarrada
// no pé da haste (é o que liga uma ponta à outra).
function arpao() {
  const pontos = [];
  for (let u = -2.4; u <= 8.4; u += 0.8) pontos.push([u, 'w']);
  pontos.push([0.5, 'm'], [1.5, 'm'], [2.5, 'l']);
  pontos.push([8.8, -1, 'k'], [8.1, -1.9, 'k'], [8.8, 1, 'k'], [8.1, 1.9, 'k']);
  pontos.push([9.2, 's'], [10, 's'], [10.8, 't']);
  pontos.push([-3.1, 0.7, 'r'], [-3.6, 1.6, 'n'], [-3.3, 2.5, 'r'], [-2.6, 3.1, 'n']);
  return pontos;
}

// Lança da Review: haste comprida e a ponta em losango de aço (larga no meio, fio claro na ponta).
function lanca() {
  const pontos = [];
  for (let u = -2.4; u <= 9; u += 0.8) pontos.push([u, 'w']);
  pontos.push([0.5, 'm'], [1.5, 'm'], [2.5, 'l']);
  pontos.push([9.6, 's'], [10.4, -1, 'k'], [10.4, 's'], [10.4, 1, 'k'], [11.2, 's'], [12, 't']);
  return pontos;
}

// ---------- armadura comum ----------

// Túnica na cor do lutador (só a saia aparece sob o peitoral: dobras na sombra e a barra em tiras soltas).
const TUNICA = {
  em: [3, 9],
  linhas: [
    'qppppppq',
    'qppppppq',
    'qppppppq',
    'qppppppq',
    'qpqppqpq',
    'p.pq.qp.',
  ],
};
// Peitoral de metal: borda escura, brilho no alto, corpo claro, a gema na luz do lutador e o cinto em escuro/brilho.
const PEITORAL = {
  em: [3, 9],
  linhas: [
    'dhhhhhhd',
    'dllgglld',
    'dllllldd',
    'hdhdhdhd',
  ],
};
// Ombreira de trás: por cima do braço que balança (camada topo). A da frente fica sob a mão (camada sobre).
const OMBREIRA_TRAS = {
  em: [0, 8],
  linhas: [
    '.hhl.',
    'hllld',
    'lllld',
    '.ddd.',
  ],
};
const OMBREIRA_FRENTE = {
  em: [9, 9],
  linhas: [
    'hhl.',
    'llld',
    'lldd',
    '.dd.',
  ],
};
const GREVAS = ['d', 'l', 'd'];
// Galerus da Conexão: a guarda alta que sobe do ombro de trás até o lado da cabeça (camada topo, cobre o ombro do
// braço que balança). Substitui as duas ombreiras: o reciário luta com o lado da frente livre.
const GALERUS = {
  em: [0, 5],
  linhas: [
    'hd....',
    'hld...',
    'hlld..',
    'llld..',
    'hllldd',
    'lllldd',
    '.dddd.',
  ],
};

// ---------- os dois lutadores ----------

export const KITS = {
  // Mirmilão do LinkedIn: elmo de aba larga com crista alta e guarda de nuca, escudo alto pintado como um post
  // (linhas de texto) e espada curta.
  linkedin: {
    nome: 'LinkedIn',
    classe: 'mirmilão',
    crista: '#a8432c',
    cores: { p: '#0a66c2', q: '#004182', g: '#9cd0fa' },
    cabeca: [{
      em: [0, -1],
      linhas: [
        '..ccccccc.....',
        '...cccccccc...',
        '...hddddddd...',
        '..hlllllllll..',
        'hlllllllllllm.',
        'ldd.......d...',
        'd.............',
      ],
    }],
    sobre: [TUNICA, PEITORAL, OMBREIRA_FRENTE],
    topo: [OMBREIRA_TRAS],
    pernas: GREVAS,
    frente: {
      braco: [[0.3, 'm'], [1.3, 'l']],
      item: {
        pega: [2, 4],
        mao: 1,
        linhas: [
          '.hllll.',
          'lgggggd',
          'lpppppd',
          'lggggpd',
          'lpppppd',
          'lgggggd',
          'lpppppd',
          'lgggppd',
          '.ddddd.',
        ],
      },
    },
    costas: { braco: espada(4.5) },
    guarda: -0.55,
    repouso: 0.35,
  },

  // Lutador do GitHub: elmo redondo de orelhas pontudas com crista curta, escudo redondo pintado como uma grade de
  // contribuições e o tridente.
  github: {
    nome: 'GitHub',
    classe: 'hoplômaco',
    crista: '#3f8f46',
    cores: { p: '#2d333b', q: '#161b22', g: '#39d353', r: '#26a641', n: '#0e4429' },
    cabeca: [{
      em: [0, -1],
      linhas: [
        '...h......l...',
        '...hl.cc.ll...',
        '...hlllllllm..',
        '..hlllllllllm.',
        '..ddddddddddd.',
        '..d.......d...',
      ],
    }],
    sobre: [TUNICA, PEITORAL, OMBREIRA_FRENTE],
    topo: [OMBREIRA_TRAS],
    pernas: GREVAS,
    frente: {
      braco: [[0.3, 'm'], [1.3, 'l']],
      item: {
        pega: [2, 4],
        mao: 1,
        linhas: [
          '..hlll..',
          '.lrgnrd.',
          'lgqrgnrd',
          'lnrgqgrd',
          'lrgnrrgd',
          'lqrgngqd',
          '.lgrnrd.',
          '..dddd..',
        ],
      },
    },
    costas: { braco: tridente() },
    guarda: -0.7,
    repouso: 0.4,
  },

  // Reciário da Conexão (LinkedIn, o tanque): sem elmo, só a tiara de ponta erguida com a gema e um tufo de crista
  // atrás; a rede na mão da frente, trançada nas duas cores de corda, com os nós na luz do lutador (cada nó, uma
  // conexão) e três pesos de aço; o arpão com a corda nas costas e o galerus no lugar das ombreiras.
  conexao: {
    nome: 'Conexão',
    classe: 'reciário',
    crista: '#a8432c',
    cores: { p: '#13857e', q: '#0b524e', g: '#8fe3d6' },
    cabeca: [{
      em: [1, 0],
      linhas: [
        '.cc.........',
        'cccc....h...',
        '.ccc...lgl..',
        '..dhhhhhlll.',
        '.d........d.',
      ],
    }],
    sobre: [TUNICA, PEITORAL],
    topo: [GALERUS],
    pernas: GREVAS,
    frente: {
      braco: [[0.3, 'm'], [1.3, 'l']],
      item: {
        pega: [2, 0],
        mao: 2,
        linhas: [
          '.ngn.',
          'nrnrn',
          'rgrgr',
          'nrnrn',
          'rgrgr',
          'k.k.k',
        ],
      },
    },
    costas: { braco: arpao() },
    guarda: -0.9,
    repouso: 0.5,
  },

  // Hoplômaco da Review (GitHub, bloqueio e truques): elmo de crista transversal alta, cuia de metal, aba com rebite de
  // aço e guarda de rosto e de nuca descendo; o escudo redondo pintado como o anel do CI (quatro segmentos acesos,
  // um por etapa: lint, teste, build, deploy, com os vãos em cruz e o umbo de metal no meio) e a lança.
  review: {
    nome: 'Review',
    classe: 'hoplômaco',
    crista: '#3f8f46',
    cores: { p: '#8250df', q: '#4c2889', g: '#d2a8ff', r: '#3fb950', n: '#1a7f37' },
    cabeca: [{
      em: [1, -1],
      linhas: [
        '....ccccc....',
        '...ccccccc...',
        '.....kkk.....',
        '...hllllll...',
        '..hllllllllm.',
        '.hdddkddddddd',
        '.d........dd.',
        '.d........d..',
      ],
    }],
    sobre: [TUNICA, PEITORAL, OMBREIRA_FRENTE],
    topo: [OMBREIRA_TRAS],
    pernas: GREVAS,
    frente: {
      braco: [[0.3, 'm'], [1.3, 'l']],
      item: {
        pega: [3, 4],
        mao: 1,
        linhas: [
          '..hhhll..',
          '.hrrqrrl.',
          'hrrrqrrrd',
          'lrrhllrnd',
          'lqqlldqqd',
          'lrrlddnnd',
          'lrrrqnnnd',
          '.drnqnnd.',
          '..ddddd..',
        ],
      },
    },
    costas: { braco: lanca() },
    guarda: -0.55,
    repouso: 0.35,
  },
};

// Os quatro lutadores do duelo e o kit de cada um (o Artigo veste o mirmilão do LinkedIn; o Merge, o hoplômaco do
// GitHub com a grade de contribuições).
export const LUTADOR_KIT = { artigo: 'linkedin', conexao: 'conexao', merge: 'github', review: 'review' };

// Veste o kit (e a crista na cor do lutador) num ator montado pelo escultor. Devolve o ator, para encadear.
export function vestir(ator, nome) {
  const kit = KITS[nome] ?? null;
  return ator.definir({ kit, elmo: kit ? kit.crista : null });
}
