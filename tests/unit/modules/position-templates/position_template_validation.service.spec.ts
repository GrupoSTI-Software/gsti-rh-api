import { test } from '@japa/runner'
import { createHash } from 'node:crypto'
import { mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import app from '@adonisjs/core/services/app'
import {
  POSITION_TEMPLATE_ERROR_CATALOG,
  POSITION_TEMPLATE_ERROR_CODES,
  type PositionTemplateErrorCode,
} from '#constants/position_template_error_codes'
import PositionTemplateValidationService from '#modules/position-templates/position_template_validation.service'
import type {
  PositionTemplateFinding,
  PositionTemplateSourceDocument,
} from '#modules/position-templates/dto/position_template.dto'

/**
 * Revisión del archivo de plantillas (VLRH-H1792026425571). Cada escenario parte de
 * un clon del ejemplo válido, rompe una sola cosa y espera su hallazgo exacto, con la
 * ruta del dato. Sin BD: el servicio solo lee archivos.
 */

const CODES = POSITION_TEMPLATE_ERROR_CODES
const APP_ROOT = fileURLToPath(app.appRoot)
const FIXTURE_DIR = 'tests/fixtures/position_templates'
const FIXTURE = `${FIXTURE_DIR}/valid_example.json`
const MALFORMED = `${FIXTURE_DIR}/invalid/malformed.json`
const DECOY = 'SENUELO-NO-DEBE-SALIR-EN-CONSOLA'
const SCRATCH_DIR = 'tmp/position-templates-spec'

type JsonRecord = Record<string, unknown>

function asRecord(value: unknown): JsonRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Se esperaba un objeto en el fixture')
  }
  return value as JsonRecord
}

function asList(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new Error('Se esperaba una lista en el fixture')
  return value
}

/** Puesto `index` del clon. */
function job(document: JsonRecord, index: number): JsonRecord {
  return asRecord(asList(document.puestos)[index])
}

/** Elemento `index` de la lista `list` del puesto `jobIndex`. */
function element(document: JsonRecord, jobIndex: number, list: string, index: number): JsonRecord {
  return asRecord(asList(job(document, jobIndex)[list])[index])
}

async function loadExample(): Promise<JsonRecord> {
  return asRecord(JSON.parse(await readFile(join(APP_ROOT, FIXTURE), 'utf8')))
}

function service(): PositionTemplateValidationService {
  return new PositionTemplateValidationService(APP_ROOT)
}

function asDocument(content: unknown, path = FIXTURE): PositionTemplateSourceDocument {
  return { path, content, requested: true }
}

/** Hallazgos de validar un clon del ejemplo con una rotura. */
async function findingsOf(
  mutate: (document: JsonRecord) => void
): Promise<PositionTemplateFinding[]> {
  const document = structuredClone(await loadExample())
  mutate(document)
  const result = await service().validateDocuments([asDocument(document)])
  return result.findings
}

function codesOf(findings: PositionTemplateFinding[]): PositionTemplateErrorCode[] {
  return findings.map((item) => item.code)
}

function subjectsOf(findings: PositionTemplateFinding[]): string[] {
  return findings.map((item) => item.subject)
}

test.group('Revisión del archivo de plantillas | ejemplo y atribución', () => {
  test('CA-1: el ejemplo pasa sin hallazgos y trae los 5 puestos tipo', async ({ assert }) => {
    const result = await service().validateDocuments([asDocument(await loadExample())])
    assert.isTrue(result.ok)
    assert.deepEqual(result.findings, [])
    assert.lengthOf(result.catalog?.jobProfiles ?? [], 5)

    const fromDisk = await service().validatePaths([FIXTURE_DIR])
    assert.isTrue(fromDisk.ok, JSON.stringify(fromDisk.findings))
  })

  test('CA-2: competencia de O*NET sin fuente da un solo hallazgo con el dato exacto', async ({
    assert,
  }) => {
    const findings = await findingsOf((document) => {
      delete asRecord(element(document, 0, 'competencias', 0).atribucion).fuente
    })
    assert.lengthOf(findings, 1)
    const [finding] = findings
    assert.equal(finding.code, CODES.ATRIBUCION_INCOMPLETA)
    assert.equal(finding.key, 'atribucion-incompleta')
    assert.equal(finding.title, 'Atribución incompleta')
    assert.isTrue(finding.subject.endsWith('#puestos.0.competencias.0.atribucion.fuente'))
    assert.include(finding.detail, 'pt-avp-piloto')
    assert.include(finding.detail, 'Operación de aeronaves')
  })

  test('CA-3: id_en_fuente según la fuente y adaptado estricto', async ({ assert }) => {
    const withoutId = await findingsOf((document) => {
      delete asRecord(element(document, 0, 'funciones', 0).atribucion).id_en_fuente
    })
    assert.deepEqual(codesOf(withoutId), [CODES.ATRIBUCION_INCOMPLETA])
    assert.isTrue(withoutId[0].subject.endsWith('#puestos.0.funciones.0.atribucion.id_en_fuente'))

    const ownWithId = await findingsOf((document) => {
      asRecord(job(document, 0).objetivo).atribucion = {
        fuente: 'propio',
        id_en_fuente: 'x-1',
        adaptado: false,
      }
    })
    assert.deepEqual(codesOf(ownWithId), [CODES.ATRIBUCION_INCONSISTENTE])
    assert.isTrue(ownWithId[0].subject.endsWith('#puestos.0.objetivo.atribucion.id_en_fuente'))

    const adaptedAsText = await findingsOf((document) => {
      asRecord(element(document, 0, 'funciones', 1).atribucion).adaptado = 'true'
    })
    assert.deepEqual(codesOf(adaptedAsText), [CODES.DATO_FUERA_DEL_ESQUEMA])
    assert.isTrue(adaptedAsText[0].subject.endsWith('#puestos.0.funciones.1.atribucion.adaptado'))
  })

  test('falta la atribución completa de una herramienta', async ({ assert }) => {
    const findings = await findingsOf((document) => {
      delete element(document, 4, 'herramientas', 1).atribucion
    })
    assert.deepEqual(codesOf(findings), [CODES.ATRIBUCION_INCOMPLETA])
    assert.isTrue(findings[0].subject.endsWith('#puestos.4.herramientas.1.atribucion'))
  })
})

test.group('Revisión del archivo de plantillas | esquema del puesto tipo', () => {
  test('CA-4: función sin frecuencia, sin codigo_sinco, sin objetivo o SINCO mal formado', async ({
    assert,
  }) => {
    const cases: [(document: JsonRecord) => void, string][] = [
      [
        (document) => delete element(document, 1, 'funciones', 0).frecuencia,
        '#puestos.1.funciones.0.frecuencia',
      ],
      [(document) => delete job(document, 2).codigo_sinco, '#puestos.2.codigo_sinco'],
      [(document) => delete job(document, 3).objetivo, '#puestos.3.objetivo'],
      [(document) => (job(document, 3).codigo_sinco = '12a4'), '#puestos.3.codigo_sinco'],
    ]
    for (const [mutate, path] of cases) {
      const findings = await findingsOf(mutate)
      assert.deepEqual(codesOf(findings), [CODES.DATO_FUERA_DEL_ESQUEMA], path)
      assert.isTrue(findings[0].subject.endsWith(path), path)
    }
  })

  test('CA-5: nivel fuera de escala, nivel como texto o tipo transversal', async ({ assert }) => {
    const cases: [(competency: JsonRecord) => void, string][] = [
      [(competency) => (competency.nivel_esperado = 6), 'nivel_esperado'],
      [(competency) => (competency.nivel_esperado = '3'), 'nivel_esperado'],
      [(competency) => (competency.tipo = 'transversal'), 'tipo'],
    ]
    for (const [mutate, field] of cases) {
      const findings = await findingsOf((document) =>
        mutate(element(document, 1, 'competencias', 0))
      )
      assert.deepEqual(codesOf(findings), [CODES.DATO_FUERA_DEL_ESQUEMA], field)
      assert.isTrue(findings[0].subject.endsWith(`#puestos.1.competencias.0.${field}`), field)
    }
  })

  test('CA-6: certificación con categoría inexistente o sin emisor', async ({ assert }) => {
    const badCategory = await findingsOf((document) => {
      element(document, 2, 'certificaciones', 0).categoria = 'calidad'
    })
    assert.deepEqual(codesOf(badCategory), [CODES.DATO_FUERA_DEL_ESQUEMA])
    assert.isTrue(badCategory[0].subject.endsWith('#puestos.2.certificaciones.0.categoria'))

    const noIssuer = await findingsOf((document) => {
      delete element(document, 0, 'certificaciones', 0).emisor
    })
    assert.deepEqual(codesOf(noIssuer), [CODES.DATO_FUERA_DEL_ESQUEMA])
    assert.isTrue(noIssuer[0].subject.endsWith('#puestos.0.certificaciones.0.emisor'))
  })

  test('CA-7: herramienta sin tipo de activo sugerido o con categoría de teletrabajo inválida', async ({
    assert,
  }) => {
    const noAssetType = await findingsOf((document) => {
      delete element(document, 1, 'herramientas', 0).tipo_activo_sugerido
    })
    assert.deepEqual(codesOf(noAssetType), [CODES.DATO_FUERA_DEL_ESQUEMA])
    assert.isTrue(noAssetType[0].subject.endsWith('#puestos.1.herramientas.0.tipo_activo_sugerido'))

    const badCategory = await findingsOf((document) => {
      asRecord(element(document, 4, 'herramientas', 1).tipo_activo_sugerido).categoria_teletrabajo =
        'chair'
    })
    assert.deepEqual(codesOf(badCategory), [CODES.DATO_FUERA_DEL_ESQUEMA])
    assert.isTrue(
      badCategory[0].subject.endsWith(
        '#puestos.4.herramientas.1.tipo_activo_sugerido.categoria_teletrabajo'
      )
    )
  })

  test('CA-11: alcance contra giros', async ({ assert }) => {
    const giroWithout = await findingsOf((document) => delete job(document, 0).giros)
    assert.deepEqual(codesOf(giroWithout), [CODES.ALCANCE_INCONSISTENTE])
    assert.isTrue(giroWithout[0].subject.endsWith('#puestos.0.giros'))

    const transversalWith = await findingsOf((document) => {
      job(document, 4).giros = ['hoteleria']
    })
    assert.deepEqual(codesOf(transversalWith), [CODES.ALCANCE_INCONSISTENTE])
    assert.isTrue(transversalWith[0].subject.endsWith('#puestos.4.giros'))
  })

  test('CA-12: campo desconocido y null nunca se descartan en silencio', async ({ assert }) => {
    for (const key of ['requisito', 'businessUnitId']) {
      const findings = await findingsOf((document) => {
        job(document, 1)[key] = 'x'
      })
      assert.deepEqual(codesOf(findings), [CODES.CAMPO_DESCONOCIDO], key)
      assert.isTrue(findings[0].subject.endsWith(`#puestos.1.${key}`), key)
    }

    const nested = await findingsOf((document) => {
      asRecord(element(document, 0, 'competencias', 1).atribucion).url = 'x'
    })
    assert.deepEqual(codesOf(nested), [CODES.CAMPO_DESCONOCIDO])
    assert.isTrue(nested[0].subject.endsWith('#puestos.0.competencias.1.atribucion.url'))

    const withNull = await findingsOf((document) => {
      job(document, 2).requisitos = null
    })
    assert.deepEqual(codesOf(withNull), [CODES.DATO_FUERA_DEL_ESQUEMA])
    assert.isTrue(withNull[0].subject.endsWith('#puestos.2.requisitos'))
  })

  test('CA-13: idioma, versión del formato y documento vacío', async ({ assert }) => {
    const english = await findingsOf((document) => (document.idioma = 'en'))
    assert.deepEqual(codesOf(english), [CODES.DATO_FUERA_DEL_ESQUEMA])
    assert.isTrue(english[0].subject.endsWith('#idioma'))

    for (const version of [2, '1']) {
      const findings = await findingsOf((document) => {
        document.version_formato = version
        job(document, 0).nombre = ''
      })
      assert.deepEqual(codesOf(findings), [CODES.FORMATO_NO_SOPORTADO], String(version))
    }

    const empty = await service().validateDocuments([
      asDocument({ version_formato: 1, idioma: 'es', puestos: [] }),
    ])
    assert.deepEqual(codesOf(empty.findings), [CODES.DOCUMENTO_VACIO])
  })

  test('CA-14: varios problemas en puestos distintos salen juntos y ordenados', async ({
    assert,
  }) => {
    const findings = await findingsOf((document) => {
      element(document, 3, 'certificaciones', 0).categoria = 'calidad'
      element(document, 1, 'competencias', 0).nivel_esperado = 6
      delete element(document, 0, 'funciones', 1).frecuencia
    })
    assert.deepEqual(subjectsOf(findings), [
      `${FIXTURE}#puestos.0.funciones.1.frecuencia`,
      `${FIXTURE}#puestos.1.competencias.0.nivel_esperado`,
      `${FIXTURE}#puestos.3.certificaciones.0.categoria`,
    ])
  })
})

test.group('Revisión del archivo de plantillas | duplicados', () => {
  test('CA-8: código y versión repetidos entre documentos', async ({ assert }) => {
    const example = await loadExample()
    const restaurantManager = job(example, 2)
    const second = (version: number) =>
      asDocument(
        {
          version_formato: 1,
          idioma: 'es',
          puestos: [{ ...structuredClone(restaurantManager), version }],
        },
        `${FIXTURE_DIR}/second.json`
      )

    const duplicated = await service().validateDocuments([asDocument(example), second(1)])
    assert.deepEqual(codesOf(duplicated.findings), [CODES.CODIGO_Y_VERSION_DUPLICADOS])
    const detail = duplicated.findings[0]?.detail ?? ''
    assert.include(detail, 'pt-res-gerente')
    assert.include(detail, 'versión 1')

    const nextVersion = await service().validateDocuments([asDocument(example), second(2)])
    assert.isTrue(nextVersion.ok, JSON.stringify(nextVersion.findings))
  })

  test('CA-9: elemento repetido en el puesto con nombre normalizado', async ({ assert }) => {
    for (const name of ['  LIDERAZGO ', 'Líderazgo']) {
      const findings = await findingsOf((document) => {
        // Mismo tipo que "Liderazgo": la única rotura es el nombre repetido.
        Object.assign(element(document, 2, 'competencias', 1), { nombre: name, tipo: 'functional' })
      })
      assert.deepEqual(codesOf(findings), [CODES.ELEMENTO_DUPLICADO_EN_PUESTO], name)
      assert.isTrue(findings[0].subject.endsWith('#puestos.2.competencias.1.nombre'), name)
    }

    const cases: [string, number, string][] = [
      ['funciones', 0, 'Elaborar el plan de vuelo'],
      ['herramientas', 4, 'Silla de oficina'],
    ]
    for (const [list, jobIndex, existing] of cases) {
      const findings = await findingsOf((document) => {
        const items = asList(job(document, jobIndex)[list])
        items.push({ ...asRecord(structuredClone(items[0])), nombre: existing })
      })
      assert.deepEqual(codesOf(findings), [CODES.ELEMENTO_DUPLICADO_EN_PUESTO], list)
    }

    const certification = await findingsOf((document) => {
      const items = asList(job(document, 3).certificaciones)
      items.push(structuredClone(items[0]))
    })
    assert.deepEqual(codesOf(certification), [CODES.ELEMENTO_DUPLICADO_EN_PUESTO])
    assert.isTrue(certification[0].subject.endsWith('#puestos.3.certificaciones.1.nombre'))
  })

  test('CA-10: una competencia con dos tipos en el conjunto', async ({ assert }) => {
    const findings = await findingsOf((document) => {
      element(document, 3, 'competencias', 0).tipo = 'technical'
    })
    assert.deepEqual(codesOf(findings), [CODES.TIPO_DE_COMPETENCIA_INCONSISTENTE])
    assert.include(findings[0].detail, 'Liderazgo')
    assert.include(findings[0].detail, 'pt-res-gerente')
    assert.include(findings[0].detail, 'pt-man-supervisor-produccion')
  })
})

test.group('Revisión del archivo de plantillas | carga confinada', (group) => {
  group.each.teardown(async () => {
    await rm(join(APP_ROOT, SCRATCH_DIR), { recursive: true, force: true })
  })

  test('CA-15: carpeta vacía o solo con README, y ruta inexistente, fallan', async ({ assert }) => {
    await mkdir(join(APP_ROOT, SCRATCH_DIR, 'empty'), { recursive: true })
    await mkdir(join(APP_ROOT, SCRATCH_DIR, 'readme-only'), { recursive: true })
    await writeFile(join(APP_ROOT, SCRATCH_DIR, 'readme-only', 'README.md'), '# Guía\n')

    for (const folder of ['empty', 'readme-only']) {
      const result = await service().validatePaths([`${SCRATCH_DIR}/${folder}`])
      assert.isFalse(result.ok, folder)
      assert.deepEqual(codesOf(result.findings), [CODES.SIN_ARCHIVOS_DE_CONTENIDO], folder)
    }

    const missing = await service().validatePaths([`${SCRATCH_DIR}/no-existe.json`])
    assert.deepEqual(codesOf(missing.findings), [CODES.ARCHIVO_ILEGIBLE])
  })

  test('CA-16: fuera de la app, enlace simbólico o sin .json no se leen', async ({ assert }) => {
    await mkdir(join(APP_ROOT, SCRATCH_DIR, 'with-link'), { recursive: true })
    await symlink(join(APP_ROOT, FIXTURE), join(APP_ROOT, SCRATCH_DIR, 'link.json'))
    await symlink(join(APP_ROOT, FIXTURE), join(APP_ROOT, SCRATCH_DIR, 'with-link', 'entry.json'))

    const readPaths: string[] = []
    const spied = new PositionTemplateValidationService(APP_ROOT, async (absolutePath) => {
      readPaths.push(absolutePath)
      return readFile(absolutePath, 'utf8')
    })

    const inputs = [
      tmpdir(),
      '../',
      `${SCRATCH_DIR}/link.json`,
      `${SCRATCH_DIR}/with-link`,
      'adonisrc.ts',
    ]
    for (const input of inputs) {
      const result = await spied.validatePaths([input])
      assert.include(codesOf(result.findings), CODES.RUTA_NO_PERMITIDA, input)
    }
    assert.deepEqual(readPaths, [])
  })

  test('CA-17: JSON roto no repite el contenido ni el error del parser', async ({ assert }) => {
    const result = await service().validatePaths([MALFORMED])
    assert.deepEqual(codesOf(result.findings), [CODES.JSON_INVALIDO])
    const output = JSON.stringify(result.findings)
    assert.notInclude(output, DECOY)
    assert.notInclude(output, 'Unexpected')
    assert.notInclude(output, 'is not valid JSON')
  })

  test('archivo suelto: los hermanos dan contexto pero no se reportan', async ({ assert }) => {
    const folder = join(APP_ROOT, SCRATCH_DIR, 'set')
    await mkdir(folder, { recursive: true })
    const example = await loadExample()
    await writeFile(join(folder, 'a.json'), JSON.stringify(example))
    await writeFile(join(folder, 'b.json'), JSON.stringify(example))
    await writeFile(join(folder, 'c.json'), '{ roto')

    const single = await service().validatePaths([`${SCRATCH_DIR}/set/a.json`])
    assert.isFalse(single.ok)
    assert.isTrue(
      single.findings.every((item) => item.subject.startsWith(`${SCRATCH_DIR}/set/a.json`))
    )
    assert.isTrue(single.findings.every((item) => item.code === CODES.CODIGO_Y_VERSION_DUPLICADOS))
    assert.lengthOf(single.findings, 5)
  })

  test('CA-18: solo lee; ni BD ni escritura en el slice y el comando', async ({ assert }) => {
    const sources = [
      'app/modules/position-templates/position_template_validation.service.ts',
      'app/modules/position-templates/validators/position_template_file.validator.ts',
      'app/modules/position-templates/dto/position_template.dto.ts',
      'commands/position_templates_validate.ts',
    ]
    for (const source of sources) {
      const text = await readFile(join(APP_ROOT, source), 'utf8')
      assert.notMatch(text, /#models\/|@adonisjs\/lucid|writeFile|db\./, source)
    }
    const command = await readFile(
      join(APP_ROOT, 'commands/position_templates_validate.ts'),
      'utf8'
    )
    assert.match(command, /startApp: false/)

    const digest = async () =>
      createHash('sha256')
        .update(await readFile(join(APP_ROOT, FIXTURE)))
        .digest('hex')
    const before = await digest()
    await service().validatePaths([FIXTURE_DIR])
    assert.equal(await digest(), before)
  })
})

test.group('Revisión del archivo de plantillas | catálogo de códigos', () => {
  test('CA-23: todo code empieza con TPL.VAL. y su key es el slug de su título', ({ assert }) => {
    const slug = (title: string) =>
      title
        .normalize('NFD')
        .replace(/\p{M}/gu, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')

    for (const code of Object.values(CODES)) {
      assert.isTrue(code.startsWith('TPL.VAL.'), code)
      const { title, key } = POSITION_TEMPLATE_ERROR_CATALOG[code]
      assert.equal(key, slug(title), code)
    }
  })
})
