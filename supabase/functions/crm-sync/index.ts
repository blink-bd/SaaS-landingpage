// ============================================================
// Edge Function: crm-sync
// بديل CRM.gs القديم - بينفَّذ بره قاعدة البيانات لأنه محتاج يعمل
// طلبات إنترنت خارجية (لـ Zoho أو أي Webhook)، وده حاجة الدوال
// جوه قاعدة البيانات (functions.sql) مش بتقدر تعملها
// ============================================================
// النشر: supabase functions deploy crm-sync
// ============================================================

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Content-Type': 'application/json'
  };
}

async function restQuery(path: string) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` }
  });
  return res.json();
}

async function getSession(token: string) {
  const rows = await restQuery(`sessions?token=eq.${token}&select=*`);
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

async function getStore(storeId: string) {
  const rows = await restQuery(`stores?id=eq.${storeId}&select=*`);
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

async function sendToWebhook(url: string, payload: Record<string, unknown>) {
  if (!url) return { success: false, error: 'لم يتم تحديد رابط Webhook' };
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (res.ok) return { success: true, statusCode: res.status };
  return { success: false, error: `رد غير متوقع من الـ Webhook (كود ${res.status})` };
}

async function getZohoAccessToken(settings: Record<string, string>) {
  const accountsDomain = settings.ZohoAccountsDomain || 'https://accounts.zoho.com';
  const body = new URLSearchParams({
    refresh_token: settings.ZohoRefreshToken || '',
    client_id: settings.ZohoClientID || '',
    client_secret: settings.ZohoClientSecret || '',
    grant_type: 'refresh_token'
  });
  const res = await fetch(`${accountsDomain}/oauth/v2/token`, { method: 'POST', body });
  const data = await res.json();
  if (!data.access_token) throw new Error('تعذر الحصول على access token من Zoho: ' + (data.error || 'خطأ غير معروف'));
  return data.access_token as string;
}

async function sendToZoho(settings: Record<string, string>, payload: any) {
  const apiDomain = settings.ZohoAPIDomain || 'https://www.zohoapis.com';
  const moduleName = settings.ZohoModule || 'Leads';
  const accessToken = await getZohoAccessToken(settings);

  const nameParts = String(payload.customerName || '').trim().split(' ');
  const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : (nameParts[0] || 'عميل');
  const firstName = nameParts.length > 1 ? nameParts[0] : '';

  const record: Record<string, unknown> = {
    Last_Name: lastName,
    First_Name: firstName,
    Phone: payload.phone,
    Description:
      `طلب من: ${payload.storeName}\n` +
      `رقم الطلب: ${payload.orderId}\n` +
      `المنتج: ${payload.productName} × ${payload.quantity}\n` +
      `الإجمالي: ${payload.total}\n` +
      `المحافظة: ${payload.governorate}\n` +
      `العنوان: ${payload.address}`
  };
  if (moduleName === 'Leads') {
    record.Company = payload.storeName || 'متجر أونلاين';
    record.Lead_Source = 'الموقع الإلكتروني';
  }

  const res = await fetch(`${apiDomain}/crm/v2/${moduleName}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Zoho-oauthtoken ${accessToken}` },
    body: JSON.stringify({ data: [record] })
  });
  const body = await res.json();
  const ok = res.ok && body.data && body.data[0] && body.data[0].status === 'success';
  if (ok) return { success: true, zohoId: body.data[0].details?.id };
  return { success: false, error: 'رد Zoho: ' + JSON.stringify(body) };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders() });

  try {
    const { token, storeId, mode, order } = await req.json();
    let store;

    if (mode === 'test') {
      // اختبار الاتصال بييجي من لوحة التاجر بعد تسجيل الدخول، فلازم نتحقق من التوكين
      const session = await getSession(token);
      if (!session || session.role !== 'client' || new Date(session.expires_at) < new Date()) {
        return new Response(JSON.stringify({ success: false, error: 'غير مصرح، يرجى تسجيل الدخول مرة أخرى' }),
          { status: 200, headers: corsHeaders() });
      }
      store = await getStore(session.store_id);
    } else {
      // مزامنة طلب حقيقي بتتم فور إنشاء الطلب من صفحة المنتج العامة (الزبون مش عنده تسجيل دخول أصلًا)
      // البيانات دي أصلًا بيانات الطلب اللي الزبون نفسه بعتها لحظة قبل كده، فمفيش حاجة حساسة إضافية بتتكشف هنا
      if (!storeId) return new Response(JSON.stringify({ success: false, error: 'معرف المتجر مطلوب' }), { headers: corsHeaders() });
      store = await getStore(storeId);
    }

    if (!store) return new Response(JSON.stringify({ success: false, error: 'المتجر غير موجود' }), { headers: corsHeaders() });

    const settings = store.settings || {};
    const provider = (settings.CRMProvider || 'none').toLowerCase();

    if (provider === 'none') {
      return new Response(JSON.stringify({ success: false, skipped: true, error: 'لم يتم تفعيل أي CRM لهذا المتجر بعد' }),
        { headers: corsHeaders() });
    }

    const payload = mode === 'test'
      ? {
          orderId: 'TEST-' + Math.random().toString(36).substring(2, 8).toUpperCase(),
          storeName: store.store_name, customerName: 'عميل تجريبي', phone: '01000000000',
          governorate: 'القاهرة', address: 'عنوان تجريبي لاختبار الربط', productName: 'منتج تجريبي',
          quantity: 1, total: 100
        }
      : Object.assign({ storeName: store.store_name }, order);

    const result = provider === 'zoho' ? await sendToZoho(settings, payload) : await sendToWebhook(settings.CRMWebhookURL, payload);
    return new Response(JSON.stringify(result), { headers: corsHeaders() });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: String(err) }), { headers: corsHeaders() });
  }
});
