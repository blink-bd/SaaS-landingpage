/**
 * إعدادات عامة للنظام كله (مشتركة بين كل العملاء)
 * الفرونت إند ده هيخدم كل العملاء بنفس الملفات — الفرق بس في البيانات
 */
const APP_CONFIG = {
  apiUrl: "https://script.google.com/macros/s/AKfycbyk2VyahizGAcb_pBC6DYouO0JOZgYfVAoBOsX_jEG31PFlEex9-pc-64iOiXIpe_w1-Q/exec",
  // اتركه فاضي عشان يتحدد تلقائيًا من رابط الموقع، أو حدده يدويًا لو محتاج
  landingBaseUrl: ""
};

function getLandingBaseUrl() {
  if (APP_CONFIG.landingBaseUrl) return APP_CONFIG.landingBaseUrl;
  return window.location.origin + '/';
}
