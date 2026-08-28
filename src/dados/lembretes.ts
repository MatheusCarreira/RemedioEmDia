import type { SQLiteDatabase } from "expo-sqlite";
import { gerarDosesDoDia, instanteDoDia } from "./remedios";

/**
 * Acesso ao banco para os lembretes de uma dose.
 *
 * Camada de dados pura: nada aqui fala com o Android. Quem agenda e cancela
 * notificação é `src/alarme/lembretes.ts`, que usa estas funções. A separação
 * importa porque este módulo roda também dentro da tarefa de fundo, num
 * contexto sem tela.
 */

export type TipoLembrete = "REPETICAO" | "ADIAMENTO";

/** Quanto tempo depois do horário o app insiste, se ela não marcou. */
export const MINUTOS_PARA_REPETIR = 30;

/** O que o botão "LEMBRAR EM 15 MIN" promete. */
export const MINUTOS_PARA_ADIAR = 15;

export const emMinutos = (base: Date, minutos: number): Date =>
  new Date(base.getTime() + minutos * 60_000);

export type Lembrete = {
  id: number;
  doseId: number;
  tipo: TipoLembrete;
  previstoPara: Date;
  notificacaoId: string | null;
};

/** Tudo que um lembrete precisa para se descrever na tela bloqueada. */
export type DoseParaLembrar = {
  doseId: number;
  remedioId: number;
  nome: string;
  quantidade: number;
  observacao: string | null;
  previstoPara: Date;
  pendente: boolean;
};

const SELECT_DOSE = `
  SELECT d.id        AS dose_id,
         d.remedio_id,
         d.previsto_para,
         d.status,
         r.nome,
         r.quantidade,
         r.observacao
    FROM doses d
    JOIN remedios r ON r.id = d.remedio_id
`;

type LinhaDose = {
  dose_id: number;
  remedio_id: number;
  previsto_para: string;
  status: string;
  nome: string;
  quantidade: number;
  observacao: string | null;
};

const paraDose = (l: LinhaDose): DoseParaLembrar => ({
  doseId: l.dose_id,
  remedioId: l.remedio_id,
  nome: l.nome,
  quantidade: l.quantidade,
  observacao: l.observacao,
  previstoPara: new Date(l.previsto_para),
  pendente: l.status === "PENDENTE",
});

/**
 * Descobre a qual dose um alarme se refere.
 *
 * O alarme diário do Android não sabe em que dia está: ele carrega o remédio e
 * o horário, e o dia sai daqui. Normalmente é o dia de hoje — mas se o alarme
 * for das 23:50 e ela tocar o botão às 00:10, "hoje" já virou. Por isso a
 * escolha é pelo instante MAIS PRÓXIMO de agora, e não pela data do relógio:
 * meia-noite deixa de ser um caso especial.
 */
export async function doseDoAlarme(
  bd: SQLiteDatabase,
  remedioId: number,
  minutosDoDia: number,
  agora: Date,
): Promise<DoseParaLembrar | null> {
  const alvo = instanteDoDia(agora, minutosDoDia);
  const DOZE_HORAS = 12 * 60 * 60 * 1000;
  const distancia = alvo.getTime() - agora.getTime();
  if (distancia > DOZE_HORAS) alvo.setDate(alvo.getDate() - 1);
  else if (distancia < -DOZE_HORAS) alvo.setDate(alvo.getDate() + 1);

  const linha = await bd.getFirstAsync<LinhaDose>(
    `${SELECT_DOSE} WHERE d.remedio_id = ? AND d.previsto_para = ?`,
    remedioId,
    alvo.toISOString(),
  );
  return linha ? paraDose(linha) : null;
}

/** Uma dose pelo id, com o remédio junto. */
export async function doseParaLembrar(
  bd: SQLiteDatabase,
  doseId: number,
): Promise<DoseParaLembrar | null> {
  const linha = await bd.getFirstAsync<LinhaDose>(
    `${SELECT_DOSE} WHERE d.id = ?`,
    doseId,
  );
  return linha ? paraDose(linha) : null;
}

/** As doses ainda não marcadas de um dia, da mais cedo para a mais tarde. */
export async function dosesPendentesDoDia(
  bd: SQLiteDatabase,
  dia: Date,
): Promise<DoseParaLembrar[]> {
  const linhas = await bd.getAllAsync<LinhaDose>(
    `${SELECT_DOSE}
      WHERE d.status = 'PENDENTE' AND d.previsto_para BETWEEN ? AND ?
      ORDER BY d.previsto_para`,
    instanteDoDia(dia, 0).toISOString(),
    instanteDoDia(dia, 1439).toISOString(),
  );
  return linhas.map(paraDose);
}

// ---------------------------------------------------------------------------
// Lembretes
// ---------------------------------------------------------------------------

const paraLembrete = (l: {
  id: number;
  dose_id: number;
  tipo: string;
  previsto_para: string;
  notificacao_id: string | null;
}): Lembrete => ({
  id: l.id,
  doseId: l.dose_id,
  tipo: l.tipo as TipoLembrete,
  previstoPara: new Date(l.previsto_para),
  notificacaoId: l.notificacao_id,
});

/** O lembrete de um tipo para uma dose, se existir. */
export async function lembreteDaDose(
  bd: SQLiteDatabase,
  doseId: number,
  tipo: TipoLembrete,
): Promise<Lembrete | null> {
  const l = await bd.getFirstAsync<Parameters<typeof paraLembrete>[0]>(
    `SELECT * FROM lembretes WHERE dose_id = ? AND tipo = ?`,
    doseId,
    tipo,
  );
  return l ? paraLembrete(l) : null;
}

/** Todos os lembretes de uma dose. */
export async function lembretesDaDose(
  bd: SQLiteDatabase,
  doseId: number,
): Promise<Lembrete[]> {
  const linhas = await bd.getAllAsync<Parameters<typeof paraLembrete>[0]>(
    `SELECT * FROM lembretes WHERE dose_id = ?`,
    doseId,
  );
  return linhas.map(paraLembrete);
}

/**
 * Grava (ou substitui) o lembrete de um tipo para uma dose.
 *
 * `ON CONFLICT` em vez de DELETE + INSERT porque o UNIQUE (dose_id, tipo) é a
 * garantia de que dois processos tratando o mesmo toque não criem duas linhas.
 */
export async function guardarLembrete(
  bd: SQLiteDatabase,
  doseId: number,
  tipo: TipoLembrete,
  previstoPara: Date,
  notificacaoId: string | null,
): Promise<void> {
  await bd.runAsync(
    `INSERT INTO lembretes (dose_id, tipo, previsto_para, notificacao_id, criado_em)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (dose_id, tipo) DO UPDATE
       SET previsto_para = excluded.previsto_para,
           notificacao_id = excluded.notificacao_id`,
    doseId,
    tipo,
    previstoPara.toISOString(),
    notificacaoId,
    new Date().toISOString(),
  );
}

/** Esquece os lembretes de uma dose. Devolve o que foi apagado. */
export async function apagarLembretesDaDose(
  bd: SQLiteDatabase,
  doseId: number,
): Promise<Lembrete[]> {
  const antes = await lembretesDaDose(bd, doseId);
  await bd.runAsync(`DELETE FROM lembretes WHERE dose_id = ?`, doseId);
  return antes;
}

/**
 * Os lembretes que ainda fazem sentido: hora no futuro e dose ainda pendente.
 *
 * É a partir daqui que a reconciliação reconstrói os agendamentos depois de
 * cancelar tudo.
 */
export async function lembretesAindaValidos(
  bd: SQLiteDatabase,
  agora: Date,
): Promise<Array<{ lembrete: Lembrete; dose: DoseParaLembrar }>> {
  // Cada coluna é nomeada uma a uma, sem `l.*`: as duas tabelas têm
  // `previsto_para` e um `SELECT *` faria a hora do lembrete sobrescrever a
  // hora da dose em silêncio.
  const linhas = await bd.getAllAsync<{
    lembrete_id: number;
    tipo: string;
    lembrete_previsto: string;
    notificacao_id: string | null;
    dose_id: number;
    remedio_id: number;
    dose_previsto: string;
    status: string;
    nome: string;
    quantidade: number;
    observacao: string | null;
  }>(
    `SELECT l.id            AS lembrete_id,
            l.tipo          AS tipo,
            l.previsto_para AS lembrete_previsto,
            l.notificacao_id,
            d.id            AS dose_id,
            d.remedio_id,
            d.previsto_para AS dose_previsto,
            d.status,
            r.nome, r.quantidade, r.observacao
       FROM lembretes l
       JOIN doses d    ON d.id = l.dose_id
       JOIN remedios r ON r.id = d.remedio_id
      WHERE d.status = 'PENDENTE' AND l.previsto_para > ?
      ORDER BY l.previsto_para`,
    agora.toISOString(),
  );

  return linhas.map((l) => ({
    lembrete: {
      id: l.lembrete_id,
      doseId: l.dose_id,
      tipo: l.tipo as TipoLembrete,
      previstoPara: new Date(l.lembrete_previsto),
      notificacaoId: l.notificacao_id,
    },
    dose: paraDose({
      dose_id: l.dose_id,
      remedio_id: l.remedio_id,
      previsto_para: l.dose_previsto,
      status: l.status,
      nome: l.nome,
      quantidade: l.quantidade,
      observacao: l.observacao,
    }),
  }));
}

/**
 * Escreve na tabela a intenção de repetir cada dose pendente do dia.
 *
 * Só grava a intenção; quem agenda de fato no Android é
 * `src/alarme/lembretes.ts`. Separar as duas metades é o que deixa a
 * reconciliação cancelar tudo no Android e reconstruir depois sem perder o que
 * já tinha sido decidido — e é o que permite conferir esta regra fora do
 * aparelho.
 *
 * Devolve quantas repetições ficaram planejadas.
 */
export async function planejarRepeticoesDoDia(
  bd: SQLiteDatabase,
  dia: Date,
  agora: Date,
): Promise<number> {
  const doses = await dosesPendentesDoDia(bd, dia);
  let quantas = 0;

  for (const dose of doses) {
    const quando = emMinutos(dose.previstoPara, MINUTOS_PARA_REPETIR);
    // Dose cujo horário de repetição já passou não ganha lembrete: ela abriu o
    // app depois, e a tela já está mostrando aquela dose como atrasada. Um
    // aviso que chega atrasado sobre algo que a tela já mostra é só barulho.
    if (quando.getTime() <= agora.getTime()) continue;

    await guardarLembrete(bd, dose.doseId, "REPETICAO", quando, null);
    quantas += 1;
  }

  return quantas;
}

/**
 * Por quantos dias à frente as repetições são preparadas.
 *
 * DOIS, e não um, por um motivo concreto: a repetição de uma dose só existe se
 * alguma coisa tiver rodado antes dela. Se o horizonte fosse só "hoje", a
 * PRIMEIRA dose de cada dia nunca teria repetição — nada teria rodado ainda
 * naquele dia — e justamente a dose da manhã é a mais fácil de esquecer.
 *
 * Preparando amanhã junto, um dia inteiro sem tocar no aplicativo não desliga a
 * repetição. Dois dias inteiros sem tocar em nada desligam: as repetições
 * param, e só o alarme principal continua tocando. É uma degradação, não uma
 * falha — e o horizonte volta a andar assim que ela abrir o aplicativo ou tocar
 * um botão da notificação.
 */
export const DIAS_COM_REPETICAO = 2;

/**
 * Prepara as doses e as repetições do horizonte inteiro.
 *
 * Gera as doses de cada dia antes de planejar: a repetição precisa de uma linha
 * de dose para apontar, e a dose de amanhã ainda não existe.
 */
export async function planejarRepeticoes(
  bd: SQLiteDatabase,
  agora: Date,
): Promise<number> {
  let quantas = 0;

  for (let i = 0; i < DIAS_COM_REPETICAO; i += 1) {
    const dia = new Date(agora);
    dia.setDate(dia.getDate() + i);
    await gerarDosesDoDia(bd, dia);
    quantas += await planejarRepeticoesDoDia(bd, dia, agora);
  }

  return quantas;
}

/**
 * O mesmo toque chegando duas vezes, ou dois pedidos de verdade?
 *
 * O botão "lembrar em 15 min" pode ser processado duas vezes para um único
 * toque — pela tarefa de fundo e depois pelo ouvinte da tela. Dois pedidos com
 * menos de um minuto de diferença não existem na vida real: ela teria que
 * tocar duas vezes no mesmo botão de duas notificações diferentes dentro do
 * mesmo minuto. Diferença maior é um adiamento novo, e aí vale substituir.
 */
export function ehOMesmoPedido(
  existente: Lembrete | null,
  quando: Date,
): boolean {
  if (!existente) return false;
  return Math.abs(existente.previstoPara.getTime() - quando.getTime()) < 60_000;
}

/**
 * Apaga lembretes de doses que já passaram do dia.
 *
 * Sem isso a tabela cresceria para sempre. Roda na reconciliação diária.
 */
export async function limparLembretesVelhos(
  bd: SQLiteDatabase,
  agora: Date,
): Promise<void> {
  const limite = new Date(agora);
  limite.setDate(limite.getDate() - 2);
  await bd.runAsync(
    `DELETE FROM lembretes WHERE previsto_para < ?`,
    limite.toISOString(),
  );
}
