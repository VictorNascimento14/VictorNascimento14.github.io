// Os dois lados da arena (LinkedIn × GitHub): os números, como eles são escritos e o que o mascote diz deles.
// Cada lado vira uma figura (cartão + estátua) e um gladiador em js/secoes/arena.js. A ordem importa: o primeiro é o
// lado esquerdo e provoca primeiro. Um lado sem número (total 0, sem a marca de provisório) some da arena.
import { perfil } from './perfil.js';

// ---------- os números ----------

// PROVISÓRIO: o Victor ainda vai passar os números do LinkedIn. Enquanto `provisorio` for true o cartão mostra a
// marca "PROVISÓRIO" ao lado da unidade; troque os valores abaixo e apague a marca.
const linkedin = {
  provisorio: true,
  seguidores: 0,              // o número grande do cartão (provisório)
  posts: 5,                   // posts publicados em 2026 (provisório)
  desde: '2026-09',           // mês do primeiro post (provisório)
  primeiroPost: '2026-09-15', // o intervalo dos posts: a etiqueta do cartão (provisório)
  ultimoPost: '2026-10-20',
};

// GitHub: pull requests de autoria do Victor em 2026, contados até 20/10/2026 (o herói também cita o total).
export const github = {
  pullRequests: 2597,
  mergeados: 2579,            // 99,3%
  repositorios: 30,
  maiorDia: { data: '2026-10-02', pullRequests: 143, contribuicoes: 615 },
  de: '2026-01',
  ate: '2026-10',
};

// ---------- como se escreve ----------

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const inteiro = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
const porCento = new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 1 });

// 2597 → "2.597".
export const numeroPt = n => inteiro.format(n);

// 0,99307 → "99,3%".
export const porcentagem = n => porCento.format(n);

// "2026-05-03" → "3 mai 2026"; "2026-09" → "set 2026". Sem o ano com comAno = false.
export function rotuloData(data, comAno = true) {
  const [ano, mes, dia] = data.split('-').map(Number);
  return [dia, MESES[mes - 1], comAno && ano].filter(Boolean).join(' ');
}

// A etiqueta do cartão, em maiúsculas: "3 FEV A 3 MAI 2026", "JAN A OUT 2026". O ano só aparece uma vez se for o mesmo.
export function periodo(de, ate) {
  const mesmoAno = de.slice(0, 4) === ate.slice(0, 4);
  return `${rotuloData(de, !mesmoAno)} a ${rotuloData(ate)}`.toUpperCase();
}

// O número grande enquanto a estátua chega: acompanha o progresso dela (0 → 1), não o tempo, e desacelera no fim
// (quadrática), então aos 97% do caminho já mostra quase tudo.
export const contagem = (total, progresso) => numeroPt(Math.round(total * (1 - (1 - progresso) ** 2)));

// Seguidores e pull requests não se somam: o mascote compara os dois, e a piada só vale enquanto o GitHub ganhar.
export function falaDoPlacar(seguidores, pullRequests, provisorio = false) {
  const s = `${numeroPt(seguidores)} ${seguidores === 1 ? 'seguidor' : 'seguidores'}`;
  const p = `${numeroPt(pullRequests)} pull requests`;
  // Sem o número de verdade do LinkedIn, não há comparação a fazer.
  if (provisorio) return `Faz mais do que conta: ${p} só em 2026. Segue ele lá!`;
  return pullRequests > seguidores
    ? `Faz mais do que conta: ${p} contra ${s}. Segue ele lá!`
    : `${s} no LinkedIn e ${p} no GitHub. Segue ele lá!`;
}

// ---------- os lados ----------

const NOVA_ABA = ' (abre em nova aba)';

export const redes = [
  {
    chave: 'linkedin',
    nome: 'LinkedIn',
    provisorio: linkedin.provisorio,
    periodo: periodo(linkedin.primeiroPost, linkedin.ultimoPost),
    total: linkedin.seguidores,
    unidade: 'SEGUIDORES',
    estatisticas: [
      { rotulo: 'POSTS EM 2026', texto: numeroPt(linkedin.posts), url: `${perfil.linkedin.url}/recent-activity/all/`,
        leitor: `${numeroPt(linkedin.posts)} posts em 2026 no LinkedIn${NOVA_ABA}` },
      { rotulo: 'DESDE', texto: rotuloData(linkedin.desde) },
    ],
    perfil: perfil.linkedin.url,
    estatua: { src: 'assets/img/estatua-linkedin.webp', largura: 640, altura: 670, alt: 'O ícone do LinkedIn esculpido em pedra.' },
    kit: 'linkedin',         // a armadura (e a cor da crista) do gladiador, em js/arte/gladiadores.js
  },
  {
    chave: 'github',
    nome: 'GitHub',
    periodo: periodo(github.de, github.ate),
    total: github.pullRequests,
    unidade: 'PULL REQUESTS',
    estatisticas: [
      { rotulo: 'NO MAIOR DIA', texto: numeroPt(github.maiorDia.pullRequests),
        url: `${perfil.github.url}?tab=overview&from=${github.maiorDia.data}&to=${github.maiorDia.data}`,
        leitor: `${numeroPt(github.maiorDia.pullRequests)} pull requests no maior dia, de ${rotuloData(github.maiorDia.data)}${NOVA_ABA}` },
      { rotulo: 'MERGEADOS', texto: porcentagem(github.mergeados / github.pullRequests) },
    ],
    perfil: perfil.github.url,
    estatua: { src: 'assets/img/estatua-github.webp', largura: 640, altura: 670, alt: 'O ícone do GitHub esculpido em pedra.' },
    kit: 'github',
  },
];

// O que o mascote diz sentado no muro, uma fala depois da outra.
export const falas = [
  'De um lado o que ele conta, do outro o que ele faz.',
  falaDoPlacar(linkedin.seguidores, github.pullRequests, linkedin.provisorio),
];
