/** WebGL2 flow renderer: color-wheel LUT in a fragment shader. */

import { makeColorwheel, NCOLS } from "./colorwheel";
import type { FlowField } from "./flow";

export type Mode = "rgb" | "uv" | "mag" | "angle";

export interface RenderOptions {
  maxFlow: number;
  mode: Mode;
  maskInvalid: boolean;
  /** Hover-isolate: keep pixels near this normalized (u,v) in color, dim the rest. */
  highlight?: { u: number; v: number; radius: number } | null;
}

const VERT = `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = vec2(a_pos.x * 0.5 + 0.5, 1.0 - (a_pos.y * 0.5 + 0.5));
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 fragColor;

uniform sampler2D u_flow;    // RG = u,v ; B = valid
uniform sampler2D u_wheel;   // 1D LUT, NCOLS wide
uniform float u_maxFlow;
uniform int u_mode;          // 0 rgb, 1 uv, 2 mag, 3 angle
uniform bool u_mask;
uniform float u_ncols;
uniform bool u_highlight;    // hover-isolate active
uniform vec2 u_hlTarget;     // target normalized (u,v)
uniform float u_hlRadius;    // keep-radius in normalized units

const float PI = 3.14159265358979;

vec3 wheelLookup(float idx) {
  float t = idx / (u_ncols); // sample center
  return texture(u_wheel, vec2(t, 0.5)).rgb;
}

void main() {
  vec4 texel = texture(u_flow, v_uv);
  float u = texel.r;
  float v = texel.g;
  bool valid = texel.b > 0.5;

  if (u_mask && !valid) { fragColor = vec4(0.0, 0.0, 0.0, 1.0); return; }

  float nu = u / (u_maxFlow + 1e-5);
  float nv = v / (u_maxFlow + 1e-5);
  float rad = sqrt(nu * nu + nv * nv);

  if (u_mode == 1) { // uv
    fragColor = vec4(nu * 0.5 + 0.5, nv * 0.5 + 0.5, 0.5, 1.0);
    return;
  }
  if (u_mode == 2) { // magnitude (grayscale-ish via viridis-lite)
    float m = clamp(rad, 0.0, 1.0);
    fragColor = vec4(m, m * 0.7, 1.0 - m, 1.0);
    return;
  }
  if (u_mode == 3) { // angle
    float ang = (atan(v, u) + PI) / (2.0 * PI);
    vec3 c = clamp(abs(mod(ang * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
    fragColor = vec4(c, 1.0);
    return;
  }

  // rgb: Middlebury color wheel
  float a = atan(-nv, -nu) / PI;
  float fk = (a + 1.0) / 2.0 * (u_ncols - 1.0);
  float k0 = floor(fk);
  float k1 = mod(k0 + 1.0, u_ncols);
  float f = fk - k0;
  vec3 col0 = wheelLookup(k0);
  vec3 col1 = wheelLookup(k1);
  vec3 col = mix(col0, col1, f);
  if (rad <= 1.0) col = 1.0 - rad * (1.0 - col);
  else col = col * 0.75;

  if (u_highlight) {
    float d = distance(vec2(nu, nv), u_hlTarget);
    float keep = 1.0 - smoothstep(u_hlRadius, u_hlRadius + 0.05, d);
    float g = dot(col, vec3(0.299, 0.587, 0.114));
    col = mix(vec3(g) * 0.4, col, keep); // grayscale + darker outside the disk
  }
  fragColor = vec4(col, 1.0);
}`;

export class FlowRenderer {
  private gl: WebGL2RenderingContext;
  private program: WebGLProgram;
  private flowTex: WebGLTexture;
  private wheelTex: WebGLTexture;
  private uniforms: Record<string, WebGLUniformLocation | null> = {};
  private width = 0;
  private height = 0;

  constructor(private canvas: HTMLCanvasElement) {
    const gl = canvas.getContext("webgl2", { preserveDrawingBuffer: true });
    if (!gl) throw new Error("WebGL2 is not available in this browser.");
    this.gl = gl;
    this.program = this.buildProgram();
    this.flowTex = gl.createTexture()!;
    this.wheelTex = this.buildWheelTexture();
    this.setupQuad();
    this.cacheUniforms();
  }

  private buildProgram(): WebGLProgram {
    const gl = this.gl;
    const compile = (type: number, src: string): WebGLShader => {
      const sh = gl.createShader(type)!;
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        throw new Error("Shader error: " + gl.getShaderInfoLog(sh));
      }
      return sh;
    };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error("Link error: " + gl.getProgramInfoLog(prog));
    }
    return prog;
  }

  private setupQuad(): void {
    const gl = this.gl;
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW,
    );
    const loc = gl.getAttribLocation(this.program, "a_pos");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  }

  private buildWheelTexture(): WebGLTexture {
    const gl = this.gl;
    const wheel = makeColorwheel();
    const rgba = new Uint8Array(NCOLS * 4);
    for (let i = 0; i < NCOLS; i++) {
      rgba[i * 4] = wheel[i * 3];
      rgba[i * 4 + 1] = wheel[i * 3 + 1];
      rgba[i * 4 + 2] = wheel[i * 3 + 2];
      rgba[i * 4 + 3] = 255;
    }
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, NCOLS, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, rgba);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return tex;
  }

  private cacheUniforms(): void {
    const gl = this.gl;
    for (const n of ["u_flow", "u_wheel", "u_maxFlow", "u_mode", "u_mask", "u_ncols", "u_highlight", "u_hlTarget", "u_hlRadius"]) {
      this.uniforms[n] = gl.getUniformLocation(this.program, n);
    }
  }

  upload(flow: FlowField): void {
    const gl = this.gl;
    this.width = flow.width;
    this.height = flow.height;
    this.canvas.width = flow.width;
    this.canvas.height = flow.height;

    // Pack u,v,valid into an RGBA32F texture.
    const rgba = new Float32Array(flow.width * flow.height * 4);
    for (let i = 0; i < flow.width * flow.height; i++) {
      rgba[i * 4] = flow.data[i * 2];
      rgba[i * 4 + 1] = flow.data[i * 2 + 1];
      rgba[i * 4 + 2] = flow.valid ? flow.valid[i] : 1;
      rgba[i * 4 + 3] = 1;
    }
    gl.bindTexture(gl.TEXTURE_2D, this.flowTex);
    gl.getExtension("EXT_color_buffer_float");
    gl.getExtension("OES_texture_float_linear");
    gl.texImage2D(
      gl.TEXTURE_2D, 0, gl.RGBA32F, flow.width, flow.height, 0, gl.RGBA, gl.FLOAT, rgba,
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  render(opts: RenderOptions): void {
    const gl = this.gl;
    gl.viewport(0, 0, this.width, this.height);
    gl.useProgram(this.program);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.flowTex);
    gl.uniform1i(this.uniforms.u_flow, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.wheelTex);
    gl.uniform1i(this.uniforms.u_wheel, 1);

    gl.uniform1f(this.uniforms.u_maxFlow, opts.maxFlow);
    gl.uniform1i(this.uniforms.u_mode, { rgb: 0, uv: 1, mag: 2, angle: 3 }[opts.mode]);
    gl.uniform1i(this.uniforms.u_mask, opts.maskInvalid ? 1 : 0);
    gl.uniform1f(this.uniforms.u_ncols, NCOLS);

    const hl = opts.highlight;
    gl.uniform1i(this.uniforms.u_highlight, hl ? 1 : 0);
    if (hl) {
      gl.uniform2f(this.uniforms.u_hlTarget, hl.u, hl.v);
      gl.uniform1f(this.uniforms.u_hlRadius, hl.radius);
    }

    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }
}
