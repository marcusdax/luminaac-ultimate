/* The Luminous Field: the living background of the LuminAAC website.
   One full-screen WebGL fragment shader: a flower-of-life mandala with
   iridescent filaments and a flowing capillary filigree, lit from a warm
   heart. It is drawn in the spirit of visionary art, but kept light.
   The page scroll moves it from night (uDay 0) to morning (uDay 1).
   Taps send out ripples. Still mode / reduced motion renders one frame. */
(function () {
  "use strict";
  const canvas = document.getElementById("field");
  if (!canvas) return;
  const gl = canvas.getContext("webgl", { antialias: false, alpha: false, powerPreference: "high-performance", preserveDrawingBuffer: false });
  const api = { day: 0, dayTarget: 0, cx: 0.68, cy: 0.5, cxT: 0.68, cyT: 0.5, zoom: 1, zoomT: 1, glow: 1, glowT: 1, warm: 0, warmT: 0, ripple() {}, still: false, ok: !!gl };
  window.LuminField = api;
  if (!gl) { document.documentElement.classList.add("no-webgl"); return; }

  const vert = "attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}";
  const frag = `
precision highp float;
uniform vec2 uRes; uniform float uTime; uniform float uDay; uniform float uWarm;
uniform vec2 uCenter; uniform float uZoom; uniform vec2 uPointer;
uniform vec4 uRip[6]; uniform float uGlow;
#define PI 3.14159265
#define TAU 6.2831853
mat2 rot(float a){float c=cos(a),s=sin(a);return mat2(c,-s,s,c);}
float hash(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<4;i++){v+=a*noise(p);p=rot(.6)*p*2.03+3.1;a*=.5;}return v;}
vec3 iris(float t){return .55+.45*cos(TAU*(t+vec3(.0,.28,.62)));}
float glow(float d,float w){float g=w/(abs(d)+w);return g*g;}
/* distance to the nearest circle edge of a flower-of-life of radius R */
float flower(vec2 p,float R){
  vec2 q=vec2(p.x-p.y*.57735027,p.y*1.15470054)/R; /* to hex lattice coords */
  vec2 b=floor(q);float m=1e3;
  for(int i=-2;i<=2;i++)for(int j=-2;j<=2;j++){
    vec2 l=b+vec2(float(i),float(j));
    vec2 c=vec2(l.x+l.y*.5,l.y*.8660254)*R;
    if(length(c)>R*2.05)continue;
    m=min(m,abs(length(p-c)-R));
  }
  return m;
}
void main(){
  vec2 uv=(gl_FragCoord.xy-uCenter*uRes)/uRes.y/uZoom;
  float t=uTime;
  float r=length(uv), a=atan(uv.y,uv.x);
  vec2 pw=(gl_FragCoord.xy/uRes.y)-uPointer*vec2(uRes.x/uRes.y,1.);

  /* flowing capillary filigree: contour lines of a warped field */
  vec2 w=uv*2.2; w+=.35*vec2(fbm(w+t*.03),fbm(w-t*.025+7.));
  float f=fbm(w*1.3+fbm(w+t*.02));
  float cl=abs(fract(f*11.)-.5);
  float fil=glow(cl,.05)*.09*smoothstep(1.4,.15,r);

  /* inner and outer flower of life, slowly counter-rotating */
  float R1=.155;
  float fl1=flower(rot(t*.018)*uv,R1);
  float m1=smoothstep(R1*3.15,R1*2.9,r);
  float lines=glow(fl1,.0035)*m1*1.1;
  float fl2=flower(rot(-t*.011+.5236)*uv,R1*2.);
  lines+=glow(fl2,.003)*smoothstep(R1*5.4,R1*4.4,r)*smoothstep(R1*2.6,R1*3.3,r)*.35;

  /* bounding rings, breathing */
  float br=.5+.5*sin(t*.35);
  lines+=glow(r-R1*3.05,.004)*1.1+glow(r-R1*3.3-.004*br,.0025)*.7+glow(r-R1*5.5,.0025)*.4;

  /* radiant filaments */
  float ray=pow(.5+.5*cos(a*72.+fbm(vec2(r*4.,a*3.)+t*.06)*4.),40.);
  ray+=.6*pow(.5+.5*cos(a*24.-t*.05),60.);
  ray*=smoothstep(.04,.42,r)*exp(-r*2.2)*.8;

  /* the warm heart */
  float core=exp(-r*r*55.)*.95+exp(-r*3.4)*.18;

  /* ripples from taps */
  float rip=0.;
  for(int i=0;i<6;i++){vec4 R=uRip[i];float age=t-R.z;if(age<0.||age>6.)continue;
    vec2 d=(gl_FragCoord.xy/uRes.y)-R.xy*vec2(uRes.x/uRes.y,1.);
    rip+=glow(length(d)-age*.32,.004)*exp(-age*.7)*R.w;}

  float pointerHalo=exp(-dot(pw,pw)*18.)*.12;

  vec3 ir=iris(a/TAU+r*.9+t*.02);
  vec3 gold=vec3(1.,.76,.32), sky=vec3(.45,.75,1.);

  /* night */
  vec3 bgN=mix(vec3(.031,.047,.067),vec3(.10,.12,.22),exp(-r*1.4)*.9);
  bgN=mix(bgN,vec3(.16,.10,.09),uWarm*exp(-r*1.2)*.6);
  vec3 lineN=mix(ir,gold,.45);
  vec3 night=bgN+uGlow*(lineN*(lines*.62+fil)+mix(gold,ir,.3)*ray*.45)+gold*core+sky*rip*.8+gold*pointerHalo;

  /* morning: same structure, inked lightly onto warm paper */
  vec3 bgD=mix(vec3(.965,.949,.918),vec3(1.,.972,.90),exp(-r*1.8));
  vec3 inkD=mix(vec3(.62,.42,.12),vec3(.18,.42,.70),.5+.5*sin(a*3.+r*6.+t*.1));
  inkD=mix(inkD,ir*.6,.25);
  float amt=clamp((lines*.2+fil*.6+ray*.12)*uGlow+rip*.45,0.,.38);
  vec3 day=mix(bgD,inkD,amt)+vec3(1.,.85,.5)*core*.25;

  vec3 col=mix(night,day,smoothstep(0.,1.,uDay));
  /* grain */
  col+=(hash(gl_FragCoord.xy+fract(t))-.5)*.025;
  gl_FragColor=vec4(col,1.);
}`;

  function sh(type, src) { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.warn(gl.getShaderInfoLog(s)); return null; } return s; }
  const vs = sh(gl.VERTEX_SHADER, vert), fs = sh(gl.FRAGMENT_SHADER, frag);
  if (!vs || !fs) { api.ok = false; document.documentElement.classList.add("no-webgl"); return; }
  const prog = gl.createProgram(); gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog); gl.useProgram(prog);
  const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, "p"); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const U = {}; ["uRes", "uTime", "uDay", "uWarm", "uCenter", "uZoom", "uPointer", "uRip", "uGlow"].forEach((n) => (U[n] = gl.getUniformLocation(prog, n)));

  const rips = new Float32Array(24); let ripI = 0;
  let scale = matchMedia("(max-width: 760px)").matches ? 0.55 : 0.75;
  const t0 = performance.now(); let now = 0, last = 0, slow = 0, raf = 0;
  const pointer = { x: 0.68, y: 0.5, tx: 0.68, ty: 0.5 };

  function size() {
    const dpr = Math.min(devicePixelRatio || 1, 1.75) * scale;
    const w = Math.round(innerWidth * dpr), h = Math.round(innerHeight * dpr);
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; gl.viewport(0, 0, w, h); }
  }
  function draw() {
    size();
    gl.uniform2f(U.uRes, canvas.width, canvas.height);
    gl.uniform1f(U.uTime, now);
    gl.uniform1f(U.uDay, api.day);
    gl.uniform1f(U.uWarm, api.warm);
    gl.uniform2f(U.uCenter, api.cx, api.cy);
    gl.uniform1f(U.uZoom, api.zoom);
    gl.uniform1f(U.uGlow, api.glow);
    gl.uniform2f(U.uPointer, pointer.x, pointer.y);
    gl.uniform4fv(U.uRip, rips);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  const ease = (a, b, k) => a + (b - a) * k;
  function frame(ms) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(ms - last, 100); last = ms;
    now = (ms - t0) / 1000;
    // adapt resolution if frames are slow
    if (dt > 30) { if (++slow > 40 && scale > 0.4) { scale -= 0.1; slow = 0; } } else slow = Math.max(0, slow - 1);
    const k = 1 - Math.exp(-dt / 420), kp = 1 - Math.exp(-dt / 160); // time-based easing, same feel at any frame rate
    api.day = ease(api.day, api.dayTarget, k); api.warm = ease(api.warm, api.warmT, k);
    api.cx = ease(api.cx, api.cxT, k); api.cy = ease(api.cy, api.cyT, k); api.zoom = ease(api.zoom, api.zoomT, k); api.glow = ease(api.glow, api.glowT, k);
    pointer.x = ease(pointer.x, pointer.tx, kp); pointer.y = ease(pointer.y, pointer.ty, kp);
    draw();
  }
  api.ripple = (x, y, strength = 1) => {
    // x,y in 0..1 of the viewport (y from the top)
    rips.set([x, 1 - y, now, strength], ripI * 4); ripI = (ripI + 1) % 6;
    if (api.still) draw();
  };
  api.setStill = (s) => {
    api.still = s;
    cancelAnimationFrame(raf);
    if (s) { now = 42; api.day = api.dayTarget; api.cx = api.cxT; api.cy = api.cyT; api.zoom = api.zoomT; api.warm = api.warmT; api.glow = api.glowT; draw(); }
    else { last = performance.now(); raf = requestAnimationFrame(frame); }
  };
  api.redraw = () => { if (api.still) { api.day = api.dayTarget; api.cx = api.cxT; api.cy = api.cyT; api.zoom = api.zoomT; api.warm = api.warmT; api.glow = api.glowT; draw(); } };
  addEventListener("pointermove", (e) => { pointer.tx = e.clientX / innerWidth; pointer.ty = 1 - e.clientY / innerHeight; }, { passive: true });
  addEventListener("resize", () => api.still && draw());
  document.addEventListener("visibilitychange", () => {
    if (api.still) return;
    if (document.hidden) cancelAnimationFrame(raf); else { last = performance.now(); raf = requestAnimationFrame(frame); }
  });
  const rm = matchMedia("(prefers-reduced-motion: reduce)");
  api.setStill(rm.matches);
  rm.addEventListener?.("change", (e) => api.setStill(e.matches));
})();
