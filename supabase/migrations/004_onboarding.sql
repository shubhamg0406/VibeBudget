-- Add onboarding fields to users table
alter table public.users
  add column if not exists onboarding_completed boolean not null default false,
  add column if not exists onboarding_step integer not null default 0;

-- Existing users are considered onboarded (they pre-date the wizard)
update public.users
  set onboarding_completed = true
  where created_at < now();
