import markdown,re
md=open('docs/CARETAKER-GUIDE.md',encoding='utf-8').read().replace('../screenshots/','screenshots/')
md=md.replace('<div class="one-pager">','<div class="one-pager" markdown="1">')
body=markdown.markdown(md,extensions=['md_in_html','sane_lists'])
body=re.sub(r'<h1>.*?</h1>','',body,count=1)
body=re.sub(r'<p>(<img [^>]+>)</p>',lambda m:m.group(1),body)
body=re.sub(r'<img alt="([^"]*)" src="([^"]*)" />',r'<figure><img src="\2" alt="\1" loading="lazy" /><figcaption>\1</figcaption></figure>',body)
html=f'''<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Caretaker guide · LuminAAC</title>
  <meta name="description" content="A plain-language guide to LuminAAC for parents and caregivers." />
  <meta name="theme-color" content="#22313d" />
  <link rel="icon" href="favicon.svg" type="image/svg+xml" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible+Next:wght@400;600;800&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="tokens.css" />
  <link rel="stylesheet" href="brand/brand-tokens.css" />
  <link rel="stylesheet" href="guide.css" />
</head>
<body>
  <a class="skip" href="#main">Skip to the guide</a>
  <header class="g-top">
    <a class="g-logo" href="bridge.html" aria-label="LuminAAC, back to the Bridge"><img src="brand/logo-mark.svg" alt="" width="40" height="40" /><span>LuminAAC</span></a>
    <nav class="g-actions" aria-label="Guide actions">
      <a class="g-pill" href="#quick-start">Quick start</a>
      <button class="g-pill" type="button" onclick="window.print()">Print this guide</button>
      <a class="g-pill" href="bridge.html">Back to the Bridge</a>
    </nav>
  </header>
  <main id="main" tabindex="-1">
    <div class="g-hero">
      <h1>Caretaker guide</h1>
      <p class="g-lede">Everything you need to help your child be heard, in plain words.</p>
    </div>
    {body}
    <footer class="g-foot"><p>LuminAAC caretaker guide, version 0.12 (November 2026). Live app: <a href="https://luminaac-web.vercel.app">luminaac-web.vercel.app</a>. Fallback pictures: OpenMoji (openmoji.org), CC BY-SA 4.0. Font: Atkinson Hyperlegible Next.</p></footer>
  </main>
</body>
</html>
'''
open('guide.html','w',encoding='utf-8').write(html)
