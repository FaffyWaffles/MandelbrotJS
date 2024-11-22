// shader.js
import { CANVAS, FRACTAL, currentC } from './fractal.js';

export class WebGPURenderer {
   static async init(canvas) {
       if (!navigator.gpu) {
           throw new Error("WebGPU not supported");
       }

       const adapter = await navigator.gpu.requestAdapter();
       if (!adapter) {
           throw new Error("No GPU adapter available");
       }

       const device = await adapter.requestDevice();
       const context = canvas.getContext('webgpu');
       const format = navigator.gpu.getPreferredCanvasFormat();

       context.configure({
           device: device,
           format: format,
           alphaMode: 'opaque',
       });

       return { device, context, format };
   }

   static createShaderModule(device) {
       return device.createShaderModule({
           code: `
               struct VertexOut {
                   @builtin(position) position: vec4<f32>,
                   @location(0) fragCoord: vec2<f32>,
               };

               @vertex
               fn vsMain(@builtin(vertex_index) VertexIndex : u32) -> VertexOut {
                   var positions = array<vec2<f32>, 6>(
                       vec2<f32>(-1.0, -1.0),
                       vec2<f32>(1.0, -1.0),
                       vec2<f32>(-1.0, 1.0),
                       vec2<f32>(-1.0, 1.0),
                       vec2<f32>(1.0, -1.0),
                       vec2<f32>(1.0, 1.0)
                   );

                   var output : VertexOut;
                   output.position = vec4<f32>(positions[VertexIndex], 0.0, 1.0);
                   output.fragCoord = positions[VertexIndex];
                   return output;
               }

               @group(0) @binding(0) var<uniform> iterationCount: u32;
               @group(0) @binding(1) var<uniform> cValue: vec2<f32>;
               @group(0) @binding(2) var<uniform> mode: u32;

               fn mod_func(x: f32, y: f32) -> f32 {
                   return x - y * floor(x / y);
               }

               @fragment
               fn fsMain(input: VertexOut) -> @location(0) vec4<f32> {
                   let coords = vec2<f32>(
                       input.fragCoord.x * ${FRACTAL.scale} * ${CANVAS.aspectRatio},
                       input.fragCoord.y * ${FRACTAL.scale}
                   );

                   var x = coords.x;
                   if (mode == 0u) {
                       x = x - 0.5;
                   }
                   let y = coords.y;

                   var z = vec2<f32>(0.0, 0.0);
                   var c = vec2<f32>(0.0, 0.0);

                   if (mode == 0u) {
                       c = vec2<f32>(x, y);
                       z = vec2<f32>(0.0, 0.0);
                   } else {
                       c = cValue;
                       z = vec2<f32>(x, y);
                   }

                   var iter = 0u;
                   var zSquared = dot(z, z);
                   loop {
                       if (iter >= iterationCount || zSquared > 4.0) {
                           break;
                       }
                       z = vec2<f32>(
                           z.x * z.x - z.y * z.y + c.x,
                           2.0 * z.x * z.y + c.y
                       );
                       zSquared = dot(z, z);
                       iter = iter + 1u;
                   }

                   if (iter == iterationCount) {
                       return vec4<f32>(0.0, 0.0, 0.0, 1.0);
                   } else {
                       let t = f32(iter) / f32(iterationCount);
                       let hue = 360.0 * t;
                       let saturation = 1.0;
                       let value = 1.0;

                       let c_val = value * saturation;
                       let x_val = c_val * (1.0 - abs(mod_func(hue / 60.0, 2.0) - 1.0));
                       let m = value - c_val;

                       var rgb = vec3<f32>(0.0, 0.0, 0.0);

                       if (hue < 60.0) {
                           rgb = vec3<f32>(c_val, x_val, 0.0);
                       } else if (hue < 120.0) {
                           rgb = vec3<f32>(x_val, c_val, 0.0);
                       } else if (hue < 180.0) {
                           rgb = vec3<f32>(0.0, c_val, x_val);
                       } else if (hue < 240.0) {
                           rgb = vec3<f32>(0.0, x_val, c_val);
                       } else if (hue < 300.0) {
                           rgb = vec3<f32>(x_val, 0.0, c_val);
                       } else {
                           rgb = vec3<f32>(c_val, 0.0, x_val);
                       }

                       rgb = rgb + vec3<f32>(m, m, m);
                       return vec4<f32>(rgb, 1.0);
                   }
               }
           `
       });
   }

   static setupPipeline(device, format, shaderModule) {
       return device.createRenderPipeline({
           layout: 'auto',
           vertex: {
               module: shaderModule,
               entryPoint: 'vsMain',
           },
           fragment: {
               module: shaderModule,
               entryPoint: 'fsMain',
               targets: [{ format }],
           },
           primitive: {
               topology: 'triangle-list',
           },
       });
   }

   static createBuffers(device) {
       const iterationBuffer = device.createBuffer({
           size: 4,
           usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
       });

       const cValueBuffer = device.createBuffer({
           size: 8,
           usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
       });

       const modeBuffer = device.createBuffer({
           size: 4,
           usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
       });

       return { iterationBuffer, cValueBuffer, modeBuffer };
   }
}