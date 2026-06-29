import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Библиотека блоков (палитра для ручного перетаскивания).
// Постоянные (переходящие) события задаются отдельно в RECURRING_EVENTS
// (src/lib/config.ts) и материализуются автоматически на каждую неделю.
const TEMPLATES = [
  { name: "🧵 Ателье", color: "bordeaux", duration: 240, kind: "atelier", order: 0 },
  { name: "🏋️ Качалка", color: "orange", duration: 180, kind: "gym", order: 1 },
  { name: "🧘 Йога", color: "mint", duration: 60, kind: null, order: 2 },
  { name: "🎓 Инна", color: "blue", duration: 30, kind: null, order: 3 },
  { name: "🎓 Роберт", color: "blue", duration: 60, kind: null, order: 4 },
];

async function main() {
  // Палитра — авторская, пересоздаём детерминированно.
  await prisma.template.deleteMany({});
  for (const t of TEMPLATES) {
    await prisma.template.create({ data: t });
  }
  // Сбрасываем материализацию повторов, чтобы расписание пере-собралось.
  await prisma.block.deleteMany({ where: { recurring: true } });
  // Чистим легаси-блоки старой схемы повторов (имена со скобками:
  // «… (словацкий)», «… (спорт)») — в новой палитре таких имён нет.
  await prisma.block.deleteMany({ where: { title: { contains: "(" } } });
  await prisma.weekSeed.deleteMany({});
  console.log(`Шаблоны: ${TEMPLATES.length}. Повторы сброшены — пере-соберутся при открытии недели.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
