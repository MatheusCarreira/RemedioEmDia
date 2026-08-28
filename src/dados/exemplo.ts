import type { SQLiteDatabase } from "expo-sqlite";
import { diaLocal } from "./remedios";

/**
 * Dados de exemplo para DESENVOLVIMENTO.
 *
 * Só roda quando `__DEV__` é verdadeiro — o React Native define essa constante
 * como `false` em qualquer build de produção, e o bundler remove o corpo do
 * `if` inteiro. Não existe caminho em que isto entre no celular dela.
 *
 * A guarda é deliberadamente redundante (checa `__DEV__` E se o banco está
 * vazio). Um app de remédio que inventa receita sozinho seria perigoso de um
 * jeito que não compensa economizar três linhas.
 */
export async function semearExemploSeVazio(
  bd: SQLiteDatabase,
  hoje: Date,
): Promise<boolean> {
  if (!__DEV__) return false;

  const contagem = await bd.getFirstAsync<{ n: number }>(
    "SELECT COUNT(*) AS n FROM remedios",
  );
  if ((contagem?.n ?? 0) > 0) return false;

  const dia = diaLocal(hoje);
  const agora = new Date().toISOString();

  // Horários relativos à hora atual, para dar para ver os três estados
  // (tomado, está na hora, mais tarde) a qualquer hora do dia.
  const minutosAgora = hoje.getHours() * 60 + hoje.getMinutes();
  const desloca = (m: number) => Math.max(0, Math.min(1439, minutosAgora + m));

  const exemplos: Array<{
    nome: string;
    quantidade: number;
    observacao: string | null;
    estoque: number | null;
    porCaixa: number | null;
    minutos: number[];
  }> = [
    {
      nome: "Losartana Potássica 50mg",
      quantidade: 1,
      observacao: "Com um copo de água cheio.",
      // Estoque baixo de propósito: aciona o aviso de "está acabando".
      estoque: 5,
      porCaixa: 30,
      minutos: [desloca(-300)], // vira "feito" (marcado logo abaixo)
    },
    {
      nome: "Cloridrato de Metformina 850mg",
      quantidade: 2,
      observacao: "Depois do almoço.",
      estoque: 60,
      porCaixa: 30,
      minutos: [desloca(-90)], // "passou da hora"
    },
    {
      nome: "Hidroclorotiazida 25mg",
      quantidade: 0.5,
      observacao: null,
      estoque: null, // sem controle de estoque
      porCaixa: null,
      minutos: [desloca(-5)], // "esta na hora"
    },
    {
      nome: "Omeprazol 20mg",
      quantidade: 1,
      observacao: "Em jejum, antes de dormir.",
      estoque: 28,
      porCaixa: 28,
      minutos: [desloca(420)], // "mais tarde"
    },
  ];

  await bd.withTransactionAsync(async () => {
    for (const x of exemplos) {
      const r = await bd.runAsync(
        `INSERT INTO remedios
           (nome, quantidade, observacao, inicio_em, fim_em, ativo,
            estoque_comprimidos, comprimidos_por_caixa,
            avisar_com_dias_restantes, criado_em, atualizado_em)
         VALUES (?, ?, ?, ?, NULL, 1, ?, ?, 7, ?, ?)`,
        x.nome,
        x.quantidade,
        x.observacao,
        dia,
        x.estoque,
        x.porCaixa,
        agora,
        agora,
      );
      for (const m of x.minutos) {
        await bd.runAsync(
          `INSERT INTO horarios (remedio_id, minutos_do_dia) VALUES (?, ?)`,
          r.lastInsertRowId,
          m,
        );
      }
    }
  });

  return true;
}

/**
 * Marca a dose mais antiga do dia como tomada, para o estado "feito" também
 * aparecer na tela de exemplo. Chamar DEPOIS de gerar as doses do dia.
 *
 * Mesma guarda de `semearExemploSeVazio`: só em desenvolvimento.
 */
export async function marcarExemploInicial(
  bd: SQLiteDatabase,
  hoje: Date,
): Promise<void> {
  if (!__DEV__) return;

  const inicio = new Date(hoje);
  inicio.setHours(0, 0, 0, 0);
  const fim = new Date(hoje);
  fim.setHours(23, 59, 59, 999);

  const primeira = await bd.getFirstAsync<{ id: number }>(
    `SELECT id FROM doses
      WHERE previsto_para BETWEEN ? AND ? AND status = 'PENDENTE'
      ORDER BY previsto_para
      LIMIT 1`,
    inicio.toISOString(),
    fim.toISOString(),
  );
  if (!primeira) return;

  // Tomada 5 minutos depois da hora prevista — como aconteceria de verdade.
  await bd.runAsync(
    `UPDATE doses SET status = 'TOMADA', marcado_em = ? WHERE id = ?`,
    new Date(hoje.getTime() - 295 * 60_000).toISOString(),
    primeira.id,
  );
}
