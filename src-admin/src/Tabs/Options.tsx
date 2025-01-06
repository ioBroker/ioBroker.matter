import React, { Component } from 'react';

import {
    Box,
    Button,
    Checkbox,
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

import { Check, Close, LayersClear, AutoAwesome, Clear, VisibilityOff, Visibility } from '@mui/icons-material';

import { type AdminConnection, I18n, Logo } from '@iobroker/adapter-react-v5';

import InfoBox from '../components/InfoBox';
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
        maxWidth: 500,
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

interface NetworkInterface {
    address: string;
    netmask: string;
    family: string;
    mac: string;
    internal: boolean;
    cidr: string;
}

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
}

interface OptionsState {
    showDialog: boolean;
    dialogLevel: number;
    iotLogin: string;
    iotPassword: string;
    iotInstance: string;
    interfaces?: { value: string; address?: string; address6?: string }[];
    passVisible?: boolean;
}

function cutIpV6(address: string, length?: number): string {
    if (window.innerWidth > 1024) {
        return address;
    }
    length = length || 10;
    // +2, while ... is longer than 2 characters
    if (address.length < length + 2) {
        return address;
    }
    return `${address.substring(0, length)}...`;
}

class Options extends Component<OptionsProps, OptionsState> {
    constructor(props: OptionsProps) {
        super(props);
        this.state = {
            showDialog: false,
            dialogLevel: 0,
            iotLogin: '',
            iotPassword: '',
            iotInstance: '',
        };
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

    onHostChange = (id: string, hostObj: ioBroker.Object | null | undefined): void => {
        if (hostObj?.type === 'host') {
            this.parseNetworkInterfaces(hostObj as ioBroker.HostObject);
        }
    };

    async componentDidMount(): Promise<void> {
        // detect if any iot or cloud with pro-account are available
        const instancesIot = await this.props.socket.getAdapterInstances('iot');
        let instance: ioBroker.InstanceObject | null = null;
        if (instancesIot) {
            instance = instancesIot.find(it => it?.native?.login && it?.native?.pass) || null;
            if (instance) {
                // encode
                const pass = await this.props.socket.decrypt(instance.native.pass);

                this.setState({
                    iotInstance: instance._id,
                    iotPassword: pass,
                    iotLogin: instance.native.login,
                });
            }
        }
        if (!instance) {
            const instancesCloud = await this.props.socket.getAdapterInstances('cloud');
            instance = instancesCloud.find(it => it?.native?.login && it?.native?.pass) || null;
            if (instance) {
                // encode
                const pass = await this.props.socket.decrypt(instance.native.pass);

                this.setState({
                    iotInstance: instance._id,
                    iotPassword: pass,
                    iotLogin: instance.native.login,
                });
            }
        }

        try {
            const host = await this.props.socket.getObject(`system.host.${this.props.common.host}`);
            this.parseNetworkInterfaces(host);
        } catch (e) {
            window.alert(`Cannot read interfaces: ${e}`);
        }

        await this.props.socket.subscribeObject(`system.host.${this.props.common.host}`, this.onHostChange);
    }

    async componentWillUnmount(): Promise<void> {
        await this.props.socket.unsubscribeObject(`system.host.${this.props.common.host}`, this.onHostChange);
    }

    parseNetworkInterfaces(hostObj: ioBroker.HostObject | null | undefined): void {
        const interfaces: { value: string; address?: string; address6?: string }[] = [
            { value: '_', address: I18n.t('All interfaces') },
        ];
        if (hostObj?.native?.hardware?.networkInterfaces) {
            const list: Record<string, NetworkInterface[]> = hostObj.native.hardware.networkInterfaces as Record<
                string,
                NetworkInterface[]
            >;
            Object.keys(list).forEach(inter => {
                if (!list[inter].find(_ip => !_ip.internal)) {
                    return;
                }

                // find ipv4 address
                const ip4 = list[inter].find(_ip => _ip.family === 'IPv4');
                const ip6 = list[inter].find(_ip => _ip.family === 'IPv6');
                interfaces.push({ value: inter, address: ip4?.address || '', address6: ip6?.address });
            });
        }

        this.setState({ interfaces });
    }

    static checkPassword(pass: string): string | false {
        pass = (pass || '').toString();
        if (pass.length < 8 || !pass.match(/[a-z]/) || !pass.match(/[A-Z]/) || !pass.match(/\d/)) {
            return I18n.t('invalid_password_warning');
        }
        return false;
    }

    render(): React.JSX.Element {
        const item = this.state.interfaces?.find(it => it.value === (this.props.native.interface || '_'));
        const passwordError = Options.checkPassword(this.props.native.pass);

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
                <Logo
                    instance={this.props.instance}
                    common={this.props.common}
                    native={this.props.native}
                    onError={text => this.props.showToast(text)}
                    onLoad={this.props.onLoad}
                />
                <Typography sx={styles.header}>{I18n.t('Network configuration')}</Typography>
                <InfoBox type="info">
                    {I18n.t(
                        'If your device has more then one active network interface and you have issues try limiting it to one interface',
                    )}
                </InfoBox>

                {!this.state.interfaces?.length ? (
                    <TextField
                        style={styles.inputLong}
                        variant="standard"
                        value={this.props.native.interface}
                        onChange={e => this.props.onChange('interface', e.target.value === '_' ? '' : e.target.value)}
                        label={I18n.t('Limit network traffic to the selected interfaces')}
                    />
                ) : (
                    <FormControl style={styles.inputLong}>
                        <InputLabel>{I18n.t('Interface')}</InputLabel>
                        <Select
                            variant="standard"
                            style={styles.inputLong}
                            value={this.props.native.interface || '_'}
                            renderValue={val => {
                                if (!item) {
                                    return val;
                                }

                                return (
                                    <span
                                        style={{
                                            fontWeight: item.value === '_' ? 'bold' : undefined,
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            width: '100%',
                                        }}
                                    >
                                        {item.value === '_' ? I18n.t('All interfaces') : item.value}
                                        {item.value === '_' ? null : (
                                            <span
                                                style={styles.address}
                                            >{`${item.address || item.address6}${!item.address6 ? ` / ${I18n.t('no IPv6')}` : item.address ? ` / ${cutIpV6(item.address6)}` : ''}`}</span>
                                        )}{' '}
                                    </span>
                                );
                            }}
                            onChange={e =>
                                this.props.onChange('interface', e.target.value === '_' ? '' : e.target.value)
                            }
                        >
                            {this.state.interfaces.map((it, i) => (
                                <MenuItem
                                    key={i}
                                    disabled={!it.address6 && it.value !== '_'}
                                    value={it.value}
                                >
                                    <span
                                        style={{
                                            fontWeight: it.value === '_' ? 'bold' : undefined,
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            width: '100%',
                                        }}
                                    >
                                        {it.value === '_' ? I18n.t('All interfaces') : it.value}
                                        {it.value === '_' ? null : (
                                            <span
                                                style={styles.address}
                                            >{`${it.address || it.address6}${!it.address6 ? ` / ${I18n.t('no IPv6')}` : it.address ? ` / ${cutIpV6(it.address6)}` : ''}`}</span>
                                        )}
                                    </span>
                                </MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                )}

                <Box sx={{ marginTop: 2 }}>
                    <InfoBox type="info">{I18n.t('Info about Alexa Bridge')}</InfoBox>
                    <FormControl style={styles.inputLong}>
                        <InputLabel>{I18n.t('Default bridge (Alexa-compatible)')}</InputLabel>
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
                                        {it.uuid}
                                        <span style={styles.address}>{it.name}</span>
                                    </span>
                                </MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                </Box>

                <div style={{ marginTop: 50 }}>
                    <Typography sx={styles.header}>{I18n.t('Cloud Account')}</Typography>
                    <InfoBox type="info">
                        {I18n.t(
                            'To use a Matter bridge or device options with more than 5 devices please enter valid ioBroker.pro Cloud credentials with at least an active Assistant license.',
                        )}
                    </InfoBox>
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline' }}>
                    <TextField
                        variant="standard"
                        label={I18n.t('ioBroker.pro Login')}
                        value={this.props.native.login}
                        type="text"
                        onChange={e => this.props.onChange('login', e.target.value)}
                        margin="normal"
                        slotProps={{
                            htmlInput: {
                                autocomplete: 'new-password',
                            },
                            input: {
                                endAdornment: this.props.native.login ? (
                                    <IconButton
                                        size="small"
                                        onClick={() => this.props.onChange('login', '')}
                                    >
                                        <Clear />
                                    </IconButton>
                                ) : null,
                            },
                        }}
                        style={{ ...styles.input, marginRight: 16 }}
                    />
                    <TextField
                        variant="standard"
                        label={I18n.t('ioBroker.pro Password')}
                        error={!!passwordError}
                        autoComplete="current-password"
                        style={styles.input}
                        slotProps={{
                            htmlInput: {
                                autocomplete: 'new-password',
                            },
                            input: {
                                endAdornment: this.props.native.pass ? (
                                    <IconButton
                                        size="small"
                                        onClick={() => this.setState({ passVisible: !this.state.passVisible })}
                                    >
                                        {this.state.passVisible ? <VisibilityOff /> : <Visibility />}
                                    </IconButton>
                                ) : null,
                            },
                        }}
                        value={this.props.native.pass}
                        type={this.state.passVisible ? 'text' : 'password'}
                        helperText={passwordError || ''}
                        onChange={e => this.props.onChange('pass', e.target.value)}
                        margin="normal"
                    />
                    {this.state.iotInstance &&
                    (this.state.iotPassword !== this.props.native.pass ||
                        this.state.iotLogin !== this.props.native.login) ? (
                        <Button
                            style={{ marginLeft: 16 }}
                            variant="contained"
                            color="primary"
                            onClick={async () => {
                                await this.props.onChange('login', this.state.iotLogin);
                                await this.props.onChange('pass', this.state.iotPassword);
                            }}
                        >
                            {I18n.t('Sync credentials with %s', this.state.iotInstance.replace('system.adapter.', ''))}
                        </Button>
                    ) : null}
                </div>

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
