-- Виконайте весь файл у Supabase → SQL Editor → Run

create table if not exists schedules (
  id uuid primary key default gen_random_uuid(),
  title text not null default 'Розклад уроків',
  created_at timestamptz not null default now()
);

create table if not exists profiles (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references schedules(id) on delete cascade,
  name text not null,
  role text not null check (role in ('student', 'teacher')),
  created_at timestamptz not null default now()
);

create table if not exists lessons (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references schedules(id) on delete cascade,
  day smallint not null check (day between 1 and 7),   -- 1 = понеділок … 7 = неділя
  title text not null,
  start_time time not null,
  end_time time not null,
  duration_min int not null check (duration_min > 0),
  note text,
  teacher_id uuid references profiles(id) on delete set null,
  student_id uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists lessons_schedule_idx on lessons(schedule_id);
create index if not exists profiles_schedule_idx on profiles(schedule_id);

-- Доступ без паролів: усі, хто має посилання, можуть читати й редагувати
alter table schedules enable row level security;
alter table profiles  enable row level security;
alter table lessons   enable row level security;

create policy "open access" on schedules for all to anon, authenticated using (true) with check (true);
create policy "open access" on profiles  for all to anon, authenticated using (true) with check (true);
create policy "open access" on lessons   for all to anon, authenticated using (true) with check (true);

-- Оновлення в реальному часі
alter publication supabase_realtime add table schedules, profiles, lessons;
