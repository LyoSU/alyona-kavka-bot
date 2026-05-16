import { Keyboard } from 'grammy';

export const MAIN_REPLY_BTN_LESSONS = '📚 Мої уроки';
export const MAIN_REPLY_BTN_SUPPORT = '💬 Підтримка';

export const mainReplyKeyboard = new Keyboard()
  .text(MAIN_REPLY_BTN_LESSONS)
  .text(MAIN_REPLY_BTN_SUPPORT)
  .resized()
  .persistent();
