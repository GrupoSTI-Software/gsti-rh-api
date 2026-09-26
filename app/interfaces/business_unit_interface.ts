import { DateTime } from 'luxon'

interface BusinessUnitInterface {
  /** Código público UUID v4 — identificador externo de la unidad de negocio. */
  business_unit_public_id: string
  business_unit_name: string
  business_unit_slug: string
  business_unit_legal_name: string
  business_unit_active: number
  business_unit_created_at: DateTime | null
  business_unit_updated_at: DateTime | null
  business_unit_deleted_at: DateTime | null
}

export type { BusinessUnitInterface }
