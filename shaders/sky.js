// The one sky shader for shader-sky.js. Written for LuminAAC; the techniques
// are textbook ones: value noise and fractal Brownian motion (fbm) for clouds,
// two warped fbm layers for water light, a hashed grid for stars, and a
// Gaussian ring for ripples. Every mode is mid-value and low-chroma, with one
// warm highlight, and nothing flickers: the fastest change is a 6 s wave.
export const MODES = { clouds: 0, sea: 1, night: 2, breath: 3, aurora: 4, pool: 5 };

export const VERT = `attribute vec2 p; void main() { gl_Position = vec4(p, 0.0, 1.0); }`;

export const FRAG = `precision mediump float;
uniform vec2 u_res;
uniform float u_time, u_speed, u_breath;
uniform int u_mode;
uniform vec3 u_a, u_b, u_c;
uniform vec4 u_rip[4];

float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h(i), h(i + vec2(1.0, 0.0)), f.x), mix(h(i + vec2(0.0, 1.0)), h(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { v += a * n(p); p *= 2.0; a *= 0.5; } return v; }

void main() {
  vec2 uv = gl_FragCoord.xy / u_res;
  float asp = u_res.x / u_res.y;
  vec2 p = vec2(uv.x * asp, uv.y);
  float t = u_time * u_speed; // whole cycles
  vec3 col = mix(u_b, u_a, uv.y);

  if (u_mode == 0) { // slow clouds
    float c = smoothstep(0.55, 0.85, fbm(p * 2.2 + vec2(t, 0.0)));
    col = mix(col, u_c, c * 0.22 * uv.y);
  } else if (u_mode == 1 || u_mode == 5) { // water light, and the tide pool's ripples
    float f = fbm(p * 3.5 + vec2(t, t * 0.5));
    float g = fbm(p * 3.5 - vec2(t * 0.7, 0.0) + f);
    col += u_c * pow(1.0 - abs(g - f), 40.0) * 0.06;
    for (int i = 0; i < 4; i++) {
      vec4 r = u_rip[i];
      if (r.w <= 0.0) continue;
      float d = length((uv - r.xy) * vec2(asp, 1.0));
      float ring = exp(-pow((d - r.z * r.w) * 30.0, 2.0)) * max(0.0, 1.0 - r.z / 2.5);
      col += u_c * ring * 0.3;
    }
  } else if (u_mode == 2) { // night: a few dim stars that never twinkle faster than 8 s
    vec2 g = floor(p * 14.0), q = fract(p * 14.0) - 0.5;
    float s = step(0.965, h(g)) * smoothstep(0.08, 0.0, length(q));
    s *= 0.55 + 0.45 * sin(6.2832 * (t * 5.0 + h(g + 3.0)));
    col += u_c * s * 0.5 * uv.y;
  } else if (u_mode == 3) { // Calm: the horizon rises and settles with the breath
    float hy = 0.2 + 0.45 * u_breath;
    float glow = exp(-abs(uv.y - hy) * 10.0);
    col = mix(u_b, u_a, smoothstep(hy - 0.3, hy + 0.4, uv.y));
    col += u_c * glow * 0.28;
    col = mix(col, col * 0.8, step(uv.y, hy));
    col += u_c * smoothstep(0.6, 0.9, fbm(p * 1.8 + vec2(t, 0.0))) * 0.05 * step(hy, uv.y);
  } else { // aurora: soft bands in the chosen feeling's colour
    float y0 = 0.62 + 0.07 * sin(p.x * 2.0 + t * 6.2832) + 0.06 * fbm(p * 2.0 + vec2(t, 0.0));
    float a = exp(-pow((uv.y - y0) * 6.0, 2.0)) * (0.6 + 0.4 * fbm(vec2(p.x * 4.0, t)));
    col += u_c * a * 0.45;
  }
  gl_FragColor = vec4(col, 1.0);
}`;
