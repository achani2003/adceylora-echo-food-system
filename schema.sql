-- ADCEYLORA ECO FOOD ERP - run once in Supabase > SQL Editor
create table products (id uuid primary key default gen_random_uuid(), name text not null unique, created_at timestamptz default now());
create table variants (id uuid primary key default gen_random_uuid(), product_id uuid not null references products on delete cascade,
  size text not null, stock int not null default 0 check (stock >= 0), unique (product_id, size));
create table procurement (id uuid primary key default gen_random_uuid(), date date not null, supplier text not null, item text not null,
  qty numeric not null default 0, unit_price numeric not null default 0, total_cost numeric generated always as (qty*unit_price) stored,
  paid text not null check (paid in ('YES','NO','free')), deduct boolean not null default true, created_at timestamptz default now());
create table pack_logs (id uuid primary key default gen_random_uuid(), date date not null, variant_id uuid not null references variants on delete cascade,
  qty int not null check (qty > 0), created_at timestamptz default now());
create table batches (id uuid primary key default gen_random_uuid(), code text not null, date date not null, item text not null,
  fresh numeric not null check (fresh > 0), dry numeric not null check (dry >= 0), status text not null default 'COMPLETED', created_at timestamptz default now());
create table sales (id uuid primary key default gen_random_uuid(), invoice_no int generated always as identity, date date not null, market text not null,
  variant_id uuid not null references variants, qty int not null check (qty > 0), unit_price numeric not null, received numeric not null default 0,
  total_bill numeric generated always as (qty*unit_price) stored, created_at timestamptz default now());

-- Auto stock: packing adds, sale deducts (fails if stock is not enough), deleting reverses
create function stock_move() returns trigger language plpgsql as $$
begin
  if tg_table_name = 'pack_logs' then
    if tg_op = 'INSERT' then update variants set stock = stock + new.qty where id = new.variant_id;
    else update variants set stock = stock - old.qty where id = old.variant_id; end if;
  else
    if tg_op = 'INSERT' then update variants set stock = stock - new.qty where id = new.variant_id;
    else update variants set stock = stock + old.qty where id = old.variant_id; end if;
  end if;
  return null;
end $$;
create trigger t_pack after insert or delete on pack_logs for each row execute function stock_move();
create trigger t_sale after insert or delete on sales for each row execute function stock_move();

-- Only logged-in users can touch data
do $$ declare t text; begin
  foreach t in array array['products','variants','procurement','pack_logs','batches','sales'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy "auth all" on %I for all to authenticated using (true) with check (true)', t);
  end loop; end $$;

-- Optional starter products
with p as (insert into products(name) values ('Heen Bovitiya Powder'),('Moringa Powder'),('Karapincha Powder'),('Dehydrated Mango') returning id)
insert into variants(product_id,size) select p.id, s from p, unnest(array['50g','100g','1kg']) s;
