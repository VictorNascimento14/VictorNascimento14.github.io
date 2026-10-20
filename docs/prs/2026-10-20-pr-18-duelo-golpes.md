# PR #18 — feat(duelo): cenas dos 16 golpes especiais

| | |
|---|---|
| Data | 20/10/2026 |
| Branch | `feat/duelo-golpes` |
| PR | [#18](https://github.com/VictorNascimento14/VictorNascimento14.github.io/pull/18) |

## O que muda

- As cenas das 16 cartas especiais: noite, Café queimando, um grafo de commits se desenhando numa nuvem de bits, a placa com o grito e o efeito de cada golpe.
- Rollback devolve o golpe, git push --force atravessa a defesa rente ao chão, pair programming ataca os dois, headhunter puxa o brilho do rival.

## Por quê

O que faz o duelo virar espetáculo.

## Como testar

`npm test` (grafos, sementes e coerência com as cartas).

## Revisão

Rodada r6: a nuvem de bits passou a ser pintada a 1 px por célula e ampliada; o cache caiu de até 190 MB para ~1 MB, com a imagem idêntica pixel a pixel.

## Arquivos

- `js/jogos/golpes.js`
- `tests/golpes.test.js`
