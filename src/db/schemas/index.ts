import type { ObjectId } from 'mongodb';

export type Permissions = {
  manage_admins: boolean;
  edit_content: boolean;
  manage_products: boolean;
  broadcast: boolean;
  view_stats: boolean;
  support: boolean;
  manage_settings: boolean;
  refund: boolean;
};

export type UserDoc = {
  _id?: ObjectId;
  tg_id: number;
  username?: string;
  first_name: string;
  last_name?: string;
  language_code: string;
  segment?: 'first_job' | 'growing' | null;
  current_node_id?: string;
  funnel_paused: boolean;
  blocked: boolean;
  is_admin: boolean;
  permissions: Permissions;
  created_at: Date;
  last_seen_at: Date;
  purchases_count: number;
  total_spent_uah: number;
  deleted_at?: Date;
};

export type ChunkType = 'text' | 'photo' | 'video_note' | 'typing_pause';

export type FlowNodeDoc = {
  _id?: ObjectId;
  node_id: string;
  segment?: 'first_job' | 'growing' | null;
  chunks: Array<Record<string, unknown>>;
  buttons: Array<Record<string, unknown>>;
  updated_at?: Date;
  updated_by_tg_id?: number;
};

export type ProductDoc = {
  _id?: ObjectId;
  product_id: string;
  type: 'digital' | 'appointment';
  title: string;
  description: string;
  price: number;
  currency: 'UAH' | 'USD';
  visible: boolean;
  lessons?: string[];
  order: number;
  created_at: Date;
};

export type LessonDoc = {
  _id?: ObjectId;
  lesson_id: string;
  product_ids: string[];
  title: string;
  caption?: string;
  video_file_id: string;
  duration_sec?: number;
  size_bytes?: number;
  order_in_product: Record<string, number>;
  uploaded_at: Date;
  uploaded_by_tg_id: number;
};

export type PurchaseStatus = 'paid_pending_delivery' | 'delivered' | 'failed_delivery' | 'refunded';

export type PurchaseDoc = {
  _id?: ObjectId;
  user_tg_id: number;
  product_id: string;
  amount_uah: number;
  amount_original: number;
  currency_original: 'UAH' | 'USD';
  exchange_rate_used?: number;
  provider_payment_id: string;
  telegram_payment_charge_id: string;
  status: PurchaseStatus;
  delivery_attempts: number;
  created_at: Date;
  delivered_at?: Date;
};

export type AppointmentStatus = 'new' | 'contacted' | 'scheduled' | 'completed' | 'cancelled';

export type AppointmentDoc = {
  _id?: ObjectId;
  user_tg_id: number;
  product_id: string;
  purchase_id: ObjectId;
  status: AppointmentStatus;
  scheduled_at?: Date;
  admin_notes: string[];
  created_at: Date;
};

export type SupportTopicDoc = {
  _id?: ObjectId;
  user_tg_id: number;
  chat_id: number;
  thread_id: number;
  pinned_card_message_id: number;
  created_at: Date;
  flood_until?: Date;
};

export type BroadcastStatus = 'draft' | 'running' | 'paused' | 'done' | 'cancelled';

export type BroadcastDoc = {
  _id?: ObjectId;
  segment_filter: Record<string, unknown>;
  source_message: {
    type: 'text' | 'photo' | 'video' | 'voice' | 'document';
    text?: string;
    file_id?: string;
    caption?: string;
    parse_mode?: 'HTML' | 'MarkdownV2';
  };
  status: BroadcastStatus;
  total_target: number;
  sent_count: number;
  failed_count: number;
  last_processed_user_id?: ObjectId;
  created_by_tg_id: number;
  created_at: Date;
  started_at?: Date;
  finished_at?: Date;
};

export type EventDoc = {
  _id?: ObjectId;
  user_tg_id: number;
  type: string;
  payload: Record<string, unknown>;
  at: Date;
};

export type SettingsDoc = {
  _id: 'singleton';
  admin_group_chat_id?: number;
  liqpay_provider_token_encrypted?: string;
  liqpay_test_mode?: boolean;
  exchange_rate_uah_per_usd?: number;
  exchange_rate_updated_at?: Date;
  exchange_rate_manual_override?: number;
  privacy_policy_url?: string;
  professions_channel_url?: string;
};
