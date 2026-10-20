// Ponto de entrada. O mascote primeiro (todas as seções falam com ele), depois cada parte do site em ordem.
// Uma parte que falha não derruba as outras: cada uma é carregada e iniciada sozinha. O mascote também: sem ele (ou
// sem o escultor) as seções que não dependem dele ainda sobem, e a primeira tela mostra o busto.

const partes = [
  ['cursor', () => import('./arte/cursor.js')],
  ['rolagem', () => import('./nucleo/rolagem.js')],
  ['heroi', () => import('./secoes/heroi.js')],
  ['projetos', () => import('./secoes/projetos.js')],
  ['ano', () => import('./secoes/ano.js')],
];

// Sem o herói (não carregou, não iniciou ou desistiu antes do show), a primeira tela fica como na reserva sem
// JavaScript: a cena no lugar e o busto pronto, sem pedra, sem escultor e sem trava. Nunca uma primeira tela vazia.
function semHeroi() {
  const cena = document.getElementById('cena');
  if (cena) cena.style.transform = 'none';
  document.getElementById('camada-escultor')?.setAttribute('hidden', '');
  document.body.classList.remove('carregando');
  document.body.classList.add('falhou');
  import('./nucleo/rolagem.js').then(rolagem => rolagem.soltar(), () => {});
}

const mascote = await import('./mascote.js').catch(erro => console.error('[mascote] não carregou:', erro));
try {
  mascote?.iniciar();
} catch (erro) {
  console.error('[mascote] não iniciou:', erro);
}
const modulos = await Promise.allSettled(partes.map(([, carregar]) => carregar()));
for (const [i, resultado] of modulos.entries()) {
  const nome = partes[i][0];
  if (resultado.status === 'rejected') {
    console.error(`[${nome}] não carregou:`, resultado.reason);
    if (nome === 'heroi') semHeroi();
    continue;
  }
  try {
    await resultado.value.iniciar?.();
  } catch (erro) {
    console.error(`[${nome}] não iniciou:`, erro);
    if (nome === 'heroi') semHeroi();
  }
  // O herói marca o body assim que começa (carregando, depois pronto ou falhou): sem marca, ele não entrou no ar.
  if (nome === 'heroi' && !document.body.matches('.carregando, .pronto, .falhou')) semHeroi();
}
