/**
 * Conta de estoque de remédio.
 *
 * Tudo aqui é função pura sobre números — sem banco, sem data do sistema — para
 * poder ser conferida sozinha. A conta é simples, mas errar para menos significa
 * ela ficar sem remédio, então vale ter isso isolado e testável.
 */

/** O que o cálculo precisa saber sobre um remédio. */
export type EstoqueDeRemedio = {
  /** Comprimidos restantes. Null = este remédio não tem controle de estoque. */
  estoqueComprimidos: number | null;
  /** Comprimidos por dose. */
  quantidade: number;
  /** Quantas vezes por dia ela toma. */
  dosesPorDia: number;
  /** Avisar quando restarem menos dias que isto. */
  avisarComDiasRestantes: number;
};

/** Quantos comprimidos este remédio consome por dia. */
export function consumoDiario(r: EstoqueDeRemedio): number {
  return r.quantidade * r.dosesPorDia;
}

/**
 * Para quantos dias inteiros ainda dá.
 *
 * Arredonda para BAIXO de propósito. Com 5 comprimidos e consumo de 2 por dia
 * dá para 2 dias e meio — mas o terceiro dia começa e falta comprimido, então
 * a resposta honesta é 2.
 *
 * Devolve `null` quando não há como saber: sem estoque cadastrado, ou remédio
 * sem horário nenhum (consumo zero duraria para sempre, e "infinito" não é
 * resposta útil para quem vai decidir se compra).
 */
export function diasRestantes(r: EstoqueDeRemedio): number | null {
  if (r.estoqueComprimidos === null) return null;
  const porDia = consumoDiario(r);
  if (porDia <= 0) return null;
  return Math.floor(r.estoqueComprimidos / porDia);
}

/**
 * Está na hora de avisar o cuidador?
 *
 * `jaAvisado` vem de `Remedio.estoqueAvisadoEm` e é o que impede o cron de
 * repetir o mesmo aviso todo dia até ele comprar. O aviso volta a valer
 * sozinho quando ele repõe, porque a reposição zera aquele campo.
 */
export function precisaAvisar(
  r: EstoqueDeRemedio,
  jaAvisado: boolean,
): boolean {
  if (jaAvisado) return false;
  const dias = diasRestantes(r);
  if (dias === null) return false;
  return dias <= r.avisarComDiasRestantes;
}

/**
 * Em que dia o remédio acaba, dado o dia de hoje.
 * "Acaba dia 3 de setembro" move alguém a ir à farmácia; "restam 7 dias" não.
 */
export function diaQueAcaba(r: EstoqueDeRemedio, hoje: Date): Date | null {
  const dias = diasRestantes(r);
  if (dias === null) return null;
  const fim = new Date(hoje);
  fim.setDate(fim.getDate() + dias);
  return fim;
}

/** Como converter "comprei 2 caixas" em comprimidos. */
export function comprimidosDeCaixas(
  caixas: number,
  comprimidosPorCaixa: number | null,
): number | null {
  if (comprimidosPorCaixa === null || comprimidosPorCaixa <= 0) return null;
  return caixas * comprimidosPorCaixa;
}

/** Frase pronta para o painel do cuidador. */
export function textoDoEstoque(r: EstoqueDeRemedio): string {
  if (r.estoqueComprimidos === null) return "Sem controle de estoque";

  const dias = diasRestantes(r);
  const restam =
    r.estoqueComprimidos === 1
      ? "1 comprimido"
      : `${r.estoqueComprimidos.toLocaleString("pt-BR", {
          maximumFractionDigits: 2,
        })} comprimidos`;

  if (dias === null) return restam;
  if (dias === 0) return `${restam} — acaba hoje`;
  if (dias === 1) return `${restam} — dá para mais 1 dia`;
  return `${restam} — dá para mais ${dias} dias`;
}

/**
 * O que a tela dela precisa saber sobre um remédio que está acabando.
 * Menos que `EstoqueDeRemedio` de propósito: a tela não faz conta, ela só
 * mostra o resultado.
 */
export type RemedioAcabando = {
  id: string;
  nome: string;
  diasRestantes: number;
  /** Quanto o botão "já comprei" vai somar. Null = não sabemos o tamanho da caixa. */
  comprimidosPorCaixa: number | null;
};

/**
 * Dados falsos de estoque, para desenhar a tela. Some quando o banco entrar.
 */
export function acabandoDeExemplo(): RemedioAcabando[] {
  return [
    {
      id: "1",
      nome: "Losartana Potássica 50mg",
      diasRestantes: 5,
      comprimidosPorCaixa: 30,
    },
  ];
}
