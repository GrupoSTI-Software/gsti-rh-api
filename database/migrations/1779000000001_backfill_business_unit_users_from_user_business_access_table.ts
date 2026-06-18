import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Migración de datos (backfill).
 *
 * Recorre `users.user_business_access` (CSV legado) y por cada token intenta
 * resolver una unidad de negocio activa: primero por ID numérico, después por
 * slug. Si la coincidencia existe en `business_units` y no está soft-deleted,
 * inserta una fila en `business_unit_users` siempre que el par
 * `(business_unit_id, user_id)` aún no exista.
 *
 * Diseño:
 * - Idempotente: re-ejecutable sin producir duplicados gracias al chequeo previo
 *   y al índice único compuesto `(business_unit_id, user_id)`.
 * - Defensiva: tokens vacíos, IDs inexistentes o slugs huérfanos se omiten con
 *   un warning en consola que incluye el `user_id` y el token problemático.
 * - No modifica `users.user_business_access`: la columna permanece intacta como
 *   fuente legada hasta que una historia futura confirme que la pivote es la
 *   única fuente consultada y se proceda a su eliminación física.
 * - Rollback: borra todas las filas de `business_unit_users` (no la tabla, que
 *   se elimina en la migración DDL anterior).
 */
export default class extends BaseSchema {
  protected tableName = 'business_unit_users'

  async up() {
    this.defer(async (db) => {
      const tag = '[backfill business_unit_users]'

      const users = await db
        .from('users')
        .whereNotNull('user_business_access')
        .andWhereRaw("TRIM(user_business_access) <> ''")
        .whereNull('user_deleted_at')
        .select('user_id', 'user_business_access')

      if (users.length === 0) {
        console.warn(`${tag} sin usuarios con CSV legado; nada que migrar.`)
        return
      }

      const businessUnits = await db
        .from('business_units')
        .whereNull('business_unit_deleted_at')
        .select('business_unit_id', 'business_unit_slug')

      const idIndex = new Map<number, number>()
      const slugIndex = new Map<string, number>()
      for (const unit of businessUnits) {
        idIndex.set(Number(unit.business_unit_id), Number(unit.business_unit_id))
        if (unit.business_unit_slug) {
          slugIndex.set(
            String(unit.business_unit_slug).toLowerCase(),
            Number(unit.business_unit_id)
          )
        }
      }

      const now = new Date()
      let totalInserted = 0
      let totalSkipped = 0
      let usersProcessed = 0

      for (const user of users) {
        const userId = Number(user.user_id)
        const csv = String(user.user_business_access ?? '')
        const tokens = csv
          .split(',')
          .map((token) => token.trim())
          .filter((token) => token.length > 0)

        if (tokens.length === 0) {
          continue
        }

        const resolvedIds = new Set<number>()
        for (const token of tokens) {
          const asNumber = Number(token)
          if (Number.isInteger(asNumber) && asNumber > 0 && `${asNumber}` === token) {
            const matched = idIndex.get(asNumber)
            if (matched !== undefined) {
              resolvedIds.add(matched)
            } else {
              console.warn(
                `${tag} user_id=${userId}: ID ${token} no existe en business_units (o está soft-deleted). Se omite.`
              )
              totalSkipped++
            }
            continue
          }

          const matchedBySlug = slugIndex.get(token.toLowerCase())
          if (matchedBySlug !== undefined) {
            resolvedIds.add(matchedBySlug)
          } else {
            console.warn(
              `${tag} user_id=${userId}: slug "${token}" no existe en business_units (o está soft-deleted). Se omite.`
            )
            totalSkipped++
          }
        }

        if (resolvedIds.size === 0) {
          continue
        }

        const existing = await db
          .from('business_unit_users')
          .where('user_id', userId)
          .whereIn('business_unit_id', Array.from(resolvedIds))
          .select('business_unit_id')
        const existingIds = new Set(existing.map((row) => Number(row.business_unit_id)))

        const rowsToInsert = Array.from(resolvedIds)
          .filter((businessUnitId) => !existingIds.has(businessUnitId))
          .map((businessUnitId) => ({
            business_unit_id: businessUnitId,
            user_id: userId,
            business_unit_user_created_at: now,
            business_unit_user_updated_at: now,
          }))

        if (rowsToInsert.length > 0) {
          await db.table('business_unit_users').multiInsert(rowsToInsert)
          totalInserted += rowsToInsert.length
        }

        usersProcessed++
      }

      console.warn(
        `${tag} finalizado: usuarios procesados=${usersProcessed}, filas insertadas=${totalInserted}, tokens omitidos=${totalSkipped}.`
      )
    })
  }

  async down() {
    this.defer(async (db) => {
      const deleted = await db.from('business_unit_users').delete()
      console.warn(
        `[backfill business_unit_users] rollback: ${deleted} filas eliminadas de business_unit_users.`
      )
    })
  }
}
