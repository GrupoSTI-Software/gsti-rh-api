import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'

/**
 * Espera de candados acotada a la prueba que la provoca (VLRH-H1792078645307).
 *
 * Las pruebas de carrera abren una transaccion propia que retiene un candado
 * de fila y lanzan la operacion que debe chocar con el. Para saber que la otra
 * conexion ya llego al punto de bloqueo se consulta
 * `performance_schema.data_lock_waits` (`INNODB_TRX` no refleja la espera),
 * pero solo las esperas cuyo bloqueador es el hilo de ESA transaccion y cuyo
 * candado pedido es de la tabla indicada en esta base. Contar las esperas de
 * toda la instancia daba falso verde: cualquier otra espera del servidor (otra
 * suite, otra base, el worker de la cola) hacia creer que la operacion ya
 * esperaba cuando todavia no llegaba.
 *
 * Requisitos para quien monte CI: MySQL 8+, `performance_schema` activo y
 * privilegio de lectura sobre `performance_schema.data_lock_waits`,
 * `data_locks` y `threads`. Sin ellos la consulta truena o vence y la prueba
 * falla en rojo, nunca en falso verde.
 */
export interface LockHolder {
  trx: TransactionClientContract
  /** `THREAD_ID` de `performance_schema` de la conexion de `trx`. */
  threadId: number
}

/** Fija el hilo de la transaccion que va a retener el candado. */
export async function lockHolderOf(trx: TransactionClientContract): Promise<LockHolder> {
  const [rows] = (await trx.rawQuery(
    'SELECT THREAD_ID AS threadId FROM performance_schema.threads WHERE PROCESSLIST_ID = CONNECTION_ID()'
  )) as [Array<{ threadId: number }>, unknown]
  const threadId = Number(rows[0]?.threadId ?? 0)
  if (threadId <= 0) throw new Error('No se pudo leer el hilo de la transaccion de la prueba')
  return { trx, threadId }
}

/**
 * Espera a que alguna conexion quede esperando un candado de `table` que
 * retiene `holder`, o a que `pending` termine sin esperar.
 *
 * @throws Error si vence el plazo sin espera y `pending` sigue en curso.
 */
export async function waitForLockWaitOn(
  holder: LockHolder,
  table: string,
  pending: Promise<unknown>,
  timeoutMs = 5000
): Promise<void> {
  let settled = false
  const done = () => {
    settled = true
  }
  // Con los dos ramales: un `pending` que falla lo atiende quien lo espera, no aqui.
  pending.then(done, done)
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline && !settled) {
    const [rows] = (await db.rawQuery(
      `SELECT COUNT(*) AS waiting
         FROM performance_schema.data_lock_waits w
         JOIN performance_schema.data_locks l
           ON l.ENGINE_LOCK_ID = w.REQUESTING_ENGINE_LOCK_ID
        WHERE w.BLOCKING_THREAD_ID = ?
          AND l.OBJECT_SCHEMA = DATABASE()
          AND l.OBJECT_NAME = ?`,
      [holder.threadId, table]
    )) as [Array<{ waiting: number }>, unknown]
    if (Number(rows[0]?.waiting ?? 0) > 0) return
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
  if (!settled) throw new Error(`Ninguna transaccion llego a esperar el candado de ${table}`)
}
