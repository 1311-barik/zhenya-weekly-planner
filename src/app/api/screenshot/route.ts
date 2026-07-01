import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { chromium } from "playwright";
import { guard, badRequest } from "@/lib/http";
import { startOfWeek, fromDateKey, toDateKey, todayKey } from "@/lib/week";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Скриншот недели: headless Chromium рендерит /print и снимает картинку.
export async function GET(req: NextRequest) {
  const denied = await guard();
  if (denied) return denied;

  const weekParam = req.nextUrl.searchParams.get("week") || todayKey();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekParam)) {
    return badRequest("week должен быть в формате YYYY-MM-DD");
  }
  const weekStart = toDateKey(startOfWeek(fromDateKey(weekParam)));

  const port = process.env.PORT || "3000";
  const url = `http://127.0.0.1:${port}/print?week=${weekStart}`;

  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    const page = await browser.newPage({
      viewport: { width: 1220, height: 900 },
      deviceScaleFactor: 2,
    });
    await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
    await page.evaluate(() => (document as Document).fonts.ready);
    await page.waitForTimeout(250);
    const el = page.locator("#print-root");
    const buf = await el.screenshot({ type: "png" });
    await browser.close();

    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": "image/png",
        "Content-Disposition": `attachment; filename="nedelya-${weekStart}.png"`,
      },
    });
  } catch (e) {
    if (browser) await browser.close().catch(() => {});
    return NextResponse.json(
      { error: "Не удалось создать скриншот: " + (e as Error).message },
      { status: 500 }
    );
  }
}
