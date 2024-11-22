// Mandelbrot.js

// Ensure the script runs after the DOM is fully loaded
window.addEventListener('DOMContentLoaded', () => {
    // Initialize both fractals
    drawFractal(document.getElementById('mandelbrotCanvas'), 'mandelbrot');
    drawFractal(document.getElementById('juliaCanvas'), 'julia');
  });
  
  // Function to initialize WebGPU
  async function initWebGPU(canvas) {
    if (!navigator.gpu) {
      alert("WebGPU is not supported in your browser.");
      throw new Error("WebGPU not supported");
    }
  
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
      alert("Failed to get GPU adapter.");
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
  
  // WGSL Shader Code
  const shaderCode = `
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
  
  // Custom modulus function
  fn mod_func(x: f32, y: f32) -> f32 {
      return x - y * floor(x / y);
  }
  
  @fragment
  fn fsMain(input: VertexOut) -> @location(0) vec4<f32> {
    // Define the view window
    let scale = 1.5;
    let aspectRatio = 1.0; // Assuming square canvas
    let x = input.fragCoord.x * scale * aspectRatio;
    let y = input.fragCoord.y * scale;
    
    var z = vec2<f32>(0.0, 0.0);
    var c = vec2<f32>(0.0, 0.0);
  
    if (mode == 0u) {
      // Mandelbrot Set: c is the current pixel
      c = vec2<f32>(x, y);
      z = vec2<f32>(0.0, 0.0);
    } else {
      // Julia Set: c is a uniform
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
  
    // Color mapping based on iteration count
    if (iter == iterationCount) {
      // Points inside the set are colored black
      return vec4<f32>(0.0, 0.0, 0.0, 1.0);
    } else {
      // Points outside the set are colored based on the number of iterations
      let t = f32(iter) / f32(iterationCount);
      // HSV to RGB conversion for vibrant colors
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
  `;
  
  // Function to draw either Mandelbrot or Julia set
  async function drawFractal(canvas, type) {
    const { device, context, format } = await initWebGPU(canvas);
  
    const shaderModule = device.createShaderModule({
      code: shaderCode,
    });
  
    const pipeline = device.createRenderPipeline({
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
  
    // Create uniform buffers
    const iterationBuffer = device.createBuffer({
      size: 4, // u32
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
  
    const cValueBuffer = device.createBuffer({
      size: 8, // vec2<f32>
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
  
    const modeBuffer = device.createBuffer({
      size: 4, // u32
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
  
    // Create bind group
    const bindGroup = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: iterationBuffer } },
        { binding: 1, resource: { buffer: cValueBuffer } },
        { binding: 2, resource: { buffer: modeBuffer } },
      ],
    });
  
    // Initial uniform values
    const initialIterations = 200;
    device.queue.writeBuffer(iterationBuffer, 0, new Uint32Array([initialIterations]));
  
    let initialC;
    let mode;
    if (type === 'mandelbrot') {
      // For Mandelbrot set
      initialC = new Float32Array([0.0, 0.0]); // Not used, but required
      mode = 0;
    } else {
      // For Julia set
      initialC = new Float32Array([0.0, 0.0]);
      mode = 1;
    }
    device.queue.writeBuffer(cValueBuffer, 0, initialC);
    device.queue.writeBuffer(modeBuffer, 0, new Uint32Array([mode]));
  
    // Function to render the fractal
    function render() {
      const commandEncoder = device.createCommandEncoder();
      const textureView = context.getCurrentTexture().createView();
  
      const renderPassDescriptor = {
        colorAttachments: [{
          view: textureView,
          clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 1.0 },
          loadOp: 'clear',
          storeOp: 'store',
        }],
      };
  
      const passEncoder = commandEncoder.beginRenderPass(renderPassDescriptor);
      passEncoder.setPipeline(pipeline);
      passEncoder.setBindGroup(0, bindGroup);
      passEncoder.draw(6, 1, 0, 0);
      passEncoder.end();
  
      device.queue.submit([commandEncoder.finish()]);
    }
  
    render(); // Initial render
  
    // Handle iteration slider
    const iterationsSlider = document.getElementById('iterations');
    const iterationValueSpan = document.getElementById('iterationValue');
  
    iterationsSlider.addEventListener('input', () => {
      const iterations = parseInt(iterationsSlider.value);
      iterationValueSpan.textContent = iterations;
      device.queue.writeBuffer(iterationBuffer, 0, new Uint32Array([iterations]));
      render();
    });
  
    // If Julia set, add draggable point
    if (type === 'julia') {
      let isDragging = false;
  
      const cRealSpan = document.getElementById('cReal');
      const cImagSpan = document.getElementById('cImag');
  
      canvas.addEventListener('mousedown', (e) => {
        isDragging = true;
        updateCValue(e);
      });
  
      canvas.addEventListener('mousemove', (e) => {
        if (isDragging) {
          updateCValue(e);
        }
      });
  
      canvas.addEventListener('mouseup', () => {
        isDragging = false;
      });
  
      canvas.addEventListener('mouseleave', () => {
        isDragging = false;
      });
  
      function updateCValue(e) {
        const rect = canvas.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / canvas.width) * 2 - 1; // Map to [-1, 1]
        const y = ((e.clientY - rect.top) / canvas.height) * -2 + 1; // Map to [1, -1]
  
        device.queue.writeBuffer(cValueBuffer, 0, new Float32Array([x, y]));
        render();
  
        // Update displayed c values with precision
        cRealSpan.textContent = x.toFixed(2);
        cImagSpan.textContent = y.toFixed(2);
      }
    }
  }
  