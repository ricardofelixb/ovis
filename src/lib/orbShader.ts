/**
 * The voice call's orb: a glass sphere with a slow liquid inside, drawn by one fragment shader.
 *
 * Ported from SkSL to GLSL ES 1.0 (WebGL 1) from the agents app's agent-orb glass-liquid effect
 * (packages/agent-orb/src/effects/glass-liquid/shader.ts and identity.ts, © Ricardo Felix); see
 * THIRD_PARTY_NOTICES.md. Only the shared glass and the "frost" fluid (style 1) are kept, the one
 * the agents app's voice view draws. Differences from the SkSL: the origin of `gl_FragCoord` is
 * already the bottom-left, so the Y flip is gone; precision is `highp` because `lq_hash` turns
 * blocky at `mediump` on phone GPUs; the output is premultiplied alpha, as the canvas composites it.
 */

export const ORB_VERTEX_SHADER = `
attribute vec2 aPosition;
void main() {
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

/** The frost palette (identity.ts `glass-frost`), light to deep. */
export const ORB_FROST_COLORS: readonly [readonly number[], readonly number[], readonly number[], readonly number[]] = [
  hexToRgb("#F7FBFF"),
  hexToRgb("#DDEFFD"),
  hexToRgb("#A8D8F0"),
  hexToRgb("#5EA9D6"),
];

function hexToRgb(hex: string): number[] {
  return [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16) / 255);
}

export const ORB_FRAGMENT_SHADER = `
precision highp float;

uniform vec2 uResolution;
uniform float uTime;
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform vec3 uColorC;
uniform vec3 uColorD;

const float speed = 0.41;
const float radius = 0.72;
const float zoom = 0.32;
const float warp = 3.0;
const float sharp = 2.0;
const float shade = 0.3;
const float sheen = 1.0;
const float gloss = 1.0;
const float shellMidAlpha = 0.3;
const float shellEdgeAlpha = 0.2;
const float exposure = 1.0;
const float GL_TILE = 2.15053763;
const float GL_PX = 0.00703710;
const float GL_FU = 0.88172043;
const float GL_BSIG = 0.03990000;
const float GL_KA = 6.0;
const float GL_KG = 4.1209;
const float GL_KWA = 0.5;
const float GL_KR = 0.32;
const float GL_GH = 1.73205081;
const float GL_EA = 0.89736760;
const float GL_EB = 1.05263240;

float lq_hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float lq_noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(lq_hash(i), lq_hash(i + vec2(1.0, 0.0)), f.x),
             mix(lq_hash(i + vec2(0.0, 1.0)), lq_hash(i + vec2(1.0, 1.0)), f.x), f.y);
}

vec2 lq_fbm(vec2 p, float bs) {
  float s = 0.0;
  float a = 0.5;
  float m = 0.0;
  float vr = 0.0;
  float e = -GL_KA * bs * bs;
  float g = 1.0;
  for (int i = 0; i < 5; i++) {
    float b = exp(e * g);
    s += a * (0.5 + b * (lq_noise(p) - 0.5));
    vr += a * a * (1.0 - b * b);
    m += a;
    a *= 0.5;
    g *= GL_KG;
    p = vec2(0.8 * p.x - 0.6 * p.y, 0.6 * p.x + 0.8 * p.y) * 2.03;
  }
  return vec2(s / m, GL_KR * sqrt(vr) / m);
}

float lq_ridge(float v, float k) {
  return pow(clamp(1.0 - abs(v * 2.0 - 1.0), 0.0, 1.0), k);
}

float lq_ridge_s(vec2 vs, float k) {
  float d = GL_GH * vs.y;
  return (lq_ridge(vs.x - d, k) + 4.0 * lq_ridge(vs.x, k) + lq_ridge(vs.x + d, k)) / 6.0;
}

vec3 lq_ramp(float v) {
  vec3 c = mix(uColorA, uColorB, smoothstep(0.0, 0.45, v));
  c = mix(c, uColorC, smoothstep(0.38, 0.72, v));
  return mix(c, uColorD, smoothstep(0.68, 1.0, v));
}

vec3 gls_fluid(vec2 fu, float t) {
  float sp = GL_BSIG * zoom;
  float sw = sp * 1.1 * GL_KWA;
  vec2 pp = fu * zoom;
  vec2 w = vec2(lq_fbm(pp * 1.1 + vec2(0.0, t * 0.09), sw).x,
                lq_fbm(pp * 1.1 + vec2(7.7, -t * 0.07), sw).x);
  vec2 q = pp + warp * (w - 0.5);
  float v = lq_ridge_s(lq_fbm(q * 1.4 + vec2(t * 0.06, 0.0), sp * 1.4), sharp)
          * lq_ridge_s(lq_fbm(q * 1.7 - vec2(0.0, t * 0.05), sp * 1.7), sharp);
  vec3 fcol = lq_ramp(pow(v, 0.7));
  float df = length(fu);
  fcol = mix(fcol, vec3(1.0), shade * 0.3 * smoothstep(0.25, 1.25, dot(fu, vec2(-0.32, 0.78))));
  fcol *= 1.0 - shade * 0.42 * smoothstep(-0.05, 1.25, dot(fu, vec2(0.45, -0.62)));
  fcol *= 1.0 - shade * 0.3 * smoothstep(0.72, 1.0, df);
  return clamp(fcol, 0.0, 1.0);
}

float gls_cdf(float sd, float sg) {
  return smoothstep(-1.88 * sg, 1.88 * sg, sd);
}

vec3 gls_over(vec3 dst, vec3 src, float a) {
  float k = clamp(a, 0.0, 1.0);
  return src * k + dst * (1.0 - k);
}

float gls_spec(vec2 p, vec2 c, float ab, float bb, float ca, float sa,
               float ag, float bg, float gy, float a0) {
  vec2 dv = p - c;
  float lx = dv.x * ca + dv.y * sa;
  float ly = -dv.x * sa + dv.y * ca;
  float e = sqrt((lx / ab) * (lx / ab) + (ly / bb) * (ly / bb));
  float mask = 1.0 - smoothstep(0.98, 1.02, e);
  float g = sqrt((lx / ag) * (lx / ag) + ((ly - gy) / bg) * ((ly - gy) / bg));
  return a0 * clamp(1.0 - g / 0.7, 0.0, 1.0) * mask;
}

void main() {
  vec2 size = uResolution;
  vec2 fc = gl_FragCoord.xy;
  vec2 uv = (2.0 * fc - size) / max(min(size.x, size.y), 1.0);
  float rad = max(radius, 0.05);
  float edgeWidth = max(2.0 / (max(min(size.x, size.y), 1.0) * rad), 0.0025);
  if (length(uv) > rad * (1.0 + edgeWidth)) {
    gl_FragColor = vec4(0.0);
    return;
  }

  float t = uTime * speed;
  vec2 p = uv / rad;
  float pd = length(p);
  vec2 fu = p / GL_FU;
  float df = length(fu);
  float fa = 1.0 - smoothstep(GL_EA, GL_EB, df);
  vec3 fcol = vec3(0.0);
  if (fa > 0.0) fcol = gls_fluid(fu, t);
  vec3 col = vec3(0.956863, 0.941176, 0.901961);

  float g = clamp(length(p - vec2(-0.2, 0.4)) / 1.84390889, 0.0, 1.0);
  float aInner = 0.70;
  vec3 sInner = vec3(1.0) * aInner;
  vec3 sMid = uColorB * shellMidAlpha;
  vec3 sEdge = uColorD * shellEdgeAlpha;
  vec3 pm;
  float pa;
  if (g < 0.55) {
    float f = g / 0.55;
    pm = mix(sInner, sMid, f);
    pa = mix(aInner, shellMidAlpha, f);
  } else {
    float f = (g - 0.55) / 0.45;
    pm = mix(sMid, sEdge, f);
    pa = mix(shellMidAlpha, shellEdgeAlpha, f);
  }
  col = pm + col * (1.0 - clamp(pa, 0.0, 1.0));

  col = gls_over(col, vec3(1.0), 0.25 * sheen * gls_cdf(length(p - vec2(0.0, 20.0 * GL_PX)) - 1.0, 22.0 * GL_PX));
  col = gls_over(col, vec3(1.0), 0.55 * sheen * gls_cdf(length(p - vec2(0.0, -16.0 * GL_PX)) - 1.0, 18.0 * GL_PX));
  col = gls_over(col, vec3(1.0), 0.60 * sheen * smoothstep(1.0 - 1.5 * GL_PX, 1.0 - 0.5 * GL_PX, pd));

  float lum = dot(fcol, vec3(0.213, 0.715, 0.072));
  col = gls_over(col, clamp(lum + (fcol - lum) * 1.15, 0.0, 1.0), 0.92 * fa);

  float sg = pd / 1.41421356;
  float sa = 0.0;
  if (sg >= 0.58 && sg < 0.84) sa = 0.26 * (sg - 0.58) / 0.26;
  else if (sg < 0.97) sa = mix(0.26, 0.65, (sg - 0.84) / 0.13);
  else if (sg < 1.0) sa = mix(0.65, 0.20, (sg - 0.97) / 0.03);
  else sa = 0.20;
  col = gls_over(col, vec3(1.0), sa * gloss);

  float a6 = gls_spec(p, vec2(-0.11 * GL_TILE, 0.325 * GL_TILE),
    0.23 * GL_TILE, 0.11 * GL_TILE, 0.95105652, 0.30901699,
    1.41421356 * 0.23 * GL_TILE, 1.41421356 * 0.132 * GL_TILE,
    0.022 * GL_TILE, 0.95);
  col = gls_over(col, vec3(1.0), a6 * gloss);
  float a7 = gls_spec(p, vec2(0.21 * GL_TILE, -0.245 * GL_TILE),
    0.09 * GL_TILE, 0.045 * GL_TILE, 0.93969262, 0.34202014,
    1.41421356 * 0.09 * GL_TILE, 1.41421356 * 0.045 * GL_TILE,
    0.0, 0.75);
  col = gls_over(col, vec3(1.0), a7 * gloss);

  float alpha = 1.0 - smoothstep(1.0 - edgeWidth, 1.0 + edgeWidth, pd);
  col = clamp(col * max(exposure, 0.0), 0.0, 1.0);
  gl_FragColor = vec4(col * alpha, alpha);
}
`;
