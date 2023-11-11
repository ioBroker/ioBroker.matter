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
    Add, Close,
    LeakAdd, Search,
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
});

class Controller extends React.Component {
    constructor(props) {
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
        };

        this.refQrScanner = React.createRef();
        this.qrScanner = null;
    }

    componentDidMount() {
        this.props.registerMessageHandler(this.onMessage);
    }

    componentWillUnmount() {
        this.props.registerMessageHandler(null);
        this.destroyQrCode();
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

    render() {
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
        </div>;
    }
}

Controller.propTypes = {
    matter: PropTypes.object,
    updateConfig: PropTypes.func,
    alive: PropTypes.bool,
    registerMessageHandler: PropTypes.func,
};

export default withStyles(styles)(Controller);
