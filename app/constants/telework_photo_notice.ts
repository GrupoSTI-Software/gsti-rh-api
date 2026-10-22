import type BusinessUnit from '#models/business_unit'

/**
 * Estados de un aviso de privacidad (spec §10, `telework_photo_notice_status`).
 *
 * `draft` es el único descartable y se descarta por soft delete; `published` es
 * inmutable: una versión publicada solo se apaga (`is_current`) al publicar la
 * siguiente, jamás se edita ni se borra (C0129 R3, CA-17).
 */
export const TELEWORK_PHOTO_NOTICE_STATUSES = ['draft', 'published'] as const

export type TeleworkPhotoNoticeStatus = (typeof TELEWORK_PHOTO_NOTICE_STATUSES)[number]

/**
 * Lista CERRADA de marcadores que el texto de un aviso puede usar (spec §7 y
 * R4): la misma para el BO, el API y la app. Un `{{marcador}}` fuera de esta
 * lista rechaza la publicación (422) y **jamás** se guarda ni se sirve texto
 * crudo.
 *
 * Crecer la lista es cambiar este archivo y el mapa de abajo; no hay marcadores
 * dinámicos ni registro en base de datos.
 */
export const TELEWORK_PHOTO_NOTICE_PLACEHOLDERS = ['razon_social'] as const

export type TeleworkPhotoNoticePlaceholder = (typeof TELEWORK_PHOTO_NOTICE_PLACEHOLDERS)[number]

/**
 * Mapa de sustitución: qué valor de la empresa resuelve cada marcador.
 *
 * `razon_social` se resuelve con `business_unit_legal_name`, la única fuente
 * del dato de la empresa (el nombre legal, no el comercial). El `Pick` deja al
 * llamador pasar solo `{ businessUnitLegalName }` —lo que devuelve el
 * repositorio— sin tener que inventar una empresa entera.
 *
 * El valor que devuelve el resolvedor se **escapa** antes de insertarse en el
 * texto (un nombre legal con marcado no inyecta HTML): de eso se encarga el
 * servicio que publica, no este mapa.
 */
export const TELEWORK_PHOTO_NOTICE_PLACEHOLDER_MARKERS: Record<
  TeleworkPhotoNoticePlaceholder,
  (businessUnit: Pick<BusinessUnit, 'businessUnitLegalName'>) => string
> = {
  razon_social: (businessUnit) => businessUnit.businessUnitLegalName,
}
