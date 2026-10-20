// Gera assets/dados/contribuicoes.js com o calendário de contribuições do ano no GitHub.
// Uso: node tools/contribuicoes.mjs [ano]   (precisa do gh autenticado como o dono do perfil)
// O dia do GitHub fecha à meia-noite de Brasília, por isso a janela começa às 03:00 UTC.
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const USUARIO = 'VictorNascimento14';
const ano = Number(process.argv[2]) || new Date().getFullYear();
const NIVEL = { NONE: 0, FIRST_QUARTILE: 1, SECOND_QUARTILE: 2, THIRD_QUARTILE: 3, FOURTH_QUARTILE: 4 };

const consulta = `query($login:String!,$de:DateTime!,$ate:DateTime!){user(login:$login){contributionsCollection(from:$de,to:$ate){
  contributionCalendar{totalContributions weeks{contributionDays{date contributionCount contributionLevel}}}}}}`;
const hoje = new Date().toISOString().slice(0, 10);
const resposta = JSON.parse(execFileSync('gh', ['api', 'graphql',
  '-f', `query=${consulta}`, '-f', `login=${USUARIO}`,
  '-f', `de=${ano}-01-01T03:00:00Z`, '-f', `ate=${ano + 1}-01-01T02:59:59Z`], { encoding: 'utf8' }));

const calendario = resposta.data.user.contributionsCollection.contributionCalendar;
const dias = calendario.weeks.flatMap(s => s.contributionDays)
  .filter(d => d.date.startsWith(`${ano}-`) && d.date <= hoje)
  .map(d => [d.date, d.contributionCount, NIVEL[d.contributionLevel] ?? 0]);
const total = dias.reduce((soma, [, n]) => soma + n, 0);

const dados = { user: USUARIO, year: ano, fetched: hoje, total, end: `${ano}-12-31`, days: dias };
const destino = fileURLToPath(new URL('../assets/dados/contribuicoes.js', import.meta.url));
writeFileSync(destino, `// Gerado por tools/contribuicoes.mjs em ${hoje}: dias são [data, contribuições, nível 0 a 4].\n`
  + `export default ${JSON.stringify(dados)};\n`);
console.log(`${dias.length} dias, ${total} contribuições → ${destino}`);
