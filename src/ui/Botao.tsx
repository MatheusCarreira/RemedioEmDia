import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { Pressable, StyleSheet, Text, type ViewStyle } from "react-native";
import { cores, espaco, raio, texto, TOQUE } from "./tokens";

type Tom = "principal" | "secundario" | "perigo";

/**
 * Botão de largura cheia, altura de toque garantida.
 *
 * Três tons e nada além: quanto menos variação, menos chance de dois botões
 * diferentes parecerem a mesma coisa. "perigo" é só para apagar — a única ação
 * irreversível do aplicativo.
 */
export function Botao({
  titulo,
  onPress,
  tom = "principal",
  icone,
  desabilitado = false,
  style,
}: {
  titulo: string;
  onPress: () => void;
  tom?: Tom;
  icone?: React.ComponentProps<typeof MaterialCommunityIcons>["name"];
  desabilitado?: boolean;
  style?: ViewStyle;
}) {
  const fundo =
    tom === "principal"
      ? cores.agora
      : tom === "perigo"
        ? cores.alerta
        : cores.cartao;
  const corTexto = tom === "secundario" ? cores.tinta : cores.branco;

  return (
    <Pressable
      onPress={onPress}
      disabled={desabilitado}
      accessibilityRole="button"
      accessibilityLabel={titulo}
      accessibilityState={{ disabled: desabilitado }}
      style={({ pressed }) => [
        e.botao,
        {
          backgroundColor: fundo,
          borderWidth: tom === "secundario" ? 2 : 0,
          borderColor: cores.borda,
          opacity: desabilitado ? 0.4 : pressed ? 0.85 : 1,
        },
        style,
      ]}
    >
      {icone ? (
        <MaterialCommunityIcons name={icone} size={28} color={corTexto} />
      ) : null}
      <Text style={[e.texto, { color: corTexto }]}>{titulo}</Text>
    </Pressable>
  );
}

const e = StyleSheet.create({
  botao: {
    minHeight: TOQUE,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: espaco.md,
    borderRadius: raio.botao,
    paddingHorizontal: espaco.lg,
  },
  texto: { fontSize: texto.grande, fontWeight: "900" },
});
