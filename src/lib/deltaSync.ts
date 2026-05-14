const CURSOR_RESET_ERROR_CODES = new Set([
  "42601", // syntax_error
  "42703", // undefined_column
  "42883", // undefined_function
  "42P01", // undefined_table
]);
const CONTRACT_PGRST_PREFIXES = ["PGRST1", "PGRST2"];
export const DELTA_BATCH_LIMIT_ERROR_CODE = "DELTA_BATCH_LIMIT";

interface DeltaSyncErrorLike {
  code?: string;
  details?: string;
  hint?: string;
  message?: string;
  status?: number;
}

export function shouldResetDeltaCursorAfterError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const candidate = error as DeltaSyncErrorLike;
  const code = typeof candidate.code === "string" ? candidate.code.toUpperCase() : "";
  if (
    code === DELTA_BATCH_LIMIT_ERROR_CODE ||
    CONTRACT_PGRST_PREFIXES.some((prefix) => code.startsWith(prefix)) ||
    CURSOR_RESET_ERROR_CODES.has(code)
  ) {
    return true;
  }

  const status = typeof candidate.status === "number" ? candidate.status : null;
  if (status !== null && [400, 404, 422].includes(status)) {
    return true;
  }

  const text = [candidate.message, candidate.details, candidate.hint]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return (
    text.includes("schema cache") ||
    text.includes("undefined column") ||
    (text.includes("column") && text.includes("does not exist")) ||
    (text.includes("relation") && text.includes("does not exist")) ||
    (text.includes("function") && text.includes("does not exist"))
  );
}
