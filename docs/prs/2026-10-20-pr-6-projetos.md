# PR #6 — feat(projetos): cinco caixas de bronze num anel 3D

| | |
|---|---|
| Data | 20/10/2026 |
| Branch | `feat/projetos` |
| PR | [#6](https://github.com/VictorNascimento14/VictorNascimento14.github.io/pull/6) |

## O que muda

- O pórtico: cornija com dentículos, colunas jônicas cortadas pela borda e piso.
- As cinco caixas de bronze em pixel art (I Processual, II chat.trynux, III Trynux Viral, IV Decalque, V Trynux Lab) num anel 3D que gira por arrasto, setas e teclado, cada caixa redesenhada no seu pixel.
- O escultor bate na emenda da tampa, ela abre e o cartão do projeto sobe de dentro da caixa; vitrine automática na primeira vez; brilho periódico.
- Capas tipográficas próprias para cada projeto.

## Por quê

Os projetos contados pelo Victor: o que é, o que ele fez e a história por trás da entrega.

## Como testar

`npm test` (geometria do anel e do baú). No site: arrastar o anel, ← →, Enter na caixa da frente, Esc fecha.

## Revisão

Rodada r2: abrir uma caixa e sair da seção em ~1 s puxava a página de volta (agora só traz o cartão à vista se o visitante não rolou); fechar de novo apagava o giro pedido e a seta seguinte pulava uma caixa; o balão cobria o rodapé do cartão no celular; Esc só fecha caixa à vista; troca de densidade refaz as caixas; números de PR num lugar só. A tampa aberta não é mais cortada (o original cortava 4 colunas).

## Arquivos

- `js/arte/bau.js`
- `js/arte/anel.js`
- `js/secoes/projetos.js`
- `css/projetos.css`
- `tests/projetos.test.js`
- `index.html`
- `js/main.js`
- `css/sem-js.css`
