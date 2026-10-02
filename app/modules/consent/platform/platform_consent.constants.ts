/**
 * Slugs de rol cuya aceptación cuenta como "la empresa aceptó" (§4 regla 1, DA-1).
 * Decisión de Wilvardo, 2026-09-29: solo `owner`. Este arreglo es el único punto de
 * la regla en constantes; el adaptador la aplica vía `ownerMembershipsQuery`.
 */
export const TENANT_ACCEPTANCE_ROLE_SLUGS = ['owner'] as const

export type TenantAcceptanceRoleSlug = (typeof TENANT_ACCEPTANCE_ROLE_SLUGS)[number]

/**
 * Tipos de documento legal incluidos en el listado de aceptaciones de plataforma
 * (§4 regla 9: solo términos y aviso; el consentimiento biométrico se excluye).
 */
export const PLATFORM_ACCEPTANCE_DOCUMENT_TYPES = ['terms_conditions', 'privacy_notice'] as const

export type PlatformAcceptanceDocumentType = (typeof PLATFORM_ACCEPTANCE_DOCUMENT_TYPES)[number]

/**
 * Valores permitidos del filtro de query `status` (§4 reglas 2 y 12: estados
 * calculados por documento y filtro no excluyente sobre la fila del tenant).
 */
export const PLATFORM_ACCEPTANCE_STATUS_FILTERS = ['al-dia', 'pendiente', 'nunca'] as const

export type PlatformAcceptanceStatusFilter = (typeof PLATFORM_ACCEPTANCE_STATUS_FILTERS)[number]

/**
 * Estados posibles de aceptación por documento en la respuesta (§4 reglas 2 y 4:
 * incluye `sin-version-publicada` cuando no hay versión vigente publicada).
 */
export const PLATFORM_DOCUMENT_ACCEPTANCE_STATUSES = [
  ...PLATFORM_ACCEPTANCE_STATUS_FILTERS,
  'sin-version-publicada',
] as const

export type PlatformDocumentAcceptanceStatus =
  (typeof PLATFORM_DOCUMENT_ACCEPTANCE_STATUSES)[number]

/** Tamaño de página por defecto del listado (§4 regla 10). */
export const PLATFORM_ACCEPTANCES_DEFAULT_LIMIT = 20

/** Límite máximo de `limit` en la query (§4 regla 10). */
export const PLATFORM_ACCEPTANCES_MAX_LIMIT = 100
