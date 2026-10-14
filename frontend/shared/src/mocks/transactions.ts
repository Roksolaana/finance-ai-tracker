import type { Transaction, TransactionCategory } from "../types";

// Детермінований генератор: при кожному запуску ті самі "випадкові" дані,
// щоб демо й скріншоти для записки не змінювались між перезапусками.
function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const COFFEE_NOTES = [
  "Капучино біля універу",
  "Лате в «Львівській майстерні кави»",
  "Кава з собою перед парою",
  "Флет вайт і круасан",
  "Раф у кав'ярні на Подолі",
];
const GROCERY_NOTES = ["АТБ", "Сільпо", "Новус", "Продукти на тиждень", "Ринок — овочі й фрукти", "Varus"];
const RESTAURANT_NOTES = [
  "Піца з одногрупниками",
  "Обід з друзями",
  "Суші ввечері",
  "Вечеря на день народження подруги",
  "Бургери після кіно",
];
const TAXI_NOTES = ["Bolt", "Uklon, запізнювалась на пару", "Таксі додому після вечірки", "Bolt до вокзалу"];
const FUN_NOTES = ["Кіно", "Концерт", "Боулінг з друзями", "Квест-кімната", "Стендап", "Виставка в Мистецькому арсеналі"];
const SHOPPING_NOTES = ["Кросівки", "Книги для курсової", "Подарунок мамі", "Светр", "Навушники", "Канцелярія"];
const HEALTH_NOTES = ["Аптека", "Вітаміни", "Стоматолог", "Аналізи", "Спортзал — разове заняття"];

const EMOTIONAL: { category: TransactionCategory; note: string; min: number; max: number }[] = [
  { category: "їжа", note: "Купила солодке, бо був важкий день", min: 120, max: 260 },
  { category: "транспорт", note: "Таксі, бо не було сил на метро", min: 150, max: 280 },
  { category: "кафе", note: "Замовила доставку, втомилась після пар", min: 320, max: 560 },
  { category: "покупки", note: "Імпульсивний шопінг після стресової сесії", min: 700, max: 1800 },
  { category: "кафе", note: "Заїла стрес перед дедлайном", min: 180, max: 340 },
  { category: "розваги", note: "Купила гру, щоб відволіктися від навчання", min: 400, max: 900 },
];

export function generateDemoTransactions(monthsBack = 6, today = new Date()): Transaction[] {
  const rand = mulberry32(20251028);
  const pick = <T,>(items: T[]) => items[Math.floor(rand() * items.length)];
  const between = (min: number, max: number) => Math.round(min + rand() * (max - min));
  const chance = (p: number) => rand() < p;

  const result: Transaction[] = [];
  let counter = 0;

  const add = (date: Date, amount: number, category: TransactionCategory, note: string) => {
    if (date > today) return;
    const iso = date.toISOString();
    result.push({ id: `demo-${++counter}`, amount, category, note, spent_at: iso, created_at: iso });
  };

  for (let offset = monthsBack - 1; offset >= 0; offset--) {
    const first = new Date(today.getFullYear(), today.getMonth() - offset, 1);
    const year = first.getFullYear();
    const month = first.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const at = (day: number, hour: number) => new Date(year, month, day, hour, between(0, 59));
    const isWinter = [10, 11, 0, 1, 2].includes(month);

    add(at(5, 10), 18000, "дохід", "Зарплата (part-time, IT-компанія)");
    add(at(25, 9), 2000, "дохід", "Стипендія");
    if (chance(0.6)) add(at(between(8, 22), 14), between(25, 60) * 100, "дохід", "Фриланс — дизайн лендінгу");

    add(at(1, 8), -460, "транспорт", "Поповнення проїзного");
    add(at(3, 12), -250, "підписки", "Netflix");
    add(at(10, 12), -99, "підписки", "Spotify");
    add(at(15, 12), -49, "підписки", "iCloud 50 ГБ");
    add(at(12, 18), -250, "комунальні", "Інтернет");
    add(at(18, 18), -200, "комунальні", "Мобільний зв'язок");
    add(at(20, 19), -(isWinter ? between(1600, 2400) : between(900, 1400)), "комунальні", "Комуналка за квартиру");

    for (let day = 1; day <= daysInMonth; day++) {
      const weekday = new Date(year, month, day).getDay();
      const isWeekend = weekday === 0 || weekday === 6;
      const isFriday = weekday === 5;

      if (chance(isWeekend ? 0.2 : 0.45)) add(at(day, between(8, 11)), -between(55, 120), "кафе", pick(COFFEE_NOTES));
      if (chance(0.26)) add(at(day, between(17, 21)), -between(180, 850), "їжа", pick(GROCERY_NOTES));
      if (chance(isWeekend || isFriday ? 0.14 : 0.04)) add(at(day, between(19, 22)), -between(280, 950), "кафе", pick(RESTAURANT_NOTES));
      if (chance(0.07)) add(at(day, between(7, 23)), -between(110, 320), "транспорт", pick(TAXI_NOTES));
      if (chance(isWeekend ? 0.12 : 0.04)) add(at(day, between(15, 21)), -between(150, 1100), "розваги", pick(FUN_NOTES));
      if (chance(0.045)) add(at(day, between(12, 20)), -between(300, 2000), "покупки", pick(SHOPPING_NOTES));
      if (chance(0.035)) add(at(day, between(9, 18)), -between(90, 1200), "здоров'я", pick(HEALTH_NOTES));
      if (chance(0.04)) {
        const e = pick(EMOTIONAL);
        add(at(day, between(18, 23)), -between(e.min, e.max), e.category, e.note);
      }
    }
  }

  return result.sort((a, b) => b.spent_at.localeCompare(a.spent_at));
}

export const demoTransactions: Transaction[] = generateDemoTransactions();
