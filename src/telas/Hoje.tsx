import type { SQLiteDatabase } from "expo-sqlite";
import { useCallback, useEffect, useRef, useState } from "react";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import {
  ActivityIndicator,
  AppState,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { tomarDose } from "../alarme/acoes";
import { reconciliarAlarmes } from "../alarme/reconciliar";
import { marcarExemploInicial, semearExemploSeVazio } from "../dados/exemplo";
import {
  dosesDeHoje,
  gerarDosesDoDia,
  remediosAcabando,
  reporCaixa,
} from "../dados/remedios";
import { dataPorExtenso, estadoDaDose, type Dose } from "../dominio/doses";
import type { RemedioAcabando } from "../dominio/estoque";
import { AvisoEstoque } from "../ui/AvisoEstoque";
import { CartaoDose } from "../ui/CartaoDose";
import { cores, espaco, raio, texto } from "../ui/tokens";

/** A chave que decide se o dia precisa ser preparado de novo. */
const chaveDoDia = (dia: string, versao: number) => `${dia}#${versao}`;

/**
 * A tela dela. É a que ela vê no dia a dia.
 *
 * A única saída daqui é um botão discreto no topo, "Meus remédios". Discreto de
 * propósito: ela abre este aplicativo para responder "já tomei?", e tudo que
 * disputa atenção com essa pergunta atrapalha. Quem entra no cadastro está
 * procurando por ele.
 */
export function Hoje({
  bd,
  aoAbrirRemedios,
  versao,
  sinal,
}: {
  bd: SQLiteDatabase;
  aoAbrirRemedios: () => void;
  /**
   * Muda quando o cadastro é alterado. Serve para forçar a regeração das doses
   * e o reagendamento dos alarmes ao voltar do formulário — sem isso, um
   * remédio recém-cadastrado só apareceria no dia seguinte.
   */
  versao: number;
  /**
   * Muda quando um botão da notificação foi atendido com o app aberto. Só
   * relê; não refaz o dia. Sem isso ela marcaria "já tomei" na notificação e
   * veria a tela atrás continuar dizendo que falta tomar.
   */
  sinal: number;
}) {
  const [carregando, setCarregando] = useState(true);
  const [agora, setAgora] = useState(() => new Date());
  const [doses, setDoses] = useState<Dose[]>([]);
  const [acabando, setAcabando] = useState<RemedioAcabando[]>([]);

  // O dia que já foi preparado (doses geradas, alarmes reconciliados). Guardado
  // numa ref, não em estado: mudar isso não deve provocar render.
  const diaPreparado = useRef<string | null>(null);

  const recarregar = useCallback(async () => {
    const momento = new Date();
    const dia = momento.toDateString();

    // Preparar o dia é caro (gera doses e reconstrói todos os alarmes), então
    // acontece uma vez por dia — mas a checagem é por DATA, não por "já rodou".
    // É isso que faz o app se acertar sozinho quando ela o abre depois da
    // meia-noite ou depois de dias sem usar.
    if (diaPreparado.current !== chaveDoDia(dia, versao)) {
      const semeou = await semearExemploSeVazio(bd, momento);
      await gerarDosesDoDia(bd, momento);
      if (semeou) await marcarExemploInicial(bd, momento);
      await reconciliarAlarmes(bd, momento);
      diaPreparado.current = chaveDoDia(dia, versao);
    }

    const [d, a] = await Promise.all([
      dosesDeHoje(bd, momento),
      remediosAcabando(bd),
    ]);
    setDoses(d);
    setAcabando(a);
    setAgora(momento);
    setCarregando(false);
  }, [bd, versao]);

  useEffect(() => {
    void recarregar();

    // Reavalia de tempos em tempos para o cartão virar "está na hora" sozinho,
    // sem ela precisar fechar e abrir. 15s e não 60s: um intervalo de um minuto
    // pode cair logo depois da virada e deixar o cartão errado por quase um
    // minuto inteiro.
    const t = setInterval(() => setAgora(new Date()), 15_000);

    // Ao voltar do segundo plano, recarrega: pode ter virado o dia, ou o alarme
    // pode ter tocado e ela ter vindo pelo toque na notificação.
    const sub = AppState.addEventListener("change", (estado) => {
      if (estado === "active") void recarregar();
    });

    return () => {
      clearInterval(t);
      sub.remove();
    };
  }, [recarregar]);

  // Efeito separado, e não mais uma dependência do de cima: juntar os dois
  // faria cada toque na notificação derrubar e recriar o relógio e o ouvinte
  // de segundo plano, sem necessidade nenhuma.
  useEffect(() => {
    if (sinal > 0) void recarregar();
  }, [sinal, recarregar]);

  async function aoTomar(id: string) {
    // Otimista: a tela responde no toque. Um botão que fica meio segundo sem
    // reagir faz ela apertar de novo — e o toque duplo é justamente o que a
    // gente não quer nesta tela.
    setDoses((atuais) =>
      atuais.map((d) => (d.id === id ? { ...d, tomadoEm: new Date() } : d)),
    );
    // `tomarDose` e não `marcarTomada`: marcar pela tela também precisa
    // desmontar o lembrete de repetição, senão o app pergunta "você já tomou?"
    // meia hora depois de ela ter respondido isso no botão grande.
    await tomarDose(bd, Number(id));
    const [d, a] = await Promise.all([
      dosesDeHoje(bd, new Date()),
      remediosAcabando(bd),
    ]);
    setDoses(d);
    setAcabando(a);
  }

  async function aoComprar(id: string) {
    setAcabando((atuais) => atuais.filter((r) => r.id !== id));
    await reporCaixa(bd, Number(id));
    setAcabando(await remediosAcabando(bd));
  }

  if (carregando) {
    return (
      <SafeAreaView style={e.tela}>
        <View style={e.centro}>
          <ActivityIndicator size="large" color={cores.tintaFraca} />
        </View>
      </SafeAreaView>
    );
  }

  const faltam = doses.filter((d) => !d.tomadoEm).length;

  return (
    <SafeAreaView style={e.tela} edges={["top", "bottom"]}>
      <ScrollView
        contentContainerStyle={e.conteudo}
        refreshControl={
          <RefreshControl refreshing={false} onRefresh={() => void recarregar()} />
        }
      >
        <View style={e.cabecalho}>
          <View style={e.flex}>
            <Text style={e.titulo}>Hoje</Text>
            <Text style={e.data}>{dataPorExtenso(agora)}</Text>
          </View>
          <Pressable
            onPress={aoAbrirRemedios}
            accessibilityRole="button"
            accessibilityLabel="Meus remédios"
            hitSlop={12}
            style={({ pressed }) => [e.engrenagem, { opacity: pressed ? 0.5 : 1 }]}
          >
            <MaterialCommunityIcons
              name="cog-outline"
              size={34}
              color={cores.tintaFraca}
            />
            <Text style={e.engrenagemTexto}>Meus remédios</Text>
          </Pressable>
        </View>

        {/* A resposta para "já tomei tudo?" — a pergunta que ela abre o app
            para responder — vem antes de qualquer lista. */}
        <View style={e.resumo}>
          <Text style={e.resumoTexto}>
            {doses.length === 0
              ? "Nenhum remédio cadastrado ainda."
              : faltam === 0
                ? "Você já tomou todos os remédios de hoje."
                : faltam === 1
                  ? "Falta 1 remédio hoje."
                  : `Faltam ${faltam} remédios hoje.`}
          </Text>
        </View>

        <View style={e.lista}>
          {doses.map((dose) => (
            <CartaoDose
              key={dose.id}
              dose={dose}
              estado={estadoDaDose(dose, agora)}
              onTomar={(id) => void aoTomar(id)}
            />
          ))}
        </View>

        <AvisoEstoque
          remedios={acabando}
          onComprei={(id) => void aoComprar(id)}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const e = StyleSheet.create({
  tela: { flex: 1, backgroundColor: cores.fundo },
  centro: { flex: 1, alignItems: "center", justifyContent: "center" },
  conteudo: {
    paddingHorizontal: espaco.lg,
    paddingTop: espaco.xl,
    paddingBottom: espaco.xxl * 2,
  },
  flex: { flex: 1 },
  cabecalho: { flexDirection: "row", alignItems: "flex-start", gap: espaco.md },
  engrenagem: {
    alignItems: "center",
    minWidth: 72,
    minHeight: 72,
    justifyContent: "center",
  },
  engrenagemTexto: {
    fontSize: 15,
    fontWeight: "700",
    color: cores.tintaFraca,
    textAlign: "center",
  },
  titulo: { fontSize: texto.hora, fontWeight: "900", color: cores.tinta },
  data: { marginTop: espaco.xs, fontSize: texto.corpo, color: cores.tintaFraca },
  resumo: {
    marginTop: espaco.lg,
    borderRadius: raio.cartao,
    backgroundColor: cores.cartao,
    paddingHorizontal: espaco.lg,
    paddingVertical: espaco.md,
  },
  resumoTexto: { fontSize: texto.grande, fontWeight: "700", color: cores.tinta },
  lista: { marginTop: espaco.lg, gap: espaco.md },
});
