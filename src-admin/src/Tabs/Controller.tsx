import React, { Component } from 'react';
import QrScanner from 'qr-scanner';

import { IconButton, InfoBox } from '@foxriver76/iob-component-lib';

import { Add, Bluetooth, BluetoothDisabled, Close, Save, Search, SearchOff } from '@mui/icons-material';

import {
    Backdrop,
    Button,
    CircularProgress,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    LinearProgress,
    MenuItem,
    Select,
    Switch,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableRow,
    TextField,
    Typography,
} from '@mui/material';

import { type AdminConnection, type IobTheme, type ThemeName, type ThemeType, I18n } from '@iobroker/adapter-react-v5';
import DeviceManager from '@iobroker/dm-gui-components';

import type { CommissionableDevice, GUIMessage, MatterConfig } from '../types';
import { clone, getVendorName } from '../Utils';

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
}

interface ComponentState {
    /** If the BLE dialog should be shown */
    bleDialogOpen: boolean;
    /** If we are currently waiting for backend processing */
    backendProcessingActive: boolean;
    discovered: CommissionableDevice[];
    discoveryRunning: boolean;
    discoveryDone: boolean;
    qrCode: string | null;
    manualCode: string;
    cameras: QrScanner.Camera[];
    camera: string;
    hideVideo: boolean;
    nodes: Record<string, ioBroker.Object>;
    states: Record<string, ioBroker.State>;
    /** If qr code dialog should be shown (optional a device can be provided) */
    showQrCodeDialog: { device?: CommissionableDevice; open: boolean };
    /* increase this number to reload the devices */
    triggerControllerLoad: number;
    /** qr scan error */
    qrError: string;
}

class Controller extends Component<ComponentProps, ComponentState> {
    /** Reference object to call methods on QR Scanner */
    private readonly refQrScanner: React.RefObject<HTMLVideoElement> = React.createRef();

    /** Reference object to call methods on DM */
    private readonly refDeviceManager: React.RefObject<DeviceManager> = React.createRef();

    private qrScanner: QrScanner | null | true = null;

    constructor(props: ComponentProps) {
        super(props);

        this.state = {
            discovered: [],
            discoveryRunning: false,
            discoveryDone: false,
            qrCode: null,
            manualCode: '',
            cameras: [],
            camera: '',
            hideVideo: false,
            nodes: {},
            states: {},
            showQrCodeDialog: { open: false },
            backendProcessingActive: false,
            bleDialogOpen: false,
            triggerControllerLoad: 0,
            qrError: '',
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

        this.setState({ nodes, states });
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
            if (state?.val) {
                this.setState({ discoveryRunning: true });
            } else {
                this.setState({ discoveryRunning: false });
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
        this.destroyQrCode();
        await this.props.socket.unsubscribeObject(`matter.${this.props.instance}.controller.*`, this.onObjectChange);
        this.props.socket.unsubscribeState(`matter.${this.props.instance}.controller.*`, this.onStateChange);
    }

    async initQrCode(): Promise<void> {
        if (!this.qrScanner && this.refQrScanner.current) {
            this.qrScanner = true;

            this.qrScanner = new QrScanner(
                this.refQrScanner.current,
                (result: QrScanner.ScanResult): void => {
                    if (result?.data && result.data !== this.state.qrCode) {
                        this.setState({ qrCode: result.data, qrError: '' });
                    }
                },
                {
                    returnDetailedScanResult: true,
                    highlightCodeOutline: true,
                    highlightScanRegion: true,
                    maxScansPerSecond: 5,
                    alsoTryWithoutScanRegion: true,
                    onDecodeError: error => {
                        if (!this.state.qrCode && this.state.qrError !== error.toString()) {
                            this.setState({ qrError: I18n.t(error.toString()) });
                        }
                    },
                },
            );

            const cameras: QrScanner.Camera[] = await QrScanner.listCameras(true);

            const camera = window.localStorage.getItem('camera') || (cameras.length ? cameras[0].id : '');

            await this.qrScanner.setCamera(camera);

            this.setState({ cameras, camera, hideVideo: !cameras.length });
        }

        if (this.qrScanner && this.qrScanner !== true) {
            await this.qrScanner.start();
        }
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
            if (message.device) {
                const discovered = clone(this.state.discovered);
                discovered.push(message.device);
                this.setState({ discovered });
            } else {
                console.log(`Invalid message with no device: ${JSON.stringify(message)}`);
            }
        } else {
            console.log(`Unknown update: ${JSON.stringify(message)}`);
        }
    };

    destroyQrCode(): void {
        if (this.qrScanner && this.qrScanner !== true) {
            this.qrScanner.destroy();
        }
        this.qrScanner = null;
    }

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
                    <div>
                        <InfoBox type="info">{I18n.t('Matter Controller BLE Dialog Infotext')}</InfoBox>

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
                    </div>

                    <Typography sx={styles.header}>{I18n.t('WLAN credentials')}</Typography>
                    <div>
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
                    </div>

                    <div>
                        <TextField
                            fullWidth
                            variant="standard"
                            sx={styles.inputField}
                            label={I18n.t('WiFi password')}
                            error={
                                !this.props.matter.controller.wifiPassword && !this.isRequiredBleInformationProvided()
                            }
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
                    </div>

                    <Typography sx={styles.header}>{I18n.t('Thread credentials')}</Typography>
                    <div>
                        <TextField
                            fullWidth
                            sx={styles.inputField}
                            variant="standard"
                            label={I18n.t('Thread network name')}
                            error={
                                !this.props.matter.controller.threadNetworkName &&
                                !this.isRequiredBleInformationProvided()
                            }
                            helperText={
                                !this.props.matter.controller.threadNetworkName &&
                                !this.isRequiredBleInformationProvided()
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
                    </div>

                    <div>
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
                    </div>

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
                    <InfoBox type={!this.isRequiredBleInformationProvided() ? 'error' : 'info'}>
                        {I18n.t(
                            this.isRequiredBleInformationProvided()
                                ? 'Activate BLE to pair devices nearby. You can also use the "ioBroker Visu" App to pair other devices.'
                                : 'You need to configure WLAN or Thread credentials above to activate BLE',
                        )}
                    </InfoBox>
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

    renderQrCodeDialog(): React.JSX.Element | null {
        if (!this.state.showQrCodeDialog.open) {
            return null;
        }

        return (
            <Dialog
                open={!0}
                onClose={() => this.setState({ showQrCodeDialog: { open: false } }, () => this.destroyQrCode())}
            >
                <DialogTitle>{I18n.t('QR Code')}</DialogTitle>
                <DialogContent>
                    <TextField
                        variant="standard"
                        label={I18n.t('Manual pairing code')}
                        fullWidth
                        value={this.state.manualCode}
                        onChange={e => this.setState({ manualCode: e.target.value })}
                    />
                    <div id="video-container">
                        <video
                            ref={this.refQrScanner}
                            style={{
                                ...styles.qrScanner,
                                display: this.state.hideVideo ? 'none' : 'block',
                            }}
                        />
                    </div>
                    <div style={{ width: '100%', height: 71 }}>
                        <TextField
                            variant="standard"
                            label={I18n.t('QR Code')}
                            slotProps={{
                                htmlInput: {
                                    readOnly: true,
                                },
                            }}
                            fullWidth
                            value={this.state.qrCode || ''}
                            error={!!this.state.qrError}
                            helperText={this.state.qrError}
                        />
                    </div>
                    {this.state.camera.length ? (
                        <Select
                            variant="standard"
                            value={this.state.camera}
                            onChange={async e => {
                                if (this.qrScanner && this.qrScanner !== true) {
                                    await this.qrScanner.setCamera(e.target.value);
                                }
                                window.localStorage.setItem('camera', e.target.value);
                                this.setState({ camera: e.target.value });
                            }}
                        >
                            {this.state.cameras.map((camera, i) => (
                                <MenuItem
                                    key={i}
                                    value={camera.id}
                                >
                                    {camera.label}
                                </MenuItem>
                            ))}
                        </Select>
                    ) : null}
                </DialogContent>
                <DialogActions>
                    <Button
                        variant="contained"
                        disabled={!this.state.qrCode && !this.state.manualCode}
                        color="primary"
                        onClick={async () => {
                            const device = this.state.showQrCodeDialog.device;
                            this.setState({ showQrCodeDialog: { open: false }, backendProcessingActive: true }, () =>
                                this.destroyQrCode(),
                            );

                            const result = await this.props.socket.sendTo(
                                `matter.${this.props.instance}`,
                                'controllerCommissionDevice',
                                {
                                    device,
                                    qrCode: this.state.qrCode,
                                    manualCode: this.state.manualCode,
                                },
                            );

                            this.setState({ backendProcessingActive: false });

                            if (result.error || !result.result) {
                                window.alert(`Cannot connect: ${result.error || 'Unknown error'}`);
                            } else {
                                window.alert(I18n.t('Connected'));
                                const deviceId = device?.deviceIdentifier;
                                const discovered = this.state.discovered.filter(
                                    commDevice => commDevice.deviceIdentifier !== deviceId,
                                );

                                this.setState({ discovered }, () => {
                                    this.refDeviceManager.current?.loadData();
                                });
                            }
                        }}
                        startIcon={<Add />}
                    >
                        {I18n.t('Add')}
                    </Button>
                    <Button
                        variant="contained"
                        color="grey"
                        onClick={() => this.setState({ showQrCodeDialog: { open: false } }, () => this.destroyQrCode())}
                        startIcon={<Close />}
                    >
                        {I18n.t('Close')}
                    </Button>
                </DialogActions>
            </Dialog>
        );
    }

    renderShowDiscoveredDevices(): React.JSX.Element | null {
        if (!this.state.discoveryRunning && !this.state.discoveryDone) {
            return null;
        }
        return (
            <Dialog
                sx={{ '.MuiDialog-paper': { maxWidth: 800 } }}
                open={!0}
                onClose={() => this.setState({ discoveryDone: false })}
            >
                <DialogTitle>{I18n.t('Discovered devices to pair')}</DialogTitle>
                <DialogContent>
                    <InfoBox type="info">
                        {I18n.t(this.props.matter.controller.ble ? 'Pairing Info Text BLE' : 'Pairing Info Text')}
                    </InfoBox>
                    {this.state.discoveryRunning ? <LinearProgress /> : null}
                    <Table style={{ width: '100%' }}>
                        <TableHead>
                            <TableCell>{I18n.t('Name')}</TableCell>
                            <TableCell>{I18n.t('Identifier')}</TableCell>
                            <TableCell>{I18n.t('Vendor ID')}</TableCell>
                            <TableCell />
                        </TableHead>
                        <TableBody>
                            {this.state.discovered.map(device => (
                                <TableRow key={device.deviceIdentifier}>
                                    <TableCell>{device.DN}</TableCell>
                                    <TableCell>{device.deviceIdentifier}</TableCell>
                                    <TableCell>{getVendorName(device.V)}</TableCell>
                                    <TableCell>
                                        <IconButton
                                            icon="leakAdd"
                                            tooltipText={I18n.t('Connect')}
                                            onClick={async () => {
                                                await this.stopDiscovery();
                                                this.setState({
                                                    showQrCodeDialog: { device, open: true },
                                                    manualCode: '',
                                                    qrCode: '',
                                                    qrError: '',
                                                });
                                                setTimeout(async () => {
                                                    try {
                                                        await this.initQrCode();
                                                    } catch (e) {
                                                        console.warn(`Cannot provide QR Code scanning: ${e}`);
                                                    }
                                                }, 500);
                                            }}
                                        />
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </DialogContent>
                <DialogActions>
                    <Button
                        disabled={!this.state.discoveryRunning}
                        variant="contained"
                        onClick={async () => {
                            await this.stopDiscovery();
                        }}
                        startIcon={<SearchOff />}
                    >
                        {I18n.t('Stop')}
                    </Button>
                    <Button
                        disabled={this.state.discoveryRunning}
                        variant="contained"
                        color="grey"
                        onClick={() => this.setState({ discoveryDone: false })}
                        startIcon={<Close />}
                    >
                        {I18n.t('Close')}
                    </Button>
                </DialogActions>
            </Dialog>
        );
    }

    /**
     * Stop discovering devices
     */
    async stopDiscovery(): Promise<void> {
        console.log('Stop discovery');
        await this.props.socket.sendTo(`matter.${this.props.instance}`, 'controllerDiscoveryStop', {});
        this.setState({ discoveryDone: false });
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
                />
            </div>
        );
    }

    render(): React.JSX.Element {
        if (!this.props.alive && (this.state.discoveryRunning || this.state.discoveryDone)) {
            setTimeout(() => this.setState({ discoveryRunning: false, discoveryDone: false }), 100);
        }

        return (
            <div style={styles.panel}>
                <InfoBox type="info">{I18n.t('Matter Controller Infotext')}</InfoBox>
                {this.renderLoadingSpinner()}
                {this.renderShowDiscoveredDevices()}
                {this.renderQrCodeDialog()}
                {this.renderBleDialog()}
                <div>
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
                <div>
                    {this.props.matter.controller.enabled && this.props.alive ? (
                        <Button
                            variant="contained"
                            disabled={this.state.discoveryRunning}
                            startIcon={this.state.discoveryRunning ? <CircularProgress size={20} /> : <Search />}
                            onClick={() => {
                                this.setState({ discovered: [] }, async () => {
                                    const result: {
                                        error?: string;
                                        result: CommissionableDevice[];
                                    } = await this.props.socket.sendTo(
                                        `matter.${this.props.instance}`,
                                        'controllerDiscovery',
                                        {},
                                    );

                                    if (result.error) {
                                        window.alert(`Cannot discover: ${result.error}`);
                                    } else {
                                        this.setState({
                                            discovered: result.result,
                                            discoveryDone: true,
                                        });
                                    }
                                });
                            }}
                        >
                            {I18n.t('Discovery devices')}
                        </Button>
                    ) : null}
                    {this.props.matter.controller.enabled && this.props.alive ? (
                        <Button
                            sx={{ marginX: 1 }}
                            variant="contained"
                            color="primary"
                            onClick={() => {
                                this.setState({ showQrCodeDialog: { open: true }, qrError: '', qrCode: '' });
                                setTimeout(async () => {
                                    try {
                                        await this.initQrCode();
                                    } catch (e) {
                                        console.warn(`Cannot provide QR Code scanning: ${e}`);
                                    }
                                }, 200);
                            }}
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
                </div>
                {this.props.matter.controller.enabled ? this.renderDeviceManager() : null}
            </div>
        );
    }
}

export default Controller;
