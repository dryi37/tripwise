'use strict';
(function(global){
  let active=null,sequence=0;
  function distinctRoutePoints(points){
    return points.filter((point,index)=>index===0||point.latitude.toFixed(5)!==points[index-1].latitude.toFixed(5)||point.longitude.toFixed(5)!==points[index-1].longitude.toFixed(5));
  }
  function routeDistanceLabel(meters){
    return meters<1000?Math.round(meters/10)*10+' m':(meters/1000).toLocaleString('vi-VN',{maximumFractionDigits:1})+' km';
  }
  function addRouteStatus(map,text){
    const status=document.createElement('div');status.className='map-route-status';status.setAttribute('role','status');status.textContent=text;map.getContainer().append(status);return status;
  }
  async function drawDrivingRoute(map,points,controller,token){
    const waypoints=distinctRoutePoints(points);if(waypoints.length<2)return;
    const status=addRouteStatus(map,'Đang tìm tuyến đường…');
    const coordinates=waypoints.map(point=>point.longitude+','+point.latitude).join(';');
    const url='https://router.project-osrm.org/route/v1/driving/'+coordinates+'?steps=true&geometries=geojson&overview=false';
    try{
      const response=await fetch(url,{signal:controller.signal});if(!response.ok)throw new Error('OSRM HTTP '+response.status);
      const result=await response.json(),route=result.routes?.[0];
      if(result.code!=='Ok'||!route||!Array.isArray(route.legs)||route.legs.length!==waypoints.length-1)throw new Error('OSRM route unavailable');
      if(!active||active.token!==token)return;
      const preparedLegs=route.legs.map(leg=>{
        const coordinates=[];
        for(const step of leg.steps||[])for(const pair of step.geometry?.coordinates||[]){
          if(!Array.isArray(pair)||!Number.isFinite(pair[0])||!Number.isFinite(pair[1]))continue;
          const last=coordinates[coordinates.length-1];if(!last||last[0]!==pair[0]||last[1]!==pair[1])coordinates.push(pair);
        }
        if(coordinates.length<2||!Number.isFinite(leg.distance))return null;
        const latLngs=coordinates.map(([longitude,latitude])=>[latitude,longitude]);
        return {distance:leg.distance,latLngs};
      });
      if(preparedLegs.some(leg=>!leg))throw new Error('OSRM route geometry unavailable');
      status.remove();
      const routeBounds=[],routeColor=getComputedStyle(document.documentElement).getPropertyValue('--green').trim()||'#004832',idleRouteColor='color-mix(in srgb, '+routeColor+' 52%, white)';
      preparedLegs.forEach(({distance,latLngs})=>{
        for(const latLng of latLngs)routeBounds.push(latLng);
        const line=global.L.polyline(latLngs,{color:idleRouteColor,weight:5,opacity:.9,lineCap:'round',lineJoin:'round'}).addTo(map);
        line.bindTooltip(routeDistanceLabel(distance),{permanent:true,direction:'center',className:'map-route-distance'});
        line.on('mouseover',()=>line.setStyle({color:routeColor,opacity:.98,weight:6}).bringToFront());
        line.on('mouseout',()=>line.setStyle({color:idleRouteColor,opacity:.9,weight:5}));
      });
      if(routeBounds.length>1)map.fitBounds(routeBounds,{padding:[32,32]});
    }catch(error){
      if(error?.name==='AbortError'||!active||active.token!==token)return;
      status.textContent='Tuyến đường hiện chưa khả dụng.';status.classList.add('is-error');
    }
  }
  function mount(tripId,dayIndex){
    const host=document.querySelector('#itinerary-map');if(!host){dispose();return}
    if(active?.tripId===tripId&&active.dayIndex===dayIndex&&active.host===host)return;
    dispose();const token=++sequence,controller=new AbortController();active={tripId,dayIndex,host,controller,token};
    host.innerHTML='<div class="map-message">Đang tải địa điểm trong ngày…</div>';
    global.TripwiseApi.getDayMap(tripId,dayIndex,controller.signal).then(response=>{
      if(!active||active.token!==token||!host.isConnected)return;
      for(const label of document.querySelectorAll('[data-place-for]')){
        const place=(response.data||[]).find(item=>item.activityId===label.dataset.placeFor);if(!place)continue;
        if(place.status==='resolved'){
          label.textContent=place.displayName;label.href=place.openStreetMapUri||'#';label.target='_blank';label.rel='noopener noreferrer';label.setAttribute('aria-label','Mở '+place.displayName+' trên OpenStreetMap');
        }else{label.textContent=place.status==='outside_destination'?'Địa điểm ngoài khu vực chuyến đi · hãy chọn lại':'Chưa liên kết địa điểm';label.removeAttribute('href')}
      }
      const points=(response.data||[]).filter(item=>item.status==='resolved'&&Number.isFinite(item.latitude)&&Number.isFinite(item.longitude));
      const mapCount=document.querySelector('#itinerary-map-count');
      const count=new Set(points.map(point=>point.latitude.toFixed(5)+','+point.longitude.toFixed(5))).size;
      if(mapCount)mapCount.textContent=count+' vị trí trên bản đồ';
      const dayCount=document.querySelector('#itinerary-day-place-count');if(dayCount?.lastChild)dayCount.lastChild.textContent=count+' vị trí trên bản đồ';
      host.replaceChildren();
      if(!global.L){throw new Error('Không tải được thư viện bản đồ.')}
      const initial=points[0]?{latitude:points[0].latitude,longitude:points[0].longitude}:response.center;
      if(!initial){const empty=document.createElement('div');empty.className='map-message';empty.textContent='Chưa xác định được trung tâm khu vực chuyến đi.';host.append(empty);return}
      const map=global.L.map(host,{scrollWheelZoom:false}).setView([initial.latitude,initial.longitude],points.length?13:11);
      global.L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a>'}).addTo(map);
      active.map=map;
      if(!points.length){const empty=document.createElement('div');empty.className='map-empty-note';const results=response.data||[];empty.textContent=results.some(item=>item.status==='outside_destination')?'Địa điểm đã chọn nằm ngoài khu vực chuyến đi. Hãy chọn lại từ timeline.':results.length?'Chưa có địa điểm OpenStreetMap hợp lệ. Hãy chọn địa điểm từ timeline.':'Chưa có hoạt động trong ngày này.';host.append(empty);setTimeout(()=>{if(active?.token===token)map.invalidateSize()},0);return}
      const groups=new Map();for(const point of points){const key=point.latitude.toFixed(5)+','+point.longitude.toFixed(5);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(point)}
      const bounds=[];let number=0;
      for(const group of groups.values()){
        number++;const first=group[0],position=[first.latitude,first.longitude];bounds.push(position);
        const icon=global.L.divIcon({className:'',html:'<button type="button" class="map-pin" aria-label="Mở địa điểm '+number+'"><span>'+number+'</span></button>',iconSize:[46,50],iconAnchor:[23,45]});
        const marker=global.L.marker(position,{icon,title:first.displayName||'Địa điểm đã chọn'}).addTo(map);
        const content=document.createElement('div');content.className='map-info';
        for(const point of group){const section=document.createElement('section'),title=document.createElement('strong'),address=document.createElement('div'),reason=document.createElement('p');title.textContent=point.displayName||'Địa điểm đã chọn';address.textContent=point.formattedAddress||'';reason.textContent=point.selectionReason||'Chưa ghi lý do chọn địa điểm.';section.append(title,address,reason);content.append(section)}
        marker.bindPopup(content,{autoClose:true,closeOnClick:true});
        marker.on('mouseover',()=>marker.openPopup());
        marker.on('mouseout',()=>marker.closePopup());
        marker.on('focus',()=>marker.openPopup());
        marker.on('blur',()=>marker.closePopup());
      }
      drawDrivingRoute(map,points,controller,token);
      if(bounds.length>1)map.fitBounds(bounds,{padding:[32,32]});
      const unresolved=(response.data||[]).filter(item=>item.status==='unresolved').length;
      const outside=(response.data||[]).filter(item=>item.status==='outside_destination').length;
      if(unresolved||outside){const note=document.createElement('div');note.className='map-partial-status';const parts=[];if(count)parts.push('Đã hiển thị '+count+' địa điểm');if(outside)parts.push(outside+' địa điểm ngoài khu vực');if(unresolved)parts.push(unresolved+' hoạt động chưa liên kết địa điểm');note.textContent=parts.join(' · ')+'.';host.append(note)}
      setTimeout(()=>{if(active?.token===token)map.invalidateSize()},0);
    }).catch(error=>{
      if(!active||active.token!==token||error?.name==='AbortError')return;
      for(const label of document.querySelectorAll('[data-place-for]'))if(label.textContent.startsWith('Đang tải'))label.textContent='Địa điểm chưa tải được';host.replaceChildren();
      const message=document.createElement('p'),retry=document.createElement('button');message.className='map-message map-error';message.textContent=error.message||'Bản đồ hiện chưa khả dụng.';retry.type='button';retry.className='btn';retry.textContent='Thử tải lại';retry.addEventListener('click',()=>{dispose();mount(tripId,dayIndex)});host.append(message,retry);
    });
  }
  function dispose(){if(active){active.controller.abort();active.map?.remove();active=null}sequence++}
  global.TripwiseItineraryMap={mount,dispose};
})(window);
