import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { Image } from "expo-image";
import type { SQLiteDatabase } from "expo-sqlite";
import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { definirAtivo, listarRemedios, type Remedio } from "../dados/remedios";
import { textoDaQuantidade } from "../dominio/doses";
import { textoDoEstoque } from "../dominio/estoque";
import { Botao } from "../ui/Botao";
import { horarioPorExtenso } from "../ui/escolherHorario";
import { cores, espaco, raio, texto, TOQUE } from "../ui/tokens";

/**
 * A lista de remédios cadastrados.
 *
 * Não é a tela do dia a dia dela — é a tela de configurar, e por isso mostra
 * coisas que a tela "Hoje" esconde de propósito: todos os horários, o estoque,
 * e o interruptor de ligar/desligar.
 *
 * O interruptor está aqui, e não dentro do formulário, porque parar de tomar um
 * remédio é decisão frequente (o médico suspende, a caixa acaba) enquanto
 * apagar é rara e definitiva. O que se faz muito fica a um toque; o que é
 * irreversível fica escondido dentro do formulário, atrás de dois toques.
 */
export function MeusRemedios({
  bd,
  aoEditar,
  aoCriar,
  aoSair,
}: {
  bd: SQLiteDatabase;
  aoEditar: (id: number) => void;
  aoCriar: () => void;
  aoSair: () => void;
}) {
  const [remedios, setRemedios] = useState<Remedio[]>([]);

  const recarregar = useCallback(async () => {
    setRemedios(await listarRemedios(bd, false));
  }, [bd]);

  useEffect(() => {
    void recarregar();
  }, [recarregar]);

  async function alternar(id: number, ativo: boolean) {
    // Otimista: o interruptor precisa responder no dedo.
    setRemedios((atuais) =>
      atuais.map((r) => (r.id === id ? { ...r, ativo } : r)),
    );
    await definirAtivo(bd, id, ativo);
    await recarregar();
  }

  return (
    <SafeAreaView style={e.tela} edges={["top", "bottom"]}>
      <ScrollView contentContainerStyle={e.conteudo}>
        <Pressable
          onPress={aoSair}
          accessibilityRole="button"
          accessibilityLabel="Voltar para os remédios de hoje"
          style={({ pressed }) => [e.voltar, { opacity: pressed ? 0.6 : 1 }]}
        >
          <MaterialCommunityIcons
            name="chevron-left"
            size={36}
            color={cores.tinta}
          />
          <Text style={e.voltarTexto}>Hoje</Text>
        </Pressable>

        <Text style={e.titulo}>Meus remédios</Text>

        {remedios.length === 0 ? (
          <Text style={e.vazio}>
            Nenhum remédio cadastrado. Toque no botão abaixo para começar.
          </Text>
        ) : null}

        <View style={e.lista}>
          {remedios.map((r) => (
            <View key={r.id} style={[e.cartao, !r.ativo && e.cartaoDesligado]}>
              <Pressable
                onPress={() => aoEditar(r.id)}
                accessibilityRole="button"
                accessibilityLabel={`Editar ${r.nome}`}
                style={({ pressed }) => [e.toqueCartao, { opacity: pressed ? 0.7 : 1 }]}
              >
                <View style={e.linhaTopo}>
                  {r.fotoUri ? (
                    <Image
                      source={{ uri: r.fotoUri }}
                      style={e.miniatura}
                      contentFit="cover"
                      transition={0}
                    />
                  ) : (
                    <View style={[e.miniatura, e.miniaturaVazia]}>
                      <MaterialCommunityIcons
                        name="pill"
                        size={32}
                        color={cores.tintaFraca}
                      />
                    </View>
                  )}

                  <View style={e.flex}>
                    <Text style={e.nome}>{r.nome}</Text>
                    <Text style={e.detalhe}>
                      {textoDaQuantidade(r.quantidade)}
                    </Text>
                  </View>

                  <MaterialCommunityIcons
                    name="pencil"
                    size={28}
                    color={cores.tintaFraca}
                  />
                </View>

                <Text style={e.horarios}>
                  {r.horarios.length === 0
                    ? "Sem horário marcado"
                    : r.horarios
                        .map((h) => horarioPorExtenso(h.minutosDoDia))
                        .join("   ·   ")}
                </Text>

                <Text style={e.detalhe}>
                  {textoDoEstoque({
                    estoqueComprimidos: r.estoqueComprimidos,
                    quantidade: r.quantidade,
                    dosesPorDia: r.horarios.length,
                    avisarComDiasRestantes: r.avisarComDiasRestantes,
                  })}
                </Text>
              </Pressable>

              <View style={e.linhaSwitch}>
                <Text style={e.switchTexto}>
                  {r.ativo ? "Tomando" : "Parado"}
                </Text>
                <Switch
                  value={r.ativo}
                  onValueChange={(v) => void alternar(r.id, v)}
                  trackColor={{ true: cores.feito, false: cores.borda }}
                  thumbColor={cores.branco}
                  accessibilityLabel={`${r.ativo ? "Parar" : "Voltar"} de tomar ${r.nome}`}
                />
              </View>
            </View>
          ))}
        </View>

        <Botao
          titulo="Adicionar remédio"
          icone="plus"
          onPress={aoCriar}
          style={e.adicionar}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const e = StyleSheet.create({
  tela: { flex: 1, backgroundColor: cores.fundo },
  flex: { flex: 1 },
  conteudo: {
    paddingHorizontal: espaco.lg,
    paddingTop: espaco.md,
    paddingBottom: espaco.xxl * 2,
  },
  voltar: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: TOQUE,
    marginLeft: -espaco.sm,
  },
  voltarTexto: { fontSize: texto.corpo, fontWeight: "700", color: cores.tinta },
  titulo: {
    fontSize: texto.hora,
    fontWeight: "900",
    color: cores.tinta,
    marginTop: espaco.xs,
  },
  vazio: {
    marginTop: espaco.xl,
    fontSize: texto.corpo,
    color: cores.tintaFraca,
  },

  lista: { marginTop: espaco.xl, gap: espaco.md },
  cartao: {
    borderRadius: raio.cartao,
    borderWidth: 2,
    borderColor: cores.borda,
    backgroundColor: cores.cartao,
    padding: espaco.lg,
  },
  // Remédio parado fica visivelmente apagado, mas continua legível — ela
  // precisa poder ler o que está parado para decidir religar.
  cartaoDesligado: { opacity: 0.55 },
  toqueCartao: { minHeight: TOQUE },

  // `flex-start`: com nome de tres linhas, a miniatura centralizada flutuava
  // no meio do texto. Alinhada ao topo, ela acompanha a primeira linha.
  linhaTopo: { flexDirection: "row", alignItems: "flex-start", gap: espaco.md },
  miniatura: {
    width: 64,
    height: 64,
    borderRadius: raio.cartao,
    backgroundColor: cores.fundo,
  },
  miniaturaVazia: { alignItems: "center", justifyContent: "center" },

  nome: { fontSize: texto.grande, fontWeight: "700", color: cores.tinta },
  detalhe: { fontSize: texto.pequeno, color: cores.tintaFraca },
  horarios: {
    marginTop: espaco.md,
    fontSize: texto.corpo,
    fontWeight: "700",
    color: cores.tinta,
    fontVariant: ["tabular-nums"],
  },

  linhaSwitch: {
    marginTop: espaco.md,
    paddingTop: espaco.md,
    borderTopWidth: 2,
    borderTopColor: cores.fundo,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 56,
  },
  switchTexto: { fontSize: texto.corpo, fontWeight: "700", color: cores.tinta },

  adicionar: { marginTop: espaco.xxl },
});
