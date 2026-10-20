// O campo do Contato: céu em anéis de luz em volta do santuário, nuvens, duas cordilheiras, o santuário com templos na
// rocha no meio do horizonte, o prado em cinco camadas que sobem dos dois lados (um vale), flores, ruínas caídas e a
// trilha de areia. SVG plano gerado para o tamanho: só formas com classe (as cores vêm do CSS, que troca a paleta à
// noite), sem contorno, sem gradiente, luz de cima à esquerda. A mesma semente e o mesmo tamanho dão o mesmo prado.
//
// desenhar({ largura, altura, horizonte, semente = 7 }) → { svg, santuario: { x, topo, base }, chao, trilha }
//   largura é a do DESENHO (no celular ele é mais largo que a tela e a seção mostra o miolo).
//   chao.<camada>(x) é o y da borda de cima da camada; trilha.x(y) e trilha.meia(y), o centro e a meia-largura.
import { sorteio } from '../nucleo/pixel.js';

export const CAMADAS = ['planicie', 'encosta', 'meio', 'perto', 'frente'];
const CLASSE = { planicie: 'cp-grama-1', encosta: 'cp-grama-2', meio: 'cp-grama-3', perto: 'cp-grama-4', frente: 'cp-grama-5' };
// Profundidade de cada camada: mais flores, e maiores, quanto mais perto.
const PROFUNDIDADE = { planicie: 0.35, encosta: 0.7, meio: 1.1, perto: 1.6, frente: 2.2 };

// Nuvens: bolhas (dx, dy, raio) em unidades da nuvem, com a base cortada reta.
const BANCO = [[-17, 0, 4], [-12.5, -2.5, 5], [-7, -5, 6], [-1, -6.5, 6.5], [5.5, -5, 6], [11, -2.5, 5], [15.5, -0.5, 3.5], [-4, -1, 5], [4, -1, 5]];
const TUFO = [[-6.5, 0, 3], [-2.5, -2.4, 4], [2.5, -1.6, 3.6], [6.5, 0, 2.6], [0, 0, 3.4]];
// [x / largura, base acima do horizonte em U, escala em U, molde, espelho]. As três de cima só aparecem em janelas
// quase quadradas; numa tela 16:9 ficam acima da borda, e é assim mesmo.
const NUVENS = [[0.07, 12.5, 0.95, BANCO, 1], [0.93, 16, 1, BANCO, -1], [0.29, 32, 1, TUFO, 1], [0.72, 37, 0.85, TUFO, -1], [0.52, 46, 0.6, TUFO, 1]];

// Picos das cordilheiras: [x / largura, altura acima do horizonte / altura]. As duas quase somem no meio: o vale abre
// para o santuário.
const LONGE = [[-0.02, 0.2], [0.06, 0.25], [0.13, 0.19], [0.2, 0.23], [0.29, 0.13], [0.37, 0.09], [0.45, 0.03], [0.5, 0.015], [0.55, 0.035], [0.62, 0.1], [0.7, 0.15], [0.77, 0.22], [0.85, 0.17], [0.93, 0.26], [1.02, 0.2]];
const PERTO = [[-0.02, 0.12], [0.07, 0.15], [0.16, 0.08], [0.25, 0.06], [0.34, 0.02], [0.4, 0.005], [0.6, 0.005], [0.68, 0.04], [0.76, 0.07], [0.84, 0.12], [0.92, 0.09], [1.02, 0.14]];

// Coordenadas a 0,1 px: o SVG fica curto e nada treme.
const n = v => Math.round(v * 10) / 10;
const forma = pontos => `M${pontos.map(([x, y]) => `${n(x)} ${n(y)}`).join('L')}Z`;
const caminho = (classe, d, extra = '') => `<path class="${classe}"${extra} d="${d}"/>`;
const retangulo = (classe, x, y, w, h) => `<rect class="${classe}" x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}"/>`;
const circulo = (cx, cy, r) => `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}"/>`;
const elipse = (classe, cx, cy, rx, ry) => `<ellipse class="${classe}" cx="${n(cx)}" cy="${n(cy)}" rx="${n(rx)}" ry="${n(ry)}"/>`;

export function desenhar({ largura: Wd, altura: H, horizonte: hz, semente = 7 }) {
  const U = Math.min(Wd, 1.7 * H) / 100;
  const cx = Wd / 2;
  const t = x => (x - cx) / (Wd / 2);                     // −1 na borda esquerda, +1 na direita
  const onda = (x, a, f, p) => a * Math.sin(Math.PI * f * x / Wd + p);
  const rnd = sorteio(semente);
  const svg = [];

  const chao = {
    planicie: x => hz + onda(x, 0.4 * U, 3, 0.4),
    encosta: x => {
      const e = Math.max(0, -t(x) - 0.1), d = Math.max(0, t(x) - 0.12);
      return hz + 5 * U - (e * e * 15 + d * d * 17) * U + onda(x, 0.6 * U, 5, 1.1);
    },
    meio: x => hz + 0.25 * (H - hz) - 3 * U * t(x) ** 2 + onda(x, 1.1 * U, 3.2, 2),
    perto: x => H - 0.33 * (H - hz) + onda(x, 1.6 * U, 2.4, 0.3) - 2.5 * U * Math.max(0, -t(x)),
    frente: x => H - 0.12 * (H - hz) + onda(x, 1.8 * U, 3.6, 1.7) - 4 * U * Math.max(0, t(x) - 0.3),
  };

  // A trilha sobe do pé da tela até o pé do santuário: ondula mais e alarga quanto mais perto.
  const s = y => Math.max(0, (y - hz) / (H - hz));
  const trilha = {
    x: y => cx + 0.045 * Wd * Math.sin(4.2 * s(y) + 1.2) * s(y),
    meia: y => U * (0.25 + 6.2 * s(y) ** 1.6),
  };
  const linhas = Array.from({ length: 61 }, (_, i) => hz + 1 + (H + 5 - hz) * i / 60);
  const direita = linhas.map(y => [trilha.x(y) + trilha.meia(y), y]).reverse();
  const formaDaTrilha = forma([...linhas.map(y => [trilha.x(y) - trilha.meia(y), y]), ...direita]);
  const sombraDaTrilha = forma([...linhas.map(y => [trilha.x(y) + 0.8 * trilha.meia(y), y]), ...direita]);

  // 1. Céu: anéis de luz centrados logo atrás do topo do rochedo.
  const sol = { x: cx, y: hz - 6 * U };
  const grande = Math.max(Wd, H);
  svg.push(retangulo('cp-ceu', -4, -4, Wd + 8, H + 8));
  svg.push(`<circle class="cp-ceu-2" cx="${n(sol.x)}" cy="${n(sol.y)}" r="${n(0.62 * grande)}"/>`);
  svg.push(`<circle class="cp-ceu-3" cx="${n(sol.x)}" cy="${n(sol.y)}" r="${n(0.36 * grande)}"/>`);
  svg.push(`<circle class="cp-brilho" cx="${n(sol.x)}" cy="${n(sol.y)}" r="${n(0.2 * grande)}"/>`);
  svg.push(`<circle class="cp-brilho" cx="${n(sol.x)}" cy="${n(sol.y)}" r="${n(0.1 * grande)}"/>`);

  // Estrelas: sempre no desenho, o CSS só as mostra à noite. Ficam atrás das nuvens e dos montes, então nunca
  // aparecem "na frente" da paisagem. Gerador de Park–Miller com semente própria, para não mexer nas flores.
  let pm = 11;
  const proxima = () => { pm = pm * 16807 % 2147483647; return (pm - 1) / 2147483646; };
  for (let i = 0; i < 48; i++) {
    const x = Math.round(proxima() * Wd), y = Math.round(proxima() * 0.38 * H);
    const atraso = `style="animation-delay:${(proxima() * 3).toFixed(2)}s"`;
    svg.push(proxima() < 0.2
      ? `<g class="cp-estrela" ${atraso}><rect class="cp-estrela-halo" x="${x - 1}" y="${y - 1}" width="5" height="5"/><rect x="${x}" y="${y}" width="3" height="3"/></g>`
      : `<rect class="cp-estrela" ${atraso} x="${x}" y="${y}" width="2" height="2"/>`);
  }

  // 2. Nuvens: primeiro as bolhas na cor da sombra, cortadas retas na base; por cima as mesmas bolhas na cor clara,
  // puxadas para cima e à esquerda e cortadas um pouco mais alto. Sobra a sombra embaixo e à direita de cada bolha.
  NUVENS.forEach(([fx, fb, fs, molde, espelho], i) => {
    const x = fx * Wd, base = hz - fb * U, k = fs * U;
    const vao = Math.max(...molde.map(([dx, , r]) => Math.abs(dx) + r)) * k + 4;
    const corte = (sufixo, y) => `<clipPath id="campo-nuvem-${i}${sufixo}">${retangulo('', x - vao, y - 2 * vao, 2 * vao, 2 * vao)}</clipPath>`;
    const bolhas = (dx0, dy0) => molde.map(([dx, dy, r]) => circulo(x + espelho * dx * k + dx0 * r, base + dy * k + dy0 * r, r * k)).join('');
    svg.push(corte('s', base), corte('c', base - 0.9 * k));
    svg.push(`<g class="cp-nuvem-sombra" clip-path="url(#campo-nuvem-${i}s)">${bolhas(0, 0)}</g>`);
    svg.push(`<g class="cp-nuvem" clip-path="url(#campo-nuvem-${i}c)">${bolhas(-0.12 * k, -0.16 * k)}</g>`);
  });

  // 3. Cordilheiras: segmentos retos, a de longe atrás e mais alta.
  for (const [classe, picos] of [['cp-monte-1', LONGE], ['cp-monte-2', PERTO]]) {
    svg.push(caminho(classe, forma([[-8, hz + 4], ...picos.map(([fx, fh]) => [fx * Wd, hz - fh * H]), [Wd + 8, hz + 4]])));
  }

  // 4. O santuário: uma mesa de rocha com ombros escalonados, o flanco direito na sombra, e três templos no topo.
  const topo = hz - 7.5 * U;
  const u = v => v * U;
  svg.push(caminho('cp-rocha', forma([[cx - u(19), hz + 2], [cx - u(14), hz - u(2.5)], [cx - u(10), hz - u(4.6)], [cx - u(8), topo], [cx + u(8.5), topo], [cx + u(10.5), hz - u(4.2)], [cx + u(14), hz - u(2)], [cx + u(20), hz + 2]])));
  svg.push(caminho('cp-rocha-sombra', forma([[cx + u(4), topo + u(0.9)], [cx + u(8.5), topo], [cx + u(10.5), hz - u(4.2)], [cx + u(14), hz - u(2)], [cx + u(20), hz + 2], [cx + u(11), hz + 2], [cx + u(9), hz - u(2.6)]])));
  svg.push(caminho('cp-rocha-sombra', forma([[cx - u(10), hz - u(4.6)], [cx - u(8.5), hz - u(3)], [cx - u(11), hz - u(1.4)], [cx - u(14), hz - u(2.5)]])));
  svg.push(retangulo('cp-templo', cx - u(8.4), topo - u(0.9), u(16.6), u(0.9)));
  svg.push(retangulo('cp-templo-sombra', cx - u(8.4), topo - u(0.25), u(16.6), u(0.25)));
  const plataforma = topo - u(0.9);
  templo(svg, cx - u(4.8), u(4.2), 4, plataforma);
  tholos(svg, cx + u(5.6), u(3), plataforma);
  const apice = templo(svg, cx + u(0.6), 0.55 * u(13), 8, plataforma);   // o principal, na frente dos outros dois

  // 5. O prado, de longe para perto. Depois de cada camada: a trilha recortada pela forma dela (assim a areia nunca
  // passa da borda da planície e fica na ordem certa com flores e ruínas) e as flores até a borda da camada seguinte.
  CAMADAS.forEach((camada, i) => {
    const borda = chao[camada];
    const pontos = Array.from({ length: 97 }, (_, j) => { const x = -4 + (Wd + 8) * j / 96; return [x, borda(x)]; });
    const d = forma([...pontos, [Wd + 4, H + 4], [-4, H + 4]]);
    svg.push(caminho(CLASSE[camada], d));
    svg.push(`<clipPath id="campo-camada-${i}"><path d="${d}"/></clipPath>`);
    svg.push(`<g clip-path="url(#campo-camada-${i})">${caminho('cp-trilha', formaDaTrilha)}${caminho('cp-trilha-sombra', sombraDaTrilha)}</g>`);
    const seguinte = CAMADAS[i + 1];
    flores(svg, borda, seguinte ? chao[seguinte] : () => H, PROFUNDIDADE[camada]);
    // 6. Ruínas caídas: dois tambores de coluna na grama da esquerda, um bloco quebrado no canto direito.
    if (camada === 'perto') {
      tambor(svg, 0.04 * Wd, chao.perto(0.04 * Wd) + u(4.5), u(2.2), u(8));
      tambor(svg, 0.2 * Wd, chao.perto(0.2 * Wd) + u(7), u(1.5), u(5));
    }
    if (camada === 'frente') bloco(svg, 0.9 * Wd, chao.frente(0.9 * Wd) + u(3), U);
  });

  function flores(saida, cima, baixo, prof) {
    const quantas = Math.round(Wd * prof * 0.09);
    const lado = Math.max(1.4, 0.28 * U * prof);
    const porCor = { 'cp-flor-b': '', 'cp-flor-a': '', 'cp-flor-r': '' };
    for (let i = 0; i < quantas; i++) {
      // A ordem dos sorteios importa (x, cor, tamanho, altura): é ela que faz o mesmo prado a cada visita.
      const x = rnd() * Wd;
      const y0 = cima(x), y1 = Math.min(H, baixo(x));
      const cor = rnd() < 0.5 ? 'cp-flor-b' : rnd() < 0.6 ? 'cp-flor-a' : 'cp-flor-r';
      const q = lado * (0.7 + 0.6 * rnd());
      const v = rnd();
      if (y1 - y0 < 2 * lado) continue;
      const y = y0 + lado + v * (y1 - y0 - 2 * lado);
      if (Math.abs(x + q / 2 - trilha.x(y)) < trilha.meia(y) + q) continue;   // nenhuma flor na trilha
      porCor[cor] += `M${n(x)} ${n(y)}h${n(q)}v${n(q)}h${n(-q)}z`;
    }
    for (const [classe, d] of Object.entries(porCor)) if (d) saida.push(caminho(classe, d));
  }

  return { svg: svg.join(''), santuario: { x: cx, topo: apice, base: hz }, chao, trilha };
}

// Um templo de colunas (x é o centro, w a largura, n colunas, yb a base). Devolve o y do ápice do frontão.
function templo(svg, x, w, colunas, yb) {
  const ch = 0.32 * w, st = 0.025 * w, eh = 0.07 * w, recuo = 0.04 * w;
  svg.push(retangulo('cp-templo', x - w / 2 - 2 * st, yb - st, w + 4 * st, st));
  svg.push(retangulo('cp-templo-sombra', x - w / 2 - st, yb - 2 * st, w + 2 * st, st));
  svg.push(retangulo('cp-templo', x - w / 2, yb - 3 * st, w, st));
  const piso = yb - 3 * st;
  svg.push(retangulo('cp-templo-sombra', x - w / 2 + recuo, piso - ch, w - 2 * recuo, ch));
  const cw = (w - 0.08 * w) / (1.9 * colunas - 0.9);
  for (let i = 0; i < colunas; i++) svg.push(retangulo('cp-templo', x - w / 2 + recuo + i * 1.9 * cw, piso - ch, cw, ch));
  const ye = piso - ch - eh;
  svg.push(retangulo('cp-templo', x - w / 2, ye, w, eh));
  svg.push(retangulo('cp-templo-sombra', x - w / 2, ye + 0.65 * eh, w, 0.35 * eh));
  svg.push(caminho('cp-templo', forma([[x - w / 2, ye], [x, ye - 0.12 * w], [x + w / 2, ye]])));
  return ye - 0.12 * w;
}

// O templo redondo do santuário: cela escura, quatro colunas, beiral e cúpula com uma lasca de sombra no pé direito.
function tholos(svg, x, w, yb) {
  svg.push(retangulo('cp-templo-sombra', x - w / 2, yb - 0.6 * w, w, 0.6 * w));
  for (let i = 0; i < 4; i++) svg.push(retangulo('cp-templo', x - 0.51 * w + i * w / 3.3, yb - 0.6 * w, w / 9, 0.6 * w));
  const beiral = yb - 0.7 * w;
  svg.push(retangulo('cp-templo', x - 0.56 * w, beiral, 1.12 * w, 0.1 * w));
  const rx = 0.5 * w, ry = 0.42 * w;
  svg.push(caminho('cp-templo', `M${n(x - rx)} ${n(beiral)}A${n(rx)} ${n(ry)} 0 0 1 ${n(x + rx)} ${n(beiral)}Z`));
  // A lasca sobe em arco do beiral até a borda da cúpula, 0,1w acima dele.
  const xb = x + rx * Math.sqrt(1 - (0.1 * w / ry) ** 2);
  svg.push(caminho('cp-templo-sombra', `M${n(x + 0.1 * w)} ${n(beiral)}Q${n(x + 0.38 * w)} ${n(beiral - 0.02 * w)} ${n(xb)} ${n(beiral - 0.1 * w)}A${n(rx)} ${n(ry)} 0 0 1 ${n(x + rx)} ${n(beiral)}Z`));
}

// Tambor de coluna deitado: (x, y) é o centro da ponta virada para nós, r o raio, L o comprimento.
function tambor(svg, x, y, r, L) {
  svg.push(caminho('cp-ruina-sombra', forma([[x, y - r], [x + L, y - r], [x + L - 0.25 * r, y - 0.3 * r], [x + L + 0.2 * r, y + 0.35 * r], [x + L, y + r], [x, y + r]])));
  svg.push(caminho('cp-ruina', forma([[x, y - r], [x + L, y - r], [x + L - 0.25 * r, y - 0.3 * r], [x + L - 0.11 * r, y - 0.1 * r], [x, y - 0.1 * r]])));
  for (const f of [-0.55, 0.1, 0.65]) svg.push(retangulo('cp-ruina-linha', x, y + f * r - 0.45, L - 0.3 * r, 0.9));
  svg.push(elipse('cp-ruina-sombra', x, y, 0.42 * r, r));
  svg.push(elipse('cp-ruina', x - 0.04 * r, y - 0.04 * r, 0.34 * r, 0.88 * r));
}

// Bloco quebrado no canto de baixo à direita: face da frente clara, a da direita na sombra, o topo no tom mais escuro.
function bloco(svg, bx, by, U) {
  const p = (dx, dy) => [bx + dx * U, by + dy * U];
  svg.push(caminho('cp-ruina', forma([p(-6, 8), p(-5, -3), p(2, -6), p(12, -4), p(14, 8)])));
  svg.push(caminho('cp-ruina-sombra', forma([p(3, -2), p(12, -4), p(14, 8), p(2, 8)])));
  svg.push(caminho('cp-ruina-linha', forma([p(-5, -3), p(2, -6), p(12, -4), p(3, -2)])));
}
