/**
 * Design system — "Remédio em Dia"
 *
 * Portado do globals.css da versão web. As razões continuam as mesmas, e vale
 * repetir porque em React Native não existe folha de estilo para documentá-las:
 *
 *  - SÓ modo claro. Alternar tema é um botão a mais para errar, e texto claro
 *    sobre fundo escuro perde legibilidade com catarata/presbiopia.
 *  - Tipografia grande de verdade: o "corpo" aqui é 25, não 16.
 *  - Alvo de toque de 72. A recomendação da WCAG é 44; para mão trêmula
 *    isso é pouco.
 *  - Estado NUNCA depende só de cor. Cada um tem ícone e palavra própria —
 *    cerca de 8% dos homens têm daltonismo, e a idade degrada a percepção de
 *    cor mesmo em quem enxerga bem.
 *
 * Sobre escala de fonte: os componentes NÃO passam `allowFontScaling={false}`.
 * Se ela aumentar a fonte nas configurações do Android, o app precisa
 * acompanhar — é exatamente o público que mexe nesse ajuste.
 */

export const cores = {
  // Superfícies
  fundo: "#f5f5f4",
  cartao: "#ffffff",
  borda: "#d6d3d1",

  // Texto
  tinta: "#1c1917", // 16.1:1 no branco
  tintaFraca: "#57534e", // 7.4:1 no branco

  // Estado: ainda vai tomar
  espera: "#44403c",
  esperaFundo: "#f5f5f4",
  esperaBorda: "#d6d3d1",

  // Estado: está na hora / passou da hora
  agora: "#b45309", // 4.9:1 no fundo âmbar claro
  agoraFundo: "#fffbeb",
  agoraBorda: "#f59e0b",

  // Estado: já tomou
  feito: "#15803d", // 5.1:1 no fundo verde claro
  feitoFundo: "#f0fdf4",
  feitoBorda: "#4ade80",

  // Alerta
  alerta: "#b91c1c",
  alertaFundo: "#fef2f2",

  branco: "#ffffff",
} as const;

/**
 * Escala tipográfica. Números absolutos, não múltiplos de um "base" —
 * na web havia um root de 20px para escalar tudo junto; aqui cada valor é
 * explícito para não haver dúvida sobre o tamanho real na tela.
 */
export const texto = {
  pequeno: 20, // rótulos secundários
  corpo: 25, // texto normal
  grande: 30, // nome de remédio em cartão secundário
  maior: 37, // nome de remédio na dose da vez
  hora: 45, // a hora, e o título da tela
} as const;

export const espaco = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
} as const;

export const raio = {
  cartao: 16,
  botao: 16,
} as const;

/** Altura mínima de qualquer coisa que se toca. */
export const TOQUE = 72;

/** Mínimo da WCAG, para ações secundárias que não merecem os 72. */
export const TOQUE_MINIMO = 48;
