/**
 * Estructura fija de los 12 componentes obligatorios del numeral 5.2 de la
 * NOM-037-STPS-2023 (incisos a-l). No se agregan ni quitan componentes
 * (regla de negocio 4, USRH1783566072187).
 */
export const TELEWORK_POLICY_COMPONENT_KEYS = [
  '5_2_a',
  '5_2_b',
  '5_2_c',
  '5_2_d',
  '5_2_e',
  '5_2_f',
  '5_2_g',
  '5_2_h',
  '5_2_i',
  '5_2_j',
  '5_2_k',
  '5_2_l',
] as const

export type TeleworkPolicyComponentKey = (typeof TELEWORK_POLICY_COMPONENT_KEYS)[number]

export const TELEWORK_POLICY_COMPONENT_COUNT = TELEWORK_POLICY_COMPONENT_KEYS.length
