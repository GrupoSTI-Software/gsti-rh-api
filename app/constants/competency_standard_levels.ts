/**
 * Escala estándar de 5 niveles de competencia, fijada por el formato de plantillas
 * (VLRH-H1792026425571). La adopta y siembra VLRH-H1792026434866; el importador
 * traduce `nivel_esperado` por posición a la escala de cada empresa.
 * Etiquetas de hasta 50 caracteres (límite de la etiqueta de nivel por empresa).
 */
export const COMPETENCY_STANDARD_LEVELS = [
  { position: 1, key: 'inicial', label: 'Inicial' },
  { position: 2, key: 'basico', label: 'Básico' },
  { position: 3, key: 'intermedio', label: 'Intermedio' },
  { position: 4, key: 'avanzado', label: 'Avanzado' },
  { position: 5, key: 'experto', label: 'Experto' },
] as const

export type CompetencyStandardLevel = (typeof COMPETENCY_STANDARD_LEVELS)[number]
export type CompetencyStandardLevelPosition = CompetencyStandardLevel['position']
export const COMPETENCY_STANDARD_LEVEL_POSITIONS: readonly CompetencyStandardLevelPosition[] =
  COMPETENCY_STANDARD_LEVELS.map((level) => level.position)
