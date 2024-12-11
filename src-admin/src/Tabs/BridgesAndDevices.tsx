import React, { Component } from 'react';
import QRCode from 'react-qr-code';

import {
    type AdminConnection,
    I18n,
    Icon,
    type IobTheme,
    type ThemeName,
    type ThemeType,
    Utils,
} from '@iobroker/adapter-react-v5';
import {
    Close,
    ContentCopy,
    Delete,
    Info,
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
import ioBroker from '../assets/ioBroker.svg';
import { type ConfigItemPanel, type ConfigItemTabs, JsonConfigComponent } from '@iobroker/json-config';

import { VendorIds, VendorIdsAmazon, VendorIdsApple, VendorIdsGoogle, VendorIdsSamsung } from '../utils/vendorIDs';
import InfoBox from '../components/InfoBox';

import type {
    BridgeDescription,
    DetectedRoom,
    DeviceDescription,
    MatterConfig,
    NodeStateResponse,
    NodeStates,
} from '../types';
import { formatPairingCode } from '../Utils';
import type { ActionButton, BackEndCommandJsonFormOptions, JsonFormSchema } from '@iobroker/dm-utils';
import { getTranslation } from '../components/DeviceManagerDev/Utils';

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
    themeName: ThemeName;
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
    jsonConfig: {
        schema: ConfigItemPanel | ConfigItemTabs;
        options?: BackEndCommandJsonFormOptions;
        changed: boolean;
        data: Record<string, any>;
    } | null;
}

class BridgesAndDevices<TProps extends BridgesAndDevicesProps, TState extends BridgesAndDevicesState> extends Component<
    TProps,
    TState
> {
    // eslint-disable-next-line react/no-unused-class-component-methods
    protected isDevice: boolean;

    constructor(props: TProps) {
        super(props);

        this.state = {
            showQrCode: null,
            showResetDialog: null,
            showDebugData: null,
            jsonConfig: null,
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

    static getVendorName(vendorId: number): string {
        return VendorIds[vendorId]
            ? `${VendorIds[vendorId]} (0x${vendorId.toString(16)})`
            : `0x${vendorId.toString(16)}`;
    }

    static getVendorIcon(vendorId: number, vendorName: string, themeType: ThemeType): React.JSX.Element | null {
        const vendor = VendorIds[vendorId];

        if (vendorId === 0xfff1 && vendorName.toLowerCase() === 'iobroker') {
            // AmazonLab126
            return (
                <img
                    src={ioBroker}
                    alt="ioBroker"
                    title="ioBroker"
                    style={STYLES.vendorIcon}
                />
            );
        }
        if (VendorIdsAmazon.includes(vendorId)) {
            // AmazonLab126
            return (
                <SiAmazonalexa
                    title={this.getVendorName(vendorId)}
                    style={{
                        ...STYLES.vendorIcon,
                        color: themeType === 'dark' ? '#0000dc' : '#001ca8',
                    }}
                />
            );
        }
        if (VendorIdsGoogle.includes(vendorId)) {
            // Google LLC
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
        if (VendorIdsApple.includes(vendorId)) {
            // Apple Inc. and Apple Keychain
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
        if (VendorIdsSamsung.includes(vendorId)) {
            // SmartThings, Inc. and Samsung
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

    static getStatusColor(status: NodeStates, themeType: ThemeType, isContrast?: boolean): string {
        if (status === 'creating') {
            return themeType === 'dark' ? '#a4a4a4' : '#1c1c1c';
        }
        if (status === 'waitingForCommissioning') {
            if (!isContrast) {
                return themeType === 'dark' ? '#aac7ff' : '#4e7bff';
            }
            return themeType === 'dark' ? '#699aff' : '#5385ff';
        }
        if (status === 'commissioned') {
            return themeType === 'dark' ? '#fcb35f' : '#b24a00';
        }
        if (status === 'connected') {
            return themeType === 'dark' ? '#5ffc5f' : '#368836';
        }
        return 'grey';
    }

    static getStatusIcon(status: NodeStates, themeType: ThemeType, isContrast?: boolean): React.JSX.Element {
        const color = BridgesAndDevices.getStatusColor(status, themeType, isContrast);
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

    requestAdditionalInformation(uuid: string): void {
        this.props.socket
            .sendTo(`matter.${this.props.instance}`, 'extendedInfo', { uuid })
            .then((result: { schema: JsonFormSchema; options?: BackEndCommandJsonFormOptions }): void => {
                this.setState({
                    jsonConfig: {
                        schema: result.schema,
                        options: result.options,
                        changed: false,
                        data: result.options?.data || {},
                    },
                });
            })
            .catch(e => this.props.showToast(`Cannot reset: ${e}`));
    }

    renderStatus(
        deviceOrBridge: DeviceDescription | BridgeDescription,
    ): [React.JSX.Element | null, React.JSX.Element | null, React.JSX.Element | null] {
        if (!this.props.nodeStates[deviceOrBridge.uuid] || !deviceOrBridge.enabled) {
            return [null, null, null];
        }

        const result: [React.JSX.Element | null, React.JSX.Element | null, React.JSX.Element | null] = [
            null,
            null,
            null,
        ];

        const qrCode = this.props.nodeStates[deviceOrBridge.uuid].status ? (
            <Tooltip
                key="qrCode"
                title={
                    this.props.nodeStates[deviceOrBridge.uuid].status === 'waitingForCommissioning'
                        ? I18n.t('Device is not commissioned. Show QR Code for commissioning')
                        : I18n.t('Show QR Code for commissioning')
                }
                slotProps={{ popper: { sx: { pointerEvents: 'none' } } }}
            >
                <IconButton
                    style={{ height: 40 }}
                    onClick={() => {
                        this.reAnnounceDevice(deviceOrBridge.uuid).catch(e => window.alert(`Cannot re-announce: ${e}`));
                        this.setState({ showQrCode: deviceOrBridge });
                    }}
                >
                    <QrCode />
                </IconButton>
            </Tooltip>
        ) : null;

        if (qrCode) {
            result[2] = qrCode;
        }

        const extendedInfo = (
            <Tooltip
                key="debug"
                title={I18n.t('Show additional information')}
                slotProps={{ popper: { sx: { pointerEvents: 'none' } } }}
            >
                <IconButton
                    style={{
                        height: 40,
                        color: this.isDevice ? (this.props.themeType === 'dark' ? 'white' : '#00000080') : 'white',
                    }}
                    onClick={() => this.requestAdditionalInformation(deviceOrBridge.uuid)}
                >
                    <Info />
                </IconButton>
            </Tooltip>
        );

        if (qrCode) {
            result[2] = extendedInfo;
        }
        if (this.props.nodeStates[deviceOrBridge.uuid].status) {
            result[0] = (
                <Tooltip
                    key="status"
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
                            this.isDevice,
                        )}
                    </IconButton>
                </Tooltip>
            );
        }

        return result;
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
                                        <div style={{ display: 'flex', alignItems: 'center' }}>
                                            {BridgesAndDevices.getStatusIcon(data.status, this.props.themeType)}
                                            <span style={{ marginLeft: 10 }}>{I18n.t(`status_${data.status}`)}</span>
                                        </div>
                                    </TableCell>
                                </TableRow>
                                {data.connectionInfo?.map((info, i) => (
                                    <TableRow key={i}>
                                        <TableCell>
                                            {BridgesAndDevices.getVendorIcon(
                                                info.vendorId,
                                                info.vendorName,
                                                this.props.themeType,
                                            ) || BridgesAndDevices.getVendorName(info.vendorId)}
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

    onJsonConfigClose(_data?: Record<string, any>): void {
        this.setState({ jsonConfig: null });
    }

    getOkButton(button?: ActionButton | 'apply' | 'cancel'): React.JSX.Element {
        if (typeof button === 'string') {
            button = undefined;
        }
        return (
            <Button
                key="apply"
                disabled={!this.state.jsonConfig?.changed}
                variant={button?.variant || 'contained'}
                color={button?.color || 'primary'}
                onClick={() => this.onJsonConfigClose(this.state.jsonConfig?.data)}
                startIcon={button?.icon ? <Icon src={button?.icon} /> : undefined}
            >
                {getTranslation(button?.label || 'okButtonText', button?.noTranslation)}
            </Button>
        );
    }

    getCancelButton(button?: ActionButton | 'apply' | 'cancel' | 'close'): React.JSX.Element {
        let isClose = false;
        if (typeof button === 'string') {
            isClose = button === 'close';
            button = undefined;
        }
        return (
            <Button
                key="cancel"
                variant={button?.variant || 'contained'}
                color={button?.color || 'grey'}
                onClick={() => this.onJsonConfigClose()}
                startIcon={isClose ? <Close /> : button?.icon ? <Icon src={button?.icon} /> : undefined}
            >
                {isClose ? I18n.t('Close') : getTranslation(button?.label || 'cancelButtonText', button?.noTranslation)}
            </Button>
        );
    }

    renderJsonConfigDialog(): React.JSX.Element | null {
        if (!this.state.jsonConfig) {
            return null;
        }

        let buttons: React.JSX.Element[];
        if (this.state.jsonConfig.options?.buttons) {
            buttons = [];
            this.state.jsonConfig.options.buttons.forEach((button: ActionButton | 'apply' | 'cancel'): void => {
                if (button === 'apply' || (button as ActionButton).type === 'apply') {
                    buttons.push(this.getOkButton(button));
                } else {
                    buttons.push(this.getCancelButton(button));
                }
            });
        } else {
            buttons = [this.getOkButton(), this.getCancelButton()];
        }

        return (
            <Dialog
                onClose={() => this.setState({ showDebugData: null })}
                open={!0}
                maxWidth={this.state.jsonConfig.options?.maxWidth || 'md'}
                fullWidth
            >
                {this.state.jsonConfig.options?.title ? (
                    <DialogTitle>
                        {getTranslation(
                            this.state.jsonConfig.options.title,
                            this.state.jsonConfig.options.noTranslation,
                        )}
                    </DialogTitle>
                ) : null}
                <DialogContent>
                    <JsonConfigComponent
                        expertMode
                        socket={this.props.socket}
                        adapterName="matter"
                        instance={this.props.instance}
                        schema={this.state.jsonConfig.schema}
                        data={this.state.jsonConfig.options?.data || {}}
                        onError={() => {
                            // ignored
                        }}
                        onChange={(_data: Record<string, any>) => {
                            // ignored
                        }}
                        embedded
                        themeName={this.props.themeName}
                        themeType={this.props.themeType}
                        theme={this.props.theme}
                        isFloatComma={!!this.props.socket.systemConfig?.common.isFloatComma}
                        dateFormat={this.props.socket.systemConfig?.common.dateFormat as string}
                    />
                </DialogContent>
                <DialogActions>{buttons}</DialogActions>
            </Dialog>
        );
    }

    async reAnnounceDevice(uuid: string): Promise<void> {
        const result = await this.props.socket.sendTo(`matter.${this.props.instance}`, 'deviceReAnnounce', {
            uuid,
        });

        if (result.error) {
            window.alert(`Cannot re-announce: ${result.error}`);
        } else {
            this.props.showToast(I18n.t('Successfully re-announced'));
            this.props.updateNodeStates({
                [uuid]: result.result,
            });
        }
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
                    <InfoBox
                        type="info"
                        closeable
                        storeId="matter.bridgeAndDevice"
                        iconPosition="top"
                    >
                        {I18n.t(
                            'Please scan this QR-Code with the App of the ecosystem you want to pair it to or use the below printed setup code.',
                        )}
                    </InfoBox>
                    <Box sx={{ background: 'white', padding: 2, width: 256, height: 256 }}>
                        {nodeState.qrPairingCode ? <QRCode value={nodeState.qrPairingCode} /> : null}
                    </Box>
                    <TextField
                        value={nodeState.manualPairingCode ? formatPairingCode(nodeState.manualPairingCode) : ''}
                        slotProps={{
                            htmlInput: { readOnly: true },
                            input: {
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
                            },
                        }}
                        fullWidth
                        label={I18n.t('Manual pairing code')}
                        variant="standard"
                        sx={{ marginTop: 1 }}
                    />
                </DialogContent>
                <DialogActions>
                    <Button
                        onClick={() => this.reAnnounceDevice(uuid)}
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
                            'All information of this device or bridge will be deleted and you must reconnect (with PIN or QR code) again.',
                        )}
                    </p>
                    {this.props.nodeStates[this.state.showResetDialog.bridgeOrDevice.uuid].status !==
                    'waitingForCommissioning' ? (
                        <p style={{ color: this.props.themeType === 'dark' ? '#9c0a0a' : '#910000' }}>
                            {I18n.t(
                                'This device/bridge is linked to some ecosystem. If it is deleted here, you must manually remove it from your ecosystem!',
                            )}
                        </p>
                    ) : null}
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
                {this.renderJsonConfigDialog()}
            </div>
        );
    }
}

export default BridgesAndDevices;
