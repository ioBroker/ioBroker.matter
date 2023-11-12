import React from 'react';
import PropTypes from 'prop-types';
import { withStyles } from '@mui/styles';
import { v4 as uuidv4 } from 'uuid';
import { Types } from '@iobroker/type-detector';
import QRCode from 'react-qr-code';

import {
    Button, Checkbox,
    Dialog, DialogActions, DialogContent, DialogTitle,
    Fab, FormControl, FormControlLabel, IconButton, InputAdornment, InputLabel, MenuItem, Select, Switch, Table,
    TableBody,
    TableCell,
    TableRow, TextField,
    Tooltip,
} from '@mui/material';
import {
    Add, Close, ContentCopy, Delete, DomainDisabled, Edit, QrCode, QuestionMark, Save, SettingsInputAntenna,
} from '@mui/icons-material';

import { I18n, SelectID, Utils } from '@iobroker/adapter-react-v5';

import DeviceDialog, { DEVICE_ICONS, SUPPORTED_DEVICES } from '../components/DeviceDialog';
import { detectDevices, getText } from '../Utils';
import { Bridges } from './Bridges';

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
    deviceType: {
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
    tooltip: {
        pointerEvents: 'none',
    },
    vendorIcon: {
        width: 24,
        height: 24,
    },
});

class Devices extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            addDeviceDialog: null,
            editDeviceDialog: null,
            deleteDialog: false,
            suppressDelete: false,
            showQrCode: null,
            showDebugData: null,
        };
    }

    componentDidMount() {
        if (this.props.alive) {
            this.props.socket.sendTo(`matter.${this.props.instance}`, 'nodeStates', { devices: true })
                .then(result => result.states && this.props.updateNodeStates(result.states));
        }
    }

    renderDeleteDialog() {
        if (!this.state.deleteDialog) {
            return null;
        }

        if (this.state.suppressDelete) {
            setTimeout(() => {
                if (this.state.suppressDelete > Date.now()) {
                    const matter = JSON.parse(JSON.stringify(this.props.matter));
                    matter.devices[this.state.deleteDialog.deviceIndex].deleted = true;
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
                        matter.devices.splice(this.state.deleteDialog.deviceIndex, 1);
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

    renderEditDeviceDialog() {
        if (!this.state.editDeviceDialog) {
            return null;
        }

        const isCommissioned = !!this.props.commissioning[this.props.matter.devices[this.state.editDeviceDialog.deviceIndex].uuid];

        const save = () => {
            const matter = JSON.parse(JSON.stringify(this.props.matter));
            const device = matter.devices[this.state.editDeviceDialog.deviceIndex];
            device.name = this.state.editDeviceDialog.name;
            device.productID = this.state.editDeviceDialog.productID;
            device.vendorID = this.state.editDeviceDialog.vendorID;
            device.noComposed = this.state.editDeviceDialog.noComposed;
            if (!device.auto) {
                device.type = this.state.editDeviceDialog.deviceType;
            }

            delete device.dimmerUseLastLevelForOn;
            delete device.dimmerOnLevel;

            if (device.type === 'dimmer') {
                if (!device.hasOnState) {
                    device.dimmerUseLastLevelForOn = this.state.editDeviceDialog.dimmerUseLastLevelForOn;
                    if (!device.dimmerUseLastLevelForOn) {
                        device.dimmerOnLevel = this.state.editDeviceDialog.dimmerOnLevel;
                    }
                }
            }

            this.setState({ editDeviceDialog: false }, () => this.props.updateConfig(matter));
        };

        const isDisabled =
            (this.state.editDeviceDialog.name === this.state.editDeviceDialog.originalName &&
            this.state.editDeviceDialog?.vendorID === this.state.editDeviceDialog?.originalVendorID &&
            this.state.editDeviceDialog?.productID === this.state.editDeviceDialog?.originalProductID &&
            this.state.editDeviceDialog.deviceType === this.state.editDeviceDialog.originalDeviceType &&
            this.state.editDeviceDialog.dimmerOnLevel === this.state.editDeviceDialog.originalDimmerOnLevel &&
            this.state.editDeviceDialog.dimmerUseLastLevelForOn === this.state.editDeviceDialog.originalDimmerUseLastLevelForOn &&
            this.state.editDeviceDialog.noComposed === this.state.editDeviceDialog.originalNoComposed) ||
            (!this.state.editDeviceDialog.dimmerUseLastLevelForOn && !this.state.editDeviceDialog.dimmerOnLevel) ||
            !this.state.editDeviceDialog.deviceType;

        return <Dialog onClose={() => this.setState({ editDeviceDialog: false })} open={!0}>
            <DialogTitle>
                {`${I18n.t('Edit device')} ${this.state.editDeviceDialog?.originalName}`}
            </DialogTitle>
            <DialogContent>
                <TextField
                    label={I18n.t('Name')}
                    disabled={isCommissioned}
                    value={this.state.editDeviceDialog.name}
                    onChange={e => {
                        const editDeviceDialog = JSON.parse(JSON.stringify(this.state.editDeviceDialog));
                        editDeviceDialog.name = e.target.value;
                        this.setState({ editDeviceDialog });
                    }}
                    onKeyUp={e => e.key === 'Enter' && !isDisabled && save()}
                    variant="standard"
                    fullWidth
                />
                <TextField
                    select
                    disabled={isCommissioned}
                    style={{ width: 'calc(50% - 8px)', marginRight: 16, marginTop: 16 }}
                    value={this.state.editDeviceDialog.vendorID}
                    onChange={e => {
                        const editDeviceDialog = JSON.parse(JSON.stringify(this.state.editDeviceDialog));
                        editDeviceDialog.vendorID = e.target.value;
                        this.setState({ editDeviceDialog });
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
                    disabled={isCommissioned}
                    style={{ width: 'calc(50% - 8px)', marginTop: 16 }}
                    value={this.state.editDeviceDialog.productID}
                    onChange={e => {
                        const editDeviceDialog = JSON.parse(JSON.stringify(this.state.editDeviceDialog));
                        editDeviceDialog.productID = e.target.value;
                        this.setState({ editDeviceDialog });
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
                        checked={this.state.editDeviceDialog.noComposed}
                        disabled={isCommissioned}
                        onChange={e => {
                            const editDeviceDialog = JSON.parse(JSON.stringify(this.state.editDeviceDialog));
                            editDeviceDialog.noComposed = e.target.checked;
                            this.setState({ editDeviceDialog });
                        }}
                    />}
                    label={<span style={{ fontSize: 'smaller' }}>{I18n.t('Do not compose devices (Alexa does not support composed devices yet)')}</span>}
                />
                <FormControl style={{ width: '100%', marginTop: 30 }}>
                    <InputLabel>{I18n.t('Device type')}</InputLabel>
                    <Select
                        variant="standard"
                        disabled={isCommissioned || this.state.editDeviceDialog.auto}
                        value={this.state.editDeviceDialog.deviceType}
                        onChange={e => {
                            const editDeviceDialog = JSON.parse(JSON.stringify(this.state.editDeviceDialog));
                            editDeviceDialog.deviceType = e.target.value;
                            this.setState({ editDeviceDialog });
                        }}
                        renderValue={value => <span>
                            <span>{DEVICE_ICONS[value] || <QuestionMark />}</span>
                            {I18n.t(value)}
                        </span>}
                    >
                        {Object.keys(Types).filter(key => SUPPORTED_DEVICES.includes(key)).map(type => <MenuItem key={type} value={type}>
                            <span>{DEVICE_ICONS[type] || <QuestionMark />}</span>
                            {I18n.t(type)}
                        </MenuItem>)}
                    </Select>
                </FormControl>
                {this.state.editDeviceDialog.deviceType === 'dimmer' && !this.state.editDeviceDialog.hasOnState ? <FormControlLabel
                    style={{ marginTop: 20 }}
                    label={I18n.t('Use last value for ON')}
                    control={<Checkbox
                        checked={!!this.state.editDeviceDialog.dimmerUseLastLevelForOn}
                        onChange={e => {
                            const editDeviceDialog = JSON.parse(JSON.stringify(this.state.editDeviceDialog));
                            editDeviceDialog.dimmerUseLastLevelForOn = e.target.checked;
                            this.setState({ editDeviceDialog });
                        }}
                    />}
                    variant="standard"
                /> : null}
                {this.state.editDeviceDialog.deviceType === 'dimmer' && !this.state.editDeviceDialog.hasOnState && !this.state.editDeviceDialog.dimmerUseLastLevelForOn ? <FormControl
                    style={{ width: '100%', marginTop: 30 }}
                >
                    <InputLabel>{I18n.t('Brightness by ON')}</InputLabel>
                    <Select
                        variant="standard"
                        error={!this.state.editDeviceDialog.dimmerOnLevel}
                        value={this.state.editDeviceDialog.dimmerOnLevel}
                        onChange={e => {
                            const editDeviceDialog = JSON.parse(JSON.stringify(this.state.editDeviceDialog));
                            editDeviceDialog.dimmerOnLevel = e.target.value;
                            this.setState({ editDeviceDialog });
                        }}
                        renderValue={value => `${value}%`}
                    >
                        {[10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map(type => <MenuItem key={type} value={type}>
                            {`${type}%`}
                        </MenuItem>)}
                    </Select>
                </FormControl> : null}
                {isCommissioned ? I18n.t('Device is already commissioned. You cannot change the name or the vendor/product ID.') : null}
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
                    onClick={() => this.setState({ editDeviceDialog: false })}
                    startIcon={<Close />}
                    color="grey"
                    variant="contained"
                >
                    {I18n.t('Cancel')}
                </Button>
            </DialogActions>
        </Dialog>;
    }

    addDevices = (devices, isAutoDetected) => {
        const matter = JSON.parse(JSON.stringify(this.props.matter));
        devices.forEach(device => {
            if (!matter.devices.find(d => d.oid === device)) {
                if (this.props.checkLicenseOnAdd('addDevice', matter)) {
                    const obj = {
                        uuid: uuidv4(),
                        name: getText(device.common.name),
                        oid: device._id,
                        type: device.deviceType,
                        auto: isAutoDetected,
                        productID: device.productID,
                        vendorID: device.vendorID,
                        noComposed: true,
                        enabled: true,
                    };
                    if (device.type === 'dimmer') {
                        obj.hasOnState = device.hasOnState;
                    }
                    matter.devices.push(obj);
                }
            }
        });

        this.props.updateConfig(matter);
    };

    renderAddCustomDeviceDialog() {
        if (!this.state.addCustomDeviceDialog) {
            return null;
        }
        return <Dialog
            open={!0}
            onClose={() => this.setState({ addCustomDeviceDialog: false })}
        >
            <DialogTitle>{I18n.t('Configure custom device')}</DialogTitle>
            <DialogContent>
                <TextField
                    label={I18n.t('Name')}
                    value={this.state.addCustomDeviceDialog.name}
                    onChange={e => {
                        const addCustomDeviceDialog = JSON.parse(JSON.stringify(this.state.addCustomDeviceDialog));
                        addCustomDeviceDialog.name = e.target.value;
                        this.setState({ addCustomDeviceDialog });
                    }}
                    variant="standard"
                    fullWidth
                />
                <FormControl style={{ width: '100%', marginTop: 30 }}>
                    <InputLabel style={this.state.addCustomDeviceDialog.deviceType ? { transform: 'translate(0px, -9px) scale(0.75)' } : null}>{I18n.t('Device type')}</InputLabel>
                    <Select
                        variant="standard"
                        value={this.state.addCustomDeviceDialog.deviceType}
                        onChange={e => {
                            const addCustomDeviceDialog = JSON.parse(JSON.stringify(this.state.addCustomDeviceDialog));
                            addCustomDeviceDialog.deviceType = e.target.value;
                            this.setState({ addCustomDeviceDialog });
                        }}
                    >
                        {Object.keys(Types).filter(key => SUPPORTED_DEVICES.includes(key)).map(type => <MenuItem key={type} value={type}>
                            {I18n.t(type)}
                        </MenuItem>)}
                    </Select>
                </FormControl>
                <TextField
                    select
                    style={{ width: 'calc(50% - 8px)', marginRight: 16, marginTop: 16 }}
                    value={this.state.addCustomDeviceDialog.vendorID}
                    onChange={e => {
                        const addCustomDeviceDialog = JSON.parse(JSON.stringify(this.state.addCustomDeviceDialog));
                        addCustomDeviceDialog.vendorID = e.target.value;
                        this.setState({ addCustomDeviceDialog });
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
                    value={this.state.addCustomDeviceDialog.productID}
                    onChange={e => {
                        const addCustomDeviceDialog = JSON.parse(JSON.stringify(this.state.addCustomDeviceDialog));
                        addCustomDeviceDialog.productID = e.target.value;
                        this.setState({ addCustomDeviceDialog });
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
                        checked={this.state.addCustomDeviceDialog.noComposed}
                        onChange={e => {
                            const addCustomDeviceDialog = JSON.parse(JSON.stringify(this.state.addCustomDeviceDialog));
                            addCustomDeviceDialog.noComposed = e.target.checked;
                            this.setState({ addCustomDeviceDialog });
                        }}
                    />}
                    label={<span style={{ fontSize: 'smaller' }}>{I18n.t('Do not compose devices (Alexa does not support composed devices yet)')}</span>}
                />
            </DialogContent>
            <DialogActions>
                <Button
                    onClick={() => {
                        this.addDevices([{
                            _id: this.state.addCustomDeviceDialog.oid,
                            common: {
                                name: this.state.addCustomDeviceDialog.name,
                            },
                            deviceType: this.state.addCustomDeviceDialog.deviceType,
                            hasOnState: this.state.addCustomDeviceDialog.hasOnState,
                        }], this.state.addCustomDeviceDialog.bridgeIndex, false);

                        this.setState({ addCustomDeviceDialog: false });
                    }}
                    startIcon={<Add />}
                    disabled={!this.state.addCustomDeviceDialog.deviceType}
                    color="primary"
                    variant="contained"
                >
                    {I18n.t('Add')}
                </Button>
                <Button
                    onClick={() => this.setState({ addCustomDeviceDialog: false })}
                    startIcon={<Close />}
                    color="grey"
                    variant="contained"
                >
                    {I18n.t('Cancel')}
                </Button>
            </DialogActions>
        </Dialog>;
    }

    renderAddDevicesDialog() {
        if (!this.state.addDeviceDialog) {
            return null;
        }

        if (this.state.addDeviceDialog.noAutoDetect) {
            return <SelectID
                imagePrefix="../.."
                dialogName="matter"
                themeType={this.props.themeType}
                socket={this.props.socket}
                statesOnly
                onClose={() => this.setState({ addDeviceDialog: null })}
                onOk={async (oid, name) => {
                    // Try to detect ID
                    const controls = await detectDevices(this.props.socket, [oid]);
                    if (!controls?.length) {
                        this.setState({
                            addDeviceDialog: null,
                            addCustomDeviceDialog: {
                                oid,
                                name,
                                deviceType: '',
                                vendorID: '0xFFF1',
                                productID: '0x8000',
                            },
                        });
                    } else {
                        const deviceType = controls[0].devices[0].deviceType;
                        if (!SUPPORTED_DEVICES.includes(deviceType)) {
                            this.props.showToast(I18n.t('Device type "%s" is not supported yet', deviceType));
                        }

                        // try to find ON state for dimmer
                        this.setState({
                            addDeviceDialog: null,
                            addCustomDeviceDialog: {
                                oid,
                                name,
                                deviceType: SUPPORTED_DEVICES.includes(deviceType) ? deviceType : '',
                                hasOnState: controls[0].devices[0].hasOnState,
                                vendorID: '0xFFF1',
                                productID: '0x8000',
                            },
                        });
                    }
                }}
            />;
        }

        return <DeviceDialog
            onClose={() => this.setState({ addDeviceDialog: false })}
            {...(this.state.addDeviceDialog || {})}
            addDevices={devices => this.addDevices(devices, true)}
            matter={this.props.matter}
            socket={this.props.socket}
            themeType={this.props.themeType}
            detectedDevices={this.props.detectedDevices}
            setDetectedDevices={detectedDevices => this.props.setDetectedDevices(detectedDevices)}
        />;
    }

    renderQrCodeDialog() {
        const nodeState = this.state.showQrCode?.uuid && this.props.nodeStates[this.state.showQrCode.uuid];
        if (!this.state.showQrCode || !nodeState) {
            return null;
        }
        return <Dialog
            onClose={() => this.setState({ showQrCode: null })}
            open={!0}
            maxWidth="md"
        >
            <DialogTitle>{I18n.t('QR Code to connect')}</DialogTitle>
            <DialogContent>
                <div style={{ background: 'white', padding: 16 }}>
                    {nodeState.qrPairingCode ?
                        <QRCode value={nodeState.qrPairingCode} /> : null}
                </div>
                <TextField
                    value={nodeState.manualPairingCode || ''}
                    InputProps={{
                        readOnly: true,
                        endAdornment: <InputAdornment position="end">
                            <IconButton
                                onClick={() => {
                                    Utils.copyToClipboard(nodeState.manualPairingCode);
                                    this.props.showToast(I18n.t('Copied to clipboard'));
                                }}
                                edge="end"
                            >
                                <ContentCopy />
                            </IconButton>
                        </InputAdornment>,
                    }}
                    fullWidth
                    label={I18n.t('Manual pairing code')}
                    variant="standard"
                />
            </DialogContent>
            <DialogActions>
                <Button
                    onClick={() => this.setState({ showQrCode: null })}
                    startIcon={<Close />}
                    color="grey"
                    variant="contained"
                >
                    {I18n.t('Close')}
                </Button>
            </DialogActions>
        </Dialog>;
    }

    renderDebugDialog() {
        if (!this.state.showDebugData) {
            return null;
        }

        // Information about the commissioning process
        // {
        //     uuid: 'UUID',
        //     command: 'status',
        //     status: 'connecting', // creating, waitingForCommissioning, connecting, connected,
        //     connectionInfo: [
        //         {
        //             vendor: 'NAME' or '0x1123',
        //             connected: false/true,
        //             label: 'User controller name',
        //         }
        //     ],
        // }
        const data = this.props.nodeStates[this.state.showDebugData.uuid];

        return <Dialog
            onClose={() => this.setState({ showDebugData: null })}
            open={!0}
            maxWidth="md"
        >
            <DialogTitle>{I18n.t('Commissioning information')}</DialogTitle>
            <DialogContent>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                    <Table>
                        <TableBody>
                            <TableRow>
                                <TableCell>{I18n.t('Status')}</TableCell>
                                <TableCell>
                                    {Bridges.getStatusIcon(data.status, this.props.themeType)}
                                    <span style={{ marginLeft: 10 }}>{I18n.t(`status_${data.status}`)}</span>
                                </TableCell>
                            </TableRow>
                            {data.connectionInfo.map((info, i) => <TableRow key={i}>
                                <TableCell>
                                    {Bridges.getVendorIcon(info.vendor, this.props.themeType) || info.vendor}
                                    {info.label ? <span style={{ opacity: 0.7, marginLeft: 8, fontStyle: 'italic' }}>
                                        (
                                        {info.label}
                                        )
                                    </span> : null}
                                </TableCell>
                                <TableCell>
                                    {info.connected ? <span style={{ color: 'green' }}>{I18n.t('Connected')}</span> : I18n.t('Not connected')}
                                </TableCell>
                            </TableRow>)}
                        </TableBody>
                    </Table>
                </div>
            </DialogContent>
            <DialogActions>
                <Button
                    onClick={() => this.setState({ showDebugData: null })}
                    startIcon={<Close />}
                    color="grey"
                    variant="contained"
                >
                    {I18n.t('Close')}
                </Button>
            </DialogActions>
        </Dialog>;
    }

    renderStatus(device) {
        if (!this.props.nodeStates[device.uuid]) {
            return null;
        }
        if (this.props.nodeStates[device.uuid].status === 'waitingForCommissioning') {
            return <Tooltip title={I18n.t('Device is not commissioned. Show QR Code for commissioning')} classes={{ popper: this.props.classes.tooltip }}>
                <IconButton
                    style={{ height: 40 }}
                    onClick={() => this.setState({ showQrCode: device })}
                >
                    <QrCode />
                </IconButton>
            </Tooltip>;
        }
        if (this.props.nodeStates[device.uuid].status) {
            return <Tooltip title={I18n.t('Device is already commissioning. Show status information')} classes={{ popper: this.props.classes.tooltip }}>
                <IconButton
                    style={{ height: 40 }}
                    onClick={e => {
                        e.stopPropagation();
                        this.setState({ showDebugData: device });
                    }}
                >
                    {Bridges.getStatusIcon(this.props.nodeStates[device.uuid].status, this.props.themeType)}
                </IconButton>
            </Tooltip>;
        }
        return null;
    }

    renderDevice(device, index) {
        if (device.deleted) {
            return null;
        }
        return <TableRow
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
                            <span className={this.props.classes.deviceValue}>
                                {device.vendorID || ''}
                                ,
                            </span>
                            <span className={this.props.classes.deviceTitle}>
                                {I18n.t('Product ID')}
                                :
                            </span>
                            <span className={this.props.classes.deviceValue}>
                                {device.productID || ''}
                                ,
                            </span>
                            <span className={this.props.classes.deviceType}>
                                {I18n.t('Device type')}
                                :
                            </span>
                            <span className={this.props.classes.deviceType}>{I18n.t(device.type)}</span>
                        </div>
                    </div>
                </div>
            </TableCell>
            <TableCell style={{ width: 0 }}>
                {this.renderStatus(device)}
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
                <Tooltip title={I18n.t('Edit device')} classes={{ popper: this.props.classes.tooltip }}>
                    <IconButton onClick={() => {
                        this.setState(
                            {
                                editDeviceDialog: {
                                    type: 'device',
                                    name: getText(device.name),
                                    originalName: getText(device.name),
                                    deviceIndex: index,
                                    auto: device.auto,
                                    deviceType: device.type,
                                    originalDeviceType: device.type,
                                    vendorID: device.vendorID,
                                    productID: device.productID,
                                    originalVendorID: device.vendorID,
                                    originalProductID: device.productID,
                                    originalNoComposed: !!device.noComposed,
                                    noComposed: !!device.noComposed,
                                    dimmerOnLevel: parseFloat(device.dimmerOnLevel || 0) || 0,
                                    originalDimmerOnLevel: parseFloat(device.dimmerOnLevel || 0) || 0,
                                    dimmerUseLastLevelForOn: !!device.dimmerUseLastLevelForOn,
                                    originalDimmerUseLastLevelForOn: !!device.dimmerUseLastLevelForOn,
                                    hasOnState: !!device.hasOnState,
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
                {this.props.alive ? <Tooltip title={I18n.t('Reset to factory defaults')} classes={{ popper: this.props.classes.tooltip }}>
                    <IconButton onClick={() => this.setState({ showResetDialog: { device, step: 0 } })}>
                        <DomainDisabled />
                    </IconButton>
                </Tooltip> : null}
            </TableCell>
            <TableCell style={{ width: 0 }}>
                {this.props.alive && this.props.nodeStates[device.uuid]?.status === 'waitingForCommissioning' ? <Tooltip title={I18n.t('Re-announce')} classes={{ popper: this.props.classes.tooltip }}>
                    <IconButton
                        onClick={() => {
                            this.props.socket.sendTo(`matter.${this.props.instance}`, 're-announce', { uuid: device.uuid })
                                .then(result => {
                                    if (result.error) {
                                        window.alert(`Cannot re-announce: ${result.error}`);
                                    } else {
                                        this.props.updateNodeStates({ [device.uuid]: result.result });
                                    }
                                });
                        }}
                    >
                        <SettingsInputAntenna />
                    </IconButton>
                </Tooltip> : null}
            </TableCell>
            <TableCell style={{ width: 0 }}>
                <Tooltip title={I18n.t('Delete device')} classes={{ popper: this.props.classes.tooltip }}>
                    <IconButton onClick={() => {
                        this.setState(
                            {
                                deleteDialog: {
                                    type: 'device',
                                    name: getText(device.name),
                                    deviceIndex: index,
                                },
                            },
                        );
                    }}
                    >
                        <Delete />
                    </IconButton>
                </Tooltip>
            </TableCell>
        </TableRow>;
    }

    renderResetDialog() {
        if (!this.state.showResetDialog) {
            return null;
        }
        return <Dialog
            open={!0}
            onClose={() => this.setState({ showResetDialog: false })}
        >
            <DialogTitle>{I18n.t('Reset device')}</DialogTitle>
            <DialogContent>
                <p>{I18n.t('Bridge will lost all commissioning information and you must reconnect (with PIN or QR code) again.')}</p>
                <p>{I18n.t('Are you sure?')}</p>
                {this.state.showResetDialog.step === 1 ? <p>{I18n.t('This cannot be undone')}</p> : null}
            </DialogContent>
            <DialogActions>
                <Button
                    onClick={() => {
                        if (this.state.showResetDialog.step === 1) {
                            this.props.socket.sendTo(`matter.${this.props.instance}`, 'factoryReset', { uuid: this.state.showResetDialog.device.uuid })
                                .then(result => {
                                    if (result.error) {
                                        window.alert(`Cannot reset: ${result.error}`);
                                    } else {
                                        this.props.updateNodeStates({ [this.state.showResetDialog.device.uuid]: result.result });
                                    }
                                });
                        } else {
                            this.setState({ showResetDialog: { device: this.state.showResetDialog.device, step: 1 } });
                        }
                    }}
                    disabled={!this.props.alive}
                    startIcon={<Delete />}
                    color="primary"
                    style={{
                        color: this.state.showResetDialog.step === 1 ? 'white' : undefined,
                        backgroundColor: this.state.showResetDialog.step === 1 ? 'red' : undefined,
                    }}
                    variant="contained"
                >
                    {I18n.t('Reset')}
                </Button>
                <Button
                    onClick={() => this.setState({ showResetDialog: false })}
                    startIcon={<Close />}
                    color="grey"
                    variant="contained"
                >
                    {I18n.t('Cancel')}
                </Button>
            </DialogActions>
        </Dialog>;
    }

    render() {
        return <div>
            {this.renderDeleteDialog()}
            {this.renderEditDeviceDialog()}
            {this.renderAddDevicesDialog()}
            {this.renderAddCustomDeviceDialog()}
            {this.renderDebugDialog()}
            {this.renderQrCodeDialog()}
            {this.renderResetDialog()}
            <Tooltip title={I18n.t('Add device with auto-detection')} classes={{ popper: this.props.classes.tooltip }}>
                <Fab
                    onClick={() => this.setState({
                        addDeviceDialog: {
                            devices: this.props.matter.devices,
                            noAutoDetect: false,
                        },
                    })}
                    style={{
                        position: 'absolute',
                        right: 84,
                        bottom: 84,
                    }}
                >
                    <Add />
                </Fab>
            </Tooltip>
            <Tooltip title={I18n.t('Add device from one state')} classes={{ popper: this.props.classes.tooltip }}>
                <Fab
                    onClick={() => this.setState({
                        addDeviceDialog: {
                            devices: this.props.matter.devices,
                            noAutoDetect: true,
                        },
                    })}
                    style={{
                        opacity: 0.6,
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
                        {this.props.matter.devices.map((device, index) => this.renderDevice(device, index))}
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
    detectedDevices: PropTypes.object,
    setDetectedDevices: PropTypes.func,
    commissioning: PropTypes.object,
    checkLicenseOnAdd: PropTypes.func,
    instance: PropTypes.number,
};

export default withStyles(styles)(Devices);
