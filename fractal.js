// fractal.js
export const CANVAS = {
    width: 800,
    height: 600,
    get aspectRatio() { return this.width / this.height; }
};

export const FRACTAL = {
    scale: 1.5,
    mandelbrotOffset: 0.5,
    defaultIterations: 200
};

// Core coordinate transformation functions
export class FractalMath {
    static screenToComplex(x, y, canvas, isMandelbrot = false) {
        const complexX = (x / canvas.width) * 2 * FRACTAL.scale * CANVAS.aspectRatio - FRACTAL.scale * CANVAS.aspectRatio;
        const complexY = (y / canvas.height) * -2 * FRACTAL.scale + FRACTAL.scale;
        
        if (isMandelbrot) {
            return { x: complexX - FRACTAL.mandelbrotOffset, y: complexY };
        }
        return { x: complexX, y: complexY };
    }

    static complexToScreen(x, y, canvas, isMandelbrot = false) {
        const adjustedX = isMandelbrot ? x + FRACTAL.mandelbrotOffset : x;
        return {
            x: ((adjustedX + FRACTAL.scale * CANVAS.aspectRatio) / (2.0 * FRACTAL.scale * CANVAS.aspectRatio)) * canvas.width,
            y: ((FRACTAL.scale - y) / (2.0 * FRACTAL.scale)) * canvas.height
        };
    }

    static calculateOrbit(x0, y0, maxIter) {
        const orbit = [{x: 0, y: 0}];
        let x = 0;
        let y = 0;
        
        for (let i = 0; i < maxIter; i++) {
            const xtemp = x*x - y*y + x0;
            const ytemp = 2*x*y + y0;
            x = xtemp;
            y = ytemp;
            
            orbit.push({x, y});
            
            if ((x*x + y*y) > 4) {
                break;
            }
        }
        
        return orbit;
    }
}

export let currentC = { x: 0.0, y: 0.0 };