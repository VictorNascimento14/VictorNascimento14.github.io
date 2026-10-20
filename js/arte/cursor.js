// Os quatro cursores em pixel art (spec 01 §4.10 e §6.20, spec 08 §5.2): seta, cinzel, mão aberta e punho fechado.
// Cada um é pintado num canvas, vira PNG e vai para uma variável no <html> (--cursor-seta, --cursor-cinzel,
// --cursor-mao, --cursor-punho); o CSS usa var(--cursor-x, reserva do sistema), então sem JavaScript fica o do sistema.
//
//   iniciar()        instala no metal do site (html[data-metal]; bronze se não houver)
//   instalar(metal)  refunde em 'prata' | 'ouro' | null (bronze); sem argumento, repete o último (a onda da Fase 2)
import { CORES, METAIS } from './escultor.js';

// Grades de chaves: o contorno, os quatro tons do metal (d m l h) e o aço do cinzel (s k t). '.' = transparente.
// ponto = ponto ativo em px de sprite.
const CURSORES = {
  seta: {
    variavel: '--cursor-seta', reserva: 'default', ponto: [0.5, 0.5],
    linhas: [
      'o........',
      'oo.......',
      'oho......',
      'ohlo.....',
      'ohmlo....',
      'ohmmlo...',
      'ohmmmlo..',
      'ohmmmmlo.',
      'ohmmlmooo',
      'ohmolmo..',
      'ohoolmo..',
      'oo.oddo..',
      'o..ooo...',
    ],
  },
  // O cinzel do escultor na diagonal: o fio branco no alto à esquerda (o ponto ativo), haste de aço, colar de aço
  // escuro e o cabo de bronze escurecendo até o canto de baixo.
  cinzel: {
    variavel: '--cursor-cinzel', reserva: 'pointer', ponto: [2.5, 2.5],
    linhas: [
      '.ooo..........',
      'ootoo.........',
      'ottsoo........',
      'oosssoo.......',
      '.oosssoo......',
      '..oosskoo.....',
      '...ookkloo....',
      '....oollloo...',
      '.....oollmoo..',
      '......oommmoo.',
      '.......oommdoo',
      '........oodddo',
      '.........ooddo',
      '..........oooo',
    ],
  },
  // Mão aberta: quatro dedos listrados, polegar à esquerda, palma de bronze e sombra embaixo e à direita.
  mao: {
    variavel: '--cursor-mao', reserva: 'grab', ponto: [8, 8],
    linhas: [
      '......oo........',
      '...ooolmooo.....',
      '..olmolmolmooo..',
      '..olmolmolmolmo.',
      '..olmolmolmolmo.',
      '..olmolmolmolmo.',
      '..olmolmolmolmo.',
      'ooolmdlmdlmdlmo.',
      'ohllmmmmmmmmmdo.',
      'ohlmmmmmmmmmmdo.',
      '.oolmmmmmmmmmdo.',
      '..ommmmmmmmmmdo.',
      '..odmmmmmmmmddo.',
      '...oddddddddddo.',
      '....oooooooooo..',
      '................',
    ],
  },
  // Punho fechado: só os nós dos dedos em cima, o polegar atravessado; a base bate com a da mão aberta.
  punho: {
    variavel: '--cursor-punho', reserva: 'grabbing', ponto: [8, 8],
    linhas: [
      '................',
      '................',
      '................',
      '...oo.oo.oo.oo..',
      '..olmolmolmolmo.',
      '..odmodmodmodmo.',
      '.oolmmlmmlmmlmo.',
      'ohhhhllmmmmmmdo.',
      'ollllllmmmmmmdo.',
      '.oooommmmmmmmdo.',
      '..ommmmmmmmmmdo.',
      '..ommmmmmmmmmdo.',
      '..odmmmmmmmmddo.',
      '...oddddddddddo.',
      '....oooooooooo..',
      '................',
    ],
  },
};

let metalAtual = null;
let vigia = null;

const paleta = metal => ({ ...CORES, ...METAIS[metal], o: '#191410' });

// PNG da grade com n px de imagem por px de sprite.
function png(linhas, n, cores) {
  const canvas = document.createElement('canvas');
  canvas.width = linhas[0].length * n;
  canvas.height = linhas.length * n;
  const ctx = canvas.getContext('2d');
  linhas.forEach((linha, j) => {
    for (let i = 0; i < linha.length; i++) {
      if (!cores[linha[i]] || linha[i] === '.') continue;
      ctx.fillStyle = cores[linha[i]];
      ctx.fillRect(i * n, j * n, n, n);
    }
  });
  return canvas.toDataURL('image/png');
}

// Valor CSS do cursor: ~2 px CSS por px de sprite, nunca passando de 32 px CSS. A imagem declara a densidade
// (image-set com Nx) para o navegador não reamostrar a 125% ou 150%; o ponto ativo vem em px CSS.
function valor({ linhas, ponto, reserva }, cores, d) {
  const n = Math.max(1, Math.min(Math.round(2 * d), Math.floor(32 * d / 16)));
  const imagem = png(linhas, n, cores);
  const [x, y] = ponto.map(v => +(v * n / d).toFixed(2));
  for (const funcao of ['image-set', '-webkit-image-set']) {
    const css = `${funcao}(url("${imagem}") ${d}x) ${x} ${y}, ${reserva}`;
    if (CSS.supports('cursor', css)) return css;
  }
  const simples = `url("${png(linhas, 2, cores)}") ${Math.round(ponto[0] * 2)} ${Math.round(ponto[1] * 2)}, ${reserva}`;
  return CSS.supports('cursor', simples) ? simples : reserva;
}

export function instalar(metal) {
  if (metal !== undefined) metalAtual = metal === 'prata' || metal === 'ouro' ? metal : null;
  const d = window.devicePixelRatio || 1;
  const cores = paleta(metalAtual);
  const raiz = document.documentElement;
  for (const cursor of Object.values(CURSORES)) raiz.style.setProperty(cursor.variavel, valor(cursor, cores, d));
  // Zoom ou outro monitor mudam o dpr: redesenha na densidade nova (a consulta vale para o dpr de agora).
  vigia?.removeEventListener('change', reinstalar);
  vigia = matchMedia(`(resolution: ${d}dppx)`);
  vigia.addEventListener('change', reinstalar);
}

function reinstalar() { instalar(); }

export function iniciar() {
  instalar(document.documentElement.dataset.metal ?? null);
}
