/* Liquid tab highlight: a drop of water that stretches toward the tab you pick, splits into droplets on long jumps and settles with a ripple.
   Plain-JavaScript port of the "Waterline" navbar idea (WebGL shader, spring physics); paused while idle, CSS fallback when WebGL is missing. */
(function () {
  const LM = window.LM = window.LM || {};
  const PAD = 8; // room above/below the tab for the blob's shadow
  const VERT = 'attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}';
  const FRAG = `precision highp float;
uniform vec2 uRes;uniform float uDpr;uniform float uTime;
uniform vec4 uBlob[6];uniform float uSy[6];uniform vec4 uRip[6];uniform vec3 uMouse;uniform float uDark;uniform vec3 uTint;uniform vec3 uLine;
float sdCap(vec2 p,vec4 B,float sy){p-=B.xy;p.y/=sy;p.x=max(abs(p.x)-B.z,0.);return(length(p)-B.w)*min(1.,sy);}
float smin(float a,float b,float k){float h=clamp(.5+.5*(b-a)/k,0.,1.);return mix(b,a,h)-k*h*(1.-h);}
float dropD(vec2 p){float d=1e4;for(int i=0;i<6;i++){if(uBlob[i].w>.5){d=smin(d,sdCap(p,uBlob[i],uSy[i]),13.);}}return d;}
float lens(float d,float w){float t=clamp(-d/w,0.,1.);return sqrt(1.-(1.-t)*(1.-t));}
float waves(vec2 p){float w=0.;
 for(int i=0;i<6;i++){vec4 R=uRip[i];if(R.w>0.){float x=length(p-R.xy)-R.z*240.;w+=R.w*exp(-R.z*1.7)*sin(x*.3)*exp(-x*x/700.);}}
 vec2 m=p-uMouse.xy;w+=uMouse.z*3.6*exp(-dot(m,m)/1000.);return w;}
float H(vec2 p,float dd){return lens(dd,11.)*7.5+waves(p)*smoothstep(0.,7.,-dd);}
float caus(vec2 p,float t){vec2 q=p;float c=0.;for(int i=0;i<3;i++){q+=vec2(sin(q.y*1.1+t),cos(q.x*1.3-t*.7))*.6;c+=1./(1.+16.*abs(sin(q.x)*sin(q.y)));}return c/3.;}
void main(){
 vec2 p=vec2(gl_FragCoord.x,uRes.y*uDpr-gl_FragCoord.y)/uDpr;
 float dd=dropD(p);
 if(dd>14.){gl_FragColor=vec4(0.);return;}
 float h0=H(p,dd);vec3 n=normalize(vec3(h0-H(p+vec2(1.,0.),dropD(p+vec2(1.,0.))),h0-H(p+vec2(0.,1.),dropD(p+vec2(0.,1.))),1.));
 vec3 V=vec3(0.,0.,1.);
 float spec=pow(max(dot(reflect(-normalize(vec3(-.45,-.8,.85)),n),V),0.),70.);
 float spec2=pow(max(dot(reflect(-normalize(vec3(.6,.75,.7)),n),V),0.),22.)*.3;
 float fres=clamp((1.-n.z)*4.,0.,1.);
 vec3 irid=.5+.5*cos(6.2831*(vec3(0.,.33,.67)+fres*.85+p.x*.0028+uTime*.035));
 float dm=smoothstep(1.,-1.,dd);
 float sh=smoothstep(9.,-9.,dropD(p-vec2(0.,4.)))*(1.-dm)*(.12+.08*uDark);
 vec3 c=vec3(0.,.14,.2)*sh;float a=sh;
 float th=lens(dd,11.);
 float cs=caus((p+n.xy*th*18.)*.085,uTime*.9);
 float rim=dm*(1.-smoothstep(0.,8.,-dd));
 float cres=dm*smoothstep(.12,.55,dot(n.xy,normalize(vec2(.55,.85))))*smoothstep(0.,3.,-dd);
 float body=.5+.5*clamp(-n.y*3.,-1.,1.);
 float da=dm*(.34+.16*body)*(1.-.3*uDark);vec3 dc=mix(uTint,vec3(1.),body*.55);
 float la=rim*.26;dc=uLine*la+dc*da*(1.-la);da=la+da*(1.-la);
 la=clamp(cres*.7+smoothstep(.6,1.,cs)*.28*th*dm,0.,1.);dc=vec3(1.)*la+dc*(1.-la);da=la+da*(1.-la);
 la=clamp(dm*(spec*1.2+spec2*.5),0.,1.);dc=vec3(1.)*la+dc*(1.-la);da=la+da*(1.-la);
 la=dm*smoothstep(-2.,0.,dd)*.3;dc=mix(vec3(1.),irid,.3)*la+dc*(1.-la);da=la+da*(1.-la);
 c=dc+c*(1.-da);a=da+a*(1.-da);
 gl_FragColor=vec4(c,a);
}`;

  function initGL(canvas) {
    const gl = canvas.getContext('webgl', { premultipliedAlpha: true, alpha: true, antialias: false }); if (!gl) return null;
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null; };
    const vs = sh(gl.VERTEX_SHADER, VERT), fs = sh(gl.FRAGMENT_SHADER, FRAG); if (!vs || !fs) return null;
    const p = gl.createProgram(); gl.attachShader(p, vs); gl.attachShader(p, fs); gl.linkProgram(p); if (!gl.getProgramParameter(p, gl.LINK_STATUS)) return null;
    gl.useProgram(p); const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(p, 'a'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const u = {}; for (const n of ['uRes', 'uDpr', 'uTime', 'uBlob', 'uSy', 'uRip', 'uMouse', 'uDark', 'uTint', 'uLine']) u[n] = gl.getUniformLocation(p, n);
    return { gl, u };
  }

  function attach(nav) {
    if (!nav || nav.dataset.liquid) return; nav.dataset.liquid = '1'; nav.classList.add('liquid');
    const reduce = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
    const canvas = document.createElement('canvas'); canvas.className = 'liquid-water'; canvas.setAttribute('aria-hidden', 'true'); nav.prepend(canvas);
    const fallback = document.createElement('span'); fallback.className = 'liquid-drop'; fallback.setAttribute('aria-hidden', 'true'); nav.prepend(fallback);
    const S = { a: { x: 0, v: 0 }, b: { x: 0, v: 0 }, sy: { s: 1, v: 0 }, lead: 0, lagFrom: 0, sats: [], rips: [], t: { x: 0, cy: 0, q: 0, r: 16 }, q: 0, mouse: { x: 0, y: 0, s: 0, on: false }, moving: false, split: false, ready: false, w: 0, h: 0, raf: 0, last: 0, time: 0, btn: null, glc: initGL(canvas) };
    if (!S.glc) { canvas.style.display = 'none'; fallback.style.display = 'block'; }
    const isDark = () => { const r = document.documentElement; return r.dataset.theme === 'dark' || (r.dataset.theme !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches) ? 1 : 0; };

    function draw() {
      const T = S.t, sep = Math.abs(S.a.x - S.b.x), thin = Math.min(sep / (2 * (S.q + T.r) || 1), 1), r = T.r * (1 - 0.3 * thin);
      if (S.glc) {
        const { gl: g, u } = S.glc; const dpr = Math.min(window.devicePixelRatio || 1, 2);
        g.viewport(0, 0, g.drawingBufferWidth, g.drawingBufferHeight); g.uniform2f(u.uRes, S.w, S.h); g.uniform1f(u.uDpr, dpr); g.uniform1f(u.uTime, S.time);
        const blobs = new Float32Array(24), sy = new Float32Array(6).fill(1); const head = S.lead === 0 ? S.a : S.b, tail = S.lead === 0 ? S.b : S.a;
        blobs.set([head.x, T.cy, S.q * (1 - 0.25 * thin), T.r * (1 - 0.12 * thin), tail.x, T.cy, S.q * (1 - 0.8 * thin), T.r * (1 - 0.5 * thin)], 0); sy[0] = sy[1] = S.sy.s;
        S.sats.slice(0, 4).forEach((d, i) => blobs.set([d.x, d.y, 0, d.r], 8 + i * 4)); g.uniform4fv(u.uBlob, blobs); g.uniform1fv(u.uSy, sy);
        const rips = new Float32Array(24); S.rips.slice(-6).forEach((p, i) => rips.set([p.x, p.y, p.age, p.amp], i * 4)); g.uniform4fv(u.uRip, rips);
        const dark = isDark(); g.uniform3f(u.uMouse, S.mouse.x, S.mouse.y, S.mouse.s); g.uniform1f(u.uDark, dark);
        g.uniform3f(u.uTint, ...(dark ? [0.42, 0.74, 0.66] : [0.66, 0.88, 0.80])); g.uniform3f(u.uLine, ...(dark ? [0.2, 0.6, 0.5] : [0.1, 0.5, 0.4]));
        g.clearColor(0, 0, 0, 0); g.clear(g.COLOR_BUFFER_BIT); g.drawArrays(g.TRIANGLES, 0, 3);
      } else {
        const left = Math.min(S.a.x, S.b.x) - S.q - r, width = sep + 2 * (S.q + r);
        fallback.style.width = width + 'px'; fallback.style.height = r * 2 + 'px'; fallback.style.transform = `translate(${left}px, ${T.cy - r}px) scaleY(${S.sy.s})`;
      }
    }
    function step(dt, now) {
      const T = S.t; S.time += dt; S.q += (T.q - S.q) * Math.min(1, dt * 12); let still = true;
      if (reduce) { S.a.x = S.b.x = T.x; S.a.v = S.b.v = 0; S.sy.s = 1; S.sats = []; }
      else {
        [S.a, S.b].forEach((B, i) => {
          const lead = i === S.lead, k = lead ? 210 : 72, c = lead ? 25 : 13, f = !lead && now < S.lagFrom ? 0.08 : 1;
          B.v += (k * (T.x - B.x) - c * B.v) * dt * f; B.x += B.v * dt;
          const lo = 6 + S.q + T.r - 3, hi = S.w - 6 - S.q - T.r + 3;
          if (B.x < lo || B.x > hi) { S.sy.v -= Math.min(Math.abs(B.v), 900) * 0.0016; B.x = Math.max(lo, Math.min(hi, B.x)); B.v *= -0.25; }
          if (Math.abs(T.x - B.x) > 0.3 || Math.abs(B.v) > 3) still = false;
        });
        const L = [S.a, S.b][S.lead], syT = 1 - 0.2 * Math.min(Math.abs(L.v) / 1500, 1);
        S.sy.v += (280 * (syT - S.sy.s) - 9 * S.sy.v) * dt; S.sy.s += S.sy.v * dt; if (Math.abs(S.sy.s - 1) > 0.002 || Math.abs(S.sy.v) > 0.02) still = false;
        const sep = Math.abs(S.a.x - S.b.x), r = T.r * (1 - 0.3 * Math.min(sep / (2 * (T.q + T.r) || 1), 1));
        if (!S.split && S.moving && sep - 2 * T.q - 2 * r > -6) {
          S.split = true; const lo = [S.a, S.b][1 - S.lead], hi = [S.a, S.b][S.lead];
          [0.3, 0.5, 0.72].forEach((t, j) => S.sats.push({ x: lo.x + (hi.x - lo.x) * t + (Math.random() - 0.5) * 6, y: T.cy + (Math.random() - 0.5) * 8, vx: (lo.v + hi.v) * 0.45, vy: (Math.random() - 0.5) * 50, r: 4 + Math.random() * 2.5 - j * 0.4, k: 70 + Math.random() * 90 }));
        }
        S.sats = S.sats.filter((d) => {
          d.vx += (d.k * (T.x - d.x) - 9 * d.vx) * dt; d.vy += (90 * (T.cy - d.y) - 7 * d.vy) * dt; d.x += d.vx * dt; d.y += d.vy * dt;
          d.x = Math.max(8 + d.r, Math.min(S.w - 8 - d.r, d.x)); d.y = Math.max(T.cy - T.r + d.r, Math.min(T.cy + T.r - d.r, d.y));
          if (Math.abs(T.x - d.x) < T.q + T.r * 0.5) d.r -= dt * 26; return d.r > 0.6;
        });
        if (S.sats.length) still = false;
      }
      if (S.moving && still) { S.moving = false; if (!reduce) S.rips.push({ x: T.x, y: T.cy, age: 0, amp: S.split ? 1.1 : 0.6 }); }
      S.rips.forEach((p) => (p.age += dt)); S.rips = S.rips.filter((p) => p.age < 2.2);
      S.mouse.s += ((S.mouse.on ? 1 : 0) - S.mouse.s) * Math.min(1, dt * 7);
    }
    function loop() {
      if (S.raf) return; S.last = performance.now();
      const tick = (now) => {
        const dt = Math.min((now - S.last) / 1000, 1 / 30); S.last = now; step(dt, now); draw();
        const busy = S.moving || S.rips.length || S.sats.length || S.mouse.s > 0.01;
        S.raf = busy && !document.hidden ? requestAnimationFrame(tick) : 0; // nothing moves, nothing is drawn: no idle cost
      };
      S.raf = requestAnimationFrame(tick);
    }
    function measure(snap) {
      const el = S.btn || nav.querySelector('button.on'); if (!el) return; S.btn = el;
      const T = S.t; S.w = nav.scrollWidth; S.h = nav.clientHeight;
      T.r = Math.max(8, Math.min(el.offsetHeight / 2 - 3, 19)); T.q = Math.max(0, el.offsetWidth / 2 - T.r); T.cy = el.offsetTop + el.offsetHeight / 2 - 1;
      const nx = el.offsetLeft + el.offsetWidth / 2;
      const dpr = Math.min(window.devicePixelRatio || 1, 2), W = Math.round(S.w * dpr), Hh = Math.round(S.h * dpr);
      if (canvas.width !== W || canvas.height !== Hh) { canvas.width = W; canvas.height = Hh; canvas.style.width = S.w + 'px'; canvas.style.height = S.h + 'px'; }
      if (snap || !S.ready) { S.a.x = S.b.x = nx; S.a.v = S.b.v = 0; S.q = T.q; S.ready = true; S.moving = false; S.sats = []; }
      else if (Math.abs(nx - T.x) > 0.5) { S.lead = Math.abs(nx - S.a.x) <= Math.abs(nx - S.b.x) ? 0 : 1; S.lagFrom = performance.now() + 70; S.moving = true; S.split = false; }
      T.x = nx; loop();
    }
    function move(btn) { S.btn = btn; measure(false); const r = btn.getBoundingClientRect(), n = nav.getBoundingClientRect(); S.rips.push({ x: r.left - n.left + nav.scrollLeft + r.width / 2, y: S.t.cy, age: 0, amp: 0.5 }); loop(); }
    nav.addEventListener('pointermove', (e) => { if (e.pointerType !== 'mouse') return; const n = nav.getBoundingClientRect(); S.mouse.x = e.clientX - n.left + nav.scrollLeft; S.mouse.y = e.clientY - n.top; S.mouse.on = true; loop(); });
    nav.addEventListener('pointerleave', () => { S.mouse.on = false; loop(); });
    let lastW = -1; new ResizeObserver(() => { const w = nav.clientWidth + ':' + nav.scrollWidth; if (w !== lastW) { lastW = w; measure(true); } }).observe(nav);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) loop(); });
    window.matchMedia && matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => loop());
    nav._liquid = { move, measure }; measure(true);
  }
  LM.liquidTabs = { attach, move: (nav, btn) => nav && nav._liquid && nav._liquid.move(btn) };
})();
