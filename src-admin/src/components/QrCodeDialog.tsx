import React, { Component } from 'react';

import { Scanner } from '@yudiel/react-qr-scanner';

import {
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    FormControl,
    IconButton,
    InputLabel,
    MenuItem,
    Select,
    TextField,
} from '@mui/material';
import { Add, Clear, Close, QrCode } from '@mui/icons-material';

import { I18n, type ThemeType, InfoBox } from '@iobroker/adapter-react-v5';

import type { MatterControllerConfig } from '../types';

/** Reserved id of the default (scalar) credential set. */
const DEFAULT_CREDENTIAL_ID = 'default';

export interface CommissioningCredentialIds {
    wifiCredentialId?: string;
    threadCredentialId?: string;
}

interface QrCodeDialogProps {
    onClose: (manualCode?: string, qrCode?: string, credentialIds?: CommissioningCredentialIds) => void;
    themeType: ThemeType;
    name?: string;
    /** Controller config, required to offer the stored-credential picker (BLE commissioning only). */
    controllerConfig?: MatterControllerConfig;
    /** Whether BLE commissioning is active; the credential picker is only relevant then. */
    ble?: boolean;
}

interface QrCodeDialogState {
    manualCode: string;
    qrCode: string;
    qrError: string;
    hideQrCode: boolean;
    iframe: WindowProxy | null;
    wifiCredentialId: string;
    threadCredentialId: string;
}

export default class QrCodeDialog extends Component<QrCodeDialogProps, QrCodeDialogState> {
    private initInterval: ReturnType<typeof setInterval> | null = null;

    constructor(props: QrCodeDialogProps) {
        super(props);
        this.state = {
            manualCode: '',
            qrCode: '',
            qrError: '',
            hideQrCode: false,
            iframe: null,
            wifiCredentialId: DEFAULT_CREDENTIAL_ID,
            threadCredentialId: DEFAULT_CREDENTIAL_ID,
        };
    }

    /**
     * Keep only credential entries the resolver can look up: a non-blank id that is not the reserved
     * `default`/`delete` and not a duplicate of an earlier entry. Blank/duplicate/reserved ids would either
     * collide with the Default option or fall back to the default set silently, so they must not be offered.
     */
    private static selectableCredentials<T extends { id: string }>(list: T[]): T[] {
        const seen = new Set<string>();
        const result: T[] = [];
        for (const entry of list) {
            const id = entry.id.trim().toLowerCase();
            if (!id || id === 'default' || id === 'delete' || seen.has(id)) {
                continue;
            }
            seen.add(id);
            result.push(entry);
        }
        return result;
    }

    /** Picker of the stored WiFi/Thread credential set to push during BLE commissioning. */
    private renderCredentialPicker(): React.JSX.Element | null {
        const config = this.props.controllerConfig;
        if (!this.props.ble || !config) {
            return null;
        }
        const wifi = QrCodeDialog.selectableCredentials(config.additionalWifiCredentials || []);
        const thread = QrCodeDialog.selectableCredentials(config.additionalThreadCredentials || []);
        if (!wifi.length && !thread.length) {
            return null;
        }

        return (
            <div style={{ marginTop: 16, maxWidth: 400 }}>
                <div style={{ marginBottom: 8 }}>{I18n.t('Network to configure on the device')}</div>
                {wifi.length ? (
                    <FormControl
                        variant="standard"
                        fullWidth
                        style={{ marginBottom: 8 }}
                    >
                        <InputLabel>{I18n.t('WiFi network')}</InputLabel>
                        <Select
                            value={this.state.wifiCredentialId}
                            onChange={e => this.setState({ wifiCredentialId: e.target.value })}
                        >
                            <MenuItem value={DEFAULT_CREDENTIAL_ID}>{I18n.t('Default')}</MenuItem>
                            {wifi.map(entry => (
                                <MenuItem
                                    key={entry.id}
                                    value={entry.id}
                                >
                                    {entry.ssid || entry.id}
                                </MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                ) : null}
                {thread.length ? (
                    <FormControl
                        variant="standard"
                        fullWidth
                    >
                        <InputLabel>{I18n.t('Thread network')}</InputLabel>
                        <Select
                            value={this.state.threadCredentialId}
                            onChange={e => this.setState({ threadCredentialId: e.target.value })}
                        >
                            <MenuItem value={DEFAULT_CREDENTIAL_ID}>{I18n.t('Default')}</MenuItem>
                            {thread.map(entry => (
                                <MenuItem
                                    key={entry.id}
                                    value={entry.id}
                                >
                                    {entry.networkName || entry.id}
                                </MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                ) : null}
            </div>
        );
    }

    onMessage = (event: { origin: string; data: any }): void => {
        if (typeof event.data === 'string') {
            if (event.origin === 'https://qr-code.iobroker.in') {
                if (event.data === 'inited') {
                    if (this.initInterval) {
                        clearInterval(this.initInterval);
                        this.initInterval = null;
                    }
                } else if (event.data === 'closeMe') {
                    this.state.iframe?.close();
                    this.setState({ iframe: null });
                } else {
                    this.setState({ qrCode: event.data });
                    if (event.data.startsWith('MT:')) {
                        this.state.iframe?.postMessage(
                            `close:${I18n.t('ioBroker received "%s". You can now close this window by clicking on this text.', event.data)}`,
                            '*',
                        );
                    }
                }
            }
        }
    };

    componentDidMount(): void {
        window.addEventListener('message', this.onMessage);
    }

    componentWillUnmount(): void {
        window.removeEventListener('message', this.onMessage);
        if (this.initInterval) {
            clearInterval(this.initInterval);
            this.initInterval = null;
        }
    }

    render(): React.JSX.Element {
        const qrCodeError = !!this.state.qrCode && !this.state.qrCode.startsWith('MT:');
        const manualCodeError =
            !!this.state.manualCode &&
            this.state.manualCode.replace(/[-\s]/g, '').length !== 11 &&
            this.state.manualCode.replace(/[-\s]/g, '').length !== 21;

        return (
            <Dialog
                open={!0}
                onClose={() => this.props.onClose()}
                maxWidth="lg"
                fullWidth
            >
                <DialogTitle>
                    {this.props.name
                        ? I18n.t('Add device "%s" by pairing code or QR Code', this.props.name)
                        : I18n.t('Add device by pairing code or QR Code')}
                </DialogTitle>
                <DialogContent>
                    <div style={{ marginBottom: 10 }}>{I18n.t('Add via QR Code')}</div>
                    <InfoBox
                        closeable
                        storeId="qr-code"
                        iconPosition="top"
                        type="info"
                    >
                        {I18n.t('Requirements: add via QR Code')}
                        <div style={{ color: this.props.themeType === 'dark' ? '#ff6363' : '#800000', marginTop: 10 }}>
                            {I18n.t(
                                'Please DO NOT use the QR code / pairing code that is printed on the Matter device.',
                            )}
                        </div>
                    </InfoBox>
                    {!this.state.qrCode ? (
                        <TextField
                            variant="standard"
                            label={I18n.t('Manual pairing code')}
                            fullWidth
                            style={{ maxWidth: 400 }}
                            value={this.state.manualCode}
                            onChange={e => this.setState({ manualCode: e.target.value })}
                            slotProps={{
                                input: {
                                    endAdornment: this.state.manualCode ? (
                                        <IconButton
                                            size="small"
                                            onClick={() => this.setState({ manualCode: '' })}
                                        >
                                            <Clear />
                                        </IconButton>
                                    ) : null,
                                },
                            }}
                            error={manualCodeError}
                            helperText={
                                manualCodeError ? I18n.t('Length of manual code must be 11 or 21 characters') : ''
                            }
                        />
                    ) : null}
                    {!this.state.manualCode && !this.state.hideQrCode ? (
                        <div
                            style={{
                                width: '100%',
                                height: 250,
                                display: 'flex',
                                justifyContent: 'center',
                                maxWidth: 400,
                                marginTop: 16,
                            }}
                        >
                            <div
                                id="video-container"
                                style={{ width: 250, height: 250 }}
                            >
                                <style>
                                    {`
                                    .qrscan {
                                        svg {
                                            height: 100%;
                                            width: 100%;
                                        }
                                    }
                                    `}
                                </style>
                                <Scanner
                                    formats={['qr_code', 'rm_qr_code', 'micro_qr_code']}
                                    classNames={{
                                        container: 'qrscan',
                                        video: 'aspect-square w-full h-full object-cover',
                                    }}
                                    onScan={result => this.setState({ qrCode: result[0].rawValue, qrError: '' })}
                                    onError={(error: unknown): void => {
                                        if ((error as Error)?.message.includes('secure context')) {
                                            this.setState({
                                                qrError: I18n.t(
                                                    'Camera access is only permitted in secure context. Use HTTPS or localhost rather than HTTP.',
                                                ),
                                                hideQrCode: true,
                                            });
                                        } else {
                                            this.setState({ qrError: (error as Error).toString() });
                                        }
                                    }}
                                />
                            </div>
                        </div>
                    ) : null}
                    {this.state.manualCode || (this.state.hideQrCode && !this.state.qrCode) ? null : (
                        <div style={{ width: '100%', marginTop: this.state.hideQrCode ? 20 : 10 }}>
                            <TextField
                                variant="standard"
                                label={I18n.t('QR Code')}
                                slotProps={{
                                    htmlInput: {
                                        readOnly: true,
                                    },
                                }}
                                fullWidth
                                style={{ maxWidth: 400 }}
                                value={this.state.qrCode || ''}
                                error={!!this.state.qrError || qrCodeError}
                                helperText={
                                    this.state.qrError || (qrCodeError ? I18n.t('Code must start with "MT:"') : '')
                                }
                            />
                        </div>
                    )}
                    {!this.state.manualCode && this.state.hideQrCode && !this.state.qrCode ? (
                        <div
                            style={{
                                width: '100%',
                                marginTop: 20,
                                color: this.props.themeType === 'dark' ? '#ff6e6e' : '#8a0000',
                                cursor: 'pointer',
                            }}
                        >
                            <div>{I18n.t('QR Code scan is not possible')}:</div>
                            <div>
                                {this.state.qrError
                                    ? this.state.qrError
                                          .split('\n')
                                          .map((part: string, i: number): React.JSX.Element => <p key={i}>{part}</p>)
                                    : null}
                            </div>
                        </div>
                    ) : null}
                    {!this.state.manualCode && this.state.hideQrCode && !this.state.iframe ? (
                        <Button
                            style={{ marginTop: 16 }}
                            variant="contained"
                            onClick={() => {
                                const iframe = window.open(
                                    `https://qr-code.iobroker.in?theme=${this.props.themeType}`,
                                    '_blank',
                                );
                                this.setState({ iframe }, () => {
                                    if (this.state.iframe && !this.initInterval) {
                                        this.initInterval = setInterval(() => {
                                            this.state.iframe?.postMessage('init', '*');
                                        }, 300);
                                    }
                                });
                            }}
                            startIcon={<QrCode />}
                        >
                            {I18n.t('Scan with the ioBroker cloud')}
                        </Button>
                    ) : null}
                    {this.renderCredentialPicker()}
                </DialogContent>
                <DialogActions>
                    <Button
                        variant="contained"
                        disabled={(!this.state.qrCode && !this.state.manualCode) || qrCodeError || manualCodeError}
                        color="primary"
                        onClick={(): void =>
                            this.props.onClose(this.state.manualCode, this.state.qrCode, {
                                wifiCredentialId: this.state.wifiCredentialId,
                                threadCredentialId: this.state.threadCredentialId,
                            })
                        }
                        startIcon={<Add />}
                    >
                        {I18n.t('Add')}
                    </Button>
                    <Button
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
