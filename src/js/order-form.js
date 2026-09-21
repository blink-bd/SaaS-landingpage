document.addEventListener('app:ready', initOrderForm);

function initOrderForm() {
  const govSelect = document.getElementById('governorate');
  govSelect.innerHTML = '<option value="">اختر المحافظة</option>' +
    EGYPT_GOVERNORATES.map(g => `<option value="${g}">${g}</option>`).join('');

  let quantity = 1;
  const qtyInput = document.getElementById('qtyInput');
  const qtyFieldDisplay = document.getElementById('quantityField');

  function updateTotals() {
    const p = window.APP_STATE.product;
    const currency = window.APP_STATE.currency;
    const total = (p.price * quantity) + (p.deliveryFee || 0);

    document.getElementById('totalUnitPrice').textContent = formatCurrency(p.price, currency);
    document.getElementById('totalQty').textContent = quantity;
    document.getElementById('totalDelivery').textContent = formatCurrency(p.deliveryFee || 0, currency);
    document.getElementById('totalFinal').textContent = formatCurrency(total, currency);
    qtyInput.value = quantity;
    qtyFieldDisplay.value = quantity;
  }

  document.getElementById('qtyPlus').addEventListener('click', () => { if (quantity < 20) { quantity++; updateTotals(); } });
  document.getElementById('qtyMinus').addEventListener('click', () => { if (quantity > 1) { quantity--; updateTotals(); } });
  updateTotals();

  const form = document.getElementById('orderForm');

  function setFieldError(id, hasError) {
    document.getElementById(id).closest('.form-group').classList.toggle('has-error', hasError);
    document.getElementById(id).classList.toggle('error', hasError);
  }

  function validateForm(data) {
    let valid = true;
    if (!data.fullName || data.fullName.trim().length < 3) { setFieldError('fullName', true); valid = false; } else setFieldError('fullName', false);
    if (!isValidEgyptianPhone(data.phone)) { setFieldError('phone', true); valid = false; } else setFieldError('phone', false);
    if (!data.governorate) { setFieldError('governorate', true); valid = false; } else setFieldError('governorate', false);
    if (!data.address || data.address.trim().length < 5) { setFieldError('address', true); valid = false; } else setFieldError('address', false);
    return valid;
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = {
      fullName: document.getElementById('fullName').value.trim(),
      phone: document.getElementById('phone').value.trim(),
      governorate: document.getElementById('governorate').value,
      address: document.getElementById('address').value.trim(),
      notes: document.getElementById('notes').value.trim(),
      website: form.website.value
    };

    if (!validateForm(data)) { showToast('يرجى تصحيح الأخطاء في النموذج', 'error'); return; }

    const submitBtn = document.getElementById('submitOrderBtn');
    const btnText = document.getElementById('submitBtnText');
    submitBtn.disabled = true;
    btnText.innerHTML = '<span class="spinner"></span> جاري الإرسال...';

    try {
      const res = await API.post('createOrder', {
        storeId: window.APP_STATE.storeId,
        productId: window.APP_STATE.product.id,
        name: data.fullName, phone: data.phone, governorate: data.governorate,
        address: data.address, notes: data.notes, quantity: quantity,
        website: data.website, clientId: getClientId()
      });

      if (!res.success) {
        showToast(res.error || 'حدث خطأ أثناء إرسال الطلب', 'error');
        submitBtn.disabled = false; btnText.textContent = 'اطلب الآن';
        return;
      }

      form.style.display = 'none';
      document.getElementById('successPanel').style.display = 'block';
      document.getElementById('successOrderId').textContent = res.orderId;

      const waMessage = encodeURIComponent(
        `طلب جديد ✅\nرقم الطلب: ${res.orderId}\nالاسم: ${data.fullName}\nالهاتف: ${data.phone}\nالمنتج: ${res.productName}\nالكمية: ${quantity}\nالإجمالي: ${res.total} ${window.APP_STATE.currency}\nالمحافظة: ${data.governorate}\nالعنوان: ${data.address}`
      );
      document.getElementById('whatsappConfirmBtn').href = `https://wa.me/${window.APP_STATE.whatsapp}?text=${waMessage}`;
      showToast('تم تسجيل الطلب بنجاح', 'success');
    } catch (err) {
      showToast(err.message || 'تعذر الاتصال بالخادم', 'error');
      submitBtn.disabled = false; btnText.textContent = 'اطلب الآن';
    }
  });
}
