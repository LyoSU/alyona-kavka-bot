import { getCollections } from '@/db/client';
import type { LessonDoc } from '@/db/schemas';

export async function getLesson(lesson_id: string): Promise<LessonDoc | null> {
  return getCollections().lessons.findOne({ lesson_id });
}

export async function listLessonsForProduct(product_id: string): Promise<LessonDoc[]> {
  const docs = await getCollections().lessons.find({ product_ids: product_id }).toArray();
  return docs.sort((a, b) => {
    const oa = a.order_in_product?.[product_id] ?? 999;
    const ob = b.order_in_product?.[product_id] ?? 999;
    return oa - ob;
  });
}

export async function upsertLesson(lesson: LessonDoc): Promise<void> {
  await getCollections().lessons.updateOne(
    { lesson_id: lesson.lesson_id },
    { $set: lesson },
    { upsert: true },
  );
}
