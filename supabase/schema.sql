-- StudyFlow: one saved copy of the planner per person, readable and writable only by that person.
-- Run once in Supabase: SQL Editor -> New query -> paste all of this -> Run. Safe to run again.

create table if not exists public.user_state (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  state      jsonb       not null,
  edited_at  timestamptz not null,               -- when the person last changed it, on whichever device
  updated_at timestamptz not null default now()  -- when it reached the server
);

alter table public.user_state enable row level security;

drop policy if exists "own copy: read"   on public.user_state;
drop policy if exists "own copy: add"    on public.user_state;
drop policy if exists "own copy: change" on public.user_state;
drop policy if exists "own copy: remove" on public.user_state;
create policy "own copy: read"   on public.user_state for select to authenticated using ((select auth.uid()) = user_id);
create policy "own copy: add"    on public.user_state for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "own copy: change" on public.user_state for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own copy: remove" on public.user_state for delete to authenticated using ((select auth.uid()) = user_id);

create or replace function public.touch_user_state() returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists user_state_touch on public.user_state;
create trigger user_state_touch before update on public.user_state for each row execute function public.touch_user_state();

-- "Delete my account" in the app: removes the person and, with them, their saved copy.
create or replace function public.delete_my_account() returns void
language sql security definer set search_path = '' as $$
  delete from auth.users where id = auth.uid();
$$;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
