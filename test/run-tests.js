// Simple test runner that avoids ts-node issues
require('./mocha.setup.js');

// Import the compiled test
const { execSync } = require('child_process');
const path = require('path');

// First compile the TypeScript test to JavaScript in build/test
try {
    console.log('Compiling TypeScript test...');
    execSync('npx tsc test/devices.test.ts --outDir build/test --module CommonJS --target ES2022 --moduleResolution node --allowJs --skipLibCheck --resolveJsonModule', { stdio: 'inherit' });
    
    console.log('Running tests...');
    execSync('npx mocha --exit build/test/devices.test.js --require ./test/mocha.setup.js', { stdio: 'inherit' });
} catch (error) {
    console.error('Test failed:', error.message);
    process.exit(error.status || 1);
}