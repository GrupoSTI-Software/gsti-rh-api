import { HttpContext } from '@adonisjs/core/http'
import RegulatoryCoverageService from './regulatory_coverage.service.js'

/**
 * Controller del módulo regulatory-coverage.
 *
 * Expone el endpoint GET /api/v1/regulatory-coverage que devuelve el resumen
 * de cobertura regulatoria del producto Valanserh frente a las normas vigentes.
 *
 * El cálculo usa la fórmula ponderada sobre numerales hoja:
 *   coveragePercentage = (total × 1 + parcial × 0.5) / evaluableClauses × 100
 *
 * Solo se consideran funcionalidades con systemFeatureStatus = 'disponible'.
 * Normas derogadas o modificadas no aparecen en la respuesta.
 * El resultado se cachea en memoria por 5 minutos (TTL).
 */
export default class RegulatoryCoverageController {
  /**
   * @swagger
   * /api/v1/regulatory-coverage:
   *   get:
   *     summary: Resumen de cobertura regulatoria por norma
   *     description: |
   *       Devuelve el porcentaje de cobertura que el producto Valanserh da a cada
   *       norma vigente (NOM, LEY, REGLAMENTO, etc.), calculado sobre los numerales
   *       hoja con la fórmula ponderada: `(coveredTotal × 1 + coveredPartial × 0.5)
   *       / evaluableClauses × 100`, redondeado a 1 decimal.
   *
   *       **Numeral hoja**: cláusula sin sub-cláusulas, unidad evaluable real.
   *       Los numerales agrupadores (capítulos, secciones) no cuentan en el denominador.
   *
   *       **Features consideradas**: solo las que tienen `systemFeatureStatus = 'disponible'`.
   *       Mapeos a features en estado `planeado` o `en_desarrollo` se ignoran.
   *
   *       **Norma sin numerales hoja**: devuelve `evaluableClauses: 0` y
   *       `coveragePercentage: null` para distinguir de "0% cubierto".
   *
   *       **Caché**: la respuesta se cachea 5 minutos en el servidor.
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - RegulatoryCoverage
   *     responses:
   *       200:
   *         description: Cobertura calculada correctamente
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   example: success
   *                 title:
   *                   type: string
   *                 message:
   *                   type: string
   *                 data:
   *                   type: object
   *                   properties:
   *                     regulations:
   *                       type: array
   *                       items:
   *                         type: object
   *                         properties:
   *                           regulationId:
   *                             type: integer
   *                             example: 1
   *                           regulationCode:
   *                             type: string
   *                             example: "NOM-035-STPS"
   *                           regulationTitle:
   *                             type: string
   *                             example: "Factores de Riesgo en el Trabajo"
   *                           regulationType:
   *                             type: string
   *                             example: "NOM"
   *                           regulationVersion:
   *                             type: string
   *                             example: "2018"
   *                           regulationStatus:
   *                             type: string
   *                             example: "vigente"
   *                           authority:
   *                             type: object
   *                             properties:
   *                               slug:
   *                                 type: string
   *                                 example: "stps"
   *                               shortName:
   *                                 type: string
   *                                 example: "STPS"
   *                           evaluableClauses:
   *                             type: integer
   *                             example: 35
   *                             description: Numerales hoja totales (denominador)
   *                           coveredTotal:
   *                             type: integer
   *                             example: 12
   *                           coveredPartial:
   *                             type: integer
   *                             example: 8
   *                           uncovered:
   *                             type: integer
   *                             example: 15
   *                           coveragePercentage:
   *                             type: number
   *                             nullable: true
   *                             example: 45.7
   *                             description: >
   *                               Porcentaje ponderado redondeado a 1 decimal.
   *                               null cuando evaluableClauses = 0.
   *       401:
   *         description: No autenticado
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 title:
   *                   type: string
   *                 detail:
   *                   type: string
   *                 key:
   *                   type: string
   *                   example: no-autenticado
   *       500:
   *         description: Error interno en el cálculo de cobertura
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 title:
   *                   type: string
   *                 detail:
   *                   type: string
   *                 key:
   *                   type: string
   *                   example: error-calculo-cobertura
   */
  async index(ctx: HttpContext) {
    return runRegulatoryCoverageIndex(ctx)
  }
}

/**
 * Lógica del endpoint index, extraída para facilitar pruebas unitarias
 * sin pasar por el contenedor IoC de AdonisJS.
 */
export async function runRegulatoryCoverageIndex(
  ctx: HttpContext,
  service: RegulatoryCoverageService = new RegulatoryCoverageService()
) {
  const { response, auth, i18n } = ctx
  const t = i18n.formatMessage.bind(i18n)

  try {
    const user = auth.user
    if (!user) {
      return response.status(401).json({
        title: t('unauthenticated'),
        detail: t('unauthenticated'),
        key: 'no-autenticado',
      })
    }

    const regulations = await service.getCoverage()

    return response.status(200).json({
      type: 'success',
      title: t('resources'),
      message: t('resources_were_found_successfully'),
      data: { regulations },
    })
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : String(error)
    return response.status(500).json({
      title: t('server_error'),
      detail,
      key: 'error-calculo-cobertura',
    })
  }
}
