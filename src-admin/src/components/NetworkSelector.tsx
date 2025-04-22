import React, { Component } from 'react';
import { FormControl, InputLabel, MenuItem, Select, TextField } from '@mui/material';
import { type AdminConnection, I18n } from '@iobroker/adapter-react-v5';

export interface NetworkInterface {
    address: string;
    netmask: string;
    family: string;
    mac: string;
    internal: boolean;
    cidr: string;
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

const styles: Record<string, React.CSSProperties> = {
    address: {
        fontSize: 'smaller',
        opacity: 0.5,
        marginLeft: 8,
    },
    inputLong: {
        marginTop: 2,
        marginBottom: 1,
        width: '100%',
        maxWidth: 500,
    },
};

interface NetworkSelectorProps {
    interface: string;
    onChange: (newInterface: string) => void;
    socket: AdminConnection;
    host: string;
}

interface NetworkSelectorState {
    interfaces?: { value: string; address?: string; address6?: string }[];
}

export default class NetworkSelector extends Component<NetworkSelectorProps, NetworkSelectorState> {
    constructor(props: NetworkSelectorProps) {
        super(props);
        this.state = {
            interfaces: [],
        };
    }

    async componentDidMount(): Promise<void> {
        try {
            const host = await this.props.socket.getObject(`system.host.${this.props.host}`);
            this.parseNetworkInterfaces(host);
        } catch (e) {
            window.alert(`Cannot read interfaces: ${e}`);
        }

        await this.props.socket.subscribeObject(`system.host.${this.props.host}`, this.onHostChange);
    }

    async componentWillUnmount(): Promise<void> {
        await this.props.socket.unsubscribeObject(`system.host.${this.props.host}`, this.onHostChange);
    }

    onHostChange = (_id: string, hostObj: ioBroker.Object | null | undefined): void => {
        if (hostObj?.type === 'host') {
            this.parseNetworkInterfaces(hostObj as ioBroker.HostObject);
        }
    };

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

    render(): React.JSX.Element {
        const item = this.state.interfaces?.find(it => it.value === (this.props.interface || '_'));

        return !this.state.interfaces?.length ? (
            <TextField
                style={styles.inputLong}
                variant="standard"
                value={this.props.interface}
                onChange={e => this.props.onChange(e.target.value === '_' ? '' : e.target.value)}
                label={I18n.t('Limit network traffic to the selected interfaces')}
            />
        ) : (
            <FormControl style={styles.inputLong}>
                <InputLabel
                    sx={{
                        '&.MuiFormLabel-root': {
                            transform: 'translate(0px, -9px) scale(0.75)',
                        },
                    }}
                >
                    {I18n.t('Interface')}
                </InputLabel>
                <Select
                    variant="standard"
                    style={styles.inputLong}
                    value={this.props.interface || '_'}
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
                    onChange={e => this.props.onChange(e.target.value === '_' ? '' : e.target.value)}
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
        );
    }
}
