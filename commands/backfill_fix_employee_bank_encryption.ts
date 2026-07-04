import { BaseCommand, flags } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import db from '@adonisjs/lucid/services/db'
import encryption from '@adonisjs/core/services/encryption'
import env from '#start/env'
import crypto, { type BinaryLike, type CipherKey } from 'node:crypto'

/**
 * Las tres columnas cifradas de employee_banks.
 */
const COLUMNS = [
  'employee_bank_account_clabe',
  'employee_bank_account_number',
  'employee_bank_account_card_number',
] as const

/**
 * Patrón del formato del cifrado legacy del servicio:
 *   `<iv_hex_32chars>:<ciphertext_hex>`
 * Se usa para detectar si el valor intermedio (tras descifrar la capa AdonisJS)
 * sigue siendo un ciphertext del servicio antiguo.
 */
const SERVICE_CIPHERTEXT_RE = /^[0-9a-f]{32}:[0-9a-f]+$/i

/**
 * Corrige el doble cifrado en `employee_banks`.
 *
 * Contexto:
 *   Antes de este fix, el `employee_bank_controller` cifraba manualmente los
 *   valores con `employeeBankService.encrypt()` (AES-256-CTR + APP_ENCRYPT_KEY)
 *   y el `prepare` hook del modelo los cifraba de nuevo con AdonisJS (APP_KEY).
 *   Resultado en BD: `AdonisEncrypt( ServiceEncrypt(original) )`.
 *
 *   Al leer, `consume` sólo quitaba la capa exterior y entregaba el ciphertext
 *   interno al hook `serialize`, que lo enmascaraba sobre texto cifrado.
 *
 * Lo que hace este comando:
 *   1. Lee los valores crudos (sin pasar por hooks de modelo).
 *   2. Descifra la capa AdonisJS → obtiene `ServiceEncrypt(original)`.
 *   3. Verifica que el resultado tiene el formato `iv_hex:ciphertext_hex`.
 *   4. Descifra la capa de servicio → obtiene el valor original en claro.
 *   5. Re-cifra sólo con AdonisJS (`encryption.encrypt`) y actualiza la fila.
 *
 * Idempotencia:
 *   Si la capa AdonisJS ya cubre texto plano (registro ya corregido), el
 *   resultado no coincide con el patrón del servicio → se omite sin tocar.
 *
 * Uso:
 *   node ace backfill:fix-employee-bank
 *   node ace backfill:fix-employee-bank --dry-run
 *   node ace backfill:fix-employee-bank --tenant 5
 *   node ace backfill:fix-employee-bank --tenant 5 --dry-run
 */
export default class BackfillFixEmployeeBankEncryption extends BaseCommand {
  static commandName = 'backfill:fix-employee-bank'
  static description =
    'Corrige el doble cifrado en employee_banks: AES-CTR del servicio + AES del modelo'

  static options: CommandOptions = {
    startApp: true,
  }

  @flags.boolean({
    description: 'Reporta qué filas se corregirían sin escribir cambios en BD',
    alias: 'd',
  })
  declare dryRun: boolean

  @flags.number({
    description: 'Limita el backfill a una sola empresa (business_unit_id). Omitir para todas.',
  })
  declare tenant: number | undefined

  // ─── punto de entrada ────────────────────────────────────────────────────

  async run() {
    const secretKey = env.get('APP_ENCRYPT_KEY') as string
    const dryLabel = this.dryRun ? '[DRY-RUN] ' : ''
    const tenantLabel = this.tenant !== undefined ? `tenant=${this.tenant}` : 'todos los tenants'

    this.logger.info(`${dryLabel}Iniciando backfill:fix-employee-bank — ${tenantLabel}`)

    const PAGE_SIZE = 100
    let page = 1
    let hasMore = true
    const counters = { processed: 0, changed: 0, skipped: 0, errors: 0 }

    while (hasMore) {
      const rows = await this.buildQuery(page, PAGE_SIZE)

      if (rows.length === 0) {
        hasMore = false
        break
      }

      for (const row of rows) {
        counters.processed++
        const id = row['employee_bank_id'] as number
        const updates: Record<string, string> = {}

        for (const col of COLUMNS) {
          const raw = row[col] as string | null
          if (!raw) {
            counters.skipped++
            continue
          }

          try {
            const innerValue = this.tryAdonisDecrypt(raw)
            if (innerValue === null) {
              counters.skipped++
              continue
            }

            if (!SERVICE_CIPHERTEXT_RE.test(innerValue)) {
              counters.skipped++
              continue
            }

            const plaintext = this.serviceDecrypt(innerValue, secretKey)
            updates[col] = encryption.encrypt(plaintext)
          } catch (err) {
            counters.errors++
            this.logger.error(
              `[employee_banks] [ID ${id}] [col ${col}] Error al procesar: ${(err as Error).message}`
            )
          }
        }

        if (Object.keys(updates).length === 0) continue

        if (this.dryRun) {
          this.logger.info(
            `[DRY-RUN] [employee_banks] [ID ${id}] Corregiría: ${Object.keys(updates).join(', ')}`
          )
          counters.changed++
        } else {
          await db.from('employee_banks').where('employee_bank_id', id).update(updates)
          this.logger.info(
            `[employee_banks] [ID ${id}] Corregido: ${Object.keys(updates).join(', ')}`
          )
          counters.changed++
        }
      }

      page++
      hasMore = rows.length === PAGE_SIZE
    }

    this.printSummary(counters, dryLabel)
  }

  // ─── helpers ──────────────────────────────────────────────────────────────

  private async buildQuery(page: number, pageSize: number) {
    const selectCols = [
      'employee_banks.employee_bank_id',
      ...COLUMNS.map((c) => `employee_banks.${c}`),
    ]

    let query = db
      .from('employee_banks')
      .select(selectCols)
      .orderBy('employee_banks.employee_bank_id', 'asc')
      .offset((page - 1) * pageSize)
      .limit(pageSize)

    if (this.tenant !== undefined) {
      query = query
        .join('employees', 'employee_banks.employee_id', 'employees.employee_id')
        .where('employees.business_unit_id', this.tenant)
    }

    return query as unknown as Record<string, unknown>[]
  }

  /**
   * Intenta descifrar con la clave AdonisJS (APP_KEY).
   * Retorna el texto resultante o `null` si falla.
   */
  private tryAdonisDecrypt(value: string): string | null {
    try {
      const result = encryption.decrypt<string>(value)
      return result ?? null
    } catch {
      return null
    }
  }

  /**
   * Descifra el ciphertext generado por `employeeBankService.encrypt()`.
   * Formato: `<iv_hex_32chars>:<ciphertext_hex>` — AES-256-CTR, clave APP_ENCRYPT_KEY.
   */
  private serviceDecrypt(value: string, secretKey: string): string {
    const colonIdx = value.indexOf(':')
    const ivHex = value.substring(0, colonIdx)
    const cipherHex = value.substring(colonIdx + 1)
    const decipher = crypto.createDecipheriv(
      'aes-256-ctr',
      Buffer.from(secretKey, 'utf-8') as unknown as CipherKey,
      Buffer.from(ivHex, 'hex') as unknown as BinaryLike
    )
    let decrypted = decipher.update(cipherHex, 'hex', 'utf8')
    decrypted += decipher.final('utf8')
    return decrypted
  }

  private printSummary(
    counters: { processed: number; changed: number; skipped: number; errors: number },
    dryLabel: string
  ) {
    this.logger.info('─────────────────────────────────────────')
    this.logger.info(`${dryLabel}Backfill:fix-employee-bank completado`)
    this.logger.info(`  Procesados : ${counters.processed}`)
    if (counters.changed > 0) {
      this.logger.success(`  Corregidos : ${counters.changed}`)
    } else {
      this.logger.info(`  Corregidos : ${counters.changed}`)
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
