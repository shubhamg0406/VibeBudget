-- Users (mirrors Firestore: environments/{namespace}/users/{uid})
create table public.users (
  id uuid primary key,                        -- matches Firebase Auth UID
  budget_id text not null,
  email text,
  display_name text,
  photo_url text,
  preferences jsonb default '{}'::jsonb,      -- Preferences type: baseCurrency, exchangeRates, coreExcludedCategories
  google_sheets_config jsonb,                 -- GoogleSheetsSyncConfig | null
  drive_connection jsonb,                     -- DriveConnection | null
  plaid_connection jsonb,                     -- PlaidConnection | null
  plaid_category_mappings jsonb,              -- PlaidCategoryMapping[] | null
  teller_connection jsonb,                    -- TellerConnection | null
  teller_category_mappings jsonb,             -- TellerCategoryMapping[] | null
  ai_config jsonb,                            -- AiProviderConfig | null
  last_synced_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Expense categories (mirrors: .../categories)
create table public.categories (
  id text not null,
  user_id uuid not null references public.users(id) on delete cascade,
  name text not null,
  target_amount numeric not null default 0,
  deleted boolean not null default false,
  updated_at timestamptz default now(),
  primary key (id, user_id)
);

-- Income categories (mirrors: .../incomeCategories)
create table public.income_categories (
  id text not null,
  user_id uuid not null references public.users(id) on delete cascade,
  name text not null,
  target_amount numeric not null default 0,
  deleted boolean not null default false,
  updated_at timestamptz default now(),
  primary key (id, user_id)
);

-- Transactions (mirrors: .../transactions)
create table public.transactions (
  id text not null,
  user_id uuid not null references public.users(id) on delete cascade,
  date text not null,                         -- YYYY-MM-DD string (preserve as-is)
  vendor text not null default '',
  amount numeric not null,
  amount_formula text,
  currency text,
  category_id text not null default '',
  category_name text not null default '',
  notes text not null default '',
  import_source text,
  source_id text,
  import_batch_id text,
  raw_description text,
  status text,
  recurring_rule_id text,
  is_recurring_instance boolean default false,
  deleted boolean not null default false,
  updated_at timestamptz default now(),
  primary key (id, user_id)
);

-- Income (mirrors: .../income)
create table public.income (
  id text not null,
  user_id uuid not null references public.users(id) on delete cascade,
  date text not null,
  source text not null default '',
  amount numeric not null,
  currency text,
  category_id text,
  category text not null default '',
  notes text,
  import_source text,
  source_id text,
  import_batch_id text,
  raw_description text,
  status text,
  recurring_rule_id text,
  is_recurring_instance boolean default false,
  deleted boolean not null default false,
  updated_at timestamptz default now(),
  primary key (id, user_id)
);

-- Recurring rules (mirrors: .../recurring_rules)
create table public.recurring_rules (
  id text not null,
  user_id uuid not null references public.users(id) on delete cascade,
  type text not null,                         -- 'expense' | 'income'
  amount numeric not null,
  vendor text,
  source text,
  category_id text,
  category_name text,
  category text,
  notes text,
  original_currency text,
  original_amount numeric,
  day_of_month integer not null,
  frequency text not null default 'monthly',
  start_date text not null,
  end_date text,
  last_generated_month text not null default '',
  is_active boolean not null default true,
  deleted boolean not null default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  primary key (id, user_id)
);
