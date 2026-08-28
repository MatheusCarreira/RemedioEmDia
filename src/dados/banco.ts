import * as SQLite from "expo-sqlite";

/**
 * Banco local. É a ÚNICA fonte da verdade — não existe servidor.
 *
 * O que essa decisão muda em relação ao schema que eu tinha escrito para o
 * Postgres:
 *
 *  - Chaves são INTEGER AUTOINCREMENT, não UUID. UUID existia para evitar
 *    colisão entre linhas criadas em lugares diferentes; com um aparelho só,
 *    não há outro lugar.
 *  - Sumiram `cuidadores`, `pessoas` e `push_inscricoes`. Não há conta, não há
 *    outra pessoa, e a notificação é agendada no relógio do aparelho.
 *  - Datas são TEXT em ISO 8601 UTC. O SQLite não tem tipo de data; ISO 8601
 *    tem a propriedade de ordenar corretamente como texto, que é o que as
 *    consultas precisam.
 *  - Booleano é INTEGER 0/1, que é como o SQLite realmente guarda.
 *
 * O que NÃO mudou: quantidade continua REAL para permitir meio comprimido, e
 * `doses` continua materializada (uma linha por remédio por horário por dia),
 * porque é isso que permite responder "ela tomou o de terça?".
 */

const NOME_DO_ARQUIVO = "remedio-em-dia.db";

/** Versão do schema. Subir aqui + acrescentar um passo em `migracoes`. */
const VERSAO_ALVO = 2;

let bancoAberto: SQLite.SQLiteDatabase | null = null;

/**
 * Cada posição é a migração que leva da versão (índice) para (índice + 1).
 * Nunca edite uma migração já publicada — acrescente outra. O celular dela
 * pode estar em qualquer versão anterior.
 */
const migracoes: string[] = [
  // 0 -> 1
  `
  CREATE TABLE remedios (
    id                        INTEGER PRIMARY KEY AUTOINCREMENT,
    nome                      TEXT    NOT NULL,
    -- REAL, nao INTEGER: "meio comprimido" e receita comum e arredondar
    -- dose de remedio nao e uma opcao.
    quantidade                REAL    NOT NULL CHECK (quantidade > 0),
    observacao                TEXT,
    -- Datas do tratamento, em ISO (YYYY-MM-DD), no fuso dela.
    inicio_em                 TEXT    NOT NULL,
    -- NULL = uso continuo. Muda a estrategia de agendamento do alarme.
    fim_em                    TEXT,
    -- Pausa sem apagar o historico das doses ja tomadas.
    ativo                     INTEGER NOT NULL DEFAULT 1 CHECK (ativo IN (0,1)),

    -- Estoque. NULL = nao controlar (pomada, gotas: nem tudo se conta em
    -- comprimido, e forcar um numero ai so geraria alerta falso).
    estoque_comprimidos       REAL,
    comprimidos_por_caixa     INTEGER,
    avisar_com_dias_restantes INTEGER NOT NULL DEFAULT 7,
    -- Impede repetir o mesmo aviso todo dia ate ela repor. Aviso repetido
    -- sem necessidade vira ruido, e ruido ensina a ignorar a notificacao.
    estoque_avisado_em        TEXT,

    criado_em                 TEXT    NOT NULL,
    atualizado_em             TEXT    NOT NULL
  );

  CREATE INDEX idx_remedios_ativo ON remedios (ativo);

  CREATE TABLE horarios (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    remedio_id     INTEGER NOT NULL REFERENCES remedios(id) ON DELETE CASCADE,
    -- Minutos desde a meia-noite (0..1439), nao um campo de hora. O
    -- agendador compara e ordena com aritmetica de inteiro, e nao existe a
    -- armadilha de um "time" ser interpretado em UTC.
    minutos_do_dia INTEGER NOT NULL CHECK (minutos_do_dia BETWEEN 0 AND 1439),
    -- Identificador devolvido pelo expo-notifications ao agendar. E como
    -- cancelamos ou reagendamos este horario especifico depois.
    notificacao_id TEXT,
    UNIQUE (remedio_id, minutos_do_dia)
  );

  CREATE INDEX idx_horarios_remedio ON horarios (remedio_id);

  CREATE TABLE doses (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    remedio_id    INTEGER NOT NULL REFERENCES remedios(id) ON DELETE CASCADE,
    -- Instante em UTC (ISO 8601) do horario local dela.
    previsto_para TEXT    NOT NULL,
    status        TEXT    NOT NULL DEFAULT 'PENDENTE'
                          CHECK (status IN ('PENDENTE','TOMADA','PULADA')),
    marcado_em    TEXT,
    criado_em     TEXT    NOT NULL,
    -- Torna a geracao de doses idempotente: rodar o gerador duas vezes no
    -- mesmo dia nao cria duplicata.
    UNIQUE (remedio_id, previsto_para)
  );

  CREATE INDEX idx_doses_status_previsto ON doses (status, previsto_para);

  CREATE TABLE movimentos_estoque (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    remedio_id INTEGER NOT NULL REFERENCES remedios(id) ON DELETE CASCADE,
    -- Positivo entra, negativo sai. Guardar o sinal em vez de um campo
    -- "tipo" separado deixa o saldo ser uma soma simples.
    quantidade REAL    NOT NULL,
    motivo     TEXT    NOT NULL CHECK (motivo IN ('REPOSICAO','CONSUMO','AJUSTE')),
    -- Qual dose gerou a saida. So preenchido quando motivo = CONSUMO.
    -- UNIQUE e o que impede o mesmo "ja tomei" de descontar duas vezes.
    dose_id    INTEGER UNIQUE REFERENCES doses(id) ON DELETE SET NULL,
    observacao TEXT,
    criado_em  TEXT    NOT NULL
  );

  CREATE INDEX idx_movimentos_remedio ON movimentos_estoque (remedio_id, criado_em);

  CREATE TABLE config (
    chave TEXT PRIMARY KEY,
    valor TEXT NOT NULL
  );
  `,

  // 1 -> 2: foto da caixa do remedio.
  //
  // O app escreve o nome tecnico ("Cloridrato de Metformina 850mg") e a caixa
  // dela diz outro ("Glifage"). Confundir generico com nome comercial e um
  // erro classico e perigoso em idoso, e tamanho de fonte nenhum resolve.
  // Com a foto, ela compara imagem com imagem em vez de ler nome quimico.
  //
  // Guarda o CAMINHO do arquivo, nao a imagem. Binario grande dentro do
  // SQLite deixa toda consulta lenta, inclusive as que nem querem a foto.
  `
  ALTER TABLE remedios ADD COLUMN foto_uri TEXT;
  `,
];

/**
 * Abre o banco, liga as chaves estrangeiras e aplica o que faltar de migração.
 *
 * `foreign_keys` vem DESLIGADO por padrão no SQLite e é por conexão — sem esta
 * linha, apagar um remédio deixaria horários e doses órfãos em silêncio.
 */
export async function abrirBanco(): Promise<SQLite.SQLiteDatabase> {
  if (bancoAberto) return bancoAberto;

  const bd = await SQLite.openDatabaseAsync(NOME_DO_ARQUIVO);
  await bd.execAsync("PRAGMA foreign_keys = ON;");
  // WAL: leitura não trava enquanto uma escrita acontece. Importa porque a
  // tela relê as doses no mesmo instante em que o "já tomei" está gravando.
  await bd.execAsync("PRAGMA journal_mode = WAL;");

  await migrar(bd);

  bancoAberto = bd;
  return bd;
}

async function migrar(bd: SQLite.SQLiteDatabase): Promise<void> {
  const linha = await bd.getFirstAsync<{ user_version: number }>(
    "PRAGMA user_version;",
  );
  let versao = linha?.user_version ?? 0;

  while (versao < VERSAO_ALVO) {
    const passo = migracoes[versao];
    if (!passo) throw new Error(`Migração ausente para a versão ${versao}`);

    // withTransactionAsync garante que uma migração pela metade não fique
    // gravada: ou o passo inteiro entra, ou nada entra.
    await bd.withTransactionAsync(async () => {
      await bd.execAsync(passo);
    });

    versao += 1;
    // PRAGMA não aceita parâmetro ligado; o valor é um inteiro nosso, não
    // entrada do usuário, então interpolar aqui é seguro.
    await bd.execAsync(`PRAGMA user_version = ${versao};`);
  }
}

/** Só para os testes: esquece a conexão em memória. */
export function esquecerBanco(): void {
  bancoAberto = null;
}
