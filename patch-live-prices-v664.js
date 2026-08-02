import fs from 'node:fs/promises';

const gatewayPath = new URL('./broker-gateway.js', import.meta.url);
let gateway = await fs.readFile(gatewayPath, 'utf8');
const marker = 'ASIRI_LIVE_PRICE_VALIDATION_V664';

if (!gateway.includes(marker)) {
  gateway = gateway.replace(
`function liveNumeric(...values) {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number) && number !== 0) return number;
  }
  return null;
}`,
`function liveNumeric(...values) {
  for (const value of values) {
    if (value === null || value === undefined || value === '') continue;
    const number = Number(value);
    if (Number.isFinite(number) && number > 0) return number;
  }
  return null;
} // ${marker}`);

  gateway = gateway.replace(
`    const selected = candidates.find((item) => Number(item.PrimaryListing) === Number(item.Identifier)) ||
      candidates.find((item) => String(item.ExchangeCountry || '').toLowerCase().includes('united states')) ||
      candidates[0];`,
`    const isUsListingV664 = (item) => {
      const country = String(item.ExchangeCountry || '').trim().toLowerCase();
      const exchange = String(item.ExchangeId || item.ExchangeName || '').trim().toUpperCase();
      const currency = String(item.CurrencyCode || '').trim().toUpperCase();
      const symbolValue = String(item.Symbol || '').toLowerCase();
      return country === 'us' || country.includes('united states') ||
        ['NASDAQ', 'NYSE', 'NYSEARCA', 'AMEX', 'BATS', 'NSC', 'NYS', 'ASE'].some((code) => exchange.includes(code)) ||
        /:(xnas|xnys|xase|arcx|bats)$/.test(symbolValue) || currency === 'USD';
    };
    const tradableV664 = (item) => !item.NonTradableReason || String(item.NonTradableReason).toLowerCase() === 'none' ||
      (Array.isArray(item.TradableAs) && item.TradableAs.includes('Stock'));
    const usCandidatesV664 = candidates.filter(isUsListingV664);
    const selected = usCandidatesV664.find((item) => Number(item.PrimaryListing) === Number(item.Identifier) && tradableV664(item)) ||
      usCandidatesV664.find(tradableV664) || usCandidatesV664[0] ||
      candidates.find((item) => Number(item.PrimaryListing) === Number(item.Identifier) && tradableV664(item)) || candidates[0];`);

  gateway = gateway.replace(
`        const price = liveNumeric(quote.Mid, details.LastTraded, quote.Bid, quote.Ask, position.currentPrice);`,
`        const marketPrice = liveNumeric(quote.Mid, details.LastTraded, quote.Bid, quote.Ask);
        const referencePrice = liveNumeric(quote.ReferencePrice, details.LastClose, position.currentPrice);
        const price = marketPrice ?? referencePrice;
        const priceKind = marketPrice != null ? 'market' : referencePrice != null ? 'reference' : 'unavailable';`);

  gateway = gateway.replace(
`        prices.push({`,
`        if (!Number.isFinite(price) || price <= 0) {
          errors.push({ symbol: position.symbol, error: quote.ErrorMessage || (quote.ErrorCode && quote.ErrorCode !== 'None' ? quote.ErrorCode : 'لم يرسل Saxo سعرًا صالحًا لهذه الأداة.') });
        }
        prices.push({`);

  gateway = gateway.replace(
`          source: delayedByMinutes === 0 ? 'saxo-live' : 'saxo-delayed'`,
`          available: Number.isFinite(price) && price > 0,
          priceKind,
          quoteErrorCode: quote.ErrorCode || null,
          source: priceKind === 'unavailable' ? 'saxo-unavailable' : priceKind === 'reference' ? 'saxo-reference' : delayedByMinutes === 0 ? 'saxo-live' : 'saxo-delayed'`);

  gateway = gateway.replace(
`  const delays = prices.map((price) => price.delayedByMinutes).filter(Number.isFinite);
  return {
    prices,
    errors,
    maxDelayMinutes: delays.length ? Math.max(...delays) : null,
    realTime: prices.length > 0 && delays.length === prices.length && delays.every((delay) => delay === 0)
  };`,
`  const validPrices = prices.filter((item) => item.available && Number.isFinite(item.price) && item.price > 0);
  const marketPrices = validPrices.filter((item) => item.priceKind === 'market');
  const referencePrices = validPrices.filter((item) => item.priceKind === 'reference');
  const delays = marketPrices.map((item) => item.delayedByMinutes).filter(Number.isFinite);
  return {
    prices,
    errors,
    validCount: validPrices.length,
    liveCount: marketPrices.filter((item) => item.delayedByMinutes === 0).length,
    delayedCount: marketPrices.filter((item) => Number(item.delayedByMinutes) > 0).length,
    referenceCount: referencePrices.length,
    maxDelayMinutes: delays.length ? Math.max(...delays) : null,
    realTime: marketPrices.length > 0 && referencePrices.length === 0 && delays.length === marketPrices.length && delays.every((delay) => delay === 0)
  };`);

  gateway = gateway.replace(
`      const positionsValue = live.prices.reduce((sum, price) => sum + Number(price.marketValue || 0), 0);
      const unrealizedPnl = live.prices.reduce((sum, price) => sum + Number(price.unrealizedPnl || 0), 0);`,
`      const priced = live.prices.filter((price) => price.available && Number.isFinite(Number(price.price)) && Number(price.price) > 0);
      const positionsValue = priced.reduce((sum, price) => sum + Number(price.marketValue || 0), 0);
      const unrealizedPnl = priced.reduce((sum, price) => sum + Number(price.unrealizedPnl || 0), 0);`);
}

await fs.writeFile(gatewayPath, gateway, 'utf8');

const clientPath = new URL('./v662.js', import.meta.url);
let client = await fs.readFile(clientPath, 'utf8');
if (!client.includes('ASIRI_LIVE_PRICE_CLIENT_VALIDATION_V664')) {
  client = client.replace(
`function pc662SetFeed(state,message){
  const pulse=pc662Q('#pc662Pulse');
  const badge=pc662Q('#pc662FeedBadge');
  if(pulse)pulse.className=\`pc662-pulse \${state}\`;
  if(badge){badge.className=\`pc662-badge \${state}\`;badge.textContent=state==='live'?'LIVE':state==='delayed'?'DELAYED':'OFFLINE';}
  if(pc662Q('#pc662Message'))pc662Q('#pc662Message').textContent=message;
}`,
`function pc662SetFeed(state,message){
  const pulse=pc662Q('#pc662Pulse');
  const badge=pc662Q('#pc662FeedBadge');
  if(pulse)pulse.className=\`pc662-pulse \${state}\`;
  if(badge){badge.className=\`pc662-badge \${state}\`;badge.textContent=state==='live'?'LIVE':state==='delayed'?'DELAYED':state==='reference'?'REFERENCE':'OFFLINE';}
  if(pc662Q('#pc662Message'))pc662Q('#pc662Message').textContent=message;
} // ASIRI_LIVE_PRICE_CLIENT_VALIDATION_V664`);

  client = client.replace(
`  const prices=Array.isArray(data.prices)?data.prices:[];
  const delay=Number(data.maxDelayMinutes||0);
  const state=prices.length?(delay===0?'live':'delayed'):'down';
  pc662SetFeed(state,prices.length?(delay===0?'الأسعار تصل من Saxo دون تأخير معلن.':\`Saxo يعلن تأخيرًا قدره \${delay} دقيقة.\`):'لم تصل أسعار من Saxo حتى الآن.');
  pc662Q('#pc662Delay').textContent=prices.length?(delay===0?'0 دقيقة':\`\${delay} دقيقة\`):'—';
  pc662Q('#pc662Rights').textContent=prices.length?(delay===0?'حقوق أسعار فورية متاحة':'يلزم اشتراك بيانات فورية لدى Saxo'):'لم يتم فحص الحقوق';
  pc662Q('#pc662Count').textContent=String(prices.length);
  pc662Q('#pc662Errors').textContent=data.errors?.length?\`\${data.errors.length} خطأ جزئي\`:'لا توجد أخطاء';`,
`  const prices=Array.isArray(data.prices)?data.prices:[];
  const validPrices=prices.filter((item)=>item?.price!==null&&item?.price!==undefined&&item?.price!==''&&Number.isFinite(Number(item.price))&&Number(item.price)>0);
  const delay=Number(data.maxDelayMinutes||0);
  const hasReference=validPrices.some((item)=>item.source==='saxo-reference'||item.priceKind==='reference');
  const hasMarket=validPrices.some((item)=>item.priceKind==='market');
  const state=!validPrices.length?'down':hasReference&&!hasMarket?'reference':delay===0?'live':'delayed';
  const message=!validPrices.length?'لم يرسل Saxo سعرًا صالحًا للأسهم المحددة.':state==='reference'?'السوق لا يرسل عرضًا جاريًا؛ يتم عرض السعر المرجعي بوضوح.':delay===0?'الأسعار السوقية تصل من Saxo دون تأخير معلن.':\`Saxo يعلن تأخيرًا قدره \${delay} دقيقة.\`;
  pc662SetFeed(state,message);
  pc662Q('#pc662Delay').textContent=!validPrices.length?'—':state==='reference'?'سعر مرجعي':delay===0?'0 دقيقة':\`\${delay} دقيقة\`;
  pc662Q('#pc662Rights').textContent=!validPrices.length?'لم يتوفر سعر صالح':state==='reference'?'آخر سعر/إغلاق وليس بثًا حيًا':delay===0?'حقوق أسعار فورية متاحة':'يلزم اشتراك بيانات فورية لدى Saxo';
  pc662Q('#pc662Count').textContent=String(validPrices.length);
  const firstError=data.errors?.[0]?.error;
  pc662Q('#pc662Errors').textContent=data.errors?.length?\`\${data.errors.length} مشكلة: \${firstError||'راجع المصدر'}\`:'لا توجد أخطاء';`);

  client = client.replace(
`    if(!row||!Number.isFinite(Number(price.price)))continue;`,
`    if(!row||price.price===null||price.price===undefined||price.price===''||!Number.isFinite(Number(price.price))||Number(price.price)<=0)continue;`);

  client = client.replace(
`    const sourceClass=Number(price.delayedByMinutes||0)===0?'pc662-price-live':'pc662-price-delayed';
    const sourceText=Number(price.delayedByMinutes||0)===0?'SAXO LIVE':\`DELAYED \${Number(price.delayedByMinutes||0)}m\`;`,
`    const isReference=price.source==='saxo-reference'||price.priceKind==='reference';
    const sourceClass=isReference?'pc662-price-reference':Number(price.delayedByMinutes||0)===0?'pc662-price-live':'pc662-price-delayed';
    const sourceText=isReference?'SAXO REFERENCE':Number(price.delayedByMinutes||0)===0?'SAXO LIVE':\`DELAYED \${Number(price.delayedByMinutes||0)}m\`;`);

  client = client.replace(
`    if(pc662Q('#pc661Source'))pc662Q('#pc661Source').textContent=delay===0?'Saxo Live Price':'Saxo Delayed Price';`,
`    if(pc662Q('#pc661Source'))pc662Q('#pc661Source').textContent=state==='reference'?'Saxo Reference Price':delay===0?'Saxo Live Price':'Saxo Delayed Price';`);
}
await fs.writeFile(clientPath, client, 'utf8');

const cssPath = new URL('./v662.css', import.meta.url);
let css = await fs.readFile(cssPath, 'utf8');
if (!css.includes('ASIRI_LIVE_PRICE_REFERENCE_V664')) {
  css += `\n/* ASIRI_LIVE_PRICE_REFERENCE_V664 */\n.pc662-badge.reference{border-color:rgba(233,188,85,.65)!important;color:#e9bc55!important}.pc662-pulse.reference{background:#e9bc55!important;box-shadow:0 0 0 7px rgba(233,188,85,.12)!important}.pc662-price-reference{color:#e9bc55!important}\n`;
}
await fs.writeFile(cssPath, css, 'utf8');

const bootstrapPath = new URL('./bootstrap-v65.js', import.meta.url);
let bootstrap = await fs.readFile(bootstrapPath, 'utf8');
bootstrap = bootstrap.replace("const VERSION = '6.6.3';", "const VERSION = '6.6.4';");
bootstrap = bootstrap.replace("const VERSION = '6.6.2';", "const VERSION = '6.6.4';");
bootstrap = bootstrap.replaceAll('/v662.js?v=6620', '/v662.js?v=6640');
bootstrap = bootstrap.replaceAll('/v662.css?v=6620', '/v662.css?v=6640');
await fs.writeFile(bootstrapPath, bootstrap, 'utf8');

console.log('live-price-engine-v6.6.4', { validPositivePricesOnly: true, usListingPriority: true, referencePriceLabel: true, falseLiveZeroBlocked: true, tradingEnabled: false });
