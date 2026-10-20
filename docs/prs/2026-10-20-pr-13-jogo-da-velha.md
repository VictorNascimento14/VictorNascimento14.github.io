# PR #13 — feat(jogos): jogo da velha na laje de mármore

| | |
|---|---|
| Data | 20/10/2026 |
| Branch | `feat/jogo-da-velha` |
| PR | [#13](https://github.com/VictorNascimento14/VictorNascimento14.github.io/pull/13) |

## O que muda

- A laje sobe da grama para o meio do prado e a página escurece.
- O visitante risca o X; o escultor voa e entalha o O com um golpe; a linha vencedora fica dourada.
- Placar guardado; Esc ou clique fora devolve a laje à grama; conquistas "Três em linha" e "Generoso".

## Por quê

O primeiro jogo contra o escultor.

## Como testar

No Contato, tocar na laje; setas e Enter jogam.

## Revisão

Rodada r4: as teclas de página não rolam a página por trás do jogo. Corrigidos dois defeitos do original: o foco entra no jogo mesmo quando o escultor começa, e a dica atualiza na hora.

## Arquivos

- `js/jogos/velha.js`
- `css/jogos.css`
- `index.html`
- `js/main.js`
- `css/sem-js.css`
