// Movimento reduzido: lido ao vivo, porque o visitante pode trocar a preferência com a página aberta.
// O Chromium só dispara 'change' se ninguém leu `matches` desde a última avaliação; como o site lê a cada quadro,
// a troca é detectada aqui mesmo, comparando com o último valor visto, e avisada a quem pediu.
const consulta = matchMedia('(prefers-reduced-motion: reduce)');
const ouvintes = new Set();
let ultimo = consulta.matches;

function conferir() {
  const agora = consulta.matches;
  if (agora !== ultimo) {
    ultimo = agora;
    // Fora do quadro em curso: quem ouve pode remontar coisas.
    queueMicrotask(() => { for (const fn of ouvintes) fn(agora); });
  }
  return agora;
}

consulta.addEventListener('change', conferir);

export const reduzido = () => conferir();

export function aoMudar(fn) {
  ouvintes.add(fn);
  return () => ouvintes.delete(fn);
}
