import type { SQLiteDatabase } from "expo-sqlite";
import { planejarRepeticoes } from "../dados/lembretes";
import { listarRemedios } from "../dados/remedios";
import { agendadosAgora, agendarHorario, cancelarTudo } from "./alarme";
import { reagendarLembretes } from "./lembretes";

/**
 * Reconstrói TODOS os alarmes a partir do banco.
 *
 * Estratégia: apagar tudo e reagendar, em vez de calcular a diferença.
 *
 * Parece desperdício e não é. O agendamento do Android é um estado que vive
 * fora do nosso banco — o sistema pode ter descartado alarmes numa atualização,
 * numa restauração de backup, ou porque o usuário limpou os dados do app.
 * Calcular a diferença exigiria confiar num espelho que pode estar mentindo;
 * reconstruir do zero é a única operação que converge a partir de QUALQUER
 * estado anterior, inclusive um corrompido.
 *
 * O custo real é de milissegundos, e roda na abertura do app.
 */
export async function reconciliarAlarmes(
  bd: SQLiteDatabase,
  hoje: Date,
): Promise<number> {
  await cancelarTudo();

  const remedios = await listarRemedios(bd, true);
  const hojeISO = hoje.toISOString().slice(0, 10);

  for (const r of remedios) {
    // Tratamento que já terminou não agenda nada.
    if (r.fimEm !== null && r.fimEm < hojeISO) continue;

    for (const h of r.horarios) {
      const ids = await agendarHorario(
        {
          remedioId: r.id,
          nome: r.nome,
          quantidade: r.quantidade,
          observacao: r.observacao,
          minutosDoDia: h.minutosDoDia,
          fimEm: r.fimEm,
        },
        hoje,
      );

      // Guarda só o primeiro id. Serve para diagnóstico ("este horário chegou
      // a ser agendado?"); o cancelamento real é sempre em bloco, então não
      // vale a pena uma tabela só para guardar a lista inteira.
      await bd.runAsync(
        `UPDATE horarios SET notificacao_id = ? WHERE id = ?`,
        ids[0] ?? null,
        h.id,
      );
    }
  }

  // Os lembretes vêm depois dos alarmes principais, em duas etapas: primeiro a
  // decisão ("estas doses merecem uma repetição"), depois o agendamento de
  // tudo que está na tabela e ainda vale — inclusive um adiamento que ela
  // pediu antes desta reconciliação e que o `cancelarTudo` lá em cima acabou
  // de derrubar.
  await planejarRepeticoes(bd, hoje);
  await reagendarLembretes(bd, hoje);

  return agendadosAgora();
}
