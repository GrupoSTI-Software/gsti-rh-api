/**
 * Plataformas validadas en hardware (bateria rev.5) y la disposicion de ATTLOG
 * que les corresponde. El parser de ATTLOG (rebanada 3) fija las posiciones de
 * cada campo por disposicion; aqui solo se decide si la plataforma es conocida.
 * Fuera del mapa: `layout_known = 0` e incidente `unknown_platform`, sin
 * bloquear el envio de empleados (spec 15).
 */
export const ADMS_KNOWN_PLATFORMS = {
  ZAM180_TFT: 'zam180',
  ZAM70_TFT: 'zam70',
} as const

export type AdmsAttlogLayout = (typeof ADMS_KNOWN_PLATFORMS)[keyof typeof ADMS_KNOWN_PLATFORMS]

/**
 * El nombre viene del aparato, asi que la busqueda no puede caer en el
 * prototipo del objeto: `constructor` o `__proto__` no son plataformas.
 */
export function attlogLayoutFor(platform: string | null): AdmsAttlogLayout | null {
  if (platform === null) return null
  const layouts: Readonly<Record<string, AdmsAttlogLayout>> = ADMS_KNOWN_PLATFORMS
  return Object.hasOwn(layouts, platform) ? layouts[platform] : null
}
