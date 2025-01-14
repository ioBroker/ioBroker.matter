import React, { Component } from 'react';

import { Scanner } from '@yudiel/react-qr-scanner';

import { Button, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, TextField } from '@mui/material';
import { Add, Clear, Close, QrCode } from '@mui/icons-material';

import { I18n, type ThemeType } from '@iobroker/adapter-react-v5';

import InfoBox from './InfoBox';

interface QrCodeDialogProps {
    onClose: (manualCode?: string, qrCode?: string) => void;
    themeType: ThemeType;
    name?: string;
}

interface QrCodeDialogState {
    manualCode: string;
    qrCode: string;
    qrError: string;
    hideQrCode: boolean;
    iframe: WindowProxy | null;
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
        };
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
                            <div>{this.state.qrError}</div>
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
                </DialogContent>
                <DialogActions>
                    <Button
                        variant="contained"
                        disabled={(!this.state.qrCode && !this.state.manualCode) || qrCodeError || manualCodeError}
                        color="primary"
                        onClick={(): void => this.props.onClose(this.state.manualCode, this.state.qrCode)}
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
