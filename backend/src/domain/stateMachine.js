// ============================================================
// Booking Status State Machine
// ============================================================

export const BookingStatus = {
  HOLD: 'HOLD',
  CONFIRMED: 'CONFIRMED',
  CANCELLED: 'CANCELLED',
  CHECKED_IN: 'CHECKED_IN',
  NO_SHOW: 'NO_SHOW',
};

export const SessionStatus = {
  SCHEDULED: 'SCHEDULED',
  CANCELLED: 'CANCELLED',
  COMPLETED: 'COMPLETED',
};

// Legal transitions: { fromStatus: [toStatus, ...] }
const BOOKING_TRANSITIONS = {
  [BookingStatus.HOLD]: [BookingStatus.CONFIRMED, BookingStatus.CANCELLED],
  [BookingStatus.CONFIRMED]: [BookingStatus.CANCELLED, BookingStatus.CHECKED_IN, BookingStatus.NO_SHOW],
  [BookingStatus.CANCELLED]: [],       // terminal state
  [BookingStatus.CHECKED_IN]: [],      // terminal state
  [BookingStatus.NO_SHOW]: [],         // terminal state
};

const SESSION_TRANSITIONS = {
  [SessionStatus.SCHEDULED]: [SessionStatus.CANCELLED, SessionStatus.COMPLETED],
  [SessionStatus.CANCELLED]: [],       // terminal state
  [SessionStatus.COMPLETED]: [],       // terminal state
};

/**
 * Check if a booking status transition is valid.
 * @param {string} from - Current status
 * @param {string} to   - Target status
 * @returns {boolean}
 */
export function canTransitionBooking(from, to) {
  const allowed = BOOKING_TRANSITIONS[from];
  if (!allowed) return false;
  return allowed.includes(to);
}

/**
 * Check if a session status transition is valid.
 * @param {string} from - Current status
 * @param {string} to   - Target status
 * @returns {boolean}
 */
export function canTransitionSession(from, to) {
  const allowed = SESSION_TRANSITIONS[from];
  if (!allowed) return false;
  return allowed.includes(to);
}

/**
 * Assert a booking transition is valid; throw if not.
 * @param {string} from
 * @param {string} to
 * @throws {Error} with code INVALID_STATE
 */
export function assertBookingTransition(from, to) {
  if (!canTransitionBooking(from, to)) {
    const err = new Error(`Invalid booking transition: ${from} → ${to}`);
    err.code = 'INVALID_STATE';
    throw err;
  }
}

/**
 * Assert a session transition is valid; throw if not.
 * @param {string} from
 * @param {string} to
 * @throws {Error} with code INVALID_STATE
 */
export function assertSessionTransition(from, to) {
  if (!canTransitionSession(from, to)) {
    const err = new Error(`Invalid session transition: ${from} → ${to}`);
    err.code = 'INVALID_STATE';
    throw err;
  }
}
