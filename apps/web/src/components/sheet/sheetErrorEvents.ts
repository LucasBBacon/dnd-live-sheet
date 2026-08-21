import { SOCKET_EVENTS } from "@project/shared";

/**
 * The `action_error` events the sheet actually shows.
 *
 * The gateway reports an error for every handler, but anything outside this
 * list is received and dropped, so an omission fails as silence rather than as
 * a visible bug - which is exactly what happened to ROOM_JOIN. Stating the
 * policy in one place is what makes that reviewable.
 *
 * ROOM_JOIN reports that the character could not be bound to the campaign.
 * It surfaces on the inventory banner because an unbound character is what an
 * empty inventory means here; a page-level treatment would say it better.
 */
export const SHEET_ERROR_EVENTS: string[] = [
  SOCKET_EVENTS.ITEM_EQUIPPED,
  SOCKET_EVENTS.ITEM_CONSUMED,
  SOCKET_EVENTS.ITEM_ATTUNED,
  SOCKET_EVENTS.ROOM_JOIN,
];
