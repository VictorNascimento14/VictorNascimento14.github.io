# victornascimento.

O portfólio do Victor Nascimento: um ateliê de mármore e bronze em HTML, CSS e JavaScript puro, sem build e sem
dependência em tempo de execução. Um pequeno escultor alado arrasta um bloco de mármore até o meio da tela, esculpe o
busto do Victor golpe a golpe e depois acompanha o visitante pela página: as cinco caixas de bronze dos projetos, a
placa com as contribuições do GitHub, o Coliseu com LinkedIn × GitHub e o prado grego do contato. Por trás, 25
conquistas, conversa com o escultor, segredos, jogo da velha, copinhos, cabo de guerra, um duelo de cartas e uma área
restrita com um Tetris de mármore.

No ar em **https://victornascimento14.github.io/**.

Inspirado em [ofelipemart](https://ofelipemart.gevia.co/), reconstruído do zero: código, arte e conteúdo próprios.

## Rodar

```bash
npm run dev        # servidor local em http://localhost:5173 (python3 -m http.server)
npm run lint       # sintaxe de todo o JS e restos de depuração
npm test           # testes das partes puras (node --test)
```

Não há etapa de build: o site publicado é a própria pasta (`index.html`, `css/`, `js/`, `assets/`, `admin/`).

## Atualizar o conteúdo

| O quê | Onde |
|---|---|
| Contribuições do GitHub | `npm run contribuicoes` (usa o `gh` autenticado; grava `assets/dados/contribuicoes.js`) |
| Nome, links, WhatsApp, números dos projetos, pontos do busto | `js/dados/perfil.js` |
| Números do LinkedIn e do GitHub na arena | `js/dados/redes.js` |
| Textos dos cartões dos projetos | `index.html` (bloco da seção de projetos) |
| As 25 conquistas | `js/dados/conquistas.js` |
| Imagens (busto, bloco, estátuas) | `assets/img/originais/*.png` → `python3 tools/imagens.py` (ver `docs/imagens.md`) |

## Pendências do Victor

- **Imagens**: o busto (com o rosto dele), o bloco bruto e as estátuas do LinkedIn e do GitHub — prompts e tamanhos em
  `docs/imagens.md`. Até lá o site usa versões provisórias sem rosto.
- **WhatsApp**: o número (55 + DDD + número) em `js/dados/perfil.js`; até lá a porta mostra "em breve".
- **LinkedIn**: seguidores (e, se quiser, posts e desde quando) em `js/dados/redes.js`; até lá o cartão diz
  "PROVISÓRIO".
- **Busto**: depois da arte final, recalibrar `busto.nariz` e `busto.base` em `js/dados/perfil.js`.

## Como é feito

A arquitetura, os contratos entre as partes e as decisões estão em [`docs/arquitetura.md`](docs/arquitetura.md).
Em resumo: módulos ES por seção (`js/secoes/`), arte em pixel desenhada em canvas e SVG gerado (`js/arte/`), um
relógio só para todas as animações (`js/nucleo/relogio.js`), o mascote como serviço que as seções chamam por
"trabalhos" com prioridade (`js/mascote.js`), e os jogos e sistemas da Fase 2 e 3 em `js/jogos/`. Tudo funciona com
movimento reduzido, teclado e leitor de tela, e o essencial aparece sem JavaScript.
