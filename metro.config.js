// Learn more https://docs.expo.io/guides/customizing-metro
const { getDefaultConfig } = require("expo/metro-config");

/**
 * Configuração do Metro.
 *
 * Tudo aqui existe por causa de UM alvo: rodar o app no navegador para
 * conferir a aparência das telas sem precisar de celular na mão. No Android
 * nada disto é necessário — o SQLite lá é nativo.
 *
 * No navegador o expo-sqlite roda o SQLite compilado para WebAssembly, dentro
 * de um Web Worker, e isso cobra dois preços:
 *
 *  1. O Metro precisa saber que `.wasm` é um asset. Sem isso ele tenta
 *     interpretar o binário como JavaScript e falha em resolvê-lo.
 *
 *  2. O worker guarda o banco no OPFS (o sistema de arquivos privado do
 *     navegador) e usa SharedArrayBuffer para coordenar. SharedArrayBuffer só
 *     existe em página "cross-origin isolated", que é o que os cabeçalhos
 *     COOP/COEP abaixo ligam.
 */
const config = getDefaultConfig(__dirname);

config.resolver.assetExts.push("wasm");

config.server.enhanceMiddleware = (middleware) => {
  return (req, res, next) => {
    res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
    res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
    // Sem isto, os próprios assets do Metro passam a ser bloqueados pela
    // política que acabamos de ligar — o isolamento vale para tudo que a
    // página carrega, inclusive o bundle.
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    return middleware(req, res, next);
  };
};

module.exports = config;
