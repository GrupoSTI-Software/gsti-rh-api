/* eslint-disable no-console -- trazas temporales modo demo */
import db from '@adonisjs/lucid/services/db'
import env from '#start/env'

/**
 * Tablas operacionales que el modo demo vacía antes de repoblar.
 * Orden respetando dependencias típicas; se usa con FOREIGN_KEY_CHECKS = 0.
 */
export const DEMO_OPERATIONAL_PURGE_TABLES: readonly string[] = [
  'employee_shifts',
  'shift_exceptions',
  'employee_contracts',
  'employee_address',
  'employee_spouses',
  'employee_children',
  'employee_emergency_contacts',
  'employee_shift_changes',
  'user_responsible_employees',
  'employee_biometric_face_ids',
  'employee_zones',
  'employee_devices',
  'employee_proceeding_files',
  'employee_annotations',
  'employee_assist_calendars',
  'employee_supplies',
  'employee_medical_conditions',
  'employee_banks',
  'employee_records',
  'work_disability_notes',
  'work_disability_period_expenses',
  'work_disability_periods',
  'work_disabilities',
  'exception_requests',
  'reservation_legs',
  'reservation_notes',
  'reservations',
  'pilots',
  'flight_attendants',
  'employee_vacation_archive_contents',
  'employee_vacation_archives',
  'assists',
  'employee_branch_offices',
  'employees',
  'users',
  'customers',
  'people',
  'branch_offices',
  'shifts',
  'department_position',
  'positions',
] as const

export type DemoPurgeLogger = {
  info:  (msg: string) => void
  warn?: (msg: string) => void
}

/** Si se indica, no se borra este usuario ni su persona (mantiene contraseña y acceso tras repoblar demo). */
export type DemoPurgePreserveRequestingUser = {
  userId: number
  personId: number
}

function rowTotal(rows: unknown): number {
  const r = rows as [{ total: number | string }][]
  const v = r?.[0]?.[0]?.total
  return typeof v === 'number' ? v : Number(v ?? 0)
}

function activeDbLabel(): string {
  try {
    const cfg = (db as unknown as { connection: () => { config?: { database?: string } } }).connection()
    const fromPool = cfg?.config?.database
    if (fromPool) return String(fromPool)
  } catch {
    /* vacío */
  }
  return String(env.get('DB_DATABASE', '(env DB_DATABASE vacío)'))
}

/**
 * Vacía tablas operacionales del demo (misma lógica para HTTP y `node ace demo:purge`).
 * En HTTP se puede pasar `preserve` para no eliminar al usuario que ejecuta la generación.
 */
export async function purgeDemoOperationalData(
  log?: DemoPurgeLogger,
  preserve?: DemoPurgePreserveRequestingUser
): Promise<void> {
  const logInfo  = log?.info ?? (() => {})
  const logWarn  = log?.warn ?? logInfo
  const tag      = `[DEMO-PURGE ${new Date().toISOString()}]`

  console.log(tag, 'inicio purgeDemoOperationalData', {
    tablas: DEMO_OPERATIONAL_PURGE_TABLES.length,
    dbEnv:  env.get('DB_DATABASE'),
    dbLucid: activeDbLabel(),
    preserveUserId: preserve?.userId ?? null,
    preservePersonId: preserve?.personId ?? null,
  })

  await db.rawQuery('SET FOREIGN_KEY_CHECKS = 0')
  console.log(tag, 'SET FOREIGN_KEY_CHECKS = 0')

  try {
    for (const tabla of DEMO_OPERATIONAL_PURGE_TABLES) {
      try {
        const antes     = await db.rawQuery(`SELECT COUNT(*) as total FROM \`${tabla}\``)
        const totalAntes = rowTotal(antes)
        console.log(tag, `tabla=${JSON.stringify(tabla)} ANTES DELETE`, { totalAntes })

        if (tabla === 'users' && preserve) {
          await db.rawQuery('DELETE FROM `users` WHERE `user_id` <> ?', [preserve.userId])
        } else if (tabla === 'people' && preserve) {
          await db.rawQuery('DELETE FROM `people` WHERE `person_id` <> ?', [preserve.personId])
        } else {
          await db.rawQuery(`DELETE FROM \`${tabla}\``)
        }
        const despues     = await db.rawQuery(`SELECT COUNT(*) as total FROM \`${tabla}\``)
        const totalDespues = rowTotal(despues)
        const line = `  ${tabla}: ${totalAntes} → ${totalDespues}`
        console.log(tag, line)
        logInfo(line)
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        if (msg.includes("doesn't exist")) {
          const w = `  ${tabla}: tabla no existe, omitiendo`
          console.warn(tag, w, { error: msg })
          logWarn(w)
        } else {
          console.error(tag, `FALLO en tabla ${tabla}`, err)
          throw err
        }
      }
    }

    try {
      const antes = await db.rawQuery(
        'SELECT COUNT(*) as total FROM departments WHERE department_id != 999'
      )
      const totalAntes = rowTotal(antes)
      console.log(tag, 'departments (id != 999) ANTES DELETE', { totalAntes })
      await db.rawQuery('DELETE FROM departments WHERE department_id != 999')
      const despues = await db.rawQuery(
        'SELECT COUNT(*) as total FROM departments WHERE department_id != 999'
      )
      const totalDespues = rowTotal(despues)
      const line = `  departments (sin id=999): ${totalAntes} → ${totalDespues}`
      console.log(tag, line)
      logInfo(line)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes("doesn't exist")) {
        const w = '  departments: tabla no existe, omitiendo'
        console.warn(tag, w)
        logWarn(w)
      } else {
        console.error(tag, 'FALLO departments', err)
        throw err
      }
    }
  } finally {
    await db.rawQuery('SET FOREIGN_KEY_CHECKS = 1')
    console.log(tag, 'SET FOREIGN_KEY_CHECKS = 1 — purgeDemoOperationalData FIN')
  }
}
