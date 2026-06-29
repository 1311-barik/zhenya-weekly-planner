import { cookies } from "next/headers";

export const AUTH_COOKIE = "pl_token";

// MVP-авторизация: если AUTH_TOKEN не задан в .env — доступ открыт
// (без фрикции при локальном запуске). Если задан — нужен совпадающий
// токен в cookie pl_token (его ставит /login).
export function authRequired(): boolean {
  return Boolean(process.env.AUTH_TOKEN && process.env.AUTH_TOKEN.length > 0);
}

export async function isAuthed(): Promise<boolean> {
  if (!authRequired()) return true;
  const jar = await cookies();
  return jar.get(AUTH_COOKIE)?.value === process.env.AUTH_TOKEN;
}
