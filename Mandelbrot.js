// Mandelbrot.js

// Global 'c' value shared between Mandelbrot and Julia sets
let currentC = { x: 0.0, y: 0.0 };

// Canvas dimensions
const canvasWidth = 800;  // Updated width
const canvasHeight = 600; // Updated height
const aspectRatio = canvasWidth / canvasHeight;

// Global scale
const scale = 1.5;

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

// WGSL Shader Code with template literals to inject scale and aspectRatio
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
  let coords = vec2<f32>(
    input.fragCoord.x * ${scale} * ${aspectRatio},
    input.fragCoord.y * ${scale}
  );

  var x = coords.x;
  if (mode == 0u) {
    x = x - 0.5;
  }
  let y = coords.y;

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

// Function to draw markers on the marker canvases
function drawMarker(markerCanvas, c) {
  const ctx = markerCanvas.getContext('2d');
  // Clear previous marker
  ctx.clearRect(0, 0, markerCanvas.width, markerCanvas.height);

  // Convert 'c' coordinates to canvas coordinates
  const x = ((c.x + scale * aspectRatio) / (2.0 * scale * aspectRatio)) * markerCanvas.width;
  const y = ((scale - c.y) / (2.0 * scale)) * markerCanvas.height;

  // Draw a red circle to represent 'c'
  ctx.beginPath();
  ctx.arc(x, y, 5, 0, 2 * Math.PI);
  ctx.strokeStyle = 'red';
  ctx.lineWidth = 2;
  ctx.stroke();
}

// Function to update 'c' and synchronize both markers and Julia set
function updateC(newC, sharedState) {
  currentC.x = newC.x;
  currentC.y = newC.y;

  // Update uniform buffer for Julia set
  if (sharedState.juliaBuffers && sharedState.juliaBuffers.cValueBuffer) {
    sharedState.juliaDevice.queue.writeBuffer(sharedState.juliaBuffers.cValueBuffer, 0, new Float32Array([currentC.x, currentC.y]));
  }

  // Redraw Julia set with new 'c'
  if (sharedState.juliaRender) {
    sharedState.juliaRender();
  }

  // Update markers on both canvases
  drawMarker(document.getElementById('mandelbrotMarkerCanvas'), currentC);
  drawMarker(document.getElementById('juliaMarkerCanvas'), currentC);

  // Update displayed 'c' values
  document.getElementById('cReal').textContent = currentC.x.toFixed(2);
  document.getElementById('cImag').textContent = currentC.y.toFixed(2);
}

// References to Julia set device and buffers
let deviceJulia;

// Function to draw either Mandelbrot or Julia set
async function drawFractal(canvas, markerCanvas, type, sharedState) {
  const { device, context, format } = await initWebGPU(canvas);

  // Store device reference
  if (type === 'julia') {
    deviceJulia = device;
  }

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
    initialC = new Float32Array([currentC.x, currentC.y]);
    mode = 1;
  }
  device.queue.writeBuffer(cValueBuffer, 0, initialC);
  device.queue.writeBuffer(modeBuffer, 0, new Uint32Array([mode]));

  // Create a function to render the fractal
  const render = () => {
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
  };

  // Initial render
  render();

  // Store references in sharedState for synchronization
  if (type === 'julia') {
    sharedState.juliaBuffers = {
      iterationBuffer: iterationBuffer,
      cValueBuffer: cValueBuffer,
    };
    sharedState.juliaDevice = device;
    sharedState.juliaRender = render;
  } else if (type === 'mandelbrot') {
    sharedState.mandelbrotBuffers = {
      iterationBuffer: iterationBuffer,
    };
    sharedState.mandelbrotDevice = device;
    sharedState.mandelbrotRender = render;
  }

  // Function to update 'c' from Julia set interactions
  function updateCFromJulia(e) {
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // Convert mouse coordinates to 'c' in complex plane
    const x = (mouseX / canvas.width) * 2 * scale * aspectRatio - scale * aspectRatio;
    const y = (mouseY / canvas.height) * -2 * scale + scale;

    // Update global 'c' and synchronize both markers and Julia set
    updateC({ x: x, y: y }, sharedState);
  }

  // Function to update 'c' from Mandelbrot set interactions
  function updateCFromMandelbrot(e) {
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // Convert mouse coordinates to 'c' in complex plane
    const x = (mouseX / canvas.width) * 2 * scale * aspectRatio - scale * aspectRatio;
    const y = (mouseY / canvas.height) * -2 * scale + scale;

    // Update global 'c' and synchronize both markers and Julia set
    updateC({ x: x, y: y }, sharedState);
  }

  // Add draggable point interactions
  if (type === 'julia' || type === 'mandelbrot') {
    let isDragging = false;

    canvas.addEventListener('mousedown', (e) => {
      isDragging = true;
      if (type === 'julia') {
        updateCFromJulia(e);
      } else if (type === 'mandelbrot') {
        updateCFromMandelbrot(e);
      }
    });

    canvas.addEventListener('mousemove', (e) => {
      if (isDragging) {
        if (type === 'julia') {
          updateCFromJulia(e);
        } else if (type === 'mandelbrot') {
          updateCFromMandelbrot(e);
        }
      }
    });

    canvas.addEventListener('mouseup', () => {
      isDragging = false;
    });

    canvas.addEventListener('mouseleave', () => {
      isDragging = false;
    });
  }

  // Initial marker drawing
  drawMarker(markerCanvas, currentC);
}

// Function to update 'c' and synchronize markers and Julia set
function updateC(newC, sharedState) {
  currentC.x = newC.x;
  currentC.y = newC.y;

  // Update uniform buffer for Julia set
  if (sharedState.juliaBuffers && sharedState.juliaBuffers.cValueBuffer) {
    sharedState.juliaDevice.queue.writeBuffer(sharedState.juliaBuffers.cValueBuffer, 0, new Float32Array([currentC.x, currentC.y]));
  }

  // Redraw Julia set with new 'c'
  if (sharedState.juliaRender) {
    sharedState.juliaRender();
  }

  // Update markers on both canvases
  drawMarker(document.getElementById('mandelbrotMarkerCanvas'), currentC);
  drawMarker(document.getElementById('juliaMarkerCanvas'), currentC);

  // Update displayed 'c' values
  document.getElementById('cReal').textContent = currentC.x.toFixed(2);
  document.getElementById('cImag').textContent = currentC.y.toFixed(2);
}

// Initialize both fractals after DOM is loaded
window.addEventListener('DOMContentLoaded', async () => {
  const sharedState = {};

  // Initialize Mandelbrot Set
  await drawFractal(document.getElementById('mandelbrotCanvas'), document.getElementById('mandelbrotMarkerCanvas'), 'mandelbrot', sharedState);

  // Initialize Julia Set
  await drawFractal(document.getElementById('juliaCanvas'), document.getElementById('juliaMarkerCanvas'), 'julia', sharedState);

  // Setup iteration slider to update both Mandelbrot and Julia sets
  const iterationsSlider = document.getElementById('iterations');
  const iterationValueSpan = document.getElementById('iterationValue');

  iterationsSlider.addEventListener('input', () => {
    const iterations = parseInt(iterationsSlider.value);
    iterationValueSpan.textContent = iterations;

    // Update Mandelbrot iteration buffer
    if (sharedState.mandelbrotBuffers && sharedState.mandelbrotBuffers.iterationBuffer) {
      sharedState.mandelbrotDevice.queue.writeBuffer(sharedState.mandelbrotBuffers.iterationBuffer, 0, new Uint32Array([iterations]));
      if (sharedState.mandelbrotRender) {
        sharedState.mandelbrotRender();
      }
    }

    // Update Julia iteration buffer
    if (sharedState.juliaBuffers && sharedState.juliaBuffers.iterationBuffer) {
      sharedState.juliaDevice.queue.writeBuffer(sharedState.juliaBuffers.iterationBuffer, 0, new Uint32Array([iterations]));
      if (sharedState.juliaRender) {
        sharedState.juliaRender();
      }
    }
  });
});
