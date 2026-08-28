// O codigo do app importa sem extensao ("./remedios"), que e o que o Metro
// espera. O Node, rodando os conferidores direto do TypeScript, exige a
// extensao. Este gancho tenta ".ts" antes de desistir.
export async function resolve(especificador, contexto, seguinte) {
  if (especificador.startsWith(".") && !/\.[cm]?[jt]sx?$/i.test(especificador)) {
    try {
      return await seguinte(`${especificador}.ts`, contexto);
    } catch {
      // Nao era um modulo TypeScript. Segue o caminho normal.
    }
  }
  return seguinte(especificador, contexto);
}
