(async function loadLoginBranding() {
  try {
    const res = await API.get('getSuperAdminBranding');
    if (!res.success) return;
    const b = res.branding;
    applyBrandColors(b.PrimaryColor, b.AccentColor);
    if (b.PlatformName) document.getElementById('loginPlatformName').textContent = b.PlatformName;
    if (b.LogoURL) {
      const logoEl = document.getElementById('loginLogo');
      logoEl.src = b.LogoURL;
      logoEl.style.display = 'block';
    }
    applyPlatformFooter(b.FooterText, b.FooterLink);
  } catch (err) { /* هوية افتراضية هتفضل شغالة حتى لو فشل التحميل */ }
})();

document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value;
  const btn = document.getElementById('loginBtn');
  const btnText = document.getElementById('loginBtnText');

  if (!username || !password) { showToast('يرجى إدخال اسم المستخدم وكلمة المرور', 'error'); return; }

  btn.disabled = true;
  btnText.innerHTML = '<span class="spinner"></span> جاري التحقق...';

  try {
    const res = await API.post('login', { username, password });
    if (res.success) {
      localStorage.setItem('admin_token', res.token);
      localStorage.setItem('admin_token_expiry', String(Date.now() + res.expiresIn * 1000));
      localStorage.setItem('admin_role', res.role);
      localStorage.setItem('admin_username', res.username);

      if (res.role === 'client') {
        localStorage.setItem('store_id', res.storeId);
        localStorage.setItem('store_name', res.storeName);
      }

      showToast('تم تسجيل الدخول بنجاح', 'success');
      setTimeout(() => {
        window.location.href = res.role === 'superadmin' ? 'super-dashboard.html' : 'dashboard.html';
      }, 500);
    } else {
      showToast(res.error || 'بيانات الدخول غير صحيحة', 'error');
      btn.disabled = false; btnText.textContent = 'تسجيل الدخول';
    }
  } catch (err) {
    showToast(err.message || 'تعذر الاتصال بالخادم', 'error');
    btn.disabled = false; btnText.textContent = 'تسجيل الدخول';
  }
});

(function checkExisting() {
  const token = localStorage.getItem('admin_token');
  const role = localStorage.getItem('admin_role');
  const expiry = Number(localStorage.getItem('admin_token_expiry') || 0);
  if (token && expiry > Date.now()) {
    window.location.href = role === 'superadmin' ? 'super-dashboard.html' : 'dashboard.html';
  }
})();
