# PR #19 — feat(duelo): o palco do duelo de cartas no Coliseu

| | |
|---|---|
| Data | 20/10/2026 |
| Branch | `feat/duelo-palco` |
| PR | [#19](https://github.com/VictorNascimento14/VictorNascimento14.github.io/pull/19) |

## O que muda

- Tocar num gladiador abre o duelo: tabuleiro com nível e metal, e o tour "Como joga".
- Mão e fileiras com vãos e previsão; a rodada se joga sozinha (flip, choque, pops, narrador e falas do escultor); marcos com Café; as cenas dos golpes.
- Rápido, pular e sair; faixa do fim; a conquista "Duelista".
- Teclado, leitor de tela, toque e movimento reduzido.

## Por quê

O jogo maior do site, na arena do LinkedIn × GitHub.

## Como testar

Na arena, tocar num gladiador e jogar contra o escultor.

## Revisão

Rodada r5: callbacks atrasados conferem se ainda é o mesmo duelo (Esc durante o voo da carta deixava uma rodada rodar sobre o tabuleiro); erro num quadro encerra o duelo e devolve a arena em vez de congelar; o escultor não cobre o narrador; as explicações das regras vão também para leitor de tela.

## Arquivos

- `js/jogos/duelo.js`
- `css/duelo.css`
- `index.html`
- `js/main.js`
- `css/sem-js.css`
