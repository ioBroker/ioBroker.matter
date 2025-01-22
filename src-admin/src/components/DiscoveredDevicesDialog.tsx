import React, { Component } from 'react';
import {
    Backdrop,
    Button,
    CircularProgress,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    LinearProgress,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableRow,
} from '@mui/material';
import { type AdminConnection, I18n, type ThemeType } from '@iobroker/adapter-react-v5';
import InfoBox from './InfoBox';
import { getVendorName } from '../Utils';
import { IconButton } from '@foxriver76/iob-component-lib';
import { Close, SearchOff } from '@mui/icons-material';
import type { CommissionableDevice } from '../types';
import QrCodeDialog from './QrCodeDialog';

interface DiscoveredDevicesDialogProps {
    socket: AdminConnection;
    onClose: () => void;
    ble: boolean;
    instance: number;
    registerDiscoveryMessageHandler: (handler: null | ((device: CommissionableDevice) => void)) => void;
    themeType: ThemeType;
    triggerDeviceManagerLoad: () => void;
}

interface DiscoveredDevicesDialogState {
    existing: string[];
    /** Was a discovery result received which means that the dialog should stay open also after discovery ended */
    discoveryDone: boolean;
    /** The discovery process is active in the backend */
    discoveryRunning: boolean;
    backendProcessingActive: boolean;
    discovered: CommissionableDevice[];
    showQrCodeDialog: null | CommissionableDevice;
}

export default class DiscoveredDevicesDialog extends Component<
    DiscoveredDevicesDialogProps,
    DiscoveredDevicesDialogState
> {
    constructor(props: DiscoveredDevicesDialogProps) {
        super(props);
        this.state = {
            existing: [],
            discoveryRunning: false,
            discoveryDone: false,
            discovered: [],
            showQrCodeDialog: null,
            backendProcessingActive: false,
        };

        this.props.registerDiscoveryMessageHandler(this.onMessageHandler);
    }

    onMessageHandler = (device: CommissionableDevice): void => {
        const discovered = JSON.parse(JSON.stringify(this.state.discovered));
        discovered.push(device);
        this.setState({ discovered });
    };

    renderQrCodeDialog(): React.JSX.Element | null {
        if (!this.state.showQrCodeDialog) {
            return null;
        }

        return (
            <QrCodeDialog
                name={`${this.state.showQrCodeDialog.DN} / ${getVendorName(this.state.showQrCodeDialog.V)}`}
                onClose={async (manualCode?: string, qrCode?: string): Promise<void> => {
                    if (manualCode || qrCode) {
                        const device: CommissionableDevice = this.state.showQrCodeDialog!;

                        this.setState({ showQrCodeDialog: null, backendProcessingActive: true });

                        const result = await this.props.socket.sendTo(
                            `matter.${this.props.instance}`,
                            'controllerCommissionDevice',
                            {
                                device,
                                qrCode,
                                manualCode,
                            },
                        );

                        this.setState({ backendProcessingActive: false });

                        if (result.error || !result.result) {
                            window.alert(`Cannot connect: ${result.error || 'Unknown error'}`);
                        } else {
                            window.alert(I18n.t('Connected'));
                            const deviceId = device.deviceIdentifier;
                            const discovered = this.state.discovered.filter(
                                commDevice => commDevice.deviceIdentifier !== deviceId,
                            );

                            this.setState({ discovered }, () => {
                                this.props.triggerDeviceManagerLoad();
                            });
                        }
                    } else {
                        this.setState({ showQrCodeDialog: null });
                    }
                }}
                themeType={this.props.themeType}
            />
        );
    }

    /**
     * Stop discovering devices
     */
    async stopDiscovery(): Promise<void> {
        if (!this.state.discoveryRunning) {
            // Nothing to stop if no Discovery is running
            return;
        }
        console.log('Stop discovery');

        await this.props.socket.sendTo(`matter.${this.props.instance}`, 'controllerDiscoveryStop', {});
    }

    async componentDidMount(): Promise<void> {
        // Read existing devices
        const folders = await this.props.socket.getObjectViewSystem(
            'folder',
            `matter.${this.props.instance}.`,
            `matter.${this.props.instance}.\u9999`,
        );

        this.setState({
            existing: Object.keys(folders)
                .map(id => id.split('.').pop() || '')
                .filter(a => a),
        });

        await this.props.socket.subscribeState(
            `matter.${this.props.instance}.controller.info.discovering`,
            this.onStateChange,
        );

        setTimeout(async (): Promise<void> => {
            const result: {
                error?: string;
                result?: CommissionableDevice[];
            } = await this.props.socket.sendTo(`matter.${this.props.instance}`, 'controllerDiscovery', {});

            if (result.error) {
                window.alert(`Error on discovery: ${result.error}`);
            } else if (result.result) {
                this.setState({
                    discoveryDone: !!result.result.length,
                    discovered: result.result,
                });
            }
        }, 50);
    }

    componentWillUnmount(): void {
        this.props.registerDiscoveryMessageHandler(null);

        this.props.socket.unsubscribeState(
            `matter.${this.props.instance}.controller.info.discovering`,
            this.onStateChange,
        );
    }

    onStateChange = (id: string, state: ioBroker.State | null | undefined): void => {
        if (id === `matter.${this.props.instance}.controller.info.discovering`) {
            if (state?.val) {
                this.setState({ discoveryRunning: true });
            } else {
                this.setState({
                    discoveryRunning: false,
                    discoveryDone: !!this.state.discovered.length, // Leave the dialog open if we found devices
                });
            }
            return;
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

    render(): React.JSX.Element {
        return (
            <Dialog
                sx={{ '.MuiDialog-paper': { maxWidth: 800 } }}
                open={!0}
                onClose={() => this.props.onClose()}
            >
                {this.renderQrCodeDialog()}
                {this.renderLoadingSpinner()}
                <DialogTitle>{I18n.t('Discovered devices to pair')}</DialogTitle>
                <DialogContent>
                    <div style={{ fontWeight: 'bold', width: '100%', marginBottom: 16 }}>
                        {I18n.t('Pairing requirement')}
                    </div>
                    <InfoBox
                        type="info"
                        closeable
                        storeId="matter.pairing"
                    >
                        {I18n.t(this.props.ble ? 'Pairing Info Text BLE' : 'Pairing Info Text')}
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
                                            disabled={this.state.existing.includes(device.deviceIdentifier)}
                                            tooltipText={I18n.t('Connect')}
                                            onClick={() => this.setState({ showQrCodeDialog: device })}
                                        />
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </DialogContent>
                <DialogActions>
                    {!this.state.discoveryDone ? (
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
                    ) : null}
                    <Button
                        disabled={this.state.discoveryRunning}
                        variant="contained"
                        color="grey"
                        onClick={() => this.props.onClose()}
                        startIcon={<Close />}
                    >
                        {I18n.t('Close')}
                    </Button>
                </DialogActions>
            </Dialog>
        );
    }
}
