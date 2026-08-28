import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { Image } from "expo-image";
import type { SQLiteDatabase } from "expo-sqlite";
import { useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { apagarFoto, tirarFotoDaCaixa } from "../dados/fotos";
import {
  apagarRemedio,
  diaLocal,
  obterRemedio,
  salvarRemedio,
} from "../dados/remedios";
import { textoDaQuantidade } from "../dominio/doses";
import { Botao } from "../ui/Botao";
import { Campo, ContadorDeDose, EntradaTexto, Pastilha } from "../ui/Campo";
import { escolherHorario, horarioPorExtenso } from "../ui/escolherHorario";
import { cores, espaco, raio, texto, TOQUE } from "../ui/tokens";

/**
 * Cadastro de um remédio.
 *
 * Duas regras que moldaram este formulário:
 *
 *  1. NENHUM campo de dose abre teclado numérico. Digitar "0,5" com a mão
 *     trêmula é onde se erra a dose, e errar dose é o que este aplicativo
 *     inteiro existe para evitar. A quantidade anda de meio em meio por
 *     botões grandes; o horário vem do relógio nativo do Android.
 *
 *  2. Apagar é em dois toques, sem caixa de diálogo. Diálogo modal some
 *     rápido e é fácil de confirmar sem ler; o botão que muda para "Tem
 *     certeza?" fica na tela, esperando, e pode ser abandonado só saindo.
 */
export function FormularioRemedio({
  bd,
  remedioId,
  aoSair,
}: {
  bd: SQLiteDatabase;
  /** null = criando um remédio novo. */
  remedioId: number | null;
  aoSair: () => void;
}) {
  const [carregando, setCarregando] = useState(remedioId !== null);
  const [nome, setNome] = useState("");
  const [quantidade, setQuantidade] = useState(1);
  const [observacao, setObservacao] = useState("");
  const [fotoUri, setFotoUri] = useState<string | null>(null);
  const [horarios, setHorarios] = useState<number[]>([]);
  const [controlarEstoque, setControlarEstoque] = useState(false);
  const [estoque, setEstoque] = useState("");
  const [porCaixa, setPorCaixa] = useState("");
  const [confirmandoApagar, setConfirmandoApagar] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // A foto original, para saber se precisa apagar o arquivo antigo ao trocar.
  const [fotoOriginal, setFotoOriginal] = useState<string | null>(null);

  useEffect(() => {
    if (remedioId === null) return;
    (async () => {
      const r = await obterRemedio(bd, remedioId);
      if (r) {
        setNome(r.nome);
        setQuantidade(r.quantidade);
        setObservacao(r.observacao ?? "");
        setFotoUri(r.fotoUri);
        setFotoOriginal(r.fotoUri);
        setHorarios(r.horarios.map((h) => h.minutosDoDia));
        setControlarEstoque(r.estoqueComprimidos !== null);
        setEstoque(r.estoqueComprimidos?.toString() ?? "");
        setPorCaixa(r.comprimidosPorCaixa?.toString() ?? "");
      }
      setCarregando(false);
    })();
  }, [bd, remedioId]);

  async function trocarFoto() {
    const nova = await tirarFotoDaCaixa();
    if (nova) setFotoUri(nova);
  }

  function adicionarHorario() {
    // Sugere 08:00 no primeiro, e uma hora depois do último nos seguintes —
    // poupa ela de girar o relógio desde a meia-noite toda vez.
    const ultimo = horarios.length ? Math.max(...horarios) : 7 * 60;
    escolherHorario(Math.min(1439, ultimo + 60), (m) => {
      setHorarios((atuais) =>
        atuais.includes(m) ? atuais : [...atuais, m].sort((a, b) => a - b),
      );
    });
  }

  async function salvar() {
    const nomeLimpo = nome.trim();
    if (!nomeLimpo) {
      setErro("Escreva o nome do remédio.");
      return;
    }
    if (horarios.length === 0) {
      setErro("Marque pelo menos um horário.");
      return;
    }
    setErro(null);

    // Trocou a foto? O arquivo antigo vira lixo no aparelho.
    if (fotoOriginal && fotoOriginal !== fotoUri) apagarFoto(fotoOriginal);

    const hoje = new Date();
    await salvarRemedio(
      bd,
      {
        id: remedioId ?? undefined,
        nome: nomeLimpo,
        quantidade,
        observacao: observacao.trim() || null,
        fotoUri,
        ativo: true,
        inicioEm: diaLocal(hoje),
        fimEm: null,
        estoqueComprimidos: controlarEstoque ? Number(estoque) || 0 : null,
        comprimidosPorCaixa: controlarEstoque ? Number(porCaixa) || null : null,
        horarios,
      },
      hoje,
    );
    aoSair();
  }

  async function apagar() {
    if (remedioId === null) return;
    apagarFoto(fotoOriginal);
    await apagarRemedio(bd, remedioId);
    aoSair();
  }

  if (carregando) {
    return <SafeAreaView style={e.tela} />;
  }

  return (
    <SafeAreaView style={e.tela} edges={["top", "bottom"]}>
      <KeyboardAvoidingView
        style={e.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView contentContainerStyle={e.conteudo} keyboardShouldPersistTaps="handled">
          <Pressable
            onPress={aoSair}
            accessibilityRole="button"
            accessibilityLabel="Voltar"
            style={({ pressed }) => [e.voltar, { opacity: pressed ? 0.6 : 1 }]}
          >
            <MaterialCommunityIcons
              name="chevron-left"
              size={36}
              color={cores.tinta}
            />
            <Text style={e.voltarTexto}>Voltar</Text>
          </Pressable>

          <Text style={e.titulo}>
            {remedioId === null ? "Novo remédio" : "Editar remédio"}
          </Text>

          {/* ---- Foto ---- */}
          <Campo
            rotulo="Foto da caixa"
            ajuda="A caixa costuma ter um nome diferente do nome do remédio. Com a foto, é só comparar."
          >
            {fotoUri ? (
              <View>
                <Image
                  source={{ uri: fotoUri }}
                  style={e.foto}
                  contentFit="contain"
                  transition={0}
                />
                <View style={e.linhaBotoes}>
                  <Botao
                    titulo="Trocar"
                    tom="secundario"
                    icone="camera"
                    onPress={() => void trocarFoto()}
                    style={e.flex}
                  />
                  <Botao
                    titulo="Remover"
                    tom="secundario"
                    icone="close"
                    onPress={() => setFotoUri(null)}
                    style={e.flex}
                  />
                </View>
              </View>
            ) : (
              <Botao
                titulo="Tirar foto da caixa"
                tom="secundario"
                icone="camera"
                onPress={() => void trocarFoto()}
                style={e.espacoAcima}
              />
            )}
          </Campo>

          {/* ---- Nome ---- */}
          <Campo rotulo="Nome do remédio">
            <EntradaTexto
              value={nome}
              onChangeText={setNome}
              placeholder="Losartana Potássica 50mg"
              autoCapitalize="sentences"
              accessibilityLabel="Nome do remédio"
            />
          </Campo>

          {/* ---- Quantidade ---- */}
          <Campo rotulo="Quantos por vez" ajuda="Toque em − ou + para mudar.">
            <ContadorDeDose
              valor={quantidade}
              onChange={setQuantidade}
              descricao={textoDaQuantidade(quantidade)}
            />
          </Campo>

          {/* ---- Horários ---- */}
          <Campo rotulo="Horários" ajuda="Toque para escolher no relógio.">
            <View style={e.pastilhas}>
              {horarios.map((m) => (
                <Pastilha
                  key={m}
                  texto={horarioPorExtenso(m)}
                  onRemover={() =>
                    setHorarios((atuais) => atuais.filter((x) => x !== m))
                  }
                />
              ))}
            </View>
            <Botao
              titulo="Adicionar horário"
              tom="secundario"
              icone="clock-plus-outline"
              onPress={adicionarHorario}
              style={e.espacoAcima}
            />
          </Campo>

          {/* ---- Observação ---- */}
          <Campo
            rotulo="Observação"
            ajuda="Opcional. Aparece no cartão, embaixo do nome."
          >
            <EntradaTexto
              value={observacao}
              onChangeText={setObservacao}
              placeholder="Depois do almoço"
              autoCapitalize="sentences"
              accessibilityLabel="Observação"
            />
          </Campo>

          {/* ---- Estoque ---- */}
          <Campo
            rotulo="Controlar estoque"
            ajuda="Avisa quando estiver acabando, com uma semana de folga."
          >
            <View style={e.linhaSwitch}>
              <Text style={e.switchTexto}>
                {controlarEstoque ? "Ligado" : "Desligado"}
              </Text>
              <Switch
                value={controlarEstoque}
                onValueChange={setControlarEstoque}
                trackColor={{ true: cores.agora, false: cores.borda }}
                thumbColor={cores.branco}
                accessibilityLabel="Controlar estoque"
              />
            </View>
          </Campo>

          {controlarEstoque ? (
            <>
              <Campo rotulo="Quantos comprimidos tem agora">
                <EntradaTexto
                  value={estoque}
                  onChangeText={(t) => setEstoque(t.replace(/[^0-9]/g, ""))}
                  placeholder="30"
                  inputMode="numeric"
                  accessibilityLabel="Quantos comprimidos tem agora"
                />
              </Campo>
              <Campo
                rotulo="Quantos vêm na caixa"
                ajuda='É o que o botão "já comprei" vai somar.'
              >
                <EntradaTexto
                  value={porCaixa}
                  onChangeText={(t) => setPorCaixa(t.replace(/[^0-9]/g, ""))}
                  placeholder="30"
                  inputMode="numeric"
                  accessibilityLabel="Quantos comprimidos vêm na caixa"
                />
              </Campo>
            </>
          ) : null}

          {erro ? <Text style={e.erro}>{erro}</Text> : null}

          <Botao
            titulo="Salvar"
            icone="check-bold"
            onPress={() => void salvar()}
            style={e.salvar}
          />

          {remedioId !== null ? (
            <Botao
              titulo={confirmandoApagar ? "Tem certeza? Apagar" : "Apagar"}
              tom={confirmandoApagar ? "perigo" : "secundario"}
              icone="trash-can-outline"
              onPress={() =>
                confirmandoApagar ? void apagar() : setConfirmandoApagar(true)
              }
              style={e.espacoAcima}
            />
          ) : null}

          {confirmandoApagar ? (
            <Text style={e.avisoApagar}>
              Apagar remove também o histórico deste remédio. Para só parar de
              tomar, volte e desligue ele na lista.
            </Text>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const e = StyleSheet.create({
  tela: { flex: 1, backgroundColor: cores.fundo },
  flex: { flex: 1 },
  conteudo: {
    paddingHorizontal: espaco.lg,
    paddingTop: espaco.md,
    paddingBottom: espaco.xxl * 3,
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

  foto: {
    marginTop: espaco.md,
    width: "100%",
    height: 180,
    borderRadius: raio.cartao,
    backgroundColor: cores.cartao,
    borderWidth: 2,
    borderColor: cores.borda,
  },

  linhaBotoes: { flexDirection: "row", gap: espaco.md, marginTop: espaco.md },
  espacoAcima: { marginTop: espaco.md },

  pastilhas: {
    marginTop: espaco.md,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: espaco.md,
  },

  linhaSwitch: {
    marginTop: espaco.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: TOQUE,
    borderWidth: 2,
    borderColor: cores.borda,
    borderRadius: raio.cartao,
    backgroundColor: cores.cartao,
    paddingHorizontal: espaco.lg,
  },
  switchTexto: { fontSize: texto.corpo, fontWeight: "700", color: cores.tinta },

  erro: {
    marginTop: espaco.xl,
    fontSize: texto.corpo,
    fontWeight: "700",
    color: cores.alerta,
  },
  salvar: { marginTop: espaco.xxl },
  avisoApagar: {
    marginTop: espaco.md,
    fontSize: texto.pequeno,
    color: cores.tintaFraca,
  },
});
