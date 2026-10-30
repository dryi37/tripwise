'use strict';
(function(global){
  let timer=null,controller=null,sequence=0;
  const escapeText=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function close(input,list){list.replaceChildren();input.setAttribute('aria-expanded','false')}
  document.addEventListener('input',event=>{
    const input=event.target;if(input.id!=='f-destination')return;
    input.dataset.destinationSelected='false';input.removeAttribute('aria-invalid');
    const list=document.querySelector('#destination-results');if(!list)return;
    clearTimeout(timer);controller?.abort();const current=++sequence,query=input.value.trim();close(input,list);
    if(query.length<2)return;
    timer=setTimeout(async()=>{
      controller=new AbortController();
      try{
        const response=await global.TripwiseApi.searchDestinations(query,controller.signal);
        if(current!==sequence||!list.isConnected)return;
        for(const destination of response.data||[]){
          const button=document.createElement('button');button.type='button';button.className='destination-result';button.setAttribute('role','option');button.setAttribute('aria-selected','false');button.dataset.type=destination.type||'city';button.dataset.destination=destination.destination;button.dataset.countryCode=destination.countryCode;button.dataset.country=destination.country;
          button.innerHTML='<strong>'+escapeText(destination.city)+'</strong><span>'+escapeText(destination.country)+'</span>';
          list.append(button);
        }
        if(!list.children.length){const empty=document.createElement('p');empty.className='destination-status';empty.textContent='Không tìm thấy thành phố phù hợp với tên đã nhập.';list.append(empty)}
        input.setAttribute('aria-expanded','true');
      }catch(error){
        if(current!==sequence||error?.name==='AbortError')return;
        const status=document.createElement('p');status.className='destination-status';status.textContent=error?.code==='PLACE_LOOKUP_UNAVAILABLE'?'Tìm địa điểm tạm thời không khả dụng. Hãy thử lại.':'Không thể tìm địa điểm lúc này.';list.replaceChildren(status);input.setAttribute('aria-expanded','true');
      }
    },450);
  });
  document.addEventListener('pointerdown',event=>{if(event.target.closest('.destination-result'))event.preventDefault()});
  document.addEventListener('click',event=>{
    const button=event.target.closest('.destination-result');if(!button)return;
    const input=document.querySelector('#f-destination'),list=document.querySelector('#destination-results');if(!input||!list)return;
    input.value=button.dataset.destination;input.dataset.destinationSelected='true';close(input,list);input.dispatchEvent(new Event('input',{bubbles:true}));input.dataset.destinationSelected='true';input.dispatchEvent(new Event('change',{bubbles:true}));
  });
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&event.target.id==='f-destination'){const list=document.querySelector('#destination-results');if(list)close(event.target,list)}});
})(window);
