// Stub for `ace-builds/src-min-noconflict/worker-*.js`.
//
// @iobroker/json-config (Editor.tsx) imports the ace JSON worker script into the
// main bundle. That file is meant to run inside a WebWorker: it starts with
// `(function (e) { ... if (typeof e.window != 'undefined' && e.document) return; ... })(this)`.
// Bundled as ESM its top-level `this` is `undefined`, so reading `e.window`
// throws and the whole admin UI stays blank.
//
// In the main thread the import is a no-op anyway (the guard above returns
// immediately), so replacing it with an empty module loses no functionality.
// See resolve.alias in vite.config.mjs.
export {};
