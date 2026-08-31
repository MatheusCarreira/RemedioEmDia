import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { Image } from "expo-image";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { textoDaQuantidade, type Dose, type EstadoDose } from "../dominio/doses";
import { cores, espaco, raio, texto, TOQUE, TOQUE_MINIMO } from "./tokens";

/**
 * Um remédio, um horário. Portado da versão web sem perder nenhuma decisão:
 *
 *  1. SÓ a dose que está na hora ganha botão grande. Vários botões grandes e
 *     iguais na tela convidam ao toque errado — e o toque errado aqui significa
 *     tomar remédio fora de hora, ou marcar como tomada uma dose que ela não
 *     tomou.
 *
 *  2. O nome do remédio NUNCA trunca. É o que ela confere contra a caixinha;
 *     "Losa…" não serve para nada. Em React Native isso é o padrão (o texto
 *     quebra sozinho), mas está dito aqui porque na web custou dois defeitos
 *     para descobrir — que ninguém acrescente `numberOfLines` depois.
 *
 *  3. Nenhum estado se distingue só por cor: cada um tem ícone e palavra
 *     própria.
 */
export function CartaoDose({
  dose,
  estado,
  onTomar,
}: {
  dose: Dose;
  estado: EstadoDose;
  onTomar: (id: string) => void;
}) {
  const paraHora = (d: Date) =>
    d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const hora = paraHora(dose.previstoPara);

  // --------------------------------------------------------------------------
  // JÁ TOMOU — encolhe, mas continua visível: ver o que já foi feito é o que
  // evita a dose dupla.
  // --------------------------------------------------------------------------
  if (estado === "feito") {
    return (
      <View style={e.feito}>
        <MaterialCommunityIcons
          name="check-bold"
          size={32}
          color={cores.feito}
        />
        <View style={e.feitoTexto}>
          <Text style={e.nomeFeito}>{dose.remedio}</Text>
          <Text style={e.legendaFeito}>
            {hora}
            {dose.tomadoEm ? ` · tomado às ${paraHora(dose.tomadoEm)}` : " · tomado"}
          </Text>
        </View>
      </View>
    );
  }

  const agora = estado === "agora";
  const chegando = estado === "chegando";
  const passou = estado === "passou";

  // Aceso: âmbar, nome maior e botão grande. Vale para os dois estados em que
  // ela pode agir — o que já chegou e o que está a minutos de chegar.
  const aceso = agora || chegando;

  // "Passou da hora" NÃO usa âmbar e NÃO ganha botão grande. Âmbar significa
  // "aja agora" neste app; pintar de âmbar uma dose de quatro horas atrás
  // empurraria ela a tomar remédio da manhã à noite. O cartão relata o
  // atraso e para por aí — se aquele remédio ainda pode ser tomado é decisão
  // dela, não de um aplicativo.
  const rotulo = chegando
    ? "DAQUI A POUCO"
    : agora
      ? "ESTÁ NA HORA"
      : passou
        ? "PASSOU DA HORA"
        : "Mais tarde";
  const corDoRotulo = aceso
    ? cores.agora
    : passou
      ? cores.espera
      : cores.tintaFraca;

  return (
    <View
      style={[
        e.cartao,
        aceso ? e.cartaoAgora : passou ? e.cartaoPassou : e.cartaoEspera,
      ]}
    >
      {/* `flexWrap` para o rótulo descer inteiro numa tela estreita, em vez de
          ser cortado — foi exatamente o defeito que apareceu na web a 360px. */}
      <View style={e.linhaHora}>
        <Text style={[e.hora, { color: aceso ? cores.tinta : cores.tintaFraca }]}>
          {hora}
        </Text>
        <View style={e.rotulo}>
          <MaterialCommunityIcons
            name={passou ? "alert-circle-outline" : "clock-outline"}
            size={22}
            color={corDoRotulo}
          />
          <Text style={[e.rotuloTexto, { color: corDoRotulo }]}>{rotulo}</Text>
        </View>
      </View>

      {/* A foto da caixa vem ANTES do nome, e é de propósito: ela reconhece a
          embalagem antes de ler "Cloridrato de Metformina" — que é o nome que
          a caixa dela provavelmente nem traz. `contentFit: contain` porque
          cortar a caixa poderia esconder justamente a marca. */}
      {dose.fotoUri ? (
        <Image
          source={{ uri: dose.fotoUri }}
          style={e.foto}
          contentFit="contain"
          transition={0}
          accessibilityLabel={`Caixa do ${dose.remedio}`}
        />
      ) : null}

      <Text style={[e.nome, { fontSize: aceso ? texto.maior : texto.grande }]}>
        {dose.remedio}
      </Text>

      <View style={e.linhaQuantidade}>
        <MaterialCommunityIcons name="pill" size={26} color={cores.tintaFraca} />
        <Text style={e.quantidade}>{textoDaQuantidade(dose.quantidade)}</Text>
      </View>

      {dose.observacao ? (
        <Text style={e.observacao}>{dose.observacao}</Text>
      ) : null}

      {aceso ? (
        <Pressable
          onPress={() => onTomar(dose.id)}
          accessibilityRole="button"
          accessibilityLabel={`Marcar ${dose.remedio} como tomado`}
          style={({ pressed }) => [
            e.botaoGrande,
            { backgroundColor: cores.agora, opacity: pressed ? 0.85 : 1 },
          ]}
        >
          <MaterialCommunityIcons name="check-bold" size={32} color={cores.branco} />
          <Text style={e.botaoGrandeTexto}>JÁ TOMEI</Text>
        </Pressable>
      ) : (
        // Ação discreta para quem toma adiantado de propósito. Mantém os 48px
        // mínimos da WCAG e é sublinhada, para ficar claramente tocável sem
        // competir com o botão da dose da vez.
        <Pressable
          onPress={() => onTomar(dose.id)}
          accessibilityRole="button"
          accessibilityLabel={`Marcar ${dose.remedio} como tomado`}
          style={({ pressed }) => [e.acaoDiscreta, { opacity: pressed ? 0.6 : 1 }]}
        >
          <MaterialCommunityIcons name="check" size={22} color={cores.tintaFraca} />
          <Text style={e.acaoDiscretaTexto}>Já tomei este</Text>
        </Pressable>
      )}
    </View>
  );
}

const e = StyleSheet.create({
  // --- já tomou ---
  feito: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: espaco.lg,
    borderRadius: raio.cartao,
    borderWidth: 2,
    borderColor: cores.feitoBorda,
    backgroundColor: cores.feitoFundo,
    paddingHorizontal: espaco.lg,
    paddingVertical: espaco.md,
  },
  feitoTexto: { flex: 1 },
  nomeFeito: { fontSize: texto.grande, fontWeight: "700", color: cores.tinta },
  legendaFeito: { fontSize: texto.pequeno, color: cores.feito },

  // --- ativos ---
  cartao: { borderRadius: raio.cartao, padding: espaco.lg },
  cartaoAgora: {
    borderWidth: 4,
    borderColor: cores.agoraBorda,
    backgroundColor: cores.agoraFundo,
  },
  cartaoEspera: {
    borderWidth: 2,
    borderColor: cores.borda,
    backgroundColor: cores.cartao,
  },
  // Borda mais firme que a de "mais tarde", para não passar despercebida,
  // mas sem cor de urgência.
  cartaoPassou: {
    borderWidth: 3,
    borderColor: cores.espera,
    backgroundColor: cores.cartao,
  },

  linhaHora: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    columnGap: espaco.md,
    rowGap: espaco.xs,
  },
  hora: { fontSize: texto.hora, fontWeight: "900" },
  rotulo: { flexDirection: "row", alignItems: "center", gap: espaco.sm },
  rotuloTexto: { fontSize: texto.pequeno, fontWeight: "700" },

  foto: {
    marginTop: espaco.md,
    width: "100%",
    height: 130,
    borderRadius: raio.cartao,
    backgroundColor: cores.fundo,
  },

  nome: {
    marginTop: espaco.sm,
    fontWeight: "700",
    color: cores.tinta,
  },

  linhaQuantidade: {
    flexDirection: "row",
    alignItems: "center",
    gap: espaco.sm,
    marginTop: espaco.xs,
  },
  quantidade: { flex: 1, fontSize: texto.corpo, color: cores.tintaFraca },

  observacao: {
    marginTop: espaco.xs,
    fontSize: texto.corpo,
    color: cores.tintaFraca,
  },

  botaoGrande: {
    marginTop: espaco.lg,
    minHeight: TOQUE,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: espaco.md,
    borderRadius: raio.botao,
  },
  botaoGrandeTexto: {
    fontSize: texto.grande,
    fontWeight: "900",
    color: cores.branco,
  },

  acaoDiscreta: {
    marginTop: espaco.md,
    minHeight: TOQUE_MINIMO,
    flexDirection: "row",
    alignItems: "center",
    gap: espaco.sm,
  },
  acaoDiscretaTexto: {
    fontSize: texto.corpo,
    fontWeight: "700",
    color: cores.tintaFraca,
    textDecorationLine: "underline",
  },
});
