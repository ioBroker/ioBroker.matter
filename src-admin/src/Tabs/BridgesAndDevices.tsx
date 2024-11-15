import React, { Component } from 'react';
import QRCode from 'react-qr-code';

import { InfoBox } from '@foxriver76/iob-component-lib';
import { type AdminConnection, I18n, type IobTheme, type ThemeType, Utils } from '@iobroker/adapter-react-v5';
import {
    Close,
    ContentCopy,
    Delete,
    QrCode,
    QuestionMark,
    Settings,
    SettingsInputAntenna,
    SignalWifiStatusbarNull,
    Wifi,
    WifiOff,
} from '@mui/icons-material';
import {
    Box,
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    IconButton,
    InputAdornment,
    Table,
    TableBody,
    TableCell,
    TableRow,
    TextField,
    Tooltip,
} from '@mui/material';
import { SiAmazonalexa, SiApple, SiGoogleassistant, SiSmartthings } from 'react-icons/si';
import VENDOR_IDS from '../utils/vendorIDs';

import type {
    BridgeDescription,
    DetectedRoom,
    DeviceDescription,
    MatterConfig,
    NodeStateResponse,
    NodeStates,
} from '../types';
import { formatPairingCode } from '../Utils';

export const STYLES: Record<string, React.CSSProperties> = {
    vendorIcon: {
        width: 24,
        height: 24,
    },
    tooltip: {
        pointerEvents: 'none',
    },
} as const;

export interface BridgesAndDevicesProps {
    alive: boolean;
    commissioning: Record<string, boolean>;
    /** Undefined if no detection ran yet */
    detectedDevices?: DetectedRoom[];
    instance: number;
    matter: MatterConfig;
    nodeStates: { [uuid: string]: NodeStateResponse };
    productIDs: string[];
    setDetectedDevices: (detectedDevices: DetectedRoom[]) => void;
    showToast: (message: string) => void;
    socket: AdminConnection;
    theme: IobTheme;
    themeType: ThemeType;
    updateConfig: (config: MatterConfig) => void;
    updateNodeStates: (states: { [uuid: string]: NodeStateResponse }) => void;
}

export interface BridgesAndDevicesState {
    showQrCode: DeviceDescription | BridgeDescription | null;
    showResetDialog: {
        bridgeOrDevice: DeviceDescription | BridgeDescription;
        step: number;
    } | null;
    showDebugData: DeviceDescription | BridgeDescription | null;
}

class BridgesAndDevices<TProps extends BridgesAndDevicesProps, TState extends BridgesAndDevicesState> extends Component<
    TProps,
    TState
> {
    constructor(props: TProps) {
        super(props);

        this.state = {
            showQrCode: null,
            showResetDialog: null,
            showDebugData: null,
        } as TState;
    }

    componentDidMount(): void {
        if (this.props.alive) {
            void this.props.socket
                .sendTo(`matter.${this.props.instance}`, 'nodeStates', {
                    bridges: true,
                    devices: true,
                })
                .then(
                    result =>
                        result.states &&
                        this.props.updateNodeStates(result.states as { [uuid: string]: NodeStateResponse }),
                );
        }
    }

    static getVendorIcon(vendorId: number, themeType: ThemeType): React.JSX.Element | null {
        const vendor = VENDOR_IDS[vendorId];

        if (vendor === 'Amazon Lab126') {
            return (
                <SiAmazonalexa
                    title={vendor}
                    style={{
                        ...STYLES.vendorIcon,
                        color: themeType === 'dark' ? '#0000dc' : '#001ca8',
                    }}
                />
            );
        }
        if (vendor === 'Google LLC') {
            return (
                <SiGoogleassistant
                    title={vendor}
                    style={{
                        ...STYLES.vendorIcon,
                        color: themeType === 'dark' ? '#ea9b33' : '#8f6020',
                    }}
                />
            );
        }
        if (vendor === 'Apple Inc.') {
            return (
                <SiApple
                    title={vendor}
                    style={{
                        ...STYLES.vendorIcon,
                        color: themeType === 'dark' ? '#c9c9c9' : '#4f4f4f',
                    }}
                />
            );
        }
        if (vendor === 'Samsung') {
            return (
                <SiSmartthings
                    title={vendor}
                    style={{
                        ...STYLES.vendorIcon,
                        color: themeType === 'dark' ? '#33ea8f' : '#209b60',
                    }}
                />
            );
        }
        return null;
    }

    static getStatusColor(status: NodeStates, themeType: ThemeType): string {
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

    static getStatusIcon(status: NodeStates, themeType: ThemeType): React.JSX.Element {
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
        if (status === 'gear') {
            return <Settings style={{ color }} />;
        }
        return <QuestionMark style={{ color }} />;
    }

    renderStatus(deviceOrBridge: DeviceDescription | BridgeDescription): React.ReactNode {
        if (!this.props.nodeStates[deviceOrBridge.uuid] || !deviceOrBridge.enabled) {
            return null;
        }

        if (this.props.nodeStates[deviceOrBridge.uuid].status === 'waitingForCommissioning') {
            return (
                <Tooltip
                    title={I18n.t('Device is not commissioned. Show QR Code for commissioning')}
                    slotProps={{ popper: { sx: { pointerEvents: 'none' } } }}
                >
                    <IconButton
                        style={{ height: 40 }}
                        onClick={() => this.setState({ showQrCode: deviceOrBridge })}
                    >
                        <QrCode />
                    </IconButton>
                </Tooltip>
            );
        }
        if (this.props.nodeStates[deviceOrBridge.uuid].status) {
            return (
                <Tooltip
                    title={I18n.t('Device is already commissioning. Show status information')}
                    slotProps={{ popper: { sx: { pointerEvents: 'none' } } }}
                >
                    <IconButton
                        style={{ height: 40 }}
                        onClick={e => {
                            e.stopPropagation();
                            this.setState({ showDebugData: deviceOrBridge });
                        }}
                    >
                        {BridgesAndDevices.getStatusIcon(
                            this.props.nodeStates[deviceOrBridge.uuid].status,
                            this.props.themeType,
                        )}
                    </IconButton>
                </Tooltip>
            );
        }
        return null;
    }

    renderDebugDialog(): React.JSX.Element | null {
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

        return (
            <Dialog
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
                                {data.connectionInfo?.map((info, i) => (
                                    <TableRow key={i}>
                                        <TableCell>
                                            {BridgesAndDevices.getVendorIcon(info.vendorId, this.props.themeType) ||
                                                info.vendorId}
                                            {info.label ? (
                                                <span
                                                    style={{
                                                        opacity: 0.7,
                                                        marginLeft: 8,
                                                        fontStyle: 'italic',
                                                    }}
                                                >
                                                    ({info.label})
                                                </span>
                                            ) : null}
                                        </TableCell>
                                        <TableCell>
                                            {info.connected ? (
                                                <span
                                                    style={{
                                                        color: this.props.themeType === 'dark' ? '#5ffc5f' : '#368836',
                                                    }}
                                                >
                                                    {I18n.t('Connected')}
                                                </span>
                                            ) : (
                                                I18n.t('Not connected')
                                            )}
                                        </TableCell>
                                    </TableRow>
                                ))}
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
            </Dialog>
        );
    }

    /**
     * Render the QR code dialog for pairing
     */
    renderQrCodeDialog(): React.ReactNode {
        if (!this.state.showQrCode) {
            return null;
        }

        const uuid = this.state.showQrCode?.uuid;
        const nodeState = uuid && this.props.nodeStates[this.state.showQrCode.uuid];
        if (nodeState && !nodeState.qrPairingCode) {
            // it seems the device was commissioned, so switch to debug view
            setTimeout(
                () =>
                    this.setState({
                        showDebugData: this.state.showQrCode,
                        showQrCode: null,
                    }),
                1_000,
            );
        }

        if (!nodeState) {
            return null;
        }

        return (
            <Dialog
                onClose={() => this.setState({ showQrCode: null })}
                open={!0}
                maxWidth="md"
            >
                <DialogTitle>{I18n.t('QR Code to connect')}</DialogTitle>
                <DialogContent>
                    <InfoBox type="info">
                        {I18n.t(
                            'Please scan this QR-Code with the App of the ecosystem you want to pair it to or use the below printed setup code.',
                        )}
                    </InfoBox>
                    <Box sx={{ background: 'white', padding: 2, width: 256, height: 256 }}>
                        {nodeState.qrPairingCode ? <QRCode value={nodeState.qrPairingCode} /> : null}
                    </Box>
                    <TextField
                        value={nodeState.manualPairingCode ? formatPairingCode(nodeState.manualPairingCode) : ''}
                        InputProps={{
                            readOnly: true,
                            endAdornment: nodeState.manualPairingCode ? (
                                <InputAdornment position="end">
                                    <IconButton
                                        onClick={() => {
                                            nodeState.manualPairingCode &&
                                                Utils.copyToClipboard(nodeState.manualPairingCode);
                                            this.props.showToast(I18n.t('Copied to clipboard'));
                                        }}
                                        edge="end"
                                    >
                                        <ContentCopy />
                                    </IconButton>
                                </InputAdornment>
                            ) : undefined,
                        }}
                        fullWidth
                        label={I18n.t('Manual pairing code')}
                        variant="standard"
                        sx={{ marginTop: 1 }}
                    />
                </DialogContent>
                <DialogActions>
                    <Button
                        onClick={async () => {
                            const result = await this.props.socket.sendTo(
                                `matter.${this.props.instance}`,
                                'deviceReAnnounce',
                                {
                                    uuid,
                                },
                            );

                            if (result.error) {
                                window.alert(`Cannot re-announce: ${result.error}`);
                            } else {
                                this.props.showToast(I18n.t('Successfully re-announced'));
                                this.props.updateNodeStates({
                                    [uuid]: result.result,
                                });
                            }
                        }}
                        startIcon={<SettingsInputAntenna />}
                        color="primary"
                        variant="contained"
                    >
                        {I18n.t('Re-announce')}
                    </Button>
                    <Button
                        onClick={() => this.setState({ showQrCode: null })}
                        startIcon={<Close />}
                        color="grey"
                        variant="contained"
                    >
                        {I18n.t('Close')}
                    </Button>
                </DialogActions>
            </Dialog>
        );
    }

    renderResetDialog(): React.JSX.Element | null {
        if (!this.state.showResetDialog) {
            return null;
        }
        return (
            <Dialog
                open={!0}
                onClose={() => this.setState({ showResetDialog: null })}
            >
                <DialogTitle>{I18n.t('Reset device or bridge')}</DialogTitle>
                <DialogContent>
                    <p>
                        {I18n.t(
                            'Device or bridge will lost all commissioning information and you must reconnect (with PIN or QR code) again.',
                        )}
                    </p>
                    <p>{I18n.t('Are you sure?')}</p>
                    {this.state.showResetDialog.step === 1 ? <p>{I18n.t('This cannot be undone!')}</p> : null}
                </DialogContent>
                <DialogActions>
                    <Button
                        onClick={() => {
                            if (this.state.showResetDialog?.step === 1) {
                                const uuid = this.state.showResetDialog.bridgeOrDevice.uuid;
                                this.setState({ showResetDialog: null });
                                void this.props.socket
                                    .sendTo(`matter.${this.props.instance}`, 'deviceFactoryReset', {
                                        uuid,
                                    })
                                    .then(result => {
                                        if (result.error) {
                                            window.alert(`Cannot reset: ${result.error}`);
                                        } else {
                                            this.props.showToast(I18n.t('Reset successful'));
                                            this.props.updateNodeStates({ [uuid]: result.result });
                                        }
                                    });
                            } else if (this.state.showResetDialog) {
                                this.setState({
                                    showResetDialog: {
                                        bridgeOrDevice: this.state.showResetDialog.bridgeOrDevice,
                                        step: 1,
                                    },
                                });
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
                        onClick={() => this.setState({ showResetDialog: null })}
                        startIcon={<Close />}
                        color="grey"
                        variant="contained"
                    >
                        {I18n.t('Cancel')}
                    </Button>
                </DialogActions>
            </Dialog>
        );
    }

    render(): React.JSX.Element | null {
        // this method is only to shut up the linter. It will be overloaded
        if (!this.state.showQrCode) {
            return null;
        }
        return (
            <div style={{ height: '100%', overflow: 'auto' }}>
                {this.renderStatus(this.state.showQrCode)}
                {this.renderDebugDialog()}
                {this.renderResetDialog()}
                {this.renderQrCodeDialog()}
            </div>
        );
    }
}

export default BridgesAndDevices;
