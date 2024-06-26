import React from 'react';
import { ThemeProvider, StyledEngineProvider } from '@mui/material/styles';

import { AppBar, Tabs, Tab, IconButton } from '@mui/material';

import {
    SignalWifiConnectedNoInternet4 as IconNoConnection,
    SignalCellularOff as IconNotAlive,
} from '@mui/icons-material';

import {
    I18n,
    Loader,
    AdminConnection,
    GenericApp,
    type IobTheme,
    type GenericAppProps,
    type GenericAppState,
} from '@iobroker/adapter-react-v5';

import ConfigHandler from './components/ConfigHandler';
import OptionsTab from './Tabs/Options';
import ControllerTab from './Tabs/Controller';
import BridgesTab from './Tabs/Bridges';
import DevicesTab from './Tabs/Devices';

declare global {
    interface Window {
        sentryDSN: string;
    }
}

import type {
    MatterAdapterConfig,
    NodeStateResponse,
    MatterConfig,
    GUIMessage,
    DetectedRoom,
    CommissioningInfo,
} from './types';

const productIDs: string[] = [];
for (let i = 0x8000; i <= 0x801f; i++) {
    productIDs.push(`0x${i.toString(16)}`);
}

const styles: Record<string, React.CSSProperties | ((_theme: IobTheme) => React.CSSProperties)> = {
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
    selected: (theme: IobTheme) => ({
        color: theme.palette.mode === 'dark' ? undefined : '#FFF !important',
    }),
    indicator: (theme: IobTheme) => ({
        backgroundColor:
      theme.palette.mode === 'dark' ? theme.palette.secondary.main : '#FFF',
    }),
};

interface AppState extends GenericAppState {
    alive: boolean;
    backendRunning: boolean;
    matter: MatterConfig;
    commissioning: CommissioningInfo | null;
    nodeStates: { [uuid: string]: NodeStateResponse };
    detectedDevices: DetectedRoom[] | null;
    ready: boolean;
}

class App extends GenericApp<GenericAppProps, AppState> {
    private isIFrame: boolean = false;

    private configHandler: ConfigHandler | null = null;

    private intervalSubscribe: ReturnType<typeof setInterval> | null = null;

    private refreshTimer: ReturnType<typeof setTimeout> | null = null;

    private alert: null | ((_message?: string) => void);

    private controllerMessageHandler:
    | ((_message: GUIMessage | null) => void)
    | null = null;

    constructor(props: GenericAppProps) {
        const extendedProps: GenericAppProps = { ...props };
        // @ts-expect-error no idea how to fix it
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

        Object.assign(this.state, {
            selectedTab:
        window.localStorage.getItem(
            `${this.adapterName}.${this.instance}.selectedTab`,
        ) || 'controller',
            alive: false,
            backendRunning: false,
            nodeStates: {},
            commissioning: {
                bridges: {},
                devices: {},
            },
            ready: false,
            detectedDevices: null,
        });

        this.alert = window.alert;
        window.alert = text => this.showToast(text);
    }

    refreshBackendSubscription() {
        this.refreshTimer && clearTimeout(this.refreshTimer);
        this.refreshTimer = setTimeout(() => {
            this.refreshTimer = null;
            this.refreshBackendSubscription();
        }, 60000);

        this.socket
            .subscribeOnInstance(
                `matter.${this.instance}`,
                'gui',
                null,
                this.onBackendUpdates,
            )
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
        this.configHandler = new ConfigHandler(
            this.instance,
            this.socket,
            this.onChanged,
            this.onCommissioningChanged,
        );
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

        this.socket
            .subscribeState(
                `system.adapter.matter.${this.instance}.alive`,
                this.onAlive,
            )
            .catch(e =>
                this.showError(
                    `Cannot subscribe on system.adapter.matter.${this.instance}.alive: ${e}`,
                ),
            );

        const alive = await this.socket.getState(
            `system.adapter.matter.${this.instance}.alive`,
        );

        if (alive?.val) {
            this.refreshBackendSubscription();
        }

        this.setState({
            matter,
            commissioning,
            changed: this.configHandler.isChanged(matter),
            ready: true,
            alive: !!alive?.val,
        });
    }

    onAlive = (_id: string, state: ioBroker.State | null | undefined) => {
        if (state?.val && !this.state.alive) {
            this.setState({ alive: true });
            this.refreshBackendSubscription();
        } else if (!state?.val && this.state.alive) {
            this.refreshTimer && clearTimeout(this.refreshTimer);
            this.refreshTimer = null;
            this.setState({ alive: false });
        }
    };

    onBackendUpdates = (update: GUIMessage | null) => {
        if (!update) {
            return;
        }

        if (update.command === 'bridgeStates') {
            // all states at once
            const nodeStates: { [uuid: string]: NodeStateResponse } = {};
            if (update.states) {
                const uuids = update.states ? Object.keys(update.states) : [];
                for (let i = 0; i < uuids.length; i++) {
                    nodeStates[uuids[i].split('.').pop() as string] =
            update.states[uuids[i]];
                }
            }
            this.setState({ nodeStates });
        } else if (update.command === 'updateStates') {
            // normally only the state of one device
            const nodeStates = JSON.parse(JSON.stringify(this.state.nodeStates));
            if (update.states) {
                const uuids = update.states ? Object.keys(update.states) : [];
                for (let i = 0; i < uuids.length; i++) {
                    nodeStates[uuids[i]] = update.states[uuids[i]];
                }
            }
            this.setState({ nodeStates });
        } else if (update.command === 'stopped') {
            // indication, that backend stopped
            setTimeout(() => this.refreshBackendSubscription(), 5000);
        } else {
            this.controllerMessageHandler && this.controllerMessageHandler(update);
        }
    };

    onChanged = (newConfig: MatterConfig) => {
        if (this.state.ready) {
            this.setState({
                matter: newConfig,
                changed: !!this.configHandler?.isChanged(newConfig),
            });
        }
    };

    onCommissioningChanged = (newCommissioning: CommissioningInfo) => {
        if (this.state.ready) {
            this.setState({ commissioning: newCommissioning });
        }
    };

    async componentWillUnmount() {
        window.alert = this.alert as (_message?: any) => void;
        this.alert = null;
        this.intervalSubscribe && clearInterval(this.intervalSubscribe);
        this.intervalSubscribe = null;

        try {
            this.socket.unsubscribeState(
                `system.adapter.matter.${this.instance}.alive`,
                this.onAlive,
            );
            await this.socket.unsubscribeFromInstance(
                `matter.${this.instance}`,
                'gui',
                this.onBackendUpdates,
            );
        } catch (e) {
            // ignore
        }

        super.componentWillUnmount();
        this.configHandler && this.configHandler.destroy();
    }

    renderController() {
        return <ControllerTab
            registerMessageHandler={(
                handler: null | ((_message: GUIMessage | null) => void),
            ) => (this.controllerMessageHandler = handler)}
            alive={this.state.alive}
            socket={this.socket}
            instance={this.instance}
            matter={this.state.matter}
            updateConfig={this.onChanged}
            adapterName={this.adapterName}
            themeName={this.state.themeName}
            themeType={this.state.themeType}
            theme={this.state.theme}
            isFloatComma={this.socket.systemConfig.common.isFloatComma}
            dateFormat={this.socket.systemConfig.common.dateFormat}
        />;
    }

    renderOptions() {
        return <OptionsTab
            alive={this.state.alive}
            onChange={(id: string, value: any) => this.updateNativeValue(id, value)}
            onLoad={(native: Record<string, any>) => this.onLoadConfig(native)}
            socket={this.socket}
            common={this.common}
            native={this.state.native as MatterAdapterConfig}
            instance={this.instance}
            showToast={(text: string) => this.showToast(text)}
        />;
    }

    renderBridges() {
        return <BridgesTab
            alive={this.state.alive}
            socket={this.socket}
            instance={this.instance}
            commissioning={this.state.commissioning?.bridges || {}}
            updateNodeStates={(nodeStates: {
                [uuid: string]: NodeStateResponse;
            }) => {
                const _nodeStates = JSON.parse(JSON.stringify(this.state.nodeStates));
                Object.assign(_nodeStates, nodeStates);
                this.setState({ nodeStates: _nodeStates });
            }}
            nodeStates={this.state.nodeStates}
            themeType={this.state.themeType}
            theme={this.state.theme}
            detectedDevices={this.state.detectedDevices || []}
            setDetectedDevices={(detectedDevices: DetectedRoom[]) =>
                this.setState({ detectedDevices })
            }
            productIDs={productIDs}
            matter={this.state.matter}
            updateConfig={this.onChanged}
            showToast={(text: string) => this.showToast(text)}
            checkLicenseOnAdd={(
                type: 'addBridge' | 'addDevice' | 'addDeviceToBridge',
                matter: MatterConfig,
            ) => this.checkLicenseOnAdd(type, matter)}
        />;
    }

    renderDevices() {
        return <DevicesTab
            alive={this.state.alive}
            updateNodeStates={(nodeStates: {
                [uuid: string]: NodeStateResponse;
            }) => {
                const _nodeStates = JSON.parse(JSON.stringify(this.state.nodeStates));
                Object.assign(_nodeStates, nodeStates);
                this.setState({ nodeStates: _nodeStates });
            }}
            nodeStates={this.state.nodeStates}
            commissioning={this.state.commissioning?.devices || {}}
            socket={this.socket}
            themeType={this.state.themeType}
            theme={this.state.theme}
            detectedDevices={this.state.detectedDevices || []}
            setDetectedDevices={(detectedDevices: DetectedRoom[]) =>
                this.setState({ detectedDevices })
            }
            productIDs={productIDs}
            instance={this.instance}
            matter={this.state.matter}
            updateConfig={this.onChanged}
            showToast={(text: string) => this.showToast(text)}
            checkLicenseOnAdd={(matter: MatterConfig) =>
                this.checkLicenseOnAdd('addDevice', matter)
            }
        />;
    }

    async getLicense() {
        if (this.state.native.login && this.state.native.pass) {
            if (this.state.alive) {
                // ask the instance
                const result = await this.socket.sendTo(
                    `matter.${this.instance}`,
                    'getLicense',
                    { login: this.state.native.login, pass: this.state.native.pass },
                );
                if (result.error) {
                    this.showToast(result.error);
                    return false;
                }
                return result.result;
            }
            this.showToast(
                'You need a running matter instance to add more than one bridge or more than 2 devices',
            );
            return false;
        }
        return false;
    }

    async checkLicenseOnAdd(
        type: 'addBridge' | 'addDevice' | 'addDeviceToBridge',
        matter?: MatterConfig,
    ): Promise<boolean> {
        let result = true;
        matter = matter || this.state.matter;
        if (matter) {
            if (type === 'addBridge') {
                if (matter.bridges.filter(bridge => bridge.enabled).length >= 1) {
                    result = await this.getLicense();
                }
            } else if (type === 'addDevice') {
                if (matter.devices.filter(device => device.enabled).length >= 2) {
                    result = await this.getLicense();
                }
            } else if (type === 'addDeviceToBridge') {
                if (
                    matter.bridges.find(
                        bridge =>
                            bridge.enabled &&
              bridge.list.filter(dev => dev.enabled).length >= 5,
                    )
                ) {
                    result = await this.getLicense();
                }
            } else {
                return false;
            }
        } else {
            return false;
        }

        return result; // User may add one bridge or one device
    }

    onSave(isClose?: boolean) {
        super.onSave && super.onSave(isClose);

        this.configHandler
            ?.saveConfig(this.state.matter)
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
                    <Loader themeType={this.state.themeType} />
                </ThemeProvider>
            </StyledEngineProvider>;
        }

        return <StyledEngineProvider injectFirst>
            <ThemeProvider theme={this.state.theme}>
                {this.renderToast()}
                <div
                    className="App"
                    style={{
                        background: this.state.theme.palette.background.default,
                        color: this.state.theme.palette.text.primary,
                    }}
                >
                    <AppBar position="static">
                        <Tabs
                            value={this.state.selectedTab || 'options'}
                            onChange={(_e, value) => {
                                this.setState({ selectedTab: value });
                                window.localStorage.setItem(
                                    `${this.adapterName}.${this.instance}.selectedTab`,
                                    value,
                                );
                            }}
                            scrollButtons="auto"
                            sx={{ '& .MuiTabs-indicator': styles.indicator }}
                        >
                            <Tab
                                sx={{ '&.Mui-selected': styles.selected }}
                                label={I18n.t('Options')}
                                value="options"
                            />
                            <Tab
                                sx={{ '&.Mui-selected': styles.selected }}
                                label={I18n.t('Controller')}
                                value="controller"
                            />
                            <Tab
                                sx={{ '&.Mui-selected': styles.selected }}
                                label={I18n.t('Bridges')}
                                value="bridges"
                            />
                            <Tab
                                sx={{ '&.Mui-selected': styles.selected }}
                                label={I18n.t('Devices')}
                                value="devices"
                            />
                            <div style={{ flexGrow: 1 }} />
                            {this.state.alive ? null : (
                                <IconNotAlive style={{ color: 'orange', padding: 12 }} />
                            )}
                            {this.state.backendRunning ? null : (
                                <IconButton
                                    onClick={() => {
                                        this.refreshBackendSubscription();
                                    }}
                                >
                                    <IconNoConnection style={{ color: 'orange' }} />
                                </IconButton>
                            )}
                        </Tabs>
                    </AppBar>

                    <div
                        style={
                            this.isIFrame ? styles.tabContentIFrame as React.CSSProperties : styles.tabContent as React.CSSProperties
                        }
                    >
                        {this.state.selectedTab === 'options' && this.renderOptions()}
                        {this.state.selectedTab === 'controller' &&
            this.renderController()}
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

export default App;
