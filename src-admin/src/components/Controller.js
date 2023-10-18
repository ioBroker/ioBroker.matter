import React from 'react';
import PropTypes from 'prop-types';
import { withStyles } from '@mui/styles';

import {
    FormControl,
    InputLabel,
    MenuItem,
    Select,
    Switch, TextField,
} from '@mui/material';

import { I18n } from '@iobroker/adapter-react-v5';

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
        gap: 8,
    },
    input: {
        width: '100%',
        maxWidth: 300,
    },
});

class Controller extends React.Component {
    constructor(props) {
        super(props);
        this.state = {};
    }

    async componentDidMount() {
        try {
            const config = await this.props.socket.getObject(`system.adapter.matter.${this.props.instance}`);
            const host = await this.props.socket.getObject(`system.host.${config.common.host}`);
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

    render() {
        const item = this.state.interfaces?.find(it => it.value === (this.props.native.interface || '_'));

        return <div className={this.props.classes.panel}>
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
            <div>
                {I18n.t('Off')}
                <Switch
                    checked={this.props.matter.controller.enabled}
                    onChange={e => {
                        const matter = JSON.parse(JSON.stringify(this.props.matter));
                        matter.controller.enabled = e.target.checked;
                        this.props.updateConfig(matter);
                    }}
                />
                {I18n.t('On')}
            </div>
        </div>;
    }
}

Controller.propTypes = {
    native: PropTypes.object,
    matter: PropTypes.object,
    updateConfig: PropTypes.func,
    instance: PropTypes.number,
    onChange: PropTypes.func,
};

export default withStyles(styles)(Controller);
