import React, { Component } from 'react';

import { Add, Bluetooth, BluetoothDisabled, Close, Hub, Save, Search, Warning } from '@mui/icons-material';

import {
    Backdrop,
    Button,
    CircularProgress,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    IconButton,
    Switch,
    TextField,
    Tooltip,
    Typography,
} from '@mui/material';

import {
    type AdminConnection,
    type IobTheme,
    type ThemeName,
    type ThemeType,
    I18n,
    DialogMessage,
    InfoBox,
    IconExpert,
} from '@iobroker/adapter-react-v5';
import DeviceManager from '@iobroker/dm-gui-components';

import type { CommissionableDevice, GUIMessage, MatterConfig } from '../types';
import { clone } from '../Utils';
import QrCodeDialog from '../components/QrCodeDialog';
import DiscoveredDevicesDialog from '../components/DiscoveredDevicesDialog';
import { NetworkGraphDialog, type NetworkGraphData } from '../components/network';

/**
 * Validates that an object conforms to the NetworkGraphData structure
 */
function isNetworkGraphData(data: unknown): data is NetworkGraphData {
    if (!data || typeof data !== 'object') {
        return false;
    }
    const obj = data as Record<string, unknown>;
    return Array.isArray(obj.nodes) && typeof obj.timestamp === 'number';
}

const styles: Record<string, React.CSSProperties> = {
    panel: {
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
    },
    qrScanner: {
        width: 400,
        height: 250,
    },
    deviceName: {
        fontWeight: 'bold',
    },
    nodeId: {
        opacity: 0.5,
        fontStyle: 'italic',
        fontSize: 'smaller',
    },
    device: {
        position: 'relative',
        display: 'flex',
        gap: 4,
        alignItems: 'end',
        height: 32,
    },
    cluster: {
        display: 'flex',
        position: 'relative',
        paddingLeft: 50,
        gap: 4,
        alignItems: 'end',
        height: 32,
    },
    state: {
        display: 'flex',
        paddingLeft: 100,
        fontSize: 'smaller',
        gap: 4,
        alignItems: 'end',
        height: 32,
    },
    number: {
        position: 'absolute',
        top: 3,
        right: 3,
        opacity: 0.5,
        fontSize: 10,
    },
    header: {
        fontSize: 20,
        fontWeight: 'bold',
        marginTop: 1,
    },
    inputField: {
        maxWidth: 600,
        marginBottom: 1,
    },
};

interface ComponentProps {
    /** The current saved config */
    savedConfig: MatterConfig;
    instance: number;
    matter: MatterConfig;
    updateConfig: (config: MatterConfig) => void;
    alive: boolean;
    registerMessageHandler: (handler: null | ((message: GUIMessage | null) => void)) => void;
    adapterName: string;
    socket: AdminConnection;
    isFloatComma: boolean;
    dateFormat: string;
    themeName: ThemeName;
    themeType: ThemeType;
    theme: IobTheme;
    expertMode: boolean;
    setExpertMode: (expertMode: boolean) => void;
}

interface ComponentState {
    /** If the BLE dialog should be shown */
    bleDialogOpen: boolean;
    /** If we are currently waiting for backend processing */
    backendProcessingActive: boolean;
    showDiscoveryDialog: boolean;
    nodes: Record<string, ioBroker.Object>;
    states: Record<string, ioBroker.State>;
    /** If qr code dialog should be shown (optional a device can be provided) */
    showQrCodeDialog: boolean;
    /* increase this number to reload the devices */
    triggerControllerLoad: number;
    discoveryRunning: boolean;
    errorText: string;
    /** Which network graph dialog is shown (null = none) */
    networkGraphDialogType: 'thread' | 'wifi' | null;
    /** Network graph data */
    networkGraphData: NetworkGraphData | null;
    /** Network graph loading error */
    networkGraphError: string | null;
}

class Controller extends Component<ComponentProps, ComponentState> {
    /** Reference object to call methods on DM */
    private readonly refDeviceManager: React.RefObject<DeviceManager> = React.createRef();

    private onDiscoveryMessageHandler: ((device: CommissionableDevice) => void) | null = null;

    constructor(props: ComponentProps) {
        super(props);

        this.state = {
            nodes: {},
            states: {},
            showQrCodeDialog: false,
            showDiscoveryDialog: false,
            backendProcessingActive: false,
            bleDialogOpen: false,
            triggerControllerLoad: 0,
            discoveryRunning: false,
            errorText: '',
            networkGraphDialogType: null,
            networkGraphData: null,
            networkGraphError: null,
        };
    }

    async readStructure(): Promise<void> {
        let nodes: Record<string, ioBroker.Object>;
        try {
            nodes = await this.props.socket.getObjectViewSystem(
                'channel',
                `matter.${this.props.instance}.controller.`,
                `matter.${this.props.instance}.controller.\u9999`,
            );
        } catch {
            nodes = {};
        }
        // ignore 'matter.0.controller.info' channel
        delete nodes[`matter.${this.props.instance}.controller.info`];

        try {
            const _states = await this.props.socket.getObjectViewSystem(
                'state',
                `matter.${this.props.instance}.controller.`,
                `matter.${this.props.instance}.controller.\u9999`,
            );
            Object.keys(_states).forEach(id => (nodes[id] = _states[id]));
        } catch {
            // ignore
        }
        try {
            const devices = await this.props.socket.getObjectViewSystem(
                'device',
                `matter.${this.props.instance}.controller.`,
                `matter.${this.props.instance}.controller.\u9999`,
            );
            Object.keys(devices).forEach(id => (nodes[id] = devices[id]));
        } catch {
            // ignore
        }
        try {
            const bridges = await this.props.socket.getObjectViewSystem(
                'folder',
                `matter.${this.props.instance}.controller.`,
                `matter.${this.props.instance}.controller.\u9999`,
            );
            Object.keys(bridges).forEach(id => (nodes[id] = bridges[id]));
        } catch {
            // ignore
        }

        const states: Record<string, ioBroker.State> = await this.props.socket.getStates(
            `matter.${this.props.instance}.controller.*`,
        );

        this.setState({
            nodes,
            states,
            discoveryRunning: !!states[`matter.${this.props.instance}.controller.info.discovering`]?.val,
        });
    }

    async componentDidMount(): Promise<void> {
        this.props.registerMessageHandler(this.onMessage);
        return this.readStructure()
            .catch(e => window.alert(`Cannot read structure: ${e}`))
            .then(() =>
                this.props.socket
                    .subscribeObject(`matter.${this.props.instance}.controller.*`, this.onObjectChange)
                    .catch(e => window.alert(`Cannot subscribe: ${e}`)),
            )
            .then(() =>
                this.props.socket
                    .subscribeState(`matter.${this.props.instance}.controller.*`, this.onStateChange)
                    .catch(e => window.alert(`Cannot subscribe 1: ${e}`)),
            );
    }

    onObjectChange = (id: string, obj: ioBroker.Object | null | undefined): void => {
        if (!this.state.nodes) {
            return;
        }
        const nodes = clone(this.state.nodes);
        if (obj) {
            nodes[id] = obj;
        } else {
            delete nodes[id];
        }
        this.setState({ nodes });
    };

    onStateChange = (id: string, state: ioBroker.State | null | undefined): void => {
        if (id === `matter.${this.props.instance}.controller.info.discovering`) {
            if (!!state?.val !== this.state.discoveryRunning) {
                this.setState({ discoveryRunning: !!state?.val });
            }
            return;
        }

        if (!this.state.states) {
            return;
        }
        const states = clone(this.state.states);
        if (state) {
            states[id] = state;
        } else {
            delete states[id];
        }
        this.setState({ states });
    };

    async componentWillUnmount(): Promise<void> {
        this.props.registerMessageHandler(null);
        await this.props.socket.unsubscribeObject(`matter.${this.props.instance}.controller.*`, this.onObjectChange);
        this.props.socket.unsubscribeState(`matter.${this.props.instance}.controller.*`, this.onStateChange);
    }

    onMessage = (message: GUIMessage | null): void => {
        if (message?.command === 'reconnect' || message?.command === 'updateController') {
            // refresh the list of devices
            setTimeout(() => {
                this.setState({
                    triggerControllerLoad:
                        this.state.triggerControllerLoad > 5000 ? 1 : this.state.triggerControllerLoad + 1,
                });
            }, 50);
        } else if (message?.command === 'discoveredDevice') {
            if (message.device && this.onDiscoveryMessageHandler) {
                this.onDiscoveryMessageHandler(message.device);
            } else {
                console.log(`Invalid message with no device: ${JSON.stringify(message)}`);
            }
        } else if (message?.command === 'networkGraphUpdate') {
            // Update network graph data if dialog is open
            if (
                message.networkGraphData &&
                this.state.networkGraphDialogType !== null &&
                isNetworkGraphData(message.networkGraphData)
            ) {
                this.setState({ networkGraphData: message.networkGraphData });
            }
        } else {
            console.log(`Unknown update: ${JSON.stringify(message)}`);
        }
    };

    /**
     * Render the loading spinner if backend processing is active
     */
    renderLoadingSpinner(): React.JSX.Element | null {
        if (!this.state.backendProcessingActive) {
            return null;
        }

        return (
            <Backdrop
                sx={{ zIndex: theme => theme.zIndex.drawer + 1 }}
                open
            >
                <CircularProgress />
            </Backdrop>
        );
    }

    /**
     * Render the BLE dialog
     */
    renderBleDialog(): React.JSX.Element | null {
        if (!this.state.bleDialogOpen) {
            return null;
        }

        return (
            <Dialog open={!0}>
                <DialogTitle>{I18n.t('BLE Commissioning information')}</DialogTitle>
                <DialogContent>
                    {this.props.expertMode ? null : (
                        <InfoBox
                            type="info"
                            iconPosition="top"
                            closeable
                            storeId="matter.ble"
                        >
                            {I18n.t('Matter Controller BLE Dialog Infotext')}
                        </InfoBox>
                    )}

                    <Typography sx={styles.header}>{I18n.t('Bluetooth configuration')}</Typography>
                    <TextField
                        fullWidth
                        variant="standard"
                        sx={styles.inputField}
                        type="number"
                        label={I18n.t('Bluetooth HCI ID')}
                        value={this.props.matter.controller.hciId || ''}
                        onChange={e => {
                            const matter = clone(this.props.matter);
                            matter.controller.hciId = e.target.value;
                            this.props.updateConfig(matter);
                        }}
                    />

                    <Typography sx={styles.header}>{I18n.t('WLAN credentials')}</Typography>
                    <TextField
                        fullWidth
                        variant="standard"
                        sx={styles.inputField}
                        label={I18n.t('WiFi SSID')}
                        error={!this.props.matter.controller.wifiSSID && !this.isRequiredBleInformationProvided()}
                        helperText={
                            !this.props.matter.controller.wifiSSID && !this.isRequiredBleInformationProvided()
                                ? I18n.t('Provide your Thread or WiFi information or both!')
                                : ''
                        }
                        value={this.props.matter.controller.wifiSSID || ''}
                        onChange={e => {
                            const matter = clone(this.props.matter);
                            matter.controller.wifiSSID = e.target.value;
                            this.props.updateConfig(matter);
                        }}
                    />

                    <TextField
                        fullWidth
                        variant="standard"
                        sx={styles.inputField}
                        label={I18n.t('WiFi password')}
                        error={!this.props.matter.controller.wifiPassword && !this.isRequiredBleInformationProvided()}
                        helperText={
                            !this.props.matter.controller.wifiPassword && !this.isRequiredBleInformationProvided()
                                ? I18n.t('Provide your Thread or WiFi information or both!')
                                : ''
                        }
                        value={this.props.matter.controller.wifiPassword || ''}
                        onChange={e => {
                            const matter = clone(this.props.matter);
                            matter.controller.wifiPassword = e.target.value;
                            this.props.updateConfig(matter);
                        }}
                    />

                    <Typography sx={styles.header}>{I18n.t('Thread credentials')}</Typography>
                    <TextField
                        fullWidth
                        sx={styles.inputField}
                        variant="standard"
                        label={I18n.t('Thread network name')}
                        error={
                            !this.props.matter.controller.threadNetworkName && !this.isRequiredBleInformationProvided()
                        }
                        helperText={
                            !this.props.matter.controller.threadNetworkName && !this.isRequiredBleInformationProvided()
                                ? I18n.t('Provide your Thread or WiFi information or both!')
                                : ''
                        }
                        value={this.props.matter.controller.threadNetworkName || ''}
                        onChange={e => {
                            const matter = clone(this.props.matter);
                            matter.controller.threadNetworkName = e.target.value;
                            this.props.updateConfig(matter);
                        }}
                    />

                    <TextField
                        fullWidth
                        sx={styles.inputField}
                        variant="standard"
                        label={I18n.t('Thread operational dataset')}
                        error={
                            !this.props.matter.controller.threadOperationalDataSet &&
                            !this.isRequiredBleInformationProvided()
                        }
                        helperText={
                            !this.props.matter.controller.threadOperationalDataSet &&
                            !this.isRequiredBleInformationProvided()
                                ? I18n.t('Provide your Thread or WiFi information or both!')
                                : ''
                        }
                        value={this.props.matter.controller.threadOperationalDataSet || ''}
                        onChange={e => {
                            const matter = clone(this.props.matter);
                            matter.controller.threadOperationalDataSet = e.target.value;
                            this.props.updateConfig(matter);
                        }}
                    />

                    <DialogActions>
                        <Button
                            variant="contained"
                            color="primary"
                            disabled={
                                JSON.stringify(this.props.savedConfig.controller) ===
                                JSON.stringify(this.props.matter.controller)
                            }
                            onClick={async () => {
                                this.setState({ backendProcessingActive: true, bleDialogOpen: false });
                                const res = await this.props.socket.sendTo(
                                    `matter.${this.props.instance}`,
                                    'updateControllerSettings',
                                    JSON.stringify(this.props.matter.controller),
                                );
                                console.log(res);
                                this.setState({ backendProcessingActive: false });
                            }}
                            startIcon={<Save />}
                        >
                            {I18n.t('Save')}
                        </Button>
                    </DialogActions>

                    <Typography sx={styles.header}>{I18n.t('Bluetooth configuration')}</Typography>
                    {this.props.expertMode ? null : (
                        <InfoBox type={!this.isRequiredBleInformationProvided() ? 'error' : 'info'}>
                            {I18n.t(
                                this.isRequiredBleInformationProvided()
                                    ? 'Activate BLE to pair devices nearby. You can also use the "ioBroker Visu" App to pair other devices.'
                                    : 'You need to configure WLAN or Thread credentials above to activate BLE',
                            )}
                        </InfoBox>
                    )}
                    <DialogActions>
                        <Button
                            variant="contained"
                            color="primary"
                            disabled={
                                !this.isRequiredBleInformationProvided() ||
                                (this.props.matter.controller.ble &&
                                    JSON.stringify(this.props.savedConfig) === JSON.stringify(this.props.matter))
                            }
                            onClick={async () => {
                                await this.setBleEnabled(true);
                            }}
                            startIcon={<Bluetooth />}
                        >
                            {I18n.t('Enable')}
                        </Button>
                        <Button
                            variant="contained"
                            color="primary"
                            onClick={async () => {
                                await this.setBleEnabled(false);
                            }}
                            startIcon={<BluetoothDisabled />}
                            disabled={!this.props.matter.controller.ble}
                        >
                            {I18n.t('Disable')}
                        </Button>
                    </DialogActions>
                </DialogContent>
                <DialogActions>
                    <Button
                        variant="contained"
                        color="primary"
                        onClick={() => this.setState({ bleDialogOpen: false })}
                        startIcon={<Close />}
                    >
                        {I18n.t('Close')}
                    </Button>
                </DialogActions>
            </Dialog>
        );
    }

    /**
     * Tell backend to enable/disable BLE
     *
     * @param enabled if enabled or disabled
     */
    async setBleEnabled(enabled: boolean): Promise<void> {
        const matter = clone(this.props.matter);
        matter.controller.ble = enabled;
        this.setState({ backendProcessingActive: true, bleDialogOpen: false });
        const res = await this.props.socket.sendTo(
            `matter.${this.props.instance}`,
            'updateControllerSettings',
            JSON.stringify(matter.controller),
        );
        console.log(res);
        this.setState({ backendProcessingActive: false });
    }

    /**
     * Load network graph data from backend
     */
    loadNetworkGraphData = async (): Promise<void> => {
        try {
            this.setState({ networkGraphError: null });
            const result = await this.props.socket.sendTo(
                `matter.${this.props.instance}`,
                'controllerNetworkGraphData',
                {},
            );
            if (result?.result && isNetworkGraphData(result.result)) {
                this.setState({ networkGraphData: result.result });
            } else if (result?.error) {
                this.setState({ networkGraphError: result.error });
            } else if (result?.result) {
                console.error('Invalid network graph data received:', result.result);
                this.setState({ networkGraphError: 'Invalid network graph data format' });
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error('Failed to load network graph data:', error);
            this.setState({ networkGraphError: errorMessage });
        }
    };

    /**
     * Update network connections for specified nodes
     */
    updateNetworkConnections = async (nodeIds: string[]): Promise<void> => {
        try {
            await this.props.socket.sendTo(`matter.${this.props.instance}`, 'controllerRefreshNodeNetworkData', {
                nodeIds,
            });
        } catch (error) {
            console.error('Failed to refresh node network data:', error);
            throw error;
        }
    };

    /**
     * Render the network graph dialog
     */
    renderNetworkGraphDialog(): React.JSX.Element | null {
        if (this.state.networkGraphDialogType === null) {
            return null;
        }

        return (
            <NetworkGraphDialog
                open={this.state.networkGraphDialogType !== null}
                data={this.state.networkGraphData}
                error={this.state.networkGraphError}
                onClose={() => this.setState({ networkGraphDialogType: null, networkGraphError: null })}
                onRefresh={this.loadNetworkGraphData}
                onUpdateConnections={this.updateNetworkConnections}
                darkMode={this.props.themeType === 'dark'}
                networkType={this.state.networkGraphDialogType}
            />
        );
    }

    renderQrCodeDialog(): React.JSX.Element | null {
        if (!this.state.showQrCodeDialog) {
            return null;
        }

        return (
            <QrCodeDialog
                onClose={async (manualCode?: string, qrCode?: string): Promise<void> => {
                    if (manualCode || qrCode) {
                        this.setState({ showQrCodeDialog: false, backendProcessingActive: true });

                        const result = await this.props.socket.sendTo(
                            `matter.${this.props.instance}`,
                            'controllerCommissionDevice',
                            {
                                qrCode,
                                manualCode,
                            },
                        );

                        this.setState({ backendProcessingActive: false });

                        if (result.error || !result.result) {
                            this.setState({
                                errorText: `${I18n.t('Cannot pair device')}: ${I18n.t(result.error) || I18n.t('Unknown error')}`,
                            });
                        } else {
                            window.alert(I18n.t('Connected'));
                            this.refDeviceManager.current?.loadData();
                        }
                    } else {
                        this.setState({ showQrCodeDialog: false });
                    }
                }}
                themeType={this.props.themeType}
            />
        );
    }

    renderShowDiscoveredDevices(): React.JSX.Element | null {
        if (!this.state.showDiscoveryDialog) {
            return null;
        }
        return (
            <DiscoveredDevicesDialog
                socket={this.props.socket}
                registerDiscoveryMessageHandler={(handler: null | ((device: CommissionableDevice) => void)): void => {
                    this.onDiscoveryMessageHandler = handler;
                }}
                triggerDeviceManagerLoad={() => this.refDeviceManager.current?.loadData()}
                onClose={(): void => this.setState({ showDiscoveryDialog: false })}
                ble={!!this.props.matter.controller.ble}
                instance={this.props.instance}
                themeType={this.props.themeType}
            />
        );
    }

    /**
     * If BLE can be activated
     */
    isRequiredBleInformationProvided(): boolean {
        const controllerConfig = this.props.matter.controller;

        return !!(
            (controllerConfig.wifiSSID && controllerConfig.wifiPassword) ||
            (controllerConfig.threadNetworkName && controllerConfig.threadOperationalDataSet)
        );
    }

    renderDeviceManager(): React.JSX.Element | null {
        if (!this.state.nodes) {
            return null;
        }

        if (!this.props.alive) {
            return <div style={{ fontSize: 'larger', color: '#8c5c5c' }}>{I18n.t('Instance is not alive')}</div>;
        }

        return (
            <div style={{ width: '100%' }}>
                <DeviceManager
                    ref={this.refDeviceManager}
                    title={I18n.t('Commissioned Devices')}
                    socket={this.props.socket}
                    selectedInstance={`${this.props.adapterName}.${this.props.instance}`}
                    style={{ justifyContent: 'start' }}
                    themeName={this.props.themeName}
                    themeType={this.props.themeType}
                    theme={this.props.theme}
                    isFloatComma={this.props.isFloatComma}
                    dateFormat={this.props.dateFormat}
                    triggerLoad={this.state.triggerControllerLoad}
                />
            </div>
        );
    }

    renderShowErrorDialog(): React.JSX.Element | null {
        if (!this.state.errorText) {
            return null;
        }
        let errorText = this.state.errorText;
        if (this.state.errorText.includes('Unknown command')) {
            errorText = errorText.replace('Unknown command', I18n.t('Unknown command'));
        } else if (this.state.errorText.includes('Error while executing command')) {
            errorText = errorText.replace('Error while executing command', I18n.t('Error while executing command'));
        }

        return (
            <DialogMessage
                icon={<Warning style={{ color: this.props.themeType === 'dark' ? '#ff3434' : '#b60000' }} />}
                text={errorText}
                title={I18n.t('Error')}
                onClose={() => this.setState({ errorText: '' })}
            />
        );
    }

    render(): React.JSX.Element {
        if (!this.props.alive && this.state.showDiscoveryDialog) {
            setTimeout(() => this.setState({ showDiscoveryDialog: false }), 100);
        }

        return (
            <div style={styles.panel}>
                {this.props.expertMode ? null : (
                    <InfoBox
                        type="info"
                        closeable
                        storeId="matter.controller.info"
                        iconPosition="top"
                    >
                        {I18n.t('Matter Controller Infotext')}
                    </InfoBox>
                )}
                {this.renderLoadingSpinner()}
                {this.renderShowDiscoveredDevices()}
                {this.renderQrCodeDialog()}
                {this.renderBleDialog()}
                {this.renderShowErrorDialog()}
                {this.renderNetworkGraphDialog()}
                <div>
                    <Tooltip
                        title={I18n.t('Toggle expert mode')}
                        slotProps={{ popper: { sx: { pointerEvents: 'none' } } }}
                    >
                        <IconButton
                            style={{ marginRight: 16 }}
                            onClick={() => this.props.setExpertMode(!this.props.expertMode)}
                            color={this.props.expertMode ? 'primary' : 'default'}
                        >
                            <IconExpert />
                        </IconButton>
                    </Tooltip>
                    {I18n.t('Off')}
                    <Switch
                        disabled={this.state.discoveryRunning}
                        checked={this.props.matter.controller.enabled}
                        onChange={async e => {
                            const matter = clone(this.props.matter);
                            matter.controller.enabled = e.target.checked;
                            // this.props.updateConfig(matter);
                            this.setState({ backendProcessingActive: true });
                            const res = await this.props.socket.sendTo(
                                `matter.${this.props.instance}`,
                                'updateControllerSettings',
                                JSON.stringify(matter.controller),
                            );
                            console.log(res);
                            this.setState({ backendProcessingActive: false });
                        }}
                    />
                    {I18n.t('On')}
                </div>
                <div style={{ display: 'flex', width: '100%', flexFlow: 'wrap', gap: 8 }}>
                    {this.props.matter.controller.enabled && this.props.alive ? (
                        <Button
                            variant="contained"
                            disabled={this.state.discoveryRunning}
                            startIcon={this.state.discoveryRunning ? <CircularProgress size={20} /> : <Search />}
                            onClick={() => this.setState({ showDiscoveryDialog: true })}
                        >
                            {I18n.t('Discovery devices')}
                        </Button>
                    ) : null}
                    {this.props.matter.controller.enabled && this.props.alive ? (
                        <Button
                            variant="contained"
                            color="primary"
                            onClick={() => this.setState({ showQrCodeDialog: true })}
                            startIcon={<Add />}
                        >
                            {I18n.t('Add device by pairing code or QR Code')}
                        </Button>
                    ) : null}
                    {this.props.matter.controller.enabled && this.props.alive ? (
                        <Button
                            variant="contained"
                            color="primary"
                            onClick={() => this.setState({ bleDialogOpen: true })}
                            startIcon={this.props.matter.controller.ble ? <Bluetooth /> : <BluetoothDisabled />}
                        >
                            {I18n.t('BLE Commissioning information')}
                        </Button>
                    ) : null}
                    {this.props.matter.controller.enabled && this.props.alive ? (
                        <Button
                            variant="contained"
                            color="primary"
                            onClick={() => {
                                this.setState({ networkGraphDialogType: 'thread' });
                                void this.loadNetworkGraphData();
                            }}
                            startIcon={<Hub />}
                        >
                            {I18n.t('Thread Topology')}
                        </Button>
                    ) : null}
                    {this.props.matter.controller.enabled && this.props.alive ? (
                        <Button
                            variant="contained"
                            color="primary"
                            onClick={() => {
                                this.setState({ networkGraphDialogType: 'wifi' });
                                void this.loadNetworkGraphData();
                            }}
                            startIcon={<Hub />}
                        >
                            {I18n.t('WiFi Topology')}
                        </Button>
                    ) : null}
                </div>
                {this.props.matter.controller.enabled ? this.renderDeviceManager() : null}
            </div>
        );
    }
}

export default Controller;
