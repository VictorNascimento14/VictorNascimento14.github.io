# PR #17 — feat(duelo): regras, 96 cartas e IA de três níveis

| | |
|---|---|
| Data | 20/10/2026 |
| Branch | `feat/duelo-regras` |
| PR | [#17](https://github.com/VictorNascimento14/VictorNascimento14.github.io/pull/17) |

## O que muda

- LinkedIn (Artigo, Conexão) × GitHub (Merge, Review), com 96 cartas de nomes do mundo do Victor e os números do original.
- O lance na ordem exata: roubo, truques, ataques, Force push, contra-ataque, preço, perda parando no marco e consequências.
- Repost, Recomendação, Conflitos, CI e Café; rodada, compra (3 fica 1) e fim por queda, "fora do ar" ou pontos.
- IA fácil, média e difícil, com previsão. Sem DOM.

## Por quê

O motor do duelo, testável no Node.

## Como testar

`npm test` (cada regra, determinismo, os três fins e a bateria IA × IA).

## Revisão

Rodada r6: nenhum número difere da especificação, carta a carta; fuzz de 1.500 partidas limpo; testes de lance para Conflitos, roubo duplo, roubo no eco e bônus de bloqueio.

## Arquivos

- `js/jogos/duelo-regras.js`
- `tests/duelo.test.js`
