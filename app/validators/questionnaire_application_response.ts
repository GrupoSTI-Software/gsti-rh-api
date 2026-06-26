import vine from '@vinejs/vine'

export const submitQuestionnaireApplicationAnswersValidator = vine.compile(
  vine.object({
    answers: vine
      .array(
        vine.object({
          questionId: vine.number().positive(),
          optionKey: vine.string().trim(),
        })
      )
      .minLength(1),
  })
)

export const saveDraftQuestionnaireApplicationAnswersValidator = vine.compile(
  vine.object({
    answers: vine.array(
      vine.object({
        questionId: vine.number().positive(),
        optionKey: vine.string().trim(),
      })
    ),
  })
)
