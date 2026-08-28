import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { textoDaQuantidade } from "../dominio/doses";

/**
 * O alarme.
 *
 * É a razão de este app ser nativo em vez de site: a notificação é agendada no
 * relógio do próprio aparelho pelo Android, então toca sem internet, com o app
 * fechado, e volta sozinha depois que o celular reinicia (o expo-notifications
 * registra RECEIVE_BOOT_COMPLETED e reagenda no boot).
 *
 * Duas estratégias de agendamento, escolhidas pelo remédio ter ou não data de
 * fim:
 *
 *  - Uso contínuo (sem `fimEm`): UM gatilho diário por horário. Poucos alarmes,
 *    e continuam tocando mesmo que ela passe semanas sem abrir o app — que é
 *    exatamente quando ela mais precisa deles.
 *
 *  - Tratamento com data de fim: notificações individuais até a data. Custa
 *    mais alarmes, mas param sozinhas no dia certo. Um gatilho diário não sabe
 *    terminar, e ficaria tocando para um remédio que ela nem toma mais.
 *
 * LIMITAÇÃO CONHECIDA: um gatilho diário não permite pular uma ocorrência. Se
 * ela tomar às 07:50 e marcar, o alarme das 08:00 toca assim mesmo. A janela é
 * de 15 minutos, então o incômodo é pequeno — e o preço de resolver isso seria
 * cancelar e reagendar o gatilho toda vez, o que quebra se o app não for aberto.
 */

const CANAL = "remedios";

/**
 * O navegador não agenda alarme do Android. Rodar no navegador serve para
 * conferir a APARÊNCIA das telas rapidamente, e o app precisa degradar em vez
 * de estourar — mas isso NÃO é um ambiente de teste do alarme. O alarme só se
 * testa no aparelho, que é o único lugar onde ele existe.
 */
const TEM_ALARME = Platform.OS !== "web";

/**
 * Prepara o sistema de notificação. Chamar uma vez, na abertura do app.
 * Devolve `true` se ela autorizou.
 */
export async function prepararAlarme(): Promise<boolean> {
  if (!TEM_ALARME) return false;

  // Como a notificação se comporta com o app ABERTO. Sem isso o Android não
  // mostra nada quando o app está em primeiro plano, e ela veria o alarme
  // "sumir" se estivesse com o app na mão.
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });

  if (Platform.OS === "android") {
    // Obrigatório do Android 8 em diante: toda notificação pertence a um canal,
    // e é o canal — não a notificação — que define som, vibração e se ela
    // aparece por cima da tela. IMPORTANCE.MAX é o que faz surgir na frente em
    // vez de só cair na gaveta silenciosamente.
    //
    // O canal é imutável depois de criado: se um dia for preciso mudar som ou
    // importância, tem que criar um canal NOVO com outro id. O Android não
    // deixa o app reconfigurar um canal existente, de propósito — quem manda
    // nisso é a usuária, nas configurações.
    await Notifications.setNotificationChannelAsync(CANAL, {
      name: "Hora do remédio",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 300, 150, 300],
      lightColor: "#b45309",
      sound: "default",
      bypassDnd: false,
    });
  }

  const { status } = await Notifications.getPermissionsAsync();
  if (status === "granted") return true;

  const pedido = await Notifications.requestPermissionsAsync();
  return pedido.status === "granted";
}

/** O que o alarme precisa saber para se descrever. */
export type AlarmeDeRemedio = {
  remedioId: number;
  horarioId: number;
  nome: string;
  quantidade: number;
  observacao: string | null;
  /** Minutos desde a meia-noite (0..1439). */
  minutosDoDia: number;
  /** ISO YYYY-MM-DD, ou null para uso contínuo. */
  fimEm: string | null;
};

function conteudo(a: AlarmeDeRemedio): Notifications.NotificationContentInput {
  const partes = [a.nome, textoDaQuantidade(a.quantidade)];
  if (a.observacao) partes.push(a.observacao);

  return {
    title: "Hora do remédio",
    // Nome primeiro: é o que ela precisa ler na tela bloqueada, sem
    // desbloquear e sem óculos.
    body: partes.join(" · "),
    sound: "default",
    priority: Notifications.AndroidNotificationPriority.MAX,
    vibrate: [0, 300, 150, 300],
    data: { remedioId: a.remedioId, horarioId: a.horarioId },
  };
}

/**
 * Agenda um horário e devolve os identificadores criados.
 *
 * Devolve uma LISTA porque tratamento com data de fim vira várias notificações;
 * uso contínuo devolve uma só.
 */
export async function agendarHorario(
  a: AlarmeDeRemedio,
  hoje: Date,
): Promise<string[]> {
  if (!TEM_ALARME) return [];

  const hora = Math.floor(a.minutosDoDia / 60);
  const minuto = a.minutosDoDia % 60;

  if (a.fimEm === null) {
    const id = await Notifications.scheduleNotificationAsync({
      content: conteudo(a),
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        channelId: CANAL,
        hour: hora,
        minute: minuto,
      },
    });
    return [id];
  }

  // Tratamento com fim: uma notificação por dia até a data final.
  const ids: string[] = [];
  const fim = new Date(`${a.fimEm}T23:59:59`);

  const quando = new Date(hoje);
  quando.setHours(hora, minuto, 0, 0);
  // Se o horário de hoje já passou, o primeiro alarme é o de amanhã.
  if (quando.getTime() <= hoje.getTime()) quando.setDate(quando.getDate() + 1);

  // Teto de segurança. Um tratamento de meses viraria centenas de alarmes
  // agendados; o app reagenda a cada abertura, então 60 dias de folga bastam.
  const TETO = 60;

  while (quando.getTime() <= fim.getTime() && ids.length < TETO) {
    const id = await Notifications.scheduleNotificationAsync({
      content: conteudo(a),
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        channelId: CANAL,
        date: new Date(quando),
      },
    });
    ids.push(id);
    quando.setDate(quando.getDate() + 1);
  }

  return ids;
}

/** Cancela alarmes específicos. Ignora id que já não existe. */
export async function cancelar(ids: string[]): Promise<void> {
  await Promise.all(
    ids.map((id) =>
      Notifications.cancelScheduledNotificationAsync(id).catch(() => {
        // Já disparou ou já foi cancelado. Não é erro.
      }),
    ),
  );
}

/** Apaga TUDO que está agendado. Usado antes de reconstruir do zero. */
export async function cancelarTudo(): Promise<void> {
  if (!TEM_ALARME) return;
  await Notifications.cancelAllScheduledNotificationsAsync();
}

/** Quantos alarmes existem agendados agora. Para conferência e diagnóstico. */
export async function agendadosAgora(): Promise<number> {
  if (!TEM_ALARME) return 0;
  const lista = await Notifications.getAllScheduledNotificationsAsync();
  return lista.length;
}
