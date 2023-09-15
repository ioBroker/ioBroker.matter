import React from 'react';
import { withStyles } from '@mui/styles';
import { ThemeProvider, StyledEngineProvider } from '@mui/material/styles';

import {
    AppBar,
    Tabs,
    Tab,
} from '@mui/material';

import GenericApp from '@iobroker/adapter-react-v5/GenericApp';
import { I18n, Loader, AdminConnection } from '@iobroker/adapter-react-v5';

import ConfigHandler from './components/ConfigHandler';
import Devices from './components/Devices';
import Controller from './components/Controller';
import Bridges from './components/Bridges';

const productIDs = [];
for (let i = 0x8000; i <= 0x801F; i++) {
    productIDs.push(`0x${i.toString(16)}`);
}

const styles = theme => ({
    tabContent: {
        padding: 10,
        height: 'calc(100% - 64px - 48px - 20px)',
        overflow: 'auto',
    },
    tabContentIFrame: {
        padding: 10,
        height: 'calc(100% - 64px - 48px - 20px - 38px)',
        overflow: 'auto',
    },
    selected: {
        color: theme.palette.mode === 'dark' ? undefined : '#FFF !important',
    },
    indicator: {
        backgroundColor: theme.palette.mode === 'dark' ? theme.palette.secondary.main : '#FFF',
    },
});

class App extends GenericApp {
    constructor(props) {
        const extendedProps = { ...props };
        extendedProps.Connection = AdminConnection;
        extendedProps.translations = {
            en: require('./i18n/en'),
            de: require('./i18n/de'),
            ru: require('./i18n/ru'),
            pt: require('./i18n/pt'),
            nl: require('./i18n/nl'),
            fr: require('./i18n/fr'),
            it: require('./i18n/it'),
            es: require('./i18n/es'),
            pl: require('./i18n/pl'),
            uk: require('./i18n/uk'),
            'zh-cn': require('./i18n/zh-cn'),
        };

        extendedProps.sentryDSN = window.sentryDSN;
        // extendedProps.socket = {
        //     protocol: 'http:',
        //     host: '192.168.178.45',
        //     port: 8081,
        // };

        super(props, extendedProps);

        this.state.selectedTab = window.localStorage.getItem(`${this.adapterName}.${this.instance}.selectedTab`) || 'controller';

        this.state.detectedDevices = null;
        this.configHandler = null;
    }

    async onConnectionReady() {
        this.configHandler && this.configHandler.destroy();
        this.configHandler = new ConfigHandler(this.instance, this.socket, this.onChanged);
        const matter = await this.configHandler.loadConfig();
        matter.controller = matter.controller || { enabled: false };
        matter.devices = matter.devices || [];
        if (matter.devices.list) {
            matter.devices = matter.devices.list;
        }
        matter.bridges = matter.bridges || [];
        if (matter.bridges.list) {
            matter.bridges = matter.bridges.list;
        }

        this.setState({ matter, changed: this.configHandler.isChanged(matter), ready: true });
    }

    onChanged = newConfig => {
        if (this.state.ready) {
            this.setState({ matter: newConfig, changed: this.configHandler.isChanged(newConfig) });
        }
    };

    componentWillUnmount() {
        super.componentWillUnmount();
        this.configHandler && this.configHandler.destroy();
    }

    renderController() {
        return <Controller
            themeType={this.state.themeType}
            matter={this.state.matter}
            updateConfig={this.onChanged}
        />;
    }

    renderBridges() {
        return <Bridges
            socket={this.socket}
            themeType={this.state.themeType}
            detectedDevices={this.state.detectedDevices}
            setDetectedDevices={detectedDevices => this.setState({ detectedDevices })}
            productIDs={productIDs}
            matter={this.state.matter}
            updateConfig={this.onChanged}
        />;
    }

    renderDevices() {
        return <Devices
            socket={this.socket}
            themeType={this.state.themeType}
            detectedDevices={this.state.detectedDevices}
            setDetectedDevices={detectedDevices => this.setState({ detectedDevices })}
            productIDs={productIDs}
            matter={this.state.matter}
            updateConfig={this.onChanged}
        />;
    }

    onSave(isClose) {
        this.configHandler.saveConfig(this.state.matter)
            .then(() => {
                this.setState({ changed: false });
                isClose && GenericApp.onClose();
            })
            .catch(e => window.alert(`Cannot save configuration: ${e}`));
    }

    render() {
        if (!this.state.ready) {
            return <StyledEngineProvider injectFirst>
                <ThemeProvider theme={this.state.theme}>
                    <Loader theme={this.state.themeType} />
                </ThemeProvider>
            </StyledEngineProvider>;
        }

        return <StyledEngineProvider injectFirst>
            <ThemeProvider theme={this.state.theme}>
                <div className="App" style={{ background: this.state.theme.palette.background.default, color: this.state.theme.palette.text.primary }}>
                    <AppBar position="static">
                        <Tabs
                            value={this.state.selectedTab || 'controller'}
                            onChange={(e, value) => {
                                this.setState({ selectedTab: value });
                                window.localStorage.setItem(`${this.adapterName}.${this.instance}.selectedTab`, value);
                            }}
                            scrollButtons="auto"
                            classes={{ indicator: this.props.classes.indicator }}
                        >
                            <Tab classes={{ selected: this.props.classes.selected }} label={I18n.t('Controller')} value="controller" />
                            <Tab classes={{ selected: this.props.classes.selected }} label={I18n.t('Bridges')} value="bridges" />
                            <Tab classes={{ selected: this.props.classes.selected }} label={I18n.t('Devices')} value="devices" />
                        </Tabs>
                    </AppBar>

                    <div className={this.isIFrame ? this.props.classes.tabContentIFrame : this.props.classes.tabContent}>
                        {this.state.selectedTab === 'controller' && this.renderController()}
                        {this.state.selectedTab === 'bridges' && this.renderBridges()}
                        {this.state.selectedTab === 'devices' && this.renderDevices()}
                    </div>
                    {this.renderError()}
                    {this.renderSaveCloseButtons()}
                </div>
            </ThemeProvider>
        </StyledEngineProvider>;
    }
}

export default withStyles(styles)(App);
