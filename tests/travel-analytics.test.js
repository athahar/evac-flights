import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
const source=readFileSync(new URL('../public/travel.js',import.meta.url),'utf8');
function fixture(optOut=false){
 const captures=[],requests=[],listeners={},windowListeners={},storage=new Map([['evac_posthog_distinct_id','existing-dxb-visitor']]);
 class Element{constructor(link){this.link=link;}closest(){return this.link;}}
 const context={URL,URLSearchParams,AbortController,setTimeout,clearTimeout,crypto:webcrypto,Element,
  location:new URL('https://www.dxbflights.info/dubai-7-day-itinerary.html?email=private@example.com'),
  navigator:{doNotTrack:optOut?'1':'0'},window:{addEventListener:(name,fn)=>{windowListeners[name]=fn;}},
  document:{title:'Seven days in Dubai',documentElement:{scrollHeight:2000},addEventListener:(name,fn)=>{listeners[name]=fn;}},
  innerHeight:800,scrollY:1000,requestAnimationFrame:fn=>fn(),
  localStorage:{getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,value)},
  fetch:async(url,options={})=>{requests.push(url);if(url==='/api/public-config')return{ok:true,json:async()=>({posthogKey:'phc_dxbfixture',posthogHost:'https://us.i.posthog.com'})};captures.push(JSON.parse(options.body));return{ok:true};}
 };
 vm.runInNewContext(source,context);
 return{captures,requests,scroll:()=>windowListeners.scroll(),click:(href,esim=false)=>listeners.click({target:new Element({href,dataset:esim?{esimLink:'AE',placement:'guide'}:{},hasAttribute:()=>esim,closest:()=>null})})};
}
const settle=()=>new Promise(resolve=>setImmediate(resolve));
test('DXB page, navigation, eSIM and reading events use only the existing DXB project',async()=>{
 const f=fixture();f.click('https://www.dxbflights.info/dubai-5-day-itinerary.html');await settle();
 f.click('https://offwegosim.com/united-arab-emirates-esim?utm_source=dxbflights',true);
 f.click('https://www.dxbflights.info/flights.html');f.click('https://www.dxbflights.info/dubai-7-day-itinerary.html#day-2');f.scroll();f.scroll();
 for(const event of ['$pageview','page_view','itinerary_clicked','esim_link_clicked','flight_search_clicked','guide_section_clicked','guide_read_progress'])assert.ok(f.captures.some(e=>e.event===event),event);
 assert.ok(f.captures.every(e=>e.api_key==='phc_dxbfixture'&&e.distinct_id==='existing-dxb-visitor'));
 assert.equal(f.captures.filter(e=>e.event==='$pageview').length,1);
 assert.equal(f.captures.filter(e=>e.event==='guide_read_progress'&&e.properties.percent===50).length,1);
 assert.equal(JSON.stringify(f.captures).includes('private@example.com'),false);
 assert.equal(f.captures.some(e=>e.event.startsWith('Widget')),false);
});
test('DXB opt-out prevents analytics requests while links remain usable',async()=>{
 const f=fixture(true);f.click('https://offwegosim.com/united-arab-emirates-esim',true);await settle();assert.equal(f.requests.length,0);assert.equal(f.captures.length,0);
});
