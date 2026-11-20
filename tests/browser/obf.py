# Browser check for Open Board Format export and import (v0.15). Needs a static server.
import sys, zipfile, io, json, tempfile, os
from playwright.sync_api import sync_playwright
U=(sys.argv[1] if len(sys.argv)>1 else "http://localhost:8765")+"/index.html"
ok=0; bad=0
def t(n,c):
  global ok,bad; ok+=bool(c); bad+=not c; print(("ok  " if c else "FAIL"),n)
with sync_playwright() as p:
  b=p.chromium.launch(); pg=b.new_page(accept_downloads=True); errs=[]; pg.on("pageerror",lambda e:errs.append(str(e)))
  pg.goto(U); pg.wait_for_timeout(800)
  with pg.expect_download() as d: pg.evaluate("document.getElementById('btnObfExport').click()")
  path=d.value.path(); z=zipfile.ZipFile(path)
  t("export downloads a valid .obz", z.testzip() is None and "manifest.json" in z.namelist() and d.value.suggested_filename.endswith(".obz"))
  core=json.loads(z.read("boards/core.obf")); t("core board has buttons and a grid", len(core["buttons"])>30 and core["grid"]["columns"]==6)
  buf=io.BytesIO(); w=zipfile.ZipFile(buf,"w",zipfile.ZIP_DEFLATED)
  w.writestr("manifest.json",json.dumps({"format":"open-board-0.1","root":"boards/x.obf"}))
  w.writestr("boards/x.obf",json.dumps({"format":"open-board-0.1","id":"x","name":"Park","buttons":[{"id":"1","label":"zipline"},{"id":"2","label":"slide"},{"id":"3","label":"want"}],"grid":{"rows":1,"columns":3,"order":[["1","2","3"]]}}))
  w.close(); f=os.path.join(tempfile.mkdtemp(),"park.obz"); open(f,"wb").write(buf.getvalue())
  pg.set_input_files("#obfForm input[type=file]",f); pg.select_option("#obfFolder","play") if pg.locator("#obfFolder option[value=play]").count() else None
  pg.evaluate("document.getElementById('obfForm').requestSubmit()"); pg.wait_for_timeout(800)
  st=pg.text_content("#obfStatus"); t("import adds new words and skips known ones: "+st, st.startswith("Added 2 words"))
  cust=pg.evaluate("JSON.parse(localStorage.getItem('luminaac:custom'))"); t("words saved on this device", [c["w"] for c in cust][-2:]==["zipline","slide"])
  bj=os.path.join(tempfile.mkdtemp(),"bad.obf"); open(bj,"w").write('{"hello":1}')
  pg.set_input_files("#obfForm input[type=file]",bj); pg.evaluate("document.getElementById('obfForm').requestSubmit()"); pg.wait_for_timeout(400)
  t("a wrong file gives a plain message", "isn't an Open Board Format board" in pg.text_content("#obfStatus"))
  t("no page errors", not errs)
print(f"{ok} / {ok+bad}"); sys.exit(1 if bad else 0)
