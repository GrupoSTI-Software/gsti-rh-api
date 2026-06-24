import { DateTime } from 'luxon'
import type { I18n } from '@adonisjs/i18n'
import db from '@adonisjs/lucid/services/db'
import QuestionnaireApplicationService from '#services/questionnaire_application_service'
import QuestionnaireApplicationTarget from '#models/questionnaire_application_target'
import RegulationQuestionnaire from '#models/regulation_questionnaire'
import QuestionnaireApplicationResponse from '#models/questionnaire_application_response'
import QuestionnaireApplicationAnswer from '#models/questionnaire_application_answer'
import { QUESTIONNAIRE_APPLICATION_ERROR_CODES } from '#constants/questionnaire_application_error_codes'
import { QuestionnaireApplicationServiceError } from '#exceptions/questionnaire_application_service_error'
import type {
  AnswerInput,
  InstrumentForCapture,
  InstrumentForCaptureSection,
  SubmitAnswersInput,
  SubmitAnswersResult,
} from '../interfaces/questionnaire_application_interface.js'

type ScaleOption = {
  key: string
  value: number
  reverseValue?: number
}

type QuestionDefinition = {
  questionId: number
  optionsByKey: Map<string, ScaleOption>
}

export default class QuestionnaireApplicationResponseService {
  private questionnaireApplicationService = new QuestionnaireApplicationService()

  async getInstrumentForTarget(
    questionnaireApplicationId: number,
    employeeId: number,
    allowedBusinessUnitIds: number[] = [],
    i18n?: I18n
  ): Promise<InstrumentForCapture> {
    const application = await this.questionnaireApplicationService.getById(
      questionnaireApplicationId,
      allowedBusinessUnitIds,
      i18n
    )

    this.ensureApplicationIsInProgress(application.status, i18n)
    await this.findTargetOrFail(questionnaireApplicationId, employeeId, i18n)

    const questionnaire = await this.loadQuestionnaireOrFail(application.regulationQuestionnaireId, i18n)

    return {
      questionnaireApplicationId: application.questionnaireApplicationId,
      employeeId,
      instrument: application.applicableInstrument,
      sections: questionnaire.sections.map((section): InstrumentForCaptureSection => ({
        titleKey: section.regulationQuestionnaireSectionTitleKey,
        ord: section.regulationQuestionnaireSectionOrd,
        questions: section.questions.map((question) => ({
          questionId: question.regulationQuestionnaireQuestionId,
          textKey: question.regulationQuestionnaireQuestionTextKey,
          helpKey: question.regulationQuestionnaireQuestionHelpKey,
          answerScale: {
            code: question.answerScale.regulationQuestionnaireAnswerScaleCode,
            options: (question.answerScale.regulationQuestionnaireAnswerScaleDefinition?.options ?? []).map(
              (option) => ({
                key: option.key,
                value: option.value,
              })
            ),
          },
        })),
      })),
    }
  }

  async submitAnswers(
    questionnaireApplicationId: number,
    employeeId: number,
    input: SubmitAnswersInput,
    allowedBusinessUnitIds: number[] = [],
    i18n?: I18n
  ): Promise<SubmitAnswersResult> {
    const application = await this.questionnaireApplicationService.getById(
      questionnaireApplicationId,
      allowedBusinessUnitIds,
      i18n
    )

    this.ensureApplicationIsInProgress(application.status, i18n)
    const target = await this.findTargetOrFail(questionnaireApplicationId, employeeId, i18n)

    if (target.questionnaireApplicationTargetStatus === 'respondido') {
      throw new QuestionnaireApplicationServiceError(
        this.translate(
          i18n,
          'nom035.questionnaire_application.already_answered',
          'Este empleado ya tiene respuestas registradas para esta ronda'
        ),
        QUESTIONNAIRE_APPLICATION_ERROR_CODES.ALREADY_ANSWERED,
        409,
        'captura-duplicada'
      )
    }

    const questionnaire = await this.loadQuestionnaireOrFail(application.regulationQuestionnaireId, i18n)
    const questionDefinitions = this.extractQuestionDefinitions(questionnaire.sections)
    this.ensureAnswersAreComplete(input.answers, questionDefinitions, i18n)
    const normalizedAnswers = this.validateAndNormalizeAnswers(input.answers, questionDefinitions, i18n)

    const submittedAt = DateTime.utc()
    const response = await db.transaction(async (trx) => {
      const createdResponse = await QuestionnaireApplicationResponse.create(
        {
          questionnaireApplicationId,
          employeeId,
          questionnaireApplicationResponseAnsweredCount: normalizedAnswers.length,
          questionnaireApplicationResponseSubmittedAt: submittedAt,
        },
        { client: trx }
      )

      await QuestionnaireApplicationAnswer.createMany(
        normalizedAnswers.map((answer) => ({
          questionnaireApplicationResponseId: createdResponse.questionnaireApplicationResponseId,
          regulationQuestionnaireQuestionId: answer.questionId,
          questionnaireApplicationAnswerOptionKey: answer.optionKey,
          questionnaireApplicationAnswerValue: answer.value,
        })),
        { client: trx }
      )

      target.useTransaction(trx)
      target.questionnaireApplicationTargetStatus = 'respondido'
      target.questionnaireApplicationTargetRespondedAt = submittedAt
      await target.save()

      return createdResponse
    })

    return {
      questionnaireApplicationResponseId: response.questionnaireApplicationResponseId,
      employeeId,
      answeredCount: normalizedAnswers.length,
      targetStatus: 'respondido',
      respondedAt: submittedAt.toISO()!,
    }
  }

  private async loadQuestionnaireOrFail(regulationQuestionnaireId: number, i18n?: I18n) {
    const questionnaire = await RegulationQuestionnaire.query()
      .where('regulation_questionnaire_id', regulationQuestionnaireId)
      .preload('sections', (sectionsQuery) => {
        sectionsQuery
          .orderBy('regulation_questionnaire_section_ord', 'asc')
          .preload('questions', (questionsQuery) => {
            questionsQuery
              .orderBy('regulation_questionnaire_question_ord', 'asc')
              .preload('answerScale')
          })
      })
      .first()

    if (!questionnaire) {
      throw new QuestionnaireApplicationServiceError(
        this.translate(
          i18n,
          'nom035.questionnaire_application.questionnaire_not_found',
          'No se encontró el cuestionario regulatorio configurado para el instrumento'
        ),
        QUESTIONNAIRE_APPLICATION_ERROR_CODES.SYS_UNHANDLED,
        500
      )
    }

    return questionnaire
  }

  private async findTargetOrFail(
    questionnaireApplicationId: number,
    employeeId: number,
    i18n?: I18n
  ): Promise<QuestionnaireApplicationTarget> {
    const target = await QuestionnaireApplicationTarget.query()
      .where('questionnaire_application_id', questionnaireApplicationId)
      .where('employee_id', employeeId)
      .first()

    if (!target) {
      throw new QuestionnaireApplicationServiceError(
        this.translate(
          i18n,
          'nom035.questionnaire_application.target_not_found',
          'El empleado no forma parte de los objetivos de esta ronda'
        ),
        QUESTIONNAIRE_APPLICATION_ERROR_CODES.TARGET_NOT_FOUND,
        404,
        'empleado-no-objetivo'
      )
    }

    return target
  }

  private ensureApplicationIsInProgress(status: string, i18n?: I18n): void {
    if (status === 'en-curso') {
      return
    }

    throw new QuestionnaireApplicationServiceError(
      this.translate(
        i18n,
        'nom035.questionnaire_application.not_applicable',
        'Solo se puede capturar en rondas en curso'
      ),
      QUESTIONNAIRE_APPLICATION_ERROR_CODES.NOT_APPLICABLE,
      422,
      'ronda-no-en-curso'
    )
  }

  private extractQuestionDefinitions(
    sections: Array<{
      questions: Array<{
        regulationQuestionnaireQuestionId: number
        answerScale: {
          regulationQuestionnaireAnswerScaleDefinition: {
            options: ScaleOption[]
          } | null
        }
      }>
    }>
  ): Map<number, QuestionDefinition> {
    const definitions = new Map<number, QuestionDefinition>()

    for (const section of sections) {
      for (const question of section.questions) {
        const options = question.answerScale?.regulationQuestionnaireAnswerScaleDefinition?.options ?? []
        const optionsByKey = new Map(options.map((option) => [option.key, option]))

        definitions.set(question.regulationQuestionnaireQuestionId, {
          questionId: question.regulationQuestionnaireQuestionId,
          optionsByKey,
        })
      }
    }

    return definitions
  }

  private ensureAnswersAreComplete(
    answers: AnswerInput[],
    questionDefinitions: Map<number, QuestionDefinition>,
    i18n?: I18n
  ): void {
    const totalQuestions = questionDefinitions.size
    if (totalQuestions === 0) {
      return
    }

    const expectedQuestionIds = new Set(questionDefinitions.keys())
    const receivedQuestionIds = answers.map((answer) => answer.questionId)
    const uniqueReceivedQuestionIds = new Set(receivedQuestionIds)

    const invalidQuestionIds = [...uniqueReceivedQuestionIds].filter(
      (questionId) => !expectedQuestionIds.has(questionId)
    )
    if (invalidQuestionIds.length > 0) {
      this.throwIncompleteAnswersError(
        i18n,
        `Se recibieron preguntas que no pertenecen al cuestionario: ${invalidQuestionIds.join(', ')}`
      )
    }

    const missingQuestionIds = [...expectedQuestionIds].filter(
      (questionId) => !uniqueReceivedQuestionIds.has(questionId)
    )

    if (
      answers.length !== totalQuestions ||
      uniqueReceivedQuestionIds.size !== totalQuestions ||
      missingQuestionIds.length > 0
    ) {
      const detailParts = [
        `Se esperaban ${totalQuestions} respuestas y se recibieron ${answers.length}.`,
      ]

      if (missingQuestionIds.length > 0) {
        detailParts.push(`Faltan preguntas por responder: ${missingQuestionIds.join(', ')}.`)
      }

      if (uniqueReceivedQuestionIds.size !== answers.length) {
        detailParts.push('Hay preguntas duplicadas en la carga.')
      }

      this.throwIncompleteAnswersError(i18n, detailParts.join(' '))
    }
  }

  private throwIncompleteAnswersError(i18n?: I18n, detail?: string): never {
    const message = this.translate(
      i18n,
      'nom035.questionnaire_application.incomplete_answers',
      'Debes responder todas las preguntas del cuestionario antes de guardar'
    )

    throw new QuestionnaireApplicationServiceError(
      message,
      QUESTIONNAIRE_APPLICATION_ERROR_CODES.INCOMPLETE_ANSWERS,
      422,
      'cuestionario-incompleto',
      detail ?? message
    )
  }

  private validateAndNormalizeAnswers(
    answers: AnswerInput[],
    questionDefinitions: Map<number, QuestionDefinition>,
    i18n?: I18n
  ): Array<{ questionId: number; optionKey: string; value: number }> {
    return answers.map((answer) => {
      const question = questionDefinitions.get(answer.questionId)

      if (!question) {
        throw new QuestionnaireApplicationServiceError(
          this.translate(
            i18n,
            'nom035.questionnaire_application.incomplete_answers',
            'Debes responder todas las preguntas del cuestionario antes de guardar'
          ),
          QUESTIONNAIRE_APPLICATION_ERROR_CODES.INCOMPLETE_ANSWERS,
          422,
          'cuestionario-incompleto'
        )
      }

      const option = question.optionsByKey.get(answer.optionKey)
      if (!option) {
        throw new QuestionnaireApplicationServiceError(
          this.translate(
            i18n,
            'nom035.questionnaire_application.invalid_answer_option',
            'La opción seleccionada no pertenece a la escala de la pregunta'
          ),
          QUESTIONNAIRE_APPLICATION_ERROR_CODES.INVALID_ANSWER_OPTION,
          422,
          'respuesta-invalida'
        )
      }

      return {
        questionId: answer.questionId,
        optionKey: answer.optionKey,
        value: option.value,
      }
    })
  }

  private translate(i18n: I18n | undefined, key: string, fallback: string): string {
    if (!i18n) return fallback
    const translated = i18n.formatMessage(key)
    return translated === key ? fallback : translated
  }
}
