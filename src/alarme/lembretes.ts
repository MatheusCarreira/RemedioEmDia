import type { SQLiteDatabase } from "expo-sqlite";
import {
  apagarLembretesDaDose,
  ehOMesmoPedido,
  emMinutos,
  guardarLembrete,
  lembreteDaDose,
  lembretesAindaValidos,
  limparLembretesVelhos,
  MINUTOS_PARA_ADIAR,
  type DoseParaLembrar,
} from "../dados/lembretes";
import { agendarUmaVez, cancelar, conteudoDoAlarme } from "./alarme";

/**
 * Os lembretes de uma dose.
 *
 * Dois tipos, com propósitos diferentes:
 *
 *  - REPETICAO: o app avisa de novo se ela não marcou. Decidido pelo app.
 *  - ADIAMENTO: ela pediu "lembrar em 15 min" no botão. Decidido por ela.
 *
 * A REPETIÇÃO ACONTECE UMA VEZ SÓ, e é de propósito. Repetir sem parar até ela
 * marcar transforma o app num cobrador, e ela não pediu para ser vigiada — ela
 * pediu ajuda para lembrar. Além disso, "não marcou" não é o mesmo que "não
 * tomou": o caso mais comum é ela ter tomado e esquecido de marcar, e insistir
 * nesse caso ensina a ignorar a notificação, que é o único jeito de o
 * aplicativo falhar de verdade.
 *
 * Este módulo fala com o Android. A parte que só mexe no banco é
 * `src/dados/lembretes.ts` — a separação existe porque a tarefa de fundo roda
 * sem tela e precisa das duas metades funcionando em separado.
 */

function conteudo(dose: DoseParaLembrar, titulo: string) {
  return conteudoDoAlarme({
    titulo,
    nome: dose.nome,
    quantidade: dose.quantidade,
    observacao: dose.observacao,
    dados: {
      remedioId: dose.remedioId,
      minutosDoDia:
        dose.previstoPara.getHours() * 60 + dose.previstoPara.getMinutes(),
      doseId: dose.doseId,
    },
  });
}

/**
 * Reagenda no Android todos os lembretes que ainda fazem sentido.
 *
 * Roda depois do `cancelarTudo` da reconciliação — e é o que faz um adiamento
 * pedido de manhã sobreviver a uma reconciliação do meio do dia.
 *
 * Mas roda também pela tarefa de fundo, SEM um `cancelarTudo` antes. Por isso
 * cada lembrete cancela o próprio agendamento anterior antes de criar o novo:
 * sem esse cuidado, a segunda chamada deixaria dois agendamentos vivos para o
 * mesmo lembrete e a notificação tocaria duas vezes.
 */
export async function reagendarLembretes(
  bd: SQLiteDatabase,
  agora: Date,
): Promise<number> {
  await limparLembretesVelhos(bd, agora);

  const validos = await lembretesAindaValidos(bd, agora);
  let quantos = 0;

  for (const { lembrete, dose } of validos) {
    if (lembrete.notificacaoId) await cancelar([lembrete.notificacaoId]);

    const titulo =
      lembrete.tipo === "ADIAMENTO" ? "Hora do remédio" : "Você já tomou?";
    const id = await agendarUmaVez(conteudo(dose, titulo), lembrete.previstoPara);
    await guardarLembrete(
      bd,
      dose.doseId,
      lembrete.tipo,
      lembrete.previstoPara,
      id,
    );
    if (id) quantos += 1;
  }

  return quantos;
}

/**
 * Atende ao botão "LEMBRAR EM 15 MIN".
 *
 * Cancela a repetição automática junto: ela acabou de dizer quando quer ser
 * lembrada, e o app passar por cima disso com um aviso próprio meia hora depois
 * do horário original seria ignorar o que ela pediu.
 */
export async function adiarDose(
  bd: SQLiteDatabase,
  dose: DoseParaLembrar,
  agora: Date,
): Promise<Date | null> {
  const quando = emMinutos(agora, MINUTOS_PARA_ADIAR);

  // O mesmo toque pode chegar aqui duas vezes: uma pela tarefa de fundo e
  // outra pelo listener da tela, quando ela abre o app depois. Dois adiamentos
  // com menos de um minuto de diferença são o mesmo toque, não dois pedidos —
  // e agendar os dois faria a notificação tocar duas vezes seguidas.
  const jaExiste = await lembreteDaDose(bd, dose.doseId, "ADIAMENTO");
  if (jaExiste && ehOMesmoPedido(jaExiste, quando)) return jaExiste.previstoPara;

  const anteriores = await apagarLembretesDaDose(bd, dose.doseId);
  await cancelar(
    anteriores.map((l) => l.notificacaoId).filter((x): x is string => !!x),
  );

  const id = await agendarUmaVez(conteudo(dose, "Hora do remédio"), quando);
  await guardarLembrete(bd, dose.doseId, "ADIAMENTO", quando, id);
  return quando;
}

/** Tira do caminho tudo que ainda ia tocar por causa desta dose. */
export async function cancelarLembretesDaDose(
  bd: SQLiteDatabase,
  doseId: number,
): Promise<void> {
  const antes = await apagarLembretesDaDose(bd, doseId);
  await cancelar(
    antes.map((l) => l.notificacaoId).filter((x): x is string => !!x),
  );
}
