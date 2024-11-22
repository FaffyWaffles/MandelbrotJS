// ui.js
import { CANVAS, FRACTAL, FractalMath, currentC } from './fractal.js';
import { WebGPURenderer } from './shader.js';

class UI {
   static sharedState = {};
   static deviceJulia;

   static drawMarker(markerCanvas, c) {
       const ctx = markerCanvas.getContext('2d');
       ctx.clearRect(0, 0, markerCanvas.width, markerCanvas.height);
   
       // Apply shift only for Mandelbrot set marker
       const xOffset = markerCanvas.id === 'mandelbrotMarkerCanvas' ? 0.5 : 0;
       const screenCoords = FractalMath.complexToScreen(c.x, c.y, markerCanvas);
   
       ctx.beginPath();
       ctx.arc(screenCoords.x, screenCoords.y, 5, 0, 2 * Math.PI);
       ctx.strokeStyle = 'red';
       ctx.lineWidth = 2;
       ctx.stroke();
   
       const showOrbitsCheckbox = document.getElementById('showOrbits');
       if (showOrbitsCheckbox?.checked && markerCanvas.id === 'mandelbrotMarkerCanvas') {
           const orbit = FractalMath.calculateOrbit(c.x, c.y, parseInt(document.getElementById('iterations').value));
           UI.drawOrbit(ctx, orbit, markerCanvas.width, markerCanvas.height);
       }
   }

   static drawOrbit(ctx, orbit, width, height) {
       ctx.clearRect(0, 0, width, height);
       
       // Draw the connecting lines first
       ctx.beginPath();
       ctx.strokeStyle = 'rgba(255, 255, 0, 0.8)';
       ctx.lineWidth = 2;
       
       const start = FractalMath.complexToScreen(orbit[0].x, orbit[0].y, {width, height}, true);
       ctx.moveTo(start.x, start.y);
       
       for (let i = 1; i < orbit.length; i++) {
           const point = FractalMath.complexToScreen(orbit[i].x, orbit[i].y, {width, height}, true);
           ctx.lineTo(point.x, point.y);
       }
       ctx.stroke();

       // Then draw the points on top
       for (let i = 0; i < orbit.length; i++) {
           const point = FractalMath.complexToScreen(orbit[i].x, orbit[i].y, {width, height}, true);
           
           ctx.beginPath();
           ctx.fillStyle = i === orbit.length-1 ? 'red' : 'white';
           ctx.arc(point.x, point.y, 3, 0, 2 * Math.PI);
           ctx.fill();
           ctx.strokeStyle = 'black';
           ctx.lineWidth = 1;
           ctx.stroke();
       }

       // Redraw the red circle marker
       const markerPos = FractalMath.complexToScreen(currentC.x, currentC.y, {width, height}, true);
       ctx.beginPath();
       ctx.arc(markerPos.x, markerPos.y, 5, 0, 2 * Math.PI);
       ctx.strokeStyle = 'red';
       ctx.lineWidth = 2;
       ctx.stroke();
   }

   static updateC(newC) {
       currentC.x = newC.x;
       currentC.y = newC.y;

       if (UI.sharedState.juliaBuffers?.cValueBuffer) {
           UI.sharedState.juliaDevice.queue.writeBuffer(
               UI.sharedState.juliaBuffers.cValueBuffer,
               0,
               new Float32Array([currentC.x, currentC.y])
           );
       }

       if (UI.sharedState.juliaRender) {
           UI.sharedState.juliaRender();
       }

       UI.drawMarker(document.getElementById('mandelbrotMarkerCanvas'), currentC);
       UI.drawMarker(document.getElementById('juliaMarkerCanvas'), currentC);

       document.getElementById('cReal').textContent = currentC.x.toFixed(2);
       document.getElementById('cImag').textContent = currentC.y.toFixed(2);
   }

   static async initFractal(canvas, markerCanvas, type) {
       const { device, context, format } = await WebGPURenderer.init(canvas);

       if (type === 'julia') {
           UI.deviceJulia = device;
       }

       const shaderModule = WebGPURenderer.createShaderModule(device);
       const pipeline = WebGPURenderer.setupPipeline(device, format, shaderModule);
       const buffers = WebGPURenderer.createBuffers(device);

       const bindGroup = device.createBindGroup({
           layout: pipeline.getBindGroupLayout(0),
           entries: [
               { binding: 0, resource: { buffer: buffers.iterationBuffer } },
               { binding: 1, resource: { buffer: buffers.cValueBuffer } },
               { binding: 2, resource: { buffer: buffers.modeBuffer } },
           ],
       });

       // Initial values setup
       device.queue.writeBuffer(buffers.iterationBuffer, 0, new Uint32Array([FRACTAL.defaultIterations]));

       const initialC = type === 'mandelbrot' 
           ? new Float32Array([0.0, 0.0])
           : new Float32Array([currentC.x, currentC.y]);

       device.queue.writeBuffer(buffers.cValueBuffer, 0, initialC);
       device.queue.writeBuffer(buffers.modeBuffer, 0, new Uint32Array([type === 'mandelbrot' ? 0 : 1]));

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
           UI.sharedState.juliaBuffers = {
               iterationBuffer: buffers.iterationBuffer,
               cValueBuffer: buffers.cValueBuffer,
           };
           UI.sharedState.juliaDevice = device;
           UI.sharedState.juliaRender = render;
       } else if (type === 'mandelbrot') {
           UI.sharedState.mandelbrotBuffers = {
               iterationBuffer: buffers.iterationBuffer,
           };
           UI.sharedState.mandelbrotDevice = device;
           UI.sharedState.mandelbrotRender = render;
       }

       UI.setupCanvasListeners(canvas, markerCanvas, type);
       UI.drawMarker(markerCanvas, currentC);
   }

   static setupCanvasListeners(canvas, markerCanvas, type) {
       let isDragging = false;

       canvas.addEventListener('mousedown', (e) => {
           isDragging = true;
           UI.handleCanvasInteraction(e, canvas, type);
       });

       canvas.addEventListener('mousemove', (e) => {
           if (isDragging) {
               UI.handleCanvasInteraction(e, canvas, type);
           }
       });

       canvas.addEventListener('mouseup', () => isDragging = false);
       canvas.addEventListener('mouseleave', () => isDragging = false);
   }

   static handleCanvasInteraction(e, canvas, type) {
       const rect = canvas.getBoundingClientRect();
       const mouseX = e.clientX - rect.left;
       const mouseY = e.clientY - rect.top;

       const coords = FractalMath.screenToComplex(mouseX, mouseY, canvas, type === 'mandelbrot');
       UI.updateC(coords);
   }

   static setupControlListeners() {
       const iterationsSlider = document.getElementById('iterations');
       const iterationValueSpan = document.getElementById('iterationValue');
       const showOrbitsCheckbox = document.getElementById('showOrbits');

       iterationsSlider?.addEventListener('input', () => {
           const iterations = parseInt(iterationsSlider.value);
           iterationValueSpan.textContent = iterations;

           // Update both sets
           [UI.sharedState.mandelbrotBuffers, UI.sharedState.juliaBuffers].forEach(buffers => {
               if (buffers?.iterationBuffer) {
                   const device = buffers === UI.sharedState.mandelbrotBuffers 
                       ? UI.sharedState.mandelbrotDevice 
                       : UI.sharedState.juliaDevice;
                   
                   device.queue.writeBuffer(buffers.iterationBuffer, 0, new Uint32Array([iterations]));
               }
           });

           // Render updates
           if (UI.sharedState.mandelbrotRender) UI.sharedState.mandelbrotRender();
           if (UI.sharedState.juliaRender) UI.sharedState.juliaRender();

           // Update orbits if enabled
           if (showOrbitsCheckbox?.checked && currentC) {
               const ctx = document.getElementById('mandelbrotMarkerCanvas').getContext('2d');
               const orbit = FractalMath.calculateOrbit(currentC.x, currentC.y, iterations);
               UI.drawOrbit(ctx, orbit, CANVAS.width, CANVAS.height);
           }
       });

       showOrbitsCheckbox?.addEventListener('change', (e) => {
           const mandelbrotMarkerCanvas = document.getElementById('mandelbrotMarkerCanvas');
           const ctx = mandelbrotMarkerCanvas.getContext('2d');

           if (!e.target.checked) {
               ctx.clearRect(0, 0, mandelbrotMarkerCanvas.width, mandelbrotMarkerCanvas.height);
               UI.drawMarker(mandelbrotMarkerCanvas, currentC);
           } else if (currentC) {
               const orbit = FractalMath.calculateOrbit(
                   currentC.x, 
                   currentC.y,
                   parseInt(document.getElementById('iterations').value)
               );
               UI.drawOrbit(ctx, orbit, mandelbrotMarkerCanvas.width, mandelbrotMarkerCanvas.height);
           }
       });
   }
}

// Initialize everything when DOM is loaded
window.addEventListener('DOMContentLoaded', async () => {
   await UI.initFractal(
       document.getElementById('mandelbrotCanvas'),
       document.getElementById('mandelbrotMarkerCanvas'),
       'mandelbrot'
   );

   await UI.initFractal(
       document.getElementById('juliaCanvas'),
       document.getElementById('juliaMarkerCanvas'),
       'julia'
   );

   UI.setupControlListeners();
});