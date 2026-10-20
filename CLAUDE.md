# victornascimento — regras do repositório

- Leia `docs/arquitetura.md` antes de mexer: contratos do ator (§4) e do mascote (§5), convenções (§3), sinais (§8),
  Fases 2 e 3 (§10, §11). Contrato não muda sem atualizar a doc.
- HTML/CSS/JS puro em módulos ES, sem dependência em tempo de execução e sem build. Nomes e comentários em português.
- Pixel art sempre nítida: pixel inteiro, origem encaixada no pixel de dispositivo, canvas nunca escalado por CSS.
- Toda parte funciona com movimento reduzido, teclado e leitor de tela; nenhuma conquista pode ficar impossível.
- Conteúdo público segue o sigilo do Victor: só "Campêlo Advocacia" e "Trynux" pelo nome, nenhum número de negócio.
  A lista do que nunca aparece fica fora deste repositório.
- Verificação: `npm run lint`, `npm test` e `node tools/captura.mjs` (desktop e celular, com e sem `--parado`,
  console limpo). Máquina com pouca RAM: um Chromium por vez.
- Commits em Conventional Commits, em português, **sem assinatura de IA** (sem `Co-Authored-By`, sem "Generated with").
