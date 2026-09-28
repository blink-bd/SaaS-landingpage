-- ينفَّذ مرة واحدة فقط على قاعدة البيانات الموجودة بالفعل (بدل إعادة إنشاء الجداول)
alter table stores add column if not exists custom_domain text unique;
-- بعد ما تنفذه: شغّل ملف functions.sql كامل تاني (آمن، كل الدوال create or replace)
