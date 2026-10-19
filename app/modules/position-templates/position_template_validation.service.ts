import { lstat, readFile, readdir, realpath } from 'node:fs/promises'
import { dirname, extname, join, relative, resolve, sep } from 'node:path'
import { errors as vineErrors } from '@vinejs/vine'
import {
  POSITION_TEMPLATE_CODE_PATTERN,
  POSITION_TEMPLATE_FORMAT_VERSION,
  POSITION_TEMPLATE_OWN_SOURCE_KEY,
} from '#constants/position_template_format'
import {
  POSITION_TEMPLATE_ERROR_CATALOG,
  POSITION_TEMPLATE_ERROR_CODES,
  type PositionTemplateErrorCode,
} from '#constants/position_template_error_codes'
import { normalizeForSearch } from '#utils/org_alias_normalize'
import { positionTemplateFileValidator } from '#modules/position-templates/validators/position_template_file.validator'
import type {
  PositionTemplateCatalog,
  PositionTemplateFile,
  PositionTemplateFinding,
  PositionTemplateLoadResult,
  PositionTemplateSourceDocument,
  PositionTemplateValidationResult,
} from '#modules/position-templates/dto/position_template.dto'

/** Lector de texto inyectable: las pruebas comprueban con él que una ruta rechazada no se lee. */
export type PositionTemplateTextReader = (absolutePath: string) => Promise<string>

/** Documento que pasó el esquema vine. */
export interface PositionTemplateValidatedDocument {
  file: string
  requested: boolean
  raw: unknown
  document: PositionTemplateFile
}

/** Chequeo de un documento ya validado por vine. */
export type PositionTemplateDocumentCheck = (
  input: PositionTemplateValidatedDocument
) => PositionTemplateFinding[]

/** Chequeo del conjunto: recibe todos los documentos válidos, pedidos y de contexto. */
export type PositionTemplateSetCheck = (
  documents: PositionTemplateValidatedDocument[]
) => PositionTemplateFinding[]

const CODES = POSITION_TEMPLATE_ERROR_CODES

/** Detalle fijo: el mensaje de `JSON.parse` incluye un fragmento del archivo (sin eco de contenido). */
const MALFORMED_JSON_DETAIL =
  'El archivo no es un JSON válido. Ábrelo en un editor que valide JSON.'

const ELEMENT_LISTS = {
  funciones: 'función',
  competencias: 'competencia',
  herramientas: 'herramienta',
  certificaciones: 'certificación',
} as const
type ElementListKey = keyof typeof ELEMENT_LISTS

const TEXT_SECTIONS: Record<string, string> = {
  descripcion: 'descripción',
  objetivo: 'objetivo',
  requisitos: 'requisitos',
}

const ATTRIBUTION_REQUIRED_DETAILS: Record<string, string> = {
  atribucion: 'falta la atribución.',
  fuente: 'falta la fuente de la atribución.',
  adaptado: 'falta el campo "adaptado" de la atribución.',
}

function buildFinding(
  code: PositionTemplateErrorCode,
  subject: string,
  detail: string
): PositionTemplateFinding {
  const { title, key } = POSITION_TEMPLATE_ERROR_CATALOG[code]
  return { code, key, title, subject, detail }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function childOf(value: unknown, segment: string): unknown {
  if (Array.isArray(value)) return value[Number(segment)]
  if (isRecord(value) && Object.hasOwn(value, segment)) return value[segment]
  return undefined
}

function dataSubject(file: string, segments: readonly string[]): string {
  return segments.length === 0 ? file : `${file}#${segments.join('.')}`
}

function fileOfSubject(subject: string): string {
  const hash = subject.indexOf('#')
  return hash === -1 ? subject : subject.slice(0, hash)
}

/** Trim, minúsculas, sin acentos y espacios colapsados: la identidad de un elemento por nombre. */
function normalizeElementName(name: string): string {
  return normalizeForSearch(name).replace(/\s+/g, ' ')
}

/**
 * Nombra el puesto y el elemento que contienen la ruta, para el `detail`. Solo cita el
 * `codigo` del puesto si cumple su patrón y el `nombre` del elemento si no es el dato
 * rechazado; si no, usa su número de posición. Nunca cita otro valor.
 */
function describeLocation(root: unknown, segments: readonly string[]): string {
  if (segments[0] !== 'puestos' || segments[1] === undefined) return 'El documento'
  const jobIndex = Number(segments[1])
  const job = childOf(childOf(root, 'puestos'), segments[1])
  const code = childOf(job, 'codigo')
  const parts = [
    typeof code === 'string' && POSITION_TEMPLATE_CODE_PATTERN.test(code)
      ? `El puesto "${code}"`
      : `El puesto ${jobIndex + 1}`,
  ]

  const section = segments[2]
  if (section !== undefined && Object.hasOwn(ELEMENT_LISTS, section) && segments[3] !== undefined) {
    const label = ELEMENT_LISTS[section as ElementListKey]
    const name = childOf(childOf(childOf(job, section), segments[3]), 'nombre')
    const nameIsRejected = segments[4] === 'nombre' && segments.length === 5
    parts.push(
      typeof name === 'string' && name.trim() !== '' && name.length <= 255 && !nameIsRejected
        ? `${label} "${name.trim()}"`
        : `${label} ${Number(segments[3]) + 1}`
    )
  } else if (section !== undefined && TEXT_SECTIONS[section] !== undefined) {
    parts.push(TEXT_SECTIONS[section])
  }

  return parts.join(', ')
}

/** Rutas de todos los `null` del crudo: vine los acepta en `optional()` y los descartaría en silencio. */
function collectNullPaths(value: unknown, segments: string[], into: string[][]): void {
  if (value === null) {
    into.push(segments)
    return
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectNullPaths(item, [...segments, String(index)], into))
    return
  }
  if (isRecord(value)) {
    for (const [key, item] of Object.entries(value))
      collectNullPaths(item, [...segments, key], into)
  }
}

/** Claves del crudo que no llegaron a la salida de vine: no las declara el esquema (R5). */
function collectUnknownKeys(raw: unknown, output: unknown, segments: string[], into: string[][]) {
  if (Array.isArray(raw) && Array.isArray(output)) {
    raw.forEach((item, index) =>
      collectUnknownKeys(item, output[index], [...segments, String(index)], into)
    )
    return
  }
  if (!isRecord(raw) || !isRecord(output)) return
  for (const key of Object.keys(raw)) {
    if (!Object.hasOwn(output, key)) {
      into.push([...segments, key])
      continue
    }
    collectUnknownKeys(raw[key], output[key], [...segments, key], into)
  }
}

/** Visita cada objeto `atribucion` del documento, en cualquier nivel. */
function visitAttributions(
  value: unknown,
  segments: string[],
  visit: (attribution: Record<string, unknown>, segments: string[]) => void
): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => visitAttributions(item, [...segments, String(index)], visit))
    return
  }
  if (!isRecord(value)) return
  for (const [key, item] of Object.entries(value)) {
    if (key === 'atribucion' && isRecord(item)) {
      visit(item, [...segments, key])
      continue
    }
    visitAttributions(item, [...segments, key], visit)
  }
}

/** Al menos una lista del sobre con elementos. Revisa todas las listas, también las que agregue el formato. */
const checkNotEmpty: PositionTemplateDocumentCheck = ({ file, document }) => {
  const hasItems = Object.values(document).some((value) => Array.isArray(value) && value.length > 0)
  return hasItems
    ? []
    : [
        buildFinding(
          CODES.DOCUMENTO_VACIO,
          file,
          'El documento no trae ningún elemento en sus listas.'
        ),
      ]
}

const checkUnknownKeys: PositionTemplateDocumentCheck = ({ file, raw, document }) => {
  const paths: string[][] = []
  collectUnknownKeys(raw, document, [], paths)
  return paths.map((segments) =>
    buildFinding(
      CODES.CAMPO_DESCONOCIDO,
      dataSubject(file, segments),
      `${describeLocation(raw, segments)}: el campo "${segments[segments.length - 1]}" no existe en el formato v${POSITION_TEMPLATE_FORMAT_VERSION}.`
    )
  )
}

/** `id_en_fuente` obligatorio salvo con fuente propia, y prohibido con ella (VLRH-C0197 R3). */
const checkAttributions: PositionTemplateDocumentCheck = ({ file, document }) => {
  const findings: PositionTemplateFinding[] = []
  visitAttributions(document, [], (attribution, segments) => {
    const isOwn = attribution.fuente === POSITION_TEMPLATE_OWN_SOURCE_KEY
    const hasSourceId = attribution.id_en_fuente !== undefined
    const subject = dataSubject(file, [...segments, 'id_en_fuente'])
    const location = describeLocation(document, segments)
    if (!isOwn && !hasSourceId) {
      findings.push(
        buildFinding(
          CODES.ATRIBUCION_INCOMPLETA,
          subject,
          `${location}: falta el identificador del dato en la fuente (id_en_fuente).`
        )
      )
    }
    if (isOwn && hasSourceId) {
      findings.push(
        buildFinding(
          CODES.ATRIBUCION_INCONSISTENTE,
          subject,
          `${location}: un dato de fuente propia no lleva id_en_fuente.`
        )
      )
    }
  })
  return findings
}

const checkScope: PositionTemplateDocumentCheck = ({ file, document }) =>
  (document.puestos ?? []).flatMap((job, index) => {
    const subject = dataSubject(file, ['puestos', String(index), 'giros'])
    if (job.alcance === 'giro' && job.giros === undefined) {
      return [
        buildFinding(
          CODES.ALCANCE_INCONSISTENTE,
          subject,
          `El puesto "${job.codigo}": con alcance "giro" necesita al menos un giro.`
        ),
      ]
    }
    if (job.alcance === 'transversal' && job.giros !== undefined) {
      return [
        buildFinding(
          CODES.ALCANCE_INCONSISTENTE,
          subject,
          `El puesto "${job.codigo}": un puesto transversal aplica a todo giro y no lleva giros.`
        ),
      ]
    }
    return []
  })

/** Regla 3: dentro de un puesto no se repite una función, competencia, herramienta ni certificación. */
const checkDuplicatedElements: PositionTemplateDocumentCheck = ({ file, document }) =>
  (document.puestos ?? []).flatMap((job, jobIndex) => {
    const lists: Record<ElementListKey, readonly { nombre: string }[]> = {
      funciones: job.funciones,
      competencias: job.competencias,
      herramientas: job.herramientas ?? [],
      certificaciones: job.certificaciones ?? [],
    }
    return (Object.keys(lists) as ElementListKey[]).flatMap((listKey) => {
      const firstIndexByName = new Map<string, number>()
      return lists[listKey].flatMap((element, index) => {
        const name = normalizeElementName(element.nombre)
        const firstIndex = firstIndexByName.get(name)
        if (firstIndex === undefined) {
          firstIndexByName.set(name, index)
          return []
        }
        const segments = ['puestos', String(jobIndex), listKey, String(index), 'nombre']
        return [
          buildFinding(
            CODES.ELEMENTO_DUPLICADO_EN_PUESTO,
            dataSubject(file, segments),
            `${describeLocation(document, segments.slice(0, 4))}: repite el nombre de la ${ELEMENT_LISTS[listKey]} ${firstIndex + 1}.`
          ),
        ]
      })
    })
  })

interface SetOccurrence {
  file: string
  requested: boolean
}

/**
 * De un grupo de ocurrencias en conflicto, en cuáles se reporta: todas menos la
 * primera; si ninguna de esas es de un archivo pedido, en las pedidas. Así el archivo
 * pedido siempre se entera aunque el conflicto lo complete un archivo de contexto.
 */
function reportTargets<T extends SetOccurrence>(conflicting: T[], all: T[]): T[] {
  if (conflicting.some((item) => item.requested)) return conflicting
  return all.filter((item) => item.requested)
}

/** Regla 1: la pareja (`codigo`, `version`) es única en todo el conjunto. */
const checkCodeAndVersion: PositionTemplateSetCheck = (documents) => {
  const groups = new Map<
    string,
    (SetOccurrence & { index: number; code: string; version: number })[]
  >()
  for (const { file, requested, document } of documents) {
    ;(document.puestos ?? []).forEach((job, index) => {
      const groupKey = `${job.codigo}\u0000${job.version}`
      const group = groups.get(groupKey) ?? []
      group.push({ file, requested, index, code: job.codigo, version: job.version })
      groups.set(groupKey, group)
    })
  }

  return [...groups.values()]
    .filter((group) => group.length > 1)
    .flatMap((group) =>
      reportTargets(group.slice(1), group).map((target) => {
        const other = group.find((item) => item !== target) ?? group[0]
        return buildFinding(
          CODES.CODIGO_Y_VERSION_DUPLICADOS,
          dataSubject(target.file, ['puestos', String(target.index), 'version']),
          `El puesto "${target.code}" versión ${target.version} también está en ${other.file}#puestos.${other.index}. Todo cambio se publica como versión nueva.`
        )
      })
    )
}

/** Regla 4: una competencia (por nombre normalizado) tiene un solo tipo en todo el contenido. */
const checkCompetencyTypes: PositionTemplateSetCheck = (documents) => {
  type Occurrence = SetOccurrence & {
    jobIndex: number
    index: number
    jobCode: string
    name: string
    type: string
  }
  const groups = new Map<string, Occurrence[]>()
  for (const { file, requested, document } of documents) {
    ;(document.puestos ?? []).forEach((job, jobIndex) =>
      job.competencias.forEach((competency, index) => {
        const groupKey = normalizeElementName(competency.nombre)
        const group = groups.get(groupKey) ?? []
        group.push({
          file,
          requested,
          jobIndex,
          index,
          jobCode: job.codigo,
          name: competency.nombre,
          type: competency.tipo,
        })
        groups.set(groupKey, group)
      })
    )
  }

  return [...groups.values()].flatMap((group) => {
    const first = group[0]
    const conflicting = group.filter((item) => item.type !== first.type)
    if (conflicting.length === 0) return []
    return reportTargets(conflicting, group).map((target) => {
      const other = group.find((item) => item.type !== target.type) ?? first
      return buildFinding(
        CODES.TIPO_DE_COMPETENCIA_INCONSISTENTE,
        dataSubject(target.file, [
          'puestos',
          String(target.jobIndex),
          'competencias',
          String(target.index),
          'tipo',
        ]),
        `La competencia "${target.name}" es "${target.type}" en el puesto "${target.jobCode}" y "${other.type}" en el puesto "${other.jobCode}". Una competencia tiene un solo tipo en todo el contenido.`
      )
    })
  })
}

/**
 * Chequeos posteriores al esquema. VLRH-H1792205820286 agrega los suyos (giros y su
 * organización por tamaño) a estas listas sin tocar los existentes.
 */
export const POSITION_TEMPLATE_DOCUMENT_CHECKS: readonly PositionTemplateDocumentCheck[] = [
  checkUnknownKeys,
  checkNotEmpty,
  checkAttributions,
  checkScope,
  checkDuplicatedElements,
]
export const POSITION_TEMPLATE_SET_CHECKS: readonly PositionTemplateSetCheck[] = [
  checkCodeAndVersion,
  checkCompetencyTypes,
]

function sortFindings(findings: PositionTemplateFinding[]): PositionTemplateFinding[] {
  return [...findings].sort((left, right) =>
    left.subject.localeCompare(right.subject, 'es', { numeric: true })
  )
}

function toResult(
  findings: PositionTemplateFinding[],
  catalog: PositionTemplateCatalog
): PositionTemplateValidationResult {
  const [head, ...rest] = sortFindings(findings)
  if (head === undefined) return { ok: true, findings: [], catalog }
  return { ok: false, findings: [head, ...rest] }
}

/**
 * Revisión automática del archivo de plantillas de puesto (VLRH-H1792026425571,
 * VLRH-C0197 R4). De solo lectura: no usa BD ni escribe archivos. La reutiliza el
 * importador (VLRH-H1792026438056): solo carga lo que devuelve con `ok: true`.
 */
export default class PositionTemplateValidationService {
  constructor(
    private readonly appRoot: string,
    private readonly readTextFile: PositionTemplateTextReader = (absolutePath) =>
      readFile(absolutePath, 'utf8')
  ) {}

  /**
   * Confinamiento + lectura. Acepta archivos o carpetas relativos a la raíz de la app;
   * una carpeta aporta sus `*.json` de primer nivel en orden alfabético. Un archivo
   * suelto suma sus hermanos como contexto (`requested: false`). Falla cerrado: lo
   * que no pasa el confinamiento no se lee.
   */
  async loadFromPaths(paths: string[]): Promise<PositionTemplateLoadResult> {
    const findings: PositionTemplateFinding[] = []
    const lexicalRoot = resolve(this.appRoot)
    const realRoot = await realpath(lexicalRoot)
    const requestedByPath = new Map<string, boolean>()

    for (const input of paths) {
      const absolute = resolve(lexicalRoot, input)
      if (!this.isInside(lexicalRoot, absolute)) {
        findings.push(this.pathNotAllowed(input))
        continue
      }

      const stats = await lstat(absolute).catch(() => null)
      if (stats === null) {
        findings.push(
          buildFinding(CODES.ARCHIVO_ILEGIBLE, input, 'La ruta no existe o no se puede leer.')
        )
        continue
      }
      const real = stats.isSymbolicLink() ? null : await realpath(absolute).catch(() => null)
      if (real === null || !this.isInside(realRoot, real)) {
        findings.push(this.pathNotAllowed(input))
        continue
      }

      if (stats.isDirectory()) {
        const files = await this.listJsonFiles(real, realRoot, findings)
        if (files.length === 0) {
          findings.push(
            buildFinding(
              CODES.SIN_ARCHIVOS_DE_CONTENIDO,
              this.toSubject(realRoot, real),
              'La carpeta no tiene archivos .json que revisar.'
            )
          )
        }
        for (const file of files) requestedByPath.set(file, true)
        continue
      }

      if (!stats.isFile() || extname(real) !== '.json') {
        findings.push(this.pathNotAllowed(input))
        continue
      }
      requestedByPath.set(real, true)
      for (const sibling of await this.listJsonFiles(dirname(real), realRoot, null)) {
        if (!requestedByPath.has(sibling)) requestedByPath.set(sibling, false)
      }
    }

    const documents: PositionTemplateSourceDocument[] = []
    const ordered = [...requestedByPath.entries()]
      .map(([absolutePath, requested]) => ({
        absolutePath,
        requested,
        path: this.toSubject(realRoot, absolutePath),
      }))
      .sort((left, right) => left.path.localeCompare(right.path, 'es', { numeric: true }))

    for (const { absolutePath, requested, path } of ordered) {
      const text = await this.readTextFile(absolutePath).catch(() => null)
      if (text === null) {
        if (requested) {
          findings.push(buildFinding(CODES.ARCHIVO_ILEGIBLE, path, 'El archivo no se puede leer.'))
        }
        continue
      }
      let content: unknown
      try {
        content = JSON.parse(text)
      } catch {
        if (requested) findings.push(buildFinding(CODES.JSON_INVALIDO, path, MALFORMED_JSON_DETAIL))
        continue
      }
      documents.push({ path, content, requested })
    }

    return { documents, findings }
  }

  /**
   * Puro: esquema por documento y chequeos del conjunto. Solo reporta hallazgos de
   * documentos `requested`; el `catalog` trae los puestos de todo el conjunto.
   */
  async validateDocuments(
    documents: PositionTemplateSourceDocument[]
  ): Promise<PositionTemplateValidationResult> {
    if (!documents.some((item) => item.requested)) {
      return toResult(
        [
          buildFinding(
            CODES.SIN_ARCHIVOS_DE_CONTENIDO,
            '(sin documentos)',
            'No hay ningún documento que revisar.'
          ),
        ],
        { jobProfiles: [] }
      )
    }

    const findings: PositionTemplateFinding[] = []
    const validated: PositionTemplateValidatedDocument[] = []
    for (const source of documents) {
      const outcome = await this.validateSchema(source)
      findings.push(...outcome.findings)
      if (outcome.document !== null) validated.push(outcome.document)
    }

    for (const item of validated) {
      for (const check of POSITION_TEMPLATE_DOCUMENT_CHECKS) findings.push(...check(item))
    }
    for (const check of POSITION_TEMPLATE_SET_CHECKS) findings.push(...check(validated))

    const requestedFiles = new Set(
      documents.filter((item) => item.requested).map((item) => item.path)
    )
    const reported = findings.filter((item) => requestedFiles.has(fileOfSubject(item.subject)))

    return toResult(reported, {
      jobProfiles: validated.flatMap(({ file, document }) =>
        (document.puestos ?? []).map((item, index) => ({ file, index, item }))
      ),
    })
  }

  /** `loadFromPaths` + `validateDocuments`; une los hallazgos de ambos. */
  async validatePaths(paths: string[]): Promise<PositionTemplateValidationResult> {
    const loaded = await this.loadFromPaths(paths)
    if (!loaded.documents.some((item) => item.requested)) {
      return loaded.findings.length > 0
        ? toResult(loaded.findings, { jobProfiles: [] })
        : this.validateDocuments([])
    }
    const validated = await this.validateDocuments(loaded.documents)
    if (loaded.findings.length === 0) return validated
    return toResult([...loaded.findings, ...validated.findings], { jobProfiles: [] })
  }

  /** Pasos 1 a 3: sobre, `null` y esquema vine. Un documento rechazado no sigue. */
  private async validateSchema(
    source: PositionTemplateSourceDocument
  ): Promise<{
    findings: PositionTemplateFinding[]
    document: PositionTemplateValidatedDocument | null
  }> {
    const { path: file, content: raw, requested } = source
    if (!isRecord(raw) || raw.version_formato !== POSITION_TEMPLATE_FORMAT_VERSION) {
      return {
        findings: [
          buildFinding(
            CODES.FORMATO_NO_SOPORTADO,
            dataSubject(file, ['version_formato']),
            `El documento debe ser un objeto con "version_formato": ${POSITION_TEMPLATE_FORMAT_VERSION} (número, no texto).`
          ),
        ],
        document: null,
      }
    }

    const nullPaths: string[][] = []
    collectNullPaths(raw, [], nullPaths)
    const findings = nullPaths.map((segments) =>
      buildFinding(
        CODES.DATO_FUERA_DEL_ESQUEMA,
        dataSubject(file, segments),
        `${describeLocation(raw, segments)}: el dato "${segments[segments.length - 1]}" no puede ser null; si no aplica, omítelo.`
      )
    )
    const nullFields = new Set(nullPaths.map((segments) => segments.join('.')))

    try {
      const document = await positionTemplateFileValidator.validate(raw)
      if (findings.length > 0) return { findings, document: null }
      return { findings, document: { file, requested, raw, document } }
    } catch (error) {
      if (!(error instanceof vineErrors.E_VALIDATION_ERROR)) throw error
      for (const message of this.schemaMessages(error)) {
        if (nullFields.has(message.field)) continue
        findings.push(this.schemaFinding(file, raw, message.field, message.rule))
      }
      return { findings, document: null }
    }
  }

  private schemaMessages(
    error: InstanceType<typeof vineErrors.E_VALIDATION_ERROR>
  ): { field: string; rule: string }[] {
    const messages: unknown = error.messages
    if (!Array.isArray(messages)) return []
    return messages.flatMap((item: unknown) => {
      if (!isRecord(item) || typeof item.field !== 'string' || typeof item.rule !== 'string') {
        return []
      }
      return [{ field: item.field, rule: item.rule }]
    })
  }

  /** Un mensaje de vine como hallazgo: cita la ruta y la regla, nunca el valor. */
  private schemaFinding(
    file: string,
    raw: unknown,
    field: string,
    rule: string
  ): PositionTemplateFinding {
    const segments = field.split('.')
    const last = segments[segments.length - 1]
    const location = describeLocation(raw, segments)
    const isAttribution = last === 'atribucion' || segments[segments.length - 2] === 'atribucion'
    const attributionDetail = ATTRIBUTION_REQUIRED_DETAILS[last]
    if (rule === 'required' && isAttribution && attributionDetail !== undefined) {
      return buildFinding(
        CODES.ATRIBUCION_INCOMPLETA,
        dataSubject(file, segments),
        `${location}: ${attributionDetail}`
      )
    }
    return buildFinding(
      CODES.DATO_FUERA_DEL_ESQUEMA,
      dataSubject(file, segments),
      `${location}, dato "${last}": no cumple la regla "${rule}" del esquema.`
    )
  }

  /**
   * `*.json` de primer nivel de una carpeta, en orden alfabético. Un enlace simbólico
   * no se sigue: si `findings` viene, se reporta; si es contexto, se omite.
   */
  private async listJsonFiles(
    directory: string,
    realRoot: string,
    findings: PositionTemplateFinding[] | null
  ): Promise<string[]> {
    const entries = await readdir(directory, { withFileTypes: true }).catch(() => [])
    const files: string[] = []
    for (const entry of [...entries].sort((left, right) => left.name.localeCompare(right.name))) {
      if (extname(entry.name) !== '.json') continue
      const absolute = join(directory, entry.name)
      if (entry.isSymbolicLink()) {
        findings?.push(this.pathNotAllowed(this.toSubject(realRoot, absolute)))
        continue
      }
      if (entry.isFile()) files.push(absolute)
    }
    return files
  }

  private pathNotAllowed(subject: string): PositionTemplateFinding {
    return buildFinding(
      CODES.RUTA_NO_PERMITIDA,
      subject,
      'Solo se revisan archivos .json dentro de la app, sin enlaces simbólicos. El archivo no se leyó.'
    )
  }

  private isInside(root: string, target: string): boolean {
    return target.startsWith(root + sep)
  }

  private toSubject(realRoot: string, absolutePath: string): string {
    return relative(realRoot, absolutePath).split(sep).join('/')
  }
}
