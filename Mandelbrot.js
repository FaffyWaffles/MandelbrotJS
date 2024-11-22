// Global 'c' value shared between Mandelbrot and Julia sets
let currentC = { x: 0.0, y: 0.0 };

// Canvas dimensions
const canvasWidth = 800;
const canvasHeight = 600;
const aspectRatio = canvasWidth / canvasHeight;

// Global scale
const scale = 1.5;

// Function to calculate orbit points
function calculateOrbit(x0, y0, maxIter) {
    const orbit = [{x: 0, y: 0}];  // Start with z0 = 0
    let x = 0;
    let y = 0;
    
    // Remove this line since x0 is already shifted
    // x0 = x0 - 0.5;
    
    for (let i = 0; i < maxIter; i++) {
        // z = z^2 + c
        const xtemp = x*x - y*y + x0;
        const ytemp = 2*x*y + y0;
        x = xtemp;
        y = ytemp;
        
        orbit.push({x, y});
        
        // Check for escape
        if ((x*x + y*y) > 4) {
            break;
        }
    }
    
    return orbit;
}

// In drawOrbit function, modify toCanvasCoords
function toCanvasCoords(point) {
    return {
        x: ((point.x - 0.5 + scale * aspectRatio) / (2.0 * scale * aspectRatio)) * width,
        y: ((scale - point.y) / (2.0 * scale)) * height
    };
}

// Function to draw orbit
function drawOrbit(ctx, orbit, width, height) {
    ctx.clearRect(0, 0, width, height);
    
    function toCanvasCoords(point) {
        return {
            x: ((point.x + 0.5 + scale * aspectRatio) / (2.0 * scale * aspectRatio)) * width,
            y: ((scale - point.y) / (2.0 * scale)) * height
        };
    }
    
    // Draw the connecting lines first
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(255, 255, 0, 0.8)'; // Brighter yellow
    ctx.lineWidth = 2; // Thicker line
    
    const start = toCanvasCoords(orbit[0]);
    ctx.moveTo(start.x, start.y);
    
    for (let i = 1; i < orbit.length; i++) {
        const point = toCanvasCoords(orbit[i]);
        ctx.lineTo(point.x, point.y);
    }
    ctx.stroke();

    // Then draw the points on top
    for (let i = 0; i < orbit.length; i++) {
        const point = toCanvasCoords(orbit[i]);
        
        // Draw point
        ctx.beginPath();
        ctx.fillStyle = i === orbit.length-1 ? 'red' : 'white'; // Make intermediate points white
        ctx.arc(point.x, point.y, 3, 0, 2 * Math.PI); // Slightly larger points
        ctx.fill();
        ctx.strokeStyle = 'black'; // Add black border to points
        ctx.lineWidth = 1;
        ctx.stroke();
    }

    // Redraw the red circle marker
    const x = ((currentC.x + 0.5 + scale * aspectRatio) / (2.0 * scale * aspectRatio)) * width;
    const y = ((scale - currentC.y) / (2.0 * scale)) * height;
    
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, 2 * Math.PI);
    ctx.strokeStyle = 'red';
    ctx.lineWidth = 2;
    ctx.stroke();
}

// Function to draw markers
// Function to draw markers
function drawMarker(markerCanvas, c) {
    const ctx = markerCanvas.getContext('2d');
    ctx.clearRect(0, 0, markerCanvas.width, markerCanvas.height);
 
    // Apply shift only for Mandelbrot set marker
    const xOffset = markerCanvas.id === 'mandelbrotMarkerCanvas' ? 0.5 : 0;
    const x = ((c.x + xOffset + scale * aspectRatio) / (2.0 * scale * aspectRatio)) * markerCanvas.width;
    const y = ((scale - c.y) / (2.0 * scale)) * markerCanvas.height;
 
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, 2 * Math.PI);
    ctx.strokeStyle = 'red';
    ctx.lineWidth = 2;
    ctx.stroke();
 
    // Check if the checkbox exists before trying to access its checked property
    const showOrbitsCheckbox = document.getElementById('showOrbits');
    if (showOrbitsCheckbox && showOrbitsCheckbox.checked && markerCanvas.id === 'mandelbrotMarkerCanvas') {
        const orbit = calculateOrbit(c.x, c.y, parseInt(document.getElementById('iterations').value));
        drawOrbit(ctx, orbit, markerCanvas.width, markerCanvas.height);
    }
 }

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

// Function to update 'c' and synchronize
function updateC(newC, sharedState) {
    currentC.x = newC.x;
    currentC.y = newC.y;

    if (sharedState.juliaBuffers && sharedState.juliaBuffers.cValueBuffer) {
        sharedState.juliaDevice.queue.writeBuffer(
            sharedState.juliaBuffers.cValueBuffer,
            0,
            new Float32Array([currentC.x, currentC.y])
        );
    }

    if (sharedState.juliaRender) {
        sharedState.juliaRender();
    }

    drawMarker(document.getElementById('mandelbrotMarkerCanvas'), currentC);
    drawMarker(document.getElementById('juliaMarkerCanvas'), currentC);

    document.getElementById('cReal').textContent = currentC.x.toFixed(2);
    document.getElementById('cImag').textContent = currentC.y.toFixed(2);
}

// Function to draw fractals
async function drawFractal(canvas, markerCanvas, type, sharedState) {
    const { device, context, format } = await initWebGPU(canvas);

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

    const bindGroup = device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: [
            { binding: 0, resource: { buffer: iterationBuffer } },
            { binding: 1, resource: { buffer: cValueBuffer } },
            { binding: 2, resource: { buffer: modeBuffer } },
        ],
    });

    const initialIterations = 200;
    device.queue.writeBuffer(iterationBuffer, 0, new Uint32Array([initialIterations]));

    let initialC;
    let mode;
    if (type === 'mandelbrot') {
        initialC = new Float32Array([0.0, 0.0]);
        mode = 0;
    } else {
        initialC = new Float32Array([currentC.x, currentC.y]);
        mode = 1;
    }
    device.queue.writeBuffer(cValueBuffer, 0, initialC);
    device.queue.writeBuffer(modeBuffer, 0, new Uint32Array([mode]));

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

    let isDragging = false;

    canvas.addEventListener('mousedown', (e) => {
        isDragging = true;
        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        let x = (mouseX / canvas.width) * 2 * scale * aspectRatio - scale * aspectRatio;
        const y = (mouseY / canvas.height) * -2 * scale + scale;

        // Only adjust x when clicking on Mandelbrot set
        if (type === 'mandelbrot') {
            x = x - 0.5;  // Add 0.5 to compensate for the shader's -0.5 shift
        }

        updateC({ x: x, y: y }, sharedState);
    });

    canvas.addEventListener('mousemove', (e) => {
        if (isDragging) {
            const rect = canvas.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;

            let x = (mouseX / canvas.width) * 2 * scale * aspectRatio - scale * aspectRatio;
            const y = (mouseY / canvas.height) * -2 * scale + scale;

            // Only adjust x when dragging on Mandelbrot set
            if (type === 'mandelbrot') {
                x = x - 0.5;  // Add 0.5 to compensate for the shader's -0.5 shift
            }

            updateC({ x: x, y: y }, sharedState);
        }
    });

    canvas.addEventListener('mouseup', () => {
        isDragging = false;
    });

    canvas.addEventListener('mouseleave', () => {
        isDragging = false;
    });

    drawMarker(markerCanvas, currentC);
}

// Initialize everything after DOM is loaded
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
    const showOrbitsCheckbox = document.getElementById('showOrbits');  // Add this line

    iterationsSlider.addEventListener('input', () => {
        const iterations = parseInt(iterationsSlider.value);
        iterationValueSpan.textContent = iterations;

        // Update Mandelbrot iteration buffer
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

        // Update Julia iteration buffer
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

        // If orbits are enabled, redraw them with new iteration count
        if (showOrbitsCheckbox && showOrbitsCheckbox.checked && currentC) {
            const ctx = document.getElementById('mandelbrotMarkerCanvas').getContext('2d');
            const orbit = calculateOrbit(currentC.x, currentC.y, iterations);
            drawOrbit(ctx, orbit, mandelbrotCanvas.width, mandelbrotCanvas.height);
        }
    });

    // Add orbit toggle event listener (moved inside DOMContentLoaded)
    if (showOrbitsCheckbox) {
        showOrbitsCheckbox.addEventListener('change', (e) => {
            const mandelbrotMarkerCanvas = document.getElementById('mandelbrotMarkerCanvas');
            const ctx = mandelbrotMarkerCanvas.getContext('2d');

            if (!e.target.checked) {
                // Clear orbits when toggled off
                ctx.clearRect(0, 0, mandelbrotMarkerCanvas.width, mandelbrotMarkerCanvas.height);
                // Redraw normal marker
                drawMarker(mandelbrotMarkerCanvas, currentC);
            } else if (currentC) {
                // Redraw orbits for current point
                const orbit = calculateOrbit(
                    currentC.x, 
                    currentC.y,
                    parseInt(document.getElementById('iterations').value)
                );
                drawOrbit(ctx, orbit, mandelbrotMarkerCanvas.width, mandelbrotMarkerCanvas.height);
            }
        });
    }
});