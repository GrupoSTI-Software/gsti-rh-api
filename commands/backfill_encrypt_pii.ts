import { BaseCommand, flags } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import db from '@adonisjs/lucid/services/db'
import encryption from '@adonisjs/core/services/encryption'

const PAGE_SIZE = 100

/**
 * Configuración de cada tabla PII que este comando procesa.
 *
 * `tenantJoins` define la cadena de JOINs necesaria para llegar a
 * `employees.business_unit_id` cuando se filtra por `--tenant`.
 * La última entrada de la cadena DEBE unirse con `employees`.
 */
interface JoinConfig {
  toTable: string
  on: [string, string]
}

interface TableConfig {
  /** Nombre de la tabla en BD (snake_case). */
  table: string
  /** Columna de clave primaria. */
  pk: string
  /** Columnas PII a cifrar (snake_case). */
  columns: string[]
  /** JOINs para filtrar por tenant. Última tabla unida: `employees`. */
  tenantJoins: JoinConfig[]
}

/**
 * Tablas y columnas afectadas, tomadas del catálogo USRH1782717629564 (08-10-01).
 * `treatment: 'cifrar'` + `encrypted` cambiado a `true` en este PR.
 */
const TABLES: TableConfig[] = [
  {
    table: 'employee_banks',
    pk: 'employee_bank_id',
    columns: [
      'employee_bank_account_clabe',
      'employee_bank_account_number',
      'employee_bank_account_card_number',
    ],
    tenantJoins: [
      { toTable: 'employees', on: ['employee_banks.employee_id', 'employees.employee_id'] },
    ],
  },
  {
    table: 'employee_biometrics',
    pk: 'employee_biometric_id',
    columns: ['employee_biometric_data'],
    tenantJoins: [
      {
        toTable: 'employees',
        on: ['employee_biometrics.employee_id', 'employees.employee_id'],
      },
    ],
  },
  {
    table: 'employee_medical_conditions',
    pk: 'employee_medical_condition_id',
    columns: ['employee_medical_condition_diagnosis', 'employee_medical_condition_notes'],
    tenantJoins: [
      {
        toTable: 'employees',
        on: ['employee_medical_conditions.employee_id', 'employees.employee_id'],
      },
    ],
  },
  {
    table: 'traumatic_event_reports',
    pk: 'traumatic_event_report_id',
    columns: [
      'traumatic_event_report_involved_people',
      'traumatic_event_report_description',
    ],
    tenantJoins: [
      {
        toTable: 'employees',
        on: ['traumatic_event_reports.employee_id', 'employees.employee_id'],
      },
    ],
  },
  {
    table: 'work_disability_notes',
    pk: 'work_disability_note_id',
    columns: ['work_disability_note_description'],
    tenantJoins: [
      {
        toTable: 'work_disabilities',
        on: [
          'work_disability_notes.work_disability_id',
          'work_disabilities.work_disability_id',
        ],
      },
      {
        toTable: 'employees',
        on: ['work_disabilities.employee_id', 'employees.employee_id'],
      },
    ],
  },
  {
    table: 'employee_lactation_periods',
    pk: 'employee_lactation_period_id',
    columns: ['employee_lactation_period_notes'],
    tenantJoins: [
      {
        toTable: 'employees',
        on: ['employee_lactation_periods.employee_id', 'employees.employee_id'],
      },
    ],
  },
  {
    table: 'employee_emergency_contacts',
    pk: 'employee_emergency_contact_id',
    columns: ['employee_emergency_contact_phone'],
    tenantJoins: [
      {
        toTable: 'employees',
        on: ['employee_emergency_contacts.employee_id', 'employees.employee_id'],
      },
    ],
  },
  {
    table: 'employee_spouses',
    pk: 'employee_spouse_id',
    columns: ['employee_spouse_phone'],
    tenantJoins: [
      {
        toTable: 'employees',
        on: ['employee_spouses.employee_id', 'employees.employee_id'],
      },
    ],
  },
  {
    table: 'employee_biometric_face_ids',
    pk: 'employee_biometric_face_id_id',
    columns: ['employee_biometric_face_id_photo_url'],
    tenantJoins: [
      {
        toTable: 'employees',
        on: ['employee_biometric_face_ids.employee_id', 'employees.employee_id'],
      },
    ],
  },
]

/**
 * Comando de backfill para cifrar en reposo los datos personales no-buscables
 * (banco, biométrico, salud) que vivían en claro antes del deploy de 08-10-02.
 *
 * Aplica el mismo mecanismo AES-256-CBC que ya usa el salario (APP_KEY global).
 * NUNCA toca CURP/RFC/NSS (datos buscables; quedan para la HU hermana).
 *
 * Idempotencia: por cada fila intenta descifrar el valor crudo. Si logra
 * descifrarlo → ya estaba cifrado → se omite. Si no → es texto plano → se cifra.
 * Re-ejecutable sin riesgo de doble cifrado.
 *
 * Orden de deploy recomendado:
 *   1. Deploy del código con los hooks de modelo (escrituras nuevas ya cifran solas).
 *   2. `node ace backfill:encrypt-pii --dry-run [--tenant N]` para revisar el conteo.
 *   3. `node ace backfill:encrypt-pii [--tenant N]` en ventana de bajo tráfico, por empresa.
 *
 * Reversibilidad: usar `--decrypt` para reescribir los valores en claro (requiere
 * respaldar las tablas antes del backfill; el `--decrypt` es la red de seguridad).
 *
 * Uso:
 *   node ace backfill:encrypt-pii
 *   node ace backfill:encrypt-pii --dry-run
 *   node ace backfill:encrypt-pii --tenant 5
 *   node ace backfill:encrypt-pii --tenant 5 --dry-run
 *   node ace backfill:encrypt-pii --decrypt --tenant 5
 */
export default class BackfillEncryptPii extends BaseCommand {
  static commandName = 'backfill:encrypt-pii'
  static description =
    'Cifra en reposo los datos personales no-buscables (banco, biométrico, salud) que vivían en claro'

  static options: CommandOptions = {
    startApp: true,
  }

  @flags.boolean({
    description: 'Reporta cuántas filas se cifrarían sin escribir ningún cambio en BD',
    alias: 'd',
  })
  declare dryRun: boolean

  @flags.number({
    description:
      'Limita el backfill a una sola empresa (business_unit_id). Omitir para procesar todas.',
  })
  declare tenant: number | undefined

  @flags.boolean({
    description:
      'Modo reversa: descifra las filas ya cifradas y escribe el valor en claro. ' +
      'Usar solo para revertir el backfill; RESPALDAR LAS TABLAS ANTES.',
  })
  declare decrypt: boolean

  // ─── punto de entrada ────────────────────────────────────────────────────

  async run() {
    const modeLabel = this.decrypt ? 'DESCIFRAR' : 'CIFRAR'
    const dryLabel = this.dryRun ? '[DRY-RUN] ' : ''
    const tenantLabel = this.tenant !== undefined ? `tenant=${this.tenant}` : 'todos los tenants'

    this.logger.info(
      `${dryLabel}Iniciando backfill:encrypt-pii — modo=${modeLabel} — ${tenantLabel}`
    )

    if (this.decrypt && !this.dryRun) {
      this.logger.warning(
        '⚠  Modo --decrypt activo: se escribirán los valores en CLARO en BD. ' +
          'Confirma que tienes un respaldo de las tablas antes de continuar.'
      )
    }

    const globalCounters = { processed: 0, changed: 0, skipped: 0, errors: 0 }

    for (const config of TABLES) {
      const tableCounters = await this.processTable(config)
      globalCounters.processed += tableCounters.processed
      globalCounters.changed += tableCounters.changed
      globalCounters.skipped += tableCounters.skipped
      globalCounters.errors += tableCounters.errors
    }

    this.printSummary(globalCounters, dryLabel, modeLabel)
  }

  // ─── procesamiento por tabla ──────────────────────────────────────────────

  private async processTable(config: TableConfig) {
    const counters = { processed: 0, changed: 0, skipped: 0, errors: 0 }
    const selectCols = [
      `${config.table}.${config.pk}`,
      ...config.columns.map((c) => `${config.table}.${c}`),
    ]

    let page = 1
    let hasMore = true

    while (hasMore) {
      const rows = await this.buildQuery(config, selectCols, page)

      if (rows.length === 0) {
        hasMore = false
        break
      }

      for (const row of rows) {
        counters.processed++
        const pkValue = row[config.pk] as number

        const updates: Record<string, string | null> = {}

        for (const col of config.columns) {
          const raw = row[col] as string | null

          if (raw === null || raw === undefined) {
            continue
          }

          try {
            if (this.decrypt) {
              const plain = this.tryDecrypt(raw)
              if (plain === null) {
                // Ya está en claro o no se puede descifrar → omitir
                counters.skipped++
                continue
              }
              updates[col] = plain
            } else {
              const alreadyDecrypted = this.tryDecrypt(raw)
              if (alreadyDecrypted !== null) {
                // El decrypt tuvo éxito → ya estaba cifrado → omitir (idempotencia)
                counters.skipped++
                continue
              }
              updates[col] = encryption.encrypt(raw)
            }
          } catch {
            counters.errors++
            this.logger.error(
              `[${config.table}] [ID ${pkValue}] [col ${col}] Error inesperado — omitido`
            )
            continue
          }
        }

        if (Object.keys(updates).length === 0) {
          continue
        }

        if (this.dryRun) {
          const action = this.decrypt ? 'descifraría' : 'cifraría'
          this.logger.info(
            `[DRY-RUN] [${config.table}] [ID ${pkValue}] Se ${action}: ${Object.keys(updates).join(', ')}`
          )
          counters.changed++
        } else {
          await db.from(config.table).where(config.pk, pkValue).update(updates)
          const action = this.decrypt ? 'descifrado' : 'cifrado'
          this.logger.info(
            `[${config.table}] [ID ${pkValue}] ${action}: ${Object.keys(updates).join(', ')}`
          )
          counters.changed++
        }
      }

      page++
      hasMore = rows.length === PAGE_SIZE
    }

    this.logger.info(
      `  ↳ ${config.table}: procesados=${counters.processed} cambiados=${counters.changed} ` +
        `omitidos=${counters.skipped} errores=${counters.errors}`
    )

    return counters
  }

  // ─── helpers ──────────────────────────────────────────────────────────────

  /**
   * Construye la query para leer filas crudas por query builder (nunca por modelo Lucid,
   * para evitar que el hook consume descifre antes de detectar idempotencia).
   */
  private async buildQuery(config: TableConfig, selectCols: string[], page: number) {
    let query = db.from(config.table)

    if (this.tenant !== undefined) {
      for (const join of config.tenantJoins) {
        query = query.join(join.toTable, join.on[0], join.on[1])
      }
      query = query.where('employees.business_unit_id', this.tenant)
    }

    query = query
      .select(selectCols)
      .orderBy(`${config.table}.${config.pk}`, 'asc')
      .offset((page - 1) * PAGE_SIZE)
      .limit(PAGE_SIZE)

    return query as unknown as Record<string, unknown>[]
  }

  /**
   * Intenta descifrar `value` con la APP_KEY global.
   * - Retorna el texto plano si el descifrado tiene éxito.
   * - Retorna `null` si el valor es texto plano o el ciphertext es inválido.
   * Nunca lanza.
   */
  private tryDecrypt(value: string): string | null {
    try {
      const result = encryption.decrypt<string>(value)
      return result ?? null
    } catch {
      return null
    }
  }

  private printSummary(
    counters: { processed: number; changed: number; skipped: number; errors: number },
    dryLabel: string,
    modeLabel: string
  ) {
    this.logger.info('─────────────────────────────────────────')
    this.logger.info(`${dryLabel}Backfill:encrypt-pii completado — modo ${modeLabel}`)
    this.logger.info(`  Procesados : ${counters.processed}`)

    if (this.dryRun) {
      this.logger.info(`  Se cambiarían : ${counters.changed}`)
    } else if (counters.changed > 0) {
      this.logger.success(`  Cambiados  : ${counters.changed}`)
    } else {
      this.logger.info(`  Cambiados  : ${counters.changed}`)
    }

    this.logger.info(`  Omitidos   : ${counters.skipped}`)

    if (counters.errors > 0) {
      this.logger.error(`  Errores    : ${counters.errors}`)
    } else {
      this.logger.info(`  Errores    : ${counters.errors}`)
    }

    this.logger.info('─────────────────────────────────────────')
  }
}
