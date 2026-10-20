// Conversa (js/jogos/conversa.js): a normalização e o casamento de intenções da spec 06 §6.3, com as perguntas que um
// visitante faz de verdade (acento, maiúscula, abreviação de celular, erro de digitação) e a ordem que decide os
// empates; e a sanidade do quiz e das respostas. Roda com `node --test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizar, intencao, partir, INTENCOES, RESPOSTAS, HISTORIAS, TOPICOS } from '../js/jogos/conversa.js';
import { projetos } from '../js/dados/perfil.js';

test('normalizar: minúsculas, sem acento, só letras, dígitos, espaço e @ / . -', () => {
  assert.equal(normalizar('Quem é VOCÊ?'), 'quem e voce');
  assert.equal(normalizar('  Olá!!!   tudo   bem??  '), 'ola tudo bem');
  assert.equal(normalizar('Ação, coração & pão'), 'acao coracao pao');
  assert.equal(normalizar('chat.trynux'), 'chat.trynux');
  assert.equal(normalizar('E-mail: victor@x.com / rm -rf'), 'e-mail victor@x.com / rm -rf');
  assert.equal(normalizar('linha\tquebrada\nde novo'), 'linha quebrada de novo');
  assert.equal(normalizar('Ñandu ü'), 'nandu u');
});

test('normalizar: vazio, só espaço ou só símbolo vira null (nada é enviado)', () => {
  for (const vazio of ['', '   ', null, undefined, '?!…', '🙂👍']) assert.equal(normalizar(vazio), null, String(vazio));
  assert.equal(intencao('   '), null);
  assert.equal(intencao(''), null);
});

// Cada frase deve cair na intenção da chave.
const CASOS = {
  console: ['escultor.oi()', 'escultor.olá();', 'window.escultor.oi()', 'ESCULTOR.OI( )'],
  segredo: ['eureka!', 'EURECA', 'e o konami?', 'deploy'],
  sudo: ['sudo me conta tudo', 'rm -rf /', 'sou root'],
  admin: ['tem administrador?', 'qual a senha?', 'como hackear isso', '/admin'],
  robo: ['você é um robô?', 'vc é uma IA?', 'isso é chatgpt?', 'como você funciona?', 'tu é bot?'],
  quem: ['quem é você?', 'Quem é vc', 'qual seu nome', 'como você se chama?', 'o que você faz?', 'e o escultor?',
    'oi, quem é você?'],
  processual: ['o que é o Processual?', 'processual', 'procesual', 'e a Process IA?', 'gestão de prazos', 'caixa 1',
    'quem fez o processual?'],
  chat: ['chat.trynux', 'o que é o chat trinux', 'atendimento por whatsapp', 'whatsapp da trynux', 'kanban', 'caixa II'],
  viral: ['trynux viral', 'o que é o viral?', 'carrossel', 'ele faz reels?', 'caixa 3'],
  decalque: ['decalque', 'decalk', 'extensão do chrome', 'tem algo com figma?', 'design system', 'caixa iv'],
  lab: ['trynux lab', 'o lab', 'leads', 'ranking na tv', 'gestão comercial', 'caixa 5'],
  quiz: ['quiz', 'quero jogar o quiz', 'de que caixa é essa história', 'aposto que acerto'],
  velha: ['jogo da velha', 'tic tac toe'],
  jogar: ['jogos', 'tem jogo?', 'tô entediado', 'quero brincar', 'cabo de guerra'],
  inventario: ['trocar de metal', 'cadê o elmo?', 'quero ver a ficha', 'virar de ouro'],
  conquistas: ['quantas medalhas?', 'qual o prêmio?', 'conquistas', 'tem prata?'],
  segredos: ['tem segredo?', 'easter egg', 'me dá uma dica', 'algo escondido?'],
  contato: ['contato', 'qual o e-mail dele?', 'email', 'me passa o whatsapp', 'quero contratar', 'tem vaga?',
    'quero trabalhar com o Victor', 'como falar com ele', 'freela', 'qual o número dele?'],
  curriculo: ['tem currículo?', 'manda o cv'],
  pessoal: ['quantos anos ele tem?', 'onde ele mora?', 'ele tem namorada?'],
  numeros: ['quantos PRs?', 'quantos pull requests ele abriu', 'commits', 'contribuições no github'],
  redes: ['redes', 'linkedin', 'linkdin', 'github', 'git hub', 'tem instagram?', 'o coliseu'],
  ia: ['IA', 'como ele usa IA?', 'inteligência artificial', 'agentes de código', 'vibe coding', 'usa gpt?', 'I.A.'],
  stack: ['qual a stack?', 'ele sabe react?', 'usa next.js?', 'typescript', 'postgres', 'que tecnologias ele usa',
    'é full stack?', 'faz testes?'],
  estudos: ['o que ele estuda?', 'faculdade', 'ele é formado?', 'qual a formação dele', 'o Victor estuda onde?'],
  trabalho: ['onde ele trabalha?', 'o que é a trynux?', 'campêlo advocacia', 'ele trabalha com advogados?', 'experiência'],
  projetos: ['projetos', 'portfólio', 'portifolio', 'quais os trabalhos dele', 'o que tem nas caixas?', 'cases'],
  elogio: ['que site lindo', 'muito massa', 'incrível!', 'gostei', 'o victor é foda', 'parabéns'],
  valeu: ['obrigado!', 'vlw', 'obg', 'valeu, tchau', 'obrigado pela ajuda'],
  tchau: ['tchau', 'flw', 'até mais', 'adeus'],
  victor: ['quem é o Victor?', 'quem é o vitor', 'o que ele faz?', 'quem fez esse site?', 'ele é dev?', 'oi victor',
    'me fala sobre ele', 'é engenheiro?'],
  site: ['como foi feito esse site?', 'o que é isso?', 'pixel art', 'o código'],
  ajuda: ['ajuda', 'socorro', 'o que posso perguntar?', 'help', 'menu'],
  tudobem: ['tudo bem?', 'oi, tudo bem?', 'como vai?', 'como vc tá?'],
  oi: ['oi', 'oiii', 'olá', 'e aí', 'bom dia', 'opa', 'salve', 'eae'],
  nada: ['qual a capital da França', 'asdfgh', 'banana', '42'],
};

for (const [esperado, frases] of Object.entries(CASOS)) {
  test(`intenção ${esperado}`, () => {
    for (const frase of frases) assert.equal(intencao(frase), esperado, `"${frase}" → ${intencao(frase)}, esperava ${esperado}`);
  });
}

test('toda intenção da lista tem caso de teste e resposta', () => {
  for (const [id, padrao] of INTENCOES) {
    assert.ok(CASOS[id], `sem caso de teste: ${id}`);
    assert.ok(RESPOSTAS[id], `sem resposta: ${id}`);
    assert.equal(padrao.flags.includes('g'), false, `${id}: regex com /g guarda estado entre chamadas`);
  }
  assert.ok(RESPOSTAS.nada);
});

test('os seis tópicos caem na intenção que prometem', () => {
  assert.equal(TOPICOS.length, 6);
  for (const t of TOPICOS) assert.equal(intencao(t.texto), t.id, t.rotulo);
});

test('respostas: texto curto, sem chave sobrando e com chips no formato [rótulo, ação, legenda?]', () => {
  for (const [id, responder] of Object.entries(RESPOSTAS)) {
    for (let i = 0; i < 6; i++) {   // as sorteadas também
      const r = responder();
      const texto = partir(r.fala).map(p => p.texto).join('');
      assert.ok(texto.length > 0 && texto.length <= 240, `${id}: ${texto.length} caracteres`);
      assert.doesNotMatch(texto, /\{\{|\}\}|undefined|NaN/, `${id}: ${texto}`);
      for (const chip of r.chips ?? []) {
        assert.equal(typeof chip[0], 'string', `${id}: rótulo`);
        assert.ok(typeof chip[1] === 'function' || /^https?:\/\//.test(chip[1]), `${id}: ação de ${chip[0]}`);
      }
    }
  }
});

test('quiz: só histórias das cinco caixas, pelo menos duas de cada, sem repetir', () => {
  const ids = new Set(projetos.map(p => p.id));
  for (const h of HISTORIAS) {
    assert.ok(ids.has(h.projeto), h.projeto);
    assert.ok(h.trecho.length >= 30 && h.trecho.length <= 160, `${h.trecho.length}: ${h.trecho}`);
  }
  for (const id of ids) assert.ok(HISTORIAS.filter(h => h.projeto === id).length >= 2, `poucas histórias: ${id}`);
  assert.equal(new Set(HISTORIAS.map(h => h.trecho)).size, HISTORIAS.length);
});

test('partir: {{palavras|url}} vira link só com http(s) e mailto', () => {
  assert.deepEqual(partir('É {{o e-mail|mailto:a@b.c}}.'), [{ texto: 'É ' }, { texto: 'o e-mail', url: 'mailto:a@b.c' }, { texto: '.' }]);
  assert.deepEqual(partir('{{aqui|https://x.dev}}'), [{ texto: 'aqui', url: 'https://x.dev' }]);
  assert.deepEqual(partir('{{perigo|javascript:alert(1)}}'), [{ texto: 'perigo' }]);
  assert.deepEqual(partir(''), []);
});
