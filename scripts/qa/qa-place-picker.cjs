const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const source = fs.readFileSync('frontend/place-picker.js', 'utf8');
const timers = [];
const listeners = {};
const requests = [];
const list = { children: [], isConnected: true, replaceChildren(){this.children=[]}, append(node){this.children.push(node)}, set innerHTML(value){this.html=value;this.children=[]} };
const document = {
  addEventListener(type, handler){listeners[type]=handler},
  createElement(){return {dataset:{},attrs:{},setAttribute(k,v){this.attrs[k]=v},innerHTML:'',type:'',className:''}},
};
const api = { searchPlaces(_trip, query, signal){return new Promise((resolve,reject)=>{requests.push({query,signal,resolve,reject})})} };
const context = {window:{TripwiseApi:api},document,AbortController,clearTimeout(){},setTimeout(fn){timers.push(fn);return timers.length}};
vm.runInNewContext(source, context);
const googlePlaceIdInput={value:''};
context.window.TripwisePlacePicker.search({tripId:'trip',query:'Old place',list,googlePlaceIdInput});
timers.shift()();
context.window.TripwisePlacePicker.search({tripId:'trip',query:'New place',list,googlePlaceIdInput});
timers.shift()();
requests[0].resolve({data:[{googlePlaceId:'old-place-id',displayName:'Old branch',formattedAddress:'Old address'}]});
requests[1].resolve({data:[{googlePlaceId:'new-place-id',displayName:'New branch',formattedAddress:'New address'}]});
setImmediate(()=>{
  assert.equal(list.children.length,1,'stale search response must be discarded');
  assert.equal(list.children[0].dataset.googlePlaceId,'new-place-id','latest Google Place ID must be shown');
  googlePlaceIdInput.value='selected-place-id';
  const input={id:'place-search',value:'Typed new venue',closest:()=>({querySelector:(selector)=>selector==='#google-place-id'?googlePlaceIdInput:{dataset:{selected:'true'}}})};
  listeners.input({target:input});
  assert.equal(googlePlaceIdInput.value,'','typing invalidates the selected Google Place ID');
  console.log('qa-place-picker: stale results and Place ID invalidation passed');
});
