import { Directory, File, Paths } from "expo-file-system";
import * as ImagePicker from "expo-image-picker";

/**
 * Foto da caixa do remédio.
 *
 * Por que isso existe: o app escreve o nome técnico ("Cloridrato de Metformina
 * 850mg") e a caixa dela diz outro ("Glifage"). Confundir genérico com nome
 * comercial é um erro clássico — e perigoso — em idoso, e tamanho de fonte
 * nenhum resolve. Com a foto, ela compara imagem com imagem em vez de ler nome
 * químico.
 *
 * O arquivo vai para o diretório de documentos do app, não para o cache: o
 * sistema apaga cache quando o armazenamento aperta, e a foto sumir deixaria
 * o cartão sem a referência visual justamente num celular cheio.
 */

const PASTA = "fotos";

function pasta(): Directory {
  const dir = new Directory(Paths.document, PASTA);
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  return dir;
}

/**
 * Abre a câmera. Devolve o caminho definitivo da foto, ou null se ela desistiu.
 *
 * `allowsEditing` deixa ela enquadrar a caixa. Vale a etapa extra: foto de
 * caixa tirada de longe, com a mesa toda em volta, não ajuda a reconhecer nada
 * num cartão pequeno.
 */
export async function tirarFotoDaCaixa(): Promise<string | null> {
  const permissao = await ImagePicker.requestCameraPermissionsAsync();
  if (!permissao.granted) return null;

  const r = await ImagePicker.launchCameraAsync({
    mediaTypes: ["images"],
    allowsEditing: true,
    aspect: [4, 3],
    // 0.6 é suficiente para reconhecer uma caixa e mantém o arquivo pequeno.
    // Qualidade máxima geraria vários megabytes por remédio, sem ganho nenhum
    // para o uso real.
    quality: 0.6,
  });
  if (r.canceled || !r.assets[0]) return null;

  return guardar(r.assets[0].uri);
}

/** Escolhe uma foto que já está na galeria. */
export async function escolherFotoDaGaleria(): Promise<string | null> {
  const permissao = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permissao.granted) return null;

  const r = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsEditing: true,
    aspect: [4, 3],
    quality: 0.6,
  });
  if (r.canceled || !r.assets[0]) return null;

  return guardar(r.assets[0].uri);
}

/**
 * Copia o arquivo temporário do seletor para um lugar permanente.
 *
 * A cópia é obrigatória: o que a câmera devolve vive no cache e some sem aviso.
 * Guardar aquele caminho no banco daria um cartão com foto quebrada semanas
 * depois — o pior tipo de defeito, porque aparece tarde e sem causa visível.
 */
async function guardar(uriTemporaria: string): Promise<string | null> {
  try {
    const origem = new File(uriTemporaria);
    if (!origem.exists) return null;

    const extensao = (uriTemporaria.split("?")[0]?.split(".").pop() ?? "jpg")
      .toLowerCase()
      .slice(0, 5);
    const destino = new File(pasta(), `remedio-${Date.now()}.${extensao}`);

    origem.copy(destino);
    return destino.uri;
  } catch {
    // Falhar aqui não pode impedir o cadastro: o remédio é essencial, a foto
    // é ajuda. Devolve null e o formulário segue sem imagem.
    return null;
  }
}

/** Apaga uma foto que não é mais usada. Silencioso se o arquivo já sumiu. */
export function apagarFoto(uri: string | null): void {
  if (!uri) return;
  try {
    const arquivo = new File(uri);
    if (arquivo.exists) arquivo.delete();
  } catch {
    // Arquivo órfão ocupa alguns kilobytes. Não vale derrubar nada por isso.
  }
}
