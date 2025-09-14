// Silences Firefox warning about WEBGL_debug_renderer_info by returning null
// when code probes for that extension. Babylon falls back to gl.RENDERER.

(() => {
  const canvasProto = HTMLCanvasElement?.prototype as any;
  if (!canvasProto || typeof canvasProto.getContext !== 'function') return;

  if ((canvasProto as any).__noDbgExtPatched) return;
  (canvasProto as any).__noDbgExtPatched = true;

  const origGetContext = canvasProto.getContext as typeof HTMLCanvasElement.prototype.getContext;

  canvasProto.getContext = function patchedGetContext(type: string, options?: any) {
    const ctx = origGetContext.call(this, type, options) as
      | WebGLRenderingContext
      | WebGL2RenderingContext
      | CanvasRenderingContext2D
      | null;

    // Only wrap WebGL contexts
    if (
      ctx &&
      (type === 'webgl' || type === 'webgl2' || type === 'experimental-webgl') &&
      typeof (ctx as any).getExtension === 'function' &&
      !(ctx as any).__noDbgExtPatched
    ) {
      const gl = ctx as unknown as { getExtension(name: string): any; __noDbgExtPatched?: boolean };
      const origGetExtension = gl.getExtension.bind(gl);
      gl.getExtension = (name: string) => {
        if (name === 'WEBGL_debug_renderer_info' || name === 'WEBKIT_WEBGL_debug_renderer_info') {
          return null;
        }
        return origGetExtension(name);
      };
      gl.__noDbgExtPatched = true;
    }
    return ctx;
  } as typeof HTMLCanvasElement.prototype.getContext;
})();

