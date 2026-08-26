import type { NormalizeConstructor } from '@adonisjs/core/types/helpers'
import { BaseModel } from '@adonisjs/lucid/orm'
import type { LegalCategory } from '#constants/sensitive_fields'
import { SENSITIVE_DATA_WRITE_ERROR_CODES } from '#constants/sensitive_data_write_error_codes'
import { SensitiveDataWriteError } from '#exceptions/sensitive_data_write_error'
import { normalizeToken } from '#helpers/employee_termination_record'
import SensitiveFieldsCatalogService from '#services/sensitive_fields_catalog_service'
import { SensitiveAccessContext } from '#utils/sensitive_access_context'

const catalog = new SensitiveFieldsCatalogService()

/** Orden determinista del 403 mixto (CA-3). No reordenar LEGAL_CATEGORIES. */
export const SENSITIVE_WRITE_CATEGORY_ORDER: readonly LegalCategory[] = [
  'identificacion',
  'contacto',
  'financiero',
  'salud',
  'biometrico',
]

export type SensitiveWriteModel = {
  constructor: { name: string }
  $dirty: Record<string, unknown>
  $original: Record<string, unknown>
}

export function assertSensitiveWriteAllowed(model: SensitiveWriteModel): void {
  if (!SensitiveAccessContext.isActive()) return
  if (SensitiveAccessContext.isUnguarded()) return

  const denied: LegalCategory[] = []
  let unresolved = false

  for (const column of Object.keys(model.$dirty)) {
    const category = catalog.categoryOf(model.constructor.name, column)
    if (category === null) continue
    if (normalizeToken(model.$dirty[column]) === normalizeToken(model.$original[column])) continue

    const decision = SensitiveAccessContext.writeDecision(category)
    if (decision === 'allowed') continue
    if (decision === 'unresolved') {
      unresolved = true
      continue
    }
    if (!denied.includes(category)) denied.push(category)
  }

  if (unresolved) {
    throw new SensitiveDataWriteError(SENSITIVE_DATA_WRITE_ERROR_CODES.UNRESOLVED)
  }

  if (denied.length === 0) return

  const category =
    SENSITIVE_WRITE_CATEGORY_ORDER.find((item) => denied.includes(item)) ?? denied[0]
  throw new SensitiveDataWriteError(SENSITIVE_DATA_WRITE_ERROR_CODES.FORBIDDEN, category)
}

export function withSensitiveWriteGuard() {
  return function <T extends NormalizeConstructor<typeof BaseModel>>(superclass: T) {
    class SensitiveWriteGuardedModel extends superclass {
      static boot() {
        super.boot()
        this.before('save', (row) => {
          assertSensitiveWriteAllowed(row as unknown as SensitiveWriteModel)
        })
      }
    }
    return SensitiveWriteGuardedModel
  }
}
