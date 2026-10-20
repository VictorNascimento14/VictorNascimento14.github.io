// O que o site lembra do visitante, só neste navegador. Nada aqui é obrigatório: sem armazenamento, tudo segue.
const PREFIXO = 'victornascimento:';

export function ler(nome, padrao = null) {
  try {
    const bruto = localStorage.getItem(PREFIXO + nome);
    return bruto === null ? padrao : JSON.parse(bruto);
  } catch {
    return padrao;
  }
}

export function gravar(nome, valor) {
  try {
    localStorage.setItem(PREFIXO + nome, JSON.stringify(valor));
    return true;
  } catch {
    return false;
  }
}

export function apagar(nome) {
  try { localStorage.removeItem(PREFIXO + nome); } catch { /* sem armazenamento */ }
}
