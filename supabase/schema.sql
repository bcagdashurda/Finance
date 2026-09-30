-- =============================================================================
-- Mizan · Supabase şeması
--
-- Kullanım: Supabase panelinde  SQL Editor › New query  açın, bu dosyanın
-- TAMAMINI yapıştırın ve  Run  deyin. Tekrar çalıştırmak güvenlidir (idempotent).
--
-- Tasarım:
--   • Her işletme bir "workspace"tir; kullanıcılar workspace_members ile bağlanır.
--   • Satır düzeyi güvenlik (RLS): herkes yalnızca üyesi olduğu işletmenin verisini görür.
--     owner/editor yazabilir, viewer yalnızca okur.
--   • Tutarlar kuruş cinsinden tam sayıdır (bigint). Kayan nokta yoktur.
--   • Senkron: silmeler yumuşaktır (deleted_at); server_updated_at her yazımda sunucu
--     saatiyle damgalanır ve cihazlar yalnızca değişenleri çeker.
--   • Varlıklar arası referanslar (hesap, cari, kategori…) uygulama tarafından tutarlı
--     tutulur; senkronda sıra bağımlılığı olmaması için yalnızca workspace'e FK vardır.
-- =============================================================================

create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- Ortak: sunucu zaman damgası
-- -----------------------------------------------------------------------------
create or replace function public.mizan_touch()
returns trigger
language plpgsql
as $$
begin
  new.server_updated_at := now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- İşletmeler ve üyelik
-- -----------------------------------------------------------------------------
create table if not exists public.workspaces (
  id                      text primary key,
  owner_id                uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name                    text not null,
  legal_name              text,
  tax_id                  text,
  base_currency           text not null default 'TRY' check (base_currency in ('TRY', 'USD', 'EUR', 'GBP')),
  fiscal_year_start_month smallint not null default 1 check (fiscal_year_start_month between 1 and 12),
  settings                jsonb not null default '{}'::jsonb,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  deleted_at              timestamptz,
  server_updated_at       timestamptz not null default now()
);

create table if not exists public.workspace_members (
  workspace_id text not null references public.workspaces (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  role         text not null default 'owner' check (role in ('owner', 'editor', 'viewer')),
  created_at   timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create index if not exists workspace_members_user_idx on public.workspace_members (user_id);

-- Üyelik kontrolleri (RLS politikalarında kullanılır; security definer ile döngüsel RLS'den kaçınır)
create or replace function public.mizan_is_member(ws text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.workspace_members m
    where m.workspace_id = ws and m.user_id = auth.uid()
  );
$$;

create or replace function public.mizan_can_edit(ws text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.workspace_members m
    where m.workspace_id = ws and m.user_id = auth.uid() and m.role in ('owner', 'editor')
  );
$$;

create or replace function public.mizan_is_owner(ws text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.workspace_members m
    where m.workspace_id = ws and m.user_id = auth.uid() and m.role = 'owner'
  );
$$;

-- Yeni işletme oluşturan kullanıcı otomatik olarak sahibi olur
create or replace function public.mizan_on_workspace_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.workspace_members (workspace_id, user_id, role)
  values (new.id, new.owner_id, 'owner')
  on conflict (workspace_id, user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists mizan_workspace_created on public.workspaces;
create trigger mizan_workspace_created
  after insert on public.workspaces
  for each row execute function public.mizan_on_workspace_created();

drop trigger if exists mizan_touch_workspaces on public.workspaces;
create trigger mizan_touch_workspaces
  before insert or update on public.workspaces
  for each row execute function public.mizan_touch();

-- -----------------------------------------------------------------------------
-- Hesaplar
-- -----------------------------------------------------------------------------
create table if not exists public.accounts (
  id                text primary key,
  workspace_id      text not null references public.workspaces (id) on delete cascade,
  name              text not null,
  kind              text not null check (kind in ('bank', 'cash', 'card', 'pos', 'investment', 'other')),
  institution       text,
  iban              text,
  currency          text not null check (currency in ('TRY', 'USD', 'EUR', 'GBP')),
  opening_balance   bigint not null default 0,
  opening_date      date not null,
  min_balance       bigint,
  credit_limit      bigint,
  color             text not null default 'c1',
  archived          boolean not null default false,
  sort_order        integer not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz,
  server_updated_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Kategoriler
-- -----------------------------------------------------------------------------
create table if not exists public.categories (
  id                text primary key,
  workspace_id      text not null references public.workspaces (id) on delete cascade,
  name              text not null,
  kind              text not null check (kind in ('income', 'expense')),
  parent_id         text,
  color             text not null default 'c1',
  icon              text not null default 'dots',
  monthly_budget    bigint,
  archived          boolean not null default false,
  system            boolean,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz,
  server_updated_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Cariler
-- -----------------------------------------------------------------------------
create table if not exists public.contacts (
  id                text primary key,
  workspace_id      text not null references public.workspaces (id) on delete cascade,
  name              text not null,
  kind              text not null check (kind in ('customer', 'supplier', 'both', 'other')),
  tax_id            text,
  tax_office        text,
  email             text,
  phone             text,
  iban              text,
  address           text,
  payment_term_days integer,
  risk_limit        bigint,
  currency          text not null default 'TRY' check (currency in ('TRY', 'USD', 'EUR', 'GBP')),
  opening_balance   bigint not null default 0,
  opening_date      date,
  tags              text[] not null default '{}',
  notes             text,
  archived          boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz,
  server_updated_at timestamptz not null default now()
);
-- Şemanın eski sürümünü çalıştırmış kurulumlar için (tekrar çalıştırmak güvenlidir)
alter table public.contacts add column if not exists opening_date date;

-- -----------------------------------------------------------------------------
-- İşlemler (gerçekleşmiş para hareketleri)
-- -----------------------------------------------------------------------------
create table if not exists public.transactions (
  id                text primary key,
  workspace_id      text not null references public.workspaces (id) on delete cascade,
  kind              text not null check (kind in ('income', 'expense', 'transfer')),
  date              date not null,
  account_id        text not null,
  amount            bigint not null check (amount >= 0),
  currency          text not null check (currency in ('TRY', 'USD', 'EUR', 'GBP')),
  rate_to_base      numeric(20, 8) not null default 1,
  to_account_id     text,
  to_amount         bigint,
  category_id       text,
  contact_id        text,
  affects_ledger    boolean not null default false,
  description       text not null default '',
  reference         text,
  tags              text[] not null default '{}',
  source            text not null default 'manual'
                    check (source in ('manual', 'import', 'document', 'recurring', 'instrument', 'ai', 'demo')),
  recurring_id      text,
  occurrence_date   date,
  instrument_id     text,
  import_hash       text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz,
  server_updated_at timestamptz not null default now()
);

create index if not exists transactions_ws_date_idx on public.transactions (workspace_id, date desc);
create index if not exists transactions_ws_contact_idx on public.transactions (workspace_id, contact_id);
create index if not exists transactions_ws_account_idx on public.transactions (workspace_id, account_id);

-- -----------------------------------------------------------------------------
-- Belgeler (alacak / borç: faturalar, vergi tahakkukları…)
-- -----------------------------------------------------------------------------
create table if not exists public.documents (
  id                  text primary key,
  workspace_id        text not null references public.workspaces (id) on delete cascade,
  direction           text not null check (direction in ('receivable', 'payable')),
  contact_id          text,
  category_id         text,
  title               text not null,
  number              text,
  issue_date          date not null,
  due_date            date not null,
  amount              bigint not null check (amount >= 0),
  currency            text not null check (currency in ('TRY', 'USD', 'EUR', 'GBP')),
  rate_to_base        numeric(20, 8) not null default 1,
  vat_rate            smallint check (vat_rate in (0, 1, 10, 20)),
  vat_amount          bigint,
  expected_account_id text,
  probability         smallint check (probability between 0 and 100),
  cancelled           boolean not null default false,
  notes               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  deleted_at          timestamptz,
  server_updated_at   timestamptz not null default now()
);

create index if not exists documents_ws_due_idx on public.documents (workspace_id, due_date);
create index if not exists documents_ws_contact_idx on public.documents (workspace_id, contact_id);

-- -----------------------------------------------------------------------------
-- Tahsisler (hangi ödeme/çek hangi belgeyi kapattı)
-- -----------------------------------------------------------------------------
create table if not exists public.allocations (
  id                text primary key,
  workspace_id      text not null references public.workspaces (id) on delete cascade,
  document_id       text not null,
  transaction_id    text,
  instrument_id     text,
  amount            bigint not null check (amount >= 0),
  date              date not null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz,
  server_updated_at timestamptz not null default now()
);

create index if not exists allocations_ws_document_idx on public.allocations (workspace_id, document_id);

-- -----------------------------------------------------------------------------
-- Tekrarlayan yükümlülükler (kira, maaş, vergi…)
-- -----------------------------------------------------------------------------
create table if not exists public.recurring_rules (
  id                text primary key,
  workspace_id      text not null references public.workspaces (id) on delete cascade,
  direction         text not null check (direction in ('in', 'out')),
  title             text not null,
  amount            bigint not null check (amount >= 0),
  currency          text not null check (currency in ('TRY', 'USD', 'EUR', 'GBP')),
  account_id        text,
  category_id       text,
  contact_id        text,
  frequency         text not null check (frequency in ('weekly', 'monthly', 'quarterly', 'yearly')),
  interval          integer not null default 1 check (interval >= 1),
  anchor_date       date not null,
  end_date          date,
  weekend_policy    text not null default 'next' check (weekend_policy in ('none', 'next', 'previous')),
  auto_post         boolean not null default false,
  active            boolean not null default true,
  template          text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz,
  server_updated_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Çek ve senetler
-- -----------------------------------------------------------------------------
create table if not exists public.instruments (
  id                text primary key,
  workspace_id      text not null references public.workspaces (id) on delete cascade,
  kind              text not null check (kind in ('cheque', 'note')),
  direction         text not null check (direction in ('received', 'issued')),
  serial_no         text not null,
  bank              text,
  branch            text,
  drawer            text,
  contact_id        text not null,
  amount            bigint not null check (amount >= 0),
  currency          text not null check (currency in ('TRY', 'USD', 'EUR', 'GBP')),
  rate_to_base      numeric(20, 8) not null default 1,
  issue_date        date not null,
  due_date          date not null,
  status            text not null check (status in (
                      'portfolio', 'deposited', 'collected', 'endorsed', 'bounced', 'returned',
                      'issued', 'paid', 'cancelled')),
  history           jsonb not null default '[]'::jsonb,
  account_id        text,
  endorsed_to_id    text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz,
  server_updated_at timestamptz not null default now()
);

create index if not exists instruments_ws_due_idx on public.instruments (workspace_id, due_date);

-- -----------------------------------------------------------------------------
-- Senaryolar ("ya şöyle olursa?")
-- -----------------------------------------------------------------------------
create table if not exists public.scenarios (
  id                text primary key,
  workspace_id      text not null references public.workspaces (id) on delete cascade,
  name              text not null,
  color             text not null default 'c7',
  active            boolean not null default false,
  adjustments       jsonb not null default '[]'::jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz,
  server_updated_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Öğrenilen kategorizasyon kuralları (ekstre içe aktarma)
-- -----------------------------------------------------------------------------
create table if not exists public.categorization_rules (
  id                text primary key,
  workspace_id      text not null references public.workspaces (id) on delete cascade,
  pattern           text not null,
  category_id       text,
  contact_id        text,
  hits              integer not null default 1,
  source            text not null default 'user' check (source in ('user', 'ai')),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz,
  server_updated_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Tüm varlık tabloları: senkron indeksi, zaman damgası tetikleyicisi, RLS
-- -----------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'accounts', 'categories', 'contacts', 'transactions', 'documents',
    'allocations', 'recurring_rules', 'instruments', 'scenarios', 'categorization_rules'
  ]
  loop
    execute format('create index if not exists %I on public.%I (workspace_id, server_updated_at)', t || '_sync_idx', t);

    execute format('drop trigger if exists %I on public.%I', 'mizan_touch_' || t, t);
    execute format('create trigger %I before insert or update on public.%I for each row execute function public.mizan_touch()', 'mizan_touch_' || t, t);

    execute format('alter table public.%I enable row level security', t);

    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.mizan_is_member(workspace_id))', t || '_select', t);

    execute format('drop policy if exists %I on public.%I', t || '_insert', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.mizan_can_edit(workspace_id))', t || '_insert', t);

    execute format('drop policy if exists %I on public.%I', t || '_update', t);
    execute format('create policy %I on public.%I for update to authenticated using (public.mizan_can_edit(workspace_id)) with check (public.mizan_can_edit(workspace_id))', t || '_update', t);

    execute format('drop policy if exists %I on public.%I', t || '_delete', t);
    execute format('create policy %I on public.%I for delete to authenticated using (public.mizan_can_edit(workspace_id))', t || '_delete', t);

    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end;
$$;

-- İşletme ve üyelik tabloları için RLS
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;

drop policy if exists workspaces_select on public.workspaces;
create policy workspaces_select on public.workspaces for select to authenticated
  using (owner_id = auth.uid() or public.mizan_is_member(id));

drop policy if exists workspaces_insert on public.workspaces;
create policy workspaces_insert on public.workspaces for insert to authenticated
  with check (owner_id = auth.uid());

drop policy if exists workspaces_update on public.workspaces;
create policy workspaces_update on public.workspaces for update to authenticated
  using (public.mizan_can_edit(id)) with check (public.mizan_can_edit(id));

drop policy if exists workspaces_delete on public.workspaces;
create policy workspaces_delete on public.workspaces for delete to authenticated
  using (public.mizan_is_owner(id));

drop policy if exists members_select on public.workspace_members;
create policy members_select on public.workspace_members for select to authenticated
  using (user_id = auth.uid() or public.mizan_is_member(workspace_id));

drop policy if exists members_insert on public.workspace_members;
create policy members_insert on public.workspace_members for insert to authenticated
  with check (public.mizan_is_owner(workspace_id));

drop policy if exists members_update on public.workspace_members;
create policy members_update on public.workspace_members for update to authenticated
  using (public.mizan_is_owner(workspace_id)) with check (public.mizan_is_owner(workspace_id));

drop policy if exists members_delete on public.workspace_members;
create policy members_delete on public.workspace_members for delete to authenticated
  using (public.mizan_is_owner(workspace_id) or user_id = auth.uid());

revoke all on public.workspaces from anon;
revoke all on public.workspace_members from anon;
grant select, insert, update, delete on public.workspaces to authenticated;
grant select, insert, update, delete on public.workspace_members to authenticated;

grant execute on function public.mizan_is_member(text) to authenticated;
grant execute on function public.mizan_can_edit(text) to authenticated;
grant execute on function public.mizan_is_owner(text) to authenticated;

-- -----------------------------------------------------------------------------
-- İşletmeye ekip üyesi davet etme (yalnızca sahip): e-posta ile kayıtlı kullanıcıyı ekler
-- -----------------------------------------------------------------------------
create or replace function public.mizan_add_member(ws text, member_email text, member_role text default 'editor')
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid;
begin
  if not public.mizan_is_owner(ws) then
    raise exception 'Bu işletmeye üye ekleme yetkiniz yok';
  end if;
  if member_role not in ('editor', 'viewer') then
    raise exception 'Geçersiz rol';
  end if;
  select id into uid from auth.users where lower(email) = lower(member_email);
  if uid is null then
    raise exception 'Bu e-postayla kayıtlı kullanıcı bulunamadı; önce Mizan''da hesap oluşturmalı';
  end if;
  insert into public.workspace_members (workspace_id, user_id, role)
  values (ws, uid, member_role)
  on conflict (workspace_id, user_id) do update set role = excluded.role;
end;
$$;

revoke all on function public.mizan_add_member(text, text, text) from anon;
grant execute on function public.mizan_add_member(text, text, text) to authenticated;

-- -----------------------------------------------------------------------------
-- Raporlama görünümleri (Supabase panelinden SQL ile analiz için; RLS'ye tabidir)
-- -----------------------------------------------------------------------------
create or replace view public.v_monthly_cashflow
with (security_invoker = true)
as
select
  workspace_id,
  date_trunc('month', date)::date                                          as month,
  sum(case when kind = 'income'  then round(amount * rate_to_base) else 0 end)::bigint as inflow_minor,
  sum(case when kind = 'expense' then round(amount * rate_to_base) else 0 end)::bigint as outflow_minor
from public.transactions
where deleted_at is null and kind <> 'transfer'
group by workspace_id, date_trunc('month', date);

create or replace view public.v_open_documents
with (security_invoker = true)
as
select
  d.workspace_id,
  d.id,
  d.direction,
  d.contact_id,
  d.number,
  d.title,
  d.due_date,
  d.amount,
  d.currency,
  d.amount - coalesce(sum(a.amount) filter (where a.deleted_at is null), 0) as remaining,
  greatest(0, current_date - d.due_date)                                 as days_overdue
from public.documents d
left join public.allocations a on a.document_id = d.id and a.workspace_id = d.workspace_id
where d.deleted_at is null and not d.cancelled
group by d.id
having d.amount - coalesce(sum(a.amount) filter (where a.deleted_at is null), 0) > 0;

grant select on public.v_monthly_cashflow to authenticated;
grant select on public.v_open_documents to authenticated;

-- Bitti. Supabase › Project Settings › API sayfasındaki  Project URL  ve
-- anon public  anahtarını Mizan › Ayarlar › Bulut senkronu bölümüne yapıştırın.
