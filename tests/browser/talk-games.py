import sys,time
from playwright.sync_api import sync_playwright
U=(sys.argv[1] if len(sys.argv)>1 else "http://localhost:8765")+"/index.html"
INIT="""
window.__live=[];const g=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
navigator.mediaDevices.getUserMedia=async(c)=>{await new Promise(r=>setTimeout(r,400));const s=await g(c);window.__live.push(...s.getTracks());return s};
localStorage.setItem('luminaac:sound-dev','1');
"""
STATE="""(()=>{const open=[...document.querySelectorAll('dialog[open]')].map(d=>d.id);
const live=window.__live.filter(t=>t.readyState==='live').length;
const navs=[...document.querySelectorAll('.nav-btn')].filter(b=>b.offsetParent);let dead=[];
for(const b of navs){const r=b.getBoundingClientRect();const e=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);if(!b.contains(e))dead.push(b.dataset.view||b.id)}
return {open,live,dead,inert:document.querySelectorAll('[inert]').length}})()"""
with sync_playwright() as p:
  b=p.chromium.launch(args=["--use-fake-ui-for-media-stream","--use-fake-device-for-media-stream","--autoplay-policy=no-user-gesture-required"])
  c=b.new_context(**p.devices["iPhone 13"]); c.add_init_script(INIT)
  pg=c.new_page(); errs=[]; pg.on("pageerror",lambda e:errs.append(str(e)))
  pg.goto(U); pg.wait_for_timeout(800)
  pg.evaluate("""(()=>{const d=JSON.parse(localStorage.getItem('luminaac:bridge')||'{}');d.games={...(d.games||{}),settings:{mic:true},goals:[],plays:[]};localStorage.setItem('luminaac:bridge',JSON.stringify(d))})()""")
  pg.reload(); pg.wait_for_timeout(800)
  pg.evaluate("document.querySelectorAll('dialog[open]').forEach(d=>d.close())")
  bad=0
  for label in ["Copy my sound","First sounds","My turn, your turn","Who says that?"]:
    for rnd in range(3):
      pg.locator(".nav-btn[data-view=play]").tap(); pg.wait_for_timeout(200)
      t=pg.locator("#mvGames button",has_text=label)
      try: t.tap(timeout=3000)
      except Exception as e: print("CANNOT OPEN",label,rnd,pg.evaluate(STATE)); bad+=1; continue
      pg.wait_for_timeout(300)
      if label=="First sounds":
        # pick right answer by trying all
        for ch in pg.locator("#mvGStage .mv-choice").all():
          ch.tap(); pg.wait_for_timeout(100)
          if pg.locator("#mvGRow button",has_text="say it").count(): break
      m=pg.locator("#mvGRow button",has_text="icrophone").or_(pg.locator("#mvGRow button",has_text="say it"))
      if m.count(): m.first.tap()
      if label=="My turn, your turn": pg.wait_for_timeout(2500)
      pg.wait_for_timeout(150 if rnd==0 else 1200)
      0 and print("pre",label,rnd,pg.evaluate(STATE),pg.evaluate("(()=>{const d=document.getElementById('mvGame'),c=document.getElementById('mvGClose');return [d.open,getComputedStyle(d).display,JSON.stringify(c.getBoundingClientRect()),innerHeight,d.scrollHeight,d.clientHeight]})()"))
      pg.locator("#mvGClose").tap(timeout=4000); pg.wait_for_timeout(7000 if rnd==0 else 500)
      s=pg.evaluate(STATE); flag = s["open"] or s["live"] or s["dead"]
      print(label,rnd,s, "<<< PROBLEM" if flag else ""); bad+=bool(flag)
  # stories
  pg.locator(".nav-btn[data-view=play]").tap()
  for rnd in range(3):
    t=pg.locator("#mvStories button").first
    if not t.count(): print("no stories"); break
    t.tap(); pg.wait_for_timeout(300); pg.locator("#mvPlayer .mv-close").tap(); pg.wait_for_timeout(200)
    s=pg.evaluate(STATE); print("story",rnd,s); bad+=bool(s["open"] or s["dead"])
  for rnd in range(3):
    for i in range(pg.locator("#spTiles button").count()):
      pg.locator(".nav-btn[data-view=play]").tap(); pg.wait_for_timeout(150)
      pg.locator("#spTiles button").nth(i).tap(); pg.wait_for_timeout(500)
      pg.keyboard.press("Escape"); pg.wait_for_timeout(300)
      cl=pg.locator("#sp button",has_text="Close")
      if cl.count() and cl.first.is_visible(): cl.first.tap(); pg.wait_for_timeout(300)
      s=pg.evaluate(STATE); print("soundpath",i,rnd,s); bad+=bool(s["open"] or s["dead"] or s["live"])
  for v in ["talk","calm","plans","play"]:
    pg.locator(f".nav-btn[data-view={v}]").tap(timeout=3000)
    vis=pg.evaluate(f"!document.getElementById('view-{v}').hidden"); print("nav",v,vis); bad+=not vis
  print("bad",bad,"errors",errs); sys.exit(1 if bad or errs else 0)
