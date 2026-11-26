/* Daylight Prism: the living background of the LuminAAC website.
   One full-screen WebGL fragment shader: pearl-white daylight with soft
   refracted light. Slow caustics (light on the floor of a pool), a few
   rays falling from the upper left, and a rainbow fringe wherever light
   bends, the way white light splits in a glass prism.
   It never goes dark: every pixel stays near paper-white, so dark text
   reads on it at every scroll point. Sections set the hue and where the
   light falls (data-hue, data-light). Taps send a ripple of spectrum.
   Still mode and reduced motion draw a single frame. */
(function () {
  "use strict";
  const canvas = document.getElementById("prism");
  if (!canvas) return;
  const gl = canvas.getContext("webgl", { antialias: false, alpha: false, powerPreference: "low-power", preserveDrawingBuffer: false });
  const api = { hue: 0, hueT: 0, lx: 0.2, ly: 0.15, lxT: 0.2, lyT: 0.15, ripple() {}, setStill() {}, redraw() {}, ok: !!gl };
  window.LuminPrism = api;
  if (!gl) { document.documentElement.classList.add("no-webgl"); return; }

  const vert = "attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}";
  const frag = `
precision mediump float;
uniform vec2 uRes; uniform float uTime; uniform float uHue; uniform vec2 uLight; uniform vec4 uRip[6];
#define TAU 6.2831853
vec3 spectrum(float t){return .5+.5*cos(TAU*(t+vec3(0.,.33,.67)));}
float caustic(vec2 p,float t){
  float c=0.;
  for(int i=0;i<4;i++){
    float fi=float(i);
    vec2 q=p*(1.3+fi*.55)+vec2(t*.07*(fi+1.),-t*.05*(fi+1.));
    c+=abs(sin(q.x+sin(q.y*1.3+t*.2))+sin(q.y+sin(q.x*1.1-t*.17)));
  }
  return pow(1.-clamp(c*.14,0.,1.),5.);
}
void main(){
  vec2 uv=gl_FragCoord.xy/uRes; float asp=uRes.x/uRes.y;
  vec2 p=vec2(uv.x*asp,uv.y);
  vec2 L=vec2(uLight.x*asp,1.-uLight.y);
  float t=uTime;
  /* pearl paper, faintly warm at the top and cool at the bottom */
  vec3 base=mix(vec3(.957,.962,.975),vec3(.992,.984,.968),uv.y);
  /* soft pastel blooms of spectrum that drift */
  vec3 col=base;
  for(int i=0;i<3;i++){
    float fi=float(i);
    vec2 c=vec2(.5*asp+.42*asp*sin(t*.03+fi*2.1),.5+.38*cos(t*.025+fi*1.7));
    float d=length(p-c);
    col=mix(col,spectrum(uHue+fi*.27+t*.01)*.35+.65,.28*exp(-d*d*3.2));
  }
  /* light rays from the light source, each fringed with rainbow at its edge */
  vec2 v=p-L; float ang=atan(v.y,v.x); float r=length(v);
  float rays=0.; float fringe=0.;
  for(int k=0;k<5;k++){
    float fk=float(k);
    float a0=-.55-fk*.23+.04*sin(t*.1+fk);
    float w=.018+.012*fk;
    float da=abs(ang-a0);
    rays+=exp(-da*da/(w*w))*(.55-fk*.07);
    fringe+=exp(-pow((da-w*1.4)/(w*.8),2.))*(.4-fk*.05);
  }
  float fall=exp(-r*.9);
  col+=vec3(1.,.985,.94)*rays*.22*fall;
  col+=spectrum(uHue+ang*1.6+r*.8)*fringe*.16*fall;
  /* caustics: light on water, tinted by the spectrum */
  float c=caustic(p*2.6,t);
  col+=mix(vec3(1.),spectrum(uHue+uv.x*.6+uv.y*.4+t*.02),.55)*c*.16;
  /* the light source itself */
  col+=vec3(1.,.98,.92)*.22*exp(-r*r*14.);
  /* ripples from taps: a ring of spectrum */
  for(int i=0;i<6;i++){
    vec4 R=uRip[i]; if(R.w<=0.)continue;
    float age=t-R.z; if(age<0.||age>3.)continue;
    vec2 rc=vec2(R.x*asp,1.-R.y); float rd=length(p-rc);
    float ring=exp(-pow((rd-age*.32)*28.,2.))*(1.-age/3.)*R.w;
    col+=spectrum(rd*3.-age+uHue)*ring*.28;
  }
  /* keep it daylight: never below paper tone, so text always reads */
  col=clamp(col,vec3(.9),vec3(1.));
  gl_FragColor=vec4(col,1.);
}`;
  function sh(type, src) { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; }
  let prog;
  try {
    prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, vert)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, frag)); gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  } catch (e) { document.documentElement.classList.add("no-webgl"); api.ok = false; return; }
  gl.useProgram(prog);
  const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, "p"); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const U = (n) => gl.getUniformLocation(prog, n);
  const uRes = U("uRes"), uTime = U("uTime"), uHue = U("uHue"), uLight = U("uLight"), uRip = U("uRip");
  const rips = new Float32Array(24); let ri = 0;

  // Half resolution: the light is soft, so it doesn't need full pixels.
  const SCALE = Math.min(1, 0.55 * (window.devicePixelRatio || 1));
  function size() { canvas.width = Math.max(2, Math.round(innerWidth * SCALE)); canvas.height = Math.max(2, Math.round(innerHeight * SCALE)); gl.viewport(0, 0, canvas.width, canvas.height); }
  size(); addEventListener("resize", () => { size(); draw(); });

  const t0 = performance.now(); let still = false, raf = 0, last = 0, frozenT = 8;
  function draw(now) {
    const t = still ? frozenT : (performance.now() - t0) / 1000;
    api.hue += (api.hueT - api.hue) * 0.04;
    api.lx += (api.lxT - api.lx) * 0.04; api.ly += (api.lyT - api.ly) * 0.04;
    gl.uniform2f(uRes, canvas.width, canvas.height); gl.uniform1f(uTime, t);
    gl.uniform1f(uHue, api.hue); gl.uniform2f(uLight, api.lx, api.ly); gl.uniform4fv(uRip, rips);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  function loop(now) {
    raf = requestAnimationFrame(loop);
    if (document.hidden || now - last < 33) return; // 30 frames a second is plenty for slow light
    last = now; draw(now);
  }
  api.ripple = (x, y, s = 1) => { if (still) return; const t = (performance.now() - t0) / 1000; rips.set([x, y, t, s], (ri++ % 6) * 4); };
  api.redraw = () => { if (still) { api.hue = api.hueT; api.lx = api.lxT; api.ly = api.lyT; draw(); } };
  api.setStill = (s) => { still = s; cancelAnimationFrame(raf); if (s) { rips.fill(0); api.redraw(); } else raf = requestAnimationFrame(loop); };
  raf = requestAnimationFrame(loop);
})();
