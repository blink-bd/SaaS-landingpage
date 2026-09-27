-- ============================================================
-- هيكل قاعدة البيانات - نظام إدارة المتاجر (Multi-Tenant)
-- ينفَّذ مرة واحدة من SQL Editor في لوحة Supabase
-- ============================================================

-- عشان نقدر نعمل hashing لكلمات المرور جوه قاعدة البيانات نفسها
create extension if not exists pgcrypto;

-- ============================================================
-- جدول المتاجر (بديل "Master Sheet" + تبويب Settings بتاع كل عميل)
-- ============================================================
create table stores (
  id              uuid primary key default gen_random_uuid(),
  store_name      text not null,
  username        text not null unique,
  password_hash   text not null,
  status          text not null default 'Active' check (status in ('Active', 'Suspended')),
  -- كل الإعدادات المرنة (هاتف، واتساب، ألوان، لوجو، CRM...) في عمود JSON واحد
  -- بدل عمود منفصل لكل حقل، عشان نضيف حقول جديدة مستقبلًا من غير ما نعدّل هيكل الجدول
  settings        jsonb not null default '{
    "Phone": "", "WhatsApp": "", "Address": "", "Facebook": "", "Instagram": "",
    "DeliveryInfo": "التوصيل لجميع المحافظات خلال 2-4 أيام عمل", "Currency": "ج.م",
    "PrimaryColor": "#146356", "AccentColor": "#D9922E", "LogoURL": "",
    "CRMProvider": "none", "CRMWebhookURL": "",
    "ZohoClientID": "", "ZohoClientSecret": "", "ZohoRefreshToken": "",
    "ZohoAPIDomain": "https://www.zohoapis.com", "ZohoAccountsDomain": "https://accounts.zoho.com",
    "ZohoModule": "Leads"
  }'::jsonb,
  created_at      timestamptz not null default now()
);

-- ============================================================
-- جدول المنتجات
-- ============================================================
create table products (
  id                uuid primary key default gen_random_uuid(),
  store_id          uuid not null references stores(id) on delete cascade,
  product_name      text not null,
  description       text default '',
  price             numeric not null default 0,
  old_price         numeric default 0,
  delivery_fee      numeric default 0,
  stock_status      text default 'متوفر',
  main_image        text default '',
  gallery_images    text default '',
  features          text default '',
  specifications    text default '',
  faq               text default '',
  active            boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index idx_products_store on products(store_id);

-- ============================================================
-- جدول الطلبات
-- ============================================================
create table orders (
  id              uuid primary key default gen_random_uuid(),
  order_number    text not null unique,
  store_id        uuid not null references stores(id) on delete cascade,
  product_id      uuid references products(id) on delete set null,
  product_name    text,
  customer_name   text not null,
  phone           text not null,
  governorate     text not null,
  address         text not null,
  quantity        int not null default 1,
  unit_price      numeric not null default 0,
  delivery_fee    numeric not null default 0,
  total           numeric not null default 0,
  notes           text default '',
  status          text not null default 'جديد',
  source          text default 'الموقع الإلكتروني',
  created_at      timestamptz not null default now()
);
create index idx_orders_store on orders(store_id, created_at desc);
create index idx_orders_phone on orders(store_id, phone);

-- ============================================================
-- جدول العملاء (زباين كل تاجر)
-- ============================================================
create table customers (
  id              uuid primary key default gen_random_uuid(),
  store_id        uuid not null references stores(id) on delete cascade,
  name            text not null,
  phone           text not null,
  governorate     text,
  address         text,
  first_order_at  timestamptz not null default now(),
  last_order_at   timestamptz not null default now(),
  total_orders    int not null default 1,
  total_spent     numeric not null default 0,
  unique (store_id, phone)
);
create index idx_customers_store on customers(store_id);

-- ============================================================
-- جدول الجلسات (بديل CacheService القديم بتاع Apps Script)
-- ============================================================
create table sessions (
  token       uuid primary key default gen_random_uuid(),
  role        text not null check (role in ('superadmin', 'client')),
  store_id    uuid references stores(id) on delete cascade,
  store_name  text,
  username    text,
  expires_at  timestamptz not null
);
create index idx_sessions_expiry on sessions(expires_at);

-- ============================================================
-- إعدادات المنصة (صف واحد بس - حساب المدير العام + هويته البصرية)
-- ============================================================
create table platform_settings (
  id                      int primary key default 1 check (id = 1),
  superadmin_username     text not null,
  superadmin_password_hash text not null,
  platform_name           text default 'منصة إدارة المتاجر',
  primary_color           text default '#146356',
  accent_color            text default '#D9922E',
  logo_url                text default '',
  footer_text             text default '',
  footer_link             text default ''
);

-- ============================================================
-- تفعيل الحماية (RLS) على كل الجداول: منع أي وصول مباشر من الفرونت إند
-- كل التعامل لازم يتم فقط عن طريق الدوال (RPC Functions) في ملف functions.sql
-- ============================================================
alter table stores enable row level security;
alter table products enable row level security;
alter table orders enable row level security;
alter table customers enable row level security;
alter table sessions enable row level security;
alter table platform_settings enable row level security;
-- (مفيش أي "policy" مضافة عمدًا = يعني مفيش أي وصول مباشر مسموح به إطلاقًا لأي جدول من هنا)

-- ============================================================
-- إعداد أول حساب مدير عام (super admin)
-- ⚠️ غيّر الباسورد 'ChangeThisMasterPassword123!' قبل ما تشغّل السطر ده
-- ============================================================
insert into platform_settings (id, superadmin_username, superadmin_password_hash, platform_name)
values (1, 'superadmin', crypt('ChangeThisMasterPassword123!', gen_salt('bf')), 'منصة إدارة المتاجر');
