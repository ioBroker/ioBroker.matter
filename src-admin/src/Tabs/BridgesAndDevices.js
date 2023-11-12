import React from 'react';
import QRCode from 'react-qr-code';

import {
    SiAmazonalexa, SiApple, SiGoogleassistant, SiSmartthings,
} from 'react-icons/si';
import {
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    IconButton,
    InputAdornment, Table, TableBody, TableCell, TableRow,
    TextField, Tooltip
} from '@mui/material';
import { I18n, Utils } from '@iobroker/adapter-react-v5';
import {
    Close,
    ContentCopy,
    Delete,
    QrCode,
    QuestionMark,
    SignalWifiStatusbarNull,
    Wifi,
    WifiOff
} from '@mui/icons-material';

export const STYLES = {
    vendorIcon: {
        width: 24,
        height: 24,
    },
    tooltip: {
        pointerEvents: 'none',
    },
};

class BridgesAndDevices extends React.Component {
    constructor(props) {
        super(props);

        this.state = {
            showQrCode: null,
            suppressDelete: false,
            deleteDialog: false,
            showResetDialog: null,
            showDebugData: null,
        };
    }
    componentDidMount() {
        if (this.props.alive) {
            this.props.socket.sendTo(`matter.${this.props.instance}`, 'nodeStates', { bridges: true, devices: true })
                .then(result => result.states && this.props.updateNodeStates(result.states));
        }
    }

    static getVendorIcon(vendor, classes, themeType) {
        if (vendor === 'Amazon Lab126') {
            return <SiAmazonalexa className={classes.vendorIcon} title={vendor} style={{ color: themeType ? '#001ca8' : '#0000dc' }} />;
        }
        if (vendor === 'Google LLC') {
            return <SiGoogleassistant className={classes.vendorIcon} title={vendor} style={{ color: themeType ? '#ea9b33' : '#8f6020' }} />;
        }
        if (vendor === 'Apple Inc.') {
            return <SiApple className={classes.vendorIcon} title={vendor} style={{ color: themeType ? '#c9c9c9' : '#4f4f4f' }} />;
        }
        if (vendor === 'Samsung') {
            return <SiSmartthings className={classes.vendorIcon} title={vendor} style={{ color: themeType ? '#33ea8f' : '#209b60' }} />;
        }
        return null;
    }

    static getStatusColor(status, themeType) {
        if (status === 'creating') {
            return themeType === 'dark' ? '#a4a4a4' : '#1c1c1c';
        }
        if (status === 'waitingForCommissioning') {
            return themeType === 'dark' ? '#2865ea' : '#00288d';
        }
        if (status === 'commissioned') {
            return themeType === 'dark' ? '#fcb35f' : '#b24a00';
        }
        if (status === 'connected') {
            return themeType === 'dark' ? '#5ffc5f' : '#368836';
        }
        return 'grey';
    }

    static getStatusIcon(status, themeType) {
        const color = BridgesAndDevices.getStatusColor(status, themeType);
        if (status === 'creating') {
            return <SignalWifiStatusbarNull style={{ color }} />;
        }
        if (status === 'waitingForCommissioning') {
            return <QrCode style={{ color }} />;
        }
        if (status === 'commissioned') {
            return <WifiOff style={{ color }} />;
        }
        if (status === 'connected') {
            return <Wifi style={{ color }} />;
        }
        return <QuestionMark style={{ color }} />;
    }

    renderStatus(device) {
        if (!this.props.nodeStates[device.uuid]) {
            return null;
        }
        if (this.props.nodeStates[device.uuid].status === 'waitingForCommissioning') {
            return <Tooltip title={I18n.t('Device is not commissioned. Show QR Code for commissioning')} classes={{ popper: this.props.classes.tooltip }}>
                <IconButton
                    style={{ height: 40 }}
                    onClick={() => this.setState({ showQrCode: device })}
                >
                    <QrCode />
                </IconButton>
            </Tooltip>;
        }
        if (this.props.nodeStates[device.uuid].status) {
            return <Tooltip title={I18n.t('Device is already commissioning. Show status information')} classes={{ popper: this.props.classes.tooltip }}>
                <IconButton
                    style={{ height: 40 }}
                    onClick={e => {
                        e.stopPropagation();
                        this.setState({ showDebugData: device });
                    }}
                >
                    {BridgesAndDevices.getStatusIcon(this.props.nodeStates[device.uuid].status, this.props.themeType)}
                </IconButton>
            </Tooltip>;
        }
        return null;
    }

    renderDebugDialog() {
        if (!this.state.showDebugData) {
            return null;
        }

        // Information about the commissioning process
        // {
        //     uuid: 'UUID',
        //     command: 'status',
        //     status: 'connecting', // creating, waitingForCommissioning, connecting, connected,
        //     connectionInfo: [
        //         {
        //             vendor: 'NAME' or '0x1123',
        //             connected: false/true,
        //             label: 'User controller name',
        //         }
        //     ],
        // }
        const data = this.props.nodeStates[this.state.showDebugData.uuid];

        return <Dialog
            onClose={() => this.setState({ showDebugData: null })}
            open={!0}
            maxWidth="md"
        >
            <DialogTitle>{I18n.t('Commissioning information')}</DialogTitle>
            <DialogContent>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                    <Table>
                        <TableBody>
                            <TableRow>
                                <TableCell>{I18n.t('Status')}</TableCell>
                                <TableCell>
                                    {BridgesAndDevices.getStatusIcon(data.status, this.props.themeType)}
                                    <span style={{ marginLeft: 10 }}>{I18n.t(`status_${data.status}`)}</span>
                                </TableCell>
                            </TableRow>
                            {data.connectionInfo.map((info, i) => <TableRow key={i}>
                                <TableCell>
                                    {BridgesAndDevices.getVendorIcon(info.vendor, this.props.classes, this.props.themeType) || info.vendor}
                                    {info.label ? <span style={{ opacity: 0.7, marginLeft: 8, fontStyle: 'italic' }}>
                                        (
                                        {info.label}
                                        )
                                    </span> : null}
                                </TableCell>
                                <TableCell>
                                    {info.connected ?
                                        <span style={{ color: this.props.themeType === 'dark' ? '#5ffc5f' : '#368836' }}>{I18n.t('Connected')}</span> : I18n.t('Not connected')}
                                </TableCell>
                            </TableRow>)}
                        </TableBody>
                    </Table>
                </div>
            </DialogContent>
            <DialogActions>
                <Button
                    onClick={() => this.setState({ showDebugData: null })}
                    startIcon={<Close />}
                    color="grey"
                    variant="contained"
                >
                    {I18n.t('Close')}
                </Button>
            </DialogActions>
        </Dialog>;
    }

    renderQrCodeDialog() {
        const nodeState = this.state.showQrCode?.uuid && this.props.nodeStates[this.state.showQrCode.uuid];
        if (nodeState && !nodeState.qrPairingCode) {
            // it seems the device was commissioned, so switch to debug view
            setTimeout(() => this.setState({ showDebugData: this.state.showQrCode, showQrCode: null }), 1000);
        }
        if (!this.state.showQrCode || !nodeState) {
            return null;
        }
        return <Dialog
            onClose={() => this.setState({ showQrCode: null })}
            open={!0}
            maxWidth="md"
        >
            <DialogTitle>{I18n.t('QR Code to connect')}</DialogTitle>
            <DialogContent>
                <div style={{ background: 'white', padding: 16 }}>
                    {nodeState.qrPairingCode ?
                        <QRCode value={nodeState.qrPairingCode} /> : null}
                </div>
                <TextField
                    value={nodeState.manualPairingCode || ''}
                    InputProps={{
                        readOnly: true,
                        endAdornment: <InputAdornment position="end">
                            <IconButton
                                onClick={() => {
                                    Utils.copyToClipboard(nodeState.manualPairingCode);
                                    this.props.showToast(I18n.t('Copied to clipboard'));
                                }}
                                edge="end"
                            >
                                <ContentCopy />
                            </IconButton>
                        </InputAdornment>,
                    }}
                    fullWidth
                    label={I18n.t('Manual pairing code')}
                    variant="standard"
                />
            </DialogContent>
            <DialogActions>
                <Button
                    onClick={() => this.setState({ showQrCode: null })}
                    startIcon={<Close />}
                    color="grey"
                    variant="contained"
                >
                    {I18n.t('Close')}
                </Button>
            </DialogActions>
        </Dialog>;
    }

    renderResetDialog() {
        if (!this.state.showResetDialog) {
            return null;
        }
        return <Dialog
            open={!0}
            onClose={() => this.setState({ showResetDialog: false })}
        >
            <DialogTitle>{I18n.t('Reset device or bridge')}</DialogTitle>
            <DialogContent>
                <p>{I18n.t('Device or bridge will lost all commissioning information and you must reconnect (with PIN or QR code) again.')}</p>
                <p>{I18n.t('Are you sure?')}</p>
                {this.state.showResetDialog.step === 1 ? <p>{I18n.t('This cannot be undone!')}</p> : null}
            </DialogContent>
            <DialogActions>
                <Button
                    onClick={() => {
                        if (this.state.showResetDialog.step === 1) {
                            const uuid = this.state.showResetDialog.device.uuid;
                            this.setState({ showResetDialog: null });
                            this.props.socket.sendTo(`matter.${this.props.instance}`, 'factoryReset', { uuid })
                                .then(result => {
                                    if (result.error) {
                                        window.alert(`Cannot reset: ${result.error}`);
                                    } else {
                                        this.props.updateNodeStates({ [uuid]: result.result });
                                    }
                                });
                        } else {
                            this.setState({ showResetDialog: { device: this.state.showResetDialog.device, step: 1 } });
                        }
                    }}
                    disabled={!this.props.alive}
                    startIcon={<Delete />}
                    color="primary"
                    style={{
                        color: this.state.showResetDialog.step === 1 ? 'white' : undefined,
                        backgroundColor: this.state.showResetDialog.step === 1 ? 'red' : undefined,
                    }}
                    variant="contained"
                >
                    {I18n.t('Reset')}
                </Button>
                <Button
                    onClick={() => this.setState({ showResetDialog: false })}
                    startIcon={<Close />}
                    color="grey"
                    variant="contained"
                >
                    {I18n.t('Cancel')}
                </Button>
            </DialogActions>
        </Dialog>;
    }
}

export default BridgesAndDevices;