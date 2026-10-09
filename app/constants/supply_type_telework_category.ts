/**
 * Categorías de insumo de teletrabajo (NOM-037-STPS-2023). Atributo cerrado
 * fijado por la norma, no entidad referenciada: por eso constante + enum de
 * columna y no tabla sembrada. Única fuente de verdad de los literales que
 * persisten en `supply_types.supply_type_telework_category`.
 */
export const SUPPLY_TYPE_TELEWORK_CATEGORY = {
  ERGONOMIC_CHAIR: 'ergonomic_chair',
  COMPUTING_EQUIPMENT: 'computing_equipment',
  ACCESSORY: 'accessory',
} as const

export type SupplyTypeTeleworkCategory =
  (typeof SUPPLY_TYPE_TELEWORK_CATEGORY)[keyof typeof SUPPLY_TYPE_TELEWORK_CATEGORY]

export const SUPPLY_TYPE_TELEWORK_CATEGORIES: readonly SupplyTypeTeleworkCategory[] = [
  SUPPLY_TYPE_TELEWORK_CATEGORY.ERGONOMIC_CHAIR,
  SUPPLY_TYPE_TELEWORK_CATEGORY.COMPUTING_EQUIPMENT,
  SUPPLY_TYPE_TELEWORK_CATEGORY.ACCESSORY,
]
