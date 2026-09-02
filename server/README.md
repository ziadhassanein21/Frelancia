# 📡 Frelancia Live Hub (سيرفر التنبيهات المباشرة 24/7)

سيرفر ذكي وخفيف جداً مبني بـ Node.js، يقوم برصد مشاريع مستقل لحظة بلحظة (كل 15 ثانية) وإرسال إشعار فوري لجميع المستخدمين المثبتين للإضافة عبر بروتوكول SignalR و WebSockets.

---

## 🌟 المميزات
- ⚡ **رصد لحظي**: يفحص موقع مستقل كل 15 ثانية فور نشر أي مشروع.
- 📡 **بث جماعي (Broadcast)**: بمجرد نشر المشروع، يرسل إشعاراً لجميع الإضافات المتصلة في أقل من ثانية.
- 🔄 **دعم كامل لـ SignalR و WebSocket و SSE**: متوافق 100% مع إضافة متصفح Frelancia بدون أي تعديل.
- 🪶 **خفيف جداً**: يستهلك أقل من 35 ميجابايت رام.
- 📊 **لوحة تحكم ويب مدمجة**: افتح رابط السيرفر لترى عدد الإضافات المتصلة والمشاريع المرصودة وزر اختبار الإشعار.
- 🛡️ **مقاوم للإيقاف**: يحتوي على آلية Self-Ping للحفاظ على عمل السيرفر 24/7 على الاستضافات المجانية.

---

## 🚀 طرق الاستضافة المجانية السريعة

### 1️⃣ الاستضافة المجانية الأسهل: Render.com (موصى بها - 100% مجاناً)
1. قم بإنشاء حساب مجاني على [Render.com](https://render.com).
2. أنشئ مستودعاً جديداً على GitHub وارفع فيه مجلد `server`.
3. في لوحة تحكم Render: اضغط **New +** ثم اختر **Web Service**.
4. اختر مستودع GitHub الخاص بك.
5. املأ الإعدادات التالية:
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `node server.js`
   - **Plan**: `Free`
6. اضغط **Deploy Web Service**.
7. بعد اكتمال البناء (دقيقة واحدة)، سيعطيك Render رابطاً مجانياً ومؤمناً مثل:
   `https://frelancia-hub.onrender.com`
8. انسخ الرابط وضع في نهايته `/jobNotificationHub`:
   `https://frelancia-hub.onrender.com/jobNotificationHub`
9. افتح إعدادات إضافة Frelancia في المتصفح وضع هذا الرابط في خانة **رابط سيرفر SignalR المخصص** واضغط حفظ!

---

### 2️⃣ الاستضافة على Bluehost cPanel (إذا كان لديك استضافة Bluehost)
1. ادخل إلى **cPanel** في Bluehost.
2. ابحث عن **Setup Node.js App** (أو Node.js Selector).
3. اضغط **Create Application**:
   - **Node.js version**: 18 أو 20 أو أحدث.
   - **Application root**: مجلد السيرفر (مثلاً `frelancia-server`).
   - **Application URL**: الدومين الفرعي أو المسار المطلوب (مثلاً `hub.yourdomain.com`).
   - **Application startup file**: `server.js`.
4. ارفع ملفات المجلد `server` إلى مسار التطبيق في **File Manager**.
5. اضغط **Run NPM Install**.
6. اضغط **Restart**.
7. الرابط سيكون: `https://hub.yourdomain.com/jobNotificationHub`.

---

### 3️⃣ التشغيل محلياً على جهازك (Local Machine)
لتشغيل السيرفر على جهاز الكمبيوتر الخاص بك:
```bash
cd server
npm install
node server.js
```
سيعمل على المنفذ: `http://localhost:3000`
الرابط في الإضافة: `http://localhost:3000/jobNotificationHub`

---

## 🧪 اختبار السيرفر
- افتح رابط السيرفر في المتصفح (مثلاً `http://localhost:3000` أو رابط Render).
- ستظهر لك لوحة تحكم السيرفر.
- اضغط على زر **"إرسال إشعار تجريبي"** لإرسال إشعار فوري لجميع المتصفحات المتصلة للتأكد من وصول التنبيهات!
