// Display only. Never replace the original quote timestamps used by the guards.
export function formatMarketTime(value,dateOnly=false){
 const d=new Date(value||'');
 if(!Number.isFinite(d.getTime()))return 'غير متاح';
 return new Intl.DateTimeFormat('ar-SA-u-ca-gregory-nu-latn',{timeZone:'Asia/Riyadh',dateStyle:'medium',...(dateOnly?{}:{timeStyle:'medium',hourCycle:'h23'})}).format(d);
}
export function referenceCurrencyLabel(currency){
 return typeof currency==='string'&&/^[A-Z]{3}$/.test(currency)?`عملة السعر: ${currency}`:'عملة السعر غير موثقة؛ المحاكاة تفترض USD بعد إقرارك';
}
