// Re-records the website walkthroughs (welcome/media) from the real app.
// Usage: python3 -m http.server 8765 (repo root), then:
//   node tools/record-walkthroughs.js /tmp/rec [talk|calm|day|play|bridge]
// Then encode each raw .webm to welcome/media/<name>.mp4/.webm/.jpg (see DESIGN-SITE.md §7).
// Records walkthroughs of the real LuminAAC app with a visible "finger".
const {chromium}=require('playwright');
const OUT=process.argv[2], BASE="http://localhost:8765/", ONLY=process.argv[3];
const W=1180,H=820;
const FINGER=`addEventListener('DOMContentLoaded',()=>{const f=document.createElement('div');f.id='__f';
f.style.cssText='position:fixed;left:0;top:0;width:44px;height:44px;margin:-22px 0 0 -22px;border-radius:50%;background:rgba(242,179,61,.35);border:3px solid rgba(255,255,255,.95);box-shadow:0 0 0 2px rgba(28,38,48,.25),0 6px 18px rgba(0,0,0,.25);z-index:2147483647;pointer-events:none;transition:transform .55s cubic-bezier(.2,.7,.2,1),opacity .3s;transform:translate(${W*0.6}px,${H+60}px);opacity:0';
document.documentElement.appendChild(f);
window.__move=(x,y)=>{f.style.opacity=1;f.style.transform='translate('+x+'px,'+y+'px)'};
window.__press=()=>{f.animate([{scale:1},{scale:.7},{scale:1}],{duration:260});const r=document.createElement('div');
r.style.cssText='position:fixed;left:'+(f.getBoundingClientRect().left+22)+'px;top:'+(f.getBoundingClientRect().top+22)+'px;width:10px;height:10px;margin:-5px;border-radius:50%;border:3px solid #f2b33d;z-index:2147483646;pointer-events:none';
document.documentElement.appendChild(r);r.animate([{transform:'scale(1)',opacity:1},{transform:'scale(7)',opacity:0}],{duration:600}).onfinish=()=>r.remove()};
window.__hide=()=>{f.style.opacity=0}});
try{localStorage.setItem('luminaac:still','0')}catch(e){}`;
async function tap(pg,loc,wait=650){const el=pg.locator(loc).locator("visible=true").first();await el.scrollIntoViewIfNeeded();const b=await el.boundingBox();
 const x=b.x+b.width/2,y=b.y+b.height/2;await pg.evaluate(([x,y])=>__move(x,y),[x,y]);await pg.waitForTimeout(600);
 await pg.evaluate(()=>__press());await pg.waitForTimeout(120);await el.click({force:true});await pg.waitForTimeout(wait)}
const scenes={
 talk:async pg=>{await pg.goto(BASE+"index.html");await pg.waitForTimeout(900);
  await tap(pg,'.tile[data-w="I"]');await tap(pg,'.tile[data-w="want"]');
  await tap(pg,'.folder:has-text("Food")',900);
  const t=await pg.evaluate(()=>[...document.querySelectorAll('.tile')].filter(b=>b.offsetParent).map(b=>b.dataset.w).filter(Boolean).slice(0,30));console.log('food tiles',t);
  const pick=['juice','apple','cookie','water'].find(w=>t.includes(w))||t[2];
  await tap(pg,`.tile[data-w="${pick}"]`);
  await tap(pg,'#btnSpeak',1800);await pg.evaluate(()=>__hide());await pg.waitForTimeout(600)},
 calm:async pg=>{await pg.goto(BASE+"index.html");await pg.waitForTimeout(800);
  await tap(pg,'.nav-btn[data-view=calm]',900);await tap(pg,'.scale-btn:has-text("Big feelings")',1500);
  const btns=await pg.evaluate(()=>[...document.querySelectorAll('#view-calm button')].filter(b=>b.offsetParent).map(b=>b.innerText.trim().replace(/\s+/g,' ').slice(0,25)));console.log('calm',btns);
  const br=btns.find(s=>/breath/i.test(s));if(br)await tap(pg,`#view-calm button:has-text("${br.split(' ').slice(-1)[0]}")`,5000);
  await pg.evaluate(()=>__hide());await pg.waitForTimeout(800)},
 day:async pg=>{await pg.goto(BASE+"index.html");await pg.waitForTimeout(800);
  await tap(pg,'.nav-btn[data-view=plans]',900);await tap(pg,'.folder:has-text("Grocery")',900);
  const n=await pg.locator('#view-plans .check-btn').count();for(let i=0;i<Math.min(3,n);i++)await tap(pg,`#view-plans .check-btn >> nth=${i}`,700);
  await tap(pg,'.say-chip:has-text("I found it")',1600);await pg.evaluate(()=>__hide());await pg.waitForTimeout(600)},
 play:async pg=>{await pg.goto(BASE+"index.html");await pg.waitForTimeout(800);
  await tap(pg,'.nav-btn[data-view=play]',900);await tap(pg,'.mv-ptile:has-text("Lantern Sky")',2000);
  const ws=await pg.evaluate(()=>[...document.querySelectorAll('button')].filter(b=>b.offsetParent&&b.getBoundingClientRect().top>500).map(b=>b.dataset.w||b.innerText.trim()).filter(Boolean));console.log('lantern',ws);
  for(const w of ['I','want','go','look','like','more']){
    const pt=await pg.evaluate(w=>{const b=[...document.querySelectorAll('button')].find(b=>b.offsetParent&&b.getBoundingClientRect().top>500&&(b.dataset.w||b.innerText.trim())===w);if(!b)return null;const r=b.getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2]},w);
    if(!pt)continue;await pg.evaluate(p=>__move(p[0],p[1]),pt);await pg.waitForTimeout(550);await pg.evaluate(()=>__press());await pg.mouse.click(pt[0],pt[1]);await pg.waitForTimeout(1100)}
  await pg.waitForTimeout(1500);
  await pg.evaluate(()=>__hide());await pg.waitForTimeout(1200)},
 bridge:async pg=>{await pg.goto(BASE+"bridge.html");await pg.waitForTimeout(900);
  if(await pg.locator('#obSkip').isVisible())await pg.click('#obSkip');await pg.waitForTimeout(700);
  await pg.evaluate(()=>__move(700,560));await pg.waitForTimeout(500);
  for(let i=0;i<6;i++){await pg.mouse.wheel(0,110);await pg.waitForTimeout(160)}
  await pg.waitForTimeout(1200);await tap(pg,'button:has-text("Progress")',1700);
  for(let i=0;i<5;i++){await pg.mouse.wheel(0,110);await pg.waitForTimeout(160)}
  await pg.waitForTimeout(900);await tap(pg,'button:has-text("Circle")',1700);await tap(pg,'button:has-text("Home")',1300);await pg.evaluate(()=>__hide());await pg.waitForTimeout(500)}
};
(async()=>{const b=await chromium.launch({args:["--autoplay-policy=no-user-gesture-required"]});
 for(const [name,fn] of Object.entries(scenes)){if(ONLY&&ONLY!==name)continue;
  const ctx=await b.newContext({viewport:{width:W,height:H},recordVideo:{dir:OUT+'/raw-'+name,size:{width:W,height:H}}});
  await ctx.addInitScript(FINGER);const pg=await ctx.newPage();
  try{await fn(pg)}catch(e){console.log('ERR',name,e.message.split('\n')[0])}
  await pg.screenshot({path:`${OUT}/end-${name}.png`});await ctx.close();console.log('done',name)}
 await b.close()})();
