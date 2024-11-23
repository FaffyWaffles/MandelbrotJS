// ==========================
// Global Variables and State
// ==========================

// Separate markers for Mandelbrot and Julia sets
const markers = {
    mandelbrot: { x: 0.0, y: 0.0 },  // Controls Julia set computation
    julia: { x: 0.0, y: 0.0 }        // Visual marker only
};

// Canvas dimensions
const canvasWidth = 800;
const canvasHeight = 600;
const aspectRatio = canvasWidth / canvasHeight;

// Default Mandelbrot view parameters and zoom constraints
const defaultMandelbrotScale = 1.5;
const defaultMandelbrotCenter = { x: -0.5, y: 0.0 };
const MIN_SCALE = 1e-6; // Allow much deeper zoom
const MAX_SCALE = defaultMandelbrotScale;

// Variables to handle dynamic zoom
let mandelbrotScale = defaultMandelbrotScale;
let mandelbrotCenter = { ...defaultMandelbrotCenter };
let targetMandelbrotScale = defaultMandelbrotScale;
let targetMandelbrotCenter = { ...defaultMandelbrotCenter };
const zoomSpeed = 0.05; // Adjust for smoother or faster transitions

// ==========================
// Shader Code Definition
// ==========================

const shaderCode = `
struct VertexOut {
    @builtin(position) position: vec4<f32>,
    @location(0) fragCoord: vec2<f32>,
};

@vertex
fn vsMain(@builtin(vertex_index) VertexIndex: u32) -> VertexOut {
    var positions = array<vec2<f32>, 6>(
        vec2<f32>(-1.0, -1.0),
        vec2<f32>(1.0, -1.0),
        vec2<f32>(-1.0, 1.0),
        vec2<f32>(-1.0, 1.0),
        vec2<f32>(1.0, -1.0),
        vec2<f32>(1.0, 1.0)
    );

    var output: VertexOut;
    output.position = vec4<f32>(positions[VertexIndex], 0.0, 1.0);
    output.fragCoord = positions[VertexIndex];
    return output;
}

@group(0) @binding(0) var<uniform> iterationCount: u32;
@group(0) @binding(1) var<uniform> cValue: vec2<f32>;
@group(0) @binding(2) var<uniform> mode: u32;
@group(0) @binding(3) var<uniform> mandelbrotScale: f32;
@group(0) @binding(4) var<uniform> mandelbrotCenter: vec2<f32>;

fn mod_func(x: f32, y: f32) -> f32 {
    return x - y * floor(x / y);
}

@fragment
fn fsMain(input: VertexOut) -> @location(0) vec4<f32> {
    var coords = input.fragCoord;
    
    // Use double precision emulation for critical calculations
    let scale_f64 = f32(mandelbrotScale);
    let center_x_f64 = f32(mandelbrotCenter.x);
    let center_y_f64 = f32(mandelbrotCenter.y);
    
    var x: f32;
    var y: f32;

    if (mode == 0u) {
        // Mandelbrot Set with higher precision calculations
        x = (coords.x * scale_f64 * 1.333) + center_x_f64;
        y = coords.y * scale_f64 + center_y_f64;
    } else {
        // Julia Set
        x = coords.x * 1.5 * 1.333;
        y = coords.y * 1.5;
    }

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
}`;

// ==========================
// Utility Functions
// ==========================

// Function to calculate orbit points
function calculateOrbit(x0, y0, maxIter) {
    const orbit = [{ x: 0, y: 0 }];  // Start with z0 = 0
    let x = 0;
    let y = 0;

    for (let i = 0; i < maxIter; i++) {
        // z = z^2 + c
        const xtemp = x * x - y * y + x0;
        const ytemp = 2 * x * y + y0;
        x = xtemp;
        y = ytemp;

        orbit.push({ x, y });

        // Check for escape
        if ((x * x + y * y) > 4) {
            break;
        }
    }

    return orbit;
}

// Function to convert complex coordinates to canvas coordinates
function toCanvasCoords(point, width, height, mandelbrotCenter, mandelbrotScale, aspectRatio) {
    return {
        x: ((point.x - mandelbrotCenter.x) / (mandelbrotScale * aspectRatio)) * (width / 2) + (width / 2),
        y: ((mandelbrotCenter.y - point.y) / mandelbrotScale) * (height / 2) + (height / 2),
    };
}

function drawOrbit(ctx, orbit, width, height) {
    ctx.clearRect(0, 0, width, height);

    // Draw connecting lines for the orbit
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(255, 255, 0, 0.8)';
    ctx.lineWidth = 2;

    const start = toCanvasCoords(orbit[0], width, height, mandelbrotCenter, mandelbrotScale, aspectRatio);
    ctx.moveTo(start.x, start.y);

    for (let i = 1; i < orbit.length; i++) {
        const point = toCanvasCoords(orbit[i], width, height, mandelbrotCenter, mandelbrotScale, aspectRatio);
        ctx.lineTo(point.x, point.y);
    }
    ctx.stroke();

    // Draw points
    for (let i = 0; i < orbit.length; i++) {
        const point = toCanvasCoords(orbit[i], width, height, mandelbrotCenter, mandelbrotScale, aspectRatio);
        ctx.beginPath();
        ctx.arc(point.x, point.y, 3, 0, 2 * Math.PI);
        ctx.fillStyle = i === orbit.length - 1 ? 'red' : 'white';
        ctx.fill();
        ctx.strokeStyle = 'black';
        ctx.lineWidth = 1;
        ctx.stroke();
    }
}

// Modified update function to handle separate markers
function updateMarker(newPosition, type, sharedState) {
    // Update the appropriate marker
    markers[type] = { x: newPosition.x, y: newPosition.y };

    // Only update Julia set computation when Mandelbrot marker changes
    if (type === 'mandelbrot') {
        if (sharedState.juliaBuffers && sharedState.juliaBuffers.cValueBuffer) {
            sharedState.juliaDevice.queue.writeBuffer(
                sharedState.juliaBuffers.cValueBuffer,
                0,
                new Float32Array([newPosition.x, newPosition.y])
            );
        }

        if (sharedState.juliaRender) {
            sharedState.juliaRender();
        }
    }

    // Draw marker only on the appropriate canvas
    drawMarker(
        document.getElementById(`${type}MarkerCanvas`),
        markers[type]
    );

    // Update coordinate display for either marker
    document.getElementById('cReal').textContent = newPosition.x.toFixed(6);
    document.getElementById('cImag').textContent = newPosition.y.toFixed(6);
}

function drawMarker(markerCanvas, position) {
    const ctx = markerCanvas.getContext('2d');
    ctx.clearRect(0, 0, markerCanvas.width, markerCanvas.height);

    const canvasCoords = toCanvasCoords(
        position,
        markerCanvas.width,
        markerCanvas.height,
        mandelbrotCenter,
        mandelbrotScale,
        aspectRatio
    );

    if (canvasCoords.x < 0 || canvasCoords.x > markerCanvas.width || 
        canvasCoords.y < 0 || canvasCoords.y > markerCanvas.height) {
        return;
    }

    ctx.beginPath();
    ctx.arc(canvasCoords.x, canvasCoords.y, 5, 0, 2 * Math.PI);
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 2;
    ctx.stroke();

    const showOrbitsCheckbox = document.getElementById('showOrbits');
    if (showOrbitsCheckbox && 
        showOrbitsCheckbox.checked && 
        markerCanvas.id === 'mandelbrotMarkerCanvas') {
        const iterations = parseInt(document.getElementById('iterations').value);
        const orbit = calculateOrbit(position.x, position.y, iterations);
        drawOrbit(ctx, orbit, markerCanvas.width, markerCanvas.height);
    }
}

// ==========================
// WebGPU Initialization
// ==========================

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

// ==========================
// Main Fractal Drawing Function
// ==========================

async function drawFractal(canvas, markerCanvas, type, sharedState) {
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

    const mandelbrotScaleBuffer = device.createBuffer({
        size: 4,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    const mandelbrotCenterBuffer = device.createBuffer({
        size: 8,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    // Create bind group
    const bindGroup = device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: [
            { binding: 0, resource: { buffer: iterationBuffer } },
            { binding: 1, resource: { buffer: cValueBuffer } },
            { binding: 2, resource: { buffer: modeBuffer } },
            { binding: 3, resource: { buffer: mandelbrotScaleBuffer } },
            { binding: 4, resource: { buffer: mandelbrotCenterBuffer } },
        ],
    });

    // Initialize uniform buffers
    const initialIterations = 200;
    device.queue.writeBuffer(iterationBuffer, 0, new Uint32Array([initialIterations]));

    let initialC;
    let mode;
    if (type === 'mandelbrot') {
        initialC = new Float32Array([defaultMandelbrotCenter.x, defaultMandelbrotCenter.y]);
        mode = 0;
        device.queue.writeBuffer(mandelbrotScaleBuffer, 0, new Float32Array([mandelbrotScale]));
        device.queue.writeBuffer(mandelbrotCenterBuffer, 0, new Float32Array([mandelbrotCenter.x, mandelbrotCenter.y]));
    } else {
        initialC = new Float32Array([markers.mandelbrot.x, markers.mandelbrot.y]);
        mode = 1;
        device.queue.writeBuffer(mandelbrotScaleBuffer, 0, new Float32Array([0.0]));
        device.queue.writeBuffer(mandelbrotCenterBuffer, 0, new Float32Array([0.0, 0.0]));
    }
    device.queue.writeBuffer(cValueBuffer, 0, initialC);
    device.queue.writeBuffer(modeBuffer, 0, new Uint32Array([mode]));

    // Render function
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

    render();

    // Store buffers and render function in shared state
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
            mandelbrotScaleBuffer: mandelbrotScaleBuffer,
            mandelbrotCenterBuffer: mandelbrotCenterBuffer,
        };
        sharedState.mandelbrotDevice = device;
        sharedState.mandelbrotRender = render;
    }

    let isDragging = false;

    // Event listeners for interaction
    canvas.addEventListener('mousedown', (e) => {
        isDragging = true;
        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        let x = (mouseX / canvas.width) * 2 * mandelbrotScale * aspectRatio - 
                mandelbrotScale * aspectRatio + mandelbrotCenter.x;
        const y = (mouseY / canvas.height) * -2 * mandelbrotScale + 
                 mandelbrotScale + mandelbrotCenter.y;

        updateMarker({ x, y }, type, sharedState);
    });

    canvas.addEventListener('mousemove', (e) => {
        if (isDragging) {
            const rect = canvas.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;

            let x = (mouseX / canvas.width) * 2 * mandelbrotScale * aspectRatio - 
                    mandelbrotScale * aspectRatio + mandelbrotCenter.x;
            const y = (mouseY / canvas.height) * -2 * mandelbrotScale + 
                     mandelbrotScale + mandelbrotCenter.y;

            updateMarker({ x, y }, type, sharedState);
        }
    });

    canvas.addEventListener('mouseup', () => {
        isDragging = false;
    });

    canvas.addEventListener('mouseleave', () => {
        isDragging = false;
    });

    // Initialize marker
    drawMarker(markerCanvas, markers[type]);
}

// ==========================
// Zoom Handling Functions
// ==========================

function interpolate(current, target, speed) {
    if (current < target) {
        return Math.min(current + speed, target);
    } else {
        return Math.max(current - speed, target);
    }
}

function animateZoom(sharedState) {
    let needsRender = false;

    // Interpolate scale
    if (Math.abs(mandelbrotScale - targetMandelbrotScale) > 0.0001) {
        mandelbrotScale = interpolate(mandelbrotScale, targetMandelbrotScale, zoomSpeed * mandelbrotScale);
        needsRender = true;
    }

    // Interpolate center.x
    if (Math.abs(mandelbrotCenter.x - targetMandelbrotCenter.x) > 0.0001) {
        mandelbrotCenter.x = interpolate(
            mandelbrotCenter.x,
            targetMandelbrotCenter.x,
            zoomSpeed * Math.abs(mandelbrotCenter.x - targetMandelbrotCenter.x)
        );
        needsRender = true;
    }

    // Interpolate center.y
    if (Math.abs(mandelbrotCenter.y - targetMandelbrotCenter.y) > 0.0001) {
        mandelbrotCenter.y = interpolate(
            mandelbrotCenter.y,
            targetMandelbrotCenter.y,
            zoomSpeed * Math.abs(mandelbrotCenter.y - targetMandelbrotCenter.y)
        );
        needsRender = true;
    }

    if (needsRender && sharedState.mandelbrotBuffers && sharedState.mandelbrotRender) {
        sharedState.mandelbrotDevice.queue.writeBuffer(
            sharedState.mandelbrotBuffers.mandelbrotScaleBuffer,
            0,
            new Float32Array([mandelbrotScale])
        );

        sharedState.mandelbrotDevice.queue.writeBuffer(
            sharedState.mandelbrotBuffers.mandelbrotCenterBuffer,
            0,
            new Float32Array([mandelbrotCenter.x, mandelbrotCenter.y])
        );

        sharedState.mandelbrotRender();

        // Redraw only Mandelbrot marker
        drawMarker(document.getElementById('mandelbrotMarkerCanvas'), markers.mandelbrot);

        requestAnimationFrame(() => animateZoom(sharedState));
    }
}

function updateZoom(value, sharedState) {
    if (value === 1) {
        targetMandelbrotScale = defaultMandelbrotScale;
        targetMandelbrotCenter = { ...defaultMandelbrotCenter };
    } else {
        const normalizedValue = (value - 1) / 99;
        const exponent = normalizedValue * Math.log10(MIN_SCALE / MAX_SCALE);
        const zoomScale = MAX_SCALE * Math.pow(10, exponent);
        
        targetMandelbrotScale = zoomScale;
        targetMandelbrotCenter = { x: markers.mandelbrot.x, y: markers.mandelbrot.y };
    }

    animateZoom(sharedState);
}

// ==========================
// Initialization
// ==========================

window.addEventListener('DOMContentLoaded', async () => {
    const sharedState = {};

    await drawFractal(
        document.getElementById('mandelbrotCanvas'),
        document.getElementById('mandelbrotMarkerCanvas'),
        'mandelbrot',
        sharedState
    );

    await drawFractal(
        document.getElementById('juliaCanvas'),
        document.getElementById('juliaMarkerCanvas'),
        'julia',
        sharedState
    );

    const iterationsSlider = document.getElementById('iterations');
    const iterationValueSpan = document.getElementById('iterationValue');
    const showOrbitsCheckbox = document.getElementById('showOrbits');
    const mandelbrotZoomSlider = document.getElementById('mandelbrotZoom');
    const mandelbrotZoomValueSpan = document.getElementById('mandelbrotZoomValue');

    mandelbrotZoomSlider.min = "1";
    mandelbrotZoomSlider.max = "100";
    mandelbrotZoomSlider.step = "0.1";

    mandelbrotZoomSlider.addEventListener('input', () => {
        const zoomValue = parseFloat(mandelbrotZoomSlider.value);
        const normalizedValue = (zoomValue - 1) / 99;
        const exponent = normalizedValue * Math.log10(MIN_SCALE / MAX_SCALE);
        const actualScale = MAX_SCALE * Math.pow(10, exponent);
        
        mandelbrotZoomValueSpan.textContent = actualScale.toExponential(2);
        updateZoom(zoomValue, sharedState);
    });

    iterationsSlider.addEventListener('input', () => {
        const iterations = parseInt(iterationsSlider.value);
        iterationValueSpan.textContent = iterations;

        if (sharedState.mandelbrotBuffers && sharedState.mandelbrotBuffers.iterationBuffer) {
            sharedState.mandelbrotDevice.queue.writeBuffer(
                sharedState.mandelbrotBuffers.iterationBuffer,
                0,
                new Uint32Array([iterations])
            );
            if (sharedState.mandelbrotRender) {
                sharedState.mandelbrotRender();
            }
        }

        if (sharedState.juliaBuffers && sharedState.juliaBuffers.iterationBuffer) {
            sharedState.juliaDevice.queue.writeBuffer(
                sharedState.juliaBuffers.iterationBuffer,
                0,
                new Uint32Array([iterations])
            );
            if (sharedState.juliaRender) {
                sharedState.juliaRender();
            }
        }

        if (showOrbitsCheckbox && showOrbitsCheckbox.checked) {
            const mandelbrotMarkerCanvas = document.getElementById('mandelbrotMarkerCanvas');
            const ctx = mandelbrotMarkerCanvas.getContext('2d');
            const orbit = calculateOrbit(markers.mandelbrot.x, markers.mandelbrot.y, iterations);
            drawOrbit(ctx, orbit, mandelbrotMarkerCanvas.width, mandelbrotMarkerCanvas.height);
        }
    });

    if (showOrbitsCheckbox) {
        showOrbitsCheckbox.addEventListener('change', (e) => {
            const mandelbrotMarkerCanvas = document.getElementById('mandelbrotMarkerCanvas');
            const ctx = mandelbrotMarkerCanvas.getContext('2d');

            if (!e.target.checked) {
                ctx.clearRect(0, 0, mandelbrotMarkerCanvas.width, mandelbrotMarkerCanvas.height);
                drawMarker(mandelbrotMarkerCanvas, markers.mandelbrot);
            } else {
                const orbit = calculateOrbit(
                    markers.mandelbrot.x,
                    markers.mandelbrot.y,
                    parseInt(document.getElementById('iterations').value)
                );
                drawOrbit(ctx, orbit, mandelbrotMarkerCanvas.width, mandelbrotMarkerCanvas.height);
            }
        });
    }

    mandelbrotZoomValueSpan.textContent = mandelbrotZoomSlider.value;
});