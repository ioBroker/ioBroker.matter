import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const aceWorkerStub = fileURLToPath(new URL('./aceWorkerStub.mjs', import.meta.url));

// ace worker scripts must not be bundled into the main chunk - see aceWorkerStub.mjs.
// Used as a normal vite plugin (for `vite build` and for sources) and inside
// optimizeDeps, as the dep pre-bundler does not honor `resolve.alias`.
const stubAceWorkers = {
    name: 'stub-ace-workers',
    enforce: 'pre',
    resolveId(source) {
        if (/^ace-builds\/src-min-noconflict\/worker-/.test(source)) {
            return aceWorkerStub;
        }
        return null;
    },
};

export default defineConfig(() => {
    return {
        build: {
            outDir: 'build',
        },
        plugins: [react(), stubAceWorkers],
        base: './',
        optimizeDeps: {
            rolldownOptions: {
                plugins: [stubAceWorkers],
            },
        },
        server: {
            port: 3000,
            proxy: {
                '/adapter': {
                    target: 'http://localhost:8081',
                    changeOrigin: true,
                    secure: false,
                    configure: (proxy, _options) => {
                        proxy.on('error', (err, _req, _res) => {
                            console.log('proxy error', err);
                        });
                        proxy.on('proxyReq', (proxyReq, req, _res) => {
                            console.log('Sending Request to the Target:', req.method, req.url);
                        });
                        proxy.on('proxyRes', (proxyRes, req, _res) => {
                            console.log('Received Response from the Target:', proxyRes.statusCode, req.url);
                        });
                    },
                },
            },
        },
    };
});
