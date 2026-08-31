import * as Notifications from "expo-notifications";
import type { SQLiteDatabase } from "expo-sqlite";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Platform, StyleSheet, Text, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { tratarResposta } from "./src/alarme/acoes";
import { prepararAlarme } from "./src/alarme/alarme";
import { prepararODia } from "./src/alarme/preparoDoDia";
import { registrarTarefaDeFundo } from "./src/alarme/tarefaDeFundo";
import { abrirBanco } from "./src/dados/banco";
import { FormularioRemedio } from "./src/telas/FormularioRemedio";
import { Hoje } from "./src/telas/Hoje";
import { MeusRemedios } from "./src/telas/MeusRemedios";
import { cores, espaco, texto } from "./src/ui/tokens";

/**
 * Remédio em Dia.
 *
 * Tudo mora no aparelho: banco SQLite local e alarme agendado pelo Android.
 * Não existe servidor, conta nem senha — o que significa que o app funciona
 * sem internet e que a lista de remédios dela não vive em lugar nenhum além
 * do celular dela.
 *
 * Navegação é uma variável de estado, não uma biblioteca. São três telas e
 * um caminho só entre elas; um roteador aqui seria uma dependência a mais
 * para quebrar numa atualização de SDK, sem resolver nada que este `switch`
 * não resolva.
 */
type Tela =
  | { nome: "hoje" }
  | { nome: "remedios" }
  | { nome: "formulario"; id: number | null };

export default function App() {
  const [bd, setBd] = useState<SQLiteDatabase | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [semPermissao, setSemPermissao] = useState(false);
  const [tela, setTela] = useState<Tela>({ nome: "hoje" });

  // Sobe a cada mudança no cadastro. É o que obriga o dia a ser preparado de
  // novo — sem isso, um remédio recém-cadastrado só apareceria no dia seguinte.
  const [versaoDados, setVersaoDados] = useState(0);

  // Sobe a cada preparo concluído. A tela "Hoje" observa isto para reler.
  const [preparo, setPreparo] = useState(0);

  // Sobe a cada botão de notificação atendido com o app aberto. Separado de
  // `versaoDados` de propósito: aqui basta reler as doses, enquanto uma
  // mudança de cadastro obriga a regerar o dia e remontar todos os alarmes.
  const [respostasTratadas, setRespostasTratadas] = useState(0);

  useEffect(() => {
    (async () => {
      try {
        const banco = await abrirBanco();
        // A permissão é pedida DEPOIS do banco abrir, mas antes da tela
        // aparecer: se ela negar, o app continua servindo como lista — só
        // perde o alarme, que é o aviso mostrado abaixo.
        const autorizado = await prepararAlarme();
        // Depois de `prepararAlarme`, que é quem registra a categoria: sem a
        // categoria não existem botões, e sem botões a tarefa nunca acorda.
        await registrarTarefaDeFundo();
        setSemPermissao(!autorizado);
        setBd(banco);
      } catch (e) {
        setErro(e instanceof Error ? e.message : String(e));
      }
    })();
  }, []);

  // O dia que já foi preparado, e a fila que garante um preparo por vez.
  //
  // A fila não é zelo excessivo: o efeito abaixo e a volta do segundo plano
  // podem disparar juntos, e duas reconciliações simultâneas se atropelam —
  // o `cancelarTudo` da segunda apaga os alarmes que a primeira acabou de
  // agendar, ou os dois agendam e sobram alarmes em dobro.
  const diaPreparado = useRef<string | null>(null);
  const fila = useRef<Promise<void>>(Promise.resolve());

  const prepararSePreciso = useCallback(() => {
    if (!bd) return;

    const tarefa = async () => {
      const momento = new Date();
      // A chave é por DATA, não um "já rodou": é isso que faz o app se
      // acertar sozinho quando ela o abre depois da meia-noite ou depois de
      // dias sem usar. A versão entra na chave para o cadastro também contar.
      const chave = `${momento.toDateString()}#${versaoDados}`;
      if (diaPreparado.current === chave) return;

      await prepararODia(bd, momento);
      diaPreparado.current = chave;
      setPreparo((n) => n + 1);
    };

    fila.current = fila.current.then(tarefa, tarefa).catch((e) => {
      // Um dia que não pôde ser preparado é um dia sem alarme confiável. Vale
      // mais parar e dizer do que deixar a tela bonita mentindo que está tudo
      // agendado.
      setErro(e instanceof Error ? e.message : String(e));
    });
  }, [bd, versaoDados]);

  useEffect(() => {
    prepararSePreciso();
  }, [prepararSePreciso]);

  // Voltar do segundo plano pode ter atravessado a meia-noite.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (estado) => {
      if (estado === "active") prepararSePreciso();
    });
    return () => sub.remove();
  }, [prepararSePreciso]);

  /**
   * O caminho do botão da notificação COM o app vivo.
   *
   * O outro caminho, com o app morto, é a tarefa de fundo — e os dois chamam a
   * mesma `tratarResposta`, que aguenta ser chamada duas vezes para o mesmo
   * toque. Isso acontece de verdade: o expo-notifications guarda a resposta
   * numa fila quando não há ouvinte e a entrega quando o app abre.
   */
  useEffect(() => {
    if (!bd || Platform.OS === "web") return;

    const sub = Notifications.addNotificationResponseReceivedListener(
      (resposta) => {
        void (async () => {
          const mudou = await tratarResposta(bd, resposta, new Date());
          if (mudou) setRespostasTratadas((n) => n + 1);
        })();
      },
    );
    return () => sub.remove();
  }, [bd]);

  if (erro) {
    return (
      <SafeAreaProvider>
        <View style={e.centro}>
          <Text style={e.erroTitulo}>Não consegui abrir o aplicativo</Text>
          <Text style={e.erroTexto}>{erro}</Text>
        </View>
        <StatusBar style="dark" />
      </SafeAreaProvider>
    );
  }

  if (!bd) {
    return (
      <SafeAreaProvider>
        <View style={e.centro} />
        <StatusBar style="dark" />
      </SafeAreaProvider>
    );
  }

  function voltarDoCadastro() {
    setVersaoDados((v) => v + 1);
    setTela({ nome: "remedios" });
  }

  return (
    <SafeAreaProvider>
      {semPermissao && tela.nome === "hoje" ? (
        <View style={e.faixa}>
          <Text style={e.faixaTexto}>
            As notificações estão desligadas. O aplicativo funciona, mas não vai
            avisar a hora do remédio.
          </Text>
        </View>
      ) : null}

      {tela.nome === "hoje" ? (
        <Hoje
          bd={bd}
          preparo={preparo}
          sinal={respostasTratadas}
          aoAbrirRemedios={() => setTela({ nome: "remedios" })}
        />
      ) : tela.nome === "remedios" ? (
        <MeusRemedios
          bd={bd}
          aoSair={() => setTela({ nome: "hoje" })}
          aoCriar={() => setTela({ nome: "formulario", id: null })}
          aoEditar={(id) => setTela({ nome: "formulario", id })}
        />
      ) : (
        <FormularioRemedio
          bd={bd}
          remedioId={tela.id}
          aoSair={voltarDoCadastro}
        />
      )}

      <StatusBar style="dark" />
    </SafeAreaProvider>
  );
}

const e = StyleSheet.create({
  centro: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: cores.fundo,
    padding: espaco.xl,
  },
  erroTitulo: {
    fontSize: texto.grande,
    fontWeight: "700",
    color: cores.tinta,
    textAlign: "center",
  },
  erroTexto: {
    marginTop: espaco.md,
    fontSize: texto.corpo,
    color: cores.tintaFraca,
    textAlign: "center",
  },
  faixa: {
    backgroundColor: cores.alertaFundo,
    paddingHorizontal: espaco.lg,
    paddingVertical: espaco.md,
    paddingTop: espaco.xxl,
  },
  faixaTexto: { fontSize: texto.corpo, color: cores.alerta, fontWeight: "700" },
});
