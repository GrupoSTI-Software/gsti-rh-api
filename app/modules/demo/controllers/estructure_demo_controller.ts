/* eslint-disable no-console -- trazas temporales modo demo */
import { HttpContext } from '@adonisjs/core/http'
import DemoFactoryService from '../services/demo_factory_service.js'

export default class EstructureDemoController {
  async generateFactoryDemo({ response, i18n, auth }: HttpContext) {
    const t = i18n.formatMessage.bind(i18n)
    const tag = `[DEMO-HTTP ${new Date().toISOString()}]`
    console.log(tag, 'generateFactoryDemo: entrada al controller')
    try {
      const service = new DemoFactoryService()
      console.log(tag, 'generateFactoryDemo: instanciado DemoFactoryService, llamando run()...')
      const result  = await service.run({
        requestingUserId: auth.user!.userId,
      })
      console.log(tag, 'generateFactoryDemo: run() terminó OK', {
        departments: result.departments,
        positions:   result.positions,
        shifts:      result.shifts,
        employees:   result.employees,
        users:       result.users,
        assists:     result.assists,
      })

      response.status(201)
      return {
        type:    'success',
        title:   t('information'),
        message: t('the_information_was_created_successfully'),
        data:    result,
      }
    } catch (error) {
      console.error(tag, 'generateFactoryDemo: ERROR en run()', {
        message: error instanceof Error ? error.message : String(error),
        stack:   error instanceof Error ? error.stack : undefined,
      })
      response.status(500)
      return {
        type:    'error',
        title:   t('server_error'),
        message: t('an_unexpected_error_has_occurred_on_the_server'),
        data:    { key: 'server-error' },
        error:   error instanceof Error ? error.message : String(error),
      }
    }
  }
}
