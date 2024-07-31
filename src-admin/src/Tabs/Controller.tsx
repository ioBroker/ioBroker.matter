import QrScanner from 'qr-scanner';
import React, { Component } from 'react';

import {
    Add,
    Bluetooth,
    BluetoothDisabled,
    SettingsInputHdmi as ChannelIcon,
    Close,
    TabletAndroid as DeviceIcon,
    Info,
    KeyboardArrowDown,
    KeyboardArrowUp,
    LeakAdd,
    KeyboardBackspace as ReadOnlyStateIcon,
    CompareArrows as ReadWriteStateIcon,
    Save,
    Search,
    SearchOff,
    Wifi,
    WifiOff,
    ArrowRightAlt as WriteOnlyStateIcon,
} from '@mui/icons-material';
import {
    Backdrop,
    Box,
    Button,
    CircularProgress,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    IconButton,
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
    Tooltip,
    Typography,
} from '@mui/material';

import type { AdminConnection, IobTheme, ThemeName, ThemeType } from '@iobroker/adapter-react-v5';
import { I18n, IconClosed, IconOpen } from '@iobroker/adapter-react-v5';
import DeviceManager from '@iobroker/dm-gui-components';

import type { CommissionableDevice, GUIMessage, MatterConfig } from '../types';
import { clone, getText } from '../Utils';

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
    infoBox: {
        whiteSpace: 'preserve',
        display: 'flex',
        gap: 1,
        alignItems: 'center',
        borderWidth: 1,
        borderStyle: 'solid',
        padding: 1,
        borderRadius: 5,
        marginBottom: 2,
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
    openedNodes: string[];
    showQrCodeDialog: CommissionableDevice | null;
}

class Controller extends Component<ComponentProps, ComponentState> {
    /** Reference object to call methods on QR Scanner */
    private readonly refQrScanner: React.RefObject<HTMLVideoElement> = React.createRef();

    /** Reference object to call methods on DM */
    private readonly refDeviceManager: React.RefObject<DeviceManager> = React.createRef();

    private qrScanner: QrScanner | null | true = null;

    constructor(props: ComponentProps) {
        super(props);
        const openedNodesStr = window.localStorage.getItem('openedNodes');
        let openedNodes: string[];
        if (openedNodesStr) {
            try {
                openedNodes = JSON.parse(openedNodesStr);
            } catch {
                openedNodes = [];
            }
        } else {
            openedNodes = [];
        }

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
            openedNodes,
            showQrCodeDialog: null,
            backendProcessingActive: false,
            bleDialogOpen: false,
        };
    }

    async readStructure() {
        let nodes: Record<string, ioBroker.Object>;
        try {
            nodes = await this.props.socket.getObjectViewSystem(
                'channel',
                `matter.${this.props.instance}.controller.`,
                `matter.${this.props.instance}.controller.\u9999`,
            );
        } catch (e) {
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
        } catch (e) {
            // ignore
        }
        try {
            const devices = await this.props.socket.getObjectViewSystem(
                'device',
                `matter.${this.props.instance}.controller.`,
                `matter.${this.props.instance}.controller.\u9999`,
            );
            Object.keys(devices).forEach(id => (nodes[id] = devices[id]));
        } catch (e) {
            // ignore
        }
        try {
            const bridges = await this.props.socket.getObjectViewSystem(
                'folder',
                `matter.${this.props.instance}.controller.`,
                `matter.${this.props.instance}.controller.\u9999`,
            );
            Object.keys(bridges).forEach(id => (nodes[id] = bridges[id]));
        } catch (e) {
            // ignore
        }

        const states: Record<string, ioBroker.State> = await this.props.socket.getStates(
            `matter.${this.props.instance}.controller.*`,
        );

        this.setState({ nodes, states });
    }

    async componentDidMount() {
        this.props.registerMessageHandler(this.onMessage);
        this.readStructure()
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

    onObjectChange = (id: string, obj: ioBroker.Object | null | undefined) => {
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

    onStateChange = (id: string, state: ioBroker.State | null | undefined) => {
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

    async componentWillUnmount() {
        this.props.registerMessageHandler(null);
        this.destroyQrCode();
        await this.props.socket.unsubscribeObject(`matter.${this.props.instance}.controller.*`, this.onObjectChange);
        this.props.socket.unsubscribeState(`matter.${this.props.instance}.controller.*`, this.onStateChange);
    }

    async initQrCode() {
        if (!this.qrScanner && this.refQrScanner.current) {
            this.qrScanner = true;

            this.qrScanner = new QrScanner(
                this.refQrScanner.current,
                result => {
                    if (result?.data && result.data !== this.state.qrCode) {
                        this.setState({ qrCode: result.data });
                    }
                },
                {
                    returnDetailedScanResult: true,
                    highlightCodeOutline: true,
                    maxScansPerSecond: 5,
                    // preferredCamera: camera,
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

    onMessage = (message: GUIMessage | null) => {
        if (message?.command === 'discoveredDevice') {
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

    destroyQrCode() {
        if (this.qrScanner && this.qrScanner !== true) {
            this.qrScanner.destroy();
        }
        this.qrScanner = null;
    }

    /**
     * Render the loading spinner if backend processing is active
     */
    renderLoadingSpinner(): React.JSX.Element {
        if (!this.state.backendProcessingActive) {
            return null;
        }

        return (
            <Backdrop sx={{ zIndex: theme => theme.zIndex.drawer + 1 }} open>
                <CircularProgress />
            </Backdrop>
        );
    }

    /**
     * Render the BLE dialog
     */
    renderBleDialog(): React.JSX.Element {
        if (!this.state.bleDialogOpen) {
            return null;
        }

        return (
            <Dialog open={!0}>
                <DialogTitle>{I18n.t('Commissioning information')}</DialogTitle>
                <DialogContent>
                    <div>
                        <TextField
                            fullWidth
                            variant="standard"
                            style={{ maxWidth: 600 }}
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

                    <div>
                        <TextField
                            fullWidth
                            variant="standard"
                            style={{ maxWidth: 600 }}
                            label={I18n.t('WiFI SSID')}
                            error={!this.props.matter.controller.wifiSSID && !this.isRequiredBleInformationProvided()}
                            helperText={
                                !this.props.matter.controller.wifiSSID && !this.isRequiredBleInformationProvided()
                                    ? I18n.t('Provide your Thread or BLE information or both!')
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
                            style={{ maxWidth: 600 }}
                            label={I18n.t('WiFI password')}
                            error={
                                !this.props.matter.controller.wifiPassword && !this.isRequiredBleInformationProvided()
                            }
                            helperText={
                                !this.props.matter.controller.wifiPassword && !this.isRequiredBleInformationProvided()
                                    ? I18n.t('Provide your Thread or BLE information or both!')
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

                    <div>
                        <TextField
                            fullWidth
                            style={{ maxWidth: 600 }}
                            variant="standard"
                            label={I18n.t('Thread network name')}
                            error={
                                !this.props.matter.controller.threadNetworkName &&
                                !this.isRequiredBleInformationProvided()
                            }
                            helperText={
                                !this.props.matter.controller.threadNetworkName &&
                                !this.isRequiredBleInformationProvided()
                                    ? I18n.t('Provide your Thread or BLE information or both!')
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
                            style={{ maxWidth: 600 }}
                            variant="standard"
                            label={I18n.t('Thread operational dataset')}
                            error={
                                !this.props.matter.controller.threadOperationalDataSet &&
                                !this.isRequiredBleInformationProvided()
                            }
                            helperText={
                                !this.props.matter.controller.threadOperationalDataSet &&
                                !this.isRequiredBleInformationProvided()
                                    ? I18n.t('Provide your Thread or BLE information or both!')
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
                </DialogContent>

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

                <DialogTitle>{I18n.t('Bluetooth')}</DialogTitle>
                <DialogContent>
                    <Typography sx={{ fontSize: 18 }}>
                        {I18n.t(
                            'Activate BLE to pair devices nearby. You can also use the "ioBroker Visu" App to pair other devices.',
                        )}
                    </Typography>
                </DialogContent>

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

    renderQrCodeDialog() {
        if (!this.state.showQrCodeDialog) {
            return null;
        }
        return (
            <Dialog open={!0} onClose={() => this.setState({ showQrCodeDialog: null }, () => this.destroyQrCode())}>
                <DialogTitle>{I18n.t('QR Code')}</DialogTitle>
                <DialogContent>
                    <TextField
                        variant="standard"
                        label={I18n.t('Manual pairing code')}
                        fullWidth
                        value={this.state.manualCode}
                        onChange={e => this.setState({ manualCode: e.target.value })}
                    />
                    <TextField
                        variant="standard"
                        label={I18n.t('QR code')}
                        InputProps={{
                            readOnly: true,
                        }}
                        fullWidth
                        value={this.state.qrCode}
                    />
                    {this.state.camera ? <br /> : null}
                    {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                    <video
                        ref={this.refQrScanner}
                        style={{
                            ...styles.qrScanner,
                            display: this.state.hideVideo ? 'none' : 'block',
                        }}
                    />
                    {this.state.cameras.length ? <br /> : null}
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
                                <MenuItem key={i} value={camera.id}>
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
                            const device = this.state.showQrCodeDialog;
                            this.setState({ showQrCodeDialog: null }, () => this.destroyQrCode());

                            const result = await this.props.socket.sendTo(
                                `matter.${this.props.instance}`,
                                'controllerCommissionDevice',
                                {
                                    device,
                                    qrCode: this.state.qrCode,
                                    manualCode: this.state.manualCode,
                                },
                            );

                            if (result.error || !result.result) {
                                window.alert(`Cannot connect: ${result.error || 'Unknown error'}`);
                            } else {
                                window.alert(I18n.t('Connected'));
                                const deviceId = device.deviceIdentifier;
                                const discovered = this.state.discovered.filter(
                                    commDevice => commDevice.deviceIdentifier !== deviceId,
                                );

                                this.setState({ discovered }, () => {
                                    this.refDeviceManager.current.loadData();
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
                        onClick={() => this.setState({ showQrCodeDialog: null }, () => this.destroyQrCode())}
                        startIcon={<Close />}
                    >
                        {I18n.t('Close')}
                    </Button>
                </DialogActions>
            </Dialog>
        );
    }

    renderShowDiscoveredDevices() {
        if (!this.state.discoveryRunning && !this.state.discoveryDone) {
            return null;
        }
        return (
            <Dialog open={!0} onClose={() => this.setState({ discoveryDone: false })}>
                <DialogTitle>{I18n.t('Discovered devices')}</DialogTitle>
                <DialogContent>
                    {this.state.discoveryRunning ? <LinearProgress /> : null}
                    <Table style={{ width: '100%' }}>
                        <TableHead>
                            <TableCell>{I18n.t('Name')}</TableCell>
                            <TableCell>{I18n.t('Identifier')}</TableCell>
                            <TableCell />
                        </TableHead>
                        <TableBody>
                            {this.state.discovered.map(device => (
                                <TableRow>
                                    <TableCell>{device.DN}</TableCell>
                                    <TableCell>{device.deviceIdentifier}</TableCell>
                                    <TableCell>
                                        <Tooltip title={I18n.t('Connect')}>
                                            <IconButton
                                                onClick={() => {
                                                    this.setState({
                                                        showQrCodeDialog: device,
                                                        manualCode: '',
                                                        qrCode: '',
                                                    });
                                                    setTimeout(async () => {
                                                        try {
                                                            await this.initQrCode();
                                                        } catch (e) {
                                                            console.warn(`Cannot provide QR Code scanning: ${e}`);
                                                        }
                                                    }, 500);
                                                }}
                                            >
                                                <LeakAdd />
                                            </IconButton>
                                        </Tooltip>
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
                            console.log('Stop discovery');
                            await this.props.socket.sendTo(
                                `matter.${this.props.instance}`,
                                'controllerDiscoveryStop',
                                {},
                            );
                            this.setState({ discoveryDone: false });
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

    renderState(stateId: string) {
        let icon: React.JSX.Element;
        if (this.state.nodes[stateId].common.write === false && this.state.nodes[stateId].common.read !== false) {
            icon = <ReadOnlyStateIcon />;
        } else if (
            this.state.nodes[stateId].common.write !== false &&
            this.state.nodes[stateId].common.read === false
        ) {
            icon = <WriteOnlyStateIcon />;
        } else {
            icon = <ReadWriteStateIcon />;
        }

        let state: string;
        if (this.state.states[stateId]) {
            if (this.state.states[stateId].val === null || this.state.states[stateId].val === undefined) {
                state = '--';
            } else {
                state = this.state.states[stateId].val?.toString() || '--';
            }
        } else {
            state = '--';
        }

        return (
            <TableRow key={stateId}>
                <TableCell></TableCell>
                <TableCell style={styles.state}>
                    {icon}
                    {stateId.split('.').pop()}
                </TableCell>
                <TableCell>{state}</TableCell>
            </TableRow>
        );
    }

    renderCluster(clusterId: string) {
        const _clusterId = `${clusterId}.`;
        const states = Object.keys(this.state.nodes).filter(
            id => id.startsWith(_clusterId) && this.state.nodes[id].type === 'state',
        );
        return [
            <TableRow key={clusterId}>
                <TableCell></TableCell>
                <TableCell style={styles.cluster}>
                    <ChannelIcon />
                    {clusterId.split('.').pop()}
                    <div style={styles.number}>{states.length}</div>
                </TableCell>
                <TableCell></TableCell>
            </TableRow>,
            states.map(id => this.renderState(id)),
        ];
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

    renderDevice(deviceId: string, inBridge?: boolean) {
        const _deviceId = `${deviceId}.`;
        // get channels
        const channels = Object.keys(this.state.nodes).filter(
            id => id.startsWith(_deviceId) && this.state.nodes[id].type === 'channel',
        );
        let connected: boolean | null = null;
        let status: string | null = null;
        if (!inBridge) {
            connected = this.state.states[`${_deviceId}info.connection`]
                ? !!this.state.states[`${_deviceId}info.connection`].val
                : null;
            const statusVal = this.state.states[`${_deviceId}info.status`]?.val;
            if (statusVal !== null && statusVal !== undefined && statusVal !== '') {
                status = statusVal.toString();
                const statusObj = this.state.nodes[`${_deviceId}info.status`];
                if (statusObj?.common?.states[status]) {
                    status = I18n.t(`status_${statusObj.common.states[status]}`).replace(/^status_/, '');
                }
            }
        }

        return [
            <TableRow key={deviceId}>
                <TableCell style={{ width: 0, padding: inBridge ? '0 0 0 40px' : 0, height: 32 }}>
                    <IconButton
                        size="small"
                        style={styles.bridgeButtonsAndTitleColor}
                        onClick={() => {
                            const openedNodes = [...this.state.openedNodes];
                            const index = openedNodes.indexOf(deviceId);
                            if (index === -1) {
                                openedNodes.push(deviceId);
                                openedNodes.sort();
                            } else {
                                openedNodes.splice(index, 1);
                            }
                            window.localStorage.setItem('openedNodes', JSON.stringify(openedNodes));
                            this.setState({ openedNodes });
                        }}
                    >
                        {this.state.openedNodes.includes(deviceId) ? <KeyboardArrowUp /> : <KeyboardArrowDown />}
                    </IconButton>
                </TableCell>
                <TableCell style={styles.device}>
                    <div>
                        <DeviceIcon />
                    </div>
                    <div>
                        <div style={styles.deviceName}>{getText(this.state.nodes[deviceId].common.name)}</div>
                        <div style={styles.nodeId}>{deviceId.split('.').pop()}</div>
                    </div>
                    <div style={styles.number}>{channels.length}</div>
                </TableCell>
                <TableCell>
                    {connected !== null ? (
                        <div style={{ display: 'flex', gap: 6, alignItems: '' }}>
                            {connected ? <Wifi style={{ color: 'green' }} /> : <WifiOff style={{ color: 'red' }} />}
                            <div>{status || ''}</div>
                        </div>
                    ) : null}
                </TableCell>
            </TableRow>,
            this.state.openedNodes.includes(deviceId) ? channels.map(id => this.renderCluster(id)) : null,
        ];
    }

    renderBridge(bridgeId: string) {
        // find all devices in this bridge
        const _bridgeId = `${bridgeId}.`;
        const deviceIds = Object.keys(this.state.nodes).filter(
            id => id.startsWith(_bridgeId) && this.state.nodes[id].type === 'device',
        );

        // get status
        const connected = this.state.states[`${_bridgeId}info.connection`]?.val;
        let status = this.state.states[`${_bridgeId}info.status`]?.val;
        if (status !== null && status !== undefined && status !== '') {
            status = status.toString();
            const statusObj = this.state.nodes[`${_bridgeId}info.status`];
            if (statusObj?.common?.states[status]) {
                status = I18n.t(`status_${statusObj.common.states[status]}`).replace(/^status_/, '');
            }
        }

        return [
            <TableRow key={bridgeId}>
                <TableCell style={{ width: 0, padding: 0, height: 32 }}>
                    <IconButton
                        size="small"
                        style={styles.bridgeButtonsAndTitleColor}
                        onClick={() => {
                            const openedNodes = [...this.state.openedNodes];
                            const index = openedNodes.indexOf(bridgeId);
                            if (index === -1) {
                                openedNodes.push(bridgeId);
                                openedNodes.sort();
                            } else {
                                openedNodes.splice(index, 1);
                            }
                            window.localStorage.setItem('openedNodes', JSON.stringify(openedNodes));
                            this.setState({ openedNodes });
                        }}
                    >
                        {this.state.openedNodes.includes(bridgeId) ? <KeyboardArrowUp /> : <KeyboardArrowDown />}
                    </IconButton>
                </TableCell>
                <TableCell style={styles.device}>
                    <div>{this.state.openedNodes.includes(bridgeId) ? <IconOpen /> : <IconClosed />}</div>
                    <div>
                        <div style={styles.deviceName}>{getText(this.state.nodes[bridgeId].common.name)}</div>
                        <div style={styles.nodeId}>{bridgeId.split('.').pop()}</div>
                    </div>
                    <div style={styles.number}>{deviceIds.length}</div>
                </TableCell>
                <TableCell>
                    <div style={{ display: 'flex', gap: 6, alignItems: '' }}>
                        {connected ? <Wifi style={{ color: 'green' }} /> : <WifiOff style={{ color: 'red' }} />}
                        <div>{status || ''}</div>
                    </div>
                </TableCell>
            </TableRow>,
            this.state.openedNodes.includes(bridgeId) ? deviceIds.map(id => this.renderDevice(id, true)) : null,
        ];
    }

    renderDeviceOrBridge(deviceOrBridgeId: string) {
        if (this.state.nodes[deviceOrBridgeId].type === 'device') {
            return this.renderDevice(deviceOrBridgeId);
        }
        return this.renderBridge(deviceOrBridgeId);
    }

    // eslint-disable-next-line react/no-unused-class-component-methods
    renderDevicesAndBridges() {
        // matter.0.controller.2808191892917842060
        const deviceOrBridgeIds = Object.keys(this.state.nodes).filter(id => id.split('.').length === 4);
        return deviceOrBridgeIds.map(id => this.renderDeviceOrBridge(id));
    }

    renderDeviceManager() {
        if (!this.state.nodes) {
            return null;
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

    render() {
        if (!this.props.alive && (this.state.discoveryRunning || this.state.discoveryDone)) {
            setTimeout(() => this.setState({ discoveryRunning: false, discoveryDone: false }), 100);
        }

        return (
            <div style={styles.panel}>
                <Box sx={styles.infoBox}>
                    <Info />
                    <Typography>{I18n.t('Matter Controller Infotext')}</Typography>
                </Box>
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
                            sx={{ marginRight: 1 }}
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
                            variant="contained"
                            color="primary"
                            onClick={() => this.setState({ bleDialogOpen: true })}
                            startIcon={this.props.matter.controller.ble ? <Bluetooth /> : <BluetoothDisabled />}
                        >
                            {I18n.t('Commissioning information')}
                        </Button>
                    ) : null}
                </div>
                {this.props.matter.controller.enabled ? this.renderDeviceManager() : null}
                {/* this.props.matter.controller.enabled ? <Table style={{ maxWidth: 600 }} size="small">
            <TableHead>
                <TableRow>
                    <TableCell style={{ width: 0, padding: 0 }} />
                    <TableCell>{I18n.t('Name')}</TableCell>
                    <TableCell>{I18n.t('Value')}</TableCell>
                </TableRow>
            </TableHead>
            <TableBody>
                {this.renderDevicesAndBridges()}
            </TableBody>
        </Table> : null */}
            </div>
        );
    }
}

export default Controller;
