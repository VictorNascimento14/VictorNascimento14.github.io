# Arquitetura do ateliê

Portfólio do Victor em HTML, CSS e JavaScript puro, sem build e sem dependência em tempo de execução. É uma
reconstrução **original** do site ofelipemart.gevia.co: mesma estrutura, mesma sensação e mesmas mecânicas, com
código novo, arte nova e conteúdo do Victor.

## 0. Regras para quem implementa

1. **Sala limpa.** A referência são as especificações em
   `/tmp/claude-1000/-home-victor-Documentos-DEV/d2d25883-1778-4da1-b5fb-ef7fc79768cc/scratchpad/specs/`
   (`01-heroi-mascote.md` … `08-design-system.md`) e as capturas do original em `…/scratchpad/ref/`
   (`estatico-desk-*.png`, `estatico-cel-*.png`, `prologo/prologo-NNN.png`, a cada 0,55 s). **Nunca abra** a cópia
   do código original (`…/scratchpad/ofelipemart-src/`). Nada de colar código, matrizes de pixel ou paths do
   original: a arte em pixel é desenhada de novo, no mesmo estilo, a partir da descrição.
2. **Português** em nomes de arquivo, função, variável, classe CSS e comentário (termos técnicos consagrados ficam
   em inglês). Comentários explicam o porquê, no tom dos arquivos existentes.
3. **Módulos ES** (`import`/`export`), nada em `window` a não ser o que o navegador exige. Sem bibliotecas.
4. **Dono por arquivo.** Cada agente só edita os arquivos da sua trilha (§1). No `index.html`, só o bloco entre
   `<!-- seção: X -->` e `<!-- /seção: X -->` da sua seção; releia o arquivo antes de cada edição (outros agentes
   mexem em outros blocos). Precisa de algo fora da sua trilha? Registre no relatório final.
5. **Contratos não mudam** sem passar pelo integrador: `js/arte/escultor.js` (§4), `js/mascote.js` (§5),
   `js/nucleo/*` (§2). Quem é dono de um contrato pode mudar o miolo, nunca as assinaturas.
6. **Fidelidade com conserto.** Reproduza o original com exatidão (números, tempos, curvas, camadas), mas corrija
   os defeitos que as especificações apontam (foco de teclado, recortes, falas cortadas, `touch-action`).
7. **Sigilo do conteúdo.** Pode citar "Campêlo Advocacia" e "Trynux". Nenhum outro cliente ou parceiro pelo nome,
   nenhuma pessoa além do Victor, cliente final, número de processo ou número de negócio (faturamento, clientes,
   preços). Métrica técnica pode (PRs, testes, migrations, latência). A lista do que nunca aparece fica fora deste
   repositório, na regra de sigilo do Victor (`linkedin-autopilot/config/sigilo.json`).
8. **Sem commits.** O integrador revisa e commita. Não rode `git commit`, `git push` nem crie branch.
9. **Pouca memória na máquina** (16 GB): um Chromium por vez, sempre fechado ao fim (`tools/captura.mjs` já fecha);
   nada de builds pesados.

## 1. Arquivos e trilhas

```
index.html                 esqueleto de todas as seções (blocos por seção)
css/base.css               tokens, fontes, tipografia, linguagem pixel, estados globais      (integrador)
css/sem-js.css             reserva sem JavaScript (cada trilha acrescenta a sua parte)
css/heroi.css · projetos.css · ano.css · arena.css · contato.css                            (uma por trilha)
js/main.js                 entrada: carrega e inicia cada parte isolada                       (integrador)
js/nucleo/relogio.js · pixel.js · memoria.js · sinais.js · movimento.js                       (integrador)
js/nucleo/rolagem.js       rolagem paginada e trava da 1ª tela                                (trilha herói)
js/arte/escultor.js        o ator em pixel art (contrato §4)                                  (trilha arte)
js/arte/cursor.js          os quatro cursores                                                 (trilha arte)
js/arte/gladiadores.js     kits de armadura dos lutadores                                     (trilha arte)
js/arte/bau.js             a caixa de bronze                                                  (trilha projetos)
js/arte/anel.js            as contas do anel de caixas (funções puras, testadas)             (trilha projetos)
js/arte/placa.js           a placa do ano                                                     (trilha ano)
js/arte/coliseu.js         o interior do Coliseu (SVG)                                        (trilha arena)
js/arte/campo.js · casas.js · pergaminho.js                                                   (trilha contato)
js/mascote.js              o companheiro (contrato §5)                                        (trilha herói)
js/secoes/heroi.js         prólogo e escultura                                                (trilha herói)
js/secoes/projetos.js · ano.js · arena.js · contato.js                                        (uma por trilha)
js/dados/perfil.js         nome, links (whatsapp: null até chegar o número), projetos com PRs e dias, pontos do busto (integrador)
js/dados/redes.js          números do LinkedIn e do GitHub para a arena                       (trilha arena)
js/dados/conquistas.js     as 25 conquistas (ordem, nomes, dicas, frases)                     (integrador)
js/jogos/                  Fase 2 e 3: conquistas, conversa, segredos, velha, copinhos, cabo, tetris, duelo
admin/index.html           a área restrita com o Tetris de mármore (Fase 2)
assets/dados/contribuicoes.js  calendário do GitHub, gerado por tools/contribuicoes.mjs
assets/img/                busto, bloco, estátuas (WebP gerados por tools/imagens.py)
tools/                     checar.mjs (lint), captura.mjs (fotos), contribuicoes.mjs, imagens.py
```

Cada `js/secoes/*.js` exporta `iniciar()`. O `main.js` importa todas em paralelo e inicia em ordem: cursor →
rolagem → herói → projetos → ano → arena → contato. Uma parte que falha não derruba as outras.

## 2. Núcleo (`js/nucleo/`)

| Módulo | API |
|---|---|
| `relogio.js` | `registrar(tarefa)` → `desregistrar()`. `tarefa(dt, agora)` roda a cada quadro e devolve `true` enquanto ainda tem o que animar; com todas em `false`, o laço dorme. `acordar()` religa (chame ao mudar algo que anima). `dt` em segundos, limitado a 0,05. |
| `pixel.js` | `dpr()`, `encaixar(v)` (px CSS no pixel de dispositivo), `prepararCanvas(canvas, w, h)` → ctx sem suavização, `sorteio(semente)` → `() => [0,1)`, `limitar`, `misturar`, `suave` (smootherstep), `saidaCubica`, `entradaCubica`, `seguir(atual, alvo, taxa, dt)` (exponencial). |
| `memoria.js` | `ler(nome, padrão)`, `gravar(nome, valor)`, `apagar(nome)`: JSON em `localStorage` com prefixo `victornascimento:`, tudo protegido. |
| `sinais.js` | `emitir(nome, detalhe)`, `ouvir(nome, fn, {passados})` → `desligar()`. Avisos entre partes (§8). |
| `movimento.js` | `reduzido()` (ao vivo), `aoMudar(fn)`. |

## 3. Convenções

- **Posição do mascote = ponta do cinzel**, em px de viewport depois da escultura. Virar mantém o corpo e troca a
  ponta de lado. Pontos de destino pensados "olhando à esquerda" passam por `deOlharEsquerda(p)`.
- **Pixel art nítido**: tamanho de pixel inteiro (P), origem encaixada em px de dispositivo, canvas nunca escalado
  nem girado por CSS, `image-rendering: pixelated` (classe `.pixel`).
- **Metal**: `html[data-metal="prata"|"ouro"]` troca os tokens `--liga-*`, `--placa-*`, `--cravo-*` (ver
  `css/base.css`). Arte em canvas lê o metal ao desenhar (`document.documentElement.dataset.metal`). A Fase 2 faz
  a "onda" que troca o metal; na Fase 1 basta ler o atributo.
- **Movimento reduzido**: sem prólogo, sem deslize, sem voo; tudo no estado final. Leia `reduzido()` ao vivo.
- **Linguagem pixel** pronta em `css/base.css`: `.painel-pixel`, `.botao-pixel` (`.grande`, `.pequeno`),
  `.botao-discreto`, `.celula` (`.acesa`), `.balao-pixel` (rabicho em `--rabicho`), `.dica-pixel`, `.fundido`.
  Tipografia: `.rotulo`, `.rotulo-secao`, `.titulo-secao` (com `.ponto`), `.lede`, `.link-sublinhado`.
- **Breakpoints**: 1280 · 1200/761 · 1050 · 760 · 560 · 520 · 370 (o que muda em cada um: spec 08 §7).
- **Classes de estado**: `body.carregando`, `body.pronto` (imagens carregadas), `body.esculpindo` (mascote visível),
  `body.completo` (mascote estacionado); `html.rolagem-presa`, `html.deslizando`, `html.arrastando-anel`.

## 4. O ator: `js/arte/escultor.js` (dono: trilha arte)

Espaço do sprite: corpo de 14 × 17 olhando à direita, (0,0) no canto superior esquerdo do corpo. Desenhar arte
**nova** no estilo da spec 01 §4.5 (chibi alado de boina, cinzel e maço; paleta por chaves `b d m l h e s k t w c`;
metais e tons da spec).

Constantes exportadas: `LARGURA_CORPO`, `PONTA`, `PES`, `ASSENTO`, `CAIXA`, `QUADRO` (área do canvas de um ator:
x −9…24, y −5…19 → 33 × 24), `MACO`, `GOLPE` (impacto 0,27 s; total 0,41 s), `ASAS`.

Funções: `ponta(dir)`, `anguloDoGolpe(t)`, `anguloDasAsas(modo, tempo)`,
`desenhar(ctx, x, y, P, estado)` — (x, y) é o canto do corpo e P os pixels do canvas por pixel de sprite, ambos já
em pixels do canvas de destino —, e `montar(canvas, { pixel, dpr, reduzido })` → **ator**:

| Membro | O que faz |
|---|---|
| `canvas`, `pixel`, `dpr`, `largura`, `altura`, `reduzido`, `estado` | dados (largura/altura em px CSS) |
| `definir(parcial)` | mescla no estado; encadeável |
| `golpear(aoImpacto)` / `golpeando` | golpe do maço; `aoImpacto` roda uma vez aos 0,27 s |
| `pular()` | pulinho |
| `avancar(dt)` / `pintar()` | relógio e desenho |
| `origem()`, `ponta()`, `pes()`, `assento()` | pontos em px CSS a partir do canto do canvas, em repouso, na direção atual |

Estado: `dir` (1 | −1), `maco`, `cinzel` (rad | null), `asas` (`rapidas` | `batendo` | `lentas` | `fechadas` |
`nenhuma`), `tempo`, `dormindo`, `sentado`, `sombra`, `contorno` (cor do anel no lugar da sombra), `elmo` (true |
cor da crista), `passos`, `recuo`, `pulo`, `metal` (null | `prata` | `ouro`), `tom` (null | `pedra` | `gelo` |
`luz`), `semBoina`, `kit`.

**Kit** (armadura dos lutadores, spec 07 §4.8): troca boina, cinzel e maço por peças em pixel desenhadas nas chaves
de cor do sprite (então a armadura é fundida no metal) e em chaves próprias de cor fixa (`p` cor do lutador, `q`
sombra, `g` luz, `r`/`n` corda), com camadas `sob`, `cabeca`, `sobre`, `topo`, `pernas`, item na mão da `frente`
(no ângulo do cinzel) e nas `costas` (no ângulo do maço), mais `guarda` e `repouso`. O formato exato é decidido pela
trilha arte e documentado no topo de `escultor.js`; `js/arte/gladiadores.js` exporta os kits.

## 5. O mascote: `js/mascote.js` (dono: trilha herói)

Exporta:

| Nome | O que faz |
|---|---|
| `iniciar()` | monta o ator no botão `#escultor` |
| `mascote` | leitura: `ator` (recriado quando o pixel muda — nunca guarde a referência), `ativo`, `pronto`, `ponto`, `falando`, `trabalhoAtual`, `botao`, `sprite`, `camada`, `balao` |
| `falar(texto \| lista, segundos = 2,8)` | balão; lista = uma fala depois da outra, cada uma pelo tempo de leitura; `{{palavras\|url}}` vira link; fala nova substitui a fila |
| `calar()` | fecha o balão e descarta a fila |
| `virar(dir)` → bool | vira mantendo o corpo |
| `deOlharEsquerda(p)` | converte ponto "olhando à esquerda" para a direção atual |
| `sentarEm(xPes, yBorda)` | ponta para ele sentar com os pés em xPes e o assento em yBorda |
| `limitar(p)`, `descanso()`, `tamanhoDaTela()` | limites da janela (sprite ≥ 8 px das laterais, topo ≥ 90, base ≥ 16) e o ponto de descanso (canto direito, 54% da altura) |
| `trabalho(t)` → `{ soltar() }` | registra um trabalho (abaixo) |
| `livre()` | ativo, pronto, sem movimento reduzido e sem nenhum trabalho querendo o mascote |
| `recado(r)` → bool / `fimDoRecado()` | trabalho de prioridade 10 aceito só se `livre()` |
| `extra({ quadro(dt), ocupado() })` → `desligar()` | parte que roda no relógio do mascote (jogos, segredos) |
| `aoFicarPronto(fn)` | quando a escultura termina e ele estaciona (ou já, se pronto) |
| `virarCompanheiro(pontoInicial)` | chamado pelo herói no fim da escultura |
| `dirigir(fn)`, `colocar(p)` | só para o herói: conduz o mascote quadro a quadro antes de ele virar companheiro |

**Trabalho** = `{ nome, prioridade, alvo(), livre?, meta?, contorno?, chegou?(), quadro?(dt), perdeu?() }`
(`contorno`: cor do anel de 1 px que ele ganha ao chegar, para destacar sobre fundo cheio — a placa usa). A cada quadro o
mascote atende o trabalho de **maior prioridade cujo `alvo()` não é `null`**; `alvo()` devolve a ponta desejada em px
de viewport (é chamado a cada quadro: pode seguir algo que rola). Ao chegar chama `chegou()` uma vez; dali em diante
gruda no alvo e chama `quadro(dt)` (onde o trabalho mexe no ator: `mascote.ator.definir({ sentado: true, asas:
'fechadas' })`, `virar(-1)`, `mascote.ator.golpear(fn)`, `falar(...)`). Trocar `meta` faz ele voar de novo. Se outro
trabalho tomar a vez, ou se `alvo()` virar `null`, chama `perdeu()`. `livre: true` deixa passar das bordas.

Prioridades: caixa pedida pelo visitante **50** > placa **40** > arena **30** > contato **20** > vitrine automática
das caixas **15** > recado **10** > descanso. Sem trabalho, ele volta ao descanso, olha à esquerda, asas lentas.

Receitas (spec 01 §3.4): **sentar numa borda** → `alvo: () => sentarEm(xPes, yBorda)`, `quadro: () =>
mascote.ator.definir({ sentado: true, asas: 'fechadas' })`; **bater uma vez** → em `quadro`, se não bateu,
`mascote.ator.definir({ asas: 'batendo' }).golpear(aoImpacto)`; depois que `!mascote.ator.golpeando`, solte o
trabalho; **observar** → alternar `virar(1)`/`virar(-1)`; **andar no chão** → `livre: true`, alvo que anda,
`definir({ passos, asas: 'fechadas' })`.

Até a trilha herói terminar, `mascote.js` é um provisório funcional (sem prólogo; voo reto) com esta mesma API:
as outras trilhas já podem testar contra ele.

## 6. Herói e rolagem (dono: trilha herói)

`js/secoes/heroi.js`: prólogo (pouso no "t" de "victornascimento" — `perfil.letraDoPouso` —, voo, corda, caixa
"Me ajuda a puxar?", arrasto com duas molas) e escultura em 7 golpes (spec 01). Emite `esculpido` (§8) e chama
`virarCompanheiro`. Imagens: `assets/img/busto.webp` e `assets/img/bloco.webp` (1024 × 1536, transparentes; a
cabeça fica acima de 43% da altura).

`js/nucleo/rolagem.js`: `iniciar()`, `presa()`, `prender()`, `soltar()`, `aoTentarDescer(fn)` → `desligar()`,
`irPara(y)`, `passo(dir)`, `paradas()` — mola criticamente amortecida (7/s), um gesto = uma parada, teclas, âncoras
(spec 01 §6.18, spec 08 §5.3).

Estados que o herói deixa no DOM: `.cena[data-revelado]` (retrato todo esculpido) e `body.falhou` (imagem não
carregou). **Esc**: quem trata a tecla chama `preventDefault()`; o mascote só reage a um Esc não tratado.

## 7. Seções

| Seção | Bloco no HTML | Arquivos | Usa do mascote | Especificação |
|---|---|---|---|---|
| Projetos | `.portico` / `#projetos` | `bau.js`, `projetos.js`, `projetos.css` | trabalho `caixa` (50 / 15), `falar` | 02 |
| Ano | `#ano` | `placa.js`, `ano.js`, `ano.css` | trabalho `placa` (40); aprendizes = `montar` com pixel 2 | 03 |
| Arena | `#redes` | `coliseu.js`, `arena.js`, `arena.css`, `redes.js` | trabalho `arena` (30); gladiadores = `montar` + kit | 04 |
| Contato | `#contato` | `campo.js`, `casas.js`, `pergaminho.js`, `contato.js`, `contato.css` | trabalho `contato` (20) | 05 |

Nomes do original → nossos (para ler as especificações): `.atelier` → `.abertura#inicio`; `#agent` → `#escultor`;
`#pull-help` → `#ajuda`; `#pull-button` → `#puxar`; `.project-gallery` → `.portico`; `#trabalhos` → `#projetos`;
`.vault` → `.anel`; `.chest` → `.bau`; `.work-card` → `.cartao`; `.year` → `.ano`; `.plaque` → `.placa`;
`.arena` → `.arena#redes`; `.rival-li/.rival-ig` → `.rival-linkedin/.rival-github`; `.houses/.house` →
`.casas/.casa` (`data-tipo` = `tesouro` | `tholos` | `teatro` | `stoa`).

**Conteúdo do Victor**: projetos (5 caixas, I a V) em `js/dados/perfil.js` + textos dos cartões no `index.html`;
pesquisa factual em `…/scratchpad/conteudo/projetos.md`. Arena: LinkedIn × GitHub. Contato: e-mail
(`tesouro`), GitHub (`tholos`), LinkedIn (`stoa`) e uma quarta porta a definir (`teatro`). Falas do mascote: mesma
personalidade do original (curtas, brincalhonas, em pt-BR), com fatos do Victor.

## 8. Sinais (para as conquistas da Fase 2)

Emitir com `emitir(nome, detalhe)` de `js/nucleo/sinais.js`, mesmo que ninguém ouça ainda:

| Sinal | Quem emite | Quando |
|---|---|---|
| `visita` `{ voltando, outroDia, hoje, contagem }` | herói | na carga (a memória `visita` já é regravada) |
| `esculpido` | herói | fim da escultura |
| `cutucar` `{ teclado, pronto }` | mascote | clique no mascote; quem atender (a conversa) marca `detalhe.atendido = true` |
| `anel-girou` `{ posicoes }` | projetos | cada giro do anel (para a "tontura") |
| `caixa-aberta` `{ id, pelo: 'visitante' \| 'mascote' }` | projetos | cartão para fora |
| `historia-aberta` `{ id }` | projetos | "Por trás da entrega +" aberto |
| `placa-gravada` | ano | fim da gravação |
| `golpe-do-dia` | ano | clique no pino de hoje e o golpe nele |
| `arena-pronta` | arena | estátuas no lugar e gladiadores frente a frente |
| `pergaminho-aberto` `{ tipo }` | contato | um pergaminho abriu |
| `email-copiado` | contato | cópia bem-sucedida |
| `contato-visto` | contato | seção ≥ 50% visível |

## 9. Verificação

- `npm run lint` (sintaxe de todo JS + `console.log`/`debugger` esquecidos).
- Servidor local já rodando em `http://localhost:5173/` (`npm run dev` se cair).
- `node tools/captura.mjs --tela=desk|cel [--parado] [--secao=#id] [--quadros=N --intervalo=ms] [--inteira]
  [--js="..."] [--clicar=seletor] --saida=capturas/<nome>` fotografa e lista erros do console. Console tem de
  ficar limpo.
- Compare com as capturas do original (mesma tela e mesmo modo) e olhe as suas fotos de verdade antes de dizer que
  está igual. Teste desktop (1440 × 900) e celular (390 × 844), com e sem movimento reduzido.

## 10. Fase 2: conquistas, conversa, segredos e jogos

Especificações: `06-conquistas-conversa-surpresas.md` (conquistas, conversa, segredos), `05-contato-campo.md`
(jogo da velha), `02-projetos-caixas.md` (copinhos), `04-arena-redes.md` (cabo de guerra e quiz). As 25 conquistas
do Victor estão em `js/dados/conquistas.js` (ordem, nomes, dicas, frases, onde, o que a marca desenha).

| Trilha | Arquivos | Conquistas que dispara |
|---|---|---|
| Conquistas | `js/jogos/conquistas.js`, `css/conquistas.css` | o sistema inteiro; e as passivas: `tonto` (sinal `anel-girou`), `caixas` (`caixa-aberta`, acumula entre visitas), `golpe` (`golpe-do-dia`), `madrugada` (carga entre 0h e 4h59 + `contato-visto`), `email` (`email-copiado`), `aba`, `console`, `retorno` (`visita`) |
| Conversa | `js/jogos/conversa.js`, `css/conversa.css` | `papo`, `faro` (quiz "De que caixa é essa história?"), `email` pelo chip |
| Segredos | `js/jogos/segredos.js`, `css/segredos.css` | `cocegas`, `sino`, `terremoto`, `nariz`, `tedio`, `eureca`, `deploy`, `petalas` |
| Jogos | `js/jogos/velha.js`, `copinhos.js`, `cabo.js`, `css/jogos.css` | `velha`, `generoso`, `copinhos`, `cabo` (libera o elmo) |
| Admin | `admin/index.html`, `js/jogos/tetris.js`, `css/admin.css` | `admin`, `tetris` |

### API das conquistas (`js/jogos/conquistas.js`)

`iniciar()`, `CONQUISTAS`, `LIMIAR_PRATA`, `desbloquear(id, de?)` → bool (`de`: elemento ou `{x, y}` da janela;
padrão: o mascote), `tem(id)`, `quantas()`, `nivel()` (`bronze` | `prata` | `ouro`), `metal()` (null | `prata` |
`ouro`, a forma dos sprites), `cabeca()` (`boina` | `elmo` | `careca`), `visual()` → `{ elmo, semBoina }`,
`vestir({ metal?, cabeca? })`, `fundir(alvo, fn(metal, aoVivo))` → `desligar()` (registra algo de metal: chama já e
a cada refundição, quando a onda o alcança), `placar(jogo, patch?)`, `jogo(id, { nome, onde, placar?, jogar?,
oculto? })` (desafio listado no medalheiro), `janela(opções)` (diálogo pixel modal, spec 06 §3.1.1: uma por vez,
foco preso, Esc fecha, devolve o foco), `abrir(aba?)`, `ir(elemento)` (rola até ele pela rolagem paginada).

Sinais que emite: `conquista` `{ id }`, `nivel` `{ nivel }`, `metal` `{ metal }`, `visual` `{ elmo, semBoina }` e
`reset` ("apagar meu progresso", nesta aba ou noutra: quem conta algo em memória para uma conquista zera ao ouvi-lo).
Memória (`js/nucleo/memoria.js`): `atelie` = `{ encontradas: { id: ms }, placar: { jogo: {…} }, visual: { metal?,
cabeca? }, codigo?, zerado? }` e `metal` (o metal vestido, lido pelo script do `<head>` antes da primeira pintura).
Cada gravação relê o disco e mescla com o que outra aba gravou (`mesclarAtelie`, testada); o evento `storage` põe
esta aba em dia. `zerado` é a hora do último "apagar": nada de antes volta na mescla. A `visita` é do herói.
Console: `window.escultor = { oi, ola, 'olá' }` (a única global do site, de propósito); digitar `escultor.oi()` na
conversa vale o mesmo (no celular não há console).

### API da conversa (`js/jogos/conversa.js`)

`iniciar()`, `normalizar(texto)`, `intencao(texto)` → id | `'nada'` | null, `abrir()`, `fechar()`,
`dizer(texto, chips?, opções?)` (chip = `[rótulo, ação, legenda?]`: ação texto = link externo; função = botão),
`aqui(idDaParte, fn)` → `desligar()` (o que dizer naquela parte: `fn()` → null | `{ fala, chips, novo?, larga? }`;
partes: `inicio`, `projetos`, `ano`, `redes`, `contato`), `ondeEstou()`, `aberta()`. Engata no mascote por
`desviarFala(fn)` (com a caixa aberta, as falas vão para ela) e pelo sinal `cutucar` (marca `detalhe.atendido`).
Ao contrário do original, o campo para perguntar livremente **aparece**: o mascote responde sobre o Victor
(projetos, stack, estudos, Trynux, Campêlo Advocacia, contato) a partir de intenções em pt-BR.

### Ganchos já prontos nas seções

- Mascote: `recado`, `livre`, `extra`, `falar`, `virar`, `desviarFala`, `mascote.ator` (definir, golpear, pular).
- Projetos: `anelDeCaixas` (`caixas`, `girarAte`, `abrir`, `fechar`, `travar({ aoEscolher })`, `legendar`,
  `redesenhar`, `ocupado`).
- Arena: `arena` (estado, `jogo`, `pintar`), `pronta()`, `posicionar`, `redesenhar`, `andarAte`, `finalizar`,
  `lugarDoMascote`, `soltarMascote`, `caixaDoGladiador`, `aoTocarGladiador(fn)`, `refazerLayout()` (o duelo encolhe
  o muro quando o narrador ocupa duas linhas). O cabo exporta `desistir()` para o duelo assumir a areia.
- Contato: `contato` (geo, pétalas, laje, casas, noite, fase), `petala(x)`, `pintarPetalas()`, `soltarContato()`,
  `posicionarLaje()`, `desenharLaje(tabuleiro)`, `definirNoite()`, `TRACOS`.

### Decisões de conteúdo

- "Deploy na sexta" (`deploy`) substitui o golpe de Cavaleiros do Zodíaco: digitar `deploy` ou o código Konami faz
  o mascote decolar como foguete e voltar ("Subiu! Ninguém mexe agora.").
- Tédio: ele risca "VICTOR ESTEVE AQUI" na base do busto.
- Faro: quiz com as histórias reais das cinco caixas (o mascote conta, o visitante diz de que projeto é).
- O nariz e a base do busto ficam em `js/dados/perfil.js` (`busto.nariz`, `busto.base`), em frações da imagem; são
  provisórios até a arte final do Victor.
- Movimento reduzido não pode deixar conquista impossível: tédio, pétalas e copinhos ganham uma versão sem animação.

## 11. Fase 3: o duelo de cartas

Especificação: `07-duelo.md` (regras §6, cartas §7.1, golpes §5.6–5.7 e §7.2, interface §1.2, §3, §4, §7). O jogo
é genérico; o tema do Victor troca nomes, arte e falas, **sem mexer em nenhum número** (vidas, marcos, cartas,
teto de alcance 5, contador 5, anel 4, 10 rodadas, compra 3 fica 1, pesos da IA). Sem modo online (o site é
estático): só contra o mascote, nos três níveis.

### Tema

| Original | Mecânica | Victor |
|---|---|---|
| LinkedIn × Instagram | os dois times | **LinkedIn × GitHub** (LinkedIn à esquerda) |
| Textão | atacante que cresce com alcance; assinatura eco | **Artigo**; o eco é o **Repost** ("a próxima carta deste deck joga duas vezes") |
| Networking | tanque/suporte, um marco a mais; ficha de proteção | **Conexão**; a ficha é a **Recomendação** |
| Reels | golpes grandes, marcos espaçados; contador no rival | **Merge**; o contador são os **Conflitos** |
| Stories | bloqueio e truques; anel de 4 | **Review**; o anel é o **CI** (lint, teste, build, deploy) |
| Indireta | dano que ignora bloqueio e ficha | **Force push** |
| Cancelado (5 de Hate) | derrota por contador cheio | **Fora do ar** |
| Cosmo | 1ª parada num marco: +1 alcance | **Café** ("tomou um café: +1 de alcance") |
| Alcance, marco | — | mantêm os nomes |
| Constelação + poeira estelar | cena atrás do lutador | **grafo de commits** (nós e ramos) numa nuvem de bits, nas cores do lutador |
| 16 golpes de Cavaleiros do Zodíaco | cenas das cartas especiais | 16 golpes do mundo dev (ver abaixo) |

Os 16 golpes (a carta especial do original → a do Victor; o efeito mecânico não muda, só nome, grito e cena):

| Id | Carta original (metal, time) | Carta do Victor | Grito | Função mecânica | Cena |
|---|---|---|---|---|---|
| `notificacoes` | Textão viral (bronze, A) | Post viral | CHUVA DE NOTIFICAÇÕES! | ataque forte | sinos e curtidas caindo como meteoros |
| `conexoes` | Rede de contatos (bronze, A) | Minha rede | CORRENTE DE CONEXÕES! | defesa que cura | anéis de nós ligados girando em volta |
| `merge-main` | Viralizou (bronze, B) | Merge sem review | MERGE DIRETO NA MAIN! | ataque que custa vida | uma seta verde enorme que se funde no rival |
| `pair` | Collab (bronze, B) | Pair programming | PAIR PROGRAMMING! | ataque nos dois rivais | dois cursores piscando atacam juntos |
| `release` | Arrasta pra cima (bronze, B) | Release | RELEASE v1.0! | ataque forte que joga para cima | coluna de lançamento que joga o rival para o alto |
| `rollback` | Réplica (prata, A) | Resposta nos comentários | ROLLBACK! | contra-ataque | escudo com o histórico; o golpe volta pelo mesmo caminho |
| `hot-take` | Opinião forte (prata, A) | Hot take | HOT TAKE! | ataque com bônus se acertar | salto alto e mergulho em brasa |
| `endosso` | Carta de referência (prata, A) | Recomendação escrita | ENDOSSO! | defesa | cúpula de aprovação onde o golpe escorrega |
| `streak` | Série (prata, B) | Sequência de commits | STREAK DE COMMITS! | ataque que cresce com as cartas já viradas | quadradinhos verdes batendo de todos os lados |
| `mencao` | Link na bio (prata, B) | Code owner | @MENÇÃO! | ataque (2) | três arrobas de luz como garras |
| `deploy-sexta` | Polêmica (ouro, A) | Thread polêmica | DEPLOY NA SEXTA! | ataque enorme que custa vida | explosão de alertas vermelhos; ele cai de joelho |
| `commits-atomicos` | O que aprendi (ouro, A) | Post de aprendizados | COMMITS ATÔMICOS! | ataque que cresce (+2 por carta) | picadas que se ligam num grafo de commits |
| `headhunter` | Proposta irrecusável (ouro, A) | Proposta de emprego | HEADHUNTER! | rouba alcance | sentado de olhos fechados, puxa o brilho do rival |
| `hotfix` | Um milhão de views (ouro, B) | Hotfix em produção | HOTFIX ÀS 3 DA MANHÃ! | ataque enorme que custa vida | tempestade de raios num terminal; de joelho |
| `push-force` | Corte seco (ouro, B) | Force push | GIT PUSH --FORCE! | Force push (atravessa bloqueio e Recomendação) | lâmina de luz rente ao chão que atravessa tudo |
| `code-review` | Reação (ouro, B) | Changes requested | CODE REVIEW! | contra-ataque | parede de checks; o golpe volta em feixe |

Cada carta especial pertence ao mesmo lutador do original (a A1/A2/B1/B2 da carta original). Atrás do lutador, em vez
de uma constelação, um **grafo de commits** próprio de cada golpe (nós e ramos numa caixa unitária) se desenha numa
nuvem de bits nas cores dele. As outras 80 cartas ganham nomes do mesmo universo, escolhidos pela trilha das regras
com a mesma função mecânica de cada carta.

### Módulos e trilhas

| Trilha | Arquivos | O quê |
|---|---|---|
| Regras | `js/jogos/duelo-regras.js`, `tests/duelo.test.js` | dados (times, 96 cartas com nomes do tema), montagem, lance na ORDEM EXATA da spec §6.3, rodada, compra, fim, IA de 3 níveis, previsão do vão, `rng` (mulberry32). Sem DOM. |
| Interface | `js/jogos/duelo.js`, `css/duelo.css` | a arena virando palco, times entrando, tabuleiro de preparação, tour "Como joga", mão, fileiras, vãos com previsão, lances com flip e choque, HUD dos lutadores, pops, narrador, falas do mascote, rápido/pular/sair, faixa do fim, conquista `cartas`, placar `cartas` |
| Cenas | `js/jogos/golpes.js`, `js/arte/gladiadores.js` (acrescentar) | as 16 cenas (grafo de commits, nuvem de bits, grito, efeito), e os kits que faltam: Conexão e Review (o `linkedin` atual é o Artigo; o `github`, o Merge) |

API de `duelo-regras.js` (a Interface programa contra ela):
`TIMES` (`linkedin`, `github` → `{ nome, lutadores: [{ id, nome, vida, marcos, assinatura }] }`), `CARTAS`,
`rng(semente)`, `novoJogo({ time, nivel, metal, aleatorio })`, `abrir(jogo, lado, ordem)` (rodada 1),
`comprar(jogo, lado)` → 3 cartas, `escolher(jogo, lado, carta, posicao)`, `jogarRodada(jogo)` →
`{ lances: [{ cartas: [c0, c1], eventos, segurado }], fim }`, `fim(jogo)` → `{ vencedor, como }` | null,
`decidirIA(jogo, lado)` (abertura e compra), `prever(jogo, lado, carta, posicao)` → `{ tira, perde }`. Eventos
como na spec §6.3 (`hit`, `heal`, `alc`, `token`, `ring`, `hate`, `mark`, `cancel`), com `lado`, `lutador`,
`n`, `card` (uid) e as marcas `held`, `ind`, `counter`, `self`, `echo`, `cosmo`.

Como ficou (leia o topo de `duelo-regras.js`): campos das cartas em português (`dano`, `forcePush`,
`seBloquear.devolve`…), eventos com a chave `tipo`; `fim` → `{ vencedor: 0 | 1 | 'empate', como: 'queda' |
'foraDoAr' | 'pontos', pontos, rodada }`; `decidirIA` → `{ carta, posicao }`; acréscimos `descrever`, `selo`,
`resumir`, `copiar`, `aplicar`, `REGRAS`, `NIVEIS`, `METAIS`, `ESTILOS`. A IA aplica a jogada na hora e a carta nova
fica em `lado.nova` até a rodada: a interface esconde. Bateria IA × IA (120 partidas): Médio 98 × 22 Fácil,
Difícil 93 × 27 Médio, Difícil 100 × 19 Fácil.

API de `golpes.js`: `ESPECIAIS` (id → `{ nome, grito, cores, grafo, hit, tail, sobe? }`) e
`mostrar(opções)` (spec §6.6, campos com nomes em português) → cena `{ hit, tail, atualizar(dt, posicoes),
desenhar(ctx, P), terminou }`, desenhada pela Interface no canvas de efeitos da arena.

Como ficou (o contrato inteiro está no topo de `golpes.js`): `ESPECIAIS[id]` ganhou `subtitulo` (o ramo sob o grito),
`lutador`, `metal`, `reage?` (a carta não é ataque: o `hit` dela é o `reagir` recebido) e `espelha?`; um teste confere
que nome, metal, lutador e `reage` batem com `CARTAS`. Nas opções, a Interface passa os campos do §6.6 (entre eles
`reagir` e `semente`) e os acréscimos `curta`, `noite` e `indice`; da cena usa `inicio` (aceita escrita: `queda − hit`
quando a outra carta do lance atrasa a queda), `queda`, `fim`, `tremida`, `t`, `poses()` (o que a cena pede aos
sprites: `dx`, `dy`, `giro`, `cinzel`, `asas`, `sentado`…) e `desenhar(ctx, P, dpr, camada)` em **duas** camadas,
`'atras'` (antes dos lutadores, no canvas de trás) e `'frente'` (depois, no da frente). Puros e testados: `unidade`,
`recuperacao`, `voo`, `repeticoes`, `densidade`, `nuvem`, `ceu`.
