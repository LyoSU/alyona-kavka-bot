import type { ConversationFlavor } from '@grammyjs/conversations';
import type { Context, SessionFlavor } from 'grammy';
import type { UserDoc } from '@/db/schemas';

export type SessionData = {
  current_node_id?: string;
  history: string[];
};

export type BotState = {
  user?: UserDoc;
};

type BaseContext = Context & SessionFlavor<SessionData>;

export type BotContext = BaseContext &
  ConversationFlavor<BaseContext> & {
    state: BotState;
  };
