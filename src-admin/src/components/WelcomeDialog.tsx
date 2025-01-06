import React from 'react';

import { Button, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, TextField } from '@mui/material';
import { Check, Clear, Close } from '@mui/icons-material';
import { FaApple, FaAndroid } from 'react-icons/fa';

import { type AdminConnection, I18n, DialogConfirm } from '@iobroker/adapter-react-v5';

import InfoBox from './InfoBox';

interface NetworkInterface {
    address: string;
    netmask: string;
    family: string;
    mac: string;
    internal: boolean;
    cidr: string;
}

interface WelcomeDialogProps {
    login?: string;
    pass?: string;
    onClose: (login?: string, password?: string, navigateTo?: 'controller' | 'bridges') => void;
    socket: AdminConnection;
    instance: number;
    common: ioBroker.InstanceCommon | null;
}

interface WelcomeDialogState {
    login?: string;
    password?: string;
    passwordRepeat?: string;
    passVisible?: boolean;
    iotInstance?: string;
    iotLogin?: string;
    iotPassword?: string;
    ipV6found: boolean | null;
    notSavedConfirm: '' | 'close' | 'bridges' | 'controller';
}

class WelcomeDialog extends React.Component<WelcomeDialogProps, WelcomeDialogState> {
    private readonly showLogin: boolean;

    constructor(props: WelcomeDialogProps) {
        super(props);
        this.showLogin = !this.props.login || !this.props.pass;

        this.state = {
            login: this.props.login || '',
            password: this.props.pass || '',
            passwordRepeat: this.props.pass || '',
            ipV6found: null,
            notSavedConfirm: '',
        };
    }

    async componentDidMount(): Promise<void> {
        let obj: ioBroker.StateObject | null | undefined = null;
        try {
            obj = (await this.props.socket.getObject(
                `matter.${this.props.instance}.info.welcomeDialog`,
            )) as ioBroker.StateObject;
        } catch {
            // ignore
        }
        if (!obj) {
            await this.props.socket.setObject(`matter.${this.props.instance}.info.welcomeDialog`, {
                type: 'state',
                common: {
                    name: 'Welcome dialog',
                    type: 'boolean',
                    role: 'indicator',
                    expert: true,
                    read: true,
                    write: true,
                },
                native: {},
            });
        }

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
            const hostObj: ioBroker.HostObject | null | undefined =
                this.props.common && (await this.props.socket.getObject(`system.host.${this.props.common.host}`));
            let ipV6found = false;
            // Try to find IPv6 address
            if (hostObj?.native?.hardware?.networkInterfaces) {
                const list: Record<string, NetworkInterface[]> = hostObj.native.hardware.networkInterfaces as Record<
                    string,
                    NetworkInterface[]
                >;
                Object.keys(list).forEach(inter => {
                    // ignore internal interfaces
                    if (list[inter].find(_ip => _ip.internal)) {
                        return;
                    }

                    // find ipv4 address
                    ipV6found = ipV6found || !!list[inter].find(_ip => _ip.family === 'IPv6');
                });
            }
            this.setState({ ipV6found });
        } catch (e) {
            window.alert(`Cannot read interfaces: ${e}`);
        }
    }

    renderConfirmDialog(): React.JSX.Element | null {
        if (!this.state.notSavedConfirm) {
            return null;
        }

        return (
            <DialogConfirm
                title={I18n.t('Please confirm')}
                text={I18n.t('Login and password will not be taken as incomplete. Discard changes?')}
                ok={I18n.t('Yes')}
                cancel={I18n.t('Stay here')}
                onClose={(result: boolean) => {
                    if (result) {
                        const navigateTo = this.state.notSavedConfirm;
                        this.setState(
                            {
                                notSavedConfirm: '',
                            },
                            () => {
                                if (!navigateTo || navigateTo === 'close') {
                                    this.props.onClose();
                                } else {
                                    this.props.onClose(undefined, undefined, navigateTo);
                                }
                            },
                        );
                    } else {
                        this.setState({ notSavedConfirm: '' });
                    }
                }}
            />
        );
    }

    render(): React.JSX.Element {
        return (
            <Dialog
                open={!0}
                maxWidth="lg"
                onClose={() => {
                    if (
                        !!this.state.login &&
                        (!this.state.password || this.state.password !== this.state.passwordRepeat)
                    ) {
                        this.setState({ notSavedConfirm: 'close' });
                    } else {
                        this.props.onClose();
                    }
                }}
            >
                {this.renderConfirmDialog()}
                <DialogTitle>{I18n.t('Welcome to Matter!')}</DialogTitle>
                <DialogContent>
                    {this.state.ipV6found !== null ? (
                        <InfoBox type={this.state.ipV6found ? 'info' : 'error'}>
                            {this.state.ipV6found
                                ? I18n.t(
                                      'Matter requires enabled IPv6 protocol on selected interface. Some IPv6 was found on your system.',
                                  )
                                : I18n.t(
                                      'Matter requires enabled IPv6 protocol on selected interface. No IPv6 was found on your system!',
                                  )}
                        </InfoBox>
                    ) : null}
                    <InfoBox type="info">{I18n.t('Be sure, that UDP is enabled and working')}</InfoBox>
                    <InfoBox type="info">
                        <span style={{ marginRight: 8 }}>
                            {I18n.t(
                                'To commission/connect matter devices with ioBroker controller use better ioBroker.visu app:',
                            )}
                        </span>
                        <br />
                        <Button
                            style={{ marginRight: 8 }}
                            variant="outlined"
                            startIcon={<FaAndroid />}
                            onClick={() =>
                                window.open(
                                    `https://play.google.com/store/apps/details?id=com.iobroker.visu&hl=${I18n.getLanguage()}`,
                                    '_blank',
                                )
                            }
                        >
                            Android
                        </Button>
                        <Button
                            variant="outlined"
                            onClick={() =>
                                window.open(
                                    `https://apps.apple.com/${I18n.getLanguage()}/app/iobroker/id1449564305`,
                                    '_blank',
                                )
                            }
                            startIcon={<FaApple />}
                        >
                            iPhone
                        </Button>
                    </InfoBox>
                    {this.showLogin ? (
                        <TextField
                            style={{ marginBottom: 8, marginTop: 8 }}
                            variant="standard"
                            label={I18n.t('ioBroker.pro Login')}
                            value={this.state.login}
                            onChange={e => this.setState({ login: e.target.value })}
                            fullWidth
                            slotProps={{
                                htmlInput: {
                                    autocomplete: 'new-password',
                                },
                                input: {
                                    endAdornment: this.state.login ? (
                                        <IconButton
                                            tabIndex={-1}
                                            size="small"
                                            onClick={() => this.setState({ login: '' })}
                                        >
                                            <Clear />
                                        </IconButton>
                                    ) : null,
                                },
                            }}
                        />
                    ) : null}
                    {this.showLogin ? (
                        <TextField
                            style={{ marginBottom: 8 }}
                            variant="standard"
                            type={this.state.passVisible ? 'text' : 'password'}
                            label={I18n.t('ioBroker.pro Password')}
                            value={this.state.password}
                            onChange={e => this.setState({ password: e.target.value })}
                            slotProps={{
                                htmlInput: {
                                    autocomplete: 'new-password',
                                },
                                input: {
                                    endAdornment: this.state.password ? (
                                        <IconButton
                                            tabIndex={-1}
                                            size="small"
                                            onClick={() => this.setState({ password: '' })}
                                        >
                                            <Clear />
                                        </IconButton>
                                    ) : null,
                                },
                            }}
                            sx={theme => ({
                                [theme.breakpoints.down('md')]: { width: '100%' },
                                [theme.breakpoints.up('md')]: { width: 'calc(50% - 8px)', marginRight: 1 },
                                [theme.breakpoints.up('lg')]: { width: 'calc(30% - 8px)', marginRight: 1 },
                            })}
                        />
                    ) : null}
                    {this.showLogin ? (
                        <TextField
                            style={{ marginBottom: 16 }}
                            variant="standard"
                            type={this.state.passVisible ? 'text' : 'password'}
                            label={I18n.t('Password repeat')}
                            value={this.state.passwordRepeat}
                            error={!!this.state.password && this.state.password !== this.state.passwordRepeat}
                            onChange={e => this.setState({ passwordRepeat: e.target.value })}
                            sx={theme => ({
                                [theme.breakpoints.up('lg')]: { width: 'calc(30% - 8px)', marginRight: 1 },
                                [theme.breakpoints.down('md')]: { width: '100%' },
                                [theme.breakpoints.up('md')]: { width: 'calc(50% - 8px)', marginRight: 1 },
                            })}
                            slotProps={{
                                input: {
                                    endAdornment: this.state.passwordRepeat ? (
                                        <IconButton
                                            tabIndex={-1}
                                            size="small"
                                            onClick={() => this.setState({ passwordRepeat: '' })}
                                        >
                                            <Clear />
                                        </IconButton>
                                    ) : null,
                                },
                                htmlInput: {
                                    autocomplete: 'new-password',
                                },
                            }}
                        />
                    ) : null}
                    {this.state.iotInstance && this.showLogin ? (
                        <Button
                            variant="contained"
                            color="primary"
                            onClick={() => {
                                this.setState({
                                    login: this.state.iotLogin,
                                    password: this.state.iotPassword,
                                    passwordRepeat: this.state.iotPassword,
                                });
                            }}
                        >
                            {I18n.t('Sync credentials with %s', this.state.iotInstance.replace('system.adapter.', ''))}
                        </Button>
                    ) : null}
                </DialogContent>
                <DialogActions>
                    <Button
                        variant="contained"
                        onClick={() => {
                            if (
                                !!this.state.login &&
                                (!this.state.password || this.state.password !== this.state.passwordRepeat)
                            ) {
                                this.setState({ notSavedConfirm: 'bridges' });
                            } else {
                                this.props.onClose(this.state.login, this.state.password, 'bridges');
                            }
                        }}
                    >
                        {I18n.t('Connect Matter devices with ioBroker')}
                    </Button>
                    <Button
                        variant="contained"
                        onClick={() => {
                            if (
                                !!this.state.login &&
                                (!this.state.password || this.state.password !== this.state.passwordRepeat)
                            ) {
                                this.setState({ notSavedConfirm: 'controller' });
                            } else {
                                this.props.onClose(this.state.login, this.state.password, 'controller');
                            }
                        }}
                    >
                        {I18n.t('Expose ioBroker devices as Matter bridge')}
                    </Button>
                    <Button
                        variant="contained"
                        color="grey"
                        onClick={() => {
                            if (
                                !!this.state.login &&
                                (!this.state.password || this.state.password !== this.state.passwordRepeat)
                            ) {
                                this.setState({ notSavedConfirm: 'close' });
                            } else {
                                this.props.onClose();
                            }
                        }}
                        startIcon={
                            this.state.login &&
                            this.state.password &&
                            this.state.password === this.state.passwordRepeat ? (
                                <Check />
                            ) : (
                                <Close />
                            )
                        }
                    >
                        {this.state.login && this.state.password && this.state.password === this.state.passwordRepeat
                            ? I18n.t('Apply')
                            : I18n.t('Close')}
                    </Button>
                </DialogActions>
            </Dialog>
        );
    }
}

export default WelcomeDialog;
