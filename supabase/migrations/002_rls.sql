-- Enable RLS on all tables
alter table public.users enable row level security;
alter table public.categories enable row level security;
alter table public.income_categories enable row level security;
alter table public.transactions enable row level security;
alter table public.income enable row level security;
alter table public.recurring_rules enable row level security;

-- Users: own row only
create policy "users_own_row" on public.users
  for all using (auth.uid() = id);

-- All child tables: own rows only (user_id = auth.uid())
create policy "categories_own" on public.categories
  for all using (auth.uid() = user_id);

create policy "income_categories_own" on public.income_categories
  for all using (auth.uid() = user_id);

create policy "transactions_own" on public.transactions
  for all using (auth.uid() = user_id);

create policy "income_own" on public.income
  for all using (auth.uid() = user_id);

create policy "recurring_rules_own" on public.recurring_rules
  for all using (auth.uid() = user_id);
