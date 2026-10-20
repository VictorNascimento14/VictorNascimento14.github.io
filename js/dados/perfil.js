// Quem é o dono do ateliê: o que as seções e o mascote citam. Conteúdo público (ver docs/conteudo.md e o sigilo).
export const perfil = {
  nome: 'Victor',
  nomeCompleto: 'Victor Nascimento',
  letreiro: 'victornascimento',
  // A letra do letreiro onde o mascote pousa no começo (índice no texto, sem o ponto): o "t" de "vict…".
  letraDoPouso: 3,
  email: 'victor.dev.nascimento@gmail.com',
  github: { usuario: 'VictorNascimento14', url: 'https://github.com/VictorNascimento14' },
  linkedin: { nome: 'Victor Nascimento', url: 'https://www.linkedin.com/in/--dev-victor-nascimento' },
  // WhatsApp: só dígitos, com o DDI 55 e o DDD, tudo junto. PROVISÓRIO: o número ainda não chegou; com null, a casa do
  // WhatsApp no Contato mostra "em breve" e não é link (com o número, vira o link de mandar mensagem).
  whatsapp: null,
  // Pontos do busto em frações da imagem (1024 × 1536). PROVISÓRIOS: recalibrar quando chegar a arte final.
  busto: {
    nariz: { x: 0.5, y: 0.255, raioX: 0.035, raioY: 0.03 },   // onde 5 cliques quebram o nariz
    base: { x: 0.5, y: 0.93, largura: 0.36 },                   // onde ele risca o nome quando fica entediado
  },
};

// As caixas de bronze, na ordem do anel. O texto dos cartões fica no index.html; os números que o cartão mostra e o
// mascote também diz ficam aqui, num lugar só (no cartão, cada um vai num <span data-numero="campo">).
// prs: os PRs que o Victor abriu · total: os PRs do projeto inteiro.
export const projetos = [
  { id: 'processual', numeral: 'I', nome: 'Processual', prs: 564, total: 905 },   // desde julho
  { id: 'chat', numeral: 'II', nome: 'chat.trynux', prs: 557, total: 1932 },      // de abril a outubro de 2026
  { id: 'viral', numeral: 'III', nome: 'Trynux Viral', prs: 245, total: 256, dias: 12 },   // do zero, em 12 dias
  { id: 'decalque', numeral: 'IV', nome: 'Decalque', prs: 27 },   // PRs num dia só
  { id: 'lab', numeral: 'V', nome: 'Trynux Lab', prs: 354, total: 625 },          // de abril a outubro de 2026
];
