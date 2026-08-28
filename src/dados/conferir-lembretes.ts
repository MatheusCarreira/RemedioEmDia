/**
 * Confere as migrações e a regra dos lembretes:  npm run lembretes:conferir
 *
 * Não é suíte de teste, é um script — o projeto ainda não tem runner. Existe
 * porque tudo que este arquivo confere só aconteceria, sem ele, no celular
 * dela: uma migração com erro de SQL derruba o app na primeira abertura depois
 * da atualização, e um lembrete duplicado toca duas vezes de madrugada.
 *
 * Roda com o SQLite embutido do Node, não com o do aparelho. É o mesmo SQLite,
 * e o que se confere aqui — SQL, restrições, contas de horário — não depende de
 * qual dos dois está por baixo. O que NÃO dá para conferir aqui é a metade que
 * fala com o Android: se a notificação toca, se o botão aparece, se a tarefa de
 * fundo acorda. Isso só no aparelho.
 *
 * Este arquivo nunca é importado pelo app. O `node:sqlite` aqui dentro não
 * chega no bundle porque nada em `App.tsx` alcança este módulo.
 */
import { DatabaseSync } from "node:sqlite";
import type { SQLiteDatabase } from "expo-sqlite";
import { migrar } from "./esquema";
import {
  apagarLembretesDaDose,
  doseDoAlarme,
  dosesPendentesDoDia,
  ehOMesmoPedido,
  emMinutos,
  guardarLembrete,
  lembreteDaDose,
  lembretesAindaValidos,
  limparLembretesVelhos,
  planejarRepeticoes,
  planejarRepeticoesDoDia,
  DIAS_COM_REPETICAO,
  MINUTOS_PARA_REPETIR,
} from "./lembretes";
import {
  definirAtivo,
  gerarDosesDoDia,
  instanteDoDia,
  marcarTomada,
  salvarRemedio,
} from "./remedios";

// ---------------------------------------------------------------------------
// Adaptador: o `node:sqlite` vestido com a cara do expo-sqlite
// ---------------------------------------------------------------------------

function abrirEmMemoria(): SQLiteDatabase {
  const bd = new DatabaseSync(":memory:");
  bd.exec("PRAGMA foreign_keys = ON;");

  const adaptador = {
    async execAsync(sql: string) {
      bd.exec(sql);
    },
    async getFirstAsync<T>(sql: string, ...p: unknown[]) {
      return (bd.prepare(sql).get(...(p as never[])) as T) ?? null;
    },
    async getAllAsync<T>(sql: string, ...p: unknown[]) {
      return bd.prepare(sql).all(...(p as never[])) as T[];
    },
    async runAsync(sql: string, ...p: unknown[]) {
      const r = bd.prepare(sql).run(...(p as never[]));
      return {
        changes: Number(r.changes),
        lastInsertRowId: Number(r.lastInsertRowid),
      };
    },
    async withTransactionAsync(tarefa: () => Promise<void>) {
      bd.exec("BEGIN");
      try {
        await tarefa();
        bd.exec("COMMIT");
      } catch (e) {
        bd.exec("ROLLBACK");
        throw e;
      }
    },
  };

  return adaptador as unknown as SQLiteDatabase;
}

// ---------------------------------------------------------------------------

let falhas = 0;

function conferir(nome: string, condicao: boolean, detalhe = "") {
  if (!condicao) falhas += 1;
  console.log(
    `${condicao ? "ok   " : "FALHA"} ${nome}${detalhe ? `  (${detalhe})` : ""}`,
  );
}

const HOJE = new Date(2026, 7, 28); // 28 de agosto de 2026, meia-noite local
const as = (h: number, m = 0) => {
  const d = new Date(HOJE);
  d.setHours(h, m, 0, 0);
  return d;
};

/** Um banco novo, migrado, com um remédio de duas doses por dia. */
async function bancoDeTeste(horarios = [8 * 60, 20 * 60]) {
  const bd = abrirEmMemoria();
  await migrar(bd);
  const id = await salvarRemedio(
    bd,
    {
      nome: "Losartana 50mg",
      quantidade: 1,
      observacao: null,
      fotoUri: null,
      ativo: true,
      inicioEm: "2026-08-01",
      fimEm: null,
      estoqueComprimidos: 30,
      comprimidosPorCaixa: 30,
      horarios,
    },
    HOJE,
  );
  await gerarDosesDoDia(bd, HOJE);
  return { bd, remedioId: id };
}

async function principal() {
  // -------------------------------------------------------------------------
  console.log("\n-- migrações --");
  {
    const bd = abrirEmMemoria();
    await migrar(bd);
    const v = await bd.getFirstAsync<{ user_version: number }>(
      "PRAGMA user_version;",
    );
    conferir("migra do zero até a versão 3", v?.user_version === 3);

    const tabelas = await bd.getAllAsync<{ name: string }>(
      `SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`,
    );
    const nomes = tabelas.map((t) => t.name);
    conferir(
      "todas as tabelas existem",
      ["config", "doses", "horarios", "lembretes", "movimentos_estoque", "remedios"]
        .every((t) => nomes.includes(t)),
      nomes.join(", "),
    );

    // Rodar de novo não pode fazer nada: é o que acontece a cada abertura.
    await migrar(bd);
    const v2 = await bd.getFirstAsync<{ user_version: number }>(
      "PRAGMA user_version;",
    );
    conferir("migrar de novo é inofensivo", v2?.user_version === 3);
  }

  // -------------------------------------------------------------------------
  console.log("\n-- repetição automática --");
  {
    const { bd } = await bancoDeTeste();
    const doses = await dosesPendentesDoDia(bd, HOJE);
    conferir("o dia tem duas doses pendentes", doses.length === 2);

    const quantas = await planejarRepeticoesDoDia(bd, HOJE, as(7));
    conferir("às 07:00 planeja repetição para as duas", quantas === 2);

    const linhas = await bd.getAllAsync<{ previsto_para: string; tipo: string }>(
      `SELECT tipo, previsto_para FROM lembretes ORDER BY previsto_para`,
    );
    const horas = linhas.map((l) =>
      new Date(l.previsto_para).toTimeString().slice(0, 5),
    );
    conferir(
      `repete ${MINUTOS_PARA_REPETIR} min depois de cada dose`,
      horas.join(" ") === "08:30 20:30",
      horas.join(" "),
    );

    // A reconciliação roda de novo sempre que ela mexe no cadastro.
    await planejarRepeticoesDoDia(bd, HOJE, as(7));
    const total = await bd.getFirstAsync<{ n: number }>(
      `SELECT COUNT(*) AS n FROM lembretes`,
    );
    conferir("planejar duas vezes não duplica", total?.n === 2, `n=${total?.n}`);
  }

  {
    const { bd } = await bancoDeTeste();
    const quantas = await planejarRepeticoesDoDia(bd, HOJE, as(12));
    conferir(
      "às 12:00 não repete a dose das 08:00, que já passou",
      quantas === 1,
      `planejadas=${quantas}`,
    );
  }

  // -------------------------------------------------------------------------
  console.log("\n-- marcar apaga o lembrete --");
  {
    const { bd } = await bancoDeTeste();
    await planejarRepeticoesDoDia(bd, HOJE, as(7));
    const [primeira] = await dosesPendentesDoDia(bd, HOJE);

    await marcarTomada(bd, primeira.doseId);
    const restantes = await lembretesAindaValidos(bd, as(9));
    conferir(
      "dose tomada some da lista de lembretes válidos",
      restantes.length === 1 && restantes[0].dose.doseId !== primeira.doseId,
      `restaram ${restantes.length}`,
    );

    const apagados = await apagarLembretesDaDose(bd, primeira.doseId);
    conferir("apagar devolve o que existia", apagados.length === 1);
    conferir(
      "e a linha some mesmo",
      (await lembreteDaDose(bd, primeira.doseId, "REPETICAO")) === null,
    );
  }

  // -------------------------------------------------------------------------
  console.log("\n-- descobrir a dose a partir do alarme --");
  {
    const { bd, remedioId } = await bancoDeTeste();

    const d = await doseDoAlarme(bd, remedioId, 8 * 60, as(8, 1));
    conferir(
      "alarme das 08:00 tocado às 08:01 acha a dose de hoje",
      d?.previstoPara.getTime() === instanteDoDia(HOJE, 8 * 60).getTime(),
    );

    const inexistente = await doseDoAlarme(bd, remedioId, 9 * 60, as(9, 1));
    conferir(
      "horário sem dose não inventa nenhuma",
      inexistente === null,
    );
  }

  {
    // A virada da meia-noite: alarme das 23:50, botão tocado às 00:10.
    const { bd, remedioId } = await bancoDeTeste([23 * 60 + 50]);
    const depoisDaMeiaNoite = new Date(HOJE);
    depoisDaMeiaNoite.setDate(depoisDaMeiaNoite.getDate() + 1);
    depoisDaMeiaNoite.setHours(0, 10, 0, 0);

    const d = await doseDoAlarme(bd, remedioId, 23 * 60 + 50, depoisDaMeiaNoite);
    conferir(
      "botão tocado depois da meia-noite acha a dose de ontem",
      d?.previstoPara.getTime() === instanteDoDia(HOJE, 23 * 60 + 50).getTime(),
      d ? d.previstoPara.toTimeString().slice(0, 5) : "não achou",
    );
  }

  // -------------------------------------------------------------------------
  console.log("\n-- o mesmo toque chegando duas vezes --");
  {
    const agora = as(8, 5);
    const quando = emMinutos(agora, 15);
    const lembrete = {
      id: 1,
      doseId: 1,
      tipo: "ADIAMENTO" as const,
      previstoPara: quando,
      notificacaoId: "x",
    };

    conferir("nada guardado ainda: não é repetido", !ehOMesmoPedido(null, quando));
    conferir(
      "mesmo instante: é o mesmo toque",
      ehOMesmoPedido(lembrete, emMinutos(agora, 15)),
    );
    conferir(
      "30 segundos depois: ainda o mesmo toque",
      ehOMesmoPedido(lembrete, new Date(quando.getTime() + 30_000)),
    );
    conferir(
      "15 minutos depois: adiamento novo, vale substituir",
      !ehOMesmoPedido(lembrete, emMinutos(quando, 15)),
    );
  }

  // -------------------------------------------------------------------------
  console.log("\n-- estoque não é descontado duas vezes --");
  {
    const { bd, remedioId } = await bancoDeTeste();
    const [primeira] = await dosesPendentesDoDia(bd, HOJE);

    await marcarTomada(bd, primeira.doseId);
    await marcarTomada(bd, primeira.doseId);

    const r = await bd.getFirstAsync<{ estoque_comprimidos: number }>(
      `SELECT estoque_comprimidos FROM remedios WHERE id = ?`,
      remedioId,
    );
    conferir(
      "marcar duas vezes desconta um comprimido só",
      r?.estoque_comprimidos === 29,
      `estoque=${r?.estoque_comprimidos}`,
    );
  }

  // -------------------------------------------------------------------------
  console.log(`\n-- horizonte de ${DIAS_COM_REPETICAO} dias --`);
  {
    const { bd } = await bancoDeTeste();
    const quantas = await planejarRepeticoes(bd, as(7));
    conferir(
      "às 07:00 prepara hoje e amanhã: quatro repetições",
      quantas === 4,
      `planejadas=${quantas}`,
    );

    const amanha = new Date(HOJE);
    amanha.setDate(amanha.getDate() + 1);
    const dosesDeAmanha = await dosesPendentesDoDia(bd, amanha);
    conferir(
      "as doses de amanhã já existem",
      dosesDeAmanha.length === 2,
      `${dosesDeAmanha.length} doses`,
    );
  }

  {
    // O caso que motivou o horizonte de dois dias: ela não abre o aplicativo o
    // dia inteiro. A dose de amanhã de manhã ainda precisa ter repetição.
    const { bd } = await bancoDeTeste();
    const quantas = await planejarRepeticoes(bd, as(23, 30));
    const amanha = new Date(HOJE);
    amanha.setDate(amanha.getDate() + 1);
    const lembretes = await lembretesAindaValidos(bd, as(23, 30));
    const horas = lembretes.map((l) =>
      l.lembrete.previstoPara.toTimeString().slice(0, 5),
    );
    conferir(
      "às 23:30 planeja só as de amanhã",
      quantas === 2 && horas.join(" ") === "08:30 20:30",
      `${quantas} planejadas: ${horas.join(" ")}`,
    );
    conferir(
      "e a primeira delas é a da manhã seguinte",
      lembretes[0]?.dose.previstoPara.getDate() === amanha.getDate(),
    );
  }

  // -------------------------------------------------------------------------
  console.log("\n-- mexer no cadastro não deixa dose fantasma amanhã --");
  {
    const { bd, remedioId } = await bancoDeTeste();
    await planejarRepeticoes(bd, as(7));

    // Muda o horário: 08:00 e 20:00 viram 09:00 apenas.
    await salvarRemedio(
      bd,
      {
        id: remedioId,
        nome: "Losartana 50mg",
        quantidade: 1,
        observacao: null,
        fotoUri: null,
        ativo: true,
        inicioEm: "2026-08-01",
        fimEm: null,
        estoqueComprimidos: 30,
        comprimidosPorCaixa: 30,
        horarios: [9 * 60],
      },
      HOJE,
    );

    const amanha = new Date(HOJE);
    amanha.setDate(amanha.getDate() + 1);
    const sobrouAmanha = await dosesPendentesDoDia(bd, amanha);
    conferir(
      "mudar o horário limpa as doses de amanhã",
      sobrouAmanha.length === 0,
      `sobraram ${sobrouAmanha.length}`,
    );

    const hojeAgora = await dosesPendentesDoDia(bd, HOJE);
    conferir(
      "e hoje fica só com o horário novo",
      hojeAgora.length === 1 &&
        hojeAgora[0].previstoPara.getTime() ===
          instanteDoDia(HOJE, 9 * 60).getTime(),
      hojeAgora.map((d) => d.previstoPara.toTimeString().slice(0, 5)).join(" "),
    );
  }

  {
    const { bd, remedioId } = await bancoDeTeste();
    await planejarRepeticoes(bd, as(7));
    await definirAtivo(bd, remedioId, false, HOJE);

    const amanha = new Date(HOJE);
    amanha.setDate(amanha.getDate() + 1);
    conferir(
      "parar de tomar apaga as doses de amanhã",
      (await dosesPendentesDoDia(bd, amanha)).length === 0,
    );
    conferir(
      "mas não mexe nas de hoje, que já estão na tela",
      (await dosesPendentesDoDia(bd, HOJE)).length === 2,
    );
  }

  // -------------------------------------------------------------------------
  console.log("\n-- limpeza e cascata --");
  {
    const { bd } = await bancoDeTeste();
    const [primeira] = await dosesPendentesDoDia(bd, HOJE);

    const antiga = new Date(HOJE);
    antiga.setDate(antiga.getDate() - 5);
    await guardarLembrete(bd, primeira.doseId, "REPETICAO", antiga, "velho");
    await limparLembretesVelhos(bd, HOJE);
    const sobrou = await bd.getFirstAsync<{ n: number }>(
      `SELECT COUNT(*) AS n FROM lembretes`,
    );
    conferir("lembrete de cinco dias atrás é apagado", sobrou?.n === 0);

    await guardarLembrete(bd, primeira.doseId, "REPETICAO", as(8, 30), "novo");
    await bd.runAsync(`DELETE FROM doses WHERE id = ?`, primeira.doseId);
    const orfaos = await bd.getFirstAsync<{ n: number }>(
      `SELECT COUNT(*) AS n FROM lembretes`,
    );
    conferir("apagar a dose leva o lembrete junto", orfaos?.n === 0);
  }

  console.log(falhas === 0 ? "\nTUDO PASSOU" : `\n${falhas} FALHA(S)`);
  process.exit(falhas === 0 ? 0 : 1);
}

void principal();
