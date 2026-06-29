import { NextResponse } from "next/server";
import { isAuthed } from "./auth";

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

export function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

export function notFound(message = "Не найдено") {
  return NextResponse.json({ error: message }, { status: 404 });
}

// Оборачивает обработчик проверкой авторизации.
export async function guard(): Promise<NextResponse | null> {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }
  return null;
}
