/**
 * إعدادات عامة للنظام كله (مشتركة بين كل العملاء)
 * الفرونت إند ده هيخدم كل العملاء بنفس الملفات — الفرق بس في البيانات
 */
const APP_CONFIG = {
  // من لوحة Supabase: Project Settings → API → Project URL
  supabaseUrl: "https://ufsfzgcclvmymuzsxwwi.supabase.co",
  // من نفس الصفحة: Project API keys → anon public (مش الـ service_role أبدًا هنا)
  supabaseAnonKey: "sb_publishable_2BT7Ky7PFWb8QOkvuiWdNQ_m0JK9My3",
  // اتركه فاضي عشان يتحدد تلقائيًا من رابط الموقع، أو حدده يدويًا لو محتاج
  landingBaseUrl: ""
};

function getLandingBaseUrl() {
  if (APP_CONFIG.landingBaseUrl) return APP_CONFIG.landingBaseUrl;
  return window.location.origin + '/';
}
