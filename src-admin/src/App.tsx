import { StyledEngineProvider, ThemeProvider } from '@mui/material/styles';
import React from 'react';

import { IconButton } from '@foxriver76/iob-component-lib';
import {
    AppBar,
    Dialog,
    DialogContent,
    DialogContentText,
    DialogTitle,
    Fab,
    LinearProgress,
    Tab,
    Tabs,
    Tooltip,
} from '@mui/material';

import { Help as IconHelp, SignalCellularOff as IconNotAlive } from '@mui/icons-material';

import {
    AdminConnection,
    GenericApp,
    I18n,
    Loader,
    type GenericAppProps,
    type GenericAppState,
    type IobTheme,
} from '@iobroker/adapter-react-v5';
import { clone, getText } from './Utils';

import ConfigHandler from './components/ConfigHandler';
import BridgesTab from './Tabs/Bridges';
import ControllerTab from './Tabs/Controller';
import DevicesTab from './Tabs/Devices';
import OptionsTab from './Tabs/Options';
import WelcomeDialog from './components/WelcomeDialog';

import type {
    CommissioningInfo,
    DetectedRoom,
    GUIMessage,
    MatterAdapterConfig,
    MatterConfig,
    NodeStateResponse,
    Processing,
} from './types';

import enLang from './i18n/en.json';
import deLang from './i18n/de.json';
import ruLang from './i18n/ru.json';
import ptLang from './i18n/pt.json';
import nlLang from './i18n/nl.json';
import frLang from './i18n/fr.json';
import itLang from './i18n/it.json';
import esLang from './i18n/es.json';
import plLang from './i18n/pl.json';
import ukLang from './i18n/uk.json';
import zhCnLang from './i18n/zh-cn.json';

declare global {
    interface Window {
        sentryDSN: string;
    }
}

const productIDs: string[] = [];
for (let i = 0x8000; i <= 0x801f; i++) {
    productIDs.push(`0x${i.toString(16)}`);
}

const styles = {
    tabContent: {
        padding: 10,
        overflow: 'auto',
        height: 'calc(100% - 64px - 48px - 20px)',
    },
    tabContentNoSave: {
        padding: 10,
        height: 'calc(100% - 48px - 20px)',
        overflow: 'auto',
    },
    selected: (theme: IobTheme) => ({
        color: theme.palette.mode === 'dark' ? undefined : '#FFF !important',
    }),
    indicator: (theme: IobTheme) => ({
        backgroundColor: theme.palette.mode === 'dark' ? theme.palette.secondary.main : '#FFF',
    }),
} as const satisfies Record<string, React.CSSProperties | ((_theme: IobTheme) => React.CSSProperties)>;

interface AppState extends GenericAppState {
    alive: boolean;
    backendRunning: boolean;
    matter: MatterConfig;
    commissioning: CommissioningInfo | null;
    nodeStates: { [uuid: string]: NodeStateResponse };
    /** Information about nodes being processed */
    inProcessing: Processing;
    /** Undefined if no detection ran yet */
    detectedDevices?: DetectedRoom[];
    ready: boolean;
    showWelcomeDialog: boolean;
    progress: {
        title?: ioBroker.StringOrTranslated;
        text?: ioBroker.StringOrTranslated;
        indeterminate?: boolean;
        value?: number;
    } | null;
    welcomeDialogShowed: boolean;
    updatePassTrigger: number;
}

class App extends GenericApp<GenericAppProps, AppState> {
    private configHandler: ConfigHandler | null = null;

    private intervalSubscribe: ReturnType<typeof setInterval> | null = null;

    private refreshTimer: ReturnType<typeof setTimeout> | null = null;

    private connectToBackEndInterval: ReturnType<typeof setInterval> | null = null;

    private connectToBackEndCounter = 0;

    private alert: null | ((_message?: string) => void);

    private controllerMessageHandler: ((_message: GUIMessage | null) => void) | null = null;

    private readonly isTab: boolean =
        window.location.pathname.includes('tab_m.html') || window.location.search.includes('tab=');

    constructor(props: GenericAppProps) {
        const extendedProps: GenericAppProps = { ...props };
        // @ts-expect-error no idea how to fix it
        extendedProps.Connection = AdminConnection;
        extendedProps.translations = {
            en: enLang,
            de: deLang,
            ru: ruLang,
            pt: ptLang,
            nl: nlLang,
            fr: frLang,
            it: itLang,
            es: esLang,
            pl: plLang,
            uk: ukLang,
            'zh-cn': zhCnLang,
        };

        extendedProps.sentryDSN = window.sentryDSN;
        // extendedProps.socket = {
        //     protocol: 'http:',
        //     host: '192.168.178.45',
        //     port: 8081,
        // };

        super(props, extendedProps);

        let selectedTab =
            window.localStorage.getItem(`${this.adapterName}.${this.instance}.selectedTab`) || 'controller';
        if (this.isTab && selectedTab === 'options') {
            selectedTab = 'controller';
        }

        Object.assign(this.state, {
            selectedTab,
            alive: false,
            backendRunning: false,
            nodeStates: {},
            commissioning: {
                bridges: {},
                devices: {},
            },
            ready: false,
            progress: null,
            showWelcomeDialog: false,
            welcomeDialogShowed: false,
            inProcessing: null,
            updatePassTrigger: 1,
        });

        this.alert = window.alert;
        window.alert = text => this.showToast(text);
    }

    onSubscribeToBackEndSubmitted = (
        result: {
            error?: string;
            accepted?: boolean;
            heartbeat?: number;
        } | null,
    ): void => {
        // backend is alive, so stop a connection interval
        if (this.connectToBackEndInterval) {
            console.log(`Connected after ${this.connectToBackEndCounter} attempts`);
            this.connectToBackEndCounter = 0;
            clearInterval(this.connectToBackEndInterval);
            this.connectToBackEndInterval = null;
        }

        if (result && typeof result === 'object' && result.accepted === false) {
            console.error('Subscribe is not accepted');
            this.setState({ backendRunning: false });
        } else if (!this.state.backendRunning) {
            this.setState({ backendRunning: true }, () => {
                if (this.controllerMessageHandler) {
                    this.controllerMessageHandler({ command: 'reconnect' });
                }
            });
        }
    };

    // eslint-disable-next-line class-methods-use-this
    onSubscribeToBackEndFailed = (e: unknown): void => {
        console.warn(`Cannot connect to backend: ${e as Error}`);
    };

    refreshBackendSubscription(afterAlive?: boolean): void {
        if (this.refreshTimer) {
            clearTimeout(this.refreshTimer);
        }
        this.refreshTimer = setTimeout(() => {
            this.refreshTimer = null;
            void this.refreshBackendSubscription();
        }, 60_000);

        if (afterAlive && !this.connectToBackEndInterval) {
            this.connectToBackEndCounter = 0;
            console.log('Start faster connection attempts');
            // try to connect in smaller intervals 20 seconds long
            this.connectToBackEndInterval = setInterval(() => {
                this.connectToBackEndCounter++;
                if (this.connectToBackEndCounter > 6) {
                    console.log('Stopped faster connection attempts. Seems the backend is dead');
                    // back-end is still dead, so reduce attempts
                    if (this.connectToBackEndInterval) {
                        clearInterval(this.connectToBackEndInterval);
                        this.connectToBackEndInterval = null;
                    }
                } else {
                    this.refreshBackendSubscription();
                }
            }, 3_000);
        }

        void this.socket
            .subscribeOnInstance(`matter.${this.instance}`, 'gui', null, this.onBackendUpdates)
            .then(this.onSubscribeToBackEndSubmitted)
            .catch(this.onSubscribeToBackEndFailed);
    }

    async onConnectionReady(): Promise<void> {
        this.configHandler && this.configHandler.destroy();
        this.configHandler = new ConfigHandler(this.instance, this.socket, this.onChanged, this.onCommissioningChanged);
        const matter = await this.configHandler.loadConfig();

        const commissioning = this.configHandler.getCommissioning();
        matter.controller = matter.controller || { enabled: false };
        matter.devices = matter.devices || [];
        // @ts-expect-error list should not exist as it should be an array.. fix types
        if (matter.devices.list) {
            // @ts-expect-error list should not exist as it should be an array.. fix types
            matter.devices = matter.devices.list;
        }
        matter.bridges = matter.bridges || [];
        // @ts-expect-error list should not exist as it should be an array.. fix types
        if (matter.bridges.list) {
            // @ts-expect-error list should not exist as it should be an array.. fix types
            matter.bridges = matter.bridges.list;
        }

        this.socket
            .subscribeState(`system.adapter.matter.${this.instance}.alive`, this.onAlive)
            .catch(e => this.showError(`Cannot subscribe on system.adapter.matter.${this.instance}.alive: ${e}`));

        const alive = await this.socket.getState(`system.adapter.matter.${this.instance}.alive`);

        const welcomeDialog = this.isTab
            ? null
            : await this.socket.getState(`matter.${this.instance}.info.welcomeDialog`);

        if (alive?.val) {
            this.refreshBackendSubscription(true);
        }

        this.setState({
            matter,
            commissioning,
            ready: true,
            alive: !!alive?.val,
            showWelcomeDialog: this.isTab ? false : !welcomeDialog?.val,
            welcomeDialogShowed: !!welcomeDialog?.val,
        });
    }

    onAlive = (_id: string, state: ioBroker.State | null | undefined): void => {
        if (state?.val && !this.state.alive) {
            this.setState({ alive: true });
            this.refreshBackendSubscription(true);
        } else if (!state?.val && this.state.alive) {
            if (this.refreshTimer) {
                clearTimeout(this.refreshTimer);
                this.refreshTimer = null;
            }
            this.setState({ alive: false, progress: null });
        }
    };

    renderWelcomeDialog(): React.JSX.Element | null {
        if (!this.state.showWelcomeDialog) {
            return null;
        }

        const adapterSettings: MatterAdapterConfig = this.state.native as MatterAdapterConfig;

        return (
            <WelcomeDialog
                instance={this.instance}
                socket={this.socket}
                themeType={this.state.themeType}
                onClose={async (navigateTo?: 'controller' | 'bridges', updateRepeat?: boolean): Promise<void> => {
                    if (updateRepeat) {
                        this.setState({ updatePassTrigger: this.state.updatePassTrigger + 1 });
                    }

                    if (!this.state.welcomeDialogShowed) {
                        await this.socket.setState(`matter.${this.instance}.info.welcomeDialog`, true, true);
                    }
                    this.setState({ showWelcomeDialog: false, welcomeDialogShowed: true }, () => {
                        if (navigateTo) {
                            this.setState({ selectedTab: navigateTo });
                        }
                    });
                }}
                host={this.common?.host || ''}
                native={adapterSettings}
                changed={this.state.changed}
                onChange={(id: string, value: string): Promise<void> => {
                    return new Promise<void>(resolve => {
                        this.updateNativeValue(id, value, resolve);
                    });
                }}
            />
        );
    }

    onBackendUpdates = (update: GUIMessage | null): void => {
        if (!update) {
            return;
        }

        if (update.command === 'processing') {
            this.setState({ inProcessing: update.processing || null });
        } else if (update.command === 'progress') {
            if (update.progress) {
                if (update.progress.close) {
                    if (this.state.progress) {
                        this.setState({ progress: null });
                    }
                } else {
                    const progress = { ...this.state.progress };
                    if (update.progress.title !== undefined) {
                        progress.title = update.progress.title;
                    }
                    if (update.progress.value !== undefined) {
                        progress.value = update.progress.value;
                    }
                    if (update.progress.text !== undefined) {
                        progress.text = update.progress.text;
                    }
                    if (update.progress.indeterminate !== undefined) {
                        progress.indeterminate = update.progress.indeterminate;
                    }
                    this.setState({ progress });
                }
            } else if (this.state.progress) {
                this.setState({ progress: null });
            }
        } else if (update.command === 'bridgeStates') {
            // all states at once
            const nodeStates: { [uuid: string]: NodeStateResponse } = {};
            if (update.states) {
                const uuids = update.states ? Object.keys(update.states) : [];
                for (const uuid of uuids) {
                    const nodeId = uuid.split('.').pop();

                    if (nodeId) {
                        nodeStates[nodeId] = update.states[uuid];
                    }
                }
            }
            this.setState({ nodeStates });
        } else if (update.command === 'updateStates') {
            // normally only the state of one device
            const nodeStates = clone(this.state.nodeStates);
            if (update.states) {
                const uuids = update.states ? Object.keys(update.states) : [];
                for (const uuid of uuids) {
                    nodeStates[uuid] = update.states[uuid];
                }
            }
            this.setState({ nodeStates });
        } else if (update.command === 'stopped') {
            // indication, that backend stopped
            if (this.refreshTimer) {
                clearTimeout(this.refreshTimer);
            }
            this.refreshTimer = setTimeout(() => {
                this.refreshTimer = null;
                this.refreshBackendSubscription();
            }, 5_000);
        } else {
            this.controllerMessageHandler && this.controllerMessageHandler(update);
        }
    };

    onChanged = (newConfig: MatterConfig): Promise<void> => {
        if (!this.state.ready) {
            return Promise.resolve();
        }

        return new Promise<void>(resolve => {
            this.setState(
                {
                    matter: newConfig,
                },
                resolve,
            );
        });
    };

    onCommissioningChanged = (newCommissioning: CommissioningInfo): void => {
        if (this.state.ready) {
            this.setState({ commissioning: newCommissioning });
        }
    };

    async componentWillUnmount(): Promise<void> {
        window.alert = this.alert as (_message?: any) => void;
        this.alert = null;
        if (this.intervalSubscribe) {
            clearInterval(this.intervalSubscribe);
            this.intervalSubscribe = null;
        }

        if (this.connectToBackEndInterval) {
            clearInterval(this.connectToBackEndInterval);
            this.connectToBackEndInterval = null;
        }

        if (this.refreshTimer) {
            clearInterval(this.refreshTimer);
            this.refreshTimer = null;
        }

        try {
            this.socket.unsubscribeState(`system.adapter.matter.${this.instance}.alive`, this.onAlive);
            await this.socket.unsubscribeFromInstance(`matter.${this.instance}`, 'gui', this.onBackendUpdates);
        } catch {
            // ignore
        }

        super.componentWillUnmount();
        if (this.configHandler) {
            this.configHandler.destroy();
            this.configHandler = null;
        }
    }

    renderController(): React.ReactNode {
        if (!this.configHandler || !this.socket.systemConfig) {
            return null;
        }

        return (
            <ControllerTab
                registerMessageHandler={(handler: null | ((_message: GUIMessage | null) => void)) =>
                    (this.controllerMessageHandler = handler)
                }
                alive={this.state.alive}
                socket={this.socket}
                instance={this.instance}
                matter={this.state.matter}
                updateConfig={async config => {
                    await this.onChanged(config);
                }}
                savedConfig={this.configHandler.getSavedConfig()}
                adapterName={this.adapterName}
                themeName={this.state.themeName}
                themeType={this.state.themeType}
                theme={this.state.theme}
                isFloatComma={this.socket.systemConfig.common.isFloatComma}
                dateFormat={this.socket.systemConfig.common.dateFormat}
            />
        );
    }

    renderOptions(): React.ReactNode {
        if (!this.common) {
            return null;
        }

        return (
            <OptionsTab
                alive={this.state.alive}
                onChange={(id: string, value: any) => {
                    return new Promise<void>(resolve => {
                        this.updateNativeValue(id, value, resolve);
                    });
                }}
                onShowWelcomeDialog={() => this.setState({ showWelcomeDialog: true })}
                onLoad={(native: MatterAdapterConfig) => this.onLoadConfig(native)}
                socket={this.socket}
                common={this.common}
                native={this.state.native as MatterAdapterConfig}
                instance={this.instance}
                matter={this.state.matter}
                showToast={(text: string) => this.showToast(text)}
                onError={(errorText: string): void => {
                    this.setConfigurationError(errorText);
                }}
                updatePassTrigger={this.state.updatePassTrigger}
            />
        );
    }

    renderBridges(): React.ReactNode {
        return (
            <BridgesTab
                alive={this.state.alive}
                socket={this.socket}
                instance={this.instance}
                commissioning={this.state.commissioning?.bridges || {}}
                updateNodeStates={(nodeStates: { [uuid: string]: NodeStateResponse }) => {
                    const _nodeStates = clone(this.state.nodeStates);
                    Object.assign(_nodeStates, nodeStates);
                    this.setState({ nodeStates: _nodeStates });
                }}
                nodeStates={this.state.nodeStates}
                inProcessing={this.state.inProcessing}
                themeName={this.state.themeName}
                themeType={this.state.themeType}
                theme={this.state.theme}
                detectedDevices={this.state.detectedDevices}
                setDetectedDevices={detectedDevices => this.setState({ detectedDevices })}
                productIDs={productIDs}
                matter={this.state.matter}
                updateConfig={async config => {
                    if (!this.configHandler) {
                        return;
                    }

                    await this.configHandler.saveBridgesConfig(config);
                    await this.onChanged(config);
                }}
                showToast={(text: string) => this.showToast(text)}
                checkLicenseOnAdd={(type: 'addBridge' | 'addDevice' | 'addDeviceToBridge', matter: MatterConfig) =>
                    this.checkLicenseOnAdd(type, matter)
                }
            />
        );
    }

    renderDevices(): React.JSX.Element {
        return (
            <DevicesTab
                alive={this.state.alive}
                updateNodeStates={(nodeStates: { [uuid: string]: NodeStateResponse }) => {
                    const _nodeStates = clone(this.state.nodeStates);
                    Object.assign(_nodeStates, nodeStates);
                    this.setState({ nodeStates: _nodeStates });
                }}
                nodeStates={this.state.nodeStates}
                inProcessing={this.state.inProcessing}
                commissioning={this.state.commissioning?.devices || {}}
                socket={this.socket}
                themeName={this.state.themeName}
                themeType={this.state.themeType}
                theme={this.state.theme}
                detectedDevices={this.state.detectedDevices}
                setDetectedDevices={detectedDevices => this.setState({ detectedDevices })}
                productIDs={productIDs}
                instance={this.instance}
                matter={this.state.matter}
                updateConfig={async config => {
                    if (!this.configHandler) {
                        return;
                    }

                    await this.configHandler.saveDevicesConfig(config);
                    await this.onChanged(config);
                }}
                showToast={(text: string) => this.showToast(text)}
                checkLicenseOnAdd={(matter: MatterConfig) => this.checkLicenseOnAdd('addDevice', matter)}
            />
        );
    }

    async getLicense(): Promise<string | false> {
        const adapterSettings: MatterAdapterConfig = this.state.native as MatterAdapterConfig;

        if (adapterSettings.login && adapterSettings.pass) {
            if (this.state.alive) {
                // ask the instance
                const result = await this.socket.sendTo(`matter.${this.instance}`, 'getLicense', {
                    login: adapterSettings.login,
                    pass: adapterSettings.pass,
                });
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

    async checkLicenseOnAdd(
        type: 'addBridge' | 'addDevice' | 'addDeviceToBridge',
        matter?: MatterConfig,
    ): Promise<boolean> {
        let result: boolean | string = true;
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
                    matter.bridges.find(bridge => bridge.enabled && bridge.list.filter(dev => dev.enabled).length >= 5)
                ) {
                    result = await this.getLicense();
                }
            } else {
                return false;
            }
        } else {
            return false;
        }

        return !!result; // User may add one bridge or one device
    }

    async onSave(isClose?: boolean): Promise<void> {
        super.onSave && super.onSave(isClose);

        try {
            await this.configHandler?.saveConfig(this.state.matter);
            this.setState({ changed: false });
            isClose && GenericApp.onClose();
        } catch (e) {
            window.alert(`Cannot save configuration: ${e.message}`);
        }
    }

    renderProgressDialog(): React.JSX.Element | null {
        if (!this.state.progress) {
            return null;
        }

        return (
            <Dialog
                open={!0}
                onClose={() => {}}
                maxWidth="md"
            >
                {this.state.progress.title ? <DialogTitle>{getText(this.state.progress.title)}</DialogTitle> : null}
                <DialogContent>
                    <LinearProgress
                        variant={this.state.progress.indeterminate ? 'indeterminate' : 'determinate'}
                        value={this.state.progress.value}
                    />
                    {this.state.progress.text ? (
                        <DialogContentText>{getText(this.state.progress.text)}</DialogContentText>
                    ) : null}
                </DialogContent>
            </Dialog>
        );
    }

    render(): React.JSX.Element {
        if (!this.state.ready) {
            return (
                <StyledEngineProvider injectFirst>
                    <ThemeProvider theme={this.state.theme}>
                        <Loader themeType={this.state.themeType} />
                    </ThemeProvider>
                </StyledEngineProvider>
            );
        }

        return (
            <StyledEngineProvider injectFirst>
                <ThemeProvider theme={this.state.theme}>
                    {this.renderToast()}
                    {this.renderProgressDialog()}
                    {this.renderWelcomeDialog()}
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
                                {this.isTab ? null : (
                                    <Tab
                                        sx={{ '&.Mui-selected': styles.selected }}
                                        label={I18n.t('General')}
                                        value="options"
                                    />
                                )}
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
                                    <Tooltip
                                        title={I18n.t('Instance is not alive')}
                                        slotProps={{ popper: { sx: { pointerEvents: 'none' } } }}
                                    >
                                        <IconNotAlive style={{ color: 'orange', padding: 12 }} />
                                    </Tooltip>
                                )}
                                {this.state.backendRunning ? null : (
                                    <Tooltip
                                        title={I18n.t('Reconnect to backend')}
                                        slotProps={{ popper: { sx: { pointerEvents: 'none' } } }}
                                    >
                                        <div
                                            style={{
                                                width: 48,
                                                height: 48,
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                            }}
                                        >
                                            <IconButton
                                                iconColor="warning"
                                                noBackground
                                                icon="noConnection"
                                                onClick={() => this.refreshBackendSubscription()}
                                            />
                                        </div>
                                    </Tooltip>
                                )}
                                {this.common && this.state.selectedTab !== 'options' ? (
                                    <Tooltip
                                        title={I18n.t('Show readme page')}
                                        slotProps={{ popper: { sx: { pointerEvents: 'none' } } }}
                                    >
                                        <Fab
                                            size="small"
                                            color="primary"
                                            style={{
                                                marginRight: 5,
                                                marginTop: 5,
                                                float: 'right',
                                            }}
                                            onClick={() => {
                                                const win = window.open(this.common?.readme, '_blank');
                                                win?.focus();
                                            }}
                                        >
                                            <IconHelp />
                                        </Fab>
                                    </Tooltip>
                                ) : null}
                            </Tabs>
                        </AppBar>

                        <div style={this.state.selectedTab === 'options' ? styles.tabContent : styles.tabContentNoSave}>
                            {this.state.selectedTab === 'options' && this.renderOptions()}
                            {this.state.selectedTab === 'controller' && this.renderController()}
                            {this.state.selectedTab === 'bridges' && this.renderBridges()}
                            {this.state.selectedTab === 'devices' && this.renderDevices()}
                        </div>
                        {this.renderError()}
                        {this.state.selectedTab === 'options' ? this.renderSaveCloseButtons() : null}
                    </div>
                </ThemeProvider>
            </StyledEngineProvider>
        );
    }
}

export default App;
