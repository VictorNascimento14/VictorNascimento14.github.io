# PR #10 — feat(conquistas): 25 moedas, medalheiro e metais

| | |
|---|---|
| Data | 20/10/2026 |
| Branch | `feat/conquistas` |
| PR | [#10](https://github.com/VictorNascimento14/VictorNascimento14.github.io/pull/10) |

## O que muda

- As 25 conquistas do Victor: a moeda nasce onde aconteceu e voa girando até o HUD "n/25".
- O medalheiro (inventário e medalhas, desafios pelo site) e a janela pixel genérica (foco preso, Esc, devolve o foco).
- Prata com 13 e ouro com 25, com a onda de refundição saindo do escultor; cabeças do escultor; o fecho do ouro com código.
- As conquistas passivas e `escultor.oi()` no console.

## Por quê

É o que transforma o portfólio num lugar para explorar.

## Como testar

`npm test` (níveis, placar e mescla entre abas). No site: cutucar o escultor e abrir o medalheiro pelo HUD.

## Revisão

Rodada r3: com o site aberto em duas abas, uma apagava as medalhas da outra (cada gravação relê e mescla, e o evento `storage` põe a aba em dia); apagar o progresso avisa as outras partes; foco e Esc do medalheiro quando uma moeda pousa; placar corrompido não trava o Colecionador; a medalha Dev tem caminho no celular.

## Arquivos

- `js/dados/conquistas.js`
- `js/jogos/conquistas.js`
- `css/conquistas.css`
- `tests/conquistas.test.js`
- `index.html`
- `js/main.js`
- `css/sem-js.css`
