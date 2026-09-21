/**
 * ⚠️ ملاحظة مهمة:
 * الدوال دي (escapeHtml, formatCurrency, showToast, debounce, downloadCSV, EGYPT_GOVERNORATES, getClientId)
 * كانت موجودة في نسخة سابقة من الملف ده اتوصفت بالنص "باقي الملف زي ما هو" بدون كود كامل.
 * تم إعادة كتابتها هنا بأبسط شكل ممكن عشان النظام يشتغل من غير ما ينكسر.
 * لو عندك نسخة تانية شغالة فعليًا، راجعها واستبدل الجزء ده بيها.
 */

// قائمة محافظات مصر
const EGYPT_GOVERNORATES = [
  'القاهرة', 'الجيزة', 'الإسكندرية', 'الدقهلية', 'البحر الأحمر', 'البحيرة',
  'الفيوم', 'الغربية', 'الإسماعيلية', 'المنوفية', 'المنيا', 'القليوبية',
  'الوادي الجديد', 'السويس', 'اسوان', 'اسيوط', 'بني سويف', 'بورسعيد',
  'دمياط', 'الشرقية', 'جنوب سيناء', 'كفر الشيخ', 'مطروح', 'الأقصر',
  'قنا', 'شمال سيناء', 'سوهاج'
];

// تنظيف أي نص قبل عرضه في HTML لمنع هجمات XSS
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// تنسيق السعر مع العملة
function formatCurrency(amount, currency) {
  const num = Number(amount) || 0;
  return num.toLocaleString('ar-EG') + ' ' + (currency || 'ج.م');
}

// رسالة تنبيه صغيرة (Toast) تظهر أعلى/أسفل الشاشة
function showToast(message, type) {
  let container = document.getElementById('toastContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toastContainer';
    container.style.cssText = 'position:fixed;bottom:20px;right:20px;left:20px;z-index:9999;display:flex;flex-direction:column;align-items:center;gap:8px;pointer-events:none;';
    document.body.appendChild(container);
  }
  const toast = document.createElement('div');
  const bg = type === 'error' ? '#DC2626' : (type === 'success' ? '#16A34A' : '#374151');
  toast.textContent = message;
  toast.style.cssText = `background:${bg};color:#fff;padding:12px 20px;border-radius:10px;font-family:'Cairo',sans-serif;font-size:14px;box-shadow:0 4px 12px rgba(0,0,0,.2);max-width:90%;text-align:center;`;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3500);
}

// تأخير تنفيذ دالة (مفيد في مربعات البحث)
function debounce(fn, delay) {
  let timer = null;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

// تنزيل مصفوفة بيانات (Array of Objects) كملف CSV
function downloadCSV(filename, rows) {
  if (!rows || !rows.length) { showToast('لا توجد بيانات للتصدير', 'error'); return; }
  const headers = Object.keys(rows[0]);
  const csvRows = [headers.join(',')];
  rows.forEach(row => {
    csvRows.push(headers.map(h => `"${String(row[h] ?? '').replace(/"/g, '""')}"`).join(','));
  });
  const csvContent = '\uFEFF' + csvRows.join('\n'); // BOM عشان العربي يظهر صح في إكسل
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

// معرف بسيط للجهاز/المتصفح (اختياري - لتتبع مصدر الطلب)
function getClientId() {
  let id = localStorage.getItem('client_device_id');
  if (!id) {
    id = 'DEV-' + Math.random().toString(36).substring(2, 10).toUpperCase();
    localStorage.setItem('client_device_id', id);
  }
  return id;
}

// التحقق من رقم هاتف مصري صحيح
function isValidEgyptianPhone(phone) {
  return /^01[0125][0-9]{8}$/.test(String(phone || '').trim());
}

// ==== تطبيق الهوية البصرية (ألوان + لوجو) - تُستخدم في صفحة المنتج ولوحتي العميل والمدير العام ====
// بتشتغل عن طريق تغيير قيم متغيرات الـ CSS (--color-primary...) في الصفحة كلها لحظيًا
function applyBrandColors(primaryColor, accentColor) {
  const root = document.documentElement.style;
  if (primaryColor) {
    root.setProperty('--color-primary', primaryColor);
    root.setProperty('--color-primary-dark', shadeColor(primaryColor, -18));
    root.setProperty('--color-primary-light', shadeColor(primaryColor, 15));
    root.setProperty('--color-primary-tint', shadeColor(primaryColor, 88));
  }
  if (accentColor) {
    root.setProperty('--color-accent', accentColor);
    root.setProperty('--color-accent-dark', shadeColor(accentColor, -18));
  }
}

// تفتيح/تغميق لون Hex بنسبة معينة (percent موجب = أفتح، سالب = أغمق)
function shadeColor(hex, percent) {
  try {
    hex = String(hex).replace('#', '');
    if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
    const num = parseInt(hex, 16);
    let r = (num >> 16) + Math.round(2.55 * percent);
    let g = ((num >> 8) & 0x00FF) + Math.round(2.55 * percent);
    let b = (num & 0x0000FF) + Math.round(2.55 * percent);
    r = Math.max(0, Math.min(255, r));
    g = Math.max(0, Math.min(255, g));
    b = Math.max(0, Math.min(255, b));
    return '#' + (0x1000000 + r * 0x10000 + g * 0x100 + b).toString(16).slice(1);
  } catch (e) { return hex; }
}

// تطبيق اللوجو في أي عنصر <img> بمعرف معين، مع الرجوع للأيقونة الافتراضية لو مفيش لوجو
function applyLogo(imgElementId, logoUrl, fallbackUrl) {
  const el = document.getElementById(imgElementId);
  if (!el) return;
  el.src = logoUrl && logoUrl.trim() ? logoUrl.trim() : (fallbackUrl || el.src);
}

// عرض فوتر حقوق المنصة (بتاعك انت كمالك المنصة) في أي صفحة فيها عنصر id="platformFooter"
// ده مركزي وبيتقرا من إعداداتك انت بس، أي تاجر مايقدرش يعدّله أو يشيله من لوحته
function applyPlatformFooter(footerText, footerLink) {
  const el = document.getElementById('platformFooter');
  if (!el || !footerText || !footerText.trim()) return;
  el.innerHTML = (footerLink && footerLink.trim())
    ? `<a href="${escapeHtml(footerLink.trim())}" target="_blank" rel="noopener">${escapeHtml(footerText.trim())}</a>`
    : escapeHtml(footerText.trim());
}

// ==== الدوال الجديدة الخاصة بعرض بيانات المنتج (مميزات / مواصفات / أسئلة شائعة) ====

function parseLines(text) {
  return String(text || '').split('\n').map(s => s.trim()).filter(Boolean);
}
function parseSpecs(text) {
  return parseLines(text).map(line => {
    const idx = line.indexOf(':');
    if (idx === -1) return { label: line, value: '' };
    return { label: line.substring(0, idx).trim(), value: line.substring(idx + 1).trim() };
  });
}
function parseFaq(text) {
  return parseLines(text).map(line => {
    const idx = line.indexOf('|');
    if (idx === -1) return { q: line, a: '' };
    return { q: line.substring(0, idx).trim(), a: line.substring(idx + 1).trim() };
  });
}
