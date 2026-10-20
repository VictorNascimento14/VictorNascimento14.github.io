// As contas do anel de caixas (js/secoes/projetos.js), sem DOM: as caixas num círculo visto de cima, a da frente
// embaixo e maior, as de trás mais altas, menores e mais apagadas. Ficam aqui para os testes (tests/projetos.test.js).
import { projetos } from '../dados/perfil.js';

const n = projetos.length;

// Profundidade (cos θ) das vizinhas da frente e das de trás. Com cinco caixas são três degraus de tamanho: a da frente,
// as laterais (a 72°) e as do fundo (a 144°), cada um num P inteiro em repouso.
export const PROF_LADO = Math.cos(2 * Math.PI / n), PROF_FUNDO = Math.cos(4 * Math.PI / n);

export const modulo = (v, m) => ((v % m) + m) % m;

// Diferença assinada mais curta de `de` até `para`, em (−n/2, n/2].
export function diferenca(de, para) {
  let d = modulo(para - de, n);
  if (d > n / 2) d -= n;
  return d;
}

// Tamanho e opacidade pela profundidade: lineares por trecho entre os três degraus (frente, laterais, fundo). `lado` e
// `fundo` são os tamanhos das laterais e das do fundo em frações do tamanho da frente.
export function escalaDe(prof, lado, fundo) {
  if (prof >= PROF_LADO) return lado + (1 - lado) * (prof - PROF_LADO) / (1 - PROF_LADO);
  return Math.max(0.15, fundo + (lado - fundo) * (prof - PROF_FUNDO) / (PROF_LADO - PROF_FUNDO));
}

export function opacidadeDe(prof) {
  if (prof >= PROF_LADO) return Math.min(1, 0.55 + 0.45 * (prof - PROF_LADO) / (1 - PROF_LADO));
  return Math.max(0.2, 0.4 + 0.15 * (prof - PROF_FUNDO) / (PROF_LADO - PROF_FUNDO));
}

// O anel é visto de cima: quanto mais para trás, mais alta a caixa (em frações da altura do palco). As laterais sobem
// o mesmo que no anel de três caixas do original; as do fundo, o dobro, para lerem como "atrás" e não "ao lado".
export function subidaDe(prof) {
  if (prof >= PROF_LADO) return 0.168 * (1 - prof) / (1 - PROF_LADO);
  return 0.168 + 0.168 * (PROF_LADO - prof) / (PROF_LADO - PROF_FUNDO);
}
