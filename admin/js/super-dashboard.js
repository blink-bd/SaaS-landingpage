const STATE = { token: null, clients: [] };

(function guard() {
  const token = localStorage.getItem('admin_token');
  const role = localStorage.getItem('admin_role');
  const expiry = Number(localStorage.getItem('admin_token_expiry') || 0);
  if (!token || expiry < Date.now()) { window.location.href = 'index.html'; return; }
  if (role !== 'superadmin') { window.location.href = 'dashboard.html'; return; }
  STATE.token = token;
})();

document.getElementById('logoutBtn').addEventListener('click', async () => {
  try { await API.post('logout', { token: STATE.token }); } catch (e) {}
  localStorage.clear();
  window.location.href = 'index.html';
});

document.getElementById('hamburgerBtn').addEventListener('click', () => {
  document.querySelector('.sidebar').classList.toggle('open');
});

/* التنقل بين الأقسام (العملاء / الهوية البصرية) */
document.querySelectorAll('.sidebar nav a').forEach(link => {
  link.addEventListener('click', (e) => {
    e.preventDefault();
    document.querySelectorAll('.sidebar nav a').forEach(a => a.classList.remove('active'));
    link.classList.add('active');
    document.querySelectorAll('.section-panel').forEach(s => s.classList.remove('active'));
    document.getElementById('section-' + link.dataset.section).classList.add('active');
    document.getElementById('pageTitle').textContent = link.textContent.trim();
    document.querySelector('.sidebar').classList.remove('open');
  });
});

/* ---------- الهوية البصرية للمدير العام ---------- */
async function loadBranding() {
  try {
    const res = await API.get('getSuperAdminBranding');
    if (!res.success) return;
    const b = res.branding;
    applyBrandColors(b.PrimaryColor, b.AccentColor);
    document.getElementById('platformNameLabel').textContent = b.PlatformName || 'المدير العام';
    if (b.LogoURL) {
      const logoEl = document.getElementById('platformLogo');
      logoEl.src = b.LogoURL;
      logoEl.style.display = 'block';
    }
    applyPlatformFooter(b.FooterText, b.FooterLink);
    const form = document.getElementById('brandingForm');
    Object.keys(b).forEach(key => { if (form.elements[key]) form.elements[key].value = b[key]; });
    document.querySelectorAll('#brandingForm .color-swatch').forEach(swatch => {
      const textInput = document.querySelector(`#brandingForm input[name="${swatch.dataset.pair}"]`);
      if (textInput && textInput.value) swatch.value = textInput.value;
    });
  } catch (err) { /* الهوية الافتراضية هتفضل شغالة حتى لو فشل التحميل */ }
}

document.querySelectorAll('#brandingForm .color-swatch').forEach(swatch => {
  swatch.addEventListener('input', () => {
    const textInput = document.querySelector(`#brandingForm input[name="${swatch.dataset.pair}"]`);
    if (textInput) textInput.value = swatch.value;
  });
});

document.getElementById('brandingForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const branding = {
    PlatformName: form.elements['PlatformName'].value.trim(),
    PrimaryColor: form.elements['PrimaryColor'].value.trim(),
    AccentColor: form.elements['AccentColor'].value.trim(),
    LogoURL: form.elements['LogoURL'].value.trim(),
    FooterText: form.elements['FooterText'].value.trim(),
    FooterLink: form.elements['FooterLink'].value.trim()
  };
  try {
    const res = await API.post('updateSuperAdminBranding', { token: STATE.token, branding });
    if (res.success) {
      showToast('تم حفظ الهوية البصرية بنجاح', 'success');
      loadBranding();
    } else showToast(res.error, 'error');
  } catch (err) { showToast(err.message, 'error'); }
});

loadBranding();

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

async function loadClients() {
  try {
    const res = await API.get('getClients', { token: STATE.token });
    if (!res.success) { showToast(res.error, 'error'); return; }
    STATE.clients = res.clients;
    renderStats();
    renderClientsTable();
  } catch (err) { showToast(err.message, 'error'); }
}

function renderStats() {
  const total = STATE.clients.length;
  const active = STATE.clients.filter(c => c.Status === 'Active').length;
  const suspended = total - active;
  document.getElementById('statsGrid').innerHTML = `
    <div class="stat-card blue"><div class="label">إجمالي العملاء</div><div class="value">${total}</div></div>
    <div class="stat-card green"><div class="label">نشطين</div><div class="value">${active}</div></div>
    <div class="stat-card red"><div class="label">موقوفين</div><div class="value">${suspended}</div></div>
  `;
}

function renderClientsTable() {
  const search = (document.getElementById('clientSearch').value || '').toLowerCase();
  const clients = STATE.clients.filter(c =>
    !search || c.StoreName.toLowerCase().includes(search) || c.Username.toLowerCase().includes(search)
  );

  document.getElementById('clientsTableBody').innerHTML = clients.length ? clients.map(c => `
    <tr>
      <td><strong>${escapeHtml(c.StoreName)}</strong></td>
      <td>${escapeHtml(c.Username)}</td>
      <td><span class="status-badge ${c.Status === 'Active' ? 'status-confirmed' : 'status-cancelled'}">${c.Status === 'Active' ? 'نشط' : 'موقوف'}</span></td>
      <td>${escapeHtml(c.CreatedAt)}</td>
      <td>
        <button class="action-btn action-view" data-viewstore="${c.StoreID}">👁️ عرض التفاصيل</button>
        <button class="action-btn action-view" data-toggle="${c.StoreID}" data-status="${c.Status}">${c.Status === 'Active' ? 'إيقاف' : 'تفعيل'}</button>
        <button class="action-btn action-view" data-reset="${c.StoreID}">كلمة مرور</button>
        <button class="action-btn action-delete" data-delete="${c.StoreID}">حذف</button>
      </td>
    </tr>
  `).join('') : `<tr><td colspan="5" style="text-align:center;padding:40px;color:var(--gray-500);">لا يوجد عملاء بعد</td></tr>`;

  document.querySelectorAll('[data-viewstore]').forEach(btn => {
    btn.addEventListener('click', () => viewStoreDetails(btn.dataset.viewstore));
  });

  document.querySelectorAll('[data-toggle]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const newStatus = btn.dataset.status === 'Active' ? 'Suspended' : 'Active';
      const res = await API.post('updateClientStatus', { token: STATE.token, storeId: btn.dataset.toggle, status: newStatus });
      if (res.success) { showToast('تم تحديث حالة المتجر', 'success'); loadClients(); }
      else showToast(res.error, 'error');
    });
  });

  document.querySelectorAll('[data-reset]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.getElementById('resetStoreId').value = btn.dataset.reset;
      openModal('resetPasswordModal');
    });
  });

  document.querySelectorAll('[data-delete]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const ok = await confirmAction('هل أنت متأكد من حذف هذا المتجر نهائيًا؟ (بيانات الشيت هتفضل موجودة في درايف لكن مش هيقدر يدخل تاني)');
      if (!ok) return;
      const res = await API.post('deleteClient', { token: STATE.token, storeId: btn.dataset.delete });
      if (res.success) { showToast('تم حذف المتجر', 'success'); loadClients(); }
      else showToast(res.error, 'error');
    });
  });
}

document.getElementById('clientSearch').addEventListener('input', debounce(renderClientsTable, 250));

document.getElementById('addClientBtn').addEventListener('click', () => {
  document.getElementById('addClientForm').reset();
  openModal('addClientModal');
});

document.getElementById('generatePasswordBtn').addEventListener('click', () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  let pass = '';
  for (let i = 0; i < 10; i++) pass += chars.charAt(Math.floor(Math.random() * chars.length));
  document.getElementById('newPassword').value = pass;
});

document.getElementById('addClientForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const storeName = document.getElementById('newStoreName').value.trim();
  const username = document.getElementById('newUsername').value.trim();
  const password = document.getElementById('newPassword').value;

  try {
    const res = await API.post('createClient', { token: STATE.token, storeName, username, password });
    if (res.success) {
      closeModal('addClientModal');
      document.getElementById('successLoginUrl').textContent = window.location.origin + '/admin/';
      document.getElementById('successUsername').textContent = res.username;
      document.getElementById('successPassword').textContent = res.password;
      openModal('successClientModal');
      loadClients();
    } else showToast(res.error, 'error');
  } catch (err) { showToast(err.message, 'error'); }
});

document.getElementById('copyCredentialsBtn').addEventListener('click', () => {
  const text = `رابط الدخول: ${document.getElementById('successLoginUrl').textContent}\nاسم المستخدم: ${document.getElementById('successUsername').textContent}\nكلمة المرور: ${document.getElementById('successPassword').textContent}`;
  navigator.clipboard.writeText(text);
  showToast('تم نسخ البيانات', 'success');
});

document.getElementById('resetPasswordForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const storeId = document.getElementById('resetStoreId').value;
  const newPassword = document.getElementById('resetNewPassword').value;
  try {
    const res = await API.post('resetClientPassword', { token: STATE.token, storeId, newPassword });
    if (res.success) { showToast('تم تغيير كلمة المرور بنجاح', 'success'); closeModal('resetPasswordModal'); }
    else showToast(res.error, 'error');
  } catch (err) { showToast(err.message, 'error'); }
});

loadClients();

/* ---------- عرض تفاصيل تاجر معين (طلباته، منتجاته، عملاءه) ---------- */
async function viewStoreDetails(storeId) {
  document.getElementById('storeDetailsContent').innerHTML = '<p style="text-align:center;padding:30px;">جاري التحميل...</p>';
  openModal('storeDetailsModal');
  try {
    const res = await API.get('getStoreAdminView', { token: STATE.token, storeId });
    if (!res.success) {
      document.getElementById('storeDetailsContent').innerHTML = `<p style="color:var(--color-danger);">${escapeHtml(res.error)}</p>`;
      return;
    }
    renderStoreDetails(res);
  } catch (err) {
    document.getElementById('storeDetailsContent').innerHTML = `<p style="color:var(--color-danger);">${escapeHtml(err.message)}</p>`;
  }
}

function renderStoreDetails(data) {
  const currency = (data.settings && data.settings.Currency) || 'ج.م';
  const revenue = data.orders.filter(o => o['Order Status'] !== 'ملغي').reduce((sum, o) => sum + (Number(o['Total']) || 0), 0);

  document.getElementById('storeDetailsTitle').textContent = '📋 ' + data.storeName;

  document.getElementById('storeDetailsContent').innerHTML = `
    <div class="stats-grid" style="margin-bottom:20px;">
      <div class="stat-card blue"><div class="label">إجمالي الطلبات</div><div class="value">${data.orders.length}</div></div>
      <div class="stat-card green"><div class="label">إجمالي الإيرادات</div><div class="value">${formatCurrency(revenue, currency)}</div></div>
      <div class="stat-card amber"><div class="label">عدد المنتجات</div><div class="value">${data.products.length}</div></div>
      <div class="stat-card blue"><div class="label">عدد العملاء</div><div class="value">${data.customers.length}</div></div>
    </div>

    <h4 style="margin:18px 0 10px;">📦 الطلبات (${data.orders.length})</h4>
    <div class="table-card" style="margin-bottom:22px;">
      <table class="data-table">
        <thead><tr><th>رقم الطلب</th><th>العميل</th><th>الهاتف</th><th>المنتج</th><th>الإجمالي</th><th>الحالة</th><th>التاريخ</th></tr></thead>
        <tbody>
          ${data.orders.length ? data.orders.map(o => `
            <tr>
              <td>${escapeHtml(o['Order ID'])}</td><td>${escapeHtml(o['Customer Name'])}</td><td>${escapeHtml(o['Phone'])}</td>
              <td>${escapeHtml(o['Product'])}</td><td>${formatCurrency(o['Total'], currency)}</td>
              <td>${escapeHtml(o['Order Status'])}</td><td>${escapeHtml(o['Date'])}</td>
            </tr>`).join('') : `<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--gray-500);">لا توجد طلبات بعد</td></tr>`}
        </tbody>
      </table>
    </div>

    <h4 style="margin:18px 0 10px;">🏷️ المنتجات (${data.products.length})</h4>
    <div class="table-card" style="margin-bottom:22px;">
      <table class="data-table">
        <thead><tr><th>المنتج</th><th>السعر</th><th>الحالة</th><th>مفعّل؟</th></tr></thead>
        <tbody>
          ${data.products.length ? data.products.map(p => `
            <tr>
              <td>${escapeHtml(p['Product Name'])}</td><td>${formatCurrency(p['Price'], currency)}</td>
              <td>${escapeHtml(p['Stock Status'])}</td>
              <td>${(p['Active'] === true || p['Active'] === 'TRUE') ? '✅' : '⛔'}</td>
            </tr>`).join('') : `<tr><td colspan="4" style="text-align:center;padding:24px;color:var(--gray-500);">لا توجد منتجات بعد</td></tr>`}
        </tbody>
      </table>
    </div>

    <h4 style="margin:18px 0 10px;">👥 العملاء (${data.customers.length})</h4>
    <div class="table-card">
      <table class="data-table">
        <thead><tr><th>الاسم</th><th>الهاتف</th><th>المحافظة</th><th>عدد الطلبات</th><th>إجمالي الإنفاق</th></tr></thead>
        <tbody>
          ${data.customers.length ? data.customers.map(c => `
            <tr>
              <td>${escapeHtml(c['Name'])}</td><td>${escapeHtml(c['Phone'])}</td><td>${escapeHtml(c['Governorate'])}</td>
              <td>${escapeHtml(c['Total Orders'])}</td><td>${formatCurrency(c['Total Spent'], currency)}</td>
            </tr>`).join('') : `<tr><td colspan="5" style="text-align:center;padding:24px;color:var(--gray-500);">لا يوجد عملاء بعد</td></tr>`}
        </tbody>
      </table>
    </div>
  `;
}
