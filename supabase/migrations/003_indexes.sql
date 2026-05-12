-- Incremental sync queries use updated_at
create index transactions_user_updated on public.transactions(user_id, updated_at);
create index income_user_updated on public.income(user_id, updated_at);
create index categories_user_updated on public.categories(user_id, updated_at);
create index income_categories_user_updated on public.income_categories(user_id, updated_at);
create index recurring_rules_user_updated on public.recurring_rules(user_id, updated_at);

-- Soft-delete filter
create index transactions_not_deleted on public.transactions(user_id) where deleted = false;
create index income_not_deleted on public.income(user_id) where deleted = false;
