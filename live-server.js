import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { getQuote, getQuotes, getMarketPulse } from './market.js';
const root=path.dirname(fileURLToPath(import.meta.url));const app=express();const port=Number(process.env.PORT||3000);app.disable('x-powered-by');app.use(express.json({limit:'256kb'}));
function cleanSymbol(v){return String(v||'').trim().toUpperCase().replace(/[^A-Z0-9.\-^]/g,'').slice(0,16)}
app.get('/health',(_q,res)=>res.json({ok:true,service:'asiri-capital-live',version:'7.5.0-dynamic-ranking',alerts:true,smartAlerts:true,decisionEngine:true,batchedQuotes:true,dynamicRanking:true,time:new Date().toISOString()}));
app.get('/api/quote/:symbol',async(req,res)=>{const s=cleanSymbol(req.params.symbol);if(!s)return res.status(400).json({error:'رمز غير صالح'});try{res.set('Cache-Control','no-store');res.json(await getQuote(s))}catch(e){res.status(502).json({symbol:s,error:e.message||'تعذر جلب السعر'})}});
app.get('/api/quotes',async(req,res)=>{const ss=[...new Set(String(req.query.symbols||'').split(',').map(cleanSymbol).filter(Boolean))].slice(0,40);if(!ss.length)return res.json([]);try{const rows=await getQuotes(ss);const map=new Map(rows.map(x=>[x.symbol,x]));res.set('Cache-Control','no-store');res.json(ss.map(s=>map.get(s)||{symbol:s,error:'تعذر جلب السعر'}))}catch(e){res.status(502).json({error:e.message||'تعذر جلب الأسعار'})}});
app.get('/api/market',async(_q,res)=>{try{res.set('Cache-Control','no-store');res.json(await getMarketPulse())}catch(e){res.status(502).json({error:e.message||'تعذر جلب حالة السوق'})}});
for(const f of ['live-alerts.js','smart-alerts.js','decision-engine.js'])app.get('/'+f,(_q,res)=>{res.set('Cache-Control','no-store');res.type('application/javascript').sendFile(path.join(root,f))});
async function page(_q,res){try{let h=await fs.readFile(path.join(root,'live-index.html'),'utf8');for(const [f,v] of [['live-alerts.js','2'],['smart-alerts.js','7300'],['decision-engine.js','7500']])if(!h.includes('/'+f))h=h.replace('</body>',`<script src="/${f}?v=${v}"></script></body>`);res.set('Cache-Control','no-store');res.type('html').send(h)}catch{res.status(500).send('تعذر تحميل الواجهة الحية')}}app.get('/',page);app.get('/live-index.html',page);app.listen(port,'0.0.0.0',()=>console.log(`Asiri Capital Live v7.5.0 Dynamic Ranking listening on ${port}`));