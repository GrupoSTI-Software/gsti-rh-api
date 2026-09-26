import RegulationQuestionnaireAnswerScale from '#models/regulation_questionnaire_answer_scale'
import { BaseSeeder } from '@adonisjs/lucid/seeders'

/**
 * Semilla idempotente: Escalas de respuesta para Guía II y Guía III de NOM-035.
 */
export default class extends BaseSeeder {
  async run() {
    await RegulationQuestionnaireAnswerScale.updateOrCreate(
      { regulationQuestionnaireAnswerScaleCode: 'LIKERT_FREQ_5' },
      {
        regulationQuestionnaireAnswerScaleTitleKey: 'regulatory.answer_scales.likert_freq_5.title',
        regulationQuestionnaireAnswerScaleDefinition: {
          options: [
            { key: 'siempre', value: 4, reverseValue: 0 },
            { key: 'casi_siempre', value: 3, reverseValue: 1 },
            { key: 'algunas_veces', value: 2, reverseValue: 2 },
            { key: 'casi_nunca', value: 1, reverseValue: 3 },
            { key: 'nunca', value: 0, reverseValue: 4 },
          ],
        },
      }
    )
  }
}
