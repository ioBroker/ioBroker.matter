import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const aceWorkerStub = fileURLToPath(new URL('./aceWorkerStub.js', import.meta.url));

export default defineConfig(() => {
    return {
        build: {
            outDir: 'build',
        },
        plugins: [react()],
        base: './',
        resolve: {
            alias: {
                // ace worker scripts must not be bundled into the main chunk - see aceWorkerStub.js
                'ace-builds/src-min-noconflict/worker-json': aceWorkerStub,
                'ace-builds/src-min-noconflict/worker-yaml': aceWorkerStub,
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
