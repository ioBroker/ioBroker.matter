import React from 'react';
import { withStyles } from '@mui/styles';
import { ThemeProvider, StyledEngineProvider } from '@mui/material/styles';

import {
    AppBar,
    Tabs,
    Tab,
    IconButton,
} from '@mui/material';

import {
    SignalWifiConnectedNoInternet4 as IconNoConnection,
    SignalCellularOff as IconNotAlive,
} from '@mui/icons-material';

import GenericApp from '@iobroker/adapter-react-v5/GenericApp';
import { I18n, Loader, AdminConnection } from '@iobroker/adapter-react-v5';

import ConfigHandler from './components/ConfigHandler';
import OptionsTab from './Tabs/Options';
import ControllerTab from './Tabs/Controller';
import BridgesTab from './Tabs/Bridges';
import DevicesTab from './Tabs/Devices';

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
        this.state.alive = false;
        this.state.backendRunning = false;
        this.state.nodeStates = {};
        this.state.commissioning = {
            bridges: {},
            devices: {},
        };

        this.state.detectedDevices = null;
        this.configHandler = null;
        this.intervalSubscribe = null;
        this.alert = window.alert;
        window.alert = text => this.showToast(text);
    }

    refreshBackendSubscription() {
        this.refreshTimer && clearTimeout(this.refreshTimer);
        this.refreshTimer = setTimeout(() => {
            this.refreshTimer = null;
            this.refreshBackendSubscription();
        }, 60000);

        this.socket.subscribeOnInstance(`matter.${this.instance}`, 'gui', null, this.onBackendUpdates)
            .then(result => {
                if (typeof result === 'object' && result.accepted === false) {
                    console.error('Subscribe is not accepted');
                    this.setState({ backendRunning: !!result.accepted });
                } else if (!this.state.backendRunning) {
                    this.setState({ backendRunning: true });
                }
            });
    }

    async onConnectionReady() {
        this.configHandler && this.configHandler.destroy();
        this.configHandler = new ConfigHandler(this.instance, this.socket, this.onChanged, this.onCommissioningChanged);
        const matter = await this.configHandler.loadConfig();
        const commissioning = this.configHandler.getCommissioning();
        matter.controller = matter.controller || { enabled: false };
        matter.devices = matter.devices || [];
        if (matter.devices.list) {
            matter.devices = matter.devices.list;
        }
        matter.bridges = matter.bridges || [];
        if (matter.bridges.list) {
            matter.bridges = matter.bridges.list;
        }

        this.socket.subscribeState(`system.adapter.matter.${this.instance}.alive`, this.onAlive);
        const alive = await this.socket.getState(`system.adapter.matter.${this.instance}.alive`);

        if (alive?.val) {
            this.refreshBackendSubscription();
        }

        this.setState({
            matter,
            commissioning,
            changed: this.configHandler.isChanged(matter),
            ready: true,
            alive: !!(alive?.val),
        });
    }

    onAlive = (id, state) => {
        if (state?.val && !this.state.alive) {
            this.setState({ alive: true });
            this.refreshBackendSubscription();
        } else if (!state?.val && this.state.alive) {
            this.refreshTimer && clearTimeout(this.refreshTimer);
            this.refreshTimer = null;
            this.setState({ alive: false });
        }
    };

    onBackendUpdates = update => {
        if (update?.command === 'bridgeStates') {
            const nodeStates = {};
            Object.keys(update.states).forEach(uuid =>
                nodeStates[uuid.split('.').pop()] = update.states[uuid]);
            this.setState({ nodeStates });
        } else if (update.uuid) {
            const nodeStates = JSON.parse(JSON.stringify(this.state.nodeStates));
            nodeStates[update.uuid] = update;
            this.setState({ nodeStates });
        } else if (update?.command === 'stopped') {
            setTimeout(() => this.refreshBackendSubscription(), 5000);
        } else {
            console.log(`Unknown update: ${JSON.stringify(update)}`);
        }
    };

    onChanged = newConfig => {
        if (this.state.ready) {
            this.setState({ matter: newConfig, changed: this.configHandler.isChanged(newConfig) });
        }
    };

    onCommissioningChanged = newCommissioning => {
        if (this.state.ready) {
            this.setState({ commissioning: newCommissioning });
        }
    };

    async componentWillUnmount() {
        window.alert = this.alert;
        this.alert = null;
        this.intervalSubscribe && clearInterval(this.intervalSubscribe);
        this.intervalSubscribe = null;

        try {
            await this.socket.unsubscribeState(`system.adapter.matter.${this.instance}.alive`, this.onAlive);
            await this.socket.unsubscribeFromInstance(`matter.${this.instance}`, 'gui', this.onBackendUpdates);
        } catch (e) {
            // ignore
        }

        super.componentWillUnmount();
        this.configHandler && this.configHandler.destroy();
    }

    renderController() {
        return <ControllerTab
            onChange={(id, value) => {
                this.updateNativeValue(id, value);
            }}
            socket={this.socket}
            native={this.state.native}
            themeType={this.state.themeType}
            instance={this.instance}
            matter={this.state.matter}
            updateConfig={this.onChanged}
        />;
    }

    renderOptions() {
        return <OptionsTab
            alive={this.state.alive}
            onChange={(id, value) => {
                this.updateNativeValue(id, value);
            }}
            onLoad={native => this.onLoadConfig(native)}
            socket={this.socket}
            common={this.common}
            native={this.state.native}
            themeType={this.state.themeType}
            instance={this.instance}
            showToast={text => this.showToast(text)}
        />;
    }

    renderBridges() {
        return <BridgesTab
            alive={this.state.alive}
            socket={this.socket}
            instance={this.instance}
            commissioning={this.state.commissioning.bridges}
            updateNodeStates={nodeStates => {
                const _nodeStates = JSON.parse(JSON.stringify(this.state.nodeStates));
                Object.assign(_nodeStates, nodeStates);
                this.setState({ nodeStates: _nodeStates });
            }}
            nodeStates={this.state.nodeStates}
            themeType={this.state.themeType}
            detectedDevices={this.state.detectedDevices}
            setDetectedDevices={detectedDevices => this.setState({ detectedDevices })}
            productIDs={productIDs}
            matter={this.state.matter}
            updateConfig={this.onChanged}
            showToast={text => this.showToast(text)}
            checkLicenseOnAdd={(type, matter) => this.checkLicenseOnAdd(type, matter)}
        />;
    }

    renderDevices() {
        return <DevicesTab
            alive={this.state.alive}
            updateNodeStates={nodeStates => {
                const _nodeStates = JSON.parse(JSON.stringify(this.state.nodeStates));
                Object.assign(_nodeStates, nodeStates);
                this.setState({ nodeStates: _nodeStates });
            }}
            nodeStates={this.state.nodeStates}
            commissioning={this.state.commissioning.devices}
            socket={this.socket}
            themeType={this.state.themeType}
            detectedDevices={this.state.detectedDevices}
            setDetectedDevices={detectedDevices => this.setState({ detectedDevices })}
            productIDs={productIDs}
            instance={this.instance}
            matter={this.state.matter}
            updateConfig={this.onChanged}
            showToast={text => this.showToast(text)}
            checkLicenseOnAdd={(type, matter) => this.checkLicenseOnAdd('addDevice', matter)}
        />;
    }

    async getLicense() {
        if (this.state.native.login && this.state.native.pass) {
            if (this.state.alive) {
                // ask the instance
                const result = await this.socket.sendTo(`matter.${this.instance}`, 'getLicense', { login: this.state.native.login, pass: this.state.native.pass });
                if (result.error) {
                    this.showToast(result.error);
                    return false;
                }
                return result.result;
            }
            this.showToast('You need a running matter instance to add more than one bridge or more than 2 devices');
            return false;
        }
        return false;
    }

    async checkLicenseOnAdd(type, matter) {
        let result = true;
        matter = matter || this.state.matter;
        if (type === 'addBridge') {
            if (matter.bridges.filter(bridge => bridge.enabled).length >= 1) {
                result = await this.getLicense();
            }
        } else if (type === 'addDevice') {
            if (matter.devices.filter(device => device.enabled).length >= 2) {
                result = await this.getLicense();
            }
        } else if (type === 'addDeviceToBridge') {
            if (matter.bridges.find(bridge => bridge.enabled && bridge.list.filter(dev => dev.enabled).length >= 5)) {
                result = await this.getLicense();
            }
        } else {
            return false;
        }

        return result; // User may add one bridge or one device
    }

    onSave(isClose) {
        super.onSave && super.onSave(isClose);

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
                {this.renderToast()}
                <div className="App" style={{ background: this.state.theme.palette.background.default, color: this.state.theme.palette.text.primary }}>
                    <AppBar position="static">
                        <Tabs
                            value={this.state.selectedTab || 'options'}
                            onChange={(e, value) => {
                                this.setState({ selectedTab: value });
                                window.localStorage.setItem(`${this.adapterName}.${this.instance}.selectedTab`, value);
                            }}
                            scrollButtons="auto"
                            classes={{ indicator: this.props.classes.indicator }}
                        >
                            <Tab classes={{ selected: this.props.classes.selected }} label={I18n.t('Options')} value="options" />
                            <Tab classes={{ selected: this.props.classes.selected }} label={I18n.t('Controller')} value="controller" />
                            <Tab classes={{ selected: this.props.classes.selected }} label={I18n.t('Bridges')} value="bridges" />
                            <Tab classes={{ selected: this.props.classes.selected }} label={I18n.t('Devices')} value="devices" />
                            <div style={{ flexGrow: 1 }} />
                            {this.state.alive ? null : <IconNotAlive
                                style={{ color: 'orange', padding: 12 }}
                            />}
                            {this.state.backendRunning ? null : <IconButton
                                onClick={() => {
                                    this.refreshBackendSubscription();
                                }}
                            >
                                <IconNoConnection
                                    style={{ color: 'orange' }}
                                />
                            </IconButton>}
                        </Tabs>

                    </AppBar>

                    <div className={this.isIFrame ? this.props.classes.tabContentIFrame : this.props.classes.tabContent}>
                        {this.state.selectedTab === 'options' && this.renderOptions()}
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
