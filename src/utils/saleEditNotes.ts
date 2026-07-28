export function getSaleEditNotesPayload(notes: string): { notes: string } {
  return { notes: notes.trim() };
}
