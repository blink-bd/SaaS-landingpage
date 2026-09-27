-- ============================================================
-- دوال الباك إند الكاملة (Postgres Functions / RPC)
-- ينفَّذ بعد schema.sql مباشرة من SQL Editor في لوحة Supabase
-- كل دالة هنا مكافئة لدالة (أو أكتر) في ملفات Apps Script القديمة
-- ============================================================

-- ------------------------------------------------------------
-- دالة مساعدة: تتحقق من صلاحية الجلسة وتمدّد وقتها (زي CacheService قبل كده)
-- ------------------------------------------------------------
create or replace function _touch_session(p_token uuid)
returns sessions
language plpgsql security definer as $$
declare v_session sessions;
begin
  update sessions set expires_at = now() + interval '6 hours'
  where token = p_token and expires_at > now()
  returning * into v_session;
  return v_session;
end;
$$;

-- ------------------------------------------------------------
-- login: تسجيل الدخول (مدير عام أو تاجر)
-- ------------------------------------------------------------
create or replace function login(p_username text, p_password text)
returns jsonb
language plpgsql security definer as $$
declare
  v_platform platform_settings;
  v_store stores;
  v_token uuid;
begin
  if p_username is null or p_password is null then
    return jsonb_build_object('success', false, 'error', 'يرجى إدخال اسم المستخدم وكلمة المرور');
  end if;

  -- 1) تحقق من المدير العام
  select * into v_platform from platform_settings where id = 1;
  if v_platform.superadmin_username = p_username
     and v_platform.superadmin_password_hash = crypt(p_password, v_platform.superadmin_password_hash) then
    v_token := gen_random_uuid();
    insert into sessions (token, role, username, expires_at)
    values (v_token, 'superadmin', p_username, now() + interval '6 hours');
    return jsonb_build_object('success', true, 'token', v_token, 'role', 'superadmin',
                               'username', p_username, 'expiresIn', 21600);
  end if;

  -- 2) تحقق من حسابات التجار
  select * into v_store from stores where username = p_username and status = 'Active';
  if v_store.id is not null and v_store.password_hash = crypt(p_password, v_store.password_hash) then
    v_token := gen_random_uuid();
    insert into sessions (token, role, store_id, store_name, username, expires_at)
    values (v_token, 'client', v_store.id, v_store.store_name, p_username, now() + interval '6 hours');
    return jsonb_build_object('success', true, 'token', v_token, 'role', 'client',
                               'storeId', v_store.id, 'storeName', v_store.store_name,
                               'username', p_username, 'expiresIn', 21600);
  end if;

  return jsonb_build_object('success', false, 'error', 'اسم المستخدم أو كلمة المرور غير صحيحة، أو الحساب غير نشط');
end;
$$;

create or replace function logout(p_token uuid)
returns jsonb language sql security definer as $$
  delete from sessions where token = p_token;
  select jsonb_build_object('success', true);
$$;

-- ------------------------------------------------------------
-- getPublicData: بيانات صفحة المنتج (بدون تسجيل دخول)
-- ------------------------------------------------------------
create or replace function get_public_data(p_store_id uuid, p_product_id uuid default null)
returns jsonb
language plpgsql security definer as $$
declare
  v_store stores;
  v_product products;
  v_settings jsonb;
begin
  if p_store_id is null then
    return jsonb_build_object('success', false, 'error', 'رابط غير صالح: لا يوجد معرف متجر');
  end if;

  select * into v_store from stores where id = p_store_id;
  if v_store.id is null then
    return jsonb_build_object('success', false, 'error', 'هذا المتجر غير موجود');
  end if;
  if v_store.status <> 'Active' then
    return jsonb_build_object('success', false, 'error', 'هذا المتجر غير متاح حاليًا');
  end if;

  if p_product_id is not null then
    select * into v_product from products where id = p_product_id and store_id = p_store_id;
  else
    select * into v_product from products where store_id = p_store_id and active = true order by created_at limit 1;
  end if;

  v_settings := coalesce(v_store.settings, '{}'::jsonb) || jsonb_build_object('StoreName', v_store.store_name);

  if v_product.id is null then
    return jsonb_build_object('success', true, 'settings', v_settings, 'product', null, 'storeName', v_store.store_name);
  end if;

  return jsonb_build_object(
    'success', true,
    'storeName', v_store.store_name,
    'settings', v_settings,
    'product', jsonb_build_object(
      'Product ID', v_product.id, 'Product Name', v_product.product_name, 'Description', v_product.description,
      'Price', v_product.price, 'Old Price', v_product.old_price, 'Delivery Fee', v_product.delivery_fee,
      'Stock Status', v_product.stock_status, 'Main Image', v_product.main_image, 'Gallery Images', v_product.gallery_images,
      'Features', v_product.features, 'Specifications', v_product.specifications, 'FAQ', v_product.faq,
      'Active', v_product.active
    )
  );
end;
$$;

-- ------------------------------------------------------------
-- createOrder: تسجيل طلب جديد (بدون تسجيل دخول)
-- ------------------------------------------------------------
create or replace function create_order(
  p_store_id uuid, p_product_id uuid, p_name text, p_phone text, p_governorate text,
  p_address text, p_notes text default '', p_quantity int default 1, p_honeypot text default ''
)
returns jsonb
language plpgsql security definer as $$
declare
  v_store stores;
  v_product products;
  v_total numeric;
  v_order_number text;
  v_recent_count int;
begin
  if p_honeypot is not null and p_honeypot <> '' then
    return jsonb_build_object('success', true, 'orderId', 'IGNORED', 'total', 0, 'productName', '');
  end if;

  select * into v_store from stores where id = p_store_id;
  if v_store.id is null then return jsonb_build_object('success', false, 'error', 'هذا المتجر غير موجود'); end if;
  if v_store.status <> 'Active' then return jsonb_build_object('success', false, 'error', 'هذا المتجر غير متاح حاليًا'); end if;

  if p_name is null or length(trim(p_name)) < 3 then
    return jsonb_build_object('success', false, 'error', 'الاسم غير صحيح');
  end if;
  if p_phone !~ '^01[0125][0-9]{8}$' then
    return jsonb_build_object('success', false, 'error', 'رقم الهاتف غير صحيح');
  end if;
  if p_governorate is null or p_governorate = '' then
    return jsonb_build_object('success', false, 'error', 'يرجى اختيار المحافظة');
  end if;
  if p_address is null or length(trim(p_address)) < 5 then
    return jsonb_build_object('success', false, 'error', 'العنوان غير مكتمل');
  end if;
  if p_quantity < 1 or p_quantity > 50 then
    return jsonb_build_object('success', false, 'error', 'الكمية غير صحيحة');
  end if;

  -- منع تكرار الطلب بنفس الرقم خلال 30 ثانية (بديل الـ rate limit القديم)
  select count(*) into v_recent_count from orders
  where store_id = p_store_id and phone = p_phone and created_at > now() - interval '30 seconds';
  if v_recent_count > 0 then
    return jsonb_build_object('success', false, 'error', 'تم إرسال طلب بهذا الرقم للتو، انتظر 30 ثانية');
  end if;

  if p_product_id is not null then
    select * into v_product from products where id = p_product_id and store_id = p_store_id;
  else
    select * into v_product from products where store_id = p_store_id and active = true order by created_at limit 1;
  end if;
  if v_product.id is null then
    return jsonb_build_object('success', false, 'error', 'هذا المنتج غير متوفر حاليًا');
  end if;

  v_total := (v_product.price * p_quantity) + coalesce(v_product.delivery_fee, 0);
  v_order_number := 'ORD-' || to_char(now(), 'YYYYMMDD') || '-' || lpad(floor(random() * 9000 + 1000)::text, 4, '0');

  insert into orders (order_number, store_id, product_id, product_name, customer_name, phone, governorate,
                       address, quantity, unit_price, delivery_fee, total, notes, status, source)
  values (v_order_number, p_store_id, v_product.id, v_product.product_name, trim(p_name), p_phone, p_governorate,
          trim(p_address), p_quantity, v_product.price, coalesce(v_product.delivery_fee, 0), v_total,
          coalesce(p_notes, ''), 'جديد', 'الموقع الإلكتروني');

  insert into customers (store_id, name, phone, governorate, address, total_orders, total_spent)
  values (p_store_id, trim(p_name), p_phone, p_governorate, trim(p_address), 1, v_total)
  on conflict (store_id, phone) do update set
    total_orders = customers.total_orders + 1,
    total_spent = customers.total_spent + v_total,
    last_order_at = now(),
    governorate = excluded.governorate,
    address = excluded.address;

  return jsonb_build_object('success', true, 'orderId', v_order_number, 'total', v_total,
                             'unitPrice', v_product.price, 'deliveryFee', coalesce(v_product.delivery_fee, 0),
                             'productName', v_product.product_name, 'storeName', v_store.store_name);
end;
$$;

-- ------------------------------------------------------------
-- getAdminBootstrap: كل بيانات لوحة التاجر دفعة واحدة
-- ------------------------------------------------------------
create or replace function get_admin_bootstrap(p_token uuid)
returns jsonb
language plpgsql security definer as $$
declare v_session sessions;
begin
  v_session := _touch_session(p_token);
  if v_session.token is null or v_session.role <> 'client' then
    return jsonb_build_object('success', false, 'error', 'غير مصرح، يرجى تسجيل الدخول مرة أخرى');
  end if;

  return jsonb_build_object(
    'success', true,
    'storeName', v_session.store_name,
    'orders', coalesce((
      select jsonb_agg(jsonb_build_object(
        'Order ID', o.order_number, 'Date', to_char(o.created_at, 'YYYY-MM-DD'), 'Time', to_char(o.created_at, 'HH24:MI:SS'),
        'Customer Name', o.customer_name, 'Phone', o.phone, 'Governorate', o.governorate, 'Address', o.address,
        'Product', o.product_name, 'Quantity', o.quantity, 'Unit Price', o.unit_price, 'Delivery Fee', o.delivery_fee,
        'Total', o.total, 'Notes', o.notes, 'Order Status', o.status, 'Source', o.source
      ) order by o.created_at desc)
      from orders o where o.store_id = v_session.store_id
    ), '[]'::jsonb),
    'customers', coalesce((
      select jsonb_agg(jsonb_build_object(
        'Name', c.name, 'Phone', c.phone, 'Governorate', c.governorate,
        'Total Orders', c.total_orders, 'Total Spent', c.total_spent,
        'Last Order Date', to_char(c.last_order_at, 'YYYY-MM-DD')
      ) order by c.last_order_at desc)
      from customers c where c.store_id = v_session.store_id
    ), '[]'::jsonb),
    'products', coalesce((
      select jsonb_agg(jsonb_build_object(
        'Product ID', p.id, 'Product Name', p.product_name, 'Description', p.description,
        'Price', p.price, 'Old Price', p.old_price, 'Delivery Fee', p.delivery_fee, 'Stock Status', p.stock_status,
        'Main Image', p.main_image, 'Gallery Images', p.gallery_images, 'Features', p.features,
        'Specifications', p.specifications, 'FAQ', p.faq, 'Active', p.active
      ))
      from products p where p.store_id = v_session.store_id
    ), '[]'::jsonb),
    'settings', (
      select coalesce(s.settings, '{}'::jsonb) || jsonb_build_object('StoreName', s.store_name)
      from stores s where s.id = v_session.store_id
    )
  );
end;
$$;

create or replace function update_order_status(p_token uuid, p_order_id text, p_status text)
returns jsonb language plpgsql security definer as $$
declare v_session sessions; v_valid text[] := array['جديد','تم التواصل','مؤكد','قيد التجهيز','تم الشحن','تم التوصيل','ملغي'];
begin
  v_session := _touch_session(p_token);
  if v_session.token is null or v_session.role <> 'client' then
    return jsonb_build_object('success', false, 'error', 'غير مصرح');
  end if;
  if not (p_status = any(v_valid)) then
    return jsonb_build_object('success', false, 'error', 'حالة غير صحيحة');
  end if;
  update orders set status = p_status where order_number = p_order_id and store_id = v_session.store_id;
  if not found then return jsonb_build_object('success', false, 'error', 'الطلب غير موجود'); end if;
  return jsonb_build_object('success', true);
end;
$$;

create or replace function delete_order(p_token uuid, p_order_id text)
returns jsonb language plpgsql security definer as $$
declare v_session sessions;
begin
  v_session := _touch_session(p_token);
  if v_session.token is null or v_session.role <> 'client' then
    return jsonb_build_object('success', false, 'error', 'غير مصرح');
  end if;
  delete from orders where order_number = p_order_id and store_id = v_session.store_id;
  if not found then return jsonb_build_object('success', false, 'error', 'الطلب غير موجود'); end if;
  return jsonb_build_object('success', true);
end;
$$;

create or replace function get_customer_orders(p_token uuid, p_phone text)
returns jsonb language plpgsql security definer as $$
declare v_session sessions;
begin
  v_session := _touch_session(p_token);
  if v_session.token is null or v_session.role <> 'client' then
    return jsonb_build_object('success', false, 'error', 'غير مصرح');
  end if;
  return jsonb_build_object('success', true, 'orders', coalesce((
    select jsonb_agg(jsonb_build_object(
      'Order ID', o.order_number, 'Product', o.product_name, 'Quantity', o.quantity,
      'Total', o.total, 'Order Status', o.status, 'Date', to_char(o.created_at, 'YYYY-MM-DD')
    ) order by o.created_at desc)
    from orders o where o.store_id = v_session.store_id and o.phone = p_phone
  ), '[]'::jsonb));
end;
$$;

-- ------------------------------------------------------------
-- saveProduct: إضافة/تعديل منتج (نفس شكل JSON اللي بيبعته الفرونت إند بالظبط)
-- ------------------------------------------------------------
create or replace function save_product(p_token uuid, p_product jsonb)
returns jsonb
language plpgsql security definer as $$
declare v_session sessions; v_id uuid; v_new_id uuid;
begin
  v_session := _touch_session(p_token);
  if v_session.token is null or v_session.role <> 'client' then
    return jsonb_build_object('success', false, 'error', 'غير مصرح');
  end if;
  if p_product->>'Product Name' is null or trim(p_product->>'Product Name') = '' then
    return jsonb_build_object('success', false, 'error', 'اسم المنتج مطلوب');
  end if;

  if nullif(p_product->>'Product ID', '') is not null then
    v_id := (p_product->>'Product ID')::uuid;
    update products set
      product_name = p_product->>'Product Name',
      description = coalesce(p_product->>'Description', ''),
      price = coalesce(nullif(p_product->>'Price','')::numeric, 0),
      old_price = coalesce(nullif(p_product->>'Old Price','')::numeric, 0),
      delivery_fee = coalesce(nullif(p_product->>'Delivery Fee','')::numeric, 0),
      stock_status = coalesce(nullif(p_product->>'Stock Status',''), 'متوفر'),
      main_image = coalesce(p_product->>'Main Image', ''),
      gallery_images = coalesce(p_product->>'Gallery Images', ''),
      features = coalesce(p_product->>'Features', ''),
      specifications = coalesce(p_product->>'Specifications', ''),
      faq = coalesce(p_product->>'FAQ', ''),
      active = coalesce((p_product->>'Active')::boolean, false),
      updated_at = now()
    where id = v_id and store_id = v_session.store_id;
    if not found then return jsonb_build_object('success', false, 'error', 'المنتج غير موجود'); end if;
    return jsonb_build_object('success', true, 'productId', v_id);
  end if;

  insert into products (store_id, product_name, description, price, old_price, delivery_fee, stock_status,
                         main_image, gallery_images, features, specifications, faq, active)
  values (
    v_session.store_id, p_product->>'Product Name', coalesce(p_product->>'Description',''),
    coalesce(nullif(p_product->>'Price','')::numeric,0), coalesce(nullif(p_product->>'Old Price','')::numeric,0),
    coalesce(nullif(p_product->>'Delivery Fee','')::numeric,0), coalesce(nullif(p_product->>'Stock Status',''),'متوفر'),
    coalesce(p_product->>'Main Image',''), coalesce(p_product->>'Gallery Images',''),
    coalesce(p_product->>'Features',''), coalesce(p_product->>'Specifications',''), coalesce(p_product->>'FAQ',''),
    coalesce((p_product->>'Active')::boolean, false)
  )
  returning id into v_new_id;

  return jsonb_build_object('success', true, 'productId', v_new_id);
end;
$$;

create or replace function delete_product(p_token uuid, p_product_id uuid)
returns jsonb language plpgsql security definer as $$
declare v_session sessions;
begin
  v_session := _touch_session(p_token);
  if v_session.token is null or v_session.role <> 'client' then
    return jsonb_build_object('success', false, 'error', 'غير مصرح');
  end if;
  delete from products where id = p_product_id and store_id = v_session.store_id;
  if not found then return jsonb_build_object('success', false, 'error', 'المنتج غير موجود'); end if;
  return jsonb_build_object('success', true);
end;
$$;

-- ------------------------------------------------------------
-- updateSettings: حفظ إعدادات المتجر (بيانات عامة / هوية بصرية / CRM)
-- ------------------------------------------------------------
create or replace function update_settings(p_token uuid, p_settings jsonb)
returns jsonb
language plpgsql security definer as $$
declare v_session sessions;
begin
  v_session := _touch_session(p_token);
  if v_session.token is null or v_session.role <> 'client' then
    return jsonb_build_object('success', false, 'error', 'غير مصرح');
  end if;

  if p_settings ? 'StoreName' then
    update stores set store_name = p_settings->>'StoreName' where id = v_session.store_id;
  end if;

  update stores set settings = settings || (p_settings - 'StoreName')
  where id = v_session.store_id;

  return jsonb_build_object('success', true);
end;
$$;

-- ------------------------------------------------------------
-- دوال المدير العام (Super Admin)
-- ------------------------------------------------------------
create or replace function _require_superadmin(p_token uuid)
returns sessions language plpgsql security definer as $$
declare v_session sessions;
begin
  v_session := _touch_session(p_token);
  return v_session; -- الفحص الفعلي (role = superadmin) بيحصل في كل دالة بتنادّيها
end;
$$;

create or replace function create_client(p_token uuid, p_store_name text, p_username text, p_password text)
returns jsonb
language plpgsql security definer as $$
declare v_session sessions; v_new_id uuid;
begin
  v_session := _require_superadmin(p_token);
  if v_session.token is null or v_session.role <> 'superadmin' then
    return jsonb_build_object('success', false, 'error', 'هذا الإجراء متاح فقط للمدير العام');
  end if;

  p_store_name := trim(p_store_name); p_username := trim(p_username);
  if p_store_name is null or length(p_store_name) < 2 then
    return jsonb_build_object('success', false, 'error', 'اسم المتجر مطلوب');
  end if;
  if p_username is null or length(p_username) < 3 then
    return jsonb_build_object('success', false, 'error', 'اسم المستخدم يجب أن يكون 3 أحرف على الأقل');
  end if;
  if p_password is null or length(p_password) < 6 then
    return jsonb_build_object('success', false, 'error', 'كلمة المرور يجب أن تكون 6 أحرف على الأقل');
  end if;
  if exists (select 1 from stores where username = p_username) then
    return jsonb_build_object('success', false, 'error', 'اسم المستخدم مستخدم بالفعل، اختر اسمًا آخر');
  end if;

  insert into stores (store_name, username, password_hash)
  values (p_store_name, p_username, crypt(p_password, gen_salt('bf')))
  returning id into v_new_id;

  return jsonb_build_object('success', true, 'storeId', v_new_id, 'username', p_username,
                             'password', p_password, 'message', 'تم إنشاء حساب العميل بنجاح');
end;
$$;

create or replace function get_clients(p_token uuid)
returns jsonb language plpgsql security definer as $$
declare v_session sessions;
begin
  v_session := _require_superadmin(p_token);
  if v_session.token is null or v_session.role <> 'superadmin' then
    return jsonb_build_object('success', false, 'error', 'هذا الإجراء متاح فقط للمدير العام');
  end if;
  return jsonb_build_object('success', true, 'clients', coalesce((
    select jsonb_agg(jsonb_build_object(
      'StoreID', id, 'StoreName', store_name, 'Username', username,
      'Status', status, 'CreatedAt', to_char(created_at, 'YYYY-MM-DD')
    ) order by created_at desc)
    from stores
  ), '[]'::jsonb));
end;
$$;

create or replace function update_client_status(p_token uuid, p_store_id uuid, p_status text)
returns jsonb language plpgsql security definer as $$
declare v_session sessions;
begin
  v_session := _require_superadmin(p_token);
  if v_session.token is null or v_session.role <> 'superadmin' then
    return jsonb_build_object('success', false, 'error', 'هذا الإجراء متاح فقط للمدير العام');
  end if;
  if not (p_status = any(array['Active','Suspended'])) then
    return jsonb_build_object('success', false, 'error', 'حالة غير صحيحة');
  end if;
  update stores set status = p_status where id = p_store_id;
  if not found then return jsonb_build_object('success', false, 'error', 'المتجر غير موجود'); end if;
  return jsonb_build_object('success', true);
end;
$$;

create or replace function delete_client(p_token uuid, p_store_id uuid)
returns jsonb language plpgsql security definer as $$
declare v_session sessions;
begin
  v_session := _require_superadmin(p_token);
  if v_session.token is null or v_session.role <> 'superadmin' then
    return jsonb_build_object('success', false, 'error', 'هذا الإجراء متاح فقط للمدير العام');
  end if;
  delete from stores where id = p_store_id;
  if not found then return jsonb_build_object('success', false, 'error', 'المتجر غير موجود'); end if;
  return jsonb_build_object('success', true);
end;
$$;

create or replace function reset_client_password(p_token uuid, p_store_id uuid, p_new_password text)
returns jsonb language plpgsql security definer as $$
declare v_session sessions;
begin
  v_session := _require_superadmin(p_token);
  if v_session.token is null or v_session.role <> 'superadmin' then
    return jsonb_build_object('success', false, 'error', 'هذا الإجراء متاح فقط للمدير العام');
  end if;
  if p_new_password is null or length(p_new_password) < 6 then
    return jsonb_build_object('success', false, 'error', 'كلمة المرور يجب أن تكون 6 أحرف على الأقل');
  end if;
  update stores set password_hash = crypt(p_new_password, gen_salt('bf')) where id = p_store_id;
  if not found then return jsonb_build_object('success', false, 'error', 'المتجر غير موجود'); end if;
  return jsonb_build_object('success', true, 'newPassword', p_new_password);
end;
$$;

create or replace function update_client_info(p_token uuid, p_store_id uuid, p_store_name text, p_username text)
returns jsonb language plpgsql security definer as $$
declare v_session sessions;
begin
  v_session := _require_superadmin(p_token);
  if v_session.token is null or v_session.role <> 'superadmin' then
    return jsonb_build_object('success', false, 'error', 'هذا الإجراء متاح فقط للمدير العام');
  end if;
  if p_username is not null and p_username <> '' and exists (select 1 from stores where username = p_username and id <> p_store_id) then
    return jsonb_build_object('success', false, 'error', 'اسم المستخدم مستخدم بالفعل');
  end if;
  update stores set
    store_name = coalesce(nullif(p_store_name,''), store_name),
    username = coalesce(nullif(p_username,''), username)
  where id = p_store_id;
  if not found then return jsonb_build_object('success', false, 'error', 'المتجر غير موجود'); end if;
  return jsonb_build_object('success', true);
end;
$$;

-- ------------------------------------------------------------
-- الهوية البصرية للمدير العام (متاحة للقراءة للجميع بدون تسجيل دخول)
-- ------------------------------------------------------------
create or replace function get_superadmin_branding()
returns jsonb language sql security definer as $$
  select jsonb_build_object(
    'success', true,
    'branding', jsonb_build_object(
      'PlatformName', platform_name, 'PrimaryColor', primary_color, 'AccentColor', accent_color,
      'LogoURL', logo_url, 'FooterText', footer_text, 'FooterLink', footer_link
    )
  ) from platform_settings where id = 1;
$$;

create or replace function update_superadmin_branding(p_token uuid, p_branding jsonb)
returns jsonb
language plpgsql security definer as $$
declare v_session sessions;
begin
  v_session := _require_superadmin(p_token);
  if v_session.token is null or v_session.role <> 'superadmin' then
    return jsonb_build_object('success', false, 'error', 'هذا الإجراء متاح فقط للمدير العام');
  end if;
  update platform_settings set
    platform_name = coalesce(nullif(p_branding->>'PlatformName',''), platform_name),
    primary_color = coalesce(nullif(p_branding->>'PrimaryColor',''), primary_color),
    accent_color = coalesce(nullif(p_branding->>'AccentColor',''), accent_color),
    logo_url = coalesce(p_branding->>'LogoURL', logo_url),
    footer_text = coalesce(p_branding->>'FooterText', footer_text),
    footer_link = coalesce(p_branding->>'FooterLink', footer_link)
  where id = 1;
  return jsonb_build_object('success', true);
end;
$$;

-- ------------------------------------------------------------
-- منح صلاحية تنفيذ كل الدوال دي لأي زائر (anon) — الحماية الفعلية
-- جوه كل دالة نفسها (فحص التوكين + الدور)، مش على مستوى الجدول
-- ------------------------------------------------------------
grant execute on all functions in schema public to anon, authenticated;
