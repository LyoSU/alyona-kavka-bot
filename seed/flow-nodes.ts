import type { FlowNode } from '@/domain/funnel/types';

// Note: video_note chunks використовують placeholder file_id 'PENDING_UPLOAD' —
// адмін заливає їх через /admin → Контент → Завантажити кружечок.
// Поки file_id = PENDING_UPLOAD, бот пропускає video_note chunk через try/catch у sender.
// Photo placeholder теж 'PENDING_UPLOAD' — адмін замінює через адмінку.

const PLACEHOLDER_FILE_ID = 'PENDING_UPLOAD';

// ───────── Welcome / segmentation ─────────

const welcome: FlowNode = {
  node_id: 'welcome',
  segment: null,
  chunks: [
    { type: 'text', content: 'Привіт 🙌', delay_before_ms: 1500 },
    {
      type: 'text',
      content:
        'Якщо ти тут — скоріш за все:\n\n💡 дивишся вакансії, але не розумієш, чи ти взагалі підходиш\n💡 або відгукуєшся — і тобі просто не відповідають\n💡 або доходиш до співбесіди і відчуваєш, що "не дотягуєш"\n💡 або працюєш, але розумієш, що це взагалі не те, що ти хотів(-ла)',
      delay_before_ms: 2000,
    },
    {
      type: 'text',
      content:
        'Тому дій робиш багато, але по при це немає розуміння, що з цього працює, а що ні 😔\n\n[І ні, це не тому що ти "якийсь не такий"]',
      delay_before_ms: 1500,
    },
  ],
  buttons: [
    { label: 'Давай знайомитись 🤝', row: 0, action: 'goto_node', node_id: 'intro_alyona' },
  ],
};

const intro_alyona: FlowNode = {
  node_id: 'intro_alyona',
  segment: null,
  chunks: [
    { type: 'video_note', file_id: PLACEHOLDER_FILE_ID, delay_before_ms: 1000 },
    {
      type: 'text',
      content:
        'Я — Альона Кавка 🎯\nБільше 18+ років в HR, провела тисячі співбесід і працевлаштувала сотні кандидатів 💼\n\nТому точно знаю, чому одних беруть, а іншим не відповідають (навіть якщо є досвід 😉)',
      delay_before_ms: 1500,
    },
    {
      type: 'text',
      content:
        'Я зібрала це в просту систему: що робити, щоб отримати роботу мрії без хаосу і зливів 🙌\n\nТут ти не будеш гадати — ти зрозумієш, як воно реально працює 💪',
      delay_before_ms: 2000,
    },
  ],
  buttons: [{ label: 'Далі 👉', row: 0, action: 'goto_node', node_id: 'segment_pick' }],
};

const segment_pick: FlowNode = {
  node_id: 'segment_pick',
  segment: null,
  chunks: [{ type: 'text', content: 'Сегментація — хто ти зараз?', delay_before_ms: 1200 }],
  buttons: [
    {
      label: '👶 Шукаю першу роботу',
      row: 0,
      action: 'goto_node',
      node_id: 'seg_first_job_intro',
    },
    {
      label: '💼 Вже працюю / хочу рости',
      row: 1,
      action: 'goto_node',
      node_id: 'seg_growing_intro',
    },
  ],
};

// ───────── First-job branch ─────────

const seg_first_job_intro: FlowNode = {
  node_id: 'seg_first_job_intro',
  segment: 'first_job',
  chunks: [
    {
      type: 'text',
      content:
        'Окей, тоді ти зараз в дуже конкретній точці 🎯\n\nПерша робота — це завжди про купу питань:\n❓ що писати в резюме, якщо досвіду мало або немає\n❓ куди взагалі відгукуватись\n❓ як проходити співбесіди, щоб тебе сприймали серйозно',
      delay_before_ms: 1500,
    },
    {
      type: 'text',
      content:
        'Це насправді адекватні запитання, бо нас навчили професії, але не навчили "продавати" їх на ринку 🤷\n\nТому замість того, щоб діяти навмання, краще один раз зрозуміти, як це реально працює.',
      delay_before_ms: 2000,
    },
    {
      type: 'text',
      content:
        'Бо пошук першої роботи — це не одна дія, це завжди 4 етапи:\n\n1️⃣ зрозуміти, що і як робити\n2️⃣ визначитись з напрямком\n3️⃣ навчитись проходити відбір\n4️⃣ і тільки тоді швидко отримати офер\n\n[і на кожному з цих етапів можна або прискоритись або втратити місяці]\n\nЯ можу допомогти тобі закрити будь-який з них 💪',
      delay_before_ms: 2000,
    },
  ],
  buttons: [
    { label: 'Покажи приклад 👇', row: 0, action: 'goto_node', node_id: 'seg_first_job_case' },
  ],
};

const seg_first_job_case: FlowNode = {
  node_id: 'seg_first_job_case',
  segment: 'first_job',
  chunks: [
    { type: 'photo', file_id: PLACEHOLDER_FILE_ID, delay_before_ms: 1000 },
    {
      type: 'text',
      content:
        'КЕЙС 👇\n\nДо мене звернувся студент економічного факультету.\n\n📍 Точка А:\nхотів роботу юриста, але не розумів, куди рухатись, не було досвіду і чіткого напрямку.\n\nЩо зробили:\n— визначили, що йому реально підходить\n— розклали сильні сторони і зони росту\n— зібрали нормальне резюме\n— відпрацювали самопрезентацію\n\n✅ Результат:\nотримав роботу юристом — без досвіду в юриспруденції і без профільних навичок.',
      delay_before_ms: 1500,
    },
    {
      type: 'text',
      content:
        'Тут важливий момент:\n\nВ нього не з\'явився "досвід за ніч" і він не став ідеальним кандидатом 🤷\nАЛЕ він:\n~ почав робити базові речі правильно\n~ перестав відгукуватись навмання\n~ зміг нормально пояснити свою цінність на співбесіді\n\n⬇️ ⬇️ ⬇️\nцього вже вистачило, щоб його обрали.\n\nІ таких ситуацій багато 🙌\n{ просто коли з\'являється структура — все починає рухатись значно швидше }',
      delay_before_ms: 2000,
    },
  ],
  buttons: [
    { label: 'Що ти пропонуєш? 👀', row: 0, action: 'goto_node', node_id: 'seg_first_job_offer' },
  ],
};

const seg_first_job_offer: FlowNode = {
  node_id: 'seg_first_job_offer',
  segment: 'first_job',
  chunks: [
    {
      type: 'text',
      content:
        "Тому дивись, як я можу допомогти тобі 👇\n\nФОРМАТИ РОБОТИ:\n\n📚 База (6 уроків)\nякщо хочеш розібратись, як взагалі працює пошук роботи і не витрачати місяці на хаотичні дії\n\n📖 Окремі уроки\nякщо зараз є одна конкретна проблема і хочеш швидко її закрити\n\n🧭 Профорієнтація\nякщо не розумієш, яка робота тобі підходить і куди рухатись далі\n\n🎯 Кар'єрна консультація\nякщо вже пробуєш, але не проходиш відбір і хочеш зрозуміти, що саме не так\n\n🚀 Системний шлях до роботи\nякщо хочеш не розбиратись сам(а), а щоб тебе провели по всьому шляху — від розуміння напрямку до співбесід і до реального оферу. Ми готуємо тебе і передаємо як кандидата роботодавцю, тобто фактично доводимо тебе до результату.",
      delay_before_ms: 1500,
    },
    {
      type: 'text',
      content:
        'Давай відштовхнемось від твоєї ситуації 👇\nЗ чим у тебе зараз найбільша складність?',
      delay_before_ms: 1500,
    },
  ],
  buttons: [
    {
      label: '🤔 Взагалі не розумію, з чого почати',
      row: 0,
      action: 'goto_node',
      node_id: 'prod_base',
    },
    {
      label: '🎯 Хочу одне точкове питання',
      row: 1,
      action: 'goto_node',
      node_id: 'prod_lessons_pick',
    },
    {
      label: '🧭 Не знаю, яка робота мені підходить',
      row: 2,
      action: 'goto_node',
      node_id: 'prod_profession',
    },
    {
      label: '🛠 Є конкретні проблеми (резюме / відгуки / співбесіди)',
      row: 3,
      action: 'goto_node',
      node_id: 'prod_career',
    },
    {
      label: '🚀 Хочу швидше отримати роботу',
      row: 4,
      action: 'goto_node',
      node_id: 'prod_system_path',
    },
  ],
};

// ───────── Products ─────────

const prod_base: FlowNode = {
  node_id: 'prod_base',
  segment: null,
  chunks: [
    {
      type: 'text',
      content:
        "Тобі потрібна база, після якої стає зрозуміло, що робити далі.\n\nЯ зібрала це в 6 уроків, в яких є все, що потрібно на старті:\n\n1️⃣ як почати пошук роботи\n2️⃣ як зробити нормальне резюме\n3️⃣ як використовувати LinkedIn\n4️⃣ як проходити співбесіди\n5️⃣ як відповідати на складні питання\n6️⃣ як говорити про зарплату\n\nПісля цього в тебе з'являється розуміння, що ти робиш — і процес перестає бути хаотичним.",
      delay_before_ms: 1500,
    },
    {
      type: 'text',
      content:
        'Клас, це найсильніший варіант на старті 💪\n\nДо того ж вигідніший, якщо брати пакетом з 6 уроків:\nзамість 1200 грн — зараз 960 грн (−20%).\n\nЦе основний крок, який дає розуміння процесу і допомагає уникнути типових помилок.',
      delay_before_ms: 1500,
    },
  ],
  buttons: [
    {
      label: '💳 Отримати доступ до 6 уроків — 960 ₴',
      row: 0,
      action: 'buy',
      product_id: 'base_6',
    },
    {
      label: '📖 Почати з одного уроку',
      row: 1,
      action: 'goto_node',
      node_id: 'prod_lessons_pick',
    },
    { label: '👈 Назад', row: 2, action: 'back' },
  ],
};

const prod_lessons_pick: FlowNode = {
  node_id: 'prod_lessons_pick',
  segment: null,
  chunks: [
    {
      type: 'text',
      content: 'Окей, тоді давай точково 🎯\nЯке питання хочеш закрити в першу чергу?',
      delay_before_ms: 1200,
    },
  ],
  buttons: [
    { label: '🔍 Пошук роботи', row: 0, action: 'goto_node', node_id: 'prod_lesson_search' },
    { label: '📄 Резюме', row: 1, action: 'goto_node', node_id: 'prod_lesson_resume' },
    { label: '🔗 LinkedIn', row: 2, action: 'goto_node', node_id: 'prod_lesson_linkedin' },
    { label: '💬 Співбесіди', row: 3, action: 'goto_node', node_id: 'prod_lesson_interview' },
    { label: '🌶 Складні питання', row: 4, action: 'goto_node', node_id: 'prod_lesson_hard_qs' },
    { label: '💸 Зарплата', row: 5, action: 'goto_node', node_id: 'prod_lesson_salary' },
    { label: '👈 Назад', row: 6, action: 'back' },
  ],
};

function lessonNode(opts: {
  node_id: string;
  body: string;
  product_id: string;
  buy_label: string;
}): FlowNode {
  return {
    node_id: opts.node_id,
    segment: null,
    chunks: [{ type: 'text', content: opts.body, delay_before_ms: 1500 }],
    buttons: [
      { label: opts.buy_label, row: 0, action: 'buy', product_id: opts.product_id },
      { label: '💎 База 6 уроків −20% — 960 ₴', row: 1, action: 'buy', product_id: 'base_6' },
      { label: '👈 Назад до уроків', row: 2, action: 'back' },
      { label: '💬 Підтримка', row: 3, action: 'support' },
    ],
  };
}

const prod_lesson_search = lessonNode({
  node_id: 'prod_lesson_search',
  product_id: 'lesson_search',
  buy_label: '💳 Урок про пошук роботи — 200 ₴',
  body: 'Зазвичай проблема не в кількості вакансій, а в тому, як саме ти шукаєш 😉\n\nВ уроці ти розберешся:\n🔹 де реально шукати роботу (не тільки сайти)\n🔹 як використовувати нетворкінг і контакти\n🔹 як працюють LinkedIn, Telegram, Facebook\n🔹 як знаходити вакансії напряму через компанії\n🔹 і як поєднувати всі ці інструменти, щоб це давало результат\n\nДоступ до уроку — 200 грн.\nМожеш почати з нього і закрити це питання точково, або ж взяти всю базу з 6 уроків зі знижкою −20% (960 грн).',
});

const prod_lesson_resume = lessonNode({
  node_id: 'prod_lesson_resume',
  product_id: 'lesson_resume',
  buy_label: '💳 Урок про резюме — 200 ₴',
  body: 'Резюме або підсилює тебе, або занижує — тому це перше, на що тобі варто звернути увагу 📄\n\nВ цьому уроці розберемо:\n✔ як подати досвід сильніше\n✔ що реально дивиться рекрутер\n✔ як уникнути типових помилок\n\n...щоб тебе почали розглядати на твій рівень 🎯\n\nДоступ до уроку — 200 грн.\nЯкщо розумієш, що питань більше — пропоную одразу всю базу: 6 уроків зі знижкою −20% (960 грн замість 1200 грн).',
});

const prod_lesson_linkedin = lessonNode({
  node_id: 'prod_lesson_linkedin',
  product_id: 'lesson_linkedin',
  buy_label: '💳 Урок про LinkedIn — 200 ₴',
  body: 'Багато хто недооцінює LinkedIn і не використовує його як інструмент пошуку роботи 🔗\n[хоча саме тут рекрутери шукають кандидатів]\n\nВ уроці ти розберешся, як зробити так, щоб профіль почав приносити можливості ❤️\n\nДоступ до уроку — 200 грн.\nЯкщо розумієш, що питань більше — пропоную одразу всю базу: 6 уроків зі знижкою −20% (960 грн замість 1200 грн).',
});

const prod_lesson_interview = lessonNode({
  node_id: 'prod_lesson_interview',
  product_id: 'lesson_interview',
  buy_label: '💳 Урок про співбесіди — 200 ₴',
  body: 'Можна мати досвід і все одно не проходити співбесіди 😔\n\nНасправді тут вирішує не тільки що ти знаєш, а як ти це подаєш 💬\n\nВ цьому уроці дізнаєшся:\n— як структурувати відповіді\n— як говорити про свій досвід впевнено\n— як не губитись на розмові\n\n// щоб після співбесіди тебе хотіли взяти, а не "подумати" //\n\nДоступ до уроку — 200 грн.\nЯкщо розумієш, що питань більше — пропоную одразу всю базу: 6 уроків зі знижкою −20% (960 грн замість 1200 грн).',
});

const prod_lesson_hard_qs = lessonNode({
  node_id: 'prod_lesson_hard_qs',
  product_id: 'lesson_hard_qs',
  buy_label: '💳 Урок про складні питання — 200 ₴',
  body: 'Є питання, на яких зливаються навіть сильні кандидати 🌶\n🔸 про слабкі сторони\n🔸 про звільнення\n🔸 про провали\n\nВ цьому уроці дізнаєшся:\n✔ як відповідати на такі питання спокійно і по суті\n✔ як не занижувати себе\n✔ як тримати позицію навіть у незручних питаннях\n\n// щоб не втрачати можливості на фінальному етапі //\n\nДоступ до уроку — 200 грн.\nЯкщо розумієш, що питань більше — пропоную одразу всю базу: 6 уроків зі знижкою −20% (960 грн замість 1200 грн).',
});

const prod_lesson_salary = lessonNode({
  node_id: 'prod_lesson_salary',
  product_id: 'lesson_salary',
  buy_label: '💳 Урок про зарплату — 200 ₴',
  body: 'Багато хто або боїться говорити про гроші, або називає цифру "на всякий випадок" 😬\n// і в результаті — недоотримує 💸 //\n\nВ цьому уроці розберемо:\n✔ як адекватно оцінити свою вартість\n✔ як говорити про зарплату без дискомфорту\n✔ як вести перемовини так, щоб отримати кращі умови\n\nДоступ до уроку — 200 грн.\nЯкщо розумієш, що питань більше — пропоную одразу всю базу: 6 уроків зі знижкою −20% (960 грн замість 1200 грн).',
});

const prod_profession: FlowNode = {
  node_id: 'prod_profession',
  segment: null,
  chunks: [
    {
      type: 'text',
      content:
        'Профорієнтація — це про ситуацію, коли:\n🔹 не хочеш рости далі в тому, що є\n🔹 думаєш про зміну напрямку\n🔹 або відчуваєш, що "щось не те", але не розумієш, що саме\n\n// і через це стоїш на місці 😶 //\n\nМи розбираємо:\n✔ що в тебе вже є (досвід, сильні сторони)\n✔ що тебе реально драйвить / навпаки виснажує\n✔ які варіанти переходу у тебе є\n\n🎯 Щоб ти бачив(ла) конкретні напрямки під себе.\n\nВ результаті ти:\n✅ розумієш, куди рухатись далі\n✅ бачиш варіанти, які реально підходять\n✅ отримуєш ясність замість "думати ще трохи"\n\nІ головне — можеш почати діяти, а не відкладати 🙌',
      delay_before_ms: 1500,
    },
    {
      type: 'text',
      content:
        '📍 ФОРМАТ: онлайн-зустріч\n⏱ ТРИВАЛІСТЬ: ~60 хв\n💰 ВАРТІСТЬ: 1000 грн\n\n➡️ Якщо відчуваєш, що це про тебе — давай розберемось 🤝',
      delay_before_ms: 1500,
    },
  ],
  buttons: [
    {
      label: '📅 Записатись на профорієнтацію — 1000 ₴',
      row: 0,
      action: 'buy',
      product_id: 'consult_profession',
    },
    { label: '👈 Назад', row: 1, action: 'back' },
    { label: '💬 Підтримка', row: 2, action: 'support' },
  ],
};

const prod_career: FlowNode = {
  node_id: 'prod_career',
  segment: null,
  chunks: [
    {
      type: 'text',
      content:
        'Кар\'єра на твоєму рівні — це вже не випадковість ❗\n\nТи або керуєш процесом, або просто реагуєш на те, що відбувається 🤷\n\nТому важливо чітко розуміти: що саме не дає тобі рости і що потрібно змінити 🔍\n\nСаме це і розбираємо на кар\'єрній консультації ⬇\n\nЩо ми робимо:\n🔹 дивимось, де ти зараз і чому немає наступного кроку\n🔹 розбираємо, що саме гальмує твій ріст\n🔹 визначаємо варіанти: ріст в компанії / зміна / перехід\n\nТи не виходиш з думкою "треба ще подумати" — ти виходиш з розумінням:\n✅ куди саме рухатись\n✅ що змінити в діях\n✅ які кроки зробити далі\n\nТоді ти перестаєш топтатись на місці і починаєш рухатись в інший рівень 🚀',
      delay_before_ms: 1500,
    },
    {
      type: 'text',
      content:
        "Коротко поясню формат 👇\n\n📍 індивідуальна онлайн-зустріч\n⏱ тривалістю ~1,5 години\n👩‍💼 проводиться сертифікованим кар'єрним консультантом з моєї команди\n💰 вартість — 2000 грн",
      delay_before_ms: 1500,
    },
  ],
  buttons: [
    {
      label: '📅 Записатись на консультацію — 2000 ₴',
      row: 0,
      action: 'buy',
      product_id: 'consult_career',
    },
    { label: '👈 Назад', row: 1, action: 'back' },
    { label: '💬 Підтримка', row: 2, action: 'support' },
  ],
};

const prod_system_path: FlowNode = {
  node_id: 'prod_system_path',
  segment: null,
  chunks: [
    {
      type: 'text',
      content:
        '🎯 Основний результат того формату — вихід на нові кар\'єрні можливості і передача твого профілю роботодавцю.\n// вже як підготовленого кандидата на інший рівень //\n\n💡 Тобто ти не просто "шукаєш щось краще", а виходиш в процес, де тебе вже розглядають з розумінням твого рівня і потенціалу 🚀\n\nЩоб це стало можливим, ми закриваємо всі ключові етапи:\n— формуємо розуміння ринку і процесу переходу\n— визначаємо напрям або варіанти росту під тебе\n— розбираємо твою ситуацію і прибираємо слабкі місця\n— готуємо тебе як кандидата до наступного рівня',
      delay_before_ms: 1500,
    },
    {
      type: 'text',
      content:
        "📦 Формат включає:\n✅ базу уроків\n✅ профорієнтацію\n✅ кар'єрну консультацію\n✅ передачу твого профілю роботодавцю\n\n💰 Вартість цього формату — 150$\n\nЯкщо хочеш вийти на інший рівень швидше і не розтягувати цей процес на місяці — це саме те, що тобі потрібно 💪",
      delay_before_ms: 1500,
    },
  ],
  buttons: [
    {
      label: '🚀 Хочу системний шлях — 150$',
      row: 0,
      action: 'buy',
      product_id: 'system_path',
    },
    { label: '👈 Назад', row: 1, action: 'back' },
    { label: '💬 Підтримка', row: 2, action: 'support' },
  ],
};

// ───────── Growing branch ─────────

const seg_growing_intro: FlowNode = {
  node_id: 'seg_growing_intro',
  segment: 'growing',
  chunks: [
    { type: 'video_note', file_id: PLACEHOLDER_FILE_ID, delay_before_ms: 1000 },
    {
      type: 'text',
      content:
        'Твої ключові питання зараз — це не "як знайти роботу", а:\n🔹 як вирости\n🔹 як перейти на інший дохід\n🔹 як не застрягти в одній ролі роками',
      delay_before_ms: 1500,
    },
    {
      type: 'text',
      content:
        'І тут є нюанс — більшість людей діють без системи 😐:\n🔸 Хтось чекає, що його помітять\n🔸 Хтось просто "робить добре свою роботу"\n🔸 Хтось думає, що ще не час\n\nІ в результаті — залишаються на одному місці роками 🤷\n[Хоча по факту вони могли б бути вже зовсім в іншій точці]',
      delay_before_ms: 1500,
    },
    {
      type: 'text',
      content:
        "Насправді кар'єрний ріст — це теж система. І її можна пройти значно швидше, якщо розуміти, як вона працює.\n\nЯ можу допомогти тобі розібратись, де ти зараз і що саме гальмує твій ріст.\n\nПеред тим як рухатись далі, задам тобі кілька коротких питань 🤝\nЦе допоможе показати тобі найбільш релевантний варіант руху.",
      delay_before_ms: 1500,
    },
  ],
  buttons: [{ label: 'Ок, давай 👌', row: 0, action: 'goto_node', node_id: 'seg_growing_q1' }],
};

const seg_growing_q1: FlowNode = {
  node_id: 'seg_growing_q1',
  segment: 'growing',
  chunks: [
    {
      type: 'text',
      content: 'ПИТАННЯ 1/3\nЩо зараз найбільше "стопорить" тебе в кар\'єрі?',
      delay_before_ms: 1200,
    },
  ],
  buttons: [
    { label: 'Не росту / стою на місці', row: 0, action: 'goto_node', node_id: 'seg_growing_q2' },
    {
      label: 'Хочу більший дохід, але не розумію як',
      row: 1,
      action: 'goto_node',
      node_id: 'seg_growing_q2',
    },
    { label: 'Думаю змінити роботу', row: 2, action: 'goto_node', node_id: 'seg_growing_q2' },
    {
      label: 'Хочу перейти на інший рівень/позицію',
      row: 3,
      action: 'goto_node',
      node_id: 'seg_growing_q2',
    },
    {
      label: 'Втомився/лась і не розумію, куди далі',
      row: 4,
      action: 'goto_node',
      node_id: 'seg_growing_q2',
    },
  ],
};

const seg_growing_q2: FlowNode = {
  node_id: 'seg_growing_q2',
  segment: 'growing',
  chunks: [
    {
      type: 'text',
      content: 'ПИТАННЯ 2/3\nЩо ти вже пробував/ла робити?',
      delay_before_ms: 1200,
    },
  ],
  buttons: [
    { label: 'Нічого системного', row: 0, action: 'goto_node', node_id: 'seg_growing_q3' },
    { label: 'Ходив/ла на співбесіди', row: 1, action: 'goto_node', node_id: 'seg_growing_q3' },
    { label: 'Думав/ла змінити компанію', row: 2, action: 'goto_node', node_id: 'seg_growing_q3' },
    { label: 'Говорив/ла про підвищення', row: 3, action: 'goto_node', node_id: 'seg_growing_q3' },
    { label: 'Проходив/ла курси', row: 4, action: 'goto_node', node_id: 'seg_growing_q3' },
  ],
};

const seg_growing_q3: FlowNode = {
  node_id: 'seg_growing_q3',
  segment: 'growing',
  chunks: [
    { type: 'text', content: 'ПИТАННЯ 3/3\nЩо для тебе зараз важливіше?', delay_before_ms: 1200 },
  ],
  buttons: [
    {
      label: 'Більший дохід',
      row: 0,
      action: 'goto_node',
      node_id: 'seg_growing_universal',
    },
    {
      label: 'Вища позиція',
      row: 1,
      action: 'goto_node',
      node_id: 'seg_growing_universal',
    },
    {
      label: 'Зміна сфери',
      row: 2,
      action: 'goto_node',
      node_id: 'seg_growing_universal',
    },
    {
      label: 'Більше балансу / менше вигорання',
      row: 3,
      action: 'goto_node',
      node_id: 'seg_growing_universal',
    },
  ],
};

const seg_growing_universal: FlowNode = {
  node_id: 'seg_growing_universal',
  segment: 'growing',
  chunks: [
    {
      type: 'text',
      content:
        'Дивлюсь на твої відповіді 👀\n\nЦе класична ситуація, коли:\n✅ досвід вже є\n✅ задачі складні\n✅ відповідальність росте\n\n// але це не переходить в інший рівень ні по доходу, ні по ролі 😔\n\nСаме тому з\'являється відчуття, що ти ніби вперся/лась в "стелю", хоча об\'єктивно вже готовий/а до більшого 🚀',
      delay_before_ms: 1500,
    },
    {
      type: 'text',
      content:
        'Щоб вийти з цього стану, недостатньо просто "робити більше".\nТут завжди є 4 речі, які або є, або ні 👇\n\n1️⃣ Чітке розуміння, як тебе зараз бачить ринок\n2️⃣ Розуміння, куди тобі реально рухатись\n3️⃣ Те, як ти себе подаєш і позиціонуєш\n4️⃣ Конкретні кроки, які дають перехід на інший рівень',
      delay_before_ms: 1500,
    },
  ],
  buttons: [
    { label: 'Покажи приклад 👇', row: 0, action: 'goto_node', node_id: 'seg_growing_case' },
  ],
};

const seg_growing_case: FlowNode = {
  node_id: 'seg_growing_case',
  segment: 'growing',
  chunks: [
    { type: 'photo', file_id: PLACEHOLDER_FILE_ID, delay_before_ms: 1000 },
    {
      type: 'text',
      content:
        'До мене звернулась дівчина, яка після повернення з-за кордону не могла знайти роботу.\n\n📍 Точка А:\n✔ є досвід і адекватний рівень\n✔ є відгуки і співбесіди\n❗ пропозиції є, але не того рівня (ні по позиції, ні по зарплаті)\n❗ відчуття, що "роблю все правильно, але не працює"',
      delay_before_ms: 1500,
    },
    { type: 'photo', file_id: PLACEHOLDER_FILE_ID, delay_before_ms: 1000 },
    {
      type: 'text',
      content:
        'Ми розклали ситуацію по 4 ключових речах:\n\n1️⃣ Як її бачить ринок → позиція виглядала слабше, ніж є насправді\n2️⃣ Куди вона рухається → не було чіткого фокусу\n3️⃣ Позиціонування → профіль і подача не "продавали" досвід\n4️⃣ Дії → багато хаотичних кроків\n\nЩо зробили:\n— уточнили кар\'єрну ціль\n— зібрали чіткий план пошуку\n— перезібрали LinkedIn і подачу\n— вибудували системні дії',
      delay_before_ms: 1500,
    },
    { type: 'photo', file_id: PLACEHOLDER_FILE_ID, delay_before_ms: 1000 },
    {
      type: 'text',
      content:
        '✅ Результат:\n— нова робота\n— потрібний рівень позиції\n— відповідна зарплата\n⏱ за 4 місяці\n\n* це дуже ок термін для закриття вакансії на позицію керівника\n// Це не швидка історія, але прогнозована, якщо є система //',
      delay_before_ms: 1500,
    },
  ],
  buttons: [
    { label: 'Що ти пропонуєш? 👀', row: 0, action: 'goto_node', node_id: 'seg_growing_offer' },
  ],
};

const seg_growing_offer: FlowNode = {
  node_id: 'seg_growing_offer',
  segment: 'growing',
  chunks: [
    {
      type: 'text',
      content:
        'Такі ситуації не вирішуються "однією дією", але їх можна розкласти і закрити поетапно 🎯\n\nМи працюємо з цим в кількох форматах — в залежності від того, що саме тобі зараз потрібно 👇\n\nФОРМАТИ РОБОТИ:\n\n📚 База (6 уроків)\nякщо хочеш розібратись, як взагалі працює пошук роботи і не витрачати місяці на хаотичні дії\n\n📖 Окремі уроки\nякщо зараз є одна конкретна проблема і хочеш швидко її закрити\n\n🧭 Профорієнтація\nякщо є відчуття, що хочеш змінити напрям і не до кінця розумієш куди\n\n🎯 Кар\'єрна консультація\nякщо потрібно розібрати саме твою ситуацію і зрозуміти, що ти робиш не так\n\n🚀 Системний шлях до роботи\nякщо ціль — вийти на нову роботу, а не просто розібратись; формат, де закриваємо всі етапи і передаємо тебе роботодавцю як кандидата.\n\nОбери формат, який зараз найбільше підходить тобі 👇',
      delay_before_ms: 1500,
    },
  ],
  buttons: [
    { label: '📚 База (6 уроків)', row: 0, action: 'goto_node', node_id: 'prod_base' },
    { label: '📖 Окремі уроки', row: 1, action: 'goto_node', node_id: 'prod_lessons_pick' },
    { label: '🧭 Профорієнтація', row: 2, action: 'goto_node', node_id: 'prod_profession' },
    { label: "🎯 Кар'єрна консультація", row: 3, action: 'goto_node', node_id: 'prod_career' },
    { label: '🚀 Системний шлях', row: 4, action: 'goto_node', node_id: 'prod_system_path' },
  ],
};

// ───────── Fallback ─────────

const fallback_library: FlowNode = {
  node_id: 'fallback_library',
  segment: null,
  chunks: [
    {
      type: 'text',
      content:
        'Якщо поки не готовий/а приймати рішення і хочеш розібратись глибше — у мене є для тебе ресурс 👇\n\n📚 Бібліотека професій\n— як виглядає робота зсередини\n— плюси/мінуси\n— можливості росту',
      delay_before_ms: 1500,
    },
  ],
  buttons: [
    // open_url буде заповнено settings.professions_channel_url; на старті лишаємо плейсхолдер
    {
      label: '📚 Перейти в Бібліотеку професій',
      row: 0,
      action: 'open_url',
      url: 'https://t.me/alyona_kavka_professions',
    },
    { label: '🏠 Головне', row: 1, action: 'home' },
  ],
};

export const FLOW_NODES: FlowNode[] = [
  welcome,
  intro_alyona,
  segment_pick,
  // first-job
  seg_first_job_intro,
  seg_first_job_case,
  seg_first_job_offer,
  // products
  prod_base,
  prod_lessons_pick,
  prod_lesson_search,
  prod_lesson_resume,
  prod_lesson_linkedin,
  prod_lesson_interview,
  prod_lesson_hard_qs,
  prod_lesson_salary,
  prod_profession,
  prod_career,
  prod_system_path,
  // growing
  seg_growing_intro,
  seg_growing_q1,
  seg_growing_q2,
  seg_growing_q3,
  seg_growing_universal,
  seg_growing_case,
  seg_growing_offer,
  // fallback
  fallback_library,
];
