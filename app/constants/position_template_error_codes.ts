/**
 * Catálogo de hallazgos de la revisión del archivo de plantillas (VLRH-H1792026425571).
 * Gramática `TPL.VAL.<NOMBRE>`. No son errores HTTP: son hallazgos
 * `{ code, key, title, subject, detail }` que imprime `position-templates:validate`
 * y que el importador relanza tal cual.
 */
export const POSITION_TEMPLATE_ERROR_CODES = {
  /** Ruta real fuera de la raíz de la app, enlace simbólico o archivo sin `.json`. No se lee. */
  RUTA_NO_PERMITIDA: 'TPL.VAL.RUTA_NO_PERMITIDA',
  /** La ruta no existe o no se puede leer. */
  ARCHIVO_ILEGIBLE: 'TPL.VAL.ARCHIVO_ILEGIBLE',
  /** No hubo ningún `.json` que revisar (carpeta vacía o solo con el README). */
  SIN_ARCHIVOS_DE_CONTENIDO: 'TPL.VAL.SIN_ARCHIVOS_DE_CONTENIDO',
  /** `JSON.parse` falla. El detalle es fijo: nunca cita el mensaje del parser. */
  JSON_INVALIDO: 'TPL.VAL.JSON_INVALIDO',
  /** El documento no es un objeto o `version_formato` no es exactamente `1`. */
  FORMATO_NO_SOPORTADO: 'TPL.VAL.FORMATO_NO_SOPORTADO',
  /** Ninguna lista del documento trae elementos. */
  DOCUMENTO_VACIO: 'TPL.VAL.DOCUMENTO_VACIO',
  /** vine rechaza el dato (tipo, longitud, patrón, enumeración, rango, faltante) o el dato es `null`. */
  DATO_FUERA_DEL_ESQUEMA: 'TPL.VAL.DATO_FUERA_DEL_ESQUEMA',
  /** Clave que el esquema no declara, en cualquier nivel. */
  CAMPO_DESCONOCIDO: 'TPL.VAL.CAMPO_DESCONOCIDO',
  /** Falta la atribución, su fuente, su `adaptado` o el `id_en_fuente` de una fuente externa. */
  ATRIBUCION_INCOMPLETA: 'TPL.VAL.ATRIBUCION_INCOMPLETA',
  /** `id_en_fuente` con `fuente: propio`. */
  ATRIBUCION_INCONSISTENTE: 'TPL.VAL.ATRIBUCION_INCONSISTENTE',
  /** `alcance: giro` sin `giros`, o `alcance: transversal` con `giros`. */
  ALCANCE_INCONSISTENTE: 'TPL.VAL.ALCANCE_INCONSISTENTE',
  /** Dos funciones, competencias, herramientas o certificaciones con el mismo nombre normalizado en un puesto. */
  ELEMENTO_DUPLICADO_EN_PUESTO: 'TPL.VAL.ELEMENTO_DUPLICADO_EN_PUESTO',
  /** El mismo (`codigo`, `version`) de puesto tipo en dos lugares del conjunto. */
  CODIGO_Y_VERSION_DUPLICADOS: 'TPL.VAL.CODIGO_Y_VERSION_DUPLICADOS',
  /** Una competencia (nombre normalizado) con dos `tipo` distintos en el conjunto. */
  TIPO_DE_COMPETENCIA_INCONSISTENTE: 'TPL.VAL.TIPO_DE_COMPETENCIA_INCONSISTENTE',
} as const

export type PositionTemplateErrorCode =
  (typeof POSITION_TEMPLATE_ERROR_CODES)[keyof typeof POSITION_TEMPLATE_ERROR_CODES]

/** Título y key (slug kebab del título) de cada código. */
export const POSITION_TEMPLATE_ERROR_CATALOG = {
  'TPL.VAL.RUTA_NO_PERMITIDA': { title: 'Ruta no permitida', key: 'ruta-no-permitida' },
  'TPL.VAL.ARCHIVO_ILEGIBLE': {
    title: 'Archivo de plantilla ilegible',
    key: 'archivo-de-plantilla-ilegible',
  },
  'TPL.VAL.SIN_ARCHIVOS_DE_CONTENIDO': {
    title: 'Sin archivos de contenido',
    key: 'sin-archivos-de-contenido',
  },
  'TPL.VAL.JSON_INVALIDO': { title: 'JSON inválido', key: 'json-invalido' },
  'TPL.VAL.FORMATO_NO_SOPORTADO': { title: 'Formato no soportado', key: 'formato-no-soportado' },
  'TPL.VAL.DOCUMENTO_VACIO': { title: 'Documento vacío', key: 'documento-vacio' },
  'TPL.VAL.DATO_FUERA_DEL_ESQUEMA': {
    title: 'Dato fuera del esquema',
    key: 'dato-fuera-del-esquema',
  },
  'TPL.VAL.CAMPO_DESCONOCIDO': { title: 'Campo desconocido', key: 'campo-desconocido' },
  'TPL.VAL.ATRIBUCION_INCOMPLETA': {
    title: 'Atribución incompleta',
    key: 'atribucion-incompleta',
  },
  'TPL.VAL.ATRIBUCION_INCONSISTENTE': {
    title: 'Atribución inconsistente',
    key: 'atribucion-inconsistente',
  },
  'TPL.VAL.ALCANCE_INCONSISTENTE': {
    title: 'Alcance inconsistente',
    key: 'alcance-inconsistente',
  },
  'TPL.VAL.ELEMENTO_DUPLICADO_EN_PUESTO': {
    title: 'Elemento duplicado en el puesto',
    key: 'elemento-duplicado-en-el-puesto',
  },
  'TPL.VAL.CODIGO_Y_VERSION_DUPLICADOS': {
    title: 'Código y versión duplicados',
    key: 'codigo-y-version-duplicados',
  },
  'TPL.VAL.TIPO_DE_COMPETENCIA_INCONSISTENTE': {
    title: 'Tipo de competencia inconsistente',
    key: 'tipo-de-competencia-inconsistente',
  },
} satisfies Record<PositionTemplateErrorCode, { title: string; key: string }>
