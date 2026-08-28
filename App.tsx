import type { SQLiteDatabase } from "expo-sqlite";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { prepararAlarme } from "./src/alarme/alarme";
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

  // Sobe a cada mudança no cadastro. A tela "Hoje" observa isto para regerar
  // as doses e reagendar os alarmes — sem isso, um remédio recém-cadastrado
  // só apareceria no dia seguinte.
  const [versaoDados, setVersaoDados] = useState(0);

  useEffect(() => {
    (async () => {
      try {
        const banco = await abrirBanco();
        // A permissão é pedida DEPOIS do banco abrir, mas antes da tela
        // aparecer: se ela negar, o app continua servindo como lista — só
        // perde o alarme, que é o aviso mostrado abaixo.
        const autorizado = await prepararAlarme();
        setSemPermissao(!autorizado);
        setBd(banco);
      } catch (e) {
        setErro(e instanceof Error ? e.message : String(e));
      }
    })();
  }, []);

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
          versao={versaoDados}
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
