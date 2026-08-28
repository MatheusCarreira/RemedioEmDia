import type * as Notifications from "expo-notifications";
import type { SQLiteDatabase } from "expo-sqlite";
import {
  doseDoAlarme,
  doseParaLembrar,
  type DoseParaLembrar,
} from "../dados/lembretes";
import { gerarDosesDoDia, marcarTomada } from "../dados/remedios";
import { ACAO_ADIAR, ACAO_TOMEI, dispensar } from "./alarme";
import { adiarDose, cancelarLembretesDaDose } from "./lembretes";

/**
 * O que acontece quando ela toca um botão dentro da notificação.
 *
 * Este módulo existe porque o MESMO toque chega por dois caminhos diferentes,
 * e os dois precisam fazer exatamente a mesma coisa:
 *
 *  1. Com o app morto ou em segundo plano, o Android acorda uma tarefa de
 *     fundo (`tarefaDeFundo.ts`), sem tela e sem React.
 *  2. Com o app aberto, chega no listener registrado em `App.tsx`.
 *
 * E pode chegar pelos DOIS para o mesmo toque: o expo-notifications guarda a
 * resposta numa fila quando não há listener e a entrega quando o app abre —
 * então um toque tratado pela tarefa de fundo é tratado de novo depois. Isso
 * não é um defeito a corrigir, é uma característica a absorver: tudo aqui
 * precisa ser idempotente.
 *
 *  - "JÁ TOMEI" duas vezes: `marcarTomada` sai fora se a dose já está TOMADA, e
 *    o UNIQUE em `movimentos_estoque.dose_id` impede o desconto dobrado.
 *  - "LEMBRAR EM 15 MIN" duas vezes: tratado em `adiarDose`, comparando o
 *    horário pedido com o que já está guardado.
 */

/** Converte o que veio do Android, que pode chegar como número ou texto. */
function numero(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/**
 * Marca a dose e desmarca o que ainda ia tocar por causa dela.
 *
 * É o caminho único do "já tomei" — vale tanto para o botão da notificação
 * quanto para o botão grande da tela. Se a tela chamasse só `marcarTomada`, o
 * lembrete de repetição continuaria agendado e tocaria meia hora depois
 * perguntando por um remédio que ela já tinha tomado.
 */
export async function tomarDose(
  bd: SQLiteDatabase,
  doseId: number,
): Promise<void> {
  await marcarTomada(bd, doseId);
  await cancelarLembretesDaDose(bd, doseId);
}

/** Acha a dose de que a notificação está falando. */
async function doseDaResposta(
  bd: SQLiteDatabase,
  dados: Record<string, unknown>,
  agora: Date,
): Promise<DoseParaLembrar | null> {
  const doseId = numero(dados.doseId);
  if (doseId !== null) return doseParaLembrar(bd, doseId);

  const remedioId = numero(dados.remedioId);
  const minutosDoDia = numero(dados.minutosDoDia);
  if (remedioId === null || minutosDoDia === null) return null;

  // O alarme diário pode tocar num dia em que ela ainda não abriu o app, e aí
  // a dose de hoje sequer existe como linha. Gerar aqui é barato e idempotente
  // — e sem isso o botão da notificação não teria o que marcar justamente no
  // dia em que ela mais depende dele.
  await gerarDosesDoDia(bd, agora);
  return doseDoAlarme(bd, remedioId, minutosDoDia, agora);
}

/**
 * Trata uma resposta de notificação.
 *
 * Devolve `true` se algo mudou no banco — a tela usa isso para saber se
 * precisa se redesenhar.
 */
export async function tratarResposta(
  bd: SQLiteDatabase,
  resposta: Notifications.NotificationResponse,
  agora: Date,
): Promise<boolean> {
  const acao = resposta.actionIdentifier;
  if (acao !== ACAO_TOMEI && acao !== ACAO_ADIAR) return false;

  const pedido = resposta.notification.request;
  const dados = (pedido.content.data ?? {}) as Record<string, unknown>;

  // A notificação sai da barra em qualquer caso. Botão de ação não fecha a
  // notificação sozinho, e um aviso que continua ali depois do toque faz ela
  // tocar de novo achando que não pegou.
  await dispensar(pedido.identifier);

  const dose = await doseDaResposta(bd, dados, agora);
  if (!dose) return false;

  if (acao === ACAO_TOMEI) {
    await tomarDose(bd, dose.doseId);
    return true;
  }

  // Adiar uma dose que ela já marcou não faz sentido e só geraria um aviso
  // fantasma quinze minutos depois.
  if (!dose.pendente) return false;

  await adiarDose(bd, dose, agora);
  return true;
}
