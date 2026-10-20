# PR #1 — chore: ferramentas de desenvolvimento e CI

| | |
|---|---|
| Data | 20/10/2026 |
| Branch | `chore/ferramentas` |
| PR | [#1](https://github.com/VictorNascimento14/VictorNascimento14.github.io/pull/1) |

## O que muda

- `npm run lint` (`tools/checar.mjs`): confere a sintaxe de todo JavaScript como módulo ES e barra `console.log` e `debugger` esquecidos, sem dependência.
- `npm test` com o `node --test` do próprio Node.
- `tools/captura.mjs`: fotografa o site num Chromium sem janela (desktop ou celular, com ou sem movimento reduzido, uma seção, uma sequência de quadros) e lista os erros do console.
- `tools/contribuicoes.mjs`: grava o calendário de contribuições do ano a partir da GraphQL do GitHub.
- `tools/imagens.py`: confere tamanho e transparência das imagens, gera os WebP e cria o bloco de mármore a partir da silhueta do busto quando ele não vem.
- CI (`.github/workflows/verificar.yml`): lint e testes em todo PR e em cada merge na `main`.
- `CLAUDE.md` com as regras do repositório e `PROJETOS.md` com o registro do projeto.

## Por quê

O site não tem build, mas precisa de verificação: lint e testes no CI e fotos do navegador para conferir layout e animação contra a referência.

## Como testar

`npm ci && npm run lint && npm test` (ainda sem testes: passa vazio). Com `npm run dev` no ar, `node tools/captura.mjs --tela=desk`.

## Revisão

Scripts de desenvolvimento, fora do site publicado. `tools/contribuicoes.mjs` só lê pela GraphQL com o `gh` já autenticado; nenhum segredo entra no repositório. `playwright-core` é dependência de desenvolvimento e usa o Chromium do cache local.

## Arquivos

- `package.json`
- `package-lock.json`
- `tools/checar.mjs`
- `tools/captura.mjs`
- `tools/contribuicoes.mjs`
- `tools/imagens.py`
- `.github/workflows/verificar.yml`
- `CLAUDE.md`
- `PROJETOS.md`
