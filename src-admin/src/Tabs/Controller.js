import React from 'react';
import PropTypes from 'prop-types';
import { withStyles } from '@mui/styles';
import QrScanner from 'qr-scanner';

import {
    Button, CircularProgress, Dialog,
    DialogActions, DialogContent, DialogTitle, IconButton,
    Switch, Table, TableBody,
    TableCell, TableHead, TableRow, TextField,
    LinearProgress, Select, MenuItem,
} from '@mui/material';
import {
    Add, Close, KeyboardArrowDown, KeyboardArrowUp,
    LeakAdd, Search,
    SettingsInputHdmi as ChannelIcon,
    TabletAndroid as DeviceIcon,
    CompareArrows as ReadWriteStateIcon,
    ArrowRightAlt as WriteOnlyStateIcon,
    KeyboardBackspace as ReadOnlyStateIcon,
} from '@mui/icons-material';

import { I18n } from '@iobroker/adapter-react-v5';

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
            Object.keys(_states).forEach(id => {
                nodes[id] = _states[id];
            });
        } catch (e) {
            // ignore
        }
        try {
            const devices = await this.props.socket.getObjectViewSystem(
                'device',
                `matter.${this.props.instance}.controller.`,
                `matter.${this.props.instance}.controller.\u9999`,
            );
            Object.keys(devices).forEach(id => {
                nodes[id] = devices[id];
            });
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
                .catch(e => window.alert(`Cannot subscribe: ${e}`)));
    }

    onObjectChange = (id, obj) => {
        const nodes = JSON.parse(JSON.stringify(this.state.nodes));
        if (obj) {
            nodes[id] = obj;
        } else {
            delete nodes[id];
        }
        this.setState({ nodes });
    };

    onStateChange(id, state) {
        const states = JSON.parse(JSON.stringify(this.state.states));
        if (state) {
            states[id] = state;
        } else {
            delete states[id];
        }
        this.setState({ states });
    }

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
                        <TableRow>
                            <TableCell>
                                {I18n.t('Name')}
                            </TableCell>
                            <TableCell>
                                {I18n.t('Identifier')}
                            </TableCell>
                            <TableCell />
                        </TableRow>
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
            <TableCell>{this.state.states[stateId]?.val || '--'}</TableCell>
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

    renderNode(deviceId) {
        const _deviceId = `${deviceId}.`;
        // get channels
        const channels = Object.keys(this.state.nodes).filter(id => id.startsWith(_deviceId) && this.state.nodes[id].type === 'channel');
        return [
            <TableRow key={deviceId}>
                <TableCell style={{ width: 0, padding: 0, height: 32 }}>
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
                <TableCell></TableCell>
            </TableRow>,
            this.state.openedNodes.includes(deviceId) ? channels.map(id => this.renderCluster(id)) : null,
        ];
    }

    renderNodes() {
        const deviceIds = Object.keys(this.state.nodes).filter(id => this.state.nodes[id].type === 'device');
        return deviceIds.map(id => this.renderNode(id));
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
            {this.props.matter.controller.enabled && this.props.alive ? <div>
                <Button
                    variant="contained"
                    disabled={this.state.discoveryRunning}
                    startIcon={this.state.discoveryRunning ? <CircularProgress size={20} /> : <Search />}
                    onClick={() => {
                        this.setState({ discoveryRunning: true, discovered: [] }, () =>
                            this.props.socket.sendTo(`matter.${this.props.instance}`, 'controllerDiscovery', { })
                                .then(result => {
                                    if (result.error) {
                                        this.setState({ discoveryRunning: false });
                                        window.alert(`Cannot discover: ${result.error}`);
                                    } else {
                                        this.setState({ discovered: result.result, discoveryDone: true, discoveryRunning: false });
                                    }
                                }));
                    }}
                >
                    {I18n.t('Discovery devices')}
                </Button>
            </div> : null}
            <Table style={{ maxWidth: 600 }} size="small">
                <TableHead>
                    <TableCell style={{ width: 0, padding: 0 }} />
                    <TableCell>{I18n.t('Name')}</TableCell>
                    <TableCell>{I18n.t('Value')}</TableCell>
                </TableHead>
                <TableBody>
                    {this.renderNodes()}
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
