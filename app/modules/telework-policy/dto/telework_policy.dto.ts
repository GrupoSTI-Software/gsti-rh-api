import type { TeleworkPolicyComponent } from '#models/telework_policy_template'
import type { TeleworkPolicyStatus } from '#models/telework_policy'

export type { TeleworkPolicyComponent }

/** Forma administrativa del borrador/versión de la política (editor del BO). */
export interface TeleworkPolicyDto {
  id: number
  businessUnitId: number
  version: number
  title: string
  components: TeleworkPolicyComponent[]
  status: TeleworkPolicyStatus
  isCurrent: boolean
  /** Componentes con `body` vacío tras sanear — guía, no bloqueo (regla de negocio 6). */
  missingComponentKeys: string[]
  createdAt: string
  updatedAt: string
  createdByUserId: number
  updatedByUserId: number
}

/** `{ exists: false }` dispara el selector cero/plantilla en el BO; `exists: true` abre el editor. */
export interface TeleworkPolicyStateDto {
  exists: boolean
  policy: TeleworkPolicyDto | null
}

/** Forma pública de la plantilla base global (para previsualizar / partir de plantilla). */
export interface TeleworkPolicyTemplateDto {
  version: string
  components: TeleworkPolicyComponent[]
  isCurrent: boolean
}
