import * as SQLite from "expo-sqlite";
import { migrar } from "./esquema";

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
 *
 * O SQL das tabelas mora em `esquema.ts`, que não importa `expo-sqlite` e por
 * isso pode ser conferido fora do aparelho.
 */

const NOME_DO_ARQUIVO = "remedio-em-dia.db";

let bancoAberto: SQLite.SQLiteDatabase | null = null;

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

/** Só para os testes: esquece a conexão em memória. */
export function esquecerBanco(): void {
  bancoAberto = null;
}
