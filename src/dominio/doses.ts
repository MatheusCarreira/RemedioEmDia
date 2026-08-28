/**
 * Uma "dose" é uma ocorrência: este remédio, neste horário, neste dia.
 * O cadastro guarda a regra ("Losartana, 1 comprimido, 08:00 todo dia") e o
 * app materializa uma dose por dia a partir dela — é isso que permite saber
 * que ela tomou o de terça e não tomou o de quarta.
 */
export type Dose = {
  id: string;
  remedio: string;
  /** Quantos comprimidos tomar nesta dose. Aceita meio (0.5). */
  quantidade: number;
  /** Texto curto e opcional: "depois do almoço", "com bastante água". */
  observacao?: string;
  previstoPara: Date;
  tomadoEm?: Date;
  /** Caminho da foto da caixa, quando houver. */
  fotoUri?: string;
};

export type EstadoDose = "espera" | "agora" | "passou" | "feito";

/** Minutos antes do horário em que o cartão já acende como "está na hora". */
const JANELA_ANTES = 15;

/**
 * Minutos depois do horário em que a dose deixa de ser "está na hora" e passa
 * a ser "passou da hora".
 *
 * Este estado não existia, e a falta dele era um defeito sério: sem ele, uma
 * dose das 8h continuava dizendo "ESTÁ NA HORA" às 21h. Além de mentir, isso
 * colocava um botão grande e âmbar em toda dose esquecida do dia — e âmbar,
 * neste app, significa "aja agora". Empurrava ela a tomar remédio da manhã à
 * noite.
 *
 * Uma hora é uma escolha conservadora, não uma regra médica. O app não sabe
 * (nem deve fingir que sabe) se um remédio específico ainda pode ser tomado
 * com atraso — por isso o estado "passou" não manda tomar NEM manda pular:
 * ele só relata o que aconteceu e deixa a decisão com ela.
 */
const JANELA_DEPOIS = 60;

export function estadoDaDose(dose: Dose, agora: Date): EstadoDose {
  if (dose.tomadoEm) return "feito";

  const previsto = dose.previstoPara.getTime();
  const abre = previsto - JANELA_ANTES * 60_000;
  const fecha = previsto + JANELA_DEPOIS * 60_000;
  const t = agora.getTime();

  if (t < abre) return "espera";
  if (t <= fecha) return "agora";
  return "passou";
}

/**
 * Escreve a dose por extenso.
 *
 * "0,5 comprimidos" está tecnicamente certo e é péssimo de ler — receita de
 * idoso fala "meio comprimido", e é assim que ela vai conferir contra a
 * caixinha. Meio e um e meio são os únicos casos fracionários que aparecem na
 * prática; o resto cai no formato numérico.
 */
export function textoDaQuantidade(quantidade: number): string {
  if (quantidade === 0.5) return "Meio comprimido";
  if (quantidade === 1) return "1 comprimido";
  if (quantidade === 1.5) return "1 comprimido e meio";

  const inteiro = Number.isInteger(quantidade);
  const texto = inteiro
    ? String(quantidade)
    : quantidade.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
  return `${texto} comprimidos`;
}

/**
 * A data por extenso, com só a primeira letra maiúscula.
 *
 * `text-transform: capitalize` do CSS não serve aqui: ele vira
 * "Quinta-Feira, 27 De Agosto". O português capitaliza a primeira letra da
 * frase e mais nada.
 */
export function dataPorExtenso(data: Date): string {
  const texto = data.toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/**
 * Dados falsos só para desenhar a tela. Some quando o banco entrar.
 * Os horários são relativos à hora atual de propósito: assim dá para ver os
 * três estados na tela a qualquer momento do dia, em vez de depender de
 * abrir o app às 8 da manhã.
 */
export function dosesDeExemplo(agora: Date): Dose[] {
  const emMinutos = (m: number) => new Date(agora.getTime() + m * 60_000);
  return [
    {
      id: "1",
      remedio: "Losartana Potássica 50mg",
      quantidade: 1,
      observacao: "Com um copo de água cheio.",
      previstoPara: emMinutos(-240),
      tomadoEm: emMinutos(-235),
    },
    {
      id: "2",
      remedio: "Cloridrato de Metformina 850mg",
      quantidade: 2,
      observacao: "Depois do almoço.",
      previstoPara: emMinutos(-20),
    },
    {
      id: "3",
      remedio: "Hidroclorotiazida 25mg",
      quantidade: 0.5,
      previstoPara: emMinutos(180),
    },
    {
      id: "4",
      remedio: "Omeprazol 20mg",
      quantidade: 1,
      observacao: "Em jejum, antes de dormir.",
      previstoPara: emMinutos(420),
    },
  ];
}
