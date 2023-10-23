import React from 'react';
import PropTypes from 'prop-types';
import { withStyles } from '@mui/styles';
import { v4 as uuidv4 } from 'uuid';

import {
    Button, Checkbox,
    Dialog, DialogActions, DialogContent, DialogTitle,
    Fab, FormControlLabel, IconButton, MenuItem, Switch, Table,
    TableBody,
    TableCell,
    TableRow, TextField,
    Tooltip,
} from '@mui/material';
import {
    Add, Close, Delete, Edit, QuestionMark, Save,
} from '@mui/icons-material';

import { I18n } from '@iobroker/adapter-react-v5';

import DeviceDialog, { DEVICE_ICONS } from '../DeviceDialog';
import { getText } from '../Utils';

const styles = () => ({
    deviceName: {
        marginTop: 4,
        fontSize: 16,
        fontWeight: 'bold',
    },
    deviceTitle: {
        fontStyle: 'italic',
        fontSize: 12,
        // fontWeight: 'bold',
        marginRight: 4,
        opacity: 0.6,
    },
    deviceValue: {
        fontStyle: 'italic',
        fontSize: 12,
        fontWeight: 'normal',
        marginRight: 8,
        opacity: 0.6,
    },
    deviceOid: {
        fontStyle: 'italic',
        fontSize: 10,
        fontWeight: 'normal',
        marginLeft: 8,
        opacity: 0.6,
    },
});

class Devices extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            dialog: null,
            editDialog: null,
            deleteDialog: false,
            suppressDelete: false,
        };
    }

    renderDeleteDialog() {
        if (!this.state.deleteDialog) {
            return null;
        }

        if (this.state.suppressDelete) {
            setTimeout(() => {
                if (this.state.suppressDelete > Date.now()) {
                    const matter = JSON.parse(JSON.stringify(this.props.matter));
                    matter.devices.splice(this.state.deleteDialog.device, 1);
                    this.setState({ deleteDialog: false }, () => this.props.updateConfig(matter));
                } else {
                    this.setState({ suppressDelete: false });
                }
            }, 50);
            return null;
        }

        return <Dialog onClose={() => this.setState({ deleteDialog: false })} open={!0}>
            <DialogTitle>{I18n.t('Delete')}</DialogTitle>
            <DialogContent>
                {`${I18n.t('Do you want to delete device')} ${this.state.deleteDialog.name}?`}
                <FormControlLabel
                    control={<Checkbox
                        checked={this.state.suppressDelete}
                        onChange={e => this.setState({ suppressDelete: e.target.checked })}
                    />}
                    label={I18n.t('Suppress question for 2 minutes')}
                />
            </DialogContent>
            <DialogActions>
                <Button
                    onClick={() => {
                        const matter = JSON.parse(JSON.stringify(this.props.matter));
                        matter.devices.splice(this.state.deleteDialog.device, 1);
                        this.setState({
                            deleteDialog: false,
                            suppressDelete: this.state.suppressDelete ? Date.now() + 120000 : false,
                        }, () => this.props.updateConfig(matter));
                    }}
                    startIcon={<Delete />}
                    color="primary"
                    variant="contained"
                >
                    {I18n.t('Delete')}
                </Button>
                <Button
                    onClick={() => this.setState({ deleteDialog: false })}
                    startIcon={<Close />}
                    color="grey"
                    variant="contained"
                >
                    {I18n.t('Cancel')}
                </Button>
            </DialogActions>
        </Dialog>;
    }

    renderEditDialog() {
        if (!this.state.editDialog) {
            return null;
        }
        const save = () => {
            const matter = JSON.parse(JSON.stringify(this.props.matter));
            matter.devices[this.state.editDialog.device].name = this.state.editDialog.name;
            matter.devices[this.state.editDialog.device].productID = this.state.editDialog.productID;
            matter.devices[this.state.editDialog.device].vendorID = this.state.editDialog.vendorID;
            matter.devices[this.state.editDialog.device].noComposed = this.state.editDialog.noComposed;
            this.setState({ editDialog: false }, () => this.props.updateConfig(matter));
        };

        const isDisabled =
            this.state.editDialog?.name === this.state.editDialog?.originalName &&
            this.state.editDialog?.vendorID === this.state.editDialog?.originalVendorID &&
            this.state.editDialog?.productID === this.state.editDialog?.originalProductID &&
            this.state.editDialog?.noComposed === this.state.editDialog?.originalNoComposed;

        return <Dialog onClose={() => this.setState({ editDialog: false })} open={!0}>
            <DialogTitle>
                {`${I18n.t('Edit device')} ${this.state.editDialog?.originalName}`}
            </DialogTitle>
            <DialogContent>
                <TextField
                    label={I18n.t('Name')}
                    value={this.state.editDialog.name}
                    onChange={e => {
                        const editDialog = JSON.parse(JSON.stringify(this.state.editDialog));
                        editDialog.name = e.target.value;
                        this.setState({ editDialog });
                    }}
                    onKeyUp={e => e.key === 'Enter' && !isDisabled && save()}
                    variant="standard"
                    fullWidth
                />
                <TextField
                    select
                    style={{ width: 'calc(50% - 8px)', marginRight: 16, marginTop: 16 }}
                    value={this.state.editDialog.vendorID}
                    onChange={e => {
                        const editDialog = JSON.parse(JSON.stringify(this.state.editDialog));
                        editDialog.vendorID = e.target.value;
                        this.setState({ editDialog });
                    }}
                    label={I18n.t('Vendor ID')}
                    variant="standard"
                >
                    {['0xFFF1', '0xFFF2', '0xFFF3', '0xFFF4'].map(vendorID =>
                        <MenuItem
                            key={vendorID}
                            value={vendorID}
                        >
                            {vendorID}
                        </MenuItem>)}
                </TextField>
                <TextField
                    select
                    style={{ width: 'calc(50% - 8px)', marginTop: 16 }}
                    value={this.state.editDialog.productID}
                    onChange={e => {
                        const editDialog = JSON.parse(JSON.stringify(this.state.editDialog));
                        editDialog.productID = e.target.value;
                        this.setState({ editDialog });
                    }}
                    label={I18n.t('Product ID')}
                    variant="standard"
                >
                    {this.props.productIDs.map(productID =>
                        <MenuItem
                            key={productID}
                            value={productID}
                        >
                            {productID}
                        </MenuItem>)}
                </TextField>
                <FormControlLabel
                    variant="standard"
                    control={<Checkbox
                        checked={this.state.editDialog.noComposed}
                        onChange={e => {
                            const editDialog = JSON.parse(JSON.stringify(this.state.editDialog));
                            editDialog.noComposed = e.target.checked;
                            this.setState({ editDialog });
                        }}
                    />}
                    label={<span style={{ fontSize: 'smaller' }}>{I18n.t('Do not compose devices (Alexa does not support composed devices yet)')}</span>}
                />
            </DialogContent>
            <DialogActions>
                <Button
                    onClick={() => save()}
                    startIcon={<Save />}
                    disabled={isDisabled}
                    color="primary"
                    variant="contained"
                >
                    {I18n.t('Apply')}
                </Button>
                <Button
                    onClick={() => this.setState({ editDialog: false })}
                    startIcon={<Close />}
                    color="grey"
                    variant="contained"
                >
                    {I18n.t('Cancel')}
                </Button>
            </DialogActions>
        </Dialog>;
    }

    addDevices = devices => {
        const matter = JSON.parse(JSON.stringify(this.props.matter));
        devices.forEach(device => {
            if (!matter.devices.find(d => d.oid === device)) {
                matter.devices.push({
                    uuid: uuidv4(),
                    name: getText(device.common.name),
                    oid: device._id,
                    type: device.deviceType,
                    productID: device.productID,
                    vendorID: device.vendorID,
                    noComposed: true,
                    enabled: true,
                });
            }
        });

        this.props.updateConfig(matter);
    };

    renderDevicesDialog() {
        if (!this.state.dialog) {
            return null;
        }

        return <DeviceDialog
            onClose={() => this.setState({ dialog: false })}
            {...(this.state.dialog || {})}
            matter={this.props.matter}
            socket={this.props.socket}
            themeType={this.props.themeType}
            detectedDevices={this.props.detectedDevices}
            setDetectedDevices={detectedDevices => this.props.setDetectedDevices(detectedDevices)}
        />;
    }

    render() {
        return <div>
            {this.renderDeleteDialog()}
            {this.renderEditDialog()}
            {this.renderDevicesDialog()}
            <Tooltip title={I18n.t('Add device')}>
                <Fab
                    onClick={() => this.setState({
                        dialog: {
                            type: 'device',
                            devices: this.props.matter.devices,
                            addDevices: this.addDevices,
                        },
                    })}
                    style={{
                        position: 'absolute',
                        right: 20,
                        bottom: 84,
                    }}
                >
                    <Add />
                </Fab>
            </Tooltip>
            {!this.props.matter.devices.length ?
                I18n.t('No one device created. Create one, by clicking on the "+" button in the bottom right corner.') :
                <Table size="small" style={{ width: '100%', maxWidth: 600 }} padding="none">
                    <TableBody>
                        {
                            this.props.matter.devices.map((device, index) => <TableRow
                                key={index}
                                style={{ opacity: device.enabled ? 1 : 0.4 }}
                            >
                                <TableCell>
                                    <div style={{ display: 'flex', alignItems: 'center' }}>
                                        <span style={{ marginRight: 8 }} title={device.type}>
                                            {DEVICE_ICONS[device.type] || <QuestionMark />}
                                        </span>
                                        <div className={this.props.classes.bridgeDiv}>
                                            <div className={this.props.classes.deviceName}>
                                                {getText(device.name)}
                                                <span className={this.props.classes.deviceOid}>
                                                    (
                                                    {device.oid}
                                                    )
                                                </span>
                                            </div>
                                            <div>
                                                <span className={this.props.classes.deviceTitle}>
                                                    {I18n.t('Vendor ID')}
                                                    :
                                                </span>
                                                <span className={this.props.classes.deviceValue}>{device.vendorID || ''}</span>
                                                <span className={this.props.classes.deviceTitle}>
,
                                                    {I18n.t('Product ID')}
                                                    :
                                                </span>
                                                <span className={this.props.classes.deviceValue}>{device.productID || ''}</span>
                                            </div>
                                        </div>
                                    </div>
                                </TableCell>
                                <TableCell style={{ width: 0 }}>
                                    <Switch
                                        checked={device.enabled}
                                        onChange={e => {
                                            const matter = JSON.parse(JSON.stringify(this.props.matter));
                                            matter.devices[index].enabled = e.target.checked;
                                            this.props.updateConfig(matter);
                                        }}
                                    />
                                </TableCell>
                                <TableCell style={{ width: 0 }}>
                                    <Tooltip title={I18n.t('Edit device')}>
                                        <IconButton onClick={() => {
                                            this.setState(
                                                {
                                                    editDialog: {
                                                        type: 'device',
                                                        name: getText(device.name),
                                                        originalName: getText(device.name),
                                                        device: index,
                                                        vendorID: device.vendorID,
                                                        productID: device.productID,
                                                        originalVendorID: device.vendorID,
                                                        originalProductID: device.productID,
                                                        originalNoComposed: !!device.noComposed,
                                                        noComposed: !!device.noComposed,
                                                    },
                                                },
                                            );
                                        }}
                                        >
                                            <Edit />
                                        </IconButton>
                                    </Tooltip>
                                </TableCell>
                                <TableCell style={{ width: 0 }}>
                                    <Tooltip title={I18n.t('Delete device')}>
                                        <IconButton onClick={() => {
                                            this.setState(
                                                {
                                                    deleteDialog: {
                                                        type: 'device',
                                                        name: getText(device.name),
                                                        device: index,
                                                    },
                                                },
                                            );
                                        }}
                                        >
                                            <Delete />
                                        </IconButton>
                                    </Tooltip>
                                </TableCell>
                            </TableRow>)
                        }
                    </TableBody>
                </Table>}
        </div>;
    }
}

Devices.propTypes = {
    alive: PropTypes.bool,
    matter: PropTypes.object,
    socket: PropTypes.object,
    productIDs: PropTypes.array,
    updateConfig: PropTypes.func,
    themeType: PropTypes.string,
    detectedDevices: PropTypes.array,
    setDetectedDevices: PropTypes.func,
    commissioning: PropTypes.object,
    checkLicenseOnAdd: PropTypes.func,
};

export default withStyles(styles)(Devices);
