/**
 * Constantes del formato de archivo de plantillas de puesto, v1 (VLRH-H1792026425571).
 *
 * Fuente única del contrato: las importan el esquema vine
 * (`app/modules/position-templates/validators/position_template_file.validator.ts`),
 * la revisión automática, el seeder de categorías de certificación y, después, el
 * importador. La guía para quien escribe contenido vive en
 * `database/data/position_templates/README.md` y no repite estos valores a mano
 * como regla: si cambian aquí, se actualiza la guía.
 */

/** Versión del esquema del archivo, no del contenido. */
export const POSITION_TEMPLATE_FORMAT_VERSION = 1

/** Carpeta de contenido, relativa a la raíz de la app. Es la que revisa el comando sin argumentos. */
export const POSITION_TEMPLATE_DATA_DIR = 'database/data/position_templates'

/** Códigos estables (puesto tipo, giro): kebab-case en minúsculas. Rechaza `__proto__` y `constructor`. */
export const POSITION_TEMPLATE_CODE_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/

/** Grupo unitario de SINCO 2019: 4 dígitos. */
export const POSITION_TEMPLATE_SINCO_PATTERN = /^[0-9]{4}$/

export const POSITION_TEMPLATE_STATUSES = ['estandar', 'en_revision'] as const
export type PositionTemplateStatus = (typeof POSITION_TEMPLATE_STATUSES)[number]

/** `transversal` aplica a todo giro; `giro` exige la lista `giros`. */
export const POSITION_TEMPLATE_SCOPES = ['transversal', 'giro'] as const
export type PositionTemplateScope = (typeof POSITION_TEMPLATE_SCOPES)[number]

/** Mismos valores que deja `competencies.competency_type` tras VLRH-H1792026430212. */
export const POSITION_TEMPLATE_COMPETENCY_TYPES = ['technical', 'functional'] as const
export type PositionTemplateCompetencyType = (typeof POSITION_TEMPLATE_COMPETENCY_TYPES)[number]

/** Mismos valores que el enum `supply_type_telework_category`. */
export const POSITION_TEMPLATE_TELEWORK_CATEGORIES = [
  'ergonomic_chair',
  'computing_equipment',
  'accessory',
] as const
export type PositionTemplateTeleworkCategory =
  (typeof POSITION_TEMPLATE_TELEWORK_CATEGORIES)[number]

/**
 * Categorías del catálogo de certificaciones. Las siembra
 * `database/seeders/0027_certification_category_seeder.ts` y las acepta el formato:
 * una sola lista para la BD y para el contenido.
 */
export const POSITION_TEMPLATE_CERTIFICATION_CATEGORIES = [
  { key: 'seguridad', name: 'Seguridad', order: 1 },
  { key: 'operacion', name: 'Operación', order: 2 },
  { key: 'tecnico', name: 'Técnico', order: 3 },
  { key: 'administrativo', name: 'Administrativo', order: 4 },
] as const
export type PositionTemplateCertificationCategoryKey =
  (typeof POSITION_TEMPLATE_CERTIFICATION_CATEGORIES)[number]['key']
export const POSITION_TEMPLATE_CERTIFICATION_CATEGORY_KEYS: readonly PositionTemplateCertificationCategoryKey[] =
  POSITION_TEMPLATE_CERTIFICATION_CATEGORIES.map((category) => category.key)

/**
 * Fuentes que acepta la atribución de cada dato, con su cita y licencia
 * (VLRH-C0197 R3). Consultadas el 2026-10-16; el detalle de verificación vive en
 * `00-brain` `00-docs-hu/VLRH-H1792026425571/anexos-VLRH-H1792026425571/fuentes-oficiales.md`.
 * `propio` es la única fuente sin identificador.
 */
export const POSITION_TEMPLATE_SOURCES = [
  {
    key: 'sinco_2019',
    name: 'SINCO 2019 (INEGI)',
    citation: 'Fuente: INEGI, Sistema Nacional de Clasificación de Ocupaciones (SINCO) 2019.',
    license: 'Términos de libre uso de la información del INEGI',
    url: 'https://www.inegi.org.mx/inegi/terminos.html',
  },
  {
    key: 'scian_2023',
    name: 'SCIAN 2023 (INEGI)',
    citation:
      'Fuente: INEGI, Sistema de Clasificación Industrial de América del Norte (SCIAN) 2023.',
    license: 'Términos de libre uso de la información del INEGI',
    url: 'https://www.inegi.org.mx/app/scian/',
  },
  {
    key: 'esco',
    name: 'ESCO (Comisión Europea)',
    citation:
      'Fuente: ESCO, clasificación europea de capacidades, competencias, cualificaciones y ocupaciones, Comisión Europea.',
    license: 'Política de reutilización de la Comisión Europea (Decisión 2011/833/UE)',
    url: 'https://esco.ec.europa.eu/es',
  },
  {
    key: 'onet',
    name: 'O*NET 31.0 Database (USDOL/ETA)',
    citation:
      'This page includes information from the O*NET 31.0 Database by the U.S. Department of Labor, Employment and Training Administration (USDOL/ETA). Used under the CC BY 4.0 license. O*NET® is a trademark of USDOL/ETA. GSTI / Valanserh has modified all or some of this information. USDOL/ETA has not approved, endorsed, or tested these modifications.',
    license: 'CC BY 4.0',
    url: 'https://www.onetcenter.org/license_db.html',
  },
  {
    key: 'conocer',
    name: 'CONOCER (RENEC)',
    citation:
      'Fuente: CONOCER, Registro Nacional de Estándares de Competencia (código y nombre del estándar).',
    license: 'Consulta pública del RENEC; el texto se parafrasea y se cita',
    url: 'https://conocer.gob.mx/registro-nacional-estandares-competencia/',
  },
  {
    key: 'afac',
    name: 'AFAC',
    citation: 'Fuente: Agencia Federal de Aviación Civil (AFAC), Ley de Aviación Civil.',
    license: 'Información pública del gobierno de México',
    url: 'https://www.gob.mx/afac',
  },
  {
    key: 'stps_dc3',
    name: 'STPS: constancia DC-3',
    citation:
      'Fuente: STPS, Acuerdo de criterios administrativos, requisitos y formatos en materia de capacitación (DOF 14-06-2013).',
    license: 'Información pública del gobierno de México',
    url: 'https://www.gob.mx/stps',
  },
  {
    key: 'propio',
    name: 'Propio (GSTI / Valanserh)',
    citation: 'Redacción propia de GSTI / Valanserh.',
    license: 'Contenido propio',
    url: '',
  },
] as const
export type PositionTemplateSourceKey = (typeof POSITION_TEMPLATE_SOURCES)[number]['key']
export const POSITION_TEMPLATE_SOURCE_KEYS: readonly PositionTemplateSourceKey[] =
  POSITION_TEMPLATE_SOURCES.map((source) => source.key)

/** Única fuente que no lleva `id_en_fuente`. */
export const POSITION_TEMPLATE_OWN_SOURCE_KEY: PositionTemplateSourceKey = 'propio'
