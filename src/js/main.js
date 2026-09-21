window.APP_STATE = { product: null, settings: {}, storeId: null, productId: null, currency: 'ج.م', whatsapp: '' };

function getUrlParams() {
  const params = new URLSearchParams(window.location.search);
  return { storeId: params.get('store') || '', productId: params.get('product') || '' };
}

function showInvalidLinkMessage(message) {
  document.body.innerHTML = `
    <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px;text-align:center;font-family:'Cairo',sans-serif;">
      <div>
        <div style="font-size:60px;margin-bottom:16px;">⚠️</div>
        <h2 style="margin-bottom:10px;">${escapeHtml(message)}</h2>
        <p style="color:#6B7280;">يرجى التأكد من الرابط أو التواصل مع المتجر مباشرة</p>
      </div>
    </div>`;
}

function applyStoreBranding(settings, storeName) {
  const s = settings || {};
  const finalStoreName = storeName || s.StoreName || 'المتجر';
  const phone = s.Phone || '';
  const whatsapp = s.WhatsApp || '';

  document.querySelectorAll('#storeNameLabel, #footerStoreName').forEach(el => el.textContent = finalStoreName);
  document.getElementById('footerDeliveryInfo').textContent = s.DeliveryInfo || '';
  document.getElementById('footerAddress').textContent = s.Address ? ('📍 ' + s.Address) : '';
  document.getElementById('footerPhone').textContent = phone;
  document.getElementById('footerPhone').href = 'tel:' + phone;
  document.getElementById('headerCallBtn').href = 'tel:' + phone;

  const waLink = whatsapp ? ('https://wa.me/' + whatsapp) : '#';
  document.getElementById('footerWhatsapp').href = waLink;
  document.getElementById('headerWhatsBtn').href = waLink;
  document.getElementById('floatWhatsapp').href = waLink;
  document.getElementById('footerFacebook').href = s.Facebook || '#';
  document.getElementById('footerInstagram').href = s.Instagram || '#';
  document.getElementById('footerYear').textContent = new Date().getFullYear();

  window.APP_STATE.currency = s.Currency || 'ج.م';
  window.APP_STATE.whatsapp = whatsapp;
  window.APP_STATE.storeName = finalStoreName;

  // تطبيق الهوية البصرية الخاصة بالتاجر (ألوانه ولوجوه)
  applyBrandColors(s.PrimaryColor, s.AccentColor);
  applyLogo('storeLogo', s.LogoURL, 'assets/favicon.svg');
}

function renderProduct(p) {
  const currency = window.APP_STATE.currency;

  document.title = `${p['Product Name']} | ${window.APP_STATE.storeName}`;
  document.getElementById('productHeadline').textContent = p['Product Name'];
  document.getElementById('productDescription').textContent = p['Description'] || '';

  const mainImage = p['Main Image'] || 'https://via.placeholder.com/600x600?text=No+Image';
  document.getElementById('heroMainImage').src = mainImage;
  document.getElementById('heroMainImage').alt = p['Product Name'];
  document.getElementById('galleryMainImg').src = mainImage;
  document.getElementById('summaryImg').src = mainImage;

  const price = Number(p['Price']) || 0;
  const oldPrice = Number(p['Old Price']) || 0;
  const hasDiscount = oldPrice > price;
  const badge = hasDiscount ? `خصم ${Math.round((1 - price / oldPrice) * 100)}%` : 'عرض خاص';

  document.getElementById('heroBadge').textContent = badge;
  document.getElementById('heroPrice').textContent = formatCurrency(price, currency);
  document.getElementById('summaryName').textContent = p['Product Name'];
  document.getElementById('summaryStock').textContent = p['Stock Status'] || 'متوفر';
  document.getElementById('summaryPrice').textContent = formatCurrency(price, currency);
  document.getElementById('summaryOldPrice').textContent = hasDiscount ? formatCurrency(oldPrice, currency) : '';
  document.getElementById('summaryBadge').textContent = hasDiscount ? badge : '';
  document.getElementById('stickyPrice').textContent = formatCurrency(price, currency);

  let gallery = p['Gallery Images'] ? String(p['Gallery Images']).split(',').map(s => s.trim()).filter(Boolean) : [];
  if (!gallery.length) gallery = [mainImage];

  const thumbsEl = document.getElementById('galleryThumbs');
  thumbsEl.innerHTML = gallery.map((img, i) =>
    `<img src="${escapeHtml(img)}" loading="lazy" class="${i === 0 ? 'active' : ''}" data-src="${escapeHtml(img)}" alt="صورة ${i + 1}">`
  ).join('');
  thumbsEl.querySelectorAll('img').forEach(thumb => {
    thumb.addEventListener('click', () => {
      document.getElementById('galleryMainImg').src = thumb.dataset.src;
      thumbsEl.querySelectorAll('img').forEach(i => i.classList.remove('active'));
      thumb.classList.add('active');
    });
  });

  // مميزات ثابتة عامة (ثقة الزبون)
  const benefits = [
    { icon: '🚚', title: 'توصيل سريع', text: 'لجميع المحافظات خلال أيام قليلة' },
    { icon: '💵', title: 'الدفع عند الاستلام', text: 'ادفع فقط عند استلام المنتج' },
    { icon: '✅', title: 'جودة موثوقة', text: 'منتج أصلي بضمان استبدال' },
    { icon: '📞', title: 'دعم فوري', text: 'تواصل معنا في أي وقت' }
  ];
  document.getElementById('benefitsGrid').innerHTML = benefits.map(b => `
    <div class="benefit-card"><div class="benefit-icon">${b.icon}</div><h3>${b.title}</h3><p>${b.text}</p></div>
  `).join('');

  // مميزات ومواصفات وأسئلة خاصة بالمنتج (من بيانات العميل)
  const features = parseLines(p['Features']);
  document.getElementById('featuresList').innerHTML = features.length
    ? features.map(f => `<li>${escapeHtml(f)}</li>`).join('')
    : '<li>سيتم إضافة المميزات قريبًا</li>';

  const specs = parseSpecs(p['Specifications']);
  document.getElementById('specsTable').innerHTML = specs.length
    ? specs.map(s => `<tr><td>${escapeHtml(s.label)}</td><td>${escapeHtml(s.value)}</td></tr>`).join('')
    : '<tr><td colspan="2">لا توجد مواصفات إضافية</td></tr>';

  const faq = parseFaq(p['FAQ']);
  document.getElementById('faqList').innerHTML = faq.length ? faq.map(item => `
    <div class="faq-item">
      <div class="faq-question"><span>${escapeHtml(item.q)}</span><span class="plus">+</span></div>
      <div class="faq-answer"><p>${escapeHtml(item.a)}</p></div>
    </div>`).join('') : '<p style="text-align:center;color:var(--gray-500);">لا توجد أسئلة شائعة حاليًا</p>';

  document.querySelectorAll('.faq-question').forEach(q => {
    q.addEventListener('click', () => q.parentElement.classList.toggle('open'));
  });

  window.APP_STATE.product = {
    id: p['Product ID'], name: p['Product Name'], price, oldPrice,
    deliveryFee: Number(p['Delivery Fee']) || 0
  };
}

function initStickyCtaVisibility() {
  const orderSection = document.getElementById('order');
  const sticky = document.getElementById('stickyCta');
  window.addEventListener('scroll', () => {
    const rect = orderSection.getBoundingClientRect();
    const isVisible = rect.top < window.innerHeight && rect.bottom > 0;
    sticky.style.transform = isVisible ? 'translateY(120%)' : 'translateY(0)';
  });
}

async function bootstrapLandingPage() {
  const { storeId, productId } = getUrlParams();
  if (!storeId) { showInvalidLinkMessage('رابط غير صالح'); return; }

  window.APP_STATE.storeId = storeId;
  window.APP_STATE.productId = productId;

  try {
    const [res, brandingRes] = await Promise.all([
      API.get('getPublicData', { storeId, productId }),
      API.get('getSuperAdminBranding').catch(() => null) // فشل تحميل الفوتر مايوقفش الصفحة
    ]);
    if (!res.success) { showInvalidLinkMessage(res.error || 'تعذر تحميل بيانات المتجر'); return; }
    if (!res.product) { showInvalidLinkMessage('هذا المنتج غير متوفر حاليًا'); return; }

    applyStoreBranding(res.settings, res.storeName);
    renderProduct(res.product);
    initStickyCtaVisibility();
    if (brandingRes && brandingRes.success) {
      applyPlatformFooter(brandingRes.branding.FooterText, brandingRes.branding.FooterLink);
    }
    document.dispatchEvent(new CustomEvent('app:ready'));
  } catch (err) {
    showInvalidLinkMessage('تعذر الاتصال بالخادم، حاول لاحقًا');
  }
}

document.addEventListener('DOMContentLoaded', bootstrapLandingPage);
