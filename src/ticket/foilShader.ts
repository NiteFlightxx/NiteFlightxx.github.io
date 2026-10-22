export const vertexShader = /* glsl */`
varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vPosition;
void main() {
  vUv = uv;
  vec4 world = modelMatrix * vec4(position, 1.0);
  vPosition = world.xyz;
  vNormal = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * world;
}`;

export const cutoutShader = /* glsl */`
uniform float uTorn[25];
float shape(vec2 uv) {
  vec2 p = abs(uv - .5) - vec2(.455, .473);
  if(length(max(p,0.0)) > .045) return 0.0;
  float seam = .28;
  if(length(vec2(uv.x, (uv.y-seam)*1.7)) < .032 || length(vec2(1.0-uv.x,(uv.y-seam)*1.7)) < .032) return 0.0;
  float holeX = (floor(uv.x * 24.0) + .5) / 24.0;
  if(length(vec2(uv.x-holeX,(uv.y-seam)*1.7)) < .0062) return 0.0;
  int col = int(clamp(floor(uv.x * 25.0),0.0,24.0));
  if(uTorn[col] > .5 && abs(uv.y-seam) < .007 * (0.6 + .4 * sin(uv.x*680.0))) return 0.0;
  return 1.0;
}`;

export const fragmentShader = /* glsl */`
precision highp float;
uniform sampler2D uFront;
uniform sampler2D uBack;
uniform sampler2D uMask;
uniform sampler2D uBackMask;
uniform float uEdition;
uniform float uTime;
varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vPosition;
${cutoutShader}
vec2 hash2(vec2 p) { return fract(sin(vec2(dot(p,vec2(127.1,311.7)),dot(p,vec2(269.5,183.3))))*43758.5453); }
vec3 rainbow(float t) { return .54 + .46*cos(6.28318*(t+vec3(0.0,.33,.67))); }
float emboss(vec2 uv) { return gl_FrontFacing ? texture2D(uMask,uv).g : texture2D(uBackMask,uv).g; }
void main() {
  if(shape(vUv) < .5) discard;
  vec2 uv = gl_FrontFacing ? vUv : vec2(1.0-vUv.x,vUv.y);
  vec4 base = gl_FrontFacing ? texture2D(uFront,uv) : texture2D(uBack,uv);
  if(base.a < .5) discard;
  vec3 mask = gl_FrontFacing ? texture2D(uMask,uv).rgb : texture2D(uBackMask,uv).rgb;
  vec2 texel = vec2(1.0/1024.0,1.0/1740.0);
  float dx = emboss(uv+vec2(texel.x,0))-emboss(uv-vec2(texel.x,0));
  float dy = emboss(uv+vec2(0,texel.y))-emboss(uv-vec2(0,texel.y));
  vec3 n = normalize((gl_FrontFacing ? vNormal : -vNormal)+vec3(dx,dy,0.0)*.32);
  vec3 viewDir = normalize(cameraPosition-vPosition);
  vec3 lightDir = normalize(vec3(-3.0,5.0,6.0)-vPosition);
  float phase = uv.x*.65+uv.y*.42+dot(n,viewDir)*1.35+dot(n,lightDir)*.25+mask.b*.3+uEdition*.19;
  vec3 spectrum = rainbow(phase);
  float sheen = pow(max(0.0,dot(n,normalize(lightDir+viewDir))),25.0);
  vec3 color = base.rgb*(.92+.08*max(dot(n,lightDir),0.0));
  color = mix(color,color*(.7+spectrum*.53),mask.r*.39);
  color += spectrum*sheen*mask.r*.13;
  // A Voronoi cell owns a random tilted flake normal. Each flake flashes independently.
  vec2 grid = uv*vec2(180.0,300.0), cell = floor(grid), local = fract(grid);
  float nearest = 10.0; vec2 seed = vec2(0.0);
  for(int y=-1;y<=1;y++) for(int x=-1;x<=1;x++) {
    vec2 offset = vec2(float(x),float(y)), random = hash2(cell+offset);
    float d = length(offset+random-local);
    if(d < nearest) { nearest=d; seed=random; }
  }
  vec3 flake = normalize(n+vec3((seed-.5)*.75,0.0));
  float glitter = pow(max(dot(flake,normalize(viewDir+lightDir)),0.0),180.0)*step(.79,seed.x)*mask.r;
  color += vec3(1.0,.97,.86)*glitter*.6;
  gl_FragColor = vec4(color,1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
