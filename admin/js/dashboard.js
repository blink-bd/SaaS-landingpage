/* ============== لوحة تحكم العميل (Client Dashboard) ============== */

const STATE = { token: null, storeId: null, storeName: '', orders: [], customers: [], products: [], settings: {} };

/* ---------- حماية الوصول (Auth Guard) ---------- */
(function guard() {
  const token = localStorage.getItem('admin_token');
  const role = localStorage.getItem('admin_role');
  const expiry = Number(localStorage.getItem('admin_token_expiry') || 0);

  if (!token || expiry < Date.now()) {
    window.location.href = 'index.html';
    return;
  }
  if (role !== 'client') {
    window.location.href = 'super-dashboard.html';
    return;
  }

  STATE.token = token;
  STATE.storeId = localStorage.getItem('store_id');
  STATE.storeName = localStorage.getItem('store_name');

  const nameLabel = document.getElementById('sidebarStoreName');
  if (nameLabel) nameLabel.textContent = STATE.storeName || 'لوحة التحكم';
})();

/* ---------- تسجيل الخروج ---------- */
document.getElementById('logoutBtn').addEventListener('click', async () => {
  try { await API.post('logout', { token: STATE.token }); } catch (e) {}
  localStorage.removeItem('admin_token');
  localStorage.removeItem('admin_token_expiry');
  localStorage.removeItem('admin_role');
  localStorage.removeItem('admin_username');
  localStorage.removeItem('store_id');
  localStorage.removeItem('store_name');
  window.location.href = 'index.html';
});

/* ---------- التنقل بين الأقسام ---------- */
document.querySelectorAll('.sidebar nav a').forEach(link => {
  link.addEventListener('click', (e) => {
    e.preventDefault();
    document.querySelectorAll('.sidebar nav a').forEach(a => a.classList.remove('active'));
    link.classList.add('active');
    document.querySelectorAll('.section-panel').forEach(s => s.classList.remove('active'));
    document.getElementById('section-' + link.dataset.section).classList.add('active');
    document.getElementById('pageTitle').textContent = link.textContent.trim();
    document.getElementById('sidebar').classList.remove('open');
  });
});
document.getElementById('hamburgerBtn').addEventListener('click', () => {
  document.getElementById('sidebar').classList.toggle('open');
});

/* ---------- المودالز (Modals) ---------- */
function openModal(id) { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }
document.querySelectorAll('[data-close]').forEach(btn => {
  btn.addEventListener('click', (e) => closeModal(e.target.closest('.modal-overlay').id));
});
document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(overlay.id); });
});

function confirmAction(message) {
  return new Promise((resolve) => {
    document.getElementById('confirmMessage').textContent = message;
    openModal('confirmModal');
    const okBtn = document.getElementById('confirmOkBtn');
    const cancelBtn = document.getElementById('confirmCancelBtn');
    const cleanup = () => { okBtn.onclick = null; cancelBtn.onclick = null; closeModal('confirmModal'); };
    okBtn.onclick = () => { cleanup(); resolve(true); };
    cancelBtn.onclick = () => { cleanup(); resolve(false); };
  });
}

/* ---------- تحميل البيانات الأساسية ---------- */
async function loadBootstrap() {
  try {
    const res = await API.get('getAdminBootstrap', { token: STATE.token });
    if (!res.success) {
      showToast(res.error || 'انتهت الجلسة، يرجى تسجيل الدخول مرة أخرى', 'error');
      setTimeout(() => window.location.href = 'index.html', 1500);
      return;
    }

    STATE.orders = res.orders || [];
    STATE.customers = res.customers || [];
    STATE.products = res.products || [];
    STATE.settings = res.settings || {};
    if (res.storeName) {
      STATE.storeName = res.storeName;
      localStorage.setItem('store_name', res.storeName);
      document.getElementById('sidebarStoreName').textContent = res.storeName;
    }

    applyBrandColors(STATE.settings.PrimaryColor, STATE.settings.AccentColor);
    if (STATE.settings.LogoURL) {
      const logoEl = document.getElementById('sidebarLogo');
      logoEl.src = STATE.settings.LogoURL;
      logoEl.style.display = 'block';
    }

    renderStats();
    renderRecentOrders();
    renderOrdersTable();
    renderCustomersTable();
    renderProducts();
    renderSettingsForm();
  } catch (err) {
    showToast(err.message || 'تعذر تحميل البيانات', 'error');
  }
}
document.getElementById('refreshBtn').addEventListener('click', loadBootstrap);

/* ---------- الإحصائيات ---------- */
function renderStats() {
  const orders = STATE.orders;
  const currency = STATE.settings.Currency || 'ج.م';
  const total = orders.length;
  const statusCount = (s) => orders.filter(o => o['Order Status'] === s).length;
  const revenue = orders.filter(o => o['Order Status'] !== 'ملغي').reduce((sum, o) => sum + (Number(o['Total']) || 0), 0);

  const cards = [
    { label: 'إجمالي الطلبات', value: total, cls: 'blue' },
    { label: 'طلبات جديدة', value: statusCount('جديد'), cls: 'amber' },
    { label: 'طلبات مؤكدة', value: statusCount('مؤكد'), cls: 'green' },
    { label: 'تم التوصيل', value: statusCount('تم التوصيل'), cls: 'green' },
    { label: 'ملغية', value: statusCount('ملغي'), cls: 'red' },
    { label: 'إجمالي الإيرادات', value: formatCurrency(revenue, currency), cls: 'blue' },
    { label: 'عدد العملاء', value: STATE.customers.length, cls: 'blue' }
  ];

  document.getElementById('statsGrid').innerHTML = cards.map(c => `
    <div class="stat-card ${c.cls}">
      <div class="label">${c.label}</div>
      <div class="value">${c.value}</div>
    </div>
  `).join('');
}

function renderRecentOrders() {
  const currency = STATE.settings.Currency || 'ج.م';
  const recent = STATE.orders.slice(0, 6);
  document.getElementById('recentOrdersBody').innerHTML = recent.length ? recent.map(o => `
    <tr>
      <td>${escapeHtml(o['Order ID'])}</td>
      <td>${escapeHtml(o['Customer Name'])}</td>
      <td>${escapeHtml(o['Product'])}</td>
      <td>${formatCurrency(o['Total'], currency)}</td>
      <td>${statusBadge(o['Order Status'])}</td>
      <td>${escapeHtml(o['Date'])}</td>
    </tr>
  `).join('') : emptyRow(6);
}

function statusBadge(status) {
  const map = {
    'جديد': 'status-new', 'تم التواصل': 'status-contacted', 'مؤكد': 'status-confirmed',
    'قيد التجهيز': 'status-preparing', 'تم الشحن': 'status-shipped',
    'تم التوصيل': 'status-delivered', 'ملغي': 'status-cancelled'
  };
  return `<span class="status-badge ${map[status] || 'status-new'}">${escapeHtml(status || 'جديد')}</span>`;
}
function emptyRow(colspan) {
  return `<tr><td colspan="${colspan}" style="text-align:center;padding:40px;color:var(--gray-500);">لا توجد بيانات</td></tr>`;
}

/* ---------- الطلبات ---------- */
const STATUS_OPTIONS = ['جديد','تم التواصل','مؤكد','قيد التجهيز','تم الشحن','تم التوصيل','ملغي'];

function getFilteredOrders() {
  const search = document.getElementById('orderSearch').value.trim().toLowerCase();
  const status = document.getElementById('statusFilter').value;
  const dateFrom = document.getElementById('dateFrom').value;
  const dateTo = document.getElementById('dateTo').value;

  return STATE.orders.filter(o => {
    if (search && !(`${o['Customer Name']}`.toLowerCase().includes(search) || `${o['Phone']}`.includes(search))) return false;
    if (status && o['Order Status'] !== status) return false;
    if (dateFrom && o['Date'] < dateFrom) return false;
    if (dateTo && o['Date'] > dateTo) return false;
    return true;
  });
}

function renderOrdersTable() {
  const currency = STATE.settings.Currency || 'ج.م';
  const orders = getFilteredOrders();

  document.getElementById('ordersTableBody').innerHTML = orders.length ? orders.map(o => `
    <tr>
      <td>${escapeHtml(o['Order ID'])}</td>
      <td>${escapeHtml(o['Customer Name'])}</td>
      <td>${escapeHtml(o['Phone'])}</td>
      <td>${escapeHtml(o['Product'])}</td>
      <td>${escapeHtml(o['Quantity'])}</td>
      <td>${formatCurrency(o['Total'], currency)}</td>
      <td>
        <select class="status-select" data-id="${escapeHtml(o['Order ID'])}" style="padding:6px;border-radius:8px;border:1px solid var(--gray-300);">
          ${STATUS_OPTIONS.map(s => `<option value="${s}" ${s === o['Order Status'] ? 'selected' : ''}>${s}</option>`).join('')}
        </select>
      </td>
      <td>${escapeHtml(o['Date'])}</td>
      <td>
        <button class="action-btn action-view" data-view="${escapeHtml(o['Order ID'])}">عرض</button>
        <button class="action-btn action-delete" data-delete="${escapeHtml(o['Order ID'])}">حذف</button>
      </td>
    </tr>
  `).join('') : emptyRow(9);

  document.querySelectorAll('.status-select').forEach(sel => {
    sel.addEventListener('change', async () => {
      const orderId = sel.dataset.id;
      const newStatus = sel.value;
      try {
        const res = await API.post('updateOrderStatus', { token: STATE.token, orderId, status: newStatus });
        if (res.success) {
          const order = STATE.orders.find(o => o['Order ID'] === orderId);
          if (order) order['Order Status'] = newStatus;
          renderStats(); renderRecentOrders();
          showToast('تم تحديث حالة الطلب', 'success');
        } else showToast(res.error, 'error');
      } catch (err) { showToast(err.message, 'error'); }
    });
  });

  document.querySelectorAll('[data-view]').forEach(btn => {
    btn.addEventListener('click', () => viewOrder(btn.dataset.view));
  });
  document.querySelectorAll('[data-delete]').forEach(btn => {
    btn.addEventListener('click', () => deleteOrderConfirm(btn.dataset.delete));
  });
}

function viewOrder(orderId) {
  const currency = STATE.settings.Currency || 'ج.م';
  const o = STATE.orders.find(x => x['Order ID'] === orderId);
  if (!o) return;
  document.getElementById('orderModalContent').innerHTML = `
    <p><strong>رقم الطلب:</strong> ${escapeHtml(o['Order ID'])}</p>
    <p><strong>العميل:</strong> ${escapeHtml(o['Customer Name'])}</p>
    <p><strong>الهاتف:</strong> ${escapeHtml(o['Phone'])}</p>
    <p><strong>المحافظة:</strong> ${escapeHtml(o['Governorate'])}</p>
    <p><strong>العنوان:</strong> ${escapeHtml(o['Address'])}</p>
    <p><strong>المنتج:</strong> ${escapeHtml(o['Product'])}</p>
    <p><strong>الكمية:</strong> ${escapeHtml(o['Quantity'])}</p>
    <p><strong>سعر الوحدة:</strong> ${formatCurrency(o['Unit Price'], currency)}</p>
    <p><strong>رسوم التوصيل:</strong> ${formatCurrency(o['Delivery Fee'], currency)}</p>
    <p><strong>الإجمالي:</strong> ${formatCurrency(o['Total'], currency)}</p>
    <p><strong>ملاحظات:</strong> ${escapeHtml(o['Notes']) || '-'}</p>
    <p><strong>الحالة:</strong> ${statusBadge(o['Order Status'])}</p>
    <p><strong>التاريخ:</strong> ${escapeHtml(o['Date'])} - ${escapeHtml(o['Time'])}</p>
  `;
  openModal('orderModal');
}

async function deleteOrderConfirm(orderId) {
  const ok = await confirmAction(`هل أنت متأكد من حذف الطلب ${orderId}؟`);
  if (!ok) return;
  try {
    const res = await API.post('deleteOrder', { token: STATE.token, orderId });
    if (res.success) {
      STATE.orders = STATE.orders.filter(o => o['Order ID'] !== orderId);
      renderStats(); renderRecentOrders(); renderOrdersTable();
      showToast('تم حذف الطلب', 'success');
    } else showToast(res.error, 'error');
  } catch (err) { showToast(err.message, 'error'); }
}

['orderSearch','statusFilter','dateFrom','dateTo'].forEach(id => {
  document.getElementById(id).addEventListener('input', debounce(renderOrdersTable, 250));
});

document.getElementById('exportCsvBtn').addEventListener('click', () => {
  downloadCSV(`orders_${Date.now()}.csv`, getFilteredOrders());
});

/* ---------- العملاء ---------- */
function renderCustomersTable() {
  const currency = STATE.settings.Currency || 'ج.م';
  const search = (document.getElementById('customerSearch').value || '').toLowerCase();
  const customers = STATE.customers.filter(c =>
    !search || `${c['Name']}`.toLowerCase().includes(search) || `${c['Phone']}`.includes(search)
  );

  document.getElementById('customersTableBody').innerHTML = customers.length ? customers.map(c => `
    <tr>
      <td>${escapeHtml(c['Name'])}</td>
      <td>${escapeHtml(c['Phone'])}</td>
      <td>${escapeHtml(c['Governorate'])}</td>
      <td>${escapeHtml(c['Total Orders'])}</td>
      <td>${formatCurrency(c['Total Spent'], currency)}</td>
      <td>${escapeHtml(c['Last Order Date'])}</td>
      <td><button class="action-btn action-view" data-customer="${escapeHtml(c['Phone'])}">السجل</button></td>
    </tr>
  `).join('') : emptyRow(7);

  document.querySelectorAll('[data-customer]').forEach(btn => {
    btn.addEventListener('click', () => viewCustomerOrders(btn.dataset.customer));
  });
}
document.getElementById('customerSearch').addEventListener('input', debounce(renderCustomersTable, 250));

document.getElementById('exportCustomersCsvBtn').addEventListener('click', () => {
  downloadCSV(`customers_${Date.now()}.csv`, STATE.customers);
});

function viewCustomerOrders(phone) {
  const currency = STATE.settings.Currency || 'ج.م';
  const orders = STATE.orders.filter(o => o['Phone'] === phone);
  document.getElementById('customerModalContent').innerHTML = orders.length ? orders.map(o => `
    <div style="border-bottom:1px solid var(--gray-100);padding:10px 0;">
      <strong>${escapeHtml(o['Order ID'])}</strong> - ${formatCurrency(o['Total'], currency)}
      <br><small>${escapeHtml(o['Product'])} × ${escapeHtml(o['Quantity'])} — ${statusBadge(o['Order Status'])}</small>
      <br><small>${escapeHtml(o['Date'])}</small>
    </div>
  `).join('') : '<p>لا يوجد طلبات سابقة</p>';
  openModal('customerModal');
}

/* ---------- المنتجات ---------- */
function buildProductLink(productId) {
  const base = getLandingBaseUrl();
  return `${base}?store=${encodeURIComponent(STATE.storeId)}&product=${encodeURIComponent(productId)}`;
}

function renderProducts() {
  const currency = STATE.settings.Currency || 'ج.م';
  const list = document.getElementById('productsList');

  if (!STATE.products.length) {
    list.innerHTML = `<div class="empty-state"><div class="icon">🏷️</div><p>لا توجد منتجات بعد. أضف منتجك الأول.</p></div>`;
    return;
  }

  list.innerHTML = STATE.products.map(p => {
    const link = buildProductLink(p['Product ID']);
    const isActive = (p['Active'] === true || p['Active'] === 'TRUE');
    return `
    <div class="product-card">
      <img src="${escapeHtml(p['Main Image'] || 'https://via.placeholder.com/70')}" alt="">
      <div style="flex:1;">
        <strong>${escapeHtml(p['Product Name'])}</strong>
        <p style="color:var(--gray-500);font-size:13px;">
          ${formatCurrency(p['Price'], currency)}
          ${isActive ? '✅ نشط' : '⛔ غير نشط'}
        </p>
      </div>
      <button class="btn btn-outline" data-copy-link="${escapeHtml(link)}">🔗 نسخ الرابط</button>
      <a class="btn btn-outline" href="${link}" target="_blank">👁️ معاينة</a>
      <button class="btn btn-outline" data-edit-product="${escapeHtml(p['Product ID'])}">تعديل</button>
      <button class="btn" style="background:#FEE2E2;color:#991B1B;" data-delete-product="${escapeHtml(p['Product ID'])}">حذف</button>
    </div>`;
  }).join('');

  document.querySelectorAll('[data-copy-link]').forEach(btn => {
    btn.addEventListener('click', () => {
      navigator.clipboard.writeText(btn.dataset.copyLink);
      showToast('تم نسخ رابط الصفحة بنجاح', 'success');
    });
  });
  document.querySelectorAll('[data-edit-product]').forEach(btn => {
    btn.addEventListener('click', () => openProductModal(btn.dataset.editProduct));
  });
  document.querySelectorAll('[data-delete-product]').forEach(btn => {
    btn.addEventListener('click', () => deleteProductConfirm(btn.dataset.deleteProduct));
  });
}

function openProductModal(productId) {
  const form = document.getElementById('productForm');
  form.reset();
  form['Product ID'].value = '';
  document.getElementById('productModalTitle').textContent = productId ? 'تعديل المنتج' : 'إضافة منتج جديد';

  if (productId) {
    const p = STATE.products.find(x => x['Product ID'] === productId);
    if (p) {
      Object.keys(p).forEach(key => {
        const field = form.elements[key];
        if (!field) return;
        if (field.type === 'checkbox') field.checked = (p[key] === true || p[key] === 'TRUE');
        else field.value = p[key];
      });
    }
  }
  openModal('productModal');
}
document.getElementById('addProductBtn').addEventListener('click', () => openProductModal(null));

document.getElementById('productForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const productData = {
    'Product ID': form['Product ID'].value,
    'Product Name': form['Product Name'].value.trim(),
    'Description': form['Description'].value.trim(),
    'Price': Number(form['Price'].value) || 0,
    'Old Price': Number(form['Old Price'].value) || 0,
    'Delivery Fee': Number(form['Delivery Fee'].value) || 0,
    'Stock Status': form['Stock Status'].value.trim() || 'متوفر',
    'Main Image': form['Main Image'].value.trim(),
    'Gallery Images': form['Gallery Images'].value.trim(),
    'Features': form['Features'].value.trim(),
    'Specifications': form['Specifications'].value.trim(),
    'FAQ': form['FAQ'].value.trim(),
    'Active': form['Active'].checked
  };

  try {
    const res = await API.post('saveProduct', { token: STATE.token, product: productData });
    if (res.success) {
      showToast('تم حفظ المنتج بنجاح', 'success');
      closeModal('productModal');
      // تحسين أداء: تحديث القائمة محليًا بدل إعادة تحميل كل بيانات اللوحة (طلبات + عملاء + منتجات) من جديد
      const now = new Date().toISOString();
      const finalProduct = Object.assign({}, productData, { 'Product ID': res.productId, 'Updated At': now });
      const existingIndex = STATE.products.findIndex(p => p['Product ID'] === res.productId);
      if (existingIndex > -1) STATE.products[existingIndex] = Object.assign({}, STATE.products[existingIndex], finalProduct);
      else STATE.products.push(Object.assign({ 'Created At': now }, finalProduct));
      renderProducts();
    } else showToast(res.error, 'error');
  } catch (err) { showToast(err.message, 'error'); }
});

async function deleteProductConfirm(productId) {
  const ok = await confirmAction('هل أنت متأكد من حذف هذا المنتج؟ لن يعمل رابطه بعد الحذف.');
  if (!ok) return;
  try {
    const res = await API.post('deleteProduct', { token: STATE.token, productId });
    if (res.success) {
      showToast('تم حذف المنتج', 'success');
      // تحسين أداء: حذف من القائمة محليًا بدل إعادة تحميل كل البيانات
      STATE.products = STATE.products.filter(p => p['Product ID'] !== productId);
      renderProducts();
    }
    else showToast(res.error, 'error');
  } catch (err) { showToast(err.message, 'error'); }
}

/* ---------- الإعدادات ---------- */
const SETTINGS_FIELDS = [
  'StoreName','Phone','WhatsApp','Address','Facebook','Instagram','DeliveryInfo','Currency',
  'PrimaryColor','AccentColor','LogoURL',
  'CRMProvider','CRMWebhookURL','ZohoClientID','ZohoClientSecret','ZohoRefreshToken','ZohoAPIDomain','ZohoModule'
];

function renderSettingsForm() {
  const form = document.getElementById('settingsForm');
  Object.keys(STATE.settings).forEach(key => {
    if (form.elements[key]) form.elements[key].value = STATE.settings[key];
  });
  syncColorSwatches();
  updateCrmPanelVisibility();
}

/* تبويبات الإعدادات (بيانات المتجر / الهوية البصرية / ربط CRM) */
document.querySelectorAll('.settings-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.settings-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.settings-panel').forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    document.querySelector(`.settings-panel[data-panel="${tab.dataset.tab}"]`).classList.add('active');
  });
});

/* مزامنة منتقي اللون الدائري (color picker) مع خانة النص Hex والعكس */
function syncColorSwatches() {
  document.querySelectorAll('.color-swatch').forEach(swatch => {
    const textInput = document.querySelector(`input[name="${swatch.dataset.pair}"]`);
    if (textInput && textInput.value) swatch.value = textInput.value;
  });
}
document.querySelectorAll('.color-swatch').forEach(swatch => {
  swatch.addEventListener('input', () => {
    const textInput = document.querySelector(`input[name="${swatch.dataset.pair}"]`);
    if (textInput) textInput.value = swatch.value;
  });
});

/* إظهار حقول CRM المناسبة حسب الطريقة المختارة */
function updateCrmPanelVisibility() {
  const provider = document.getElementById('crmProviderSelect').value;
  document.querySelectorAll('.crm-fields').forEach(panel => {
    panel.classList.toggle('visible', panel.dataset.crmPanel === provider);
  });
}
document.getElementById('crmProviderSelect').addEventListener('change', updateCrmPanelVisibility);

document.getElementById('testCrmBtn').addEventListener('click', async () => {
  const btn = document.getElementById('testCrmBtn');
  const originalText = btn.textContent;
  btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> جاري الاختبار...';
  try {
    const res = await API.post('testCrmConnection', { token: STATE.token });
    if (res.success) showToast(res.skipped ? res.reason : 'الاتصال ناجح! تحقق من نظام الـ CRM بتاعك', 'success');
    else showToast(res.error || 'فشل الاتصال', 'error');
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false; btn.textContent = originalText;
  }
});

document.getElementById('settingsForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const settings = {};
  SETTINGS_FIELDS.forEach(key => {
    if (form.elements[key]) settings[key] = form.elements[key].value.trim();
  });
  try {
    const res = await API.post('updateSettings', { token: STATE.token, settings });
    if (res.success) {
      showToast('تم حفظ الإعدادات بنجاح', 'success');
      STATE.settings = Object.assign(STATE.settings, settings);
      if (settings.StoreName) {
        STATE.storeName = settings.StoreName;
        localStorage.setItem('store_name', settings.StoreName);
        document.getElementById('sidebarStoreName').textContent = settings.StoreName;
      }
      applyBrandColors(settings.PrimaryColor, settings.AccentColor);
      if (settings.LogoURL) {
        const logoEl = document.getElementById('sidebarLogo');
        logoEl.src = settings.LogoURL;
        logoEl.style.display = 'block';
      }
      renderProducts();
    } else showToast(res.error, 'error');
  } catch (err) { showToast(err.message, 'error'); }
});

/* ---------- فوتر حقوق المنصة (مركزي، بيتحكم فيه المدير العام بس) ---------- */
async function loadPlatformFooter() {
  try {
    const res = await API.get('getSuperAdminBranding');
    if (res.success) applyPlatformFooter(res.branding.FooterText, res.branding.FooterLink);
  } catch (err) { /* فشل تحميل الفوتر مايأثرش على عمل اللوحة نفسها */ }
}
loadPlatformFooter();

/* ---------- بدء التشغيل ---------- */
loadBootstrap();
