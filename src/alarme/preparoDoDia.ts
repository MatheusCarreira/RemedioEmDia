import type { SQLiteDatabase } from "expo-sqlite";
import { marcarExemploInicial, semearExemploSeVazio } from "../dados/exemplo";
import { gerarDosesDoDia } from "../dados/remedios";
import { reconciliarAlarmes } from "./reconciliar";

/**
 * Põe o dia em ordem: gera as doses de hoje e remonta todos os alarmes.
 *
 * Isto morava dentro da tela "Hoje", e era um defeito: quem cadastrava um
 * remédio e fechava o app pela tela de lista — que é exatamente para onde o
 * formulário devolve — saía sem alarme nenhum agendado, calado. O alarme é
 * estado do aplicativo inteiro, não de uma tela; quem manda nele é o `App`.
 *
 * A ordem importa. As doses precisam existir antes da reconciliação porque é
 * sobre elas que `planejarRepeticoes` decide os lembretes de 30 minutos.
 */
export async function prepararODia(
  bd: SQLiteDatabase,
  momento: Date,
): Promise<void> {
  const semeou = await semearExemploSeVazio(bd, momento);
  await gerarDosesDoDia(bd, momento);
  if (semeou) await marcarExemploInicial(bd, momento);
  await reconciliarAlarmes(bd, momento);
}
