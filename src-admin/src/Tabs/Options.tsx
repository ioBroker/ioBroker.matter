import React, { Component } from 'react';

import {
    Box,
    Button,
    Checkbox,
    CircularProgress,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Fab,
    FormControl,
    FormControlLabel,
    IconButton,
    InputLabel,
    MenuItem,
    Select,
    TextField,
    Tooltip,
    Typography,
} from '@mui/material';

import { Check, Close, LayersClear, AutoAwesome, Clear, CloudUpload } from '@mui/icons-material';

import { type AdminConnection, I18n, Logo, InfoBox, IconExpert } from '@iobroker/adapter-react-v5';

import LoginPassword from '../components/LoginPassword';
import NetworkSelector from '../components/NetworkSelector';
import type { MatterAdapterConfig, MatterConfig } from '../types';

const styles: Record<string, React.CSSProperties> = {
    address: {
        fontSize: 'smaller',
        opacity: 0.5,
        marginLeft: 8,
    },
    panel: {
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
    },
    input: {
        marginTop: 2,
        marginBottom: 1,
        width: '100%',
        maxWidth: 250,
    },
    inputLong: {
        marginTop: 2,
        marginBottom: 1,
        width: '100%',
        maxWidth: 500,
    },
    header: {
        fontSize: 18,
        fontWeight: 'bold',
        marginBottom: 1,
    },
};

interface OptionsProps {
    alive: boolean;
    socket: AdminConnection;
    native: MatterAdapterConfig;
    common: ioBroker.InstanceCommon;
    instance: number;
    onChange: (attr: string, value: boolean | string) => Promise<void>;
    showToast: (text: string) => void;
    onLoad: (native: MatterAdapterConfig) => void;
    /** The current matter config */
    matter: MatterConfig;
    onShowWelcomeDialog: () => void;
    onError: (errorText: string) => void;
    updatePassTrigger: number;
    expertMode: boolean;
    setExpertMode: (expertMode: boolean) => void;
}

interface OptionsState {
    showDialog: boolean;
    dialogLevel: number;
    /** Default path for custom OTA updates (from backend) */
    defaultCustomOtaPath: string;
    /** If we are currently waiting for backend processing */
    backendProcessingActive: boolean;
}

class Options extends Component<OptionsProps, OptionsState> {
    constructor(props: OptionsProps) {
        super(props);
        this.state = {
            showDialog: false,
            dialogLevel: 0,
            defaultCustomOtaPath: '',
            backendProcessingActive: false,
        };
    }

    componentDidMount(): void {
        // Fetch default custom OTA path from backend
        this.props.socket
            .sendTo(`matter.${this.props.instance}`, 'getDefaultCustomOtaPath', {})
            .then((result: { path?: string }) => {
                if (result?.path) {
                    this.setState({ defaultCustomOtaPath: result.path });
                }
            })
            .catch(e => console.error(`Cannot get default custom OTA path: ${e}`));
    }

    renderConfirmDialog(): React.JSX.Element | null {
        if (!this.state.showDialog) {
            return null;
        }

        return (
            <Dialog
                open={!0}
                onClose={() => this.setState({ showDialog: false })}
                maxWidth="md"
            >
                <DialogTitle>{I18n.t('Please confirm')}</DialogTitle>
                <DialogContent>
                    <Typography sx={{ whiteSpace: 'preserve' }}>
                        {I18n.t(
                            'All state information of matter controller and devices will be deleted. You cannot undo it.',
                        )}
                    </Typography>
                    <br />
                    {this.state.dialogLevel ? I18n.t('Are you really sure?') : I18n.t('Are you sure?')}
                </DialogContent>
                <DialogActions>
                    <Button
                        variant="contained"
                        style={{
                            backgroundColor: this.state.dialogLevel === 1 ? 'red' : undefined,
                            color: this.state.dialogLevel === 1 ? 'white' : undefined,
                        }}
                        color="grey"
                        onClick={() => {
                            if (this.state.dialogLevel === 1) {
                                this.setState({ showDialog: false });
                                // send command to reset all states
                                this.props.socket
                                    .sendTo(`matter.${this.props.instance}`, 'reset', {})
                                    .then(() => this.props.showToast(I18n.t('Done')))
                                    .catch(e => this.props.showToast(`Cannot reset: ${e}`));
                            } else {
                                this.setState({ dialogLevel: 1 });
                            }
                        }}
                        startIcon={<Check />}
                    >
                        {this.state.dialogLevel === 1
                            ? I18n.t('Reset it at least to defaults')
                            : I18n.t('Reset to defaults')}
                    </Button>
                    <Button
                        variant="contained"
                        color="primary"
                        onClick={() => this.setState({ showDialog: false })}
                        startIcon={<Close />}
                    >
                        {I18n.t('Cancel')}
                    </Button>
                </DialogActions>
            </Dialog>
        );
    }

    render(): React.JSX.Element {
        const bridge = this.props.matter.bridges.find(bridge => bridge.uuid === this.props.native.defaultBridge) || {
            uuid: '_',
            name: I18n.t('Unknown'),
        };

        return (
            <div style={styles.panel}>
                {this.renderConfirmDialog()}
                <Tooltip
                    title={I18n.t('Show welcome dialog')}
                    slotProps={{ popper: { sx: { pointerEvents: 'none' } } }}
                >
                    <Fab
                        size="small"
                        style={{
                            position: 'absolute',
                            top: 4,
                            left: 80,
                        }}
                        onClick={this.props.onShowWelcomeDialog}
                    >
                        <AutoAwesome />
                    </Fab>
                </Tooltip>
                <Tooltip
                    title={I18n.t('Toggle expert mode')}
                    slotProps={{ popper: { sx: { pointerEvents: 'none' } } }}
                >
                    <IconButton
                        style={{
                            position: 'absolute',
                            top: 4,
                            left: 130,
                            width: 40,
                            height: 40,
                        }}
                        onClick={() => this.props.setExpertMode(!this.props.expertMode)}
                        color={this.props.expertMode ? 'primary' : 'default'}
                    >
                        <IconExpert
                            style={{
                                width: 40,
                                height: 40,
                            }}
                        />
                    </IconButton>
                </Tooltip>
                <Logo
                    instance={this.props.instance}
                    common={this.props.common}
                    native={this.props.native}
                    onError={text => this.props.showToast(text)}
                    onLoad={this.props.onLoad}
                />
                <Typography sx={styles.header}>{I18n.t('Network configuration')}</Typography>
                {this.props.expertMode ? null : (
                    <InfoBox type="info">
                        {I18n.t(
                            'If your device has more then one active network interface and you have issues try limiting it to one interface',
                        )}
                    </InfoBox>
                )}

                <NetworkSelector
                    interface={this.props.native.interface}
                    onChange={(newInterface: string) => this.props.onChange('interface', newInterface)}
                    socket={this.props.socket}
                    host={this.props.common.host}
                />

                <Box sx={{ marginTop: 2 }}>
                    {this.props.expertMode ? null : <InfoBox type="info">{I18n.t('Info about Alexa Bridge')}</InfoBox>}
                    <FormControl style={styles.inputLong}>
                        <InputLabel
                            sx={{
                                '&.MuiFormLabel-root': {
                                    transform: 'translate(0px, -9px) scale(0.75)',
                                },
                            }}
                        >
                            {I18n.t('Default bridge (Alexa-compatible)')}
                        </InputLabel>
                        <Select
                            variant="standard"
                            style={styles.inputLong}
                            value={this.props.native.defaultBridge || '_'}
                            renderValue={() => {
                                if (!bridge) {
                                    return null;
                                }

                                return (
                                    <span
                                        style={{
                                            fontWeight: bridge.uuid === '_' ? 'bold' : undefined,
                                        }}
                                    >
                                        {bridge.uuid === '_' ? I18n.t('Select default bridge') : bridge.name}
                                        {bridge.uuid === '_' ? null : <span style={styles.address}>{bridge.uuid}</span>}
                                    </span>
                                );
                            }}
                            onChange={e => {
                                void this.props.onChange('defaultBridge', e.target.value);
                            }}
                        >
                            {this.props.matter.bridges.map((it, i) => (
                                <MenuItem
                                    key={i}
                                    value={it.uuid}
                                >
                                    <span
                                        style={{
                                            fontWeight: it.uuid === '_' ? 'bold' : undefined,
                                        }}
                                    >
                                        {it.name}
                                        <span style={styles.address}>{it.uuid}</span>
                                    </span>
                                </MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                </Box>

                <div style={{ marginTop: 50 }}>
                    <Typography sx={styles.header}>{I18n.t('Controller Settings')}</Typography>
                    {this.props.expertMode ? null : (
                        <InfoBox type="info">
                            {I18n.t(
                                'The label set here is used as Label when ioBroker connects to a device as controller and might be shown by other Controllers in their overviews about other connected ecosystems.',
                            )}
                        </InfoBox>
                    )}
                    <TextField
                        variant="standard"
                        label={I18n.t('Controller fabric label')}
                        value={this.props.native.controllerFabricLabel}
                        type="text"
                        placeholder={`ioBroker matter.${this.props.instance}`}
                        onChange={e => this.props.onChange('controllerFabricLabel', e.target.value)}
                        margin="normal"
                        slotProps={{
                            inputLabel: {
                                shrink: true,
                            },
                            htmlInput: {
                                maxLength: 32,
                            },
                            input: {
                                endAdornment: this.props.native.controllerFabricLabel ? (
                                    <IconButton
                                        size="small"
                                        onClick={() => this.props.onChange('controllerFabricLabel', '')}
                                    >
                                        <Clear />
                                    </IconButton>
                                ) : null,
                            },
                        }}
                        style={{
                            ...styles.input,
                            maxWidth: 350,
                        }}
                    />

                    <Box sx={{ marginTop: 3 }}>
                        <Typography sx={{ ...styles.header, fontSize: 16 }}>{I18n.t('Custom OTA Updates')}</Typography>
                        {this.props.expertMode ? null : (
                            <InfoBox
                                type="info"
                                closeable
                                storeId="matter.controller.customOta"
                            >
                                {I18n.t('Custom OTA Updates Infotext')}
                            </InfoBox>
                        )}
                        <FormControlLabel
                            control={
                                <Checkbox
                                    checked={!!this.props.native.allowUnofficialUpdates}
                                    onChange={e => this.props.onChange('allowUnofficialUpdates', e.target.checked)}
                                    color="primary"
                                />
                            }
                            label={I18n.t('Allow custom/unofficial OTA updates')}
                        />
                        {this.props.native.allowUnofficialUpdates ? (
                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 1 }}>
                                <TextField
                                    variant="standard"
                                    label={I18n.t('Custom OTA updates path')}
                                    value={this.props.native.customUpdatesPath || ''}
                                    placeholder={this.state.defaultCustomOtaPath}
                                    helperText={
                                        this.state.defaultCustomOtaPath
                                            ? `${I18n.t('Default')}: ${this.state.defaultCustomOtaPath}`
                                            : ''
                                    }
                                    onChange={e => this.props.onChange('customUpdatesPath', e.target.value)}
                                    style={{ ...styles.input, maxWidth: 500 }}
                                />
                                <Button
                                    variant="contained"
                                    color="primary"
                                    disabled={!this.props.alive || this.state.backendProcessingActive}
                                    onClick={async () => {
                                        this.setState({ backendProcessingActive: true });
                                        try {
                                            const result = await this.props.socket.sendTo(
                                                `matter.${this.props.instance}`,
                                                'importCustomOtaUpdates',
                                                {},
                                            );
                                            if (result.error) {
                                                this.props.onError(result.error);
                                            } else if (result.imported !== undefined) {
                                                this.props.showToast(
                                                    I18n.t('Imported %s OTA update files', result.imported.toString()),
                                                );
                                            }
                                        } catch (e) {
                                            this.props.onError(`${e}`);
                                        }
                                        this.setState({ backendProcessingActive: false });
                                    }}
                                    startIcon={
                                        this.state.backendProcessingActive ? (
                                            <CircularProgress size={20} />
                                        ) : (
                                            <CloudUpload />
                                        )
                                    }
                                    sx={{ maxWidth: 250 }}
                                >
                                    {I18n.t('Import updates now')}
                                </Button>
                            </Box>
                        ) : null}
                    </Box>
                </div>

                <div style={{ marginTop: 50 }}>
                    <Typography sx={styles.header}>{I18n.t('Cloud Account')}</Typography>
                    {this.props.expertMode ? null : (
                        <InfoBox type="info">
                            <p>
                                {I18n.t(
                                    'To use a Matter bridge or device options with more than 5 devices please enter valid ioBroker.pro Cloud credentials with at least an active Assistant license.',
                                )}
                            </p>
                            <p>
                                {I18n.t(
                                    'Make sure that after purchasing a new assistant or remote license, the instance is restarted. The license will only be verified during startup.',
                                )}
                            </p>
                        </InfoBox>
                    )}
                </div>
                <LoginPassword
                    native={this.props.native}
                    onChange={(attr: string, value: string): Promise<void> => this.props.onChange(attr, value)}
                    onError={(error: string) => this.props.onError(error)}
                    socket={this.props.socket}
                />

                <div style={{ marginTop: 50 }}>
                    <Typography sx={styles.header}>{I18n.t('Logging')}</Typography>
                    <FormControlLabel
                        control={
                            <Checkbox
                                checked={this.props.native.debug}
                                onChange={e => this.props.onChange('debug', e.target.checked)}
                                color="primary"
                            />
                        }
                        label={I18n.t('Enable enhanced debug logging for the Matter protocol')}
                    />
                </div>

                <div style={{ marginTop: 50 }}>
                    <Typography sx={styles.header}>{I18n.t('Maintenance Settings')}</Typography>
                    <Button
                        disabled={!this.props.alive}
                        onClick={() => this.setState({ showDialog: true, dialogLevel: 0 })}
                        variant="contained"
                        color="grey"
                        startIcon={<LayersClear />}
                    >
                        {I18n.t('Controller and Device Factory Reset')}
                    </Button>
                </div>
            </div>
        );
    }
}

export default Options;
