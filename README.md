# Asiri Capital v7.4

منصة شخصية لتحليل الأسهم، إدارة المحفظة، Decision Intelligence، التنبيهات، وربط الوسطاء مع بقاء التنفيذ البشري بوابة إلزامية.

## المكونات الرئيسية

- **Asiri Decision Intelligence:** حفظ القرارات وقياس نتائجها بعد 1 و3 و7 جلسات.
- **Opportunity Engine:** فصل المحفظة عن الفرص الجديدة وGolden Alerts.
- **Asiri Analytics Engine:** خدمة FastAPI مستقلة تستخدم FinanceToolkit للنسب المالية ونماذج Altman وPiotroski وBeneish.
- **Asiri Data Provider Layer:** عقود موحدة للأسعار والتاريخ والأساسيات والإفصاحات والأخبار.
- **Portfolio Ledger v7.4:** مخطط Supabase لسجل معاملات append-only؛ ملف الترحيل موجود لكنه لا يُطبق تلقائيًا.
- **Broker Gateway:** Saxo وShadow Mode مع ضوابط قراءة وتحليل، ولا يُسمح بالتنفيذ إلا عبر ميزة SIM منفصلة ومغلقة افتراضيًا.

## التشغيل الأساسي

```bash
npm ci
npm run check
npm start
```

## خدمة التحليل المالي

الخدمة موجودة في `services/analytics` وتعمل بصورة مستقلة عن تطبيق Node.js.

```bash
cd services/analytics
python -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

## متغيرات تطبيق Node.js

```text
SUPABASE_URL
SUPABASE_PUBLISHABLE_KEY
SUPABASE_SERVICE_ROLE_KEY
TELEGRAM_BOT_TOKEN
TELEGRAM_CHAT_ID
ASIRI_PRIMARY_USER_ID

ASIRI_ANALYTICS_URL
ASIRI_ANALYTICS_TOKEN
ASIRI_ANALYTICS_TIMEOUT_MS=60000
ASIRI_FUNDAMENTAL_GATE_ENABLED=false

SAXO_ENV=sim
SAXO_ALLOW_TRADING=false
SAXO_EXECUTION_FEATURE_ENABLED=false
SAXO_APP_KEY
SAXO_REDIRECT_URI
BROKER_TOKEN_ENCRYPTION_KEY
```

## متغيرات Asiri Analytics Engine

```text
ASIRI_ANALYTICS_TOKEN
FINANCIAL_MODELING_PREP_KEY
CACHE_TTL_SECONDS=900
REQUEST_TIMEOUT_SECONDS=45
TRADING_ENABLED=false
```

يجب أن تكون قيمة `ASIRI_ANALYTICS_TOKEN` متطابقة في الخدمتين، ولا يجوز إرسال `FINANCIAL_MODELING_PREP_KEY` إلى المتصفح.

## الأمان

- لا تحفظ أي مفتاح أو رمز وصول داخل GitHub؛ تستخدم أسرار منصة الاستضافة فقط.
- بوابة التحليل المالي وGolden Alert لا تنفذ أوامر وسيط.
- `ASIRI_FUNDAMENTAL_GATE_ENABLED` يبقى `false` حتى نشر خدمة التحليل والتحقق من بياناتها الحقيقية.
- ترحيل Portfolio Ledger لا يُطبق تلقائيًا ولا يغير جدول المحفظة الحالي.
