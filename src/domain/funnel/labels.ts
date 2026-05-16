// Human-friendly display labels for funnel nodes.
// node_id залишається технічним ID (для переходів у воронці), а тут — назва, яку
// бачить адмін у /admin → 📝 Контент воронки. Незнайомі id (нові ноди, додані вручну)
// автоматично робляться зрозумілими через titleCase().

const LABELS: Record<string, string> = {
  // Вступ
  welcome: '👋 Привітання',
  intro_alyona: '🌸 Знайомство з Альоною',
  segment_pick: '🛤 Вибір сегменту',

  // Сегмент "Перша робота"
  seg_first_job_intro: '🎓 Перша робота · вступ',
  seg_first_job_case: '🎓 Перша робота · кейс',
  seg_first_job_offer: '🎓 Перша робота · пропозиція',

  // Сегмент "Хоче рости"
  seg_growing_intro: '📈 Хоче рости · вступ',
  seg_growing_q1: '📈 Хоче рости · питання 1',
  seg_growing_q2: '📈 Хоче рости · питання 2',
  seg_growing_q3: '📈 Хоче рости · питання 3',
  seg_growing_case: '📈 Хоче рости · кейс',
  seg_growing_universal: '📈 Хоче рости · універсальне',
  seg_growing_offer: '📈 Хоче рости · пропозиція',

  // Продукти
  prod_base: '📦 Базовий курс',
  prod_lessons_pick: '📚 Каталог окремих уроків',
  prod_lesson_resume: '📄 Урок · Резюме',
  prod_lesson_linkedin: '💼 Урок · LinkedIn',
  prod_lesson_search: '🔍 Урок · Пошук роботи',
  prod_lesson_interview: '🎤 Урок · Співбесіда',
  prod_lesson_hard_qs: '🧩 Урок · Складні питання',
  prod_lesson_salary: '💰 Урок · Зарплата',
  prod_profession: '🎯 Консультація · Обрати професію',
  prod_career: '📈 Консультація · Карʼєра',
  prod_system_path: '🛤 Системний шлях (USD)',

  // Запасна
  fallback_library: '📚 Бібліотека (запасний шлях)',
};

function titleCase(node_id: string): string {
  return node_id
    .split('_')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export function nodeLabel(node_id: string): string {
  return LABELS[node_id] ?? titleCase(node_id);
}
