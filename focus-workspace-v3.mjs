// A display preference only. The paper wallet and its storage key are never touched.
export const FOCUS_KEY='asiri.design.focus-layout.v1';
export const FOCUS_PANELS=['chart','ticket','risk','logic','allocation','journal'];
export function normalizeLayout(raw){
 const order=Array.isArray(raw?.order)?[...new Set(raw.order.filter(x=>FOCUS_PANELS.includes(x)))]:[];
 const hidden=Array.isArray(raw?.hidden)?[...new Set(raw.hidden.filter(x=>FOCUS_PANELS.includes(x)&&x!=='chart'))]:['allocation','journal'];
 return{version:1,order:[...order,...FOCUS_PANELS.filter(x=>!order.includes(x))],hidden,wide:raw?.wide===true,mode:raw?.mode==='classic'?'classic':'focus'};
}
const labels={chart:'الرسم اليومي',ticket:'خطة التجربة',risk:'خريطة المخاطرة',logic:'أدلة الحساب',allocation:'توزيع الرصيد',journal:'المراكز والسجل'};
export function createFocusWorkspace(host){
 const $=id=>document.getElementById(id),grid=$('focus-grid'),settings=$('focus-settings-list');
 let layout;try{layout=normalizeLayout(JSON.parse(localStorage.getItem(FOCUS_KEY)))}catch{layout=normalizeLayout(null)}
 const sources={chart:host.querySelector('#mp-panel-chart>.mp-surface'),ticket:host.querySelector('.mp-ticket'),risk:host.querySelector('.mp-journey-card'),logic:host.querySelector('.manual-plan'),allocation:host.querySelector('.mp-allocation'),journal:host.querySelector('.mp-journal-grid')};
 const panels=new Map();let active=false;
 const status=text=>{$('focus-save-status').textContent=text;};
 function save(){try{localStorage.setItem(FOCUS_KEY,JSON.stringify(layout));status('حُفظ ترتيب مساحتك على هذا الجهاز.')}catch{status('تعذر حفظ التفضيل؛ التغيير متاح لهذه الزيارة فقط.')}}
 function move(key,delta){const i=layout.order.indexOf(key),j=i+delta;if(j<0||j>=layout.order.length)return;[layout.order[i],layout.order[j]]=[layout.order[j],layout.order[i]];apply();save();panels.get(key).shell.querySelector(`[data-move="${delta}"]`).focus();}
 for(const key of FOCUS_PANELS){
  const content=sources[key],anchor=document.createComment(`focus home: ${key}`);content.before(anchor);
  const shell=document.createElement('section');shell.className=`focus-widget focus-widget-${key}`;shell.dataset.focusPanel=key;shell.setAttribute('aria-label',labels[key]);
  const head=document.createElement('div');head.className='focus-widget-tools';
  const title=document.createElement('span');title.textContent=labels[key];head.append(title);
  const controls=document.createElement('div');
  for(const[delta,glyph,word]of [[-1,'↑','تقديم'],[1,'↓','تأخير']]){const b=document.createElement('button');b.type='button';b.dataset.move=delta;b.textContent=glyph;b.setAttribute('aria-label',`${word} ${labels[key]}`);b.addEventListener('click',()=>move(key,delta));controls.append(b);}
  head.append(controls);shell.append(head);panels.set(key,{content,anchor,shell});
  const label=document.createElement('label'),checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.dataset.focusToggle=key;checkbox.disabled=key==='chart';checkbox.addEventListener('change',()=>{layout.hidden=checkbox.checked?layout.hidden.filter(x=>x!==key):[...new Set([...layout.hidden,key])];apply();save()});label.append(checkbox,document.createTextNode(labels[key]));settings.append(label);
 }
 function apply(){
  grid.classList.toggle('focus-wide',layout.wide);$('focus-wide').setAttribute('aria-pressed',String(layout.wide));
  for(const key of layout.order){const {shell}=panels.get(key);shell.hidden=layout.hidden.includes(key);grid.append(shell);const i=layout.order.indexOf(key);shell.querySelector('[data-move="-1"]').setAttribute('aria-disabled',String(i===0));shell.querySelector('[data-move="1"]').setAttribute('aria-disabled',String(i===layout.order.length-1));}
  settings.querySelectorAll('input').forEach(c=>c.checked=!layout.hidden.includes(c.dataset.focusToggle));
 }
 function activate(on){if(on===active)return;active=on;for(const{content,anchor,shell}of panels.values()){if(on)shell.append(content);else anchor.after(content);}if(on)apply();}
 $('focus-wide').addEventListener('click',()=>{layout.wide=!layout.wide;apply();save()});
 $('focus-reset').addEventListener('click',()=>{layout={...normalizeLayout(null),mode:layout.mode};apply();save()});
 function rememberView(name){const mode=name==='focus'?'focus':'classic';if(layout.mode!==mode){layout.mode=mode;save();}}
 // Reuse the exact chart-point input and its existing data/update handler.
 const chart=$('manual-chart');
 function inspect(e){if(e.type==='pointermove'&&e.pointerType!=='mouse')return;const slider=$('manual-chart-point'),svg=chart.querySelector('svg');if(slider.disabled||!svg)return;const r=svg.getBoundingClientRect();if(!r.width||!r.height)return;const box=svg.getAttribute('viewBox').split(/\s+/).map(Number),width=box[2],height=box[3];if(!width||!height)return;const scale=Math.min(r.width/width,r.height/height),left=r.left+(r.width-width*scale)/2;const fraction=Math.max(0,Math.min(1,((e.clientX-left)/scale-12)/(width-12-65)));const index=Math.round(Number(slider.min)+fraction*(Number(slider.max)-Number(slider.min)));if(Number(slider.value)!==index){slider.value=index;slider.dispatchEvent(new Event('input',{bubbles:true}));}}
 chart.addEventListener('pointermove',inspect);chart.addEventListener('pointerdown',inspect);
 apply();return{activate,rememberView,defaultView:()=>layout.mode==='focus'?'focus':'overview'};
}
