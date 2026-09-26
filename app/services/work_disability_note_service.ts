import WorkDisability from '#models/work_disability'
import WorkDisabilityNote from '#models/work_disability_note'

export default class WorkDisabilityNoteService {
  async create(workDisabilityNote: WorkDisabilityNote) {
    const newWorkDisabilityNote = new WorkDisabilityNote()
    newWorkDisabilityNote.workDisabilityNoteDescription =
      workDisabilityNote.workDisabilityNoteDescription
    newWorkDisabilityNote.workDisabilityId = workDisabilityNote.workDisabilityId
    newWorkDisabilityNote.userId = workDisabilityNote.userId
    await newWorkDisabilityNote.save()
    return newWorkDisabilityNote
  }

  async update(
    currentWorkDisabilityNote: WorkDisabilityNote,
    workDisabilityNote: WorkDisabilityNote
  ) {
    if (
      workDisabilityNote.workDisabilityNoteDescription !== undefined &&
      workDisabilityNote.workDisabilityNoteDescription !== null
    ) {
      currentWorkDisabilityNote.workDisabilityNoteDescription =
        workDisabilityNote.workDisabilityNoteDescription
    }
    await currentWorkDisabilityNote.save()
    return currentWorkDisabilityNote
  }

  async delete(currentWorkDisabilityNote: WorkDisabilityNote) {
    await currentWorkDisabilityNote.delete()
    return currentWorkDisabilityNote
  }

  async show(workDisabilityNoteId: number) {
    const workDisabilityNote = await WorkDisabilityNote.query()
      .whereNull('work_disability_note_deleted_at')
      .where('work_disability_note_id', workDisabilityNoteId)
      .preload('user')
      .first()
    return workDisabilityNote ? workDisabilityNote : null
  }

  async verifyInfoExist(workDisabilityNote: WorkDisabilityNote) {
    const existWorkDisability = await WorkDisability.query()
      .whereNull('work_disability_deleted_at')
      .where('work_disability_id', workDisabilityNote.workDisabilityId)
      .first()

    if (!existWorkDisability && workDisabilityNote.workDisabilityId) {
      return {
        status: 400,
        type: 'warning',
        title: 'The work disability was not found',
        message: 'The work disability was not found with the entered ID',
        data: { ...workDisabilityNote },
      }
    }
    return {
      status: 200,
      type: 'success',
      title: 'Info verifiy successfully',
      message: 'Info verify successfully',
      data: { ...workDisabilityNote },
    }
  }
}
