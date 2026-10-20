# PR #4 — feat(arte): o escultor alado e os cursores em pixel art

| | |
|---|---|
| Data | 20/10/2026 |
| Branch | `feat/arte-escultor` |
| PR | [#4](https://github.com/VictorNascimento14/VictorNascimento14.github.io/pull/4) |

## O que muda

- O escultor alado (14 × 17): boina, cabeça grande, cinzel com a ponta como referência de posição, maço que gira no ombro, asas por modo, sentado, andando, elmo, sem boina, piscar, sombra ou contorno, metais, tons pedra/gelo/luz e kits de armadura.
- O ator montado num canvas próprio: golpe com impacto aos 0,27 s, pulinho e o deslocamento real desenhado.
- Os quatro cursores (seta, cinzel, mão e punho) em `image-set` na densidade da tela, refundidos no metal do site.

## Por quê

O mesmo ator serve ao mascote, ao rosto da caixa de ajuda, aos aprendizes da placa e aos gladiadores, e tudo mira na ponta do cinzel.

## Como testar

`npm run lint`; os cursores aparecem a partir do herói.

## Revisão

Corpo simétrico em x = 7: virar não desloca o corpo. Conferido: nitidez em dpr 1,25, 1,5 e 2; a ponta desenhada cai no fio em 64 casos; 32 mil estados cabem no quadro do canvas.

## Arquivos

- `js/arte/escultor.js`
- `js/arte/cursor.js`
