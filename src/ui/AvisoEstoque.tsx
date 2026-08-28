import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { RemedioAcabando } from "../dominio/estoque";
import { cores, espaco, raio, texto, TOQUE } from "./tokens";

/**
 * "Este remédio está acabando" — na tela dela, com a saída junto.
 *
 *  1. Vai no FIM da lista. O topo responde "já tomei tudo hoje?", que é
 *     urgente; isto tem uma semana de folga. Roubar o topo seria trocar o
 *     urgente pelo importante.
 *
 *  2. NÃO usa âmbar. Âmbar é a cor de "está na hora de tomar" e mais nada — se
 *     duas coisas diferentes acendem igual, nenhuma das duas significa algo.
 *
 *  3. Tem o botão "JÁ COMPREI" junto. Aviso sem saída é alarme que não desliga,
 *     e ela aprenderia a ignorar — inclusive os alarmes que importam.
 */
export function AvisoEstoque({
  remedios,
  onComprei,
}: {
  remedios: RemedioAcabando[];
  onComprei: (id: string) => void;
}) {
  if (remedios.length === 0) return null;

  return (
    <View style={e.secao}>
      <View style={e.titulo}>
        <MaterialCommunityIcons name="shopping" size={28} color={cores.tinta} />
        <Text style={e.tituloTexto}>Está acabando</Text>
      </View>

      {remedios.map((r) => (
        <View key={r.id} style={e.cartao}>
          <Text style={e.nome}>{r.nome}</Text>
          <Text style={e.prazo}>
            {r.diasRestantes === 0
              ? "Acabou."
              : r.diasRestantes === 1
                ? "Dá para mais 1 dia."
                : `Dá para mais ${r.diasRestantes} dias.`}
          </Text>

          <Pressable
            onPress={() => onComprei(r.id)}
            accessibilityRole="button"
            accessibilityLabel={`Repor estoque de ${r.nome}`}
            style={({ pressed }) => [e.botao, { opacity: pressed ? 0.85 : 1 }]}
          >
            <MaterialCommunityIcons
              name="shopping"
              size={28}
              color={cores.branco}
            />
            <Text style={e.botaoTexto}>JÁ COMPREI</Text>
          </Pressable>

          {r.comprimidosPorCaixa ? (
            // Diz o que o botão vai fazer ANTES do toque. Botão que altera um
            // número sem avisar quanto vira medo de apertar.
            <Text style={e.legenda}>
              Vai somar uma caixa de {r.comprimidosPorCaixa}.
            </Text>
          ) : null}
        </View>
      ))}
    </View>
  );
}

const e = StyleSheet.create({
  secao: { marginTop: espaco.xxl, gap: espaco.md },
  titulo: { flexDirection: "row", alignItems: "center", gap: espaco.md },
  tituloTexto: { fontSize: texto.grande, fontWeight: "700", color: cores.tinta },

  cartao: {
    borderRadius: raio.cartao,
    borderWidth: 2,
    borderColor: cores.borda,
    backgroundColor: cores.cartao,
    padding: espaco.lg,
  },
  nome: { fontSize: texto.grande, fontWeight: "700", color: cores.tinta },
  prazo: { marginTop: espaco.xs, fontSize: texto.corpo, color: cores.tintaFraca },

  botao: {
    marginTop: espaco.lg,
    minHeight: TOQUE,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: espaco.md,
    borderRadius: raio.botao,
    backgroundColor: cores.espera,
  },
  botaoTexto: { fontSize: texto.grande, fontWeight: "900", color: cores.branco },

  legenda: {
    marginTop: espaco.sm,
    textAlign: "center",
    fontSize: texto.pequeno,
    color: cores.tintaFraca,
  },
});
