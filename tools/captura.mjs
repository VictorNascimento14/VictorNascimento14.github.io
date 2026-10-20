// Fotografa o site num Chromium sem janela e lista os erros do console.
//
//   node tools/captura.mjs [opções]
//     --url=http://localhost:5173/   página (padrão: o servidor do `npm run dev`)
//     --tela=desk|cel|LxA            1440×900, 390×844 (dpr 2) ou um tamanho qualquer
//     --parado                       prefers-reduced-motion: reduce (tudo no estado final)
//     --secao=#ano                   rola até o seletor antes de fotografar
//     --esperar=1500                 ms depois de carregar (e de rolar)
//     --quadros=N --intervalo=400    N fotos seguidas (para ver uma animação)
//     --inteira                      a página inteira numa foto
//     --clicar=#seletor              clica antes de fotografar (pode repetir)
//     --js="código"                  roda na página antes de fotografar (pode repetir)
//     --saida=capturas/nome          prefixo dos arquivos (padrão: capturas/<tela>)
//
// O Chromium vem do cache do Playwright (~/.cache/ms-playwright) ou de CHROMIUM=/caminho/chrome.
import { chromium } from 'playwright-core';
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

const opcoes = { clicar: [], js: [] };
for (const arg of process.argv.slice(2)) {
  const [chave, ...resto] = arg.replace(/^--/, '').split('=');
  const valor = resto.length ? resto.join('=') : true;
  if (Array.isArray(opcoes[chave])) opcoes[chave].push(valor); else opcoes[chave] = valor;
}

function acharChromium() {
  if (process.env.CHROMIUM) return process.env.CHROMIUM;
  const cache = join(homedir(), '.cache', 'ms-playwright');
  const pastas = existsSync(cache) ? readdirSync(cache).filter(p => /^chromium-\d+$/.test(p)).sort().reverse() : [];
  for (const p of pastas) {
    const exe = join(cache, p, 'chrome-linux64', 'chrome');
    if (existsSync(exe)) return exe;
  }
  throw new Error('Chromium não encontrado: defina CHROMIUM=/caminho/do/chrome');
}

const TELAS = { desk: [1440, 900, 1], cel: [390, 844, 2] };
const [largura, altura, dpr] = TELAS[opcoes.tela ?? 'desk'] ?? [...String(opcoes.tela).split('x').map(Number), 1];
const url = opcoes.url ?? 'http://localhost:5173/';
const saida = opcoes.saida ?? `capturas/${opcoes.tela ?? 'desk'}`;
mkdirSync(dirname(saida), { recursive: true });
const espera = ms => new Promise(r => setTimeout(r, ms));

const navegador = await chromium.launch({ executablePath: acharChromium(), headless: true });
const erros = [];
try {
  const contexto = await navegador.newContext({
    viewport: { width: largura, height: altura }, deviceScaleFactor: dpr, locale: 'pt-BR',
    reducedMotion: opcoes.parado ? 'reduce' : 'no-preference',
  });
  const pagina = await contexto.newPage();
  pagina.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') erros.push(`[${m.type()}] ${m.text()}`); });
  pagina.on('pageerror', e => erros.push(`[exceção] ${e.message}`));
  pagina.on('requestfailed', r => erros.push(`[rede] ${r.url()} ${r.failure()?.errorText}`));
  await pagina.goto(url, { waitUntil: 'load' });
  await espera(Number(opcoes.esperar ?? 1500));
  for (const codigo of opcoes.js) await pagina.evaluate(codigo);
  if (opcoes.secao) {
    await pagina.evaluate(s => document.querySelector(s)?.scrollIntoView({ block: 'start' }), opcoes.secao);
    await espera(Number(opcoes.esperar ?? 1500));
  }
  for (const seletor of opcoes.clicar) { await pagina.click(seletor); await espera(300); }
  const quadros = Number(opcoes.quadros ?? 1);
  for (let i = 0; i < quadros; i++) {
    const nome = quadros > 1 ? `${saida}-${String(i).padStart(3, '0')}.png` : `${saida}.png`;
    await pagina.screenshot({ path: nome, fullPage: !!opcoes.inteira });
    if (i < quadros - 1) await espera(Number(opcoes.intervalo ?? 400));
  }
  console.log(`${quadros} foto(s) em ${saida}* (${largura}×${altura}, dpr ${dpr}${opcoes.parado ? ', parado' : ''})`);
} finally {
  await navegador.close();
}
if (erros.length) { console.log(`${erros.length} erro(s) no console:\n${erros.join('\n')}`); process.exitCode = 1; }
else console.log('console limpo');
