// Lint do projeto, sem dependências: confere a sintaxe de todo JavaScript (como módulo ES)
// e barra o que não deve ir para o site publicado.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const raiz = fileURLToPath(new URL('..', import.meta.url));
const IGNORAR = new Set(['node_modules', '.git', 'capturas', 'tools']);

function arquivos(pasta) {
  return readdirSync(pasta).flatMap(nome => {
    if (IGNORAR.has(nome)) return [];
    const caminho = join(pasta, nome);
    return statSync(caminho).isDirectory() ? arquivos(caminho) : [caminho];
  });
}

const js = arquivos(raiz).filter(f => f.endsWith('.js') || f.endsWith('.mjs'));
const falhas = [];
for (const arquivo of js) {
  const rel = relative(raiz, arquivo);
  // --check só analisa: nada do site é executado.
  const r = spawnSync(process.execPath, ['--input-type=module', '--check'], { input: readFileSync(arquivo), encoding: 'utf8' });
  if (r.status !== 0) falhas.push(`${rel}: ${r.stderr.split('\n').filter(Boolean).slice(0, 4).join(' | ')}`);
  const texto = readFileSync(arquivo, 'utf8');
  texto.split('\n').forEach((linha, i) => {
    if (/\bdebugger\b/.test(linha)) falhas.push(`${rel}:${i + 1}: debugger esquecido`);
    if (/console\.log\(/.test(linha) && !rel.startsWith('tests')) falhas.push(`${rel}:${i + 1}: console.log esquecido`);
  });
}
if (falhas.length) { console.error(falhas.join('\n')); process.exit(1); }
console.log(`${js.length} arquivos JS conferidos`);
