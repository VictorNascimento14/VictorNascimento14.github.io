// Golpes do duelo (js/jogos/golpes.js) e os kits dos lutadores (js/arte/gladiadores.js): o que é puro — os 16 golpes da
// tabela do §11 da arquitetura, os grafos, os tempos da spec 07 §5.7 e §6.6, o voo de quem é atingido, as sementes e a
// nuvem de bits. A cena é desenhada num contexto falso que só anota o que pintaria.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ESPECIAIS, mostrar, voo, recuperacao, repeticoes, unidade, nuvem, densidade, ceu } from '../js/jogos/golpes.js';
import { KITS, LUTADOR_KIT } from '../js/arte/gladiadores.js';
import { CARTAS, TIMES } from '../js/jogos/duelo-regras.js';

const IDS = ['notificacoes', 'conexoes', 'merge-main', 'pair', 'release', 'rollback', 'hot-take', 'endosso', 'streak',
  'mencao', 'deploy-sexta', 'commits-atomicos', 'headhunter', 'hotfix', 'push-force', 'code-review'];

const perto = (valor, esperado, tolerancia = 1e-9) =>
  assert.ok(Math.abs(valor - esperado) <= tolerancia, `${valor} deveria ser ≈ ${esperado}`);

// Um contexto 2D de mentira: anota cada retângulo com a cor e a opacidade da hora.
function contexto(largura = 1440, altura = 640) {
  const registro = [];
  let cor = '';
  return {
    registro, canvas: { width: largura, height: altura }, globalAlpha: 1, imageSmoothingEnabled: false,
    set fillStyle(v) { cor = v; }, get fillStyle() { return cor; },
    fillRect(x, y, w, h) { registro.push(`${cor}@${this.globalAlpha.toFixed(2)}:${x},${y},${w},${h}`); },
    save() {}, restore() {}, drawImage() {}, fillText() {}, clearRect() {}, measureText: t => ({ width: 8 * t.length }),
  };
}

const LANCE = { P: 5, dir: 1, eu: { x: 400, y: 500 }, rivais: [{ x: 900, y: 500, n: 3 }] };

// Roda a cena até o fim em quadros de 1/60 s, pintando um a cada cinco; devolve o que foi pintado.
function filmar(opcoes) {
  const cena = mostrar(opcoes), ctx = contexto();
  for (let i = 0; !cena.terminou; i++) { cena.atualizar(1 / 60); if (i % 5 === 0) cena.desenhar(ctx, opcoes.P, 1); }
  return ctx.registro;
}

// ---------- os 16 golpes ----------

test('os 16 golpes do §11, cada um com carta, grito, ramo, cores, lutador e metal', () => {
  assert.deepEqual(Object.keys(ESPECIAIS).sort(), [...IDS].sort());
  const metal = { bronze: IDS.slice(0, 5), prata: IDS.slice(5, 10), ouro: IDS.slice(10) };
  for (const [id, g] of Object.entries(ESPECIAIS)) {
    assert.ok(g.nome && g.grito && g.subtitulo, id);
    assert.match(g.cores.nuvem, /^#[0-9a-f]{6}$/, id);
    assert.match(g.cores.borda, /^#[0-9a-f]{6}$/, id);
    assert.ok(LUTADOR_KIT[g.lutador], `${id}: lutador ${g.lutador}`);
    assert.ok(metal[g.metal].includes(id), `${id} é de ${g.metal}`);
  }
  assert.equal(ESPECIAIS.notificacoes.grito, 'CHUVA DE NOTIFICAÇÕES!');
  assert.equal(ESPECIAIS.release.grito, 'RELEASE v1.0!');
  assert.equal(ESPECIAIS['push-force'].grito, 'GIT PUSH --FORCE!');
  assert.equal(ESPECIAIS.hotfix.grito, 'HOTFIX ÀS 3 DA MANHÃ!');
  assert.equal(mostrar({ id: 'nao-existe' }), null);
});

// Os dados das especiais vivem nos dois módulos: uma troca de tipo ou de `reage` mudaria o relógio da cena (o hit de
// quem reage vem de `reagir`; o de um ataque, do golpe) sem nenhum outro teste falhar.
test('as 16 especiais batem entre as regras (CARTAS) e as cenas (ESPECIAIS): nome, metal, lutador e reage', () => {
  const especiais = CARTAS.filter(c => c.golpe);
  assert.deepEqual(especiais.map(c => c.golpe).sort(), [...IDS].sort());
  for (const c of especiais) {
    const g = ESPECIAIS[c.golpe];
    assert.deepEqual([g.nome, g.metal, g.lutador, !!g.reage],
      [c.nome, c.metal, TIMES[c.time].lutadores[c.lutador].id, c.tipo !== 'ataque'], c.golpe);
  }
});

test('cada golpe fica com o lutador da carta original (Artigo, Conexão, Merge, Review)', () => {
  const de = lutador => IDS.filter(id => ESPECIAIS[id].lutador === lutador).sort();
  assert.deepEqual(de('artigo'), ['commits-atomicos', 'deploy-sexta', 'hot-take', 'notificacoes', 'rollback']);
  assert.deepEqual(de('conexao'), ['conexoes', 'endosso', 'headhunter']);
  assert.deepEqual(de('merge'), ['hotfix', 'merge-main', 'pair', 'push-force', 'streak']);
  assert.deepEqual(de('review'), ['code-review', 'mencao', 'release']);
});

test('grafos válidos: commits na caixa unitária, ramos entre commits que existem, sem repetir', () => {
  for (const [id, { grafo }] of Object.entries(ESPECIAIS)) {
    assert.ok(grafo.nos.length >= 6 && grafo.ramos.length >= 5, id);
    for (const [x, y, brilhante] of grafo.nos) {
      assert.ok(x >= 0 && x <= 1 && y >= 0 && y <= 1, `${id}: ${x}, ${y}`);
      assert.ok(brilhante === undefined || brilhante === 1, id);
    }
    assert.ok(grafo.nos.some(n => n[2]), `${id} tem um commit brilhante`);
    const vistos = new Set();
    for (const [a, b] of grafo.ramos) {
      assert.ok(Number.isInteger(a) && Number.isInteger(b) && a !== b, `${id}: ${a}-${b}`);
      assert.ok(a < grafo.nos.length && b < grafo.nos.length, `${id}: ${a}-${b}`);
      const chave = Math.min(a, b) * 100 + Math.max(a, b);
      assert.ok(!vistos.has(chave), `${id}: ramo ${a}-${b} repetido`);
      vistos.add(chave);
    }
  }
});

test('tempos da spec 07 §5.7: hit e tail; joga para cima e reage', () => {
  const TEMPOS = {
    notificacoes: [0.75, 1.2], conexoes: [0, 0.55], 'merge-main': [0.55, 1.05], pair: [0.7, 1.3], release: [0.65, 1.2],
    rollback: [0, 1.45], 'hot-take': [0.6, 0.9], endosso: [0, 0.55], streak: [0.78, 1], mencao: [0.5, 0.95],
    'deploy-sexta': [1, 1.3], 'commits-atomicos': [0.72, 1], headhunter: [0, 0.55], hotfix: [0.8, 1.3],
    'push-force': [0.45, 1.3], 'code-review': [0, 0.9],
  };
  for (const [id, [hit, tail]] of Object.entries(TEMPOS)) {
    assert.equal(ESPECIAIS[id].hit, hit, id);
    assert.equal(ESPECIAIS[id].tail, tail, id);
  }
  assert.deepEqual(IDS.filter(id => ESPECIAIS[id].sobe), ['merge-main', 'release']);
  assert.deepEqual(IDS.filter(id => ESPECIAIS[id].reage), ['conexoes', 'rollback', 'endosso', 'headhunter', 'push-force', 'code-review']);
});

// ---------- a cena no relógio ----------

test('a cena: início no fim da intro, queda, espera (settle do §6.6) e fim', () => {
  const ataque = mostrar({ ...LANCE, id: 'notificacoes' });
  perto(ataque.inicio, 1.1);
  perto(ataque.queda, 1.85);
  perto(ataque.espera, 1.2);                                   // tail 1,2 > recuperação de 3 (1,15)
  perto(ataque.fim, 3.05);
  assert.equal(ataque.tremida, 4);
  assert.equal(mostrar({ ...LANCE, id: 'deploy-sexta', rivais: [{ x: 900, y: 500, n: 5 }] }).tremida, 6);
  assert.equal(mostrar({ ...LANCE, id: 'notificacoes', rivais: [{ x: 900, y: 500, n: 0, segurou: true }] }).tremida, 0);
  assert.equal(mostrar({ ...LANCE, id: 'rollback' }).tremida, 0);
  perto(mostrar({ ...LANCE, id: 'notificacoes', curta: true }).inicio, 0.3);
  perto(mostrar({ ...LANCE, id: 'notificacoes', longa: false }).inicio, 0.3);

  const defesa = mostrar({ ...LANCE, id: 'rollback', reagir: 0.62, recebendo: true, contra: 2, rivais: [{ x: 900, y: 500, n: 0 }] });
  perto(defesa.hit, 0.62);                                      // a defesa reage quando o golpe cai: land − intro
  perto(defesa.espera, 0.95 + 0.7);                            // vira pedra 0,95 s e voa com perda 2
  const semReagir = mostrar({ ...LANCE, id: 'conexoes' });
  perto(semReagir.hit, 0.5);

  const area = mostrar({ ...LANCE, id: 'pair', rivais: [{ x: 900, y: 500, n: 1 }, { x: 995, y: 500, n: 1 }] });
  perto(area.espera, 0.65 + 0.7);                              // congela 0,65 s no bloco e então voa
  perto(mostrar({ ...LANCE, id: 'push-force' }).espera, 0.2 + 1.15);
  perto(mostrar({ ...LANCE, id: 'merge-main', rivais: [{ x: 900, y: 500, n: 1 }] }).espera, 1.15);   // jogado para cima

  const cena = mostrar({ ...LANCE, id: 'mencao', inicio: 1.4 });
  perto(cena.queda, 1.9);
  cena.inicio = 1.6;
  perto(cena.queda, 2.1);
  while (cena.t < cena.fim - 0.02) { assert.equal(cena.terminou, false); cena.atualizar(0.05); }
  cena.atualizar(0.05);
  assert.equal(cena.terminou, true);
});

test('quem é atingido voa: longe girando em quartos de volta, deita, volta andando; médio; só o tranco', () => {
  const P = 5;
  const longe = voo(0.25, 3, { P, lado: 1 });
  assert.ok(longe.dx > 0 && longe.dy < 0);
  assert.equal(longe.giro, 180);
  assert.equal(longe.tom, undefined);
  assert.equal(voo(0.02, 3, { P }).tom, 'luz');
  assert.deepEqual(voo(0.6, 3, { P, lado: -1 }), { dx: -16 * P, dy: P, giro: -90 });
  perto(voo(0.6, 5, { P }).dx, 20 * P);
  perto(voo(0.6, 2, { P, sobe: true }).dx, 16 * P);
  perto(voo(0.25, 1, { P, sobe: true }).dy, -24 * P);           // jogado para cima: 24P no meio do voo
  perto(voo(0.6, 4, { P, empurrao: 22 }).dx, 22 * P);
  assert.ok(voo(1, 3, { P }).passos >= 0);
  assert.deepEqual(voo(1.2, 3, { P }), { dx: 0, dy: 0, giro: 0 });
  const medio = voo(0.16, 2, { P });
  assert.ok(medio.dx > 0 && medio.dy < 0 && medio.giro === 0);
  assert.deepEqual(voo(0.75, 2, { P }), { dx: 0, dy: 0, giro: 0 });
  perto(voo(0, 0, { P }).dx, P);
  perto(voo(0.25, 0, { P }).dx, 0);
  assert.equal(recuperacao(3), 1.15);
  assert.equal(recuperacao(1, true), 1.15);
  assert.equal(recuperacao(2), 0.7);
  assert.equal(recuperacao(0, true), 0.2);
});

test('o golpe que cresce: blocos da sequência e picadas dos commits por carta já virada', () => {
  assert.deepEqual([0, 1, 2, 3, 10].map(c => repeticoes('streak', c)), [3, 5, 7, 9, 9]);
  assert.deepEqual([0, 1, 2, 4, 9].map(c => repeticoes('commits-atomicos', c)), [3, 6, 9, 15, 15]);
  assert.equal(repeticoes('notificacoes', 5), 1);
  assert.deepEqual([2, 3, 4, 5].map(unidade), [2, 2, 2, 3]);
});

test('mesma semente, mesma cena; outra semente, outra cena', () => {
  for (const id of IDS) {
    const lance = { ...LANCE, id, semente: 4242, contagem: 2, roubado: 3, recebendo: true, contra: 2, sprite: { kit: 'github' } };
    const a = filmar(lance), b = filmar(lance);
    assert.ok(a.length > 0, id);
    assert.deepEqual(a, b, `${id} repete com a mesma semente`);
    assert.notDeepEqual(a, filmar({ ...lance, semente: 99 }), `${id} muda com outra semente`);
  }
});

test('poses: o atacante se move no golpe e o rival só voa depois da queda (e do atraso do golpe)', () => {
  const merge = mostrar({ ...LANCE, id: 'merge-main', rivais: [{ x: 900, y: 500, n: 4 }] });
  while (merge.t < merge.inicio + 0.5) merge.atualizar(1 / 60);
  assert.ok(merge.poses().eu.dx > 0, 'o gancho anda até o rival');
  assert.equal(merge.poses().rivais[0].giro ?? 0, 0);
  while (merge.t < merge.queda + 0.3) merge.atualizar(1 / 60);
  const { rivais: [rival] } = merge.poses();
  assert.ok(rival.dy < -10 * 5 && rival.giro !== 0, 'jogado para o alto, girando');

  const caca = mostrar({ ...LANCE, id: 'headhunter', roubado: 3 });
  while (caca.t < caca.inicio + 0.1) caca.atualizar(1 / 60);
  assert.equal(caca.poses().eu.sentado, true);
  assert.equal(caca.poses().eu.dormindo, true);
  while (caca.t < caca.queda + 0.05) caca.atualizar(1 / 60);
  assert.equal(caca.poses().eu.dormindo, false, 'abre os olhos ao roubar');

  const volta = mostrar({ ...LANCE, id: 'rollback', recebendo: true, contra: 2, rivais: [{ x: 900, y: 500, n: 0 }] });
  while (volta.t < volta.queda + 0.5) volta.atualizar(1 / 60);
  assert.equal(volta.poses().rivais[0].tom, 'pedra');
  assert.equal(volta.poses().rivais[0].dx, undefined, 'revertido, ainda não voou');
  while (volta.t < volta.queda + 1.2) volta.atualizar(1 / 60);
  assert.ok(volta.poses().rivais[0].dx > 0, 'o golpe volta e ele voa');

  while (!volta.terminou) volta.atualizar(1 / 60);
  assert.deepEqual(volta.poses(), { eu: {}, rivais: [{}] });
});

test('desenhar em camadas: atrás e na frente somam o desenho inteiro', () => {
  const opcoes = { ...LANCE, id: 'conexoes', recebendo: true, semente: 7 };
  const a = mostrar(opcoes), b = mostrar(opcoes);
  const inteiro = contexto(), camadas = contexto();
  for (let i = 0; i < 100; i++) {
    a.atualizar(1 / 60); b.atualizar(1 / 60);
    a.desenhar(inteiro, 5, 1);
    b.desenhar(camadas, 5, 1, 'atras');
    b.desenhar(camadas, 5, 1, 'frente');
  }
  assert.deepEqual(camadas.registro, inteiro.registro);
});

// ---------- a nuvem de bits e o céu da carta ----------

test('a nuvem de bits: níveis de 0 a 3, a mesma sempre, mais cheia perto do grafo', () => {
  for (const id of IDS) {
    const a = nuvem(id, 40, 30), b = nuvem(id, 40, 30);
    assert.deepEqual(a, b, id);
    assert.ok(a.every(v => v >= 0 && v <= 3), id);
    assert.ok(a.some(v => v === 3) && a.some(v => v === 0), id);
    const campo = densidade(id);
    assert.ok(campo(0.5, 0.5) >= 0 && campo(0.5, 0.5) <= 1, id);
    assert.ok(campo(-3, -3) < 0.01, `${id} some longe do grafo`);
  }
});

test('o céu da carta: SVG 100 × 140 com a nuvem, os ramos e um quadrado por commit', () => {
  for (const id of IDS) {
    const svg = ceu(id, 'ouro');
    assert.match(svg, /^<svg [^>]*viewBox="0 0 100 140"/, id);
    assert.ok(svg.endsWith('</svg>'), id);
    assert.equal((svg.match(/fill="#fffaf0"/g) ?? []).length, ESPECIAIS[id].grafo.nos.length, id);
    assert.match(svg, /stroke="#ecc145"/, `${id}: ramos na cor m3 do ouro`);
    assert.doesNotMatch(svg, /NaN|undefined/, id);
    assert.equal(ceu(id, 'ouro'), svg);
  }
  assert.equal(ceu('nao-existe'), '');
});

// ---------- os kits ----------

test('os quatro lutadores vestem kits completos, desenhados nas chaves do sprite', () => {
  assert.deepEqual(LUTADOR_KIT, { artigo: 'linkedin', conexao: 'conexao', merge: 'github', review: 'review' });
  const CHAVES = new Set('bdmlhesktwcpqgrn. ');
  for (const nome of Object.values(LUTADOR_KIT)) {
    const kit = KITS[nome];
    assert.ok(kit, nome);
    assert.ok(kit.cores.p && kit.cores.q && kit.cores.g, nome);
    assert.match(kit.crista, /^#[0-9a-f]{6}$/, nome);
    assert.ok(Number.isFinite(kit.guarda) && Number.isFinite(kit.repouso) && kit.guarda < kit.repouso, nome);
    assert.equal(kit.pernas.length, 3, nome);
    const camadas = [...kit.cabeca, ...kit.sobre, ...(kit.topo ?? []), ...(kit.sob ?? [])];
    for (const camada of [...camadas, { linhas: kit.frente.item?.linhas ?? [] }]) {
      for (const linha of camada.linhas) for (const ch of linha) assert.ok(CHAVES.has(ch), `${nome}: chave '${ch}'`);
    }
    const { linhas, pega } = kit.frente.item;
    assert.ok(linhas.every(l => l.length === linhas[0].length), `${nome}: item retangular`);
    assert.ok(pega[0] < linhas[0].length && pega[1] < linhas.length, `${nome}: a pega cai no desenho`);
    for (const p of kit.costas.braco) assert.ok(CHAVES.has(p.at(-1)), `${nome}: braço de trás`);
  }
  assert.equal(KITS.linkedin.cores.p, '#0a66c2');
  assert.equal(KITS.github.cores.g, '#39d353');
});
