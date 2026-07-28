-- Ensure app profiles can carry the viewer role used by the SAT-only access flow.
-- This migration also normalizes a pre-existing role column without assuming its
-- previous type, default, nullability, or name for a role-only check constraint.
do $$
declare
  role_attnum smallint;
  role_type regtype;
  role_constraint record;
begin
  if to_regclass('public.profiles') is null then
    raise notice 'public.profiles does not exist; skipping profile role setup.';
    return;
  end if;

  select attnum, atttypid::regtype
    into role_attnum, role_type
  from pg_attribute
  where attrelid = 'public.profiles'::regclass
    and attname = 'role'
    and not attisdropped;

  if role_attnum is null then
    alter table public.profiles
      add column role text not null default 'user';
  else
    -- Replace only checks that constrain role alone. A mixed check is not safe
    -- to rewrite automatically because it may encode unrelated business rules.
    for role_constraint in
      select conname, conkey
      from pg_constraint
      where conrelid = 'public.profiles'::regclass
        and contype = 'c'
        and conkey @> array[role_attnum]::smallint[]
    loop
      if role_constraint.conkey <> array[role_attnum]::smallint[] then
        raise exception
          'Cannot safely replace mixed check constraint % on public.profiles.role',
          role_constraint.conname;
      end if;

      execute format(
        'alter table public.profiles drop constraint %I',
        role_constraint.conname
      );
    end loop;

    if role_type <> 'text'::regtype then
      alter table public.profiles alter column role drop default;
      alter table public.profiles
        alter column role type text using role::text;
    end if;

    update public.profiles
      set role = case
        when lower(btrim(role)) in ('admin', 'user', 'viewer') then lower(btrim(role))
        else 'user'
      end;

    alter table public.profiles alter column role set default 'user';
    alter table public.profiles alter column role set not null;
  end if;

  alter table public.profiles
    add constraint profiles_role_check
    check (role in ('admin', 'user', 'viewer'));
end $$;
