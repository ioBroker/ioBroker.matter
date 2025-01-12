import React from 'react';

import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Link } from '@mui/material';
import { Close } from '@mui/icons-material';
import { FaApple, FaAndroid } from 'react-icons/fa';

import { type AdminConnection, I18n, type ThemeType, DialogMessage } from '@iobroker/adapter-react-v5';

import InfoBox from './InfoBox';
import NetworkSelector, { type NetworkInterface } from './NetworkSelector';
import LoginPassword from './LoginPassword';
import type { MatterAdapterConfig } from '../types';

type Platform =
    | 'aix'
    | 'android'
    | 'darwin'
    | 'freebsd'
    | 'haiku'
    | 'linux'
    | 'openbsd'
    | 'sunos'
    | 'win32'
    | 'cygwin'
    | 'netbsd';

type DockerInformation =
    | {
          /** If it is a Docker installation */
          isDocker: boolean;
          /** If it is the official Docker image */
          isOfficial: true;
          /** Semver string for official Docker image */
          officialVersion: string;
      }
    | {
          /** If it is a Docker installation */
          isDocker: boolean;
          /** If it is the official Docker image */
          isOfficial: false;
      };

type HostInfo = {
    /** Converted OS for human readability */
    Platform: Platform | 'docker' | 'Windows' | 'OSX';
    /** The underlying OS */
    os: Platform;
    /** Information about the docker installation */
    dockerInformation?: DockerInformation;
    /** Host architecture */
    Architecture: string;
    /** Number of CPUs */
    CPUs: number | null;
    /** CPU speed */
    Speed: number | null;
    /** CPU model */
    Model: string | null;
    /** Total RAM of host */
    RAM: number;
    /** System uptime in seconds */
    'System uptime': number;
    /** Node.JS version */
    'Node.js': string;
    /** Current time to compare to local time */
    time: number;
    /** Timezone offset to compare to local time */
    timeOffset: number;
    /** Number of available adapters */
    'adapters count': number;
    /** NPM version */
    NPM: string;
};

interface WelcomeDialogProps {
    onClose: (navigateTo?: 'controller' | 'bridges', updateRepeat?: boolean) => void;
    socket: AdminConnection;
    instance: number;
    themeType: ThemeType;
    host: string;
    native: MatterAdapterConfig;
    changed: boolean;
    onChange: (attr: string, value: string) => Promise<void>;
}

interface WelcomeDialogState {
    docker: boolean;
    networkInterfaces: Record<string, NetworkInterface[]> | null;
    showNetwork: boolean;
    originalData: {
        login: string;
        password: string;
        networkInterface: string;
    };
    credentialsError: boolean;
    showSaveDialog: 'close' | 'controller' | 'bridges' | '';
}

class WelcomeDialog extends React.Component<WelcomeDialogProps, WelcomeDialogState> {
    private readonly showLogin: boolean;

    constructor(props: WelcomeDialogProps) {
        super(props);
        this.showLogin = !this.props.native.login || !this.props.native.pass;

        this.state = {
            docker: false,
            networkInterfaces: {},
            showNetwork: false,
            credentialsError: false,
            originalData: {
                login: this.props.native.login,
                password: this.props.native.pass,
                networkInterface: this.props.native.interface,
            },
            showSaveDialog: '',
        };
    }

    checkIps(
        networkInterfaces?: Record<string, NetworkInterface[]> | null,
        networkInterface?: string,
    ): {
        ipV6found: boolean;
        selectedIpV6found: boolean;
    } {
        networkInterfaces = networkInterfaces || this.state.networkInterfaces;
        networkInterface = networkInterface === undefined ? this.props.native.interface : networkInterface;
        const result = { selectedIpV6found: false, ipV6found: false };
        // Try to find IPv6 address
        if (networkInterfaces) {
            const list: Record<string, NetworkInterface[]> = networkInterfaces;

            if (networkInterface && list[networkInterface]) {
                result.selectedIpV6found = !!list[networkInterface].find(_ip => _ip.family === 'IPv6');
            }

            Object.keys(list).forEach(inter => {
                // ignore internal interfaces
                if (list[inter].find(_ip => _ip.internal)) {
                    return;
                }

                // find ipv4 address
                result.ipV6found = result.ipV6found || !!list[inter].find(_ip => _ip.family === 'IPv6');
            });
        }

        return result;
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

        try {
            const hostObj: ioBroker.HostObject | null | undefined = this.props.host
                ? await this.props.socket.getObject(`system.host.${this.props.host}`)
                : null;
            if (hostObj) {
                const verify = this.checkIps(
                    hostObj.native.hardware.networkInterfaces as Record<string, NetworkInterface[]>,
                );

                this.setState({
                    showNetwork: verify.ipV6found && !verify.selectedIpV6found,
                    networkInterfaces: hostObj.native.hardware.networkInterfaces as Record<string, NetworkInterface[]>,
                });
            }
        } catch (e) {
            window.alert(`Cannot read interfaces: ${e}`);
        }

        if (this.props.host) {
            const hostData: HostInfo & { 'Active instances': number; location: string; Uptime: number } =
                await this.props.socket.getHostInfo(this.props.host, false, 10000).catch((e: unknown): void => {
                    window.alert(`Cannot getHostInfo for "${this.props.host}": ${e as Error}`);
                });

            if (hostData) {
                this.setState({ docker: !!hostData.dockerInformation?.isDocker });
            }
        }
    }

    renderSaveDialog(): React.JSX.Element | null {
        if (!this.state.showSaveDialog) {
            return null;
        }
        return (
            <DialogMessage
                text={I18n.t('Do not forget to save changed settings')}
                onClose={() => {
                    const navigate: 'close' | 'bridges' | 'controller' | '' = this.state.showSaveDialog;
                    this.setState({ showSaveDialog: '' }, () => {
                        this.props.onClose(
                            !navigate || navigate === 'close' ? undefined : navigate,
                            this.state.originalData.login !== this.props.native.login ||
                                this.state.originalData.password !== this.props.native.pass,
                        );
                    });
                }}
            />
        );
    }

    render(): React.JSX.Element {
        let ip6text: React.JSX.Element | undefined;
        const validate = this.checkIps();

        if (validate.ipV6found !== null) {
            if (this.props.native.interface && !this.state.showNetwork && validate.selectedIpV6found) {
                ip6text = (
                    <InfoBox type="ok">
                        {`${I18n.t('Matter requires enabled IPv6 protocol on selected interface.')} ${I18n.t(
                            'Some IPv6 was found on your system.',
                        )}`}
                    </InfoBox>
                );
            } else if (validate.ipV6found && (this.state.showNetwork || this.props.native.interface)) {
                ip6text = (
                    <>
                        <InfoBox
                            type={!this.props.native.interface || validate.selectedIpV6found ? 'ok' : 'warning'}
                            style={{
                                color: this.props.themeType === 'dark' ? '#ff9c2c' : '#9f5000',
                            }}
                        >
                            {`${I18n.t('Matter requires enabled IPv6 protocol on selected interface.')} ${I18n.t(
                                'Some IPv6 was found on your system. But your currently selected interface does not support it. Please select another one below:',
                            )}`}
                        </InfoBox>
                        <NetworkSelector
                            interface={this.props.native.interface}
                            onChange={newInterface => this.props.onChange('interface', newInterface)}
                            socket={this.props.socket}
                            host={this.props.host}
                        />
                    </>
                );
            } else if (validate.ipV6found) {
                ip6text = (
                    <InfoBox type="ok">
                        {`${I18n.t('Matter requires enabled IPv6 protocol on selected interface.')} ${I18n.t(
                            'Some IPv6 was found on your system.',
                        )}`}
                    </InfoBox>
                );
            } else {
                ip6text = (
                    <InfoBox
                        type="error"
                        style={{
                            color: this.props.themeType === 'dark' ? '#b31010' : '#9f0000',
                        }}
                    >
                        {`${I18n.t('Matter requires enabled IPv6 protocol on selected interface.')} ${I18n.t(
                            'No IPv6 was found on your system!',
                        )}`}
                    </InfoBox>
                );
            }
        }

        return (
            <Dialog
                open={!0}
                maxWidth="lg"
                onClose={() => {
                    this.props.onClose(
                        undefined,
                        this.props.native.pass !== this.state.originalData.password ||
                            this.props.native.login !== this.state.originalData.login,
                    );
                }}
            >
                {this.renderSaveDialog()}
                <DialogTitle>{I18n.t('Welcome to Matter!')}</DialogTitle>
                <DialogContent>
                    <div style={{ width: '100%', marginBottom: 8 }}>{I18n.t('Welcome explanation')}</div>
                    <div style={{ width: '100%', marginBottom: 16 }}>
                        {I18n.t('To make all this work, the following requirements should be considered')}:
                    </div>
                    {ip6text || null}
                    {this.state.docker ? (
                        <InfoBox type="info">
                            {I18n.t('Docker information')}
                            <div>
                                <Link
                                    href="https://github.com/ioBroker/ioBroker.matter/wiki/Troubleshooting"
                                    target="_blank"
                                    rel="noreferrer"
                                >
                                    {I18n.t('More details in the Troubleshooting Guide')}
                                </Link>
                            </div>
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
                                    `https://apps.apple.com/${I18n.getLanguage()}/app/iobroker-visu/id1673095774`,
                                    '_blank',
                                )
                            }
                            startIcon={<FaApple />}
                        >
                            iPhone
                        </Button>
                    </InfoBox>
                    <InfoBox type="info">
                        {I18n.t('Read for problems')}
                        <div>
                            <Link
                                href="https://github.com/ioBroker/ioBroker.matter/wiki/Troubleshooting"
                                target="_blank"
                                rel="noreferrer"
                            >
                                {I18n.t('More details in the Troubleshooting Guide')}
                            </Link>
                        </div>
                    </InfoBox>
                    {this.showLogin ? (
                        <LoginPassword
                            native={this.props.native}
                            onChange={(id: string, value: string): Promise<void> => this.props.onChange(id, value)}
                            onError={(error: string) => {
                                if (this.state.credentialsError !== !!error) {
                                    this.setState({ credentialsError: !!error });
                                }
                            }}
                            socket={this.props.socket}
                            updatePassTrigger={1}
                        />
                    ) : null}
                </DialogContent>
                <DialogActions>
                    <Button
                        variant="contained"
                        disabled={this.state.credentialsError}
                        onClick={() => {
                            if (this.props.changed) {
                                this.setState({ showSaveDialog: 'controller' });
                            } else {
                                this.props.onClose(
                                    'controller',
                                    this.state.originalData.login !== this.props.native.login ||
                                        this.state.originalData.password !== this.props.native.pass,
                                );
                            }
                        }}
                    >
                        {I18n.t('Connect Matter devices with ioBroker')}
                    </Button>
                    <Button
                        variant="contained"
                        disabled={this.state.credentialsError}
                        onClick={() => {
                            if (this.props.changed) {
                                this.setState({ showSaveDialog: 'bridges' });
                            } else {
                                this.props.onClose(
                                    'bridges',
                                    this.state.originalData.login !== this.props.native.login ||
                                        this.state.originalData.password !== this.props.native.pass,
                                );
                            }
                        }}
                    >
                        {I18n.t('Expose ioBroker devices as Matter bridge')}
                    </Button>
                    <Button
                        variant="contained"
                        color="grey"
                        disabled={this.state.credentialsError}
                        onClick={() => {
                            if (this.props.changed) {
                                this.setState({ showSaveDialog: 'close' });
                            } else {
                                this.props.onClose(
                                    undefined,
                                    this.state.originalData.login !== this.props.native.login ||
                                        this.state.originalData.password !== this.props.native.pass,
                                );
                            }
                        }}
                        startIcon={<Close />}
                    >
                        {I18n.t('Close')}
                    </Button>
                </DialogActions>
            </Dialog>
        );
    }
}

export default WelcomeDialog;
