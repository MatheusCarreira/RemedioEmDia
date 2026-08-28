import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from "react-native";
import { cores, espaco, raio, texto, TOQUE, TOQUE_MINIMO } from "./tokens";

/** Rótulo acima, conteúdo abaixo. O rótulo NUNCA vira placeholder dentro do
 *  campo: placeholder some quando se começa a digitar, e aí a pessoa não tem
 *  mais como conferir o que aquele campo pedia. */
export function Campo({
  rotulo,
  ajuda,
  children,
}: {
  rotulo: string;
  ajuda?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={e.campo}>
      <Text style={e.rotulo}>{rotulo}</Text>
      {ajuda ? <Text style={e.ajuda}>{ajuda}</Text> : null}
      {children}
    </View>
  );
}

export function EntradaTexto(props: TextInputProps) {
  return (
    <TextInput
      {...props}
      style={[e.entrada, props.style]}
      placeholderTextColor={cores.tintaFraca}
    />
  );
}

/**
 * Contador de meio em meio comprimido.
 *
 * Existe para não abrir teclado numérico. Digitar "0.5" num teclado de celular
 * é onde uma mão trêmula erra a dose — e errar dose de remédio é o defeito que
 * este aplicativo inteiro existe para evitar. Com dois botões grandes, o valor
 * só pode andar por passos válidos.
 */
export function ContadorDeDose({
  valor,
  onChange,
  descricao,
}: {
  valor: number;
  onChange: (v: number) => void;
  descricao: string;
}) {
  const passo = 0.5;
  const min = 0.5;
  const max = 20;

  return (
    <View style={e.contador}>
      <Pressable
        onPress={() => onChange(Math.max(min, +(valor - passo).toFixed(2)))}
        disabled={valor <= min}
        accessibilityRole="button"
        accessibilityLabel="Diminuir meio comprimido"
        style={({ pressed }) => [
          e.contadorBotao,
          { opacity: valor <= min ? 0.3 : pressed ? 0.7 : 1 },
        ]}
      >
        <MaterialCommunityIcons name="minus" size={34} color={cores.tinta} />
      </Pressable>

      <Text style={e.contadorValor} accessibilityLabel={descricao}>
        {descricao}
      </Text>

      <Pressable
        onPress={() => onChange(Math.min(max, +(valor + passo).toFixed(2)))}
        disabled={valor >= max}
        accessibilityRole="button"
        accessibilityLabel="Aumentar meio comprimido"
        style={({ pressed }) => [
          e.contadorBotao,
          { opacity: valor >= max ? 0.3 : pressed ? 0.7 : 1 },
        ]}
      >
        <MaterialCommunityIcons name="plus" size={34} color={cores.tinta} />
      </Pressable>
    </View>
  );
}

/** Uma "pastilha" de horário, com o X para remover. */
export function Pastilha({
  texto: rotulo,
  onRemover,
}: {
  texto: string;
  onRemover: () => void;
}) {
  return (
    <View style={e.pastilha}>
      <Text style={e.pastilhaTexto}>{rotulo}</Text>
      <Pressable
        onPress={onRemover}
        accessibilityRole="button"
        accessibilityLabel={`Remover horário ${rotulo}`}
        hitSlop={12}
        style={({ pressed }) => [e.pastilhaX, { opacity: pressed ? 0.5 : 1 }]}
      >
        <MaterialCommunityIcons name="close" size={26} color={cores.tinta} />
      </Pressable>
    </View>
  );
}

const e = StyleSheet.create({
  campo: { marginTop: espaco.xxl },
  rotulo: { fontSize: texto.grande, fontWeight: "700", color: cores.tinta },
  ajuda: {
    marginTop: espaco.xs,
    fontSize: texto.pequeno,
    color: cores.tintaFraca,
  },

  entrada: {
    marginTop: espaco.md,
    minHeight: TOQUE,
    borderWidth: 2,
    borderColor: cores.borda,
    borderRadius: raio.cartao,
    backgroundColor: cores.cartao,
    paddingHorizontal: espaco.lg,
    paddingVertical: espaco.md,
    fontSize: texto.corpo,
    color: cores.tinta,
  },

  contador: {
    marginTop: espaco.md,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 2,
    borderColor: cores.borda,
    borderRadius: raio.cartao,
    backgroundColor: cores.cartao,
  },
  contadorBotao: {
    width: TOQUE,
    height: TOQUE,
    alignItems: "center",
    justifyContent: "center",
  },
  contadorValor: {
    flex: 1,
    textAlign: "center",
    fontSize: texto.corpo,
    fontWeight: "700",
    color: cores.tinta,
  },

  pastilha: {
    flexDirection: "row",
    alignItems: "center",
    gap: espaco.sm,
    minHeight: TOQUE_MINIMO,
    borderWidth: 2,
    borderColor: cores.borda,
    borderRadius: raio.cartao,
    backgroundColor: cores.cartao,
    paddingLeft: espaco.lg,
    paddingRight: espaco.md,
    paddingVertical: espaco.sm,
  },
  pastilhaTexto: {
    fontSize: texto.grande,
    fontWeight: "700",
    color: cores.tinta,
    fontVariant: ["tabular-nums"],
  },
  pastilhaX: { padding: espaco.xs },
});
