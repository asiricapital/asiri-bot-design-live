import fs from 'node:fs/promises';

const path = new URL('./v62.js', import.meta.url);
let source = await fs.readFile(path, 'utf8');
const marker = 'ASIRI_BROKER_MOBILE_HEADER_FIX_V657';

if (!source.includes(marker)) {
  source += `

// ASIRI_BROKER_MOBILE_HEADER_FIX_V657
(function installBrokerMobileHeaderFixV657(){
  const apply=()=>{
    if(document.querySelector('#broker657HeaderFix'))return;
    const style=document.createElement('style');
    style.id='broker657HeaderFix';
    style.textContent=\`
      html{scroll-padding-top:150px}
      #brokergateway{
        position:relative;
        padding-top:28px !important;
        scroll-margin-top:150px;
        overflow:visible !important;
      }
      #brokergateway > .page-title{
        position:relative;
        z-index:1;
        margin-top:0 !important;
        margin-bottom:22px !important;
        padding-top:0 !important;
        overflow:visible !important;
      }
      #brokergateway > .page-title > div{min-width:0}
      #brokergateway .broker62-shell{position:relative;z-index:1}
      @media (max-width:900px){
        body.broker657-active .main-nav{
          position:relative !important;
          top:auto !important;
          inset:auto !important;
          transform:none !important;
          z-index:10 !important;
          box-shadow:none !important;
        }
        body.broker657-active .app-shell,
        body.broker657-active main{
          overflow:visible !important;
        }
      }
      @media (max-width:760px){
        html{scroll-padding-top:24px}
        #brokergateway{
          padding-top:18px !important;
          scroll-margin-top:24px !important;
        }
        #brokergateway > .page-title{
          display:flex !important;
          flex-direction:column !important;
          align-items:stretch !important;
          gap:14px !important;
          padding-inline:4px !important;
        }
        #brokergateway > .page-title h2{
          line-height:1.35 !important;
          margin-top:6px !important;
        }
        #brokergateway > .page-title .broker62-readonly{
          align-self:flex-start;
          max-width:100%;
          white-space:normal;
        }
      }
    \`;
    document.head.appendChild(style);

    const syncBrokerActive=()=>{
      const page=document.querySelector('#brokergateway');
      document.body.classList.toggle('broker657-active',Boolean(page?.classList.contains('active')));
    };

    const openBrokerAtTop=()=>{
      const page=document.querySelector('#brokergateway');
      if(!page)return;
      syncBrokerActive();
      requestAnimationFrame(()=>{
        page.scrollIntoView({behavior:'instant',block:'start'});
        window.scrollBy({top:-12,left:0,behavior:'instant'});
      });
    };

    document.querySelectorAll('[data-page]').forEach(button=>{
      button.addEventListener('click',()=>{
        setTimeout(syncBrokerActive,0);
        if(button.getAttribute('data-page')==='brokergateway')setTimeout(openBrokerAtTop,0);
      });
    });

    const observer=new MutationObserver(()=>{
      const page=document.querySelector('#brokergateway');
      syncBrokerActive();
      if(page?.classList.contains('active')&&page.dataset.topAligned!=='1'){
        page.dataset.topAligned='1';
        openBrokerAtTop();
      }
      if(page&&!page.classList.contains('active'))delete page.dataset.topAligned;
    });
    observer.observe(document.body,{subtree:true,attributes:true,attributeFilter:['class']});

    syncBrokerActive();
    if(document.querySelector('#brokergateway')?.classList.contains('active'))openBrokerAtTop();
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',apply,{once:true});
  else apply();
})();
`;
  await fs.writeFile(path, source, 'utf8');
}

console.log('broker-v6.5.8-patch',{applied:true,mobileHeaderSpacingFixed:true,brokerTabScrollReset:true,brokerMobileStickyNavDisabled:true});
