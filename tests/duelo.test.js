// O duelo de cartas (js/jogos/duelo-regras.js): montagem, as 96 cartas, o lance na ordem exata da spec 07 §6.3, a
// rodada, o fim, a IA de 3 níveis, a previsão do vão e os textos. Roda com `node --test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TIMES, CARTAS, NIVEIS, METAIS, REGRAS, rng, novoJogo, abrir, comprar, escolher, jogarRodada, fim, decidirIA,
  prever, descrever, selo, resumir, copiar, aplicar,
} from '../js/jogos/duelo-regras.js';

// ---------- ajudantes ----------

let uidTeste = 1e6;
const carta = id => {
  const c = CARTAS.find(x => x.id === id);
  assert.ok(c, `carta ${id}`);
  return { ...c, uid: ++uidTeste };
};
const lutador = (jogo, lado, i) => jogo.lados[lado].lutadores[i];
const semCard = eventos => eventos.map(({ card, ...e }) => e);

// Um duelo montado à mão (decks por id) e uma rodada jogada. `ajustar` mexe no estado antes; `times[0]` é o lado 0.
function duelo(deck0, deck1, ajustar = () => {}, times = ['linkedin', 'github']) {
  const jogo = novoJogo({ time: times[0], aleatorio: rng(7) });
  jogo.jogadas = 1;
  jogo.rodada = 2;
  jogo.lados[0].luta = deck0.map(carta);
  jogo.lados[1].luta = deck1.map(carta);
  ajustar(jogo);
  return { jogo, ...jogarRodada(jogo) };
}

// ---------- montagem e dados ----------

test('times: 44 de vida cada, marcos e assinaturas do original', () => {
  for (const t of Object.values(TIMES)) assert.equal(t.lutadores.reduce((s, l) => s + l.vida, 0), 44);
  const resumo = t => TIMES[t].lutadores.map(l => [l.id, l.nome, l.vida, l.marcos.join(','), l.assinatura]);
  assert.deepEqual(resumo('linkedin'), [
    ['artigo', 'Artigo', 20, '16,12,8,4', 'repost'], ['conexao', 'Conexão', 24, '20,16,12,8,4', 'recomendacao'],
  ]);
  assert.deepEqual(resumo('github'), [
    ['merge', 'Merge', 24, '18,12,6', 'conflitos'], ['review', 'Review', 20, '16,12,8,4', 'ci'],
  ]);
  assert.deepEqual(Object.fromEntries(Object.entries(NIVEIS).map(([k, n]) => [k, n.metal])),
    { facil: 'bronze', medio: 'prata', dificil: 'ouro' });
  assert.deepEqual(REGRAS, { alcance: 5, rodadas: 10, conflitos: 5, anel: 4, compra: 3, ruido: 0.35 });
});

test('96 cartas: 16 por time e metal, 8 por lutador, uma inicial cada, ids e nomes únicos', () => {
  assert.equal(CARTAS.length, 96);
  assert.equal(new Set(CARTAS.map(c => c.id)).size, 96);
  assert.equal(new Set(CARTAS.map(c => c.nome)).size, 96);
  for (const time of ['linkedin', 'github']) {
    for (const metal of METAIS) {
      assert.equal(CARTAS.filter(c => c.time === time && c.metal === metal).length, 16, `${time} ${metal}`);
      for (const i of [0, 1]) {
        const minhas = CARTAS.filter(c => c.time === time && c.metal === metal && c.lutador === i);
        assert.equal(minhas.length, 8);
        assert.equal(minhas.filter(c => c.inicial).length, 1, `${time} ${metal} ${i}: uma inicial`);
      }
    }
  }
  for (const c of CARTAS) assert.ok(['ataque', 'defesa', 'truque'].includes(c.tipo), c.id);
  for (const c of CARTAS.filter(x => x.tipo === 'ataque')) assert.ok(c.dano >= 1, c.id);
});

// A função mecânica de cada vaga, transcrita da tabela da spec §7.1 (ordem do original, lutador a lutador).
const CHAVES = ['dano', 'nosDois', 'combo', 'porConflito', 'forcePush', 'rouba', 'alcance', 'alcanceTime',
  'alcanceParceiro', 'cura', 'curaParceiro', 'ci', 'recomenda', 'conflitos', 'resolve', 'preco', 'repost', 'inicial'];
function mecanica(c) {
  const p = [c.tipo[0]];
  for (const k of CHAVES) if (c[k]) p.push(c[k] === true ? k : `${k} ${c[k]}`);
  for (const g of ['seAcertar', 'seBloquear', 'depois']) {
    for (const [k, v] of Object.entries(c[g] ?? {}).sort()) p.push(v === true ? `${g}.${k}` : `${g}.${k} ${v}`);
  }
  return p.join(', ');
}
const ESPERADO = {
  'linkedin bronze 0': ['a, dano 1, inicial', 'a, dano 2, seAcertar.alcance 1', 'a, dano 3', 'a, dano 1, depois.alcance 1',
    't, forcePush 2', 't, alcance 2', 't, cura 1, repost', 'd, seBloquear.alcance 1'],
  'linkedin bronze 1': ['d, inicial, seBloquear.cura 1', 't, curaParceiro 3', 'd, seBloquear.recomenda', 't, recomenda',
    'd, seBloquear.devolve 2', 'd, seBloquear.cura 2', 't, cura 1, resolve 2', 'a, dano 1, depois.alcanceParceiro 1'],
  'github bronze 0': ['a, dano 1, inicial', 't, alcance 1, cura 1', 'a, dano 4, preco 1', 'a, dano 1, nosDois',
    'a, dano 1, seAcertar.conflitos 1', 't, forcePush 1, conflitos 1', 'd, seBloquear.cura 2', 'd, seBloquear.alcance 1'],
  'github bronze 1': ['d, ci 1, inicial', 'd, seBloquear.alcanceParceiro 1', 't, rouba 2, cura 1', 'd, seBloquear.ci 2',
    't, alcanceTime 1', 'a, dano 3', 't, ci 2', 'd, seBloquear.cura 1'],
  'linkedin prata 0': ['a, dano 1, inicial', 'd, seBloquear.devolve 2', 'd, seBloquear.cura 1, seBloquear.devolve 1',
    'a, dano 2, seAcertar.alcance 1', 'a, dano 1, combo 1', 't, alcance 1, cura 1', 't, cura 1, repost', 'a, dano 1, repost'],
  'linkedin prata 1': ['d, inicial, seBloquear.cura 1', 't, curaParceiro 2', 'd, seBloquear.devolve 1, seBloquear.resolve 1',
    't, curaParceiro 1, recomenda', 'a, dano 1, depois.alcanceParceiro 1', 'd, seBloquear.cura 2, seBloquear.resolve 1',
    't, resolve 2', 't, rouba 2'],
  'github prata 0': ['a, dano 1, inicial', 'd, seBloquear.devolve 2', 'a, dano 1, combo 1', 't, alcance 1, cura 1',
    't, alcance 1, cura 2', 'a, dano 1, nosDois', 'a, dano 1, seAcertar.conflitos 1', 'a, dano 1, porConflito 1'],
  'github prata 1': ['d, ci 1, inicial', 'd, seBloquear.cura 1, seBloquear.devolve 1', 't, alcanceTime 1',
    'd, seBloquear.alcanceParceiro 1', 't, curaParceiro 2', 'a, dano 2', 't, rouba 2', 't, cura 1, ci 2'],
  'linkedin ouro 0': ['a, dano 1, inicial', 'a, dano 5, preco 2', 'a, dano 1, forcePush 1', 'a, dano 1, combo 2',
    'd, seBloquear.devolve 3', 't, rouba 2', 'a, dano 2, repost', 't, forcePush 2'],
  'linkedin ouro 1': ['d, inicial, seBloquear.recomenda', 't, rouba 3', 't, alcanceTime 1',
    'd, seBloquear.cura 1, seBloquear.devolve 1', 'a, dano 2, preco 1', 'd, seBloquear.resolve 2',
    't, curaParceiro 2, recomenda', 't, resolve 3'],
  'github ouro 0': ['a, dano 2, inicial', 'a, dano 5, preco 2', 'a, dano 1, combo 1', 't, forcePush 3', 't, rouba 2, alcance 1',
    'd, seBloquear.alcance 1', 'a, dano 1, conflitos 1, seAcertar.conflitos 1', 'a, dano 1, porConflito 1'],
  'github ouro 1': ['d, inicial, seBloquear.ci 1', 'd, seBloquear.ci 2', 'd, seBloquear.devolve 2', 'a, dano 3, preco 2',
    't, curaParceiro 2', 'a, dano 1, ci 1', 't, ci 3', 't, forcePush 1, ci 1'],
};
const vaga = (time, metal, i) => CARTAS.filter(c => c.time === time && c.metal === metal && c.lutador === i);

test('os números de cada carta são os do original, vaga por vaga', () => {
  for (const [chave, esperado] of Object.entries(ESPERADO)) {
    const [time, metal, i] = chave.split(' ');
    assert.deepEqual(vaga(time, metal, +i).map(mecanica), esperado, chave);
  }
});

test('as 16 especiais: nome e golpe da arquitetura §11, no lutador, metal e vaga da carta original', () => {
  const ESPECIAIS = [
    ['notificacoes', 'Post viral', 'linkedin', 'bronze', 0, 2], ['conexoes', 'Minha rede', 'linkedin', 'bronze', 1, 5],
    ['merge-main', 'Merge sem review', 'github', 'bronze', 0, 2], ['pair', 'Pair programming', 'github', 'bronze', 0, 3],
    ['release', 'Release', 'github', 'bronze', 1, 5], ['rollback', 'Resposta nos comentários', 'linkedin', 'prata', 0, 1],
    ['hot-take', 'Hot take', 'linkedin', 'prata', 0, 3], ['endosso', 'Recomendação escrita', 'linkedin', 'prata', 1, 5],
    ['streak', 'Sequência de commits', 'github', 'prata', 0, 2], ['mencao', 'Code owner', 'github', 'prata', 1, 5],
    ['deploy-sexta', 'Thread polêmica', 'linkedin', 'ouro', 0, 1],
    ['commits-atomicos', 'Post de aprendizados', 'linkedin', 'ouro', 0, 3],
    ['headhunter', 'Proposta de emprego', 'linkedin', 'ouro', 1, 1], ['hotfix', 'Hotfix em produção', 'github', 'ouro', 0, 1],
    ['push-force', 'Force push', 'github', 'ouro', 0, 3], ['code-review', 'Changes requested', 'github', 'ouro', 1, 2],
  ];
  assert.equal(CARTAS.filter(c => c.golpe).length, 16);
  for (const [golpe, nome, time, metal, i, posicao] of ESPECIAIS) {
    const c = CARTAS.find(x => x.golpe === golpe);
    assert.ok(c, golpe);
    assert.deepEqual([c.nome, c.time, c.metal, c.lutador], [nome, time, metal, i], golpe);
    assert.equal(vaga(time, metal, i).indexOf(c), posicao, `${golpe} na vaga da carta original`);
  }
});

test('novoJogo: as duas iniciais no deck de luta, 14 embaralhadas na compra, o metal do nível no rival', () => {
  const jogo = novoJogo({ time: 'github', nivel: 'dificil', metal: 'prata', aleatorio: rng(3) });
  const [eu, ele] = jogo.lados;
  assert.deepEqual([jogo.rodada, jogo.jogadas, jogo.nivel], [1, 0, 'dificil']);
  assert.deepEqual([eu.time, eu.metal, ele.time, ele.metal], ['github', 'prata', 'linkedin', 'ouro']);
  assert.deepEqual(eu.luta.map(c => c.id), ['commit-wip', 'teste-unitario']);
  assert.deepEqual(ele.luta.map(c => c.id), ['feliz-em-anunciar', 'contato-quente']);
  for (const l of jogo.lados) {
    assert.equal(l.compra.length, 14);
    assert.equal(new Set([...l.luta, ...l.compra].map(c => c.id)).size, 16);
    assert.ok([...l.luta, ...l.compra].every(c => c.time === l.time && c.metal === l.metal));
    assert.deepEqual([l.conflitos, l.recomendacao, l.foraDoAr, l.mao.length, l.nova], [0, null, false, 0, null]);
    for (const f of l.lutadores) {
      const base = TIMES[l.time].lutadores[f.i].vida;
      assert.deepEqual([f.vida, f.max, f.alcance, f.cafe], [base, base, 0, false]);
    }
  }
  assert.equal(eu.lutadores[1].anel, 0);                       // o CI é só do Review
  assert.equal('anel' in eu.lutadores[0], false);
  const uids = jogo.lados.flatMap(l => [...l.luta, ...l.compra].map(c => c.uid));
  assert.equal(new Set(uids).size, 32);
  // Nível ou metal inválidos caem no Médio e no bronze; o rival do LinkedIn é o GitHub.
  const outro = novoJogo({ nivel: 'impossivel', metal: 'diamante', aleatorio: rng(3) });
  assert.deepEqual([outro.nivel, outro.lados[0].time, outro.lados[0].metal, outro.lados[1].metal],
    ['medio', 'linkedin', 'bronze', 'prata']);
  assert.equal(novoJogo({ metalRival: 'ouro' }).lados[1].metal, 'ouro');
});

test('rng: mulberry32 com semente, o mesmo sorteio a cada vez', () => {
  const a = rng(42), b = rng(42), c = rng(43);
  const sa = Array.from({ length: 5 }, a), sb = Array.from({ length: 5 }, b);
  assert.deepEqual(sa, sb);
  assert.notDeepEqual(sa, Array.from({ length: 5 }, c));
  assert.ok(sa.every(v => v >= 0 && v < 1));
});

// ---------- o lance (spec §6.3) ----------

test('bloqueio segura todo ataque contra quem bloqueia, até com alcance 5; nos dois, o parceiro apanha', () => {
  const { jogo, lances } = duelo(['aceitar-conexao'], ['pair-programming'], j => {
    lutador(j, 1, 0).alcance = 5;
    lutador(j, 0, 1).vida = 22;
  });
  assert.deepEqual(semCard(lances[0].eventos), [
    { tipo: 'hit', lado: 0, lutador: 0, n: 6 },                              // o Artigo não bloqueou: 1 + 5
    { tipo: 'hit', lado: 0, lutador: 1, n: 0, held: 6 },                     // a Conexão segura tudo
    { tipo: 'mark', lado: 0, lutador: 0, at: 16, saved: 2, cosmo: true },
    { tipo: 'alc', lado: 0, lutador: 0, n: 1, cosmo: true },
    { tipo: 'heal', lado: 0, lutador: 1, n: 1 },                             // o bônus de quem bloqueou
  ]);
  assert.deepEqual(lances[0].segurado, [6, 0]);
  assert.deepEqual([lutador(jogo, 0, 0).vida, lutador(jogo, 0, 1).vida], [16, 23]);
});

test('contra-ataque: sai uma vez da defesa virada, mesmo segurando o eco, e acerta o rival da vez', () => {
  const { jogo, lances } = duelo(['repost', 'marcar-o-colega'], ['ler-o-diff-inteiro', 'git-revert']);
  assert.deepEqual(lances[0].eventos, []);
  assert.deepEqual(lances[1].duas, [true, false]);
  assert.deepEqual(semCard(lances[1].eventos), [
    { tipo: 'hit', lado: 1, lutador: 0, n: 0, held: 1 },
    { tipo: 'hit', lado: 0, lutador: 1, n: 2, ind: true, counter: true },  // na Conexão, não no 1º lutador
    { tipo: 'alc', lado: 0, lutador: 0, n: 1 },                              // depois: +1 alcance para o Artigo
    { tipo: 'hit', lado: 1, lutador: 0, n: 0, held: 1, echo: true },       // o eco também é segurado...
    { tipo: 'alc', lado: 0, lutador: 0, n: 1, echo: true },                // ...mas não devolve de novo
  ]);
  const contra = lances[1].eventos.find(e => e.counter);
  assert.equal(contra.card, jogo.lados[1].luta[1].uid);
  assert.deepEqual(lances[1].segurado, [0, 2]);
  assert.deepEqual([lutador(jogo, 0, 1).vida, lutador(jogo, 0, 0).alcance], [22, 2]);
});

test('Repost: só a carta seguinte age de novo, com o mesmo combo; a defesa do rival segura sem bônus', () => {
  const a = duelo(['repost', 'parte-2-de-5'], ['daily', 'branch-protegida'], j => { lutador(j, 1, 0).vida = 20; });
  assert.deepEqual(semCard(a.lances[1].eventos), [
    { tipo: 'hit', lado: 1, lutador: 0, n: 0, held: 2 },                   // 1 + combo 1 (o Repost é do Artigo)
    { tipo: 'heal', lado: 1, lutador: 0, n: 2 },
    { tipo: 'hit', lado: 1, lutador: 0, n: 0, held: 2, echo: true },       // mesmo combo; nada de cura
  ]);
  assert.equal(lutador(a.jogo, 1, 0).vida, 22);
  // Truques também repetem, e só os da carta marcada.
  const b = duelo(['repost', 'modo-criador'], ['daily', 'git-pull']);
  assert.deepEqual(semCard(b.lances[1].eventos), [
    { tipo: 'alc', lado: 0, lutador: 0, n: 2 },
    { tipo: 'alc', lado: 1, lutador: 0, n: 1 },
    { tipo: 'alc', lado: 0, lutador: 0, n: 2, echo: true },
  ]);
  assert.deepEqual([lutador(b.jogo, 0, 0).alcance, lutador(b.jogo, 1, 0).alcance], [4, 2]);
});

test('Café: acende na 1ª parada num marco (não no 1º dano) e só uma vez', () => {
  const { jogo, lances } = duelo(['modo-criador', 'comenta-eu', 'era-uma-vez-um-bug'],
    ['commit-inicial', 'release', 'merge-sem-review']);
  assert.deepEqual(semCard(lances[0].eventos), [
    { tipo: 'alc', lado: 0, lutador: 0, n: 2 },
    { tipo: 'hit', lado: 0, lutador: 0, n: 1 },                              // 20 → 19: dano sem marco, sem Café
  ]);
  assert.deepEqual(semCard(lances[1].eventos), [
    { tipo: 'hit', lado: 0, lutador: 0, n: 3 },
    { tipo: 'hit', lado: 1, lutador: 1, n: 2, ind: true },
    { tipo: 'mark', lado: 0, lutador: 0, at: 16, saved: 0, cosmo: true },   // 19 → 16: parou no marco
    { tipo: 'alc', lado: 0, lutador: 0, n: 1, cosmo: true },
  ]);
  assert.deepEqual(semCard(lances[2].eventos), [
    { tipo: 'hit', lado: 1, lutador: 0, n: 4 },
    { tipo: 'hit', lado: 0, lutador: 0, n: 4 },
    { tipo: 'hit', lado: 1, lutador: 0, n: 1, self: true },
    { tipo: 'mark', lado: 0, lutador: 0, at: 12, saved: 0, cosmo: false },  // 2º marco: sem Café
    { tipo: 'alc', lado: 0, lutador: 0, n: 1 },
  ]);
  assert.deepEqual([lutador(jogo, 0, 0).vida, lutador(jogo, 0, 0).alcance, lutador(jogo, 1, 0).vida], [12, 4, 19]);
});

test('a perda de um lance para no 1º marco: só cai quem já está no último', () => {
  const golpe = (vidaArtigo, vidaMerge) => duelo(['bom-dia-rede'], ['hotfix-em-producao'], j => {
    lutador(j, 1, 0).alcance = 5;   // 5 + 5 = 10 de uma vez no Artigo
    lutador(j, 0, 0).vida = vidaArtigo;
    if (vidaMerge) lutador(j, 1, 0).vida = vidaMerge;
  });
  const cheio = golpe(20);
  assert.equal(lutador(cheio.jogo, 0, 0).vida, 16);
  assert.deepEqual(semCard(cheio.lances[0].eventos.filter(e => e.tipo === 'mark' && e.lado === 0)),
    [{ tipo: 'mark', lado: 0, lutador: 0, at: 16, saved: 6, cosmo: true }]);
  assert.equal(cheio.fim, null);
  const ultimo = golpe(4);
  assert.equal(lutador(ultimo.jogo, 0, 0).vida, -6);
  assert.deepEqual([ultimo.fim.vencedor, ultimo.fim.como], [1, 'queda']);
  // O Merge (marcos 18, 12, 6): de 7 para no 6; de 6, cai.
  const merge = vida => duelo(['post-viral'], ['commit-inicial'], j => {
    lutador(j, 0, 0).alcance = 5;
    lutador(j, 1, 0).vida = vida;
  });
  assert.equal(lutador(merge(7).jogo, 1, 0).vida, 6);
  assert.equal(lutador(merge(6).jogo, 1, 0).vida, -2);
});

test('o preço pode derrubar o próprio lutador (e perde o duelo); também para em marco', () => {
  const caiu = duelo(['aceitar-conexao'], ['merge-sem-review'], j => { lutador(j, 1, 0).vida = 1; });
  assert.deepEqual(semCard(caiu.lances[0].eventos), [
    { tipo: 'hit', lado: 0, lutador: 1, n: 0, held: 4 },
    { tipo: 'hit', lado: 1, lutador: 0, n: 1, self: true },
  ]);
  assert.deepEqual([caiu.fim.vencedor, caiu.fim.como], [0, 'queda']);
  const marco = duelo(['aceitar-conexao'], ['hotfix-em-producao'], j => { lutador(j, 1, 0).vida = 19; });
  assert.equal(lutador(marco.jogo, 1, 0).vida, 18);
  assert.ok(marco.lances[0].eventos.some(e => e.tipo === 'mark' && e.at === 18 && e.saved === 1));
});

test('CI: na 2ª etapa o parceiro ganha alcance; na 4ª fecha, volta a zero e dá alcance e vida ao Review', () => {
  const { jogo, lances } = duelo(['aceitar-conexao', 'aceitar-conexao'], ['rodar-a-pipeline', 'pipeline-completa'],
    j => { lutador(j, 1, 1).vida = 17; });
  assert.deepEqual(semCard(lances[0].eventos), [
    { tipo: 'ring', lado: 1, lutador: 1, to: 1 },
    { tipo: 'ring', lado: 1, lutador: 1, to: 2 },
    { tipo: 'alc', lado: 1, lutador: 0, n: 1 },
  ]);
  assert.deepEqual(semCard(lances[1].eventos), [
    { tipo: 'ring', lado: 1, lutador: 1, to: 3 },
    { tipo: 'ring', lado: 1, lutador: 1, to: 4 },
    { tipo: 'alc', lado: 1, lutador: 1, n: 1 },
    { tipo: 'heal', lado: 1, lutador: 1, n: 2 },
    { tipo: 'ring', lado: 1, lutador: 1, to: 1 },
  ]);
  const review = lutador(jogo, 1, 1);
  assert.deepEqual([review.anel, review.alcance, review.vida, lutador(jogo, 1, 0).alcance], [1, 1, 19, 1]);
  // O Pre-commit anda sempre; o Check obrigatório só se bloquear.
  const b = duelo(['comenta-eu', 'bom-dia-rede', 'modo-criador'], ['pre-commit', 'check-obrigatorio', 'check-obrigatorio']);
  assert.deepEqual(semCard(b.lances[0].eventos), [
    { tipo: 'ring', lado: 1, lutador: 1, to: 1 },
    { tipo: 'hit', lado: 1, lutador: 1, n: 2, ind: true },
  ]);
  assert.deepEqual(semCard(b.lances[1].eventos), [
    { tipo: 'hit', lado: 1, lutador: 1, n: 0, held: 1 },
    { tipo: 'ring', lado: 1, lutador: 1, to: 2 },
    { tipo: 'alc', lado: 1, lutador: 0, n: 1 },
    { tipo: 'ring', lado: 1, lutador: 1, to: 3 },
  ]);
  assert.deepEqual(semCard(b.lances[2].eventos), [{ tipo: 'alc', lado: 0, lutador: 0, n: 2 }]);
});

test('Recomendação: protege só o Artigo, some ao anular um ataque e não para Force push nem contra-ataque', () => {
  const { jogo, lances } = duelo(
    ['indicar-para-a-vaga', 'modo-criador', 'bom-dia-rede', 'indicar-para-a-vaga', 'indicar-para-a-vaga', 'bom-dia-rede'],
    ['git-blame', 'abrir-issue', 'commit-inicial', 'git-blame', 'git-blame', 'git-revert']);
  const ev = k => semCard(lances[k].eventos);
  assert.deepEqual(ev(0), [{ tipo: 'token', lado: 0, lutador: 0, use: 'give' }]);
  assert.deepEqual(ev(1), [
    { tipo: 'alc', lado: 0, lutador: 0, n: 2 },
    { tipo: 'hate', lado: 0, n: 1, total: 1 },
    { tipo: 'hit', lado: 0, lutador: 0, n: 1, ind: true },                  // o Force push passa por ela
  ]);
  assert.deepEqual(ev(2), [
    { tipo: 'hit', lado: 1, lutador: 0, n: 3 },
    { tipo: 'hit', lado: 0, lutador: 0, n: 0, token: true },               // anulou o ataque inteiro...
    { tipo: 'token', lado: 0, lutador: 0, use: 'saved', n: 1 },            // ...e voltou para casa
  ]);
  assert.deepEqual(ev(3), [{ tipo: 'token', lado: 0, lutador: 0, use: 'give' }]);
  assert.deepEqual(ev(4), []);                                              // dar a quem já tem não faz nada
  assert.deepEqual(ev(5), [
    { tipo: 'hit', lado: 1, lutador: 0, n: 0, held: 3 },
    { tipo: 'hit', lado: 0, lutador: 0, n: 2, ind: true, counter: true },  // o contra-ataque também passa
  ]);
  assert.equal(jogo.lados[0].recomendacao, 0);
  assert.equal(lutador(jogo, 0, 0).vida, 17);
  // Em casa, com a Conexão, ela não protege ninguém.
  const casa = duelo(['reuniao-de-alinhamento'], ['commit-inicial']);
  assert.deepEqual(semCard(casa.lances[0].eventos), [{ tipo: 'hit', lado: 0, lutador: 1, n: 1 }]);
});

test('Conflitos: presos em [0, 5]; com 5 o time sai do ar no fim do lance e a rodada para', () => {
  const fora = duelo(['bom-dia-rede', 'bom-dia-rede'], ['tabs-espacos', 'commit-inicial'], j => { j.lados[0].conflitos = 3; });
  assert.deepEqual(semCard(fora.lances[0].eventos), [
    { tipo: 'hate', lado: 0, n: 1, total: 4 },
    { tipo: 'hit', lado: 1, lutador: 0, n: 1 },
    { tipo: 'hit', lado: 0, lutador: 0, n: 1 },
    { tipo: 'hate', lado: 0, n: 1, total: 5 },
    { tipo: 'cancel', lado: 0 },
  ]);
  assert.equal(fora.lances.length, 1);
  assert.deepEqual([fora.fim.vencedor, fora.fim.como], [1, 'foraDoAr']);
  const teto = duelo(['bom-dia-rede'], ['tabs-espacos'], j => { j.lados[0].conflitos = 4; });
  assert.equal(teto.lances[0].eventos.filter(e => e.tipo === 'hate').length, 1);   // o 2º +1 bate no teto
  // Chegar a 5 no meio do lance não derruba: a Conexão limpa no eco antes da conferência.
  const meio = duelo(['daily', 'tabs-espacos'], ['repost', 'panos-quentes'], j => { j.lados[1].conflitos = 4; },
    ['github', 'linkedin']);
  assert.deepEqual(semCard(meio.lances[1].eventos.filter(e => e.tipo === 'hate')), [
    { tipo: 'hate', lado: 1, n: 1, total: 5 },
    { tipo: 'hate', lado: 1, n: -2, total: 3 },
    { tipo: 'hate', lado: 1, n: 1, total: 4 },
    { tipo: 'hate', lado: 1, n: -2, total: 2, echo: true },
  ]);
  assert.deepEqual([meio.jogo.lados[1].foraDoAr, meio.fim], [false, null]);
  // Truques: o lado 0 antes do lado 1.
  assert.equal(duelo(['panos-quentes'], ['abrir-issue']).jogo.lados[0].conflitos, 1);
  assert.equal(duelo(['abrir-issue'], ['panos-quentes'], () => {}, ['github', 'linkedin']).jogo.lados[1].conflitos, 0);
});

test('roubo antes de tudo: leva o alcance de antes dos truques, e o ladrão fica no teto de 5', () => {
  const nada = duelo(['modo-criador'], ['nitpick']);
  assert.deepEqual(semCard(nada.lances[0].eventos), [{ tipo: 'alc', lado: 0, lutador: 0, n: 2 }]);
  const roubo = duelo(['modo-criador'], ['nitpick'], j => {
    lutador(j, 0, 0).alcance = 3;
    lutador(j, 1, 1).alcance = 4;
  });
  assert.deepEqual(semCard(roubo.lances[0].eventos), [
    { tipo: 'alc', lado: 0, lutador: 0, n: -2 },
    { tipo: 'alc', lado: 1, lutador: 1, n: 1 },
    { tipo: 'alc', lado: 0, lutador: 0, n: 2 },
  ]);
  assert.deepEqual([lutador(roubo.jogo, 0, 0).alcance, lutador(roubo.jogo, 1, 1).alcance], [3, 5]);
});

test('roubo dos dois lados no mesmo lance: o lado 0 rouba primeiro, e o lado 1 leva do que ficou', () => {
  const { jogo, lances } = duelo(['inmail'], ['fork'], j => {
    lutador(j, 0, 1).alcance = 1;   // a Conexão (InMail)
    lutador(j, 1, 1).alcance = 3;   // o Review (Fork)
  });
  assert.deepEqual(semCard(lances[0].eventos), [
    { tipo: 'alc', lado: 1, lutador: 1, n: -2 },   // a Conexão leva 2 dos 3 do Review...
    { tipo: 'alc', lado: 0, lutador: 1, n: 2 },
    { tipo: 'alc', lado: 0, lutador: 1, n: -2 },   // ...e o Review leva 2 dos 3 que ela tem agora
    { tipo: 'alc', lado: 1, lutador: 1, n: 2 },
  ]);
  assert.deepEqual([lutador(jogo, 0, 1).alcance, lutador(jogo, 1, 1).alcance], [1, 3]);
});

test('Repost num roubo: a 2ª passada rouba de novo, do que o rival tem depois da 1ª', () => {
  const { jogo, lances } = duelo(['repost', 'inmail'], ['git-blame', 'git-blame'], j => { lutador(j, 1, 0).alcance = 3; });
  assert.deepEqual(lances[0].eventos, []);
  assert.deepEqual(lances[1].duas, [true, false]);
  assert.deepEqual(semCard(lances[1].eventos), [
    { tipo: 'alc', lado: 1, lutador: 0, n: -2 },
    { tipo: 'alc', lado: 0, lutador: 1, n: 2 },
    { tipo: 'alc', lado: 1, lutador: 0, n: -1, echo: true },   // o Merge só tinha mais 1
    { tipo: 'alc', lado: 0, lutador: 1, n: 1, echo: true },
  ]);
  assert.deepEqual([lutador(jogo, 0, 1).alcance, lutador(jogo, 1, 0).alcance], [3, 0]);
});

test('Conflito de merge: +1 de dano por Conflito do time atingido, não do time de quem ataca', () => {
  const { lances } = duelo(['parabens-pelo-cargo'], ['conflito-de-merge'], j => {
    j.lados[0].conflitos = 3;
    j.lados[1].conflitos = 1;
    lutador(j, 1, 0).alcance = 1;
  });
  assert.deepEqual(semCard(lances[0].eventos.filter(e => e.tipo === 'hit')), [
    { tipo: 'hit', lado: 0, lutador: 1, n: 5 },   // 1 de dano + 1 de alcance + 3 Conflitos do LinkedIn
  ]);
});

test('bônus de bloqueio: Recomendação, Conflitos resolvidos e alcance para o parceiro; a cura do parceiro para no máximo', () => {
  const recomenda = duelo(['validar-competencia'], ['commit-inicial']);
  assert.deepEqual(semCard(recomenda.lances[0].eventos), [
    { tipo: 'hit', lado: 0, lutador: 1, n: 0, held: 1 },
    { tipo: 'token', lado: 0, lutador: 0, use: 'give' },   // a Conexão segurou e recomendou o Artigo
  ]);
  assert.equal(recomenda.jogo.lados[0].recomendacao, 0);
  const resolve = duelo(['desligar-notificacoes'], ['commit-inicial'], j => { j.lados[0].conflitos = 3; });
  assert.deepEqual(semCard(resolve.lances[0].eventos), [
    { tipo: 'hit', lado: 0, lutador: 1, n: 0, held: 1 },
    { tipo: 'hate', lado: 0, n: -2, total: 1 },
  ]);
  const parceiro = duelo(['bom-dia-rede'], ['lgtm']);
  assert.deepEqual(semCard(parceiro.lances[0].eventos), [
    { tipo: 'hit', lado: 1, lutador: 1, n: 0, held: 1 },
    { tipo: 'alc', lado: 1, lutador: 0, n: 1 },             // o Review segurou: +1 de alcance para o Merge
  ]);
  const cura = duelo(['parabens-pelo-cargo'], ['lgtm'], j => { lutador(j, 0, 0).vida = 19; });
  assert.deepEqual(semCard(cura.lances[0].eventos), [{ tipo: 'heal', lado: 0, lutador: 0, n: 1 }]);   // +3, preso em 20
});

test('o alcance que entra na força é o de depois dos truques do próprio lance', () => {
  const { lances } = duelo(['aceitar-conexao'], ['smoke-test'], j => {
    lutador(j, 1, 1).anel = 3;
    lutador(j, 1, 1).vida = 15;
  });
  assert.deepEqual(semCard(lances[0].eventos), [
    { tipo: 'ring', lado: 1, lutador: 1, to: 4 },
    { tipo: 'alc', lado: 1, lutador: 1, n: 1 },
    { tipo: 'heal', lado: 1, lutador: 1, n: 2 },
    { tipo: 'hit', lado: 0, lutador: 1, n: 0, held: 2 },                   // 1 de dano + o alcance do CI
  ]);
});

test('um marco por passada: o eco pode atravessar mais um', () => {
  const { jogo, lances } = duelo(['repost', 'post-viral'], ['daily', 'commit-inicial'], j => { lutador(j, 0, 0).alcance = 4; });
  assert.deepEqual(semCard(lances[1].eventos.filter(e => e.lado === 1)), [
    { tipo: 'hit', lado: 1, lutador: 0, n: 7 },
    { tipo: 'mark', lado: 1, lutador: 0, at: 18, saved: 1, cosmo: true },
    { tipo: 'alc', lado: 1, lutador: 0, n: 1, cosmo: true },
    { tipo: 'hit', lado: 1, lutador: 0, n: 7, echo: true },
    { tipo: 'mark', lado: 1, lutador: 0, at: 12, saved: 1, cosmo: false, echo: true },
  ]);
  assert.equal(lutador(jogo, 1, 0).vida, 12);
});

// ---------- rodada e fim (§6.4) ----------

test('fim: queda, Fora do ar acima da queda, dupla queda e 10 rodadas vão para os pontos', () => {
  const defesas = ajustar => duelo(['aceitar-conexao'], ['branch-protegida'], j => {
    j.jogadas = 9;
    j.rodada = 10;
    ajustar(j);
  });
  assert.deepEqual(defesas(j => { lutador(j, 0, 0).vida = 15; }).fim,
    { vencedor: 1, como: 'pontos', pontos: [39, 44], rodada: 10 });
  assert.deepEqual(defesas(() => {}).fim, { vencedor: 'empate', como: 'pontos', pontos: [44, 44], rodada: 10 });
  // Antes da 10ª ninguém vence por pontos: a rodada só avança.
  const meio = duelo(['aceitar-conexao'], ['branch-protegida'], j => { j.jogadas = 3; j.rodada = 4; });
  assert.deepEqual([meio.fim, meio.jogo.jogadas, meio.jogo.rodada, fim(meio.jogo)], [null, 4, 5, null]);
  // Saiu do ar perde, mesmo que um lutador do rival tenha caído no mesmo lance.
  const ambos = duelo(['bom-dia-rede'], ['tabs-espacos'], j => {
    j.lados[0].conflitos = 4;
    lutador(j, 1, 0).vida = 1;
  });
  assert.ok(lutador(ambos.jogo, 1, 0).vida <= 0);
  assert.deepEqual([ambos.fim.vencedor, ambos.fim.como], [1, 'foraDoAr']);
  // Um caído de cada lado: pontos (vida negativa conta zero).
  const dupla = duelo(['bom-dia-rede'], ['commit-inicial'], j => {
    lutador(j, 0, 0).vida = 1;
    lutador(j, 1, 0).vida = 1;
    lutador(j, 0, 1).vida = 10;
  });
  assert.deepEqual([dupla.fim.vencedor, dupla.fim.como, dupla.fim.pontos], [1, 'pontos', [10, 20]]);
  // A rodada para no lance da queda, e depois do fim nada mais é jogado.
  const queda = duelo(['bom-dia-rede', 'bom-dia-rede', 'bom-dia-rede'], ['commit-inicial', 'commit-inicial', 'commit-inicial'],
    j => { lutador(j, 1, 0).vida = 1; });
  assert.equal(queda.lances.length, 1);
  assert.deepEqual([queda.fim.vencedor, queda.fim.como, queda.fim.rodada], [0, 'queda', 2]);
  assert.deepEqual(jogarRodada(queda.jogo), { lances: [], fim: queda.fim });
  assert.equal(decidirIA(queda.jogo, 1), null);
});

test('abrir, comprar e escolher: a carta escolhida entra no vão e as outras voltam para o fim da compra', () => {
  const jogo = novoJogo({ aleatorio: rng(5) });
  const [a, b] = jogo.lados[0].luta;
  assert.deepEqual(abrir(jogo, 0, 1).map(c => c.uid), [b.uid, a.uid]);
  assert.deepEqual(abrir(jogo, 0, { ...a }).map(c => c.uid), [a.uid, b.uid]);   // vale a carta (ou uma cópia)
  assert.throws(() => abrir(jogo, 0, 2));
  jogarRodada(jogo);
  assert.throws(() => abrir(jogo, 0, 0), /rodada 1/);
  const l = jogo.lados[0], topo = l.compra.slice(0, 3).map(c => c.uid);
  const mao = comprar(jogo, 0);
  assert.deepEqual(mao.map(c => c.uid), topo);
  assert.deepEqual(comprar(jogo, 0).map(c => c.uid), topo);                    // a mesma mão, sem comprar de novo
  assert.equal(l.compra.length, 11);
  assert.throws(() => escolher(jogo, 0, { uid: -1 }, 0), /mão/);
  const c = escolher(jogo, 0, 1, 99);                                          // posição presa ao tamanho do deck
  assert.equal(c.uid, topo[1]);
  assert.deepEqual(l.luta.map(x => x.uid), [a.uid, b.uid, topo[1]]);
  assert.deepEqual(l.compra.slice(-2).map(x => x.uid), [topo[0], topo[2]]);
  assert.deepEqual([l.mao.length, l.nova, l.luta.length + l.compra.length], [0, topo[1], 16]);
  const m2 = comprar(jogo, 1);
  escolher(jogo, 1, { ...m2[2] }, -3);
  assert.equal(jogo.lados[1].luta[0].uid, m2[2].uid);
  jogarRodada(jogo);
  assert.deepEqual(jogo.lados.map(x => x.nova), [null, null]);               // jogada a rodada, a carta deixa de ser nova
});

// Um duelo IA × IA com a semente dada. `conferir(jogo, lado, decisão, antes)` vê cada decisão; `rodada(r, antes)` cada
// rodada jogada.
function partida(semente, { time = 'linkedin', metal = 'bronze', metalRival, niveis = ['medio', 'medio'] } = {}, ganchos = {}) {
  const jogo = novoJogo({ time, nivel: niveis[1], metal, metalRival, aleatorio: rng(semente) });
  let r;
  do {
    for (const lado of [1, 0]) {
      const antes = copiar(jogo);
      const d = decidirIA(jogo, lado, niveis[lado]);
      ganchos.conferir?.(jogo, lado, d, antes);
    }
    const antes = copiar(jogo);
    r = jogarRodada(jogo);
    ganchos.rodada?.(r, antes, jogo);
  } while (!r.fim);
  return { jogo, fim: r.fim };
}
const estado = jogo => jogo.lados.map(l => ({
  conflitos: l.conflitos, recomendacao: l.recomendacao, foraDoAr: l.foraDoAr,
  lutadores: l.lutadores.map(f => [f.vida, f.alcance, f.cafe, f.anel]),
}));

test('aplicar: os eventos de cada rodada, reaplicados no começo dela, chegam ao estado final', () => {
  let rodadas = 0;
  for (let s = 1; s <= 12; s++) {
    partida(s, { time: s % 2 ? 'linkedin' : 'github', metal: METAIS[s % 3], niveis: ['dificil', 'facil'] }, {
      rodada(r, antes, jogo) {
        for (const l of r.lances) for (const e of l.eventos) aplicar(antes, e);
        assert.deepEqual(estado(antes), estado(jogo), `semente ${s}`);
        rodadas++;
      },
    });
  }
  assert.ok(rodadas > 40);
});

test('prever: não mexe no jogo, ignora a carta nova do rival e acerta quando ele repete a ordem', () => {
  // Meio de uma partida: três rodadas jogadas, o visitante com a mão comprada e o mascote já decidido.
  const jogo = novoJogo({ nivel: 'dificil', aleatorio: rng(11) });
  for (let k = 0; k < 3; k++) {
    decidirIA(jogo, 1);
    decidirIA(jogo, 0, 'medio');
    jogarRodada(jogo);
  }
  assert.equal(fim(jogo), null);
  const mao = comprar(jogo, 0);
  const tamanho = jogo.lados[0].luta.length;
  const todas = () => mao.flatMap((_, k) => Array.from({ length: tamanho + 1 }, (_, at) => prever(jogo, 0, k, at)));
  const foto = () => JSON.stringify([estado(jogo), jogo.rodada, jogo.jogadas,
    jogo.lados.map(l => [l.luta, l.compra, l.mao].map(x => x.map(c => c.uid)))]);
  const f0 = foto();
  const antesDele = todas();
  assert.equal(foto(), f0);                                                      // prever não mexe em nada
  assert.ok(antesDele.every(v => Number.isFinite(v.tira) && Number.isFinite(v.perde)));
  decidirIA(jogo, 1);
  assert.notEqual(jogo.lados[1].nova, null);
  assert.deepEqual(todas(), antesDele);                                          // a escolha dele não vaza
  // Se ele repetir a ordem (o deck dele sem a carta nova), a rodada real dá exatamente a previsão.
  const v = prever(jogo, 0, 2, 1);
  const espelho = copiar(jogo);
  espelho.lados[1].luta = espelho.lados[1].luta.filter(c => c.uid !== espelho.lados[1].nova);
  const vida = l => l.lutadores.reduce((t, f) => t + Math.max(0, f.vida), 0);
  const antes = espelho.lados.map(vida);
  escolher(espelho, 0, 2, 1);
  jogarRodada(espelho);
  assert.deepEqual([v.tira, v.perde], [antes[1] - vida(espelho.lados[1]), antes[0] - vida(espelho.lados[0])]);
  assert.equal(prever(jogo, 0, 9, 0), null);                                     // índice fora da mão
});

// ---------- a IA (§6.5) ----------

// Toda decisão da IA é uma jogada válida: na abertura, uma das duas cartas na frente; na compra, uma carta da mão
// num vão de 0 a tamanho, sem mexer nas cartas que já estavam, as outras duas no fim da compra e nada no rival.
function conferirJogada(jogo, lado, d, antes) {
  const l = jogo.lados[lado], a = antes.lados[lado];
  assert.ok(d, 'a IA decide enquanto o duelo segue');
  const uids = lista => lista.map(c => c.uid);
  if (antes.jogadas === 0) {
    assert.deepEqual(uids(l.luta).sort(), uids(a.luta).sort());
    assert.deepEqual([l.luta[0].uid, d.posicao], [d.carta.uid, 0]);
  } else {
    const mao = a.mao.length ? a.mao : a.compra.slice(0, REGRAS.compra);
    assert.ok(mao.some(c => c.uid === d.carta.uid), 'a carta saiu da mão');
    assert.ok(Number.isInteger(d.posicao) && d.posicao >= 0 && d.posicao <= a.luta.length, 'vão existente');
    assert.equal(l.luta[d.posicao].uid, d.carta.uid);
    assert.deepEqual(uids(l.luta.filter(c => c.uid !== d.carta.uid)), uids(a.luta));
    assert.deepEqual(uids(l.compra.slice(-2)), uids(mao.filter(c => c.uid !== d.carta.uid)));
    assert.deepEqual([l.mao.length, l.nova], [0, d.carta.uid]);
  }
  assert.equal(new Set(uids([...l.luta, ...l.compra, ...l.mao])).size, 16);
  assert.deepEqual(uids(jogo.lados[1 - lado].luta), uids(antes.lados[1 - lado].luta));
}

test('a IA nunca faz jogada inválida, nos três níveis, nos dois times e nos três metais', () => {
  const nomes = Object.keys(NIVEIS);
  let decisoes = 0;
  for (let s = 0; s < 27; s++) {
    const niveis = [nomes[s % 3], nomes[Math.floor(s / 3) % 3]];
    const { jogo, fim: f } = partida(100 + s, { time: s % 2 ? 'github' : 'linkedin', metal: METAIS[Math.floor(s / 9)], niveis }, {
      conferir(...args) { conferirJogada(...args); decisoes++; },
    });
    assert.ok(f && jogo.jogadas <= REGRAS.rodadas && f.rodada === jogo.rodada);
    assert.ok([0, 1, 'empate'].includes(f.vencedor) && ['queda', 'foraDoAr', 'pontos'].includes(f.como));
    assert.ok(jogo.lados.every(l => l.luta.length === jogo.jogadas + 1), 'uma carta nova por rodada, dos dois lados');
  }
  assert.ok(decisoes > 300);
});

test('determinismo: a mesma semente joga o mesmo duelo, carta a carta e evento a evento', () => {
  const rastro = semente => {
    const linhas = [];
    const { fim: f } = partida(semente, { niveis: ['dificil', 'facil'], metal: 'ouro' }, {
      rodada(r) {
        for (const l of r.lances) {
          const id = uid => r.lances.flatMap(x => x.cartas).find(c => c?.uid === uid)?.id ?? null;
          linhas.push(JSON.stringify([l.cartas.map(c => c?.id), l.eventos.map(e => ({ ...e, card: id(e.card) }))]));
        }
      },
    });
    return [...linhas, JSON.stringify(f)];
  };
  assert.deepEqual(rastro(77), rastro(77));
  assert.notDeepEqual(rastro(77), rastro(78));
});

test('bateria IA × IA: o nível maior vence mais (mesmo metal dos dois lados, cadeiras e times trocados)', t => {
  const N = 120;
  for (const [baixo, alto] of [['facil', 'medio'], ['medio', 'dificil'], ['facil', 'dificil']]) {
    const placar = { [alto]: 0, [baixo]: 0, empate: 0 };
    let rodadas = 0;
    for (let k = 0; k < N; k++) {
      const niveis = k % 2 ? [baixo, alto] : [alto, baixo];
      const metal = METAIS[Math.floor(k / 4) % 3];
      const { fim: f } = partida(5000 + k, { time: k % 4 < 2 ? 'linkedin' : 'github', metal, metalRival: metal, niveis });
      placar[f.vencedor === 'empate' ? 'empate' : niveis[f.vencedor]]++;
      rodadas += f.rodada;
    }
    t.diagnostic(`${alto} × ${baixo} em ${N}: ${JSON.stringify(placar)}, fim em média na rodada ${(rodadas / N).toFixed(1)}`);
    assert.ok(placar[alto] > placar[baixo], `${alto} vence mais que ${baixo}`);
  }
  // As metas do original (§6.5) para um visitante que pensa às vezes: ~3 em 4 no Fácil, menos da metade no Médio,
  // ~1 em 3 no Difícil.
  const vitorias = Object.keys(NIVEIS).map(nivel => {
    let v = 0;
    for (let k = 0; k < N; k++) {
      if (partida(9000 + k, { time: k % 2 ? 'linkedin' : 'github', niveis: ['medio', nivel] }).fim.vencedor === 0) v++;
    }
    t.diagnostic(`visitante Médio (bronze) contra o mascote no ${NIVEIS[nivel].nome}: vence ${v} de ${N}`);
    return v;
  });
  assert.ok(vitorias[0] > vitorias[1] && vitorias[1] > vitorias[2], 'quanto maior o nível, menos o visitante vence');
  assert.ok(vitorias[0] > N / 2 && vitorias[1] < N / 2 && vitorias[2] < N / 2);
});

// ---------- textos (§7.3 e §7.4) ----------

test('descrever: as partes na ordem do original, com os nomes do tema', () => {
  const d = id => descrever(CARTAS.find(c => c.id === id));
  assert.equal(d('titulo-chamativo'), 'Ataque 2. Se acertar, +1 alcance.');
  assert.equal(d('merge-sem-review'), 'Ataque 4. O Merge perde 1 de vida.');
  assert.equal(d('pair-programming'), 'Ataque 1 nos dois lutadores do rival.');
  assert.equal(d('aceitar-conexao'), 'Bloqueio: segura todos os ataques contra a Conexão neste lance. Se bloquear, recupera 1.');
  assert.equal(d('lighthouse-100'), 'Ataque 1. Mais Force push 1: nenhum bloqueio segura.');
  assert.equal(d('comenta-eu'), 'Force push 2: nenhum bloqueio segura.');
  assert.equal(d('tabs-espacos'), 'Ataque 1. +1 Conflito no LinkedIn. Se acertar, +1 Conflito no LinkedIn.');
  assert.equal(d('conflito-de-merge'), 'Ataque 1. +1 de dano para cada Conflito no LinkedIn.');
  assert.equal(d('parte-2-de-5'), 'Ataque 1. +1 de dano para cada carta do Artigo já virada na rodada.');
  assert.equal(d('indicar-para-a-vaga'),
    'Passa a Recomendação para o Artigo: o próximo ataque que acertaria o Artigo não tira nada.');
  assert.equal(d('repost'), 'Recupera 1. Repost: a próxima carta do seu deck nesta rodada joga duas vezes.');
  assert.equal(d('cache-do-build'), 'Recupera 1. O CI do Review avança 2 etapas.');
  assert.equal(d('reuniao-de-alinhamento'), 'Recupera 1. Tira 2 Conflitos do seu time.');
  assert.equal(d('marcar-o-colega'), 'Ataque 1. +1 alcance para o Artigo.');
  assert.equal(d('nitpick'), 'Rouba 2 de alcance do rival. Recupera 1.');
  assert.equal(d('daily'), '+1 alcance para os dois.');
  assert.equal(d('comunidade-tech'), 'Bloqueio: segura todos os ataques contra a Conexão neste lance. '
    + 'Se bloquear, devolve 1 com Force push. Se bloquear, tira 1 Conflito do seu time.');
  assert.equal(d('check-obrigatorio'),
    'Bloqueio: segura todos os ataques contra o Review neste lance. Se bloquear, o CI do Review avança 2 etapas.');
  for (const c of CARTAS) {
    const texto = descrever(c);
    assert.match(texto, /^[A-Z+ÁÉÍÓÚ].*\.$/, c.id);
    assert.doesNotMatch(texto, /undefined|NaN|null|\.\./, c.id);
  }
});

test('selo: o número do canto e o ícone, pela primeira regra que casa', () => {
  const s = id => selo(CARTAS.find(c => c.id === id));
  const casos = {
    'post-viral': ['3', 'ataque'], 'lighthouse-100': ['1', 'ataque'], 'minha-rede': ['tudo', 'defesa'],
    'comenta-eu': ['2', 'forcePush'], 'abrir-issue': ['1', 'forcePush'], 'teste-flaky': ['1', 'forcePush'],
    nitpick: ['−2', 'rouba'], 'cherry-pick': ['−2', 'rouba'], repost: ['2×', 'repost'],
    'indicar-para-a-vaga': ['★', 'recomenda'], 'mentor-de-carreira': ['★', 'recomenda'],
    'reuniao-de-alinhamento': ['−#2', 'resolve'], 'rodar-a-pipeline': ['◔2', 'ci'], 'cache-do-build': ['◔2', 'ci'],
    'modo-criador': ['+2', 'alcance'], 'noite-de-sono': ['+1', 'alcance'], daily: ['+1', 'alcance'],
    'parabens-pelo-cargo': ['♥3', 'cura'], 'readme-caprichado': ['♥2', 'cura'],
  };
  for (const [id, [texto, tipo]] of Object.entries(casos)) assert.deepEqual(s(id), { texto, tipo }, id);
  assert.ok(CARTAS.every(c => selo(c).texto && !selo(c).texto.includes('undefined')));
});

test('resumir: o pé de cada carta e o texto dos pops, a partir dos eventos', () => {
  const um = duelo(['aceitar-conexao'], ['pair-programming'], j => {
    lutador(j, 1, 0).alcance = 5;
    lutador(j, 0, 1).vida = 22;
  });
  assert.deepEqual(resumir(um.lances[0]), ['segurou 6, a Conexão +1 vida', 'o Artigo perde 6, para no marco 16, a Conexão segurou tudo']);
  assert.deepEqual(um.lances[0].eventos.map(e => resumir(e)), ['−6', 'segurou', 'de pé!', 'café: +1 alcance', '+1']);
  const eco = duelo(['repost', 'marcar-o-colega'], ['ler-o-diff-inteiro', 'git-revert']);
  assert.deepEqual(resumir(eco.lances[0]), ['nada mudou', 'ninguém atacou']);
  assert.deepEqual(resumir(eco.lances[1]), ['o Merge segurou tudo, o Artigo +1 alcance', 'segurou 1, devolveu 2']);
  assert.deepEqual(resumir(eco.lances[1], { eco: true }), ['o Merge segurou tudo, o Artigo +1 alcance', '']);
  const rec = duelo(['indicar-para-a-vaga', 'modo-criador', 'bom-dia-rede'], ['git-blame', 'abrir-issue', 'commit-inicial']);
  assert.deepEqual(resumir(rec.lances[0]), ['Recomendação para o Artigo', 'ninguém atacou']);
  assert.deepEqual(resumir(rec.lances[1]), ['o Artigo +2 alcance', 'o Artigo perde 1, +1 Conflito']);
  assert.deepEqual(resumir(rec.lances[2]), ['o Merge perde 3', 'a Recomendação salvou o Artigo']);
  const ci = duelo(['aceitar-conexao', 'aceitar-conexao'], ['rodar-a-pipeline', 'pipeline-completa'], j => { lutador(j, 1, 1).vida = 17; });
  assert.deepEqual(resumir(ci.lances[0])[1], 'CI 2 de 4, o Merge +1 alcance');
  assert.deepEqual(resumir(ci.lances[1])[1], 'o CI fechou, CI 1 de 4, o Review +2 vida, o Review +1 alcance');
  const roubo = duelo(['modo-criador'], ['nitpick'], j => { lutador(j, 0, 0).alcance = 3; });
  assert.deepEqual(resumir(roubo.lances[0]), ['o Artigo +2 alcance', 'roubou 2 de alcance, o Review +2 alcance']);
  const limpa = duelo(['panos-quentes'], ['tabs-espacos'], j => { j.lados[0].conflitos = 3; });
  assert.deepEqual(resumir(limpa.lances[0]), ['−2 Conflitos', 'a Conexão perde 1, +2 Conflitos']);
  assert.equal(resumir({ tipo: 'cancel', lado: 0 }), 'fora do ar');
  assert.equal(resumir({ tipo: 'hate', lado: 0, n: -1, total: 0 }), '−1 Conflito');
  assert.equal(resumir({ tipo: 'ring', lado: 1, lutador: 1, to: 4 }), 'o CI fechou');
});
