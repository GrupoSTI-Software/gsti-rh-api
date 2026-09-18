// app/Services/ReservationNoteService.ts

import Reservation from '#models/reservation'
import ReservationNote from '#models/reservation_note'

export default class ReservationNoteService {
  /**
   * List all reservation notes.
   */
  async index() {
    const reservationNotes = await ReservationNote.all()
    return reservationNotes
  }

  /**
   * Create a new reservation note.
   * @param data - Data to create the reservation note.
   */
  async create(data: ReservationNote) {
    const reservationNote = await ReservationNote.create(data)
    return reservationNote
  }

  /**
   * Find a reservation note by ID.
   * @param id - ID of the reservation note.
   */
  async findById(id: number) {
    const reservationNote = await ReservationNote.findOrFail(id)
    return reservationNote
  }

  /**
   * Update a reservation note by ID.
   * @param id - ID of the reservation note.
   * @param data - Updated data for the reservation note.
   */
  async update(id: number, data: ReservationNote) {
    const reservationNote = await ReservationNote.findOrFail(id)
    reservationNote.merge(data)
    await reservationNote.save()
    return reservationNote
  }

  /**
   * Delete a reservation note by ID.
   * @param id - ID of the reservation note.
   */
  async delete(id: number) {
    const reservationNote = await ReservationNote.findOrFail(id)
    await reservationNote.delete()
  }

  async verifyInfo(reservationNote: ReservationNote) {
    // validation if reservationId exists
    const reservation = await Reservation.find(reservationNote.reservationId)
    if (!reservation) {
      return {
        status: 400,
        type: 'error',
        title: 'Reservation not found',
        message: 'Reservation not found',
      }
    }
    return {
      status: 200,
      type: 'success',
      title: 'Info verified successfully',
      message: 'Info verified successfully',
      data: { ...reservation },
    }
  }
}
