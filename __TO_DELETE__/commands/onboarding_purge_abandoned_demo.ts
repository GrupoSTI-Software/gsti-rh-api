import { DateTime } from 'luxon'
import { BaseCommand, flags } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import env from '#start/env'
import OnboardingError from '#exceptions/onboarding_error'
import OnboardingUserState from '#models/onboarding_user_state'
import DemoWipeService from '#modules/onboarding/demo_seed/services/demo_wipe.service'
import { ONBOARDING_DEMO_ABANDON_DAYS } from '#modules/onboarding/onboarding.constants'

/**
 * Purga de siembras demo abandonadas del onboarding (USRH1785438247062):
 * limpia las siembras con más de ONBOARDING_DEMO_ABANDON_DAYS días sin que el
 * recorrido se haya terminado ni omitido, reutilizando el borrado de
 * USRH1785438246903 TAL CUAL en modo purga (sin outcome: el status del
 * recorrido NO se toca — si el administrador vuelve, re-siembra fresco).
 *
 * Corrida global documentada como decisión (calibración 2026-07-16): itera
 * SIN scope de request; la garantía multi-tenant no viene de TenantContext
 * sino del servicio de borrado (IDs registrados + snapshot de BU fila a fila).
 * La selección de candidatas usa EXCLUSIVAMENTE las marcas de tracking —
 * nombres o alias jamás son criterio.
 *
 * Disparo normal: scheduler diario (ver `start/scheduler.ts`). Manual:
 * `node ace onboarding:purge-abandoned-demo [--force]`.
 *
 * Guard de entorno: fuera de producción no corre solo (mismo patrón que
 * `billing:tick-subscriptions`). Un fallo por ítem queda logueado y no
 * detiene a las demás; la fallida vuelve a ser candidata al día siguiente.
 */
export default class OnboardingPurgeAbandonedDemo extends BaseCommand {
  static readonly commandName = 'onboarding:purge-abandoned-demo'
  static readonly description =
    'Purga siembras demo del onboarding con más de 30 días de abandono (sin cerrar recorridos)'

  static readonly options: CommandOptions = {
    startApp: true,
  }

  @flags.boolean({
    description: 'Corre aunque NODE_ENV no sea "production" (para pruebas manuales controladas).',
  })
  declare force: boolean

  async run() {
    if (env.get('NODE_ENV') !== 'production' && this.force !== true) {
      this.logger.info(
        'onboarding:purge-abandoned-demo — se omite: el entorno no es producción (usa --force para forzar)'
      )
      this.exitCode = 1
      return
    }

    const threshold = DateTime.now().minus({ days: ONBOARDING_DEMO_ABANDON_DAYS })
    this.logger.info(
      `onboarding:purge-abandoned-demo — inicio (umbral: siembras previas a ${threshold.toFormat('yyyy-LL-dd HH:mm')})`
    )

    const candidates = await OnboardingUserState.query()
      .whereNotNull('onboarding_user_state_demo_seeded_at')
      .whereNull('onboarding_user_state_demo_cleaned_at')
      .where(
        'onboarding_user_state_demo_seeded_at',
        '<',
        threshold.toSQL({ includeOffset: false })!
      )
      .orderBy('onboarding_user_state_id')

    if (candidates.length === 0) {
      this.logger.info('onboarding:purge-abandoned-demo — fin: sin siembras abandonadas')
      return
    }

    const wipeService = new DemoWipeService()
    let cleaned = 0
    let noop = 0
    let failed = 0

    for (const candidate of candidates) {
      try {
        const result = await wipeService.wipeDemoSeed({
          onboardingUserStateId: candidate.onboardingUserStateId,
        })
        cleaned++
        this.logger.info(
          `  limpiada siembra del estado #${candidate.onboardingUserStateId} ` +
            `(user ${candidate.userId}): empleado=${result.wiped.employees} ` +
            `usuario=${result.wiped.users} checadas=${result.wiped.assists}`
        )
      } catch (error: unknown) {
        if (error instanceof OnboardingError && error.key === 'siembra-demo-no-encontrada') {
          // La siembra desapareció entre la query y el wipe: ítem no-op.
          noop++
          continue
        }
        failed++
        const message = error instanceof Error ? error.message : JSON.stringify(error)
        this.logger.error(
          `  fallo al purgar el estado #${candidate.onboardingUserStateId} ` +
            `(user ${candidate.userId}): ${message} — se reintenta en la corrida siguiente`
        )
      }
    }

    this.logger.info(
      `onboarding:purge-abandoned-demo — fin: encontradas=${candidates.length} ` +
        `limpiadas=${cleaned} no-op=${noop} fallidas=${failed}`
    )
  }
}
