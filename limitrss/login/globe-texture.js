/* Adapted Cloudflare Connect globe. Sources and modifications: assets/SOURCES.md. */
(() => {
  const scriptUrl = document.currentScript.src;
  const canvas = document.querySelector(".globe-texture");
  const fallback = document.querySelector(".globe-fallback");
  if (!canvas || !fallback) return;
  const e = (fn) => {
    let initialized = false;
    return () => {
      if (!initialized) {
        initialized = true;
        return fn();
      }
    };
  };
  var YS, XS, ZS, QS, $S;
  function eC() {
    return (eC = e((() => {
      YS = `#version 300 es
  layout(location = 0) in vec2 a_position;

  void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
  }
`, XS = `#version 300 es
  precision highp float;

  uniform sampler2D u_map;
  uniform vec2 u_grid_resolution;
  uniform vec2 u_display_resolution;
  uniform float u_rotation;
  out vec4 densityColor;

  const float PI = 3.141592653589793;

  float sprayField(vec2 uv) {
    float wave =
      sin(uv.x * 19.0 + uv.y * 8.0) * 0.18 +
      sin(uv.x * 7.0 - uv.y * 17.0) * 0.12 +
      cos((uv.x + uv.y) * 29.0) * 0.06;
    return clamp(0.52 + (uv.x - 0.5) * 0.42 + wave, 0.0, 1.0);
  }

  void main() {
    vec2 uv = gl_FragCoord.xy / u_grid_resolution;
    // Increase the true sphere radius while keeping its top at the same height.
    float baseRadius = min(u_display_resolution.x, u_display_resolution.y) * 0.47;
    float globeScale = 2.0;
    vec2 point = (uv * u_display_resolution - u_display_resolution * 0.5 +
      vec2(0.0, baseRadius * (globeScale - 1.0))) / (baseRadius * globeScale);
    float radiusSquared = dot(point, point);
    float density = 0.0;
    if (radiusSquared <= 1.0) {
      float z = sqrt(1.0 - radiusSquared);
      float tilt = radians(12.0);
      vec3 globe = vec3(
        point.x,
        point.y * cos(tilt) + z * sin(tilt),
        -point.y * sin(tilt) + z * cos(tilt)
      );
      float longitude = atan(globe.x, globe.z) - u_rotation;
      float latitude = asin(clamp(globe.y, -1.0, 1.0));
      vec2 mapUv = vec2(
        fract(longitude / (2.0 * PI) + 0.5),
        0.5 - latitude / PI
      );
      float land = texture(u_map, mapUv).r;
      float field = sprayField(uv);
      float radius = sqrt(radiusSquared);
      // Keep the silhouette a precise circle; noise affects only the inner texture.
      float paintEdge = 1.0 - smoothstep(0.995, 1.0, radius);
      density =
        mix(0.08, 1.0, land) *
        paintEdge *
        mix(0.45, 1.0, field);
    }
    densityColor = vec4(density, 0.0, 0.0, 1.0);
  }
`, ZS = `
  const float PI = 3.141592653589793;
  const vec3 STRIPE_COLOR = vec3(0.9, 0.94, 1.0);

  float sparkleHash(float px, float py) {
    float p3x = fract(px * 0.1031);
    float p3y = fract(py * 0.103);
    float p3z = fract(px * 0.0973);
    float dotValue =
      p3x * (p3y + 33.33) +
      p3y * (p3z + 33.33) +
      p3z * (p3x + 33.33);
    p3x = fract(p3x + dotValue);
    p3y = fract(p3y + dotValue);
    p3z = fract(p3z + dotValue);
    return fract((p3x + p3y) * p3z);
  }

  float cellSeed(float column, float row) {
    return sparkleHash(column + 17.0, row + 31.0);
  }

  float phaseHash(float column, float row) {
    return sparkleHash(column + 53.0, row + 71.0);
  }

  float periodHash(float column, float row) {
    return sparkleHash(column + 89.0, row + 113.0);
  }

  float pulseEnvelope(float localTime) {
    if (localTime < 0.0 || localTime > 1.0) return 0.0;
    float cosine = 0.5 - 0.5 * cos(2.0 * PI * localTime);
    float clamped = clamp(cosine, 0.0, 1.0);
    return clamped * clamped * (3.0 - 2.0 * clamped);
  }

  vec3 rgbToHsl(vec3 value) {
    float maximum = max(max(value.r, value.g), value.b);
    float minimum = min(min(value.r, value.g), value.b);
    float lightness = (maximum + minimum) * 0.5;
    float hue = 0.0;
    float saturation = 0.0;
    float delta = maximum - minimum;
    if (delta > 0.00001) {
      saturation = lightness > 0.5
        ? delta / (2.0 - maximum - minimum)
        : delta / (maximum + minimum);
      if (maximum == value.r) {
        hue = (value.g - value.b) / delta + (value.g < value.b ? 6.0 : 0.0);
      } else if (maximum == value.g) {
        hue = (value.b - value.r) / delta + 2.0;
      } else {
        hue = (value.r - value.g) / delta + 4.0;
      }
      hue /= 6.0;
    }
    return vec3(hue, saturation, lightness);
  }

  float hueToRgb(float p, float q, float value) {
    if (value < 0.0) value += 1.0;
    if (value > 1.0) value -= 1.0;
    if (value < 1.0 / 6.0) return p + (q - p) * 6.0 * value;
    if (value < 1.0 / 2.0) return q;
    if (value < 2.0 / 3.0) return p + (q - p) * (2.0 / 3.0 - value) * 6.0;
    return p;
  }

  vec3 hslToRgb(vec3 value) {
    float hue = fract(value.x);
    float saturation = clamp(value.y, 0.0, 1.0);
    float lightness = clamp(value.z, 0.0, 1.0);
    if (saturation <= 0.00001) return vec3(lightness);
    float q = lightness < 0.5
      ? lightness * (1.0 + saturation)
      : lightness + saturation - lightness * saturation;
    float p = 2.0 * lightness - q;
    return vec3(
      hueToRgb(p, q, hue + 1.0 / 3.0),
      hueToRgb(p, q, hue),
      hueToRgb(p, q, hue - 1.0 / 3.0)
    );
  }

  vec3 shimmerColor(vec3 base, vec2 cell, float widthPx, float seed) {
    if (widthPx < 2.5 || seed >= 0.12) return base;
    float period = mix(
      0.18 / 0.2,
      0.85 / 0.2,
      periodHash(cell.x + 179.0, cell.y + 233.0)
    );
    float cyclePeriod = period / 0.12;
    float scheduled = u_time + phaseHash(cell.x + 179.0, cell.y + 233.0) * cyclePeriod;
    float localTime = mod(scheduled, cyclePeriod);
    if (localTime >= period) return base;
    float amount = pulseEnvelope(localTime / period) * 0.1;
    vec3 hsl = rgbToHsl(base);
    hsl.z = clamp(hsl.z + amount, 0.0, 1.0);
    hsl.x = fract(hsl.x + (15.0 * amount) / 360.0);
    hsl.y = clamp(hsl.y * (1.0 + 0.4 * amount), 0.0, 1.0);
    return hslToRgb(hsl);
  }

  float shuffledWidth(vec2 cell, float widthPx, float seed) {
    if (widthPx <= 0.0 || seed >= 0.22) return widthPx;
    float period = mix(0.5, 1.0, periodHash(cell.x, cell.y));
    float cyclePeriod = period / 0.22;
    float scheduled = u_time + phaseHash(cell.x, cell.y) * cyclePeriod;
    float cycleIndex = floor(scheduled / cyclePeriod);
    float localTime = scheduled - cycleIndex * cyclePeriod;
    if (localTime >= period) return widthPx;
    float alternate = sparkleHash(
      cell.x + 53.0 + cycleIndex * 61.0,
      cell.y + 71.0 + cycleIndex * 101.0
    );
    float target = clamp(widthPx + (alternate * 2.0 - 1.0) * 2.0, 1.0, 7.0);
    return mix(widthPx, target, pulseEnvelope(localTime / period));
  }

  float stripeWidth(float density) {
    if (density < 0.047) {
      return 0.5;
    } else if (density < 0.086) {
      return 1.0;
    } else if (density < 0.2167) {
      return 1.5;
    } else if (density < 0.3191) {
      return 2.0;
    } else if (density < 0.4512) {
      return 2.5;
    } else if (density < 0.6129) {
      return 3.0;
    } else if (density < 0.8) {
      return 3.5;
    }
    return 4.0;
  }

`, QS = `#version 300 es
  precision highp float;
  precision highp int;

  uniform sampler2D u_density;
  uniform vec4 u_display_metrics;
  uniform vec2 u_cell_size;
  uniform ivec2 u_state_origin;
  uniform float u_pixel_scale;
  uniform float u_time;
  out uvec4 cellState;

  ${ZS}

  void main() {
    ivec2 stateCell = ivec2(gl_FragCoord.xy);
    vec2 cell = vec2(u_state_origin + stateCell);
    vec2 displayPx = u_display_metrics.xy;
    vec2 displayCenter = u_display_metrics.zw;
    vec2 axis = vec2(0.70710678);
    vec2 normal = vec2(0.70710678, -0.70710678);
    float stackCenter = (cell.x + 0.5) * u_cell_size.x;
    float axisCenter = (cell.y + 0.5) * u_cell_size.y;
    vec2 cellCenter =
      displayCenter +
      normal * (stackCenter - displayPx.x * 0.5) +
      axis * (axisCenter - displayPx.y * 0.5);
    vec2 sourceUv = clamp(cellCenter / displayPx, vec2(0.0), vec2(1.0));
    float density = texture(u_density, sourceUv).r;
    float widthPx = stripeWidth(density);
    float seed = cellSeed(cell.x, cell.y);
    widthPx = shuffledWidth(cell, widthPx, seed);
    float dotEligible = (
      density >= 0.8 &&
      widthPx >= 2.0 &&
      sparkleHash(cell.x + 137.0, cell.y + 174.0) < 0.14
    )
      ? 1.0
      : 0.0;

    cellState = floatBitsToUint(
      vec4(density, widthPx, seed, dotEligible)
    );
  }
`, $S = `#version 300 es
  precision highp float;
  precision highp int;
  precision highp usampler2D;

  uniform usampler2D u_cell_state;
  uniform ivec2 u_state_origin;
  uniform vec4 u_display_metrics;
  uniform vec2 u_cell_size;
  uniform vec4 u_geometry_metrics;
  uniform float u_pixel_scale;
  uniform float u_time;
  out vec4 color;

  ${ZS}

  float roundedBoxDistance(vec2 point, vec2 bounds, float radius) {
    vec2 delta = abs(point) - bounds + radius;
    return min(max(delta.x, delta.y), 0.0) + length(max(delta, 0.0)) - radius;
  }

  float stripeAlpha(vec2 point, vec2 bounds, float aaWidth) {
    float distance = roundedBoxDistance(point, bounds, 0.0);
    return clamp(0.5 - distance / aaWidth, 0.0, 1.0);
  }

  float dotAlpha(vec2 point, float dotEligible, float aaWidth) {
    if (dotEligible < 0.5) return 0.0;
    return clamp(
      0.5 - (length(point) - 0.75 * u_pixel_scale) / aaWidth,
      0.0,
      1.0
    );
  }

  void main() {
    vec2 displayPx = u_display_metrics.xy;
    vec2 displayCenter = u_display_metrics.zw;
    vec2 cellPx = u_cell_size;
    float inverseDpr = u_geometry_metrics.x;
    float aaWidth = inverseDpr;
    float maxStackReach = u_geometry_metrics.y;
    float maxAxisReach = u_geometry_metrics.z;
    float globeReach = u_geometry_metrics.w;
    vec2 pixel = gl_FragCoord.xy * inverseDpr;
    vec2 centeredPixel = pixel - displayCenter;
    vec2 axis = vec2(0.70710678);
    vec2 normal = vec2(0.70710678, -0.70710678);
    if (dot(centeredPixel, centeredPixel) > globeReach * globeReach) {
      color = vec4(0.0);
      return;
    }

    float stackCoord = dot(centeredPixel, normal) + displayPx.x * 0.5;
    float axisCoord = dot(centeredPixel, axis) + displayPx.y * 0.5;
    float baseStack = floor(stackCoord / cellPx.x);
    float baseAxis = floor(axisCoord / cellPx.y);
    float bestAlpha = 0.0;
    float bestDepth = -1.0;
    vec2 bestCell = vec2(0.0);
    float bestWidthPx = 0.0;
    float bestSeed = 0.0;
    float bestDotAlpha = 0.0;

    for (int stackOffset = -1; stackOffset <= 1; stackOffset++) {
      float stackIndex = baseStack + float(stackOffset);
      float stackCenter = (stackIndex + 0.5) * cellPx.x;
      if (abs(stackCoord - stackCenter) >= maxStackReach) continue;

      for (int axisOffset = -2; axisOffset <= 2; axisOffset++) {
        float axisIndex = baseAxis + float(axisOffset);
        float axisCenter = (axisIndex + 0.5) * cellPx.y;
        if (abs(axisCoord - axisCenter) >= maxAxisReach) continue;

        vec2 cell = vec2(stackIndex, axisIndex);
        ivec2 stateCoordinate = ivec2(cell) - u_state_origin;
        vec4 state = uintBitsToFloat(
          texelFetch(u_cell_state, stateCoordinate, 0)
        );
        float density = state.x;
        if (density < 0.0195 || density < bestDepth - 0.0001) continue;
        float widthPx = state.y;
        float seed = state.z;
        float dotEligible = state.w;
        vec2 cellCenter =
          displayCenter +
          normal * (stackCenter - displayPx.x * 0.5) +
          axis * (axisCenter - displayPx.y * 0.5);

        vec2 delta = pixel - cellCenter;
        vec2 rotatedPoint = vec2(dot(delta, normal), dot(delta, axis));
        float halfWidth = min(widthPx * u_pixel_scale, cellPx.x) * 0.5;
        float halfHeight = cellPx.y * 0.5 + halfWidth + aaWidth * 2.0;
        float geometryAlpha = stripeAlpha(
          rotatedPoint,
          vec2(halfWidth, halfHeight),
          aaWidth
        );
        if (geometryAlpha <= 0.001) continue;

        float candidateDotAlpha = dotAlpha(
          rotatedPoint,
          dotEligible,
          aaWidth
        );
        float candidateAlpha = max(geometryAlpha, candidateDotAlpha);
        if (
          abs(density - bestDepth) <= 0.0001 &&
          candidateAlpha <= bestAlpha
        ) continue;

        bestAlpha = candidateAlpha;
        bestDepth = density;
        bestCell = cell;
        bestWidthPx = widthPx;
        bestSeed = seed;
        bestDotAlpha = candidateDotAlpha;
      }
    }

    vec3 bestColor = STRIPE_COLOR;
    if (bestAlpha > 0.0) {
      bestColor = shimmerColor(
        STRIPE_COLOR,
        bestCell,
        bestWidthPx,
        bestSeed
      );
      if (bestDotAlpha > 0.0) {
        vec3 dotHsl = rgbToHsl(bestColor);
        dotHsl.z = clamp(dotHsl.z + 0.15, 0.0, 1.0);
        bestColor = mix(bestColor, hslToRgb(dotHsl), bestDotAlpha);
      }
    }

    color = vec4(bestColor * bestAlpha, bestAlpha);
  }
`;
    })))();
  }
  var tC, nC, rC, iC, aC, oC;
  function sC() {
    return (sC = e((() => {
      eC(), tC = (e2, t2, n2) => {
        let r2 = e2.createShader(t2);
        if (!r2) throw Error(`Unable to create globe shader`);
        return e2.shaderSource(r2, n2), e2.compileShader(r2), r2;
      }, nC = (e2) => {
        let t2 = e2.createProgram();
        if (!t2) throw Error(`Unable to create globe program`);
        return t2;
      }, rC = (e2) => {
        let t2 = e2.getExtension(`KHR_parallel_shader_compile`);
        if (typeof t2 == `object` && t2 && `COMPLETION_STATUS_KHR` in t2 && typeof t2.COMPLETION_STATUS_KHR == `number`) return t2.COMPLETION_STATUS_KHR;
      }, iC = async (e2, t2, n2, r2) => {
        if (n2 !== void 0) for (; ; ) {
          if (r2?.aborted || e2.isContextLost()) throw Error(`Globe WebGL initialization cancelled`);
          if (t2.map((t3) => e2.getProgramParameter(t3, n2)).every(Boolean)) return;
          await new Promise((e3, t3) => {
            let n3 = () => {
              window.clearTimeout(i), t3(Error(`Globe WebGL initialization cancelled`));
            }, i = window.setTimeout(() => {
              r2?.removeEventListener(`abort`, n3), e3();
            }, 0);
            r2?.addEventListener(`abort`, n3, { once: true });
          });
        }
      }, aC = (e2, t2, n2) => {
        for (let t3 of n2) if (!e2.getShaderParameter(t3, e2.COMPILE_STATUS)) return e2.getShaderInfoLog(t3) || `Globe shader failed`;
        return e2.getProgramInfoLog(t2) || `Globe program failed`;
      }, oC = async (e2, t2, n2) => {
        let r2 = null, i = null, a = null, o = null, s = null, c = null, l = null, u = null, d = null, f = null, p = null, m = null, h = null, g = () => {
          e2.deleteFramebuffer(d), e2.deleteFramebuffer(u), e2.deleteTexture(l), e2.deleteTexture(c), e2.deleteTexture(s), e2.deleteBuffer(o), e2.deleteProgram(a), e2.deleteProgram(i), e2.deleteProgram(r2);
        };
        try {
          let g2 = rC(e2);
          if (f = tC(e2, e2.VERTEX_SHADER, YS), p = tC(e2, e2.FRAGMENT_SHADER, XS), m = tC(e2, e2.FRAGMENT_SHADER, QS), h = tC(e2, e2.FRAGMENT_SHADER, $S), r2 = nC(e2), i = nC(e2), a = nC(e2), e2.attachShader(r2, f), e2.attachShader(r2, p), e2.attachShader(i, f), e2.attachShader(i, m), e2.attachShader(a, f), e2.attachShader(a, h), e2.linkProgram(r2), e2.linkProgram(i), e2.linkProgram(a), await iC(e2, [r2, i, a], g2, n2), n2?.aborted || e2.isContextLost()) throw Error(`Globe WebGL initialization cancelled`);
          if (!e2.getProgramParameter(r2, e2.LINK_STATUS)) throw Error(aC(e2, r2, [f, p]));
          if (!e2.getProgramParameter(a, e2.LINK_STATUS)) throw Error(aC(e2, a, [f, h]));
          if (!e2.getProgramParameter(i, e2.LINK_STATUS)) throw Error(aC(e2, i, [f, m]));
          if (o = e2.createBuffer(), !o) throw Error(`Unable to create globe buffer`);
          if (e2.bindBuffer(e2.ARRAY_BUFFER, o), e2.bufferData(e2.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), e2.STATIC_DRAW), e2.enableVertexAttribArray(0), e2.vertexAttribPointer(0, 2, e2.FLOAT, false, 0, 0), s = e2.createTexture(), !s) throw Error(`Unable to create globe map texture`);
          if (e2.activeTexture(e2.TEXTURE0), e2.bindTexture(e2.TEXTURE_2D, s), e2.texImage2D(e2.TEXTURE_2D, 0, e2.R8, e2.RED, e2.UNSIGNED_BYTE, t2), e2.texParameteri(e2.TEXTURE_2D, e2.TEXTURE_MIN_FILTER, e2.LINEAR), e2.texParameteri(e2.TEXTURE_2D, e2.TEXTURE_MAG_FILTER, e2.LINEAR), e2.texParameteri(e2.TEXTURE_2D, e2.TEXTURE_WRAP_S, e2.REPEAT), e2.texParameteri(e2.TEXTURE_2D, e2.TEXTURE_WRAP_T, e2.CLAMP_TO_EDGE), c = e2.createTexture(), !c) throw Error(`Unable to create globe density texture`);
          if (e2.activeTexture(e2.TEXTURE1), e2.bindTexture(e2.TEXTURE_2D, c), e2.texParameteri(e2.TEXTURE_2D, e2.TEXTURE_MIN_FILTER, e2.LINEAR), e2.texParameteri(e2.TEXTURE_2D, e2.TEXTURE_MAG_FILTER, e2.LINEAR), e2.texParameteri(e2.TEXTURE_2D, e2.TEXTURE_WRAP_S, e2.CLAMP_TO_EDGE), e2.texParameteri(e2.TEXTURE_2D, e2.TEXTURE_WRAP_T, e2.CLAMP_TO_EDGE), u = e2.createFramebuffer(), !u) throw Error(`Unable to create globe framebuffer`);
          if (l = e2.createTexture(), !l) throw Error(`Unable to create globe cell state texture`);
          if (e2.activeTexture(e2.TEXTURE2), e2.bindTexture(e2.TEXTURE_2D, l), e2.texParameteri(e2.TEXTURE_2D, e2.TEXTURE_MIN_FILTER, e2.NEAREST), e2.texParameteri(e2.TEXTURE_2D, e2.TEXTURE_MAG_FILTER, e2.NEAREST), e2.texParameteri(e2.TEXTURE_2D, e2.TEXTURE_WRAP_S, e2.CLAMP_TO_EDGE), e2.texParameteri(e2.TEXTURE_2D, e2.TEXTURE_WRAP_T, e2.CLAMP_TO_EDGE), d = e2.createFramebuffer(), !d) throw Error(`Unable to create globe cell state framebuffer`);
        } catch (e3) {
          throw g(), e3;
        } finally {
          e2.deleteShader(h), e2.deleteShader(m), e2.deleteShader(p), e2.deleteShader(f);
        }
        return { densityProgram: r2, cellStateProgram: i, stripeProgram: a, mapTexture: s, densityTexture: c, cellStateTexture: l, densityFramebuffer: u, cellStateFramebuffer: d, dispose: g };
      };
    })))();
  }
  var cC;
  function lC() {
    return (lC = e((() => {
      cC = new URL("assets/cloudflare-globe-fallback.png", scriptUrl).href;
    })))();
  }
  var uC;
  function dC() {
    return (dC = e((() => {
      uC = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAABAAAAAIACAMAAAArE+6LAAAABlBMVEUAAAD///+l2Z/dAAAACXBIWXMAAAsTAAALEwEAmpwYAAAcZ0lEQVR42u2d6Zbjtg6Eyfd/6XtycjNjyxIFcMXy1b9kut0WiCqRIJZSAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAwAVVBOwEgAUmjhOyjoBlAuAw+fsZWWeBFQPgGOk1XPz8EegPQATSX7j48C+z/8y3mgAAztF/laIM/WWWGIAdEnCO/hwOAOgk/STSmqS+U/pXGy8DWJLnnT/G3sTc/xDQ6StiYCsIVXJt+f/8W9El4yTk/oK/bI39SEC+M3/po1kC9l/Friz488cJhwQgAQM0C0t/3dEnnGPAF8+L2bGF7SBY/Ld/ljuGls7BKdML11zKj//Vcmst+ZOc/ZNdMzadAqoZXrLWOn79n372GiX+au98y31IdGCEbVYX6WX5Pv/jZm1FtC62+V+3740ftDfwmQCuWV6i1s+83jW9nAJMb/23eOfbZijZqwWYSOK7ea93HRg6Yl2ZFeDVmnH9Dgpa2ZBNjBe0swM2VRHal4CsO2EOAT6iMaLl6czl86AA+1Yh13u5eVkML4/R/2p/CVMfJKCTWZT92LmvP5oxBj33R/oaAekbWWiF8tp/dnc7ETRg4D5y4obigO3RlNH6sTv7NZbp/v9XC40+EQChPe0kh5OIbCqb/z0bQLruxZEIJFpvZ30ghwoSEQP1qj38+CWSHUwAMm32jLaDW7PFYU8wtYmLrujfXM/RdAqw6BEtWr3x4XnpL3q5r3AySwfMvAqw7PGwt+/d/ryP9Nd4PI0zLnzAmXZHCYzd/Tykqz7E/u4uBX9+FAWwWudhYxGKqHKErOMN/Sj+LsbDe6SZCnhZMD9XggX+Gw3IateJI4Zm3b7a1d1Zr/4ksTdr2q7/7EEBiO7e5HU93gTZT9eC9wPLVt6L98tLslB96SWEBBwq+1S9N18axJhVACKN8jqMdk+/xjVCI0SwimlrT5/w//ZQN5bca0UAUotBR9POt2NYGRGAzjXg+L9p//+9wrXartiuPUfe+CWe7Su7XmJo9gjSqIOZAFTy+7+n1NlaTUvA9YV1rO/7cJbRrp6USkI1BllNaPJn6xxgjLs77wC8jGqbOEtyds+zyVvb1QMjxww1c7jPafYXOwKwujxG94drPuxuerhYqd7K9PsNM7vR70n+mzm+He9R5GJUc5yDYPe7SryBvFzkD36DT1WZ3+33eBjA6CWtz2HPQQXAVCGV8s7vJblXOcT35XDZs6M8LABmMzTKshT+lyBATSwA8qa3xUgLheW/9TYERHbunKQAs7XAQ4LW2uuBigCMzLA/G8oe2XZrO3o8KsDX/qguU4AFBvQ2X3lZb2iOACOXDsLzgdEna8XFny8Dq2ju34KGlAFu/jZ97Zub38ZtA1HA4cskh/yvrZKPZpmwbKd0cxc55NUR7v0nf/u3Hm59G0kEYKiAxo8GCF7tN14lPSk9qEc3Kf0n/KzIh52TksEhYFIzA5/7gBnC324/NiGg4j/Vb4V0r9i3IwCzupm4k4DFbR3ebAD/uxLi6/TrJVjdLwC+JmKdSK1Y9GuZ6H/d8sN/gwJw53qJNlizppLsyTRUZFLb6GiwTlhg9DwBuM2+Cy2xr9n16zYOXey/3IUJhx6WE3d/tzSFrj4EgHzql7K3vsK1id+mLD05zO6CAetsCUCB/9KcqLf32xwa2arGmZCdnTaQ7EQAXhNpkrz/G6EP2TZpQgnNPH5uLvp7T0hHAKxve8WF9JH531MnvGiu8fSxCWfe/5/BCRTA+rlXUiobcQ0fMwG3tgXYMDlpwSBmLudCRb02JbZaL5os9bZzUl3aFmAWRzcF/zSugAI4ayKSRQDudjhvArlKAaY1xTJHf+BNAdrpQAFNcMkCUOf0HA/cr55W37f7B44vvtuTDgNaQD3CtVZtX3UX7b2VyfwgSS/RJI+vrYrSvXwDsL9ypZ9RAVKl+99k1/7ssqfKqKeBrOT0ZBSAPE9+ze15z2uLowB9/TyA4fts85OtDCvf1w5gHlkN7wC6GiUAT/wvFmfcmw5+1B0K4C8AgABYmwcgaAFsqSbcTfBzgTVjhADgvxk/FiVm7CkKLQ7as5nJtnUpAAQB/XTFneSuigqA4uCyeMX0y14DG7sE7O7rS27QeTfu6nGjmyPcXVNnKht8QcFNHZnRXErxrgDEBc478eNoxukeJqn6shxKmC8Axt7jywXgcSMDMQ+X8W7xwtfqEOPhxDK75Ya9dL5Ja1tkCdRge7j/eRFOviUc3SjM7LphMaF3xtoKcxYg584kNf1QvJXOUmrv3/ajAKpG1G4oLuk0KrywhLCHj6hH30ALjtauqyC8vOLFCiF5QDhrg/715JZx4L4BBbDE/5dnLyiA5RyVc/40s6mNh2xgpwqgnDvyNjSdhn/mLqhOvU5G/rqHsqB4AiANFdDi39P99AFfmpBu4HAkkE8BkPeERAB85qfYPUy6loCAOwC5upMBYDL4d1IAFvw52z2Sa422BxD/GClANul/rrGMzQmUC1dhy3IaCwL80p/gvy3+nwoALvtTZldj14JuEgCZgP+Uc3P7Z4v+CzpVnWS/NX+a8p0MvvqVW4BWcBfeHqX/iR3A8j9iblFOre3Ss78i67zhAxD3tAYcEAAjxehnBoa5VoBmEzlBihfv/PX+dm1Hr2RLKc5r0Ez52CxNMhv4k41HqAz33OZxtQ4pQIkhACWYANhYmeurpnmVAxctNPZOJgDFXAfBiXSwdgJ4nXMCzu8FsglAMddCNOgWoH19BPvMHAaMtwGIrwAxBaB9gQz5fF0MBKL/d+Aj0k2ghfV54z8CgAA4bE27ZQkC8f/1+hjWuRSAggCsW4STmV77rAv9TTFf7jVB+V9iraV980J+eylBwi1ACcn/EmUL52QDAO2cCkBMxDnCGeZ/4fbPuACgAG7eTE99UizGABjsgQD40YDiif+PaXV2T1qw37IAoAA+JOCxgtZ6sRZks3x0zC4ATnYB1yZ7zwdrgi1AVReMANifOd1qr2M4HQCaeWkMgASYbj5TdJ0EEQAgFQCo/3mq9sB/YzObEADfIQCob99Xi7qVMGYF0gslqG/dU+VBPk2PBywL/bMnAjr104+obf3N1/aRE7xbNEEjnwzu+3tRNSo0SASQ/b3EGxQEIMJO1dUlzp4ECTmrU59QyleOJgLg2xGyG/c2O1JjNBqAAMeOEM24nfORNR9Rrm9A+A+cCkA443YPSO/bANea+/2PHvjyhuK2QbMmO22Iza9/LPkFZY5GXzEFoFzrgQIaV68Xt2+zPZOYQvAfBXDiEL5XTHrsHxAA6V/k9X9rIwTAzcWtp7kLIv6XxxZHQyEQ9gBv5kIAfKQCRzbk4/CpCYZBABQ1JAgA/N9nxuuMttt2BxMMwy3A4wRA+M8G4JQhb48M6ld099fJVan0lB0O+9kBGBGA38s7TfBgUAGypv0oxwMjAEjAagF4eCnprrQqpwCh57R2BwgAArDQjuVJAPoVQNkvpX4fP1Im/fLq9yEA8ewo/m3RB740RRRoR9xtQEEBvAtAOEMKHHHPLOEMQ0sETTCBZQEIZ0ihJzaKg67n10ldsSLc8/WkSUF7uwIQ0I7iveiHX99eWE+fs+b8Pd/jQFwAGleAeGbUHEbrn8rAzyxhZaZwTVAT1N0YHgGwLQB5NgBPAnCzS5+4VEEuAi/GUidJQnujClCSC0Bp1gkUBOASEtGPiUYALAtATCNqP+fnQ+etVQnaDE5ZKAXpjTpCybQDEJQUz47cRe0GqYwBQnmjChDSiMpfbr7ZKjuAx5wKsgCcK0BJLADvvWs4AjRL/eR1AAiAXQGIaMOX33k+7T+4LGHArywJVRiAKmDTChDRgs196GXf0yjqm7tQoSoChfz+ShuE7ka3AO6N+GNI5SWBsmQAVEEY5ddq0B0FWGxIjW07eo1eiwLSj/p7EwD4zyHgXG/glQ8dKLd/Xq/vQh9AnwoQxo5DnQKbwcLnf2XU32OYEwFwogDBrCi0qOZDGyeO9JM+xXnTMN2oACS1Yn9s4bYeJu2kX/jvWwDSGpEYwMQTwFhaBoD+Rt//IYe8zx749ZAZCPXte1Ji4yEAC3yGN78nX8puN/g/2WzXbGH4b9qbsBoCsGD4T4wCkwQKgM1eGl3A/45mq7z5nQgAJpMktyEAPfP/gH0FwGLCen0EQOU+CIAPAcBimgG+8L9/4gLoq2mD/7sVU9phJNqUHwTAokMvdi4EoG961zXQXRGA9wpq0FnWjgCcODPR+iOZA9l0aQSAe3gEgC3Aqj6UCICRebooAFi6BbiezhCAswO1UACg2ANMaDwbvUF7RQDgf9g9wGg6S/hkLX8zNREAsE4BFJyB/wgAAhBLAVSkgf8n+IIAAGU60JoOd/4X0FtwP5YCQNA97q3xGS1z4P+cmYqzkgzhP7hXgNlrggDMJUK+wYDQ06AC6LnjeWS7y9De3SYMAQCCfvRzF+VS2AL/tyvA335D8B8UQXOFFQogmn0F/acKQH2enA3/wVBOcO8YXQRgmwJcimU39H1AAIKMu5y8Lq7XsbrO8Onc38F/DgEz1+WvsCAAhwSg1YXIsCzQ9uOQAJQlwowA7L0KvKYDuEt0VLVMBxsVYHTCJfzfowCadCyrAsBJ4MhdYFlxMnO3kpZJsXzOnp3zDsTcHwhsOkQWATAcFVs2a89iRRO0NKYAjE04HxZfElk3KnSw8ogAlGmlQKQAW9oCeFAAWv+bZkDPbyMAKEDn3KQERHNGAc2dgmMRCNvwZ9UzrxienIL/IQXg9rwK/wMLwAwBcfR2TLEL6LlOCtIZxHqC7KL8WpMHkxwCYNEEmsWSjHJ0tNBJBaAMflzXgxBus3oWUPiQZJSjJwWoQbv+CrPBNggAcX7z5wCFF+lSTVAAuwKgffzR30MA7O4BFG6kDDGhAGfafs9/+vHfQwDs3np2rLvo41wcCKr5KvmVgbbuD5xeqJi0Hs+rAFT9RyMAU6Yw798B9P9q1OmR0XYA4jDAmIshAPa2AAMfxgYgR0XM/Y/0fTICsGMLMPfpZ4gH/HcuAWq3ePpIixdCwbYAkx++7BGA/4YiAR9EEDYI/5x3Z3Y3WGMpwNyHn3V+qJqu0sA6GZQxzso94CYFmPz06yKIrbESwDwb6AdiVAHmPn7ZLAAogBdCIAA2BWDu488xHQIQkBMIgL2bgPVpoAu3i/DfFy0QAGNbgDMNoRq3RF1KAu0sEuNmef8f1ouxZhEEYP7z6/rLj24C4H/C7uHwf14TjtkG0Ja1TREA+OaVJ/D/bFXgdBPMNyMCgALA/zW9gRYYAQEAc++LEIA1CrDICPvvjRCAGPVCKMBCBVhn9/MCwD2AZ7YQBNyiAOvsPv7JswQADfBIGARgvwKstcGJIACXga5uBxGA/QqwzNzTUoq7Q5X/ZZcgAB5pgwAcmqhnJwYwKgDlb6QTcrnjjd+haL4EYF1d9TwBeLKovFM2xwBvEiAdH4oArHj7V3MCUMYbFcOuQALwJ4LFFmA+/2e9LucIwFig+HMPAL0cSYCszMNutMCpAsyNCozHGZoCoJ00D7kcKYDgapfO4AubA9gQgGblouzV/4f/tAeNsAVoZLTZS/1wnA60IB94fNaF8g7w+30C/aMJQHl0ZCsHvuoX8y1QyoxhN/pLomo8XgxUk8BbAmAvkxABGPzAxzFyil/k9O9dAR6OgcVBf7HsAvC5lnXKuDt9ksjlkAj8iMCP5NfqawfgVgHWtIAbSQNQvc+/f+Sv88Ard3cBL6EqFMCHAHTuxO/vKUtXkigXgZ6Tgs0kuOcQgBVD63s++HaWtJ7/FAX6zwmsXiUguwCUr8YjC5LCXvOYo3aeTxkJcCgB2QWg1JHmPONfpyIA3iVgiEYIgBGbDXQFGvcgBMCxAhS2AIkFYFgBvl4g8Clfjw3iADYsVofagvUnD/3lP5kAOZvsFCTAjABsUI77H0YAUAAU4Ky5BvKBFd+rPgsA9E8/b8/HcPSY/F9UHCL+WfgP/8/6t/xbpReA+wnGG6oPQXgBsKgAlg4MBivCO+aAIAAogGUFeDsYZz8APIwwhv8IQPUfCdBEvrNGAL6/juzbwX/47zfQZeT2wGbgD/6DuVxgxpB5u9wpAPyH/+kEoKS9AbyZYb6w/ShIxQMEwIFRfhVg4RhSkIoGCIADm9w0hMkwWh5sYAEC4MEk9WcPIDUQjEEAuAfwb5DfFrA36b3Kp0Ec4L8nBUhM/2tq7/MgQ8kDVaYEwH8EwJsxrgqgq66o9SfjEgGA/r7OAJnp/3K79/ZQd0+JACAA8N+RKVrf9OWRKgKAABADdG6KrrLp8nMAmNCXBIRjAALgwAaNLysNAHALgAA8+EmF/54coFMAamtuKILAGTjv43tzAZl1Pvb6d9MFaR6EAHi8BkMAhEGA67/RPQwBiJAJkzcWqlMAcSOx359ADEiFz/T8xb0AlFcB0PcehHNJa+FqMgt49QKZAKjaiHEksLz4eVtiIACvCtAdAmgJwGvvEVgZfKhOhud37ANN43zd8DXyBy8FxwoLsUco8YdqkQvt5RDwfeHXFID6+4N9RkICEgzVIxnaT1VQeRgoVJ6nMIgEoHWJCDWjD9UMbQXXntA6nNfffcHrMHG1qZg0nEEAQiuAZ1fQTCMW/oLSWNwVlBRTtWmKarZNsHgcuXqusMRc8D+JAlR7w7IS878Uzbf/jPNNnN76FVlEBRIIQEUAjLmDWgDeU03erPwQhmAfgAAgAIZPAeIPFZj5NrcIBUggAAEVIIJPTP08aSTgJg8JjrIFQAAO3gaMP81PixCF1VAAwoAcAs6bYbDaRBkIJCUglwQUtgDmHWK9lakOQgAQgOgS0G8zRCCuAgQ0Q1DPWCMsUgVAAhAABMBEpfDnJLFLNZDOwqrLRxdtplEABCDou+rS2ePmukD85D92EpuNbQA1QdwCWMkW/H2Ja22tLkRCABAABMBKL7mx3KF6lx8gKC2GrbQFQAGMVQ1MeGLRdeA/WQGwtdAYCAGwExOYVb5Lz+CMAhDXCJkOAbOeloQAeoMiAIka0vcQHNMGUoDINsCjXsiMiRgPgACkCRPwKkcBEAAkgL5/CEAO/rfqW5MOnaPzLwqQJgKAALxZBAHILgAlqwDUpN60tvEY8KUA8Z8+99FXxn8EIK0CxH/24cbbkfmPALADyCgAwd3+p8IfAUABEIAsbv/xcFUsAGgAApBnQHDoHIGf/v6v4//YBSRWgIwCENrna88E4HFroB9OJSChAIR+6WnNURGA3AqQmv81pdcgAEhAVgEIXyegtsmauUODPwW2KUCqO4DwdUIdVplnD0E7cehvTgJSpQEGF4Aew2w0CBcNFiUgUyFg8Erhf2/zlcbZaBHYb1ECMnUCYAPw8/zbTMLb36gChH1WwWfjJdvcgUQjowoQ9lELAmBNAOCxQQWI+qhbRuxmsRuIqwBBH7UgACgAy+t0udc9VmBfp4cqAoAAvD0V/EcCWODoAiD9ZFwDCcguACEfNpcAHHcM9MLvOpdkAhCM/0ayQ1AAr4sd9WlzhADtZIhzaEAAPAhArHOupSIxFAABcKAAkfhvrEwcBUAALD1vcAGoWzrFoAD5euXG3gJEEYBaLbaLRABCjMuJ8cCx7wBq4qlxCAACgAAgAPA//qouvgbAF1AASj0SRwHxBRSAYu+8OwD4jwKkW/U0T1wQABQAAXC+kktrAdgNogDJFj3LE4vnZiMAKECiRU/yyDlK1xAA+I8ApHXVWtkCIAAJlhBXRQAAAoCrIgAg5RLiqkYUAP4hAD4eGm9AAFjyOEuIpyIAAAHAUzkDwP+UK4ijsgUAaTcA6gfHIRAAljvW+uGmCABIvHx4KTXBIPPq4aTnBQAGBuyOE+3R8QgEgNWOuHr4KAKAAGRePXwUAUAAEi8eLkpnUAQg89rhofQGRwASrx0eOuAUbCITC0CSx8cpZIaB/8kEIMnj4xRdo5EQAAQgxOPjFHKTwP9MApDi8XEKlUXgP/yPZAB8onMwQi3wP7gAxDcAPtFjFR3/EQAEwJQFcIZbn1D+ovoSEXiphwu7cHjjrEmnGv7XwW/IKh0picfumRyj8zc3ZFij2TTFATZdak+JBR4J/0GcTEIUwH4IEHMBSznWuOTuKwAMBizlWOKSCADILQA4JfwHgSqKUABG4wAEgEAgGwCQsqaw6y8QDeAOAHhxMAsZi4DJOGBvSuEKR8JDGYwDnCQHLri2w0VpiAlwX1wVAQCp3RdbwH+Q2IUxBAIA8vowZmAoDsjmu2QCsQMA3l7Vs9zq3w9jA3Ck9ysAp1N28FYEAOSN2f/9JHx1UaY2hgVmuy/zopoVRyEAABCAzIFU+A92CwD8N7MejMUC7rJ28NH1RwBsA4wOYMFJd8QBMQyw77BYY1kIAOOA8KkEmJMAIID/2BP+A/iPAGBcwOk/Pf+xC4D/CAAAdP+C/wDQ/itVBBDLALr/IAEAANIAAADwHwCQpx0g1gGADQAAIJ0AYBojc/QA4A4g8TBdACgEQAAAQADIdgGATGAAwDoBwCoA5FUAbAIAAnB/L4U8AJBSANghAJAiCAD/ASAKeNs9HIMBEFwCMAkAObssogAAcArAJgAknNeMAADAHgAJAAAJAABwHwgAYBcAAMgTDwQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAJSDXcMxAwCJhwZgCADSTg3CFgAkJD92AAD2AwCI+gEAiPoBz4vr87MBgT//49eta/vYd8RncFfwbM6VNq3ab6P6N80jsua8/cET/VfZVfTBz9+k1tdvWsVg2QM4LKZYwP0lxv3n40SfWzsw8rtIg1+nxRIL6X/z/l3w8TaBYxD9T8/8Kxv07KgVAQCk/3gmfz9LqnfgJ2wB4H4nQ2oY4DLcAUTJj9xHjhoOZA9Ycms0Whoj/T3A71CAGhr41+lzPyui2uVv5n/NAjzt1Lk/4VLIHvQkBWpCwMkzG9ugK/Fw6yZ73NPeX7MCXh7I/gu3DOpN+3HGFfiPBFi6wPJa1hrC8ytAE7YWqjkw+Z8v9fH11oflTng5fEcFtheqWTe3nb06/EcDDlJ2vPlKIynDrq0T+TYsRwBEN9ETyVSM7wBwfJBWAD6Ou38Owrd2qCPZrYaNjdeDzO9/oQ36LWTY3Lg88M3/693OzO2/JqXkN3Jg3+A4PPD//v/87k/PsrIM/PLrqk+E/wD+L5KDS+zNIhXY/gPIvyKl7rE62hQfiAAA2L/fSS3wgdg/gP22nHPnX4X9APrTlQFDA+ifyy0xMsAb6cqGbQH8z+Kg2BSk98uaylERVICXCvLtsSzkBykVANtiZZDJSzHu0vbaODMwpgA/c5qx7Khswn7gRgbuPh5LTmgshAAAHxuB28/HkMOtBREA4OMg8PwXMGVv1AQBAJ4CgPkCWIuzI4i4gpAFgBmt+/TjEz4cHwcUANszs+Cn5iwcTg54/1u0dq8AQHsQgP833ySfzb86h75ZCdqDuAqA9bEioFiFNRAOGMZ8gK5U4dcBqwC2ASnXAWOAJCKA6d9GhwMQVwUwOgB0BwEAuJeAnt/G2gC4k4HL2M0yLiHYGwCTKvDL6nU7CQwOgHlN2HymAABYUoDFJw4sDEA6AQAAIAAAAAQAAIAAAAAQAAAAAgAAQAAAAAgAAAABAAAgAAAABAAAgAAAABAAAMB0AfgfyTq53yESbYkAAAAASUVORK5CYII=";
    })))();
  }
  eC();
  sC();
  lC();
  dC();
  const mC = 3e4, hC = 1e3 / 24, gC = 1e-3, _C = 2, vC = 1e3 / 9, yC = 2, bC = 7, xC = 5, SC = (e2) => -18 + e2 / mC * 360, CC = (e2, t2, n2, r2, i) => {
    let a = Math.floor((e2 * 0.5 - i) / n2) - 1, o = Math.floor((e2 * 0.5 + i) / n2) + 1, s = Math.floor((t2 * 0.5 - i) / r2) - 2, c = Math.floor((t2 * 0.5 + i) / r2) + 2;
    return { originX: a, originY: s, width: o - a + 1, height: c - s + 1 };
  };
  const n = { current: canvas }, r = { current: fallback }, t = 1;
  const dispose = (() => {
    let e2 = n.current, i = r.current;
    if (!e2 || !i) return;
    let a = false, o = false, s = 0, c = 0, l = 0, u, d, f, p, m = new AbortController(), h = window.matchMedia?.(`(prefers-reduced-motion: reduce)`).matches ?? false, g = () => {
      c !== 0 && (window.clearTimeout(c), c = 0), s !== 0 && (cancelAnimationFrame(s), s = 0);
    }, _ = () => {
      o = true, g(), i.hasAttribute(`src`) || (i.src = cC), i.style.display = `block`, e2.style.display = `none`;
    }, v = () => {
      m.abort(), _();
    };
    return e2.addEventListener(`webglcontextlost`, v), h ? _() : (async () => {
      let n2 = e2.getContext(`webgl2`, { alpha: true, antialias: false, depth: false, powerPreference: `low-power` });
      if (!n2) {
        _();
        return;
      }
      let r2 = new Image();
      r2.decoding = `async`, r2.src = uC;
      try {
        await r2.decode();
      } catch {
        a || _();
        return;
      }
      if (a || o) return;
      let i2;
      try {
        i2 = await oC(n2, r2, m.signal);
      } catch {
        a || _();
        return;
      }
      if (a || o) {
        i2.dispose();
        return;
      }
      let { densityProgram: h2, cellStateProgram: v2, stripeProgram: y, mapTexture: ee, densityTexture: te, cellStateTexture: ne, densityFramebuffer: re, cellStateFramebuffer: ie, dispose: ae } = i2;
      u = ae;
      let oe = n2.getUniformLocation(h2, `u_grid_resolution`), se = n2.getUniformLocation(h2, `u_display_resolution`), ce = n2.getUniformLocation(h2, `u_rotation`), le = n2.getUniformLocation(v2, `u_display_metrics`), ue = n2.getUniformLocation(v2, `u_cell_size`), de = n2.getUniformLocation(v2, `u_state_origin`), fe = n2.getUniformLocation(v2, `u_pixel_scale`), pe = n2.getUniformLocation(v2, `u_time`), me = n2.getUniformLocation(y, `u_display_metrics`), he = n2.getUniformLocation(y, `u_cell_size`), ge = n2.getUniformLocation(y, `u_geometry_metrics`), _e = n2.getUniformLocation(y, `u_pixel_scale`), ve = n2.getUniformLocation(y, `u_time`), ye = n2.getUniformLocation(y, `u_state_origin`);
      n2.useProgram(h2), n2.uniform1i(n2.getUniformLocation(h2, `u_map`), 0), n2.useProgram(v2), n2.uniform1i(n2.getUniformLocation(v2, `u_density`), 1), n2.useProgram(y), n2.uniform1i(n2.getUniformLocation(y, `u_cell_state`), 2);
      let be = e2, b = n2, xe = be.closest(".auth-brand-side") || be.parentElement, Se = xe ? window.getComputedStyle(xe) : void 0, Ce = (e3) => e3 === `clip` || e3 === `hidden`, we = Ce(Se?.overflowX), Te = Ce(Se?.overflowY), Ee = xe && (we || Te) ? xe : void 0, De = 0, Oe = 0, ke = 0, Ae = 0, je = -1, Me = false, Ne = true, Pe = document.visibilityState !== `hidden`, Fe = false, Ie = true, Le = e2.getBoundingClientRect(), Re = Math.max(1, Math.round(Le.width)), ze = Math.max(1, Math.round(Le.height)), Be = 0, Ve = 1, He = 0, Ue = 1, We = (e3, t2) => {
        let n3 = Math.max(1, Math.round(e3)), r3 = Math.max(1, Math.round(t2));
        return n3 === Re && r3 === ze ? false : (Re = n3, ze = r3, true);
      }, Ge = (e3) => {
        if (!Ee) return false;
        let t2 = e3 ?? be.getBoundingClientRect();
        if (t2.width <= 0 || t2.height <= 0) return false;
        let n3 = Ee.getBoundingClientRect(), r3 = (e4) => Math.min(1, Math.max(0, e4)), i3 = we ? r3((n3.left - t2.left) / t2.width) : 0, a2 = we ? r3((n3.right - t2.left) / t2.width) : 1, o2 = Te ? r3((n3.top - t2.top) / t2.height) : 0, s2 = Te ? r3((n3.bottom - t2.top) / t2.height) : 1, c2 = i3 !== Be || a2 !== Ve || o2 !== He || s2 !== Ue;
        return Be = i3, Ve = a2, He = o2, Ue = s2, c2;
      };
      Ge(Le);
      let Ke = (e3, t2) => {
        let n3 = Math.max(0, Math.floor(Be * e3)), r3 = Math.min(e3, Math.ceil(Ve * e3)), i3 = Math.max(0, Math.floor((1 - Ue) * t2)), a2 = Math.min(t2, Math.ceil((1 - He) * t2));
        if (!(n3 > 0 || r3 < e3 || i3 > 0 || a2 < t2)) {
          Fe && (Fe = (b.disable(b.SCISSOR_TEST), false));
          return;
        }
        Fe || (Fe = (b.enable(b.SCISSOR_TEST), true)), b.scissor(n3, i3, Math.max(0, r3 - n3), Math.max(0, a2 - i3));
      }, qe = () => {
        c = 0, s === 0 && !a && !o && Pe && Ne && (s = requestAnimationFrame(Ye));
      }, Je = (e3 = performance.now(), t2 = false) => {
        if (s !== 0 || c !== 0 || a || o || !Pe || !Ne) return;
        let n3 = t2 || !Me ? 0 : Math.max(0, hC - (e3 - l) - _C);
        n3 === 0 ? qe() : c = window.setTimeout(qe, n3);
      };
      function Ye(e3) {
        if (s = 0, a || o || !Pe || !Ne) return;
        let n3 = e3 - l;
        if (Me) {
          if (n3 + _C < hC) {
            Je(e3);
            return;
          }
          let t2 = Math.max(1, Math.floor((n3 + gC) / hC));
          l += t2 * hC;
        } else l = e3;
        let r3 = Re, i3 = ze, c2 = Math.min(yC, window.devicePixelRatio || 1), u2 = Math.round(r3 * c2), d2 = Math.round(i3 * c2), f2 = 1 / c2, p2 = u2 * f2, m2 = d2 * f2, g2 = bC * t, _2 = xC * t, ae2 = g2 * 0.5 + f2 * 0.5, xe2 = _2 * 0.5 + g2 * 0.5 + f2 * 2.5, Se2 = Math.hypot(p2, m2) * 0.5 + g2 + _2 + ae2 + xe2;
        if (be.width !== u2 || be.height !== d2 || De === 0) {
          be.width = u2, be.height = d2, De = Math.ceil(r3 / (bC * t)), Oe = Math.ceil(i3 / (xC * t)), b.activeTexture(b.TEXTURE1), b.bindTexture(b.TEXTURE_2D, te), b.texImage2D(b.TEXTURE_2D, 0, b.R8, De, Oe, 0, b.RED, b.UNSIGNED_BYTE, null), b.bindFramebuffer(b.FRAMEBUFFER, re), b.framebufferTexture2D(b.FRAMEBUFFER, b.COLOR_ATTACHMENT0, b.TEXTURE_2D, te, 0);
          let e4 = CC(p2, m2, g2, _2, Se2);
          ke = e4.width, Ae = e4.height, b.activeTexture(b.TEXTURE2), b.bindTexture(b.TEXTURE_2D, ne), b.texImage2D(b.TEXTURE_2D, 0, b.RGBA32UI, ke, Ae, 0, b.RGBA_INTEGER, b.UNSIGNED_INT, null), b.bindFramebuffer(b.FRAMEBUFFER, ie), b.framebufferTexture2D(b.FRAMEBUFFER, b.COLOR_ATTACHMENT0, b.TEXTURE_2D, ne, 0), b.useProgram(v2), b.uniform4f(le, p2, m2, p2 * 0.5, m2 * 0.5), b.uniform2f(ue, g2, _2), b.uniform2i(de, e4.originX, e4.originY), b.uniform1f(fe, t), b.useProgram(y), b.uniform4f(me, p2, m2, p2 * 0.5, m2 * 0.5), b.uniform2f(he, g2, _2), b.uniform4f(ge, f2, ae2, xe2, Se2), b.uniform1f(_e, t), b.uniform2i(ye, e4.originX, e4.originY), je = -1, Ie = true;
        }
        let Ce2 = Math.floor(e3 / vC);
        if (Ce2 !== je) {
          je = Ce2;
          let e4 = Ce2 * vC;
          Fe && (Fe = (b.disable(b.SCISSOR_TEST), false)), b.bindFramebuffer(b.FRAMEBUFFER, re), b.viewport(0, 0, De, Oe), b.useProgram(h2), b.activeTexture(b.TEXTURE0), b.bindTexture(b.TEXTURE_2D, ee), Ie && (Ie = (b.uniform2f(oe, De, Oe), b.uniform2f(se, r3, i3), false)), b.uniform1f(ce, SC(e4) * Math.PI / 180), b.drawArrays(b.TRIANGLES, 0, 6);
        }
        Fe && (Fe = (b.disable(b.SCISSOR_TEST), false)), b.bindFramebuffer(b.FRAMEBUFFER, ie), b.viewport(0, 0, ke, Ae), b.useProgram(v2), b.activeTexture(b.TEXTURE1), b.bindTexture(b.TEXTURE_2D, te), b.uniform1f(pe, e3 / 1e3), b.drawArrays(b.TRIANGLES, 0, 6), b.bindFramebuffer(b.FRAMEBUFFER, null), b.viewport(0, 0, u2, d2), b.useProgram(y), b.activeTexture(b.TEXTURE2), b.bindTexture(b.TEXTURE_2D, ne), b.uniform1f(ve, e3 / 1e3), Ke(u2, d2), b.drawArrays(b.TRIANGLES, 0, 6), Me = true, Je(e3);
      }
      d = new ResizeObserver((e3) => {
        let t2 = e3.find((e4) => e4.target === be)?.target.getBoundingClientRect();
        t2 && We(t2.width, t2.height) && (Ie = true), Ge(t2);
      }), d.observe(e2), Ee && d.observe(Ee), f = new IntersectionObserver(([e3]) => {
        if (!e3) return;
        let t2 = e3.isIntersecting;
        t2 !== Ne && (Ne = t2, Ne ? Je(performance.now(), true) : g());
      }), f.observe(e2), p = () => {
        Pe = document.visibilityState !== `hidden`, Pe ? Je(performance.now(), true) : g();
      }, document.addEventListener(`visibilitychange`, p), Je();
    })(), () => {
      a = true, m.abort(), g(), d?.disconnect(), f?.disconnect(), e2.removeEventListener(`webglcontextlost`, v), p && document.removeEventListener(`visibilitychange`, p), u?.();
    };
  })();
  window.addEventListener("pagehide", (event) => {
    if (!event.persisted) dispose?.();
  });
})();
