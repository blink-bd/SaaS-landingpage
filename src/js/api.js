/**
 * ============================================================
 * طبقة الاتصال بالباك إند - نسخة Supabase (بديل Apps Script)
 * ============================================================
 * باقي ملفات الفرونت إند (main.js, dashboard.js, super-dashboard.js,
 * login.js, order-form.js) بتنادي API.get(action, params) و
 * API.post(action, data) بنفس الأسماء القديمة بالظبط، فمحتاجتش
 * تتعدل. اللي اتغيّر هو اللي جوه الملف ده بس: بدل ما يبعت الطلب
 * لـ Apps Script، بيناديه كدالة (RPC) جوه قاعدة بيانات Supabase.
 */

const supabaseClient = (
  typeof supabase !== 'undefined' &&
  APP_CONFIG.supabaseUrl && !APP_CONFIG.supabaseUrl.includes('YOUR_PROJECT') &&
  APP_CONFIG.supabaseAnonKey && !APP_CONFIG.supabaseAnonKey.includes('YOUR_ANON_KEY')
) ? supabase.createClient(APP_CONFIG.supabaseUrl, APP_CONFIG.supabaseAnonKey) : null;

// خريطة: اسم الـ Action المستخدم في باقي الكود → اسم دالة قاعدة البيانات (RPC) المطابقة
const ACTION_TO_RPC = {
  login: 'login',
  logout: 'logout',
  getPublicData: 'get_public_data',
  createOrder: 'create_order',
  getAdminBootstrap: 'get_admin_bootstrap',
  updateOrderStatus: 'update_order_status',
  deleteOrder: 'delete_order',
  getCustomerOrders: 'get_customer_orders',
  saveProduct: 'save_product',
  deleteProduct: 'delete_product',
  updateSettings: 'update_settings',
  createClient: 'create_client',
  getClients: 'get_clients',
  updateClientStatus: 'update_client_status',
  deleteClient: 'delete_client',
  resetClientPassword: 'reset_client_password',
  updateClientInfo: 'update_client_info',
  getSuperAdminBranding: 'get_superadmin_branding',
  updateSuperAdminBranding: 'update_superadmin_branding'
};

// تحويل شكل الـ params القادم من باقي الكود إلى أسماء معاملات (p_xxx)
// مطابقة تمامًا لتعريف كل دالة في supabase/functions.sql
function mapParams(action, params) {
  switch (action) {
    case 'login': return { p_username: params.username, p_password: params.password };
    case 'logout': return { p_token: params.token };
    case 'getPublicData': return { p_store_id: params.storeId || null, p_product_id: params.productId || null };
    case 'createOrder': return {
      p_store_id: params.storeId, p_product_id: params.productId || null, p_name: params.name,
      p_phone: params.phone, p_governorate: params.governorate, p_address: params.address,
      p_notes: params.notes || '', p_quantity: params.quantity || 1, p_honeypot: params.website || ''
    };
    case 'getAdminBootstrap': return { p_token: params.token };
    case 'updateOrderStatus': return { p_token: params.token, p_order_id: params.orderId, p_status: params.status };
    case 'deleteOrder': return { p_token: params.token, p_order_id: params.orderId };
    case 'getCustomerOrders': return { p_token: params.token, p_phone: params.phone };
    case 'saveProduct': return { p_token: params.token, p_product: params.product };
    case 'deleteProduct': return { p_token: params.token, p_product_id: params.productId };
    case 'updateSettings': return { p_token: params.token, p_settings: params.settings };
    case 'createClient': return { p_token: params.token, p_store_name: params.storeName, p_username: params.username, p_password: params.password };
    case 'getClients': return { p_token: params.token };
    case 'updateClientStatus': return { p_token: params.token, p_store_id: params.storeId, p_status: params.status };
    case 'deleteClient': return { p_token: params.token, p_store_id: params.storeId };
    case 'resetClientPassword': return { p_token: params.token, p_store_id: params.storeId, p_new_password: params.newPassword };
    case 'updateClientInfo': return { p_token: params.token, p_store_id: params.storeId, p_store_name: params.storeName, p_username: params.username };
    case 'getSuperAdminBranding': return {};
    case 'updateSuperAdminBranding': return { p_token: params.token, p_branding: params.branding };
    default: return params;
  }
}

const API = {
  async _call(action, params) {
    if (!supabaseClient) {
      throw new Error('لم يتم إعداد الاتصال بقاعدة البيانات بعد في config.js (تأكد من supabaseUrl و supabaseAnonKey)');
    }
    // اختبار/مزامنة CRM مش دالة RPC عادية، هي Edge Function منفصلة (محتاجة تعمل طلبات إنترنت خارجية)
    if (action === 'testCrmConnection') return this._crmSync({ token: params.token, mode: 'test' });

    const rpcName = ACTION_TO_RPC[action];
    if (!rpcName) throw new Error('إجراء غير معروف: ' + action);

    const { data, error } = await supabaseClient.rpc(rpcName, mapParams(action, params));
    if (error) throw new Error(error.message || 'تعذر الاتصال بالخادم');
    return data;
  },

  async get(action, params = {}) { return this._call(action, params); },
  async post(action, data = {}) { return this._call(action, data); },

  /**
   * مناداة مباشرة لـ Edge Function الخاصة بربط CRM (بديل CRM.gs القديم)
   * mode: 'test' (من لوحة التاجر، محتاجة token) أو 'order' (بعد طلب حقيقي، بمعرف المتجر storeId)
   */
  async _crmSync({ token, storeId, mode, order } = {}) {
    if (!APP_CONFIG.supabaseUrl || !APP_CONFIG.supabaseAnonKey) {
      throw new Error('لم يتم إعداد الاتصال بقاعدة البيانات بعد');
    }
    const res = await fetch(`${APP_CONFIG.supabaseUrl}/functions/v1/crm-sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: APP_CONFIG.supabaseAnonKey },
      body: JSON.stringify({ token, storeId, mode, order })
    });
    return res.json();
  }
};
