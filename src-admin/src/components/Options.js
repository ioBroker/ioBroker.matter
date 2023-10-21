import React from 'react';
import PropTypes from 'prop-types';
import { withStyles } from '@mui/styles';

import {
    Button, Dialog,
    DialogActions,
    DialogTitle,
    DialogContent,
    FormControl,
    InputLabel,
    MenuItem,
    Select,
    TextField,
} from '@mui/material';

import {I18n, Logo} from '@iobroker/adapter-react-v5';
import { Check, Close, LayersClear } from '@mui/icons-material';

const styles = () => ({
    address: {
        fontSize: 'smaller',
        opacity: 0.5,
        marginLeft: 8,
    },
    panel: {
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
    },
    input: {
        width: '100%',
        maxWidth: 300,
    },
});

class Options extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            showDialog: false,
            dialogLevel: 0
        };
    }

    renderConfirmDialog() {
        if (!this.state.showDialog) {
            return null;
        }

        return <Dialog
            open={!0}
            onClose={() => this.setState({ showDialog: false })}
            maxWidth="md"
        >
            <DialogTitle>{I18n.t('Please confirm')}</DialogTitle>
            <DialogContent>
                {I18n.t('All state information of matter controller and devices will be deleted. You cannot undo it.')}
                <br />
                {I18n.t('The configuration of controller, bridges and devices will stay unchanged.')}
                <br />
                {this.state.level ? I18n.t('Are you really sure?') :I18n.t('Are you sure?')}
            </DialogContent>
            <DialogActions>
                <Button
                    variant="contained"
                    style={{ backgroundColor: this.state.level === 1 ? 'red' : undefined, color: this.state.level === 1 ? 'white' : undefined }}
                    color="grey"
                    onClick={() => {
                        if (this.state.level === 1) {
                            this.setState({ showDialog: false });
                            // send command to reset all states
                            this.props.socket.sendTo(`matter.${this.props.instance}`, 'reset', { })
                                .then(() => this.props.showToast(I18n.t('Done')))
                                .catch(e => this.props.showToast(`Cannot reset: ${e}`));
                        } else {
                            this.setState({ level: 1 });
                        }
                    }}
                    startIcon={<Check />}
                >
                    {this.state.level === 1 ? I18n.t('Reset it at least to defaults') : I18n.t('Reset to defaults')}
                </Button>
                <Button
                    variant="contained"
                    default
                    color="primary"
                    onClick={() => this.setState({ showDialog: false })}
                    startIcon={<Close />}
                >
                    {I18n.t('Cancel')}
                </Button>
            </DialogActions>
        </Dialog>
    }

    async componentDidMount() {
        try {
            const host = await this.props.socket.getObject(`system.host.${this.props.common.host}`);
            const interfaces = [
                { value: '_', address: I18n.t('All interfaces') },
            ];
            if (host?.native?.hardware?.networkInterfaces) {
                const list = host.native.hardware.networkInterfaces;
                Object.keys(list).forEach(inter => {
                    if (!list[inter].find(_ip => !_ip.internal)) {
                        return;
                    }

                    // find ipv4 address
                    let ip = list[inter].find(_ip => _ip.family === 'IPv4');
                    ip = ip || list[inter].find(_ip => _ip.family === 'IPv6');
                    interfaces.push({ value: inter, address: ip.address });
                });
            }

            this.setState({ interfaces });
        } catch (e) {
            window.alert(`Cannot read interfaces: ${e}`);
        }
    }

    static checkPassword(pass) {
        pass = (pass || '').toString();
        if (pass.length < 8 || !pass.match(/[a-z]/) || !pass.match(/[A-Z]/) || !pass.match(/\d/)) {
            return I18n.t('invalid_password_warning');
        }
        return false;
    }

    render() {
        const item = this.state.interfaces?.find(it => it.value === (this.props.native.interface || '_'));
        const passwordError = Options.checkPassword(this.props.native.password);

        return <div className={this.props.classes.panel}>
            {this.renderConfirmDialog()}
            <Logo
                classes={{ }}
                instance={this.props.instance}
                common={this.props.common}
                native={this.props.native}
                onError={text => this.props.showToast(text)}
                onLoad={this.props.onLoad}
            />
            {!this.state.interfaces?.length ?
                <TextField
                    className={this.props.classes.input}
                    variant="standard"
                    value={this.props.native.interface}
                    onChange={e => this.props.onChange('interface', e.target.value === '_' ? '' : e.target.value)}
                    label={I18n.t('Interface')}
                /> :
                <FormControl className={this.props.classes.input}>
                    <InputLabel>{I18n.t('Interface')}</InputLabel>
                    <Select
                        variant="standard"
                        className={this.props.classes.input}
                        value={this.props.native.interface || '_'}
                        renderValue={val => {
                            if (item) {
                                return <span style={{ fontWeight: item.value === '_' ? 'bold' : undefined }}>
                                    {item.value === '_' ? I18n.t('All interfaces') : item.value}
                                    {item.value === '_' ? null : <span className={this.props.classes.address}>{item.address}</span>}
                                </span>;
                            }
                            return val;
                        }}
                        onChange={e => this.props.onChange('interface', e.target.value === '_' ? '' : e.target.value)}
                    >
                        {this.state.interfaces.map((it, i) => <MenuItem key={i} value={it.value}>
                            <span style={{ fontWeight: it.value === '_' ? 'bold' : undefined }}>
                                {it.value === '_' ? I18n.t('All interfaces') : it.value}
                                {it.value === '_' ? null : <span className={this.props.classes.address}>{it.address}</span>}
                            </span>
                        </MenuItem>)}
                    </Select>
                </FormControl>}

            <div style={{ marginTop: 50 }}>{I18n.t('Only required if you want to use bridge or device options with more than 5 devices')}</div>
            <div style={{ display: 'flex' }}>
                <TextField
                    variant="standard"
                    label={I18n.t('ioBroker.pro Login')}
                    className={this.props.classes.input}
                    value={this.props.native.login}
                    type="text"
                    onChange={e => this.props.onChange('login', e.target.value)}
                    margin="normal"
                    style={{ marginRight: 16 }}
                />
                <TextField
                    variant="standard"
                    label={I18n.t('ioBroker.pro Password')}
                    error={!!passwordError}
                    autoComplete="current-password"
                    className={this.props.classes.input}
                    value={this.props.native.password}
                    type="password"
                    helperText={passwordError || ''}
                    onChange={e => this.props.onChange('password', e.target.value)}
                    margin="normal"
                />
            </div>
            <div style={{ marginTop: 50 }}>
                <Button
                    disabled={!this.props.alive}
                    onClick={() => this.setState({ showDialog: true, level: 0 })}
                    variant="contained"
                    color="grey"
                    startIcon={<LayersClear />}
                >
                    {I18n.t('Reset all matter state information')}
                </Button>
            </div>
        </div>;
    }
}

Options.propTypes = {
    alive: PropTypes.bool,
    socket: PropTypes.object,
    native: PropTypes.object,
    instance: PropTypes.number,
    onChange: PropTypes.func,
    showToast: PropTypes.func,
};

export default withStyles(styles)(Options);
