const clamp=(n,min,max)=>Math.min(max,Math.max(min,n));

export function analyzePosition(quote, position, technicals={}) {
  const price=Number(quote.price), stop=Number(position.stopLoss), avg=Number(position.avgPrice ?? position.averageCost);
  const t1=Number(position.target1), t2=Number(position.target2);
  const volumeRatio=quote.averageVolume&&quote.volume?quote.volume/quote.averageVolume:null;
  const pnlPct=Number.isFinite(price)&&avg?((price-avg)/avg)*100:null;
  const stopDistancePct=Number.isFinite(price)&&stop?((price-stop)/price)*100:null;
  const risk=Number.isFinite(price)&&stop?price-stop:null;
  const reward1=Number.isFinite(price)&&t1?t1-price:null;
  const rr1=risk>0&&reward1>0?reward1/risk:null;
  let score=35;
  score += Number(technicals.trendScore || 0)*9;
  if (technicals.emaAlignment === 2) score += 8;
  if (Number(technicals.histogram) > 0) score += 5;
  if (technicals.rsi14!=null) score += technicals.rsi14>=45&&technicals.rsi14<=68?10:technicals.rsi14>75?-8:0;
  if (technicals.momentum20!=null) score += clamp(technicals.momentum20/2,-10,12);
  if (quote.changePercent!=null) score += clamp(quote.changePercent*1.5,-8,8);
  if (volumeRatio!=null) score += clamp((volumeRatio-1)*10,-7,10);
  if (rr1!=null) score += clamp((rr1-1)*7,-7,10);
  if (stopDistancePct!=null&&stopDistancePct<2) score-=15;
  score=Math.round(clamp(score,0,100));

  let decision='انتظار', reason='لا توجد إشارة حاسمة بعد.', action='WAIT';
  if(Number.isFinite(price)&&price<=stop){decision='تنفيذ وقف الخسارة';reason='السعر وصل إلى وقف الخسارة المحدد.';action='EXIT';}
  else if(Number.isFinite(price)&&price>=t2){decision='جني أرباح قوي';reason='السعر بلغ الهدف الثاني؛ حماية الربح أولوية.';action='TAKE_PROFIT';}
  else if(Number.isFinite(price)&&price>=t1){decision='جني جزئي ورفع الوقف';reason='السعر بلغ الهدف الأول.';action='TRIM';}
  else if(score>=78&&technicals.trendScore>=2&&(volumeRatio==null||volumeRatio>=0.9)){decision='احتفاظ قوي';reason='الاتجاه والزخم والسيولة تدعم استمرار المركز.';action='HOLD_STRONG';}
  else if(score>=62){decision='احتفاظ';reason='المركز ما زال ضمن الخطة ولم يكسر الوقف.';action='HOLD';}
  else if(stopDistancePct!=null&&stopDistancePct<4){decision='مراقبة لصيقة';reason='السعر قريب من وقف الخسارة.';action='WATCH_CLOSE';}

  const alerts=[];
  if(stopDistancePct!=null&&stopDistancePct<=5&&price>stop) alerts.push({level:'warning',text:`يبعد ${stopDistancePct.toFixed(1)}% فقط عن وقف الخسارة`});
  if(volumeRatio!=null&&volumeRatio>=1.5) alerts.push({level:'info',text:`حجم التداول ${volumeRatio.toFixed(1)}× المتوسط`});
  if(technicals.rsi14>=75) alerts.push({level:'warning',text:'تشبع شرائي مرتفع'});
  if(technicals.high20&&price>=technicals.high20*0.995) alerts.push({level:'positive',text:'قرب قمة 20 جلسة/اختراق محتمل'});

  return {pnlPct,marketValue:Number.isFinite(price)?price*Number(position.quantity||0):null,costValue:avg*Number(position.quantity||0),stopDistancePct,volumeRatio,riskRewardToTarget1:rr1,asiriScore:score,decision,reason,action,alerts};
}
