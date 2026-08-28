/**
 * Confere a conta de estoque:  npm run estoque:conferir
 *
 * Nao e suite de teste, e um script — o projeto ainda nao tem runner. Existe
 * porque esta e a conta que decide se ela fica sem remedio: se `diasRestantes`
 * arredondar para cima, o aviso chega tarde demais.
 */
import {
  diasRestantes, precisaAvisar, diaQueAcaba,
  comprimidosDeCaixas, textoDoEstoque, type EstoqueDeRemedio,
} from "./estoque";

const casos: Array<[string, EstoqueDeRemedio, number | null, boolean]> = [
  // [nome, remedio, diasEsperados, deveAvisar]
  ["30 comp, 1x ao dia, 1 por vez", { estoqueComprimidos: 30, quantidade: 1, dosesPorDia: 1, avisarComDiasRestantes: 7 }, 30, false],
  ["14 comp, 2x ao dia, 1 por vez", { estoqueComprimidos: 14, quantidade: 1, dosesPorDia: 2, avisarComDiasRestantes: 7 }, 7, true],
  ["5 comp, 2 por vez, 1x ao dia",  { estoqueComprimidos: 5,  quantidade: 2, dosesPorDia: 1, avisarComDiasRestantes: 7 }, 2, true],
  ["meio comprimido por dia",       { estoqueComprimidos: 10, quantidade: 0.5, dosesPorDia: 1, avisarComDiasRestantes: 7 }, 20, false],
  ["acabou",                        { estoqueComprimidos: 0,  quantidade: 1, dosesPorDia: 1, avisarComDiasRestantes: 7 }, 0, true],
  ["sem controle de estoque",       { estoqueComprimidos: null, quantidade: 1, dosesPorDia: 1, avisarComDiasRestantes: 7 }, null, false],
  ["sem horario cadastrado",        { estoqueComprimidos: 30, quantidade: 1, dosesPorDia: 0, avisarComDiasRestantes: 7 }, null, false],
];

let falhas = 0;
for (const [nome, r, diasEsperados, avisoEsperado] of casos) {
  const dias = diasRestantes(r);
  const aviso = precisaAvisar(r, false);
  const ok = dias === diasEsperados && aviso === avisoEsperado;
  if (!ok) falhas++;
  console.log(
    `${ok ? "ok  " : "FALHA"} ${nome.padEnd(32)} dias=${String(dias).padStart(4)} avisa=${String(aviso).padEnd(5)} | ${textoDoEstoque(r)}`,
  );
}

// Nao repetir aviso quando ja avisado
const baixo: EstoqueDeRemedio = { estoqueComprimidos: 2, quantidade: 1, dosesPorDia: 1, avisarComDiasRestantes: 7 };
const naoRepete = precisaAvisar(baixo, true) === false;
if (!naoRepete) falhas++;
console.log(`${naoRepete ? "ok  " : "FALHA"} nao repete aviso ja enviado`);

// Data de fim
const hoje = new Date("2026-08-27T12:00:00Z");
const fim = diaQueAcaba({ estoqueComprimidos: 14, quantidade: 1, dosesPorDia: 2, avisarComDiasRestantes: 7 }, hoje);
const fimOk = fim?.toISOString().slice(0, 10) === "2026-09-03";
if (!fimOk) falhas++;
console.log(`${fimOk ? "ok  " : "FALHA"} acaba em ${fim?.toISOString().slice(0, 10)} (esperado 2026-09-03)`);

// Caixas
const c = comprimidosDeCaixas(2, 30);
const cOk = c === 60 && comprimidosDeCaixas(2, null) === null;
if (!cOk) falhas++;
console.log(`${cOk ? "ok  " : "FALHA"} 2 caixas de 30 = ${c}`);

console.log(falhas === 0 ? "\nTUDO PASSOU" : `\n${falhas} FALHA(S)`);
process.exit(falhas === 0 ? 0 : 1);
