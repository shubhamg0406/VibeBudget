export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  public: {
    Tables: {
      users: {
        Row: UsersRow;
        Insert: UsersInsert;
        Update: UsersUpdate;
      };
      categories: {
        Row: CategoriesRow;
        Insert: CategoriesInsert;
        Update: CategoriesUpdate;
      };
      income_categories: {
        Row: IncomeCategoriesRow;
        Insert: IncomeCategoriesInsert;
        Update: IncomeCategoriesUpdate;
      };
      transactions: {
        Row: TransactionsRow;
        Insert: TransactionsInsert;
        Update: TransactionsUpdate;
      };
      income: {
        Row: IncomeRow;
        Insert: IncomeInsert;
        Update: IncomeUpdate;
      };
      recurring_rules: {
        Row: RecurringRulesRow;
        Insert: RecurringRulesInsert;
        Update: RecurringRulesUpdate;
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
}

export interface UsersRow {
  id: string;
  budget_id: string;
  email: string | null;
  display_name: string | null;
  photo_url: string | null;
  preferences: Json | null;
  google_sheets_config: Json | null;
  drive_connection: Json | null;
  plaid_connection: Json | null;
  plaid_category_mappings: Json | null;
  teller_connection: Json | null;
  teller_category_mappings: Json | null;
  ai_config: Json | null;
  last_synced_at: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface UsersInsert {
  id: string;
  budget_id: string;
  email?: string | null;
  display_name?: string | null;
  photo_url?: string | null;
  preferences?: Json | null;
  google_sheets_config?: Json | null;
  drive_connection?: Json | null;
  plaid_connection?: Json | null;
  plaid_category_mappings?: Json | null;
  teller_connection?: Json | null;
  teller_category_mappings?: Json | null;
  ai_config?: Json | null;
  last_synced_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface UsersUpdate {
  id?: string;
  budget_id?: string;
  email?: string | null;
  display_name?: string | null;
  photo_url?: string | null;
  preferences?: Json | null;
  google_sheets_config?: Json | null;
  drive_connection?: Json | null;
  plaid_connection?: Json | null;
  plaid_category_mappings?: Json | null;
  teller_connection?: Json | null;
  teller_category_mappings?: Json | null;
  ai_config?: Json | null;
  last_synced_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface CategoriesRow {
  id: string;
  user_id: string;
  name: string;
  target_amount: number;
  deleted: boolean;
  updated_at: string | null;
}

export interface CategoriesInsert {
  id: string;
  user_id: string;
  name: string;
  target_amount?: number;
  deleted?: boolean;
  updated_at?: string | null;
}

export interface CategoriesUpdate {
  id?: string;
  user_id?: string;
  name?: string;
  target_amount?: number;
  deleted?: boolean;
  updated_at?: string | null;
}

export interface IncomeCategoriesRow {
  id: string;
  user_id: string;
  name: string;
  target_amount: number;
  deleted: boolean;
  updated_at: string | null;
}

export interface IncomeCategoriesInsert {
  id: string;
  user_id: string;
  name: string;
  target_amount?: number;
  deleted?: boolean;
  updated_at?: string | null;
}

export interface IncomeCategoriesUpdate {
  id?: string;
  user_id?: string;
  name?: string;
  target_amount?: number;
  deleted?: boolean;
  updated_at?: string | null;
}

export interface TransactionsRow {
  id: string;
  user_id: string;
  date: string;
  vendor: string;
  amount: number;
  amount_formula: string | null;
  currency: string | null;
  category_id: string;
  category_name: string;
  notes: string;
  import_source: string | null;
  source_id: string | null;
  import_batch_id: string | null;
  raw_description: string | null;
  status: string | null;
  recurring_rule_id: string | null;
  is_recurring_instance: boolean | null;
  deleted: boolean;
  updated_at: string | null;
}

export interface TransactionsInsert {
  id: string;
  user_id: string;
  date: string;
  vendor?: string;
  amount: number;
  amount_formula?: string | null;
  currency?: string | null;
  category_id?: string;
  category_name?: string;
  notes?: string;
  import_source?: string | null;
  source_id?: string | null;
  import_batch_id?: string | null;
  raw_description?: string | null;
  status?: string | null;
  recurring_rule_id?: string | null;
  is_recurring_instance?: boolean | null;
  deleted?: boolean;
  updated_at?: string | null;
}

export interface TransactionsUpdate {
  id?: string;
  user_id?: string;
  date?: string;
  vendor?: string;
  amount?: number;
  amount_formula?: string | null;
  currency?: string | null;
  category_id?: string;
  category_name?: string;
  notes?: string;
  import_source?: string | null;
  source_id?: string | null;
  import_batch_id?: string | null;
  raw_description?: string | null;
  status?: string | null;
  recurring_rule_id?: string | null;
  is_recurring_instance?: boolean | null;
  deleted?: boolean;
  updated_at?: string | null;
}

export interface IncomeRow {
  id: string;
  user_id: string;
  date: string;
  source: string;
  amount: number;
  currency: string | null;
  category_id: string | null;
  category: string;
  notes: string | null;
  import_source: string | null;
  source_id: string | null;
  import_batch_id: string | null;
  raw_description: string | null;
  status: string | null;
  recurring_rule_id: string | null;
  is_recurring_instance: boolean | null;
  deleted: boolean;
  updated_at: string | null;
}

export interface IncomeInsert {
  id: string;
  user_id: string;
  date: string;
  source?: string;
  amount: number;
  currency?: string | null;
  category_id?: string | null;
  category?: string;
  notes?: string | null;
  import_source?: string | null;
  source_id?: string | null;
  import_batch_id?: string | null;
  raw_description?: string | null;
  status?: string | null;
  recurring_rule_id?: string | null;
  is_recurring_instance?: boolean | null;
  deleted?: boolean;
  updated_at?: string | null;
}

export interface IncomeUpdate {
  id?: string;
  user_id?: string;
  date?: string;
  source?: string;
  amount?: number;
  currency?: string | null;
  category_id?: string | null;
  category?: string;
  notes?: string | null;
  import_source?: string | null;
  source_id?: string | null;
  import_batch_id?: string | null;
  raw_description?: string | null;
  status?: string | null;
  recurring_rule_id?: string | null;
  is_recurring_instance?: boolean | null;
  deleted?: boolean;
  updated_at?: string | null;
}

export interface RecurringRulesRow {
  id: string;
  user_id: string;
  type: string;
  amount: number;
  vendor: string | null;
  source: string | null;
  category_id: string | null;
  category_name: string | null;
  category: string | null;
  notes: string | null;
  original_currency: string | null;
  original_amount: number | null;
  day_of_month: number;
  frequency: string;
  start_date: string;
  end_date: string | null;
  last_generated_month: string;
  is_active: boolean;
  deleted: boolean;
  created_at: string | null;
  updated_at: string | null;
}

export interface RecurringRulesInsert {
  id: string;
  user_id: string;
  type: string;
  amount: number;
  vendor?: string | null;
  source?: string | null;
  category_id?: string | null;
  category_name?: string | null;
  category?: string | null;
  notes?: string | null;
  original_currency?: string | null;
  original_amount?: number | null;
  day_of_month: number;
  frequency?: string;
  start_date: string;
  end_date?: string | null;
  last_generated_month?: string;
  is_active?: boolean;
  deleted?: boolean;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface RecurringRulesUpdate {
  id?: string;
  user_id?: string;
  type?: string;
  amount?: number;
  vendor?: string | null;
  source?: string | null;
  category_id?: string | null;
  category_name?: string | null;
  category?: string | null;
  notes?: string | null;
  original_currency?: string | null;
  original_amount?: number | null;
  day_of_month?: number;
  frequency?: string;
  start_date?: string;
  end_date?: string | null;
  last_generated_month?: string;
  is_active?: boolean;
  deleted?: boolean;
  created_at?: string | null;
  updated_at?: string | null;
}
