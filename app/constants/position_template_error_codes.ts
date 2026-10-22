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
  /** Un `puestos[].giros[]` o un `estructuras[].giro` no está en el catálogo de giros del conjunto (VLRH-H1792205820286). */
  GIRO_INEXISTENTE: 'TPL.VAL.GIRO_INEXISTENTE',
  /** Un puesto de una estructura menciona un código de puesto tipo que no existe en el conjunto, en ninguna versión ni estado. */
  PUESTO_INEXISTENTE: 'TPL.VAL.PUESTO_INEXISTENTE',
  /** El mismo `codigo` de giro en dos lugares del conjunto. */
  CLAVE_DE_GIRO_DUPLICADA: 'TPL.VAL.CLAVE_DE_GIRO_DUPLICADA',
  /** Dos estructuras con el mismo (`giro`, `rango_empleados`) en el conjunto. */
  ESTRUCTURA_DUPLICADA_POR_GIRO_Y_RANGO: 'TPL.VAL.ESTRUCTURA_DUPLICADA_POR_GIRO_Y_RANGO',
  /** `tiene_estructura` de un giro no coincide con las estructuras del conjunto. */
  MARCA_DE_ESTRUCTURA_INCONSISTENTE: 'TPL.VAL.MARCA_DE_ESTRUCTURA_INCONSISTENTE',
  /** Dentro de una estructura, dos áreas con el mismo `codigo` o dos puestos con la misma `clave`. */
  CLAVE_DUPLICADA_EN_ESTRUCTURA: 'TPL.VAL.CLAVE_DUPLICADA_EN_ESTRUCTURA',
  /** `reporta_a` no es la `clave` de ningún puesto de la misma estructura. */
  REPORTA_A_INEXISTENTE: 'TPL.VAL.REPORTA_A_INEXISTENTE',
  /** La estructura no tiene exactamente un puesto sin `reporta_a`. Uno por estructura. */
  RAIZ_DE_JERARQUIA_INVALIDA: 'TPL.VAL.RAIZ_DE_JERARQUIA_INVALIDA',
  /** Un puesto termina reportándose a sí mismo, directa o indirectamente. Uno por ciclo. */
  JERARQUIA_CICLICA: 'TPL.VAL.JERARQUIA_CICLICA',
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
  'TPL.VAL.GIRO_INEXISTENTE': { title: 'Giro inexistente', key: 'giro-inexistente' },
  'TPL.VAL.PUESTO_INEXISTENTE': {
    title: 'Puesto tipo inexistente',
    key: 'puesto-tipo-inexistente',
  },
  'TPL.VAL.CLAVE_DE_GIRO_DUPLICADA': {
    title: 'Clave de giro duplicada',
    key: 'clave-de-giro-duplicada',
  },
  'TPL.VAL.ESTRUCTURA_DUPLICADA_POR_GIRO_Y_RANGO': {
    title: 'Estructura duplicada por giro y rango',
    key: 'estructura-duplicada-por-giro-y-rango',
  },
  'TPL.VAL.MARCA_DE_ESTRUCTURA_INCONSISTENTE': {
    title: 'Marca de estructura inconsistente',
    key: 'marca-de-estructura-inconsistente',
  },
  'TPL.VAL.CLAVE_DUPLICADA_EN_ESTRUCTURA': {
    title: 'Clave duplicada en la estructura',
    key: 'clave-duplicada-en-la-estructura',
  },
  'TPL.VAL.REPORTA_A_INEXISTENTE': {
    title: 'Reporta a un puesto inexistente',
    key: 'reporta-a-un-puesto-inexistente',
  },
  'TPL.VAL.RAIZ_DE_JERARQUIA_INVALIDA': {
    title: 'Raíz de jerarquía inválida',
    key: 'raiz-de-jerarquia-invalida',
  },
  'TPL.VAL.JERARQUIA_CICLICA': { title: 'Jerarquía cíclica', key: 'jerarquia-ciclica' },
} satisfies Record<PositionTemplateErrorCode, { title: string; key: string }>
