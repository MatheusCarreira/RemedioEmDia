/**
 * O esquema do banco e as migrações.
 *
 * Separado de `banco.ts` de propósito: aqui não se importa `expo-sqlite`, e é
 * isso que permite conferir as migrações fora do aparelho, com o SQLite do
 * próprio Node (`npm run lembretes:conferir`). Um erro de SQL numa migração só
 * apareceria no celular dela, no pior momento possível — depois de a versão
 * nova já ter sido instalada.
 */

/**
 * O mínimo que uma conexão precisa oferecer para ser migrada. Escrito como
 * interface própria, e não como o tipo do expo-sqlite, para o conferidor poder
 * passar outra implementação.
 */
export type BancoMigravel = {
  execAsync(sql: string): Promise<void>;
  getFirstAsync<T>(sql: string): Promise<T | null>;
  withTransactionAsync(tarefa: () => Promise<void>): Promise<void>;
};

/** Versão do schema. Subir aqui + acrescentar um passo em `migracoes`. */
export const VERSAO_ALVO = 3;

/**
 * Cada posição é a migração que leva da versão (índice) para (índice + 1).
 * Nunca edite uma migração já publicada — acrescente outra. O celular dela
 * pode estar em qualquer versão anterior.
 */
export const migracoes: string[] = [
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

  // 2 -> 3: lembretes de uma dose especifica.
  //
  // Sao dois: a REPETICAO (o app avisa de novo se ela nao marcou) e o
  // ADIAMENTO (ela pediu "lembrar em 15 min" no botao da notificacao).
  //
  // Por que guardar isso no banco, se o Android ja guarda a notificacao
  // agendada: porque a agenda do Android nao e consultavel de forma confiavel
  // e pode ser descartada pelo sistema. A tabela guarda a INTENCAO ("esta dose
  // deve ser lembrada as 08:30"); o `notificacao_id` e so o espelho do
  // agendamento atual, refeito na reconciliacao. E a mesma escolha que o resto
  // do app faz: a verdade mora aqui, o Android e um cache.
  //
  // UNIQUE (dose_id, tipo) e o que impede o lembrete duplicado quando a mesma
  // resposta de notificacao e processada duas vezes — o que o Android faz de
  // verdade: a tarefa de fundo trata o toque E o listener do app trata de novo
  // quando ela abre o app depois.
  `
  CREATE TABLE lembretes (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    dose_id        INTEGER NOT NULL REFERENCES doses(id) ON DELETE CASCADE,
    tipo           TEXT    NOT NULL CHECK (tipo IN ('REPETICAO','ADIAMENTO')),
    previsto_para  TEXT    NOT NULL,
    notificacao_id TEXT,
    criado_em      TEXT    NOT NULL,
    UNIQUE (dose_id, tipo)
  );

  CREATE INDEX idx_lembretes_previsto ON lembretes (previsto_para);
  `,
];

export async function migrar(bd: BancoMigravel): Promise<void> {
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
