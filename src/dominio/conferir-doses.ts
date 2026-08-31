/**
 * Confere o estado do cartao:  npm run doses:conferir
 *
 * Existe por causa de um defeito real: o cartao dizia "ESTA NA HORA" as 08:28
 * sobre uma dose das 08:33. Sao contas de fronteira, invisiveis na tela ate
 * alguem olhar o relogio ao lado do rotulo — o tipo de coisa que so se pega
 * fixando o instante e perguntando.
 */
import { estadoDaDose, type Dose, type EstadoDose } from "./doses";

const as = (h: number, m: number): Date =>
  new Date(2026, 7, 31, h, m, 0, 0); // 31/08/2026, mes 7 = agosto

const dose: Dose = {
  id: "1",
  remedio: "Teste",
  quantidade: 1,
  previstoPara: as(8, 33),
};

const casos: Array<[string, Date, EstadoDose]> = [
  ["muito antes, so mais tarde",          as(7, 30),  "espera"],
  ["16 min antes, ainda mais tarde",      as(8, 17),  "espera"],
  ["15 min antes, comeca a acender",      as(8, 18),  "chegando"],
  ["5 min antes, chegando e nao na hora", as(8, 28),  "chegando"],
  ["1 min antes, ainda chegando",         as(8, 32),  "chegando"],
  ["no minuto exato, agora sim",          as(8, 33),  "agora"],
  ["30 min depois, ainda na hora",        as(9, 3),   "agora"],
  ["60 min depois, ultimo minuto",        as(9, 33),  "agora"],
  ["61 min depois, passou",               as(9, 34),  "passou"],
];

let falhas = 0;
for (const [nome, momento, esperado] of casos) {
  const obtido = estadoDaDose(dose, momento);
  const ok = obtido === esperado;
  if (!ok) falhas++;
  console.log(`${ok ? "ok   " : "FALHA"} ${nome}  (${obtido})`);
}

const feito = estadoDaDose({ ...dose, tomadoEm: as(8, 20) }, as(8, 34));
const feitoOk = feito === "feito";
if (!feitoOk) falhas++;
console.log(`${feitoOk ? "ok   " : "FALHA"} tomada antes da hora fica feito  (${feito})`);

console.log(falhas === 0 ? "\nTUDO PASSOU" : `\n${falhas} FALHA(S)`);
process.exit(falhas === 0 ? 0 : 1);
