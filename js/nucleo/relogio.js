// Um só requestAnimationFrame para o site inteiro. Cada parte registra uma função (dt em segundos, agora em ms)
// que devolve true enquanto ainda tem o que animar; quando ninguém precisa, o relógio dorme até alguém acordá-lo.
const tarefas = new Set();
let pedido = 0;
let anterior = 0;
// Durante um quadro, quem chama acordar() só marca que quer mais um: pedir outro requestAnimationFrame ali abriria
// uma segunda cadeia, que nunca mais se juntaria à primeira (as tarefas passariam a rodar duas vezes por quadro).
let noQuadro = false;
let deNovo = false;

export function registrar(tarefa) {
  tarefas.add(tarefa);
  acordar();
  return () => tarefas.delete(tarefa);
}

export function acordar() {
  if (noQuadro) { deNovo = true; return; }
  if (pedido) return;
  anterior = performance.now();
  pedido = requestAnimationFrame(passo);
}

function passo(agora) {
  pedido = 0;
  noQuadro = true;
  deNovo = false;
  // Um quadro nunca anda mais que 50 ms: depois de a aba voltar, nada pula de uma vez.
  const dt = Math.min(0.05, Math.max(0, (agora - anterior) / 1000));
  anterior = agora;
  let continuar = false;
  for (const tarefa of tarefas) {
    try {
      if (tarefa(dt, agora)) continuar = true;
    } catch (erro) {
      tarefas.delete(tarefa);
      // reportError avisa a janela ('error'): é a válvula que solta a primeira tela se o show quebrar no meio.
      if (typeof reportError === 'function') reportError(erro);
      else console.error('[relógio] tarefa removida depois de um erro:', erro);
    }
  }
  noQuadro = false;
  if (continuar || deNovo) pedido = requestAnimationFrame(passo);
}
