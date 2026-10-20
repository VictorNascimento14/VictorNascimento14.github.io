// As 25 conquistas do ateliê, na ordem do medalheiro. Cada uma é uma moeda de bronze com a sua marca (9 × 9, uma
// cor), que o visitante cunha ao achar um segredo ou vencer um jogo. Com 13 o site vira prata; com as 25, ouro.
// nome: o que a moeda diz · dica: o encaixe vazio · achada: a frase ao ganhar · onde: a parte do site · marca: o que
// a marca desenha (a arte fica em js/jogos/conquistas.js).
export const LIMIAR_PRATA = 13;

export const CONQUISTAS = [
  { id: 'cocegas', nome: 'Cócegas', dica: 'O escultor não gosta de cutucão.', achada: 'Você cutucou o escultor.', onde: 'o escultor', marca: 'dedo cutucando' },
  { id: 'sino', nome: 'Sino de bronze', dica: 'Bronze faz barulho.', achada: 'Você cutucou tanto que ele tocou como um sino.', onde: 'o escultor', marca: 'sino' },
  { id: 'terremoto', nome: 'Terremoto', dica: 'Tem um limite para cutucar.', achada: 'Você derrubou o site, e a turma reconstruiu.', onde: 'o escultor', marca: 'rachadura' },
  { id: 'nariz', nome: 'Nariz grego', dica: 'Toda estátua antiga perde alguma coisa.', achada: 'Você quebrou o nariz da estátua.', onde: 'o busto', marca: 'nariz de perfil' },
  { id: 'tedio', nome: 'Tédio', dica: 'Deixe o escultor sem nada para fazer.', achada: 'Ele ficou entediado e riscou a pedra.', onde: 'o busto', marca: 'um V riscado na pedra' },
  { id: 'eureca', nome: 'Eureca', dica: 'Grite como Arquimedes.', achada: 'Ele saiu correndo sem a boina.', onde: 'o teclado', marca: 'lâmpada' },
  { id: 'deploy', nome: 'Deploy na sexta', dica: 'Tem uma palavra que todo dev teme na sexta-feira.', achada: 'Você digitou deploy, e ele foi parar em produção.', onde: 'o teclado', marca: 'foguete' },
  { id: 'tonto', nome: 'Tontura', dica: 'O anel das caixas gira bastante.', achada: 'Você girou as caixas até ele ficar tonto.', onde: 'os projetos', marca: 'espiral' },
  { id: 'caixas', nome: 'Colecionador', dica: 'Cinco caixas, cinco projetos.', achada: 'Você abriu as cinco caixas.', onde: 'os projetos', marca: 'caixa aberta' },
  { id: 'copinhos', nome: 'Olho vivo', dica: 'Siga a luz entre as caixas.', achada: 'Você achou a luz três vezes seguidas.', onde: 'os projetos', marca: 'olho' },
  { id: 'golpe', nome: 'Golpe do dia', dica: 'A placa do GitHub espera o golpe de hoje.', achada: 'Você deu o golpe de hoje na placa.', onde: 'a placa', marca: 'maço' },
  { id: 'petalas', nome: 'Primavera', dica: 'O campo solta pétalas.', achada: 'Você pegou 12 pétalas no ar.', onde: 'o contato', marca: 'flor' },
  { id: 'madrugada', nome: 'Madrugada', dica: 'Volte quando todo mundo estiver dormindo.', achada: 'Você visitou o ateliê de madrugada.', onde: 'o contato', marca: 'lua' },
  { id: 'email', nome: 'Anotado', dica: 'Leve o contato com você.', achada: 'Você copiou o e-mail do Victor.', onde: 'o contato', marca: 'envelope' },
  { id: 'aba', nome: 'Volta', dica: 'Saia da aba e volte.', achada: 'Você saiu e voltou.', onde: 'o navegador', marca: 'seta de volta' },
  { id: 'console', nome: 'Dev', dica: 'Tem um recado no console do navegador. Sem console? Digite escultor.oi() na conversa.', achada: 'Você falou com o escultor pelo console.', onde: 'o console', marca: 'chaves { }' },
  { id: 'retorno', nome: 'De volta', dica: 'Volte outro dia.', achada: 'Você voltou ao ateliê outro dia.', onde: 'qualquer lugar', marca: 'calendário' },
  { id: 'papo', nome: 'Papo', dica: 'Ele também conversa.', achada: 'Você conversou com o escultor.', onde: 'a conversa', marca: 'balão de fala' },
  { id: 'velha', nome: 'Três em linha', dica: 'Ganhe dele na laje de mármore.', achada: 'Você ganhou do escultor no jogo da velha.', onde: 'o contato', marca: 'X e O' },
  { id: 'generoso', nome: 'Generoso', dica: 'Deixe ele ganhar. Três vezes.', achada: 'Você deixou o escultor ganhar três vezes.', onde: 'o contato', marca: 'coração' },
  { id: 'cabo', nome: 'Mais forte', dica: 'Tem uma corda no Coliseu.', achada: 'Você ganhou o cabo de guerra.', onde: 'a arena', marca: 'corda com nó' },
  { id: 'cartas', nome: 'Duelista', dica: 'Escolha um gladiador e vença o duelo.', achada: 'Você ganhou o duelo de cartas.', onde: 'a arena', marca: 'duas cartas' },
  { id: 'faro', nome: 'Faro', dica: 'Ele aposta que você não sabe de que caixa é a história.', achada: 'Você acertou cinco histórias seguidas.', onde: 'a conversa', marca: 'lupa' },
  { id: 'admin', nome: 'Área restrita', dica: 'Todo site tem uma porta de administrador.', achada: 'Você tentou entrar no /admin.', onde: 'o /admin', marca: 'cadeado' },
  { id: 'tetris', nome: 'Mestre de obras', dica: 'Empilhe bem os blocos de mármore.', achada: 'Você fez 10 linhas no /admin.', onde: 'o /admin', marca: 'blocos empilhados' },
];
