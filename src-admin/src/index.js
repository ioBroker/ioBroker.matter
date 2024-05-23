import React from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeProvider, StyledEngineProvider } from '@mui/material/styles';
import { StylesProvider, createGenerateClassName } from '@mui/styles';
import './index.css';
import { Theme, Utils } from '@iobroker/adapter-react-v5';
import App from './App';
import * as serviceWorker from './serviceWorker';
import pack from '../package.json';

window.adapterName = 'matter';
window.sentryDSN = 'https://438ec54c1889444e98541d523d465f47@sentry.iobroker.net/233';

let themeName = Utils.getThemeName();

console.log(`iobroker.${window.adapterName}@${pack.version} using theme "${themeName}"`);

const generateClassName = createGenerateClassName({
    productionPrefix: 'mat',
});

function build() {
    const container = window.document.getElementById('root');
    const root = createRoot(container);
    return root.render(<StylesProvider generateClassName={generateClassName}>
        <StyledEngineProvider injectFirst>
            <ThemeProvider theme={Theme(themeName)}>
                <App
                    onThemeChange={_theme => {
                        themeName = _theme;
                        build();
                    }}
                />
            </ThemeProvider>
        </StyledEngineProvider>
    </StylesProvider>);
}

build();

// If you want your app to work offline and load faster, you can change
// unregister() to register() below. Note this comes with some pitfalls.
// Learn more about service workers: http://bit.ly/CRA-PWA
serviceWorker.unregister();
