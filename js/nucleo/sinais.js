// Avisos entre as partes do site (conquistas, jogos, segredos) sem que uma importe a outra.
const canal = new EventTarget();
const recentes = [];

export function emitir(nome, detalhe = {}) {
  recentes.push({ nome, detalhe });
  if (recentes.length > 50) recentes.shift();
  canal.dispatchEvent(new CustomEvent(nome, { detail: detalhe }));
}

// passados: também recebe o que já foi emitido antes de ouvir (para quem carrega depois).
export function ouvir(nome, fn, { passados = false } = {}) {
  const ouvinte = evento => fn(evento.detail);
  canal.addEventListener(nome, ouvinte);
  if (passados) for (const r of recentes) if (r.nome === nome) fn(r.detalhe);
  return () => canal.removeEventListener(nome, ouvinte);
}
