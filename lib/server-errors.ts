import "server-only";

import { NextResponse } from "next/server";

type ErrorContext = Record<string, unknown>;

function serializedError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  return { value: String(error) };
}

export function logServerError(scope: string, error: unknown, context: ErrorContext = {}) {
  console.error(`[${scope}]`, {
    ...context,
    error: serializedError(error),
  });
}

export function jsonInternalError(message = "Something went wrong. Try again.") {
  return NextResponse.json({ error: message }, { status: 500 });
}
