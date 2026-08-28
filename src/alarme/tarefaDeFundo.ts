import * as Notifications from "expo-notifications";
import * as TaskManager from "expo-task-manager";
import { Platform } from "react-native";
import { abrirBanco } from "../dados/banco";
import { planejarRepeticoes } from "../dados/lembretes";
import { tratarResposta } from "./acoes";
import { reagendarLembretes } from "./lembretes";

/**
 * A tarefa que atende o botão da notificação com o aplicativo FECHADO.
 *
 * É o que separa um botão de verdade de um botão decorativo. Um botão com
 * `opensAppToForeground: false` não acorda a tela: se ninguém estiver ouvindo,
 * o toque some. Quem ouve é isto aqui — o Android sobe o JavaScript do app sem
 * nenhuma tela, roda esta função e desliga tudo de novo.
 *
 * Por isso o arquivo não importa nada de React. O que ele puxa é carregado
 * dentro de um processo sem interface, e uma dependência de tela aqui custaria
 * tempo de inicialização num caminho que precisa terminar rápido.
 *
 * `defineTask` PRECISA rodar no escopo do módulo, e o módulo precisa ser
 * carregado cedo (`index.ts`, antes do componente raiz). Quando o Android
 * acorda o app para esta tarefa, ele carrega o bundle e espera a tarefa já
 * estar definida; declarar isso dentro de um `useEffect` chegaria tarde
 * demais, porque nenhum componente chega a montar.
 */
export const TAREFA_DE_NOTIFICACAO = "remedioEmDia.respostaDeNotificacao";

/**
 * O navegador não tem tarefa de fundo. Definir a tarefa lá quebraria a
 * pré-visualização das telas sem trazer nada em troca.
 */
const NO_APARELHO = Platform.OS !== "web";

if (NO_APARELHO) {
  TaskManager.defineTask<Notifications.NotificationTaskPayload>(
    TAREFA_DE_NOTIFICACAO,
    async ({ data, error }) => {
      if (error) return;

      // A mesma tarefa recebe dois tipos de coisa: notificação recebida e
      // resposta a uma notificação. Só a segunda interessa, e é o
      // `actionIdentifier` que as distingue.
      if (!data || !("actionIdentifier" in data)) return;

      try {
        const agora = new Date();
        const bd = await abrirBanco();
        await tratarResposta(bd, data, agora);

        // Empurra o horizonte das repetições para frente. É o que mantém a
        // repetição viva para quem resolve tudo pela notificação e passa dias
        // sem abrir o aplicativo — sem isto, a repetição dependeria de ela
        // abrir a tela, que é justamente o que os botões existem para evitar.
        //
        // Sem `cancelarTudo` aqui, de propósito: os alarmes principais estão
        // agendados e corretos, e derrubá-los de dentro de uma tarefa de fundo
        // para reconstruir seria arriscar o essencial para consertar o
        // acessório.
        await planejarRepeticoes(bd, agora);
        await reagendarLembretes(bd, agora);
      } catch {
        // Não há tela para mostrar erro e não há usuária olhando. Deixar a
        // exceção subir aqui derrubaria o processo de fundo sem nenhum ganho:
        // o alarme principal do dia seguinte continua agendado de qualquer
        // jeito, e ela ainda pode marcar pelo app.
      }
    },
  );
}

/** Liga a tarefa. Chamar uma vez, na abertura do app. */
export async function registrarTarefaDeFundo(): Promise<void> {
  if (!NO_APARELHO) return;
  try {
    await Notifications.registerTaskAsync(TAREFA_DE_NOTIFICACAO);
  } catch {
    // Sem a tarefa registrada os botões ainda funcionam com o app aberto ou em
    // segundo plano; só o caso "app morto" deixa de responder.
  }
}
