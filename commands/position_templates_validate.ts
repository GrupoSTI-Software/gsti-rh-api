import { fileURLToPath } from 'node:url'
import { BaseCommand, args } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import { POSITION_TEMPLATE_DATA_DIR } from '#constants/position_template_format'
import PositionTemplateValidationService from '#modules/position-templates/position_template_validation.service'
import type { PositionTemplateFinding } from '#modules/position-templates/dto/position_template.dto'

/**
 * Revisión automática del archivo de plantillas de puesto (VLRH-H1792026425571).
 * Guía del formato: `database/data/position_templates/README.md`.
 *
 * De **solo lectura**: no arranca la app ni toca la BD, no corrige ni carga nada.
 * Recibe archivos o carpetas relativos a la raíz de la app; sin argumentos revisa
 * `database/data/position_templates/`.
 *
 * El servicio se instancia aquí y no por el contenedor: solo necesita la raíz de la
 * app y no hay nada que inyectar con `startApp: false`.
 *
 * Código de salida: 1 ante cualquier hallazgo, incluida una carpeta sin contenido;
 * 0 solo con al menos un documento revisado y cero hallazgos.
 */
export default class PositionTemplatesValidate extends BaseCommand {
  static readonly commandName = 'position-templates:validate'
  static readonly description =
    'Revisión de solo lectura del archivo de plantillas de puesto: formato, atribución y duplicados'

  static readonly options: CommandOptions = {
    startApp: false,
  }

  @args.spread({
    description: `Archivos o carpetas a revisar, relativos a la raíz de la app (por defecto ${POSITION_TEMPLATE_DATA_DIR})`,
    required: false,
  })
  declare paths?: string[]

  async run() {
    const paths = this.paths && this.paths.length > 0 ? this.paths : [POSITION_TEMPLATE_DATA_DIR]
    this.logger.info(`position-templates:validate — revisando ${paths.join(', ')}`)

    const service = new PositionTemplateValidationService(fileURLToPath(this.app.appRoot))
    const result = await service.validatePaths(paths)

    if (result.ok) {
      this.logger.success(
        `position-templates:validate — fin: sin hallazgos (${result.catalog.jobProfiles.length} puesto(s) tipo)`
      )
      return
    }

    for (const [file, findings] of this.groupByFile(result.findings)) {
      this.logger.info(`\n${file}:`)
      for (const item of findings) {
        this.logger.info(`  - [${item.code}] ${item.subject}: ${item.detail}`)
      }
    }
    this.logger.error(
      `position-templates:validate — fin: ${result.findings.length} hallazgo(s); el contenido no es válido`
    )
    this.exitCode = 1
  }

  private groupByFile(findings: PositionTemplateFinding[]): Map<string, PositionTemplateFinding[]> {
    const groups = new Map<string, PositionTemplateFinding[]>()
    for (const item of findings) {
      const file = item.subject.split('#')[0]
      groups.set(file, [...(groups.get(file) ?? []), item])
    }
    return groups
  }
}
