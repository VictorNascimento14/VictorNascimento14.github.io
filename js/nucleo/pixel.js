// Pixel art nítido: tudo em pixel inteiro de dispositivo.
export const dpr = () => window.devicePixelRatio || 1;

// Encaixa um valor em px CSS no pixel de dispositivo mais próximo.
export const encaixar = v => Math.round(v * dpr()) / dpr();

// Dimensiona o canvas para o tamanho CSS dado na densidade da tela; devolve o contexto sem suavização.
export function prepararCanvas(canvas, largura, altura, contexto = {}) {
  const d = dpr();
  const w = Math.max(1, Math.round(largura * d));
  const h = Math.max(1, Math.round(altura * d));
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;
  canvas.style.width = `${w / d}px`;
  canvas.style.height = `${h / d}px`;
  const ctx = canvas.getContext('2d', contexto);
  ctx.imageSmoothingEnabled = false;
  return ctx;
}

// Sorteio com semente (mulberry32): o mesmo desenho a cada visita.
export function sorteio(semente) {
  let s = semente >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const limitar = (v, min, max) => Math.min(max, Math.max(min, v));
export const misturar = (a, b, t) => a + (b - a) * t;
// Curvas usadas no site inteiro.
export const suave = t => t * t * t * (t * (t * 6 - 15) + 10);
export const saidaCubica = t => 1 - (1 - t) ** 3;
export const entradaCubica = t => t * t * t;

// Segue um alvo de forma exponencial (taxa em 1/s), independente da taxa de quadros.
export const seguir = (atual, alvo, taxa, dt) => alvo + (atual - alvo) * Math.exp(-taxa * dt);
