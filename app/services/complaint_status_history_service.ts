import ComplaintStatusHistory from '#models/complaint_status_history'
import type { ComplaintStatus } from '#constants/complaint'
import type { ComplaintStatusHistoryRow } from '../interfaces/complaint_interface.js'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'

/**
 * Bitácora inmutable de transiciones de estatus del buzón de quejas.
 */
export default class ComplaintStatusHistoryService {
  async appendEntry(
    input: {
      complaintId: number
      fromStatus: ComplaintStatus | null
      toStatus: ComplaintStatus
      note: string
      actorUserId: number
    },
    trx?: TransactionClientContract
  ): Promise<ComplaintStatusHistory> {
    const record = new ComplaintStatusHistory()
    if (trx) {
      record.useTransaction(trx)
    }

    record.complaintId = input.complaintId
    record.complaintStatusHistoryFromStatus = input.fromStatus
    record.complaintStatusHistoryToStatus = input.toStatus
    record.complaintStatusHistoryNote = input.note.trim()
    record.actorUserId = input.actorUserId

    await record.save()
    return record
  }

  async listByComplaintId(complaintId: number): Promise<ComplaintStatusHistoryRow[]> {
    const rows = await ComplaintStatusHistory.query()
      .where('complaint_id', complaintId)
      .preload('actorUser', (userQuery) => {
        userQuery.preload('person')
      })
      .orderBy('complaint_status_history_created_at', 'asc')
      .orderBy('complaint_status_history_id', 'asc')

    return rows.map((row) => this.toRow(row))
  }

  private toRow(record: ComplaintStatusHistory): ComplaintStatusHistoryRow {
    const person = record.actorUser?.person

    const actorDisplayName = person
      ? [person.personFirstname, person.personLastname, person.personSecondLastname]
          .filter(Boolean)
          .join(' ')
          .trim() || null
      : (record.actorUser?.userEmail ?? null)

    return {
      complaintStatusHistoryId: record.complaintStatusHistoryId,
      fromStatus: record.complaintStatusHistoryFromStatus,
      toStatus: record.complaintStatusHistoryToStatus,
      note: record.complaintStatusHistoryNote,
      actorUserId: record.actorUserId,
      actorDisplayName,
      createdAt: record.complaintStatusHistoryCreatedAt.toISO()!,
    }
  }
}
