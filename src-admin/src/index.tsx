import React from 'react';
import { createRoot } from 'react-dom/client';
import pack from '../package.json';
import App from './App';
import './index.css';
import * as serviceWorker from './serviceWorker';

declare global {
    interface Window {
        sentryDSN: string;
    }
}

window.adapterName = 'matter';
window.sentryDSN = 'https://438ec54c1889444e98541d523d465f47@sentry.iobroker.net/233';

console.log(`iobroker.${window.adapterName}@${pack.version}`);

const container = window.document.getElementById('root');
const root = createRoot(container);
root.render(<App />);

// If you want your app to work offline and load faster, you can change
// unregister() to register() below. Note this comes with some pitfalls.
// Learn more about service workers: http://bit.ly/CRA-PWA
serviceWorker.unregister();
