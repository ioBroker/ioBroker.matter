import React, { Component } from 'react';

import { Button, IconButton, TextField } from '@mui/material';
import { Clear } from '@mui/icons-material';

import { type AdminConnection, I18n } from '@iobroker/adapter-react-v5';

import type { MatterAdapterConfig } from '../types';

const styles: Record<string, React.CSSProperties> = {
    input: {
        marginTop: 2,
        marginBottom: 1,
        width: '100%',
        maxWidth: 250,
    },
};

interface LoginPasswordProps {
    native: MatterAdapterConfig;
    onChange: (attr: string, value: string) => Promise<void>;
    onError: (errorText: string) => void;
    socket: AdminConnection;
}

interface LoginPasswordState {
    iotLogin: string;
    iotPassword: string;
    iotInstance: string;
}

export default class LoginPassword extends Component<LoginPasswordProps, LoginPasswordState> {
    constructor(props: LoginPasswordProps) {
        super(props);
        this.state = {
            iotLogin: '',
            iotPassword: '',
            iotInstance: '',
        };
    }

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
    }

    static checkPassword(pass: string): string | false {
        pass = (pass || '').toString();
        if (pass.length < 8 || !pass.match(/[a-z]/) || !pass.match(/[A-Z]/) || !pass.match(/\d/)) {
            return I18n.t('invalid_password_warning');
        }
        return false;
    }

    render(): React.JSX.Element {
        const passwordError = LoginPassword.checkPassword(this.props.native.pass);

        return (
            <div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
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
                        style={styles.input}
                    />
                    <TextField
                        variant="standard"
                        label={I18n.t('ioBroker.pro Password')}
                        error={!!passwordError}
                        style={styles.input}
                        autoComplete="current-password"
                        slotProps={{
                            htmlInput: {
                                autocomplete: 'new-password',
                            },
                            input: {
                                endAdornment: this.props.native.pass ? (
                                    <IconButton
                                        size="small"
                                        onClick={() => {
                                            void this.props.onChange('pass', '');
                                        }}
                                    >
                                        <Clear />
                                    </IconButton>
                                ) : null,
                            },
                        }}
                        value={this.props.native.pass}
                        type="password"
                        helperText={passwordError || ''}
                        onChange={e => {
                            void this.props.onChange('pass', e.target.value);
                        }}
                        margin="normal"
                    />
                </div>
                <div style={{ marginTop: 8 }}>
                    {this.state.iotInstance &&
                    (this.state.iotPassword !== this.props.native.pass ||
                        this.state.iotLogin !== this.props.native.login) ? (
                        <Button
                            variant="contained"
                            color="primary"
                            onClick={async (): Promise<void> => {
                                if (this.state.iotLogin !== this.props.native.login) {
                                    await this.props.onChange('login', this.state.iotLogin);
                                }
                                if (this.state.iotPassword !== this.props.native.pass) {
                                    await this.props.onChange('pass', this.state.iotPassword);
                                }

                                this.props.onError('');
                            }}
                        >
                            {I18n.t('Sync credentials with %s', this.state.iotInstance.replace('system.adapter.', ''))}
                        </Button>
                    ) : null}
                </div>
            </div>
        );
    }
}
