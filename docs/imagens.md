# Imagens que o Victor gera

As imagens são a única parte do site que não sai do código. Todas em **PNG com fundo transparente**
(o site converte para WebP). Luz sempre vindo **de cima, à esquerda**, como no resto do site.
Coloque os arquivos prontos em `assets/img/originais/` com os nomes abaixo.

| Arquivo | Tamanho | Obrigatória | Onde aparece |
|---|---|---|---|
| `busto.png` | 1024 × 1536 | sim | herói: o retrato esculpido |
| `bloco.png` | 1024 × 1536 | recomendada | herói: o bloco bruto de onde o busto sai (sem ela, o site gera um a partir da silhueta do busto) |
| `estatua-linkedin.png` | 640 × 670 | sim | arena: estátua do LinkedIn |
| `estatua-github.png` | 640 × 670 | sim | arena: estátua do GitHub |

## 1. Busto

Use uma foto sua de frente, sorrindo, como referência.

> Classical white Carrara marble portrait bust of the person in the reference photo, smiling, carved like a Roman
> bust: hair carved in stone, a toga draped over the shoulders and chest, the lower part breaking into rough,
> unfinished chiseled rock. Front view, centered and symmetrical; top of the head close to the top edge, rough base
> touching the bottom edge. Soft studio light from the upper left, faint gray veins, matte stone. No pedestal, no
> text, fully transparent background. Portrait 2:3, 1024×1536.

## 2. Bloco bruto

Mesmo enquadramento do busto: o bloco precisa cobrir toda a silhueta do busto, porque o busto é revelado de dentro
dele, golpe a golpe.

> A rough, unworked block of the same white Carrara marble, tall and slightly tapered, covered in irregular chisel
> facets and point-chisel marks, same color, texture and soft upper-left light as the bust. Front view, centered;
> slightly wider and taller than the bust so the bust could be carved out of it. No pedestal, no text, fully
> transparent background. Portrait 2:3, 1024×1536.

## 3. Estátuas da arena (LinkedIn × GitHub)

As duas precisam sair com o mesmo estilo: gere a segunda usando a primeira como referência.

> The LinkedIn "in" logo carved in relief on a thick rounded-square slab of warm beige limestone, the logo's square
> frame raised from the slab, rough chipped and broken edges all around, small pores and hairline cracks, matte
> stone. Front view, centered, soft light from the upper left with a gentle shadow inside the carving. No text, no
> background, fully transparent background. 640×670.

> The GitHub Octocat mark (the cat silhouette inside a circle) carved in relief on a thick rounded-square slab of
> warm beige limestone, exactly the same stone, size, chipped edges, lighting and framing as the reference image.
> Front view, centered. No text, no background, fully transparent background. 640×670.

## Depois de gerar

Rode `python3 tools/imagens.py`: ele confere tamanho e transparência, verifica se o bloco cobre o
busto e grava as versões WebP que o site usa.
