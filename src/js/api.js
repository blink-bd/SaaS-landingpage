const API = {
  baseUrl: (typeof APP_CONFIG !== 'undefined' && APP_CONFIG.apiUrl) || '',

  /**
   * تحسين موثوقية الاتصال: Apps Script أحيانًا بياخد وقت "استيقاظ" أو بيرد
   * برد فاشل مؤقتًا (مش علاقته باستضافة الملفات نفسها، ده جزء من طبيعة
   * Google Apps Script Web Apps). الدالة دي بتعيد المحاولة تلقائيًا قبل
   * ما تستسلم وتوري رسالة خطأ للمستخدم.
   */
  async _fetchWithRetry(url, options, maxRetries = 2) {
    let lastError = null;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        // مهلة 20 ثانية للطلب الواحد (Apps Script أحيانًا بطيء في أول استدعاء)
        const timeoutId = setTimeout(() => controller.abort(), 20000);

        const res = await fetch(url, Object.assign({}, options, { signal: controller.signal }));
        clearTimeout(timeoutId);

        if (!res.ok) throw new Error('رد غير متوقع من الخادم (كود ' + res.status + ')');
        return await res.json();
      } catch (err) {
        lastError = err;
        // لو دي مش آخر محاولة، استنى شوية وحاول تاني (بفاصل متزايد)
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, 600 * (attempt + 1)));
        }
      }
    }
    // كل المحاولات فشلت
    const isTimeout = lastError && lastError.name === 'AbortError';
    throw new Error(
      isTimeout
        ? 'الخادم بياخد وقت أطول من المعتاد، حاول تاني بعد لحظات'
        : 'تعذر الاتصال بالخادم، حاول تاني بعد لحظات'
    );
  },

  async get(action, params = {}) {
    if (!this.baseUrl || this.baseUrl.includes('PASTE_YOUR')) {
      throw new Error('لم يتم إعداد رابط الخادم (apiUrl) بعد في config.js');
    }
    const query = new URLSearchParams({ action, ...params }).toString();
    return this._fetchWithRetry(`${this.baseUrl}?${query}`, { method: 'GET' });
  },

  async post(action, data = {}) {
    if (!this.baseUrl || this.baseUrl.includes('PASTE_YOUR')) {
      throw new Error('لم يتم إعداد رابط الخادم (apiUrl) بعد في config.js');
    }
    return this._fetchWithRetry(this.baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, ...data })
    });
  }
};
