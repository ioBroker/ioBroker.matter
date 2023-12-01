import React from 'react';
import PropTypes from 'prop-types';
import { withStyles } from '@mui/styles';
import QrScanner from 'qr-scanner';

import {
    Button, CircularProgress, Dialog,
    DialogActions, DialogContent, DialogTitle, IconButton,
    Switch, Table, TableBody,
    TableCell, TableHead, TableRow, TextField,
    LinearProgress, Select, MenuItem, FormControlLabel, Checkbox,
} from '@mui/material';
import {
    Add, Close, KeyboardArrowDown, KeyboardArrowUp,
    LeakAdd, Search,
    SettingsInputHdmi as ChannelIcon,
    TabletAndroid as DeviceIcon,
    CompareArrows as ReadWriteStateIcon,
    ArrowRightAlt as WriteOnlyStateIcon,
    KeyboardBackspace as ReadOnlyStateIcon,
    SearchOff,
    Wifi, WifiOff,
} from '@mui/icons-material';

import { I18n, IconClosed, IconOpen } from '@iobroker/adapter-react-v5';

const styles = () => ({
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
});

class Controller extends React.Component {
    constructor(props) {
        super(props);
        let openedNodes = window.localStorage.getItem('openedNodes');
        if (openedNodes) {
            try {
                openedNodes = JSON.parse(openedNodes);
            } catch (e) {
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
        };

        this.refQrScanner = React.createRef();
        this.qrScanner = null;
    }

    async readStructure() {
        let nodes;
        try {
            nodes = await this.props.socket.getObjectViewSystem(
                'channel',
                `matter.${this.props.instance}.controller.`,
                `matter.${this.props.instance}.controller.\u9999`,
            );
        } catch (e) {
            nodes = {};
        }
        try {
            const _states = await this.props.socket.getObjectViewSystem(
                'state',
                `matter.${this.props.instance}.controller.`,
                `matter.${this.props.instance}.controller.\u9999`,
            );
            Object.keys(_states).forEach(id => nodes[id] = _states[id]);
        } catch (e) {
            // ignore
        }
        try {
            const devices = await this.props.socket.getObjectViewSystem(
                'device',
                `matter.${this.props.instance}.controller.`,
                `matter.${this.props.instance}.controller.\u9999`,
            );
            Object.keys(devices).forEach(id => nodes[id] = devices[id]);
        } catch (e) {
            // ignore
        }
        try {
            const bridges = await this.props.socket.getObjectViewSystem(
                'folder',
                `matter.${this.props.instance}.controller.`,
                `matter.${this.props.instance}.controller.\u9999`,
            );
            Object.keys(bridges).forEach(id => nodes[id] = bridges[id]);
        } catch (e) {
            // ignore
        }

        const states = await this.props.socket.getStates(`matter.${this.props.instance}.controller.*`);

        this.setState({ nodes, states });
    }

    async componentDidMount() {
        this.props.registerMessageHandler(this.onMessage);
        this.readStructure()
            .catch(e => window.alert(`Cannot read structure: ${e}`))
            .then(() => this.props.socket.subscribeObject(`matter.${this.props.instance}.controller.*`, this.onObjectChange)
                .catch(e => window.alert(`Cannot subscribe: ${e}`)))
            .then(() => this.props.socket.subscribeState(`matter.${this.props.instance}.controller.*`, this.onStateChange)
                .catch(e => {
                    window.alert(`Cannot subscribe 1: ${e}`);
                }));
    }

    onObjectChange = (id, obj) => {
        if (!this.state.nodes) {
            return;
        }
        const nodes = JSON.parse(JSON.stringify(this.state.nodes));
        if (obj) {
            nodes[id] = obj;
        } else {
            delete nodes[id];
        }
        this.setState({ nodes });
    };

    onStateChange = (id, state) => {
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
        const states = JSON.parse(JSON.stringify(this.state.states));
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
        await this.props.socket.unsubscribeState(`matter.${this.props.instance}.controller.*`, this.onStateChange);
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

            const cameras = await QrScanner.listCameras(true);

            const camera = window.localStorage.getItem('camera') || (cameras.length ? cameras[0].id : '');

            await this.qrScanner.setCamera(camera);

            this.setState({ cameras, camera, hideVideo: !cameras.length });
        }

        if (this.qrScanner && this.qrScanner !== true) {
            await this.qrScanner.start();
        }
    }

    onMessage = message => {
        if (message?.command === 'discoveredDevice') {
            const discovered = JSON.parse(JSON.stringify(this.state.discovered));
            discovered.push(message.device);
            this.setState({ discovered });
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

    renderQrCodeDialog() {
        if (!this.state.showQrCodeDialog) {
            return null;
        }
        return <Dialog
            open={!0}
            onClose={() => this.setState({ showQrCodeDialog: false }, () => this.destroyQrCode())}
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
                <video ref={this.refQrScanner} className={this.props.classes.qrScanner} style={{ display: this.state.hideVideo ? 'none' : 'block' }} />
                {this.state.cameras.length ? <br /> : null}
                {this.state.camera.length ? <Select
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
                    {this.state.cameras.map((camera, i) => <MenuItem key={i} value={camera.id}>{camera.label}</MenuItem>)}
                </Select> : null}
            </DialogContent>
            <DialogActions>
                <Button
                    variant="contained"
                    disabled={!this.state.qrCode && !this.state.manualCode}
                    color="primary"
                    onClick={() => {
                        const device = this.state.showQrCodeDialog;
                        this.setState({ showQrCodeDialog: false }, () => this.destroyQrCode());
                        this.props.socket.sendTo(`matter.${this.props.instance}`, 'controllerAddDevice', { device, qrCode: this.state.qrCode, manualCode: this.state.manualCode })
                            .then(result => {
                                if (result.error || !result.result) {
                                    window.alert(`Cannot connect: ${result.error || 'Unknown error'}`);
                                } else {
                                    window.alert('Connected');
                                }
                            });
                    }}
                    startIcon={<Add />}
                >
                    {I18n.t('Add')}
                </Button>
                <Button
                    variant="contained"
                    color="grey"
                    onClick={() => this.setState({ showQrCodeDialog: false }, () => this.destroyQrCode())}
                    startIcon={<Close />}
                >
                    {I18n.t('Close')}
                </Button>
            </DialogActions>
        </Dialog>;
    }

    renderShowDiscoveredDevices() {
        if (!this.state.discoveryRunning && !this.state.discoveryDone) {
            return null;
        }
        return <Dialog
            open={!0}
            onClose={() => this.setState({ discoveryDone: false })}
        >
            <DialogTitle>{I18n.t('Discovered devices')}</DialogTitle>
            <DialogContent>
                {this.state.discoveryRunning ? <LinearProgress /> : null}
                <Table style={{ width: '100%' }}>
                    <TableHead>
                        <TableCell>
                            {I18n.t('Name')}
                        </TableCell>
                        <TableCell>
                            {I18n.t('Identifier')}
                        </TableCell>
                        <TableCell />
                    </TableHead>
                    <TableBody>
                        {this.state.discovered.map(device => <TableRow>
                            <TableCell>
                                {device.DN}
                            </TableCell>
                            <TableCell>
                                {device.deviceIdentifier}
                            </TableCell>
                            <TableCell>
                                <IconButton
                                    onClick={() => {
                                        this.setState({ showQrCodeDialog: device, manualCode: '', qrCode: '' });
                                        setTimeout(async () => this.initQrCode(), 500);
                                    }}
                                >
                                    <LeakAdd />
                                </IconButton>
                            </TableCell>
                        </TableRow>)}
                    </TableBody>
                </Table>
            </DialogContent>
            <DialogActions>
                <Button
                    disabled={!this.state.discoveryRunning}
                    variant="contained"
                    onClick={() => this.props.socket.sendTo(`matter.${this.props.instance}`, 'controllerDiscoveryStop', { })
                        .then(() => this.setState({ discoveryDone: false }))}
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
        </Dialog>;
    }

    renderState(stateId) {
        let icon;
        if (this.state.nodes[stateId].common.write === false && this.state.nodes[stateId].common.read !== false) {
            icon = <ReadOnlyStateIcon />;
        } else if (this.state.nodes[stateId].common.write !== false && this.state.nodes[stateId].common.read === false) {
            icon = <WriteOnlyStateIcon />;
        } else {
            icon = <ReadWriteStateIcon />;
        }

        return <TableRow key={stateId}>
            <TableCell></TableCell>
            <TableCell className={this.props.classes.state}>
                {icon}
                {stateId.split('.').pop()}
            </TableCell>
            <TableCell>{this.state.states[stateId] && this.state.states[stateId].val !== null && this.state.states[stateId].val !== undefined ? this.state.states[stateId].val.toString() : '--'}</TableCell>
        </TableRow>;
    }

    renderCluster(clusterId) {
        const _clusterId = `${clusterId}.`;
        const states = Object.keys(this.state.nodes).filter(id => id.startsWith(_clusterId) && this.state.nodes[id].type === 'state');
        return [
            <TableRow key={clusterId}>
                <TableCell></TableCell>
                <TableCell className={this.props.classes.cluster}>
                    <ChannelIcon />
                    {clusterId.split('.').pop()}
                    <div className={this.props.classes.number}>{states.length}</div>
                </TableCell>
                <TableCell></TableCell>
            </TableRow>,
            states.map(id => this.renderState(id)),
        ];
    }

    renderDevice(deviceId, inBridge) {
        const _deviceId = `${deviceId}.`;
        // get channels
        const channels = Object.keys(this.state.nodes).filter(id => id.startsWith(_deviceId) && this.state.nodes[id].type === 'channel');
        let connected = null;
        let status = null;
        if (!inBridge) {
            connected = this.state.states[`${_deviceId}info.connection`]?.val;
            status = this.state.states[`${_deviceId}info.status`]?.val;
            if (status !== null && status !== undefined && status !== '') {
                status = status.toString();
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
                        className={this.props.classes.bridgeButtonsAndTitleColor}
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
                <TableCell className={this.props.classes.device}>
                    <div>
                        <DeviceIcon />
                    </div>
                    <div>
                        <div className={this.props.classes.deviceName}>{this.state.nodes[deviceId].common.name}</div>
                        <div className={this.props.classes.nodeId}>{deviceId.split('.').pop()}</div>
                    </div>
                    <div className={this.props.classes.number}>{channels.length}</div>
                </TableCell>
                <TableCell>
                    {connected !== null ? <div style={{ display: 'flex', gap: 6, alignItems: '' }}>
                        {connected ? <Wifi style={{ color: 'green' }} /> : <WifiOff style={{ color: 'red' }} />}
                        <div>{status || ''}</div>
                    </div> : null}
                </TableCell>
            </TableRow>,
            this.state.openedNodes.includes(deviceId) ? channels.map(id => this.renderCluster(id)) : null,
        ];
    }

    renderBridge(bridgeId) {
        // find all devices in this bridge
        const _bridgeId = `${bridgeId}.`;
        const deviceIds = Object.keys(this.state.nodes).filter(id => id.startsWith(_bridgeId) && this.state.nodes[id].type === 'device');

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
                        className={this.props.classes.bridgeButtonsAndTitleColor}
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
                <TableCell className={this.props.classes.device}>
                    <div>
                        {this.state.openedNodes.includes(bridgeId) ? <IconOpen /> : <IconClosed />}
                    </div>
                    <div>
                        <div className={this.props.classes.deviceName}>{this.state.nodes[bridgeId].common.name}</div>
                        <div className={this.props.classes.nodeId}>{bridgeId.split('.').pop()}</div>
                    </div>
                    <div className={this.props.classes.number}>{deviceIds.length}</div>
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

    renderDeviceOrBridge(deviceOrBridgeId) {
        if (this.state.nodes[deviceOrBridgeId].type === 'device') {
            return this.renderDevice(deviceOrBridgeId);
        }
        return this.renderBridge(deviceOrBridgeId);
    }

    renderDevicesAndBridges() {
        // matter.0.controller.2808191892917842060
        const deviceOrBridgeIds = Object.keys(this.state.nodes).filter(id => id.split('.').length === 4);
        return deviceOrBridgeIds.map(id => this.renderDeviceOrBridge(id));
    }

    render() {
        if (!this.props.alive && (this.state.discoveryRunning || this.state.discoveryDone)) {
            setTimeout(() => this.setState({ discoveryRunning: false, discoveryDone: false }), 100);
        }

        return <div className={this.props.classes.panel}>
            {this.renderShowDiscoveredDevices()}
            {this.renderQrCodeDialog()}
            <div>
                {I18n.t('Off')}
                <Switch
                    disabled={this.state.discoveryRunning}
                    checked={this.props.matter.controller.enabled}
                    onChange={e => {
                        const matter = JSON.parse(JSON.stringify(this.props.matter));
                        matter.controller.enabled = e.target.checked;
                        this.props.updateConfig(matter);
                    }}
                />
                {I18n.t('On')}
            </div>
            {this.props.matter.controller.enabled ? <div>
                <FormControlLabel
                    control={<Checkbox
                        checked={!!this.props.matter.controller.ble}
                        onChange={e => {
                            const matter = JSON.parse(JSON.stringify(this.props.matter));
                            matter.controller.ble = e.target.checked;
                            this.props.updateConfig(matter);
                        }}
                    />}
                    label={I18n.t('Bluetooth')}
                />
            </div> : null}
            {this.props.matter.controller.enabled && this.props.matter.controller.ble ? <div>
                <TextField
                    fullWidth
                    style={{ maxWidth: 600 }}
                    type="number"
                    label={I18n.t('Bluetooth HCI ID')}
                    value={this.props.matter.controller.hciId || ''}
                    onChange={e => {
                        const matter = JSON.parse(JSON.stringify(this.props.matter));
                        matter.controller.hciId = e.target.value;
                        this.props.updateConfig(matter);
                    }}
                />
            </div> : null}
            {this.props.matter.controller.enabled && this.props.matter.controller.ble ? <div>
                <TextField
                    fullWidth
                    style={{ maxWidth: 600 }}
                    label={I18n.t('WiFI SSID')}
                    error={!this.props.matter.controller.wifiSSID}
                    helperText={this.props.matter.controller.wifiSSID ? '' : I18n.t('Required')}
                    value={this.props.matter.controller.wifiSSID || ''}
                    onChange={e => {
                        const matter = JSON.parse(JSON.stringify(this.props.matter));
                        matter.controller.wifiSSID = e.target.value;
                        this.props.updateConfig(matter);
                    }}
                />
            </div> : null}
            {this.props.matter.controller.enabled && this.props.matter.controller.ble ? <div>
                <TextField
                    fullWidth
                    style={{ maxWidth: 600 }}
                    label={I18n.t('WiFI password')}
                    error={!this.props.matter.controller.wifiPasword}
                    helperText={this.props.matter.controller.wifiPasword ? '' : I18n.t('Required')}
                    value={this.props.matter.controller.wifiPasword || ''}
                    onChange={e => {
                        const matter = JSON.parse(JSON.stringify(this.props.matter));
                        matter.controller.wifiPasword = e.target.value;
                        this.props.updateConfig(matter);
                    }}
                />
            </div> : null}
            {this.props.matter.controller.enabled && this.props.matter.controller.ble ? <div>
                <TextField
                    fullWidth
                    style={{ maxWidth: 600 }}
                    label={I18n.t('Thread network name')}
                    value={this.props.matter.controller.threadNetworkname || ''}
                    onChange={e => {
                        const matter = JSON.parse(JSON.stringify(this.props.matter));
                        matter.controller.threadNetworkname = e.target.value;
                        this.props.updateConfig(matter);
                    }}
                />
            </div> : null}
            {this.props.matter.controller.enabled && this.props.matter.controller.ble ? <div>
                <TextField
                    fullWidth
                    style={{ maxWidth: 600 }}
                    label={I18n.t('Thread operational dataset')}
                    value={this.props.matter.controller.threadOperationalDataSet || ''}
                    onChange={e => {
                        const matter = JSON.parse(JSON.stringify(this.props.matter));
                        matter.controller.threadOperationalDataSet = e.target.value;
                        this.props.updateConfig(matter);
                    }}
                />
            </div> : null}
            {this.props.matter.controller.enabled && this.props.alive ? <div>
                <Button
                    variant="contained"
                    disabled={this.state.discoveryRunning}
                    startIcon={this.state.discoveryRunning ? <CircularProgress size={20} /> : <Search />}
                    onClick={() => {
                        this.setState({ discovered: [] }, () =>
                            this.props.socket.sendTo(`matter.${this.props.instance}`, 'controllerDiscovery', { })
                                .then(result => {
                                    if (result.error) {
                                        window.alert(`Cannot discover: ${result.error}`);
                                    } else {
                                        this.setState({ discovered: result.result, discoveryDone: true });
                                    }
                                }));
                    }}
                >
                    {I18n.t('Discovery devices')}
                </Button>
            </div> : null}
            <Table style={{ maxWidth: 600 }} size="small">
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
            </Table>
        </div>;
    }
}

Controller.propTypes = {
    instance: PropTypes.number,
    matter: PropTypes.object,
    updateConfig: PropTypes.func,
    alive: PropTypes.bool,
    registerMessageHandler: PropTypes.func,
};

export default withStyles(styles)(Controller);
