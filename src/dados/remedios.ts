import type { SQLiteDatabase } from "expo-sqlite";
import type { Dose } from "../dominio/doses";
import type { RemedioAcabando } from "../dominio/estoque";
import { diasRestantes } from "../dominio/estoque";

/**
 * Acesso ao banco local.
 *
 * Regra desta camada: ela devolve os tipos do domínio (`Dose`,
 * `RemedioAcabando`), nunca as linhas cruas do SQLite. A tela não deve saber
 * que datas são texto e booleanos são 0/1 — essa tradução mora aqui, num lugar
 * só.
 */

export type Horario = {
  id: number;
  minutosDoDia: number;
  notificacaoId: string | null;
};

export type Remedio = {
  id: number;
  nome: string;
  quantidade: number;
  observacao: string | null;
  inicioEm: string;
  fimEm: string | null;
  ativo: boolean;
  estoqueComprimidos: number | null;
  comprimidosPorCaixa: number | null;
  avisarComDiasRestantes: number;
  estoqueAvisadoEm: string | null;
  fotoUri: string | null;
  horarios: Horario[];
};

// ---------------------------------------------------------------------------
// Datas
//
// Tudo que é "dia" (início e fim de tratamento) é YYYY-MM-DD no fuso DELA.
// Tudo que é "instante" (previsto_para, marcado_em) é ISO em UTC.
// Misturar os dois é a origem clássica do bug que só aparece perto da
// meia-noite ou na virada do horário de verão.
// ---------------------------------------------------------------------------

/** YYYY-MM-DD no fuso local do aparelho. */
export function diaLocal(d: Date): string {
  const ano = d.getFullYear();
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}

/** O instante local correspondente a `minutos` desde a meia-noite de `dia`. */
export function instanteDoDia(dia: Date, minutos: number): Date {
  const x = new Date(dia);
  x.setHours(Math.floor(minutos / 60), minutos % 60, 0, 0);
  return x;
}

const agoraISO = () => new Date().toISOString();

// ---------------------------------------------------------------------------
// Leitura
// ---------------------------------------------------------------------------

type LinhaRemedio = {
  id: number;
  nome: string;
  quantidade: number;
  observacao: string | null;
  inicio_em: string;
  fim_em: string | null;
  ativo: number;
  estoque_comprimidos: number | null;
  comprimidos_por_caixa: number | null;
  avisar_com_dias_restantes: number;
  estoque_avisado_em: string | null;
  foto_uri: string | null;
};

/** Todos os remédios, com os horários juntos. `apenasAtivos` por padrão. */
export async function listarRemedios(
  bd: SQLiteDatabase,
  apenasAtivos = true,
): Promise<Remedio[]> {
  const linhas = await bd.getAllAsync<LinhaRemedio>(
    `SELECT * FROM remedios ${apenasAtivos ? "WHERE ativo = 1" : ""} ORDER BY nome`,
  );
  if (linhas.length === 0) return [];

  const horarios = await bd.getAllAsync<{
    id: number;
    remedio_id: number;
    minutos_do_dia: number;
    notificacao_id: string | null;
  }>(`SELECT * FROM horarios ORDER BY minutos_do_dia`);

  return linhas.map((l) => ({
    id: l.id,
    nome: l.nome,
    quantidade: l.quantidade,
    observacao: l.observacao,
    inicioEm: l.inicio_em,
    fimEm: l.fim_em,
    ativo: l.ativo === 1,
    estoqueComprimidos: l.estoque_comprimidos,
    comprimidosPorCaixa: l.comprimidos_por_caixa,
    avisarComDiasRestantes: l.avisar_com_dias_restantes,
    estoqueAvisadoEm: l.estoque_avisado_em,
    fotoUri: l.foto_uri,
    horarios: horarios
      .filter((h) => h.remedio_id === l.id)
      .map((h) => ({
        id: h.id,
        minutosDoDia: h.minutos_do_dia,
        notificacaoId: h.notificacao_id,
      })),
  }));
}

/**
 * Cria as doses de hoje que ainda não existem.
 *
 * Idempotente pelo UNIQUE(remedio_id, previsto_para): chamar dez vezes no mesmo
 * dia não duplica nada. Roda a cada abertura do app, o que cobre o caso de ela
 * ficar dias sem abrir — os dias pulados simplesmente não geram dose, e é o
 * certo: dose de terça-feira não pode aparecer como pendente na quinta.
 */
export async function gerarDosesDoDia(
  bd: SQLiteDatabase,
  hoje: Date,
): Promise<void> {
  const dia = diaLocal(hoje);
  const remedios = await listarRemedios(bd, true);

  const paraCriar: Array<[number, string, string]> = [];
  for (const r of remedios) {
    if (r.inicioEm > dia) continue; // tratamento ainda não começou
    if (r.fimEm !== null && r.fimEm < dia) continue; // já terminou
    for (const h of r.horarios) {
      paraCriar.push([
        r.id,
        instanteDoDia(hoje, h.minutosDoDia).toISOString(),
        agoraISO(),
      ]);
    }
  }
  if (paraCriar.length === 0) return;

  await bd.withTransactionAsync(async () => {
    for (const [remedioId, previsto, criado] of paraCriar) {
      await bd.runAsync(
        `INSERT OR IGNORE INTO doses (remedio_id, previsto_para, criado_em)
         VALUES (?, ?, ?)`,
        remedioId,
        previsto,
        criado,
      );
    }
  });
}

/** As doses de hoje, no formato que a tela consome. */
export async function dosesDeHoje(
  bd: SQLiteDatabase,
  hoje: Date,
): Promise<Dose[]> {
  const inicio = instanteDoDia(hoje, 0).toISOString();
  const fim = instanteDoDia(hoje, 1439).toISOString();

  const linhas = await bd.getAllAsync<{
    id: number;
    nome: string;
    quantidade: number;
    observacao: string | null;
    previsto_para: string;
    status: string;
    marcado_em: string | null;
    foto_uri: string | null;
  }>(
    `SELECT d.id, r.nome, r.quantidade, r.observacao, r.foto_uri,
            d.previsto_para, d.status, d.marcado_em
       FROM doses d
       JOIN remedios r ON r.id = d.remedio_id
      WHERE d.previsto_para BETWEEN ? AND ?
      ORDER BY d.previsto_para`,
    inicio,
    fim,
  );

  return linhas.map((l) => ({
    id: String(l.id),
    remedio: l.nome,
    quantidade: l.quantidade,
    observacao: l.observacao ?? undefined,
    previstoPara: new Date(l.previsto_para),
    tomadoEm:
      l.status === "TOMADA" && l.marcado_em
        ? new Date(l.marcado_em)
        : undefined,
    fotoUri: l.foto_uri ?? undefined,
  }));
}

// ---------------------------------------------------------------------------
// Escrita
// ---------------------------------------------------------------------------

/**
 * Marca a dose como tomada e desconta o estoque, numa transação só.
 *
 * O desconto e a marcação PRECISAM entrar juntos: se a marcação gravasse e o
 * desconto falhasse, o estoque passaria a mentir em silêncio — e um estoque
 * que mente é pior que nenhum, porque o aviso chegaria na hora errada.
 *
 * O UNIQUE em movimentos_estoque.dose_id é a rede de segurança contra o toque
 * duplo: o segundo INSERT é ignorado e o desconto não acontece duas vezes.
 */
export async function marcarTomada(
  bd: SQLiteDatabase,
  doseId: number,
): Promise<void> {
  const dose = await bd.getFirstAsync<{
    remedio_id: number;
    status: string;
    quantidade: number;
    estoque_comprimidos: number | null;
  }>(
    `SELECT d.remedio_id, d.status, r.quantidade, r.estoque_comprimidos
       FROM doses d JOIN remedios r ON r.id = d.remedio_id
      WHERE d.id = ?`,
    doseId,
  );
  if (!dose || dose.status === "TOMADA") return;

  const agora = agoraISO();

  await bd.withTransactionAsync(async () => {
    await bd.runAsync(
      `UPDATE doses SET status = 'TOMADA', marcado_em = ? WHERE id = ?`,
      agora,
      doseId,
    );

    if (dose.estoque_comprimidos !== null) {
      const resultado = await bd.runAsync(
        `INSERT OR IGNORE INTO movimentos_estoque
           (remedio_id, quantidade, motivo, dose_id, criado_em)
         VALUES (?, ?, 'CONSUMO', ?, ?)`,
        dose.remedio_id,
        -dose.quantidade,
        doseId,
        agora,
      );
      // Só mexe no saldo se o movimento realmente entrou.
      if (resultado.changes > 0) {
        await bd.runAsync(
          `UPDATE remedios
              SET estoque_comprimidos = MAX(0, estoque_comprimidos - ?),
                  atualizado_em = ?
            WHERE id = ?`,
          dose.quantidade,
          agora,
          dose.remedio_id,
        );
      }
    }
  });
}

/** Desfaz o "já tomei". Existe porque o toque errado acontece. */
export async function desmarcarTomada(
  bd: SQLiteDatabase,
  doseId: number,
): Promise<void> {
  const mov = await bd.getFirstAsync<{ remedio_id: number; quantidade: number }>(
    `SELECT remedio_id, quantidade FROM movimentos_estoque WHERE dose_id = ?`,
    doseId,
  );
  const agora = agoraISO();

  await bd.withTransactionAsync(async () => {
    await bd.runAsync(
      `UPDATE doses SET status = 'PENDENTE', marcado_em = NULL WHERE id = ?`,
      doseId,
    );
    if (mov) {
      // `quantidade` do movimento é negativa; subtrair devolve ao estoque.
      await bd.runAsync(
        `UPDATE remedios SET estoque_comprimidos = estoque_comprimidos - ?,
                             atualizado_em = ?
          WHERE id = ?`,
        mov.quantidade,
        agora,
        mov.remedio_id,
      );
      await bd.runAsync(`DELETE FROM movimentos_estoque WHERE dose_id = ?`, doseId);
    }
  });
}

/** Repõe uma caixa inteira. É o que o botão "JÁ COMPREI" chama. */
export async function reporCaixa(
  bd: SQLiteDatabase,
  remedioId: number,
): Promise<void> {
  const r = await bd.getFirstAsync<{ comprimidos_por_caixa: number | null }>(
    `SELECT comprimidos_por_caixa FROM remedios WHERE id = ?`,
    remedioId,
  );
  const porCaixa = r?.comprimidos_por_caixa;
  if (!porCaixa || porCaixa <= 0) return;

  const agora = agoraISO();
  await bd.withTransactionAsync(async () => {
    await bd.runAsync(
      `INSERT INTO movimentos_estoque (remedio_id, quantidade, motivo, criado_em)
       VALUES (?, ?, 'REPOSICAO', ?)`,
      remedioId,
      porCaixa,
      agora,
    );
    // `estoque_avisado_em = NULL` faz o aviso poder acontecer de novo quando
    // esta caixa acabar.
    await bd.runAsync(
      `UPDATE remedios
          SET estoque_comprimidos = COALESCE(estoque_comprimidos, 0) + ?,
              estoque_avisado_em = NULL,
              atualizado_em = ?
        WHERE id = ?`,
      porCaixa,
      agora,
      remedioId,
    );
  });
}

/** Corrige o saldo depois de conferir a cartela. */
export async function ajustarEstoque(
  bd: SQLiteDatabase,
  remedioId: number,
  novoSaldo: number,
  observacao?: string,
): Promise<void> {
  const r = await bd.getFirstAsync<{ estoque_comprimidos: number | null }>(
    `SELECT estoque_comprimidos FROM remedios WHERE id = ?`,
    remedioId,
  );
  const anterior = r?.estoque_comprimidos ?? 0;
  const delta = novoSaldo - anterior;
  const agora = agoraISO();

  await bd.withTransactionAsync(async () => {
    await bd.runAsync(
      `INSERT INTO movimentos_estoque
         (remedio_id, quantidade, motivo, observacao, criado_em)
       VALUES (?, ?, 'AJUSTE', ?, ?)`,
      remedioId,
      delta,
      observacao ?? null,
      agora,
    );
    await bd.runAsync(
      `UPDATE remedios SET estoque_comprimidos = ?, estoque_avisado_em = NULL,
                           atualizado_em = ?
        WHERE id = ?`,
      novoSaldo,
      agora,
      remedioId,
    );
  });
}

// ---------------------------------------------------------------------------
// Estoque
// ---------------------------------------------------------------------------

/** Quais remédios estão acabando, no formato que a tela consome. */
export async function remediosAcabando(
  bd: SQLiteDatabase,
): Promise<RemedioAcabando[]> {
  const remedios = await listarRemedios(bd, true);

  return remedios
    .map((r) => {
      const dias = diasRestantes({
        estoqueComprimidos: r.estoqueComprimidos,
        quantidade: r.quantidade,
        dosesPorDia: r.horarios.length,
        avisarComDiasRestantes: r.avisarComDiasRestantes,
      });
      return { r, dias };
    })
    .filter(
      (x): x is { r: Remedio; dias: number } =>
        x.dias !== null && x.dias <= x.r.avisarComDiasRestantes,
    )
    // Mais urgente primeiro.
    .sort((a, b) => a.dias - b.dias)
    .map(({ r, dias }) => ({
      id: String(r.id),
      nome: r.nome,
      diasRestantes: dias,
      comprimidosPorCaixa: r.comprimidosPorCaixa,
    }));
}

// ---------------------------------------------------------------------------
// Cadastro
// ---------------------------------------------------------------------------

/** O que o formulário entrega. `id` ausente = remédio novo. */
export type DadosDoRemedio = {
  id?: number;
  nome: string;
  quantidade: number;
  observacao: string | null;
  fotoUri: string | null;
  ativo: boolean;
  inicioEm: string;
  fimEm: string | null;
  estoqueComprimidos: number | null;
  comprimidosPorCaixa: number | null;
  /** Minutos desde a meia-noite. Sem ordem exigida; a função ordena. */
  horarios: number[];
};

/** Um remédio pelo id, com horários. */
export async function obterRemedio(
  bd: SQLiteDatabase,
  id: number,
): Promise<Remedio | null> {
  const todos = await listarRemedios(bd, false);
  return todos.find((r) => r.id === id) ?? null;
}

/**
 * Cria ou atualiza um remédio, com os horários.
 *
 * Devolve o id.
 *
 * Duas sutilezas que custariam defeito silencioso:
 *
 *  1. Os horários são apagados e reinseridos em vez de comparados um a um.
 *     Eles não guardam nada que valha preservar (o `notificacao_id` é
 *     reconstruído pela reconciliação a cada abertura), então diferença aqui
 *     seria complexidade sem ganho.
 *
 *  2. Depois de salvar, as doses PENDENTES de hoje deste remédio são apagadas
 *     e regeradas. Sem isso, mudar o horário das 8h para as 9h deixaria a dose
 *     das 8h pendente na tela para sempre — um remédio fantasma que ela nunca
 *     conseguiria tirar dali. As doses já TOMADAS ficam: são histórico, e
 *     histórico não se reescreve porque a receita mudou.
 */
export async function salvarRemedio(
  bd: SQLiteDatabase,
  dados: DadosDoRemedio,
  hoje: Date,
): Promise<number> {
  const agora = agoraISO();
  const horarios = [...new Set(dados.horarios)].sort((a, b) => a - b);
  let id = dados.id ?? 0;

  await bd.withTransactionAsync(async () => {
    if (dados.id) {
      await bd.runAsync(
        `UPDATE remedios
            SET nome = ?, quantidade = ?, observacao = ?, foto_uri = ?,
                ativo = ?, inicio_em = ?, fim_em = ?,
                estoque_comprimidos = ?, comprimidos_por_caixa = ?,
                atualizado_em = ?
          WHERE id = ?`,
        dados.nome,
        dados.quantidade,
        dados.observacao,
        dados.fotoUri,
        dados.ativo ? 1 : 0,
        dados.inicioEm,
        dados.fimEm,
        dados.estoqueComprimidos,
        dados.comprimidosPorCaixa,
        agora,
        dados.id,
      );
      id = dados.id;
    } else {
      const r = await bd.runAsync(
        `INSERT INTO remedios
           (nome, quantidade, observacao, foto_uri, ativo, inicio_em, fim_em,
            estoque_comprimidos, comprimidos_por_caixa,
            avisar_com_dias_restantes, criado_em, atualizado_em)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 7, ?, ?)`,
        dados.nome,
        dados.quantidade,
        dados.observacao,
        dados.fotoUri,
        dados.ativo ? 1 : 0,
        dados.inicioEm,
        dados.fimEm,
        dados.estoqueComprimidos,
        dados.comprimidosPorCaixa,
        agora,
        agora,
      );
      id = r.lastInsertRowId;
    }

    await bd.runAsync(`DELETE FROM horarios WHERE remedio_id = ?`, id);
    for (const m of horarios) {
      await bd.runAsync(
        `INSERT INTO horarios (remedio_id, minutos_do_dia) VALUES (?, ?)`,
        id,
        m,
      );
    }

    // Limpa as doses pendentes de hoje: os horários podem ter mudado.
    const inicio = instanteDoDia(hoje, 0).toISOString();
    const fim = instanteDoDia(hoje, 1439).toISOString();
    await bd.runAsync(
      `DELETE FROM doses
        WHERE remedio_id = ? AND status = 'PENDENTE'
          AND previsto_para BETWEEN ? AND ?`,
      id,
      inicio,
      fim,
    );
  });

  await gerarDosesDoDia(bd, hoje);
  return id;
}

/**
 * Apaga um remédio e tudo que depende dele.
 *
 * As doses vão junto (ON DELETE CASCADE) — inclusive as já tomadas. É por isso
 * que a tela oferece PAUSAR antes de apagar: pausar preserva o histórico, e
 * quase sempre é o que a pessoa realmente quis dizer.
 */
export async function apagarRemedio(
  bd: SQLiteDatabase,
  id: number,
): Promise<void> {
  await bd.runAsync(`DELETE FROM remedios WHERE id = ?`, id);
}

/** Liga/desliga sem perder histórico. */
export async function definirAtivo(
  bd: SQLiteDatabase,
  id: number,
  ativo: boolean,
): Promise<void> {
  await bd.runAsync(
    `UPDATE remedios SET ativo = ?, atualizado_em = ? WHERE id = ?`,
    ativo ? 1 : 0,
    agoraISO(),
    id,
  );
}
