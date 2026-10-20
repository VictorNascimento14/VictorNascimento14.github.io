// O interior do Coliseu visto do chão da arena, em SVG, desenhado para a largura exata do palco.
// O muro é um cilindro em volta de quem olha: no centro ele está de frente; para os lados os vãos alargam, os andares
// crescem, o topo sobe e sai pela borda e o pé desce alguns px. Vetorial chapado: sem contorno, gradiente ou sombra.
// Aqui só geometria; as cores são do CSS (css/arena.css, uma classe por camada).

export const PODIO = 0.55;                  // o muro baixo em volta da arena, em vãos
export const ARCADAS = [1.25, 1.15, 1.1];   // os três andares de arcos, de baixo para cima, em vãos
export const ATICO = 0.95;                  // a parede lisa do alto, em vãos
export const SUBIDA = PODIO + ARCADAS.reduce((a, b) => a + b, 0) + ATICO; // 5 vãos do pé ao topo

const PASSOS_FAIXA = 48;   // por lado: as faixas são polígonos de muitos pontos, por isso curvam
const PASSOS_AREIA = 64;
const ANEIS = [0.16, 0.4];

// A projeção. Coordenadas de parede: a = comprimento de arco ao longo do muro (0 = bem em frente, negativo à
// esquerda) e z = altura acima da areia, ambos em px. `abertura` é o ângulo visto para cada lado (rad).
export function projetar({ largura, pe, muro, abertura = 0.7 }) {
  const cx = largura / 2;
  const F = cx / Math.tan(abertura);        // distância do olho ao muro
  const vao = muro / SUBIDA;
  const podio = PODIO * vao;
  const zOlho = 0.4 * podio;                // o olho fica a 40% da altura do pódio
  const olho = pe - zOlho;                  // a linha do horizonte
  const fatorEm = x => 1 / Math.cos(Math.atan((x - cx) / F));
  return {
    cx, F, vao, podio, zOlho, olho,
    alcance: F * abertura + vao,            // arco desenhado para cada lado: um vão além das bordas da tela
    X: a => cx + F * Math.tan(a / F),
    Y: (a, z) => olho - (z - zOlho) / Math.cos(a / F),
    peEm: x => olho + zOlho * fatorEm(x),   // y do pé do muro na coluna x da tela
    podioEm: x => olho - (podio - zOlho) * fatorEm(x), // y do topo do pódio na coluna x
  };
}

const arredondar = v => Math.round(v * 10) / 10 || 0; // 0,1 px basta; `|| 0` evita "-0"

// Desenha o muro inteiro. o = { largura, altura, pe, muro, abertura }: tamanho do palco, y do pé do muro bem à frente
// e altura do muro no centro. Devolve { svg, peEm(x), podioEm(x), vao }: `svg` é o conteúdo do <svg>, exatamente
// oito <path> na ordem de pintura (face, pódio, faixas, vãos, colunas, cortes, areia, anéis).
export function desenhar({ largura, altura, pe, muro, abertura = 0.7 }) {
  const p = projetar({ largura, pe, muro, abertura });
  const { vao, podio, alcance, cx } = p;
  const ponto = (a, z) => `${arredondar(p.X(a))} ${arredondar(p.Y(a, z))}`;
  const poligono = pontos => `M${pontos.join('L')}Z`;

  // Faixa: atravessa o muro de ponta a ponta, projetada ponto a ponto (o topo na ida, a base na volta).
  const faixa = (z0, z1) => {
    const topo = [], base = [];
    for (let i = 0; i <= 2 * PASSOS_FAIXA; i++) {
      const a = -alcance + (alcance * i) / PASSOS_FAIXA;
      topo.push(ponto(a, z1));
      base.unshift(ponto(a, z0));
    }
    return poligono([...topo, ...base]);
  };
  // Peças pequenas: só os quatro cantos projetados.
  const retangulo = (a0, a1, z0, z1) => poligono([ponto(a0, z0), ponto(a1, z0), ponto(a1, z1), ponto(a0, z1)]);
  // Abertura de ombreiras retas e cabeça semicircular (circular na parede; a projeção a deforma).
  const arco = (a0, a1, z0, z1) => {
    const r = (a1 - a0) / 2, m = (a0 + a1) / 2, nascenca = z1 - r;
    const pontos = [ponto(a0, z0), ponto(a1, z0), ponto(a1, nascenca)];
    for (let k = 1; k <= 11; k++) {
      const t = (Math.PI * k) / 12;
      pontos.push(ponto(m + r * Math.cos(t), nascenca + r * Math.sin(t)));
    }
    pontos.push(ponto(a0, nascenca));
    return poligono(pontos);
  };

  const camadas = { face: [], podio: [], faixa: [], vao: [], coluna: [], corte: [], areia: [], anel: [] };
  const n = Math.ceil(alcance / vao); // vãos de -n a n-1; há um pilar bem no centro (a = 0)

  camadas.face.push(faixa(0, muro));
  camadas.podio.push(faixa(0, podio));
  camadas.corte.push(faixa(podio - 2, podio));

  let z = podio;
  for (const andar of ARCADAS) {
    const h = andar * vao, entablamento = 0.15 * h, topo = z + h, baseEnt = topo - entablamento;
    camadas.faixa.push(faixa(baseEnt, topo));
    camadas.corte.push(faixa(baseEnt, baseEnt + 1.5), faixa(topo - 1.5, topo));
    for (let i = -n; i < n; i++) {
      const centro = (i + 0.5) * vao, pilar = i * vao;
      // A abertura deixa 0,21 vão até o eixo do pilar: os arcos nunca tocam as colunas.
      camadas.vao.push(arco(centro - 0.29 * vao, centro + 0.29 * vao, z + 0.05 * h, baseEnt - 0.06 * h));
      camadas.coluna.push(retangulo(pilar - 0.045 * vao, pilar + 0.045 * vao, z, baseEnt));               // fuste
      camadas.coluna.push(retangulo(pilar - 0.081 * vao, pilar + 0.081 * vao, baseEnt - 0.05 * h, baseEnt)); // capitel
    }
    z = topo;
  }

  const A = ATICO * vao;
  for (let i = -n; i < n; i++) {
    const pilar = i * vao;
    camadas.coluna.push(retangulo(pilar - 0.04 * vao, pilar + 0.04 * vao, z, z + 0.82 * A)); // pilastra
    // Janelinhas só nos vãos ímpares: em -0,5, +1,5, -2,5… vãos, de propósito fora de simetria.
    if (i % 2 !== 0) camadas.vao.push(retangulo(pilar + 0.4 * vao, pilar + 0.6 * vao, z + 0.32 * A, z + 0.58 * A));
  }
  camadas.faixa.push(faixa(z + 0.82 * A, z + A));          // cornija
  camadas.corte.push(faixa(z + 0.82 * A, z + 0.82 * A + 1.5));

  // A areia começa no pé do muro; os anéis descem para os lados, como o oval da arena vindo na direção de quem olha.
  const pes = [];
  for (let i = 0; i <= PASSOS_AREIA; i++) {
    const x = (largura * i) / PASSOS_AREIA;
    pes.push([x, p.peEm(x)]);
  }
  const xy = (x, y) => `${arredondar(x)} ${arredondar(y)}`;
  camadas.areia.push(poligono([...pes.map(([x, y]) => xy(x, y)), xy(largura, altura), xy(0, altura)]));
  for (const f of ANEIS) {
    camadas.anel.push(`M${pes.map(([x, y]) => {
      const fundo = altura - y, u = (x - cx) / cx;
      return xy(x, y + fundo * f + u * u * fundo * f * 0.35);
    }).join('L')}`);
  }

  const svg = Object.entries(camadas).map(([classe, partes]) => `<path class="${classe}" d="${partes.join('')}"/>`).join('');
  return { svg, peEm: p.peEm, podioEm: p.podioEm, vao };
}
