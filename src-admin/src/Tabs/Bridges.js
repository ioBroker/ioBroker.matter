import React from 'react';
import PropTypes from 'prop-types';
import { withStyles } from '@mui/styles';
import { v4 as uuidv4 } from 'uuid';
import QRCode from 'react-qr-code';
import { Types } from 'iobroker.type-detector';

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
    Add,
    Close,
    ContentCopy,
    Delete,
    Edit,
    KeyboardArrowDown,
    KeyboardArrowUp,
    QrCode,
    QuestionMark,
    Save, SignalWifiStatusbarNull,
    UnfoldLess,
    UnfoldMore, Wifi, WifiOff,
} from '@mui/icons-material';

import { I18n, Utils, SelectID } from '@iobroker/adapter-react-v5';

import DeviceDialog, { DEVICE_ICONS, SUPPORTED_DEVICES } from '../DeviceDialog';
import { detectDevices, getText } from '../Utils';

const styles = theme => ({
    table: {
        '& td': {
            border: 0,
        },
    },
    bridgeName: {
        marginTop: 4,
        fontSize: 16,
        fontWeight: 'bold',
    },
    bridgeTitle: {
        fontStyle: 'italic',
        fontSize: 12,
        // fontWeight: 'bold',
        marginRight: 4,
        opacity: 0.6,
    },
    bridgeValue: {
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
    deviceType: {
        opacity: 0.6,
        fontSize: 10,
    },
    devicesCount: {
        fontStyle: 'italic',
        fontSize: 10,
        fontWeight: 'normal',
        marginLeft: 8,
        opacity: 0.6,
    },
    flexGrow: {
        flexGrow: 1,
    },
    bridgeHeader: {
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
    },
    devicesHeader: {
        backgroundColor: theme.palette.mode === 'dark' ? '#3e3d3d' : '#c0c0c0',
    },
    bridgeButtonsAndTitle: {
        backgroundColor: theme.palette.secondary.main,
        color: theme.palette.secondary.contrastText,
    },
    bridgeButtonsAndTitleColor: {
        color: theme.palette.secondary.contrastText,
    },
    tooltip: {
        pointerEvents: 'none',
    },
});

class Bridges extends React.Component {
    constructor(props) {
        super(props);
        let bridgesOpened = {};
        try {
            bridgesOpened = JSON.parse(window.localStorage.getItem(`${this.adapterName}.${this.instance}.bridgesOpened`)) || {};
        } catch {
            //
        }

        this.state = {
            addDeviceDialog: null,
            editBridgeDialog: null,
            editDeviceDialog: null,
            deleteDialog: false,
            bridgesOpened,
            showQrCode: null,
        };
    }

    componentDidMount() {
        if (!this.props.matter.bridges.length) {
            setTimeout(() => {
                const matter = JSON.parse(JSON.stringify(this.props.matter));
                matter.bridges.push({
                    name: I18n.t('Default bridge'),
                    enabled: true,
                    productID: '0xFFF1',
                    vendorID: '0x8000',
                    list: [],
                    uuid: uuidv4(),
                });
                this.props.updateConfig(matter);
            }, 100);
        }
    }

    addDevicesToBridge = (devices, bridgeIndex, isAutoDetected) => {
        const matter = JSON.parse(JSON.stringify(this.props.matter));
        const bridge = matter.bridges[bridgeIndex];
        devices.forEach(device => {
            if (!bridge.list.find(d => d.oid === device._id)) {
                const obj = {
                    uuid: uuidv4(),
                    name: getText(device.common.name),
                    oid: device._id,
                    type: device.deviceType,
                    enabled: true,
                    noComposed: true,
                    auto: isAutoDetected,
                };
                if (device.type === 'dimmer') {
                    obj.hasOnState = device.hasOnState;
                }

                bridge.list.push(obj);
            }
        });

        this.props.updateConfig(matter);
    };

    renderBridgeEditDialog() {
        if (!this.state.editBridgeDialog) {
            return null;
        }
        const isCommissioned = !!this.props.commissioning[this.props.matter[this.state.editBridgeDialog.bridgeIndex]];

        const save = () => {
            const matter = JSON.parse(JSON.stringify(this.props.matter));
            if (this.state.editBridgeDialog.add) {
                matter.bridges.push({
                    name: this.state.editBridgeDialog.name,
                    enabled: true,
                    productID: this.state.editBridgeDialog.productID,
                    vendorID: this.state.editBridgeDialog.vendorID,
                    list: [],
                    uuid: uuidv4(),
                });
            } else {
                matter.bridges[this.state.editBridgeDialog.bridgeIndex].name = this.state.editBridgeDialog.name;
                matter.bridges[this.state.editBridgeDialog.bridgeIndex].productID = this.state.editBridgeDialog.productID;
                matter.bridges[this.state.editBridgeDialog.bridgeIndex].vendorID = this.state.editBridgeDialog.vendorID;
            }

            this.setState({ editBridgeDialog: false }, () => this.props.updateConfig(matter));
        };

        const isDisabled =
            this.state.editBridgeDialog.name === this.state.editBridgeDialog.originalName &&
            this.state.editBridgeDialog.vendorID === this.state.editBridgeDialog.originalVendorID &&
            this.state.editBridgeDialog.productID === this.state.editBridgeDialog.originalProductID;

        return <Dialog onClose={() => this.setState({ editBridgeDialog: false })} open={!0}>
            <DialogTitle>
                {this.state.editBridgeDialog.add ? I18n.t('Add bridge') : `${I18n.t('Edit bridge')} "${this.state.editBridgeDialog?.originalName}"`}
            </DialogTitle>
            <DialogContent>
                <TextField
                    label={I18n.t('Name')}
                    disabled={isCommissioned}
                    value={this.state.editBridgeDialog.name}
                    onChange={e => {
                        const editBridgeDialog = JSON.parse(JSON.stringify(this.state.editBridgeDialog));
                        editBridgeDialog.name = e.target.value;
                        this.setState({ editBridgeDialog });
                    }}
                    onKeyUp={e => e.key === 'Enter' && !isDisabled && save()}
                    variant="standard"
                    fullWidth
                />
                <TextField
                    select
                    disabled={isCommissioned}
                    style={{ width: 'calc(50% - 8px)', marginRight: 16, marginTop: 16 }}
                    value={this.state.editBridgeDialog.vendorID}
                    onChange={e => {
                        const editBridgeDialog = JSON.parse(JSON.stringify(this.state.editBridgeDialog));
                        editBridgeDialog.vendorID = e.target.value;
                        this.setState({ editBridgeDialog });
                    }}
                    label={I18n.t('Vendor ID')}
                    helperText={<span style={{ display: 'block', height: 20 }} />}
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
                    value={this.state.editBridgeDialog.productID}
                    onChange={e => {
                        const editBridgeDialog = JSON.parse(JSON.stringify(this.state.editBridgeDialog));
                        editBridgeDialog.productID = e.target.value;
                        this.setState({ editBridgeDialog });
                    }}
                    label={I18n.t('Product ID')}
                    helperText={<span style={{ display: 'block', height: 20 }} />}
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
                {isCommissioned ? I18n.t('Bridge is already commissioned. You cannot change the name or the vendor/product ID.') : null}
            </DialogContent>
            <DialogActions>
                {!isCommissioned ? <Button
                    onClick={() => save()}
                    startIcon={this.state.editBridgeDialog.add ? <Add /> : <Save />}
                    disabled={isDisabled}
                    color="primary"
                    variant="contained"
                >
                    {this.state.editBridgeDialog.add ? I18n.t('Add') : I18n.t('Apply')}
                </Button> : null}
                <Button
                    onClick={() => this.setState({ editBridgeDialog: false })}
                    startIcon={<Close />}
                    color="grey"
                    variant="contained"
                >
                    {I18n.t('Cancel')}
                </Button>
            </DialogActions>
        </Dialog>;
    }

    renderDeviceEditDialog() {
        if (!this.state.editDeviceDialog) {
            return null;
        }
        const isCommissioned = !!this.props.commissioning[this.props.matter.bridges[this.state.editDeviceDialog.bridgeIndex].uuid];

        const save = () => {
            const matter = JSON.parse(JSON.stringify(this.props.matter));
            const device = matter.bridges[this.state.editDeviceDialog.bridgeIndex].list[this.state.editDeviceDialog.device];
            device.name = this.state.editDeviceDialog.name;
            if (!device.auto) {
                device.type = this.state.editDeviceDialog.deviceType;
            }

            delete device.dimmerOnLevel;
            delete device.dimmerUseLastLevelForOn;

            if (device.type === 'dimmer') {
                device.dimmerUseLastLevelForOn = this.state.editDeviceDialog.dimmerUseLastLevelForOn;
                if (device.dimmerUseLastLevelForOn) {
                    device.dimmerOnLevel = this.state.editDeviceDialog.dimmerOnLevel;
                }
            }
            this.setState({ editDeviceDialog: false }, () => this.props.updateConfig(matter));
        };

        const isDisabled =
            (this.state.editDeviceDialog.name === this.state.editDeviceDialog.originalName &&
            this.state.editDeviceDialog.deviceType === this.state.editDeviceDialog.originalDeviceType &&
            this.state.editDeviceDialog.dimmerOnLevel === this.state.editDeviceDialog.originalDimmerOnLevel &&
            this.state.editDeviceDialog.dimmerUseLastLevelForOn === this.state.editDeviceDialog.originalDimmerUseLastLevelForOn &&
            this.state.editDeviceDialog.noComposed === this.state.editDeviceDialog.originalNoComposed) ||
            (!this.state.editDeviceDialog.dimmerUseLastLevelForOn && !this.state.editDeviceDialog.dimmerOnLevel) ||
            !this.state.editDeviceDialog.deviceType;

        return <Dialog onClose={() => this.setState({ editDeviceDialog: false })} open={!0}>
            <DialogTitle>
                {`${I18n.t('Edit device')} "${this.state.editDeviceDialog?.originalName}"`}
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
                <FormControlLabel
                    variant="standard"
                    disabled={isCommissioned}
                    control={<Checkbox
                        checked={this.state.editDeviceDialog.noComposed}
                        onChange={e => {
                            const editDeviceDialog = JSON.parse(JSON.stringify(this.state.editDeviceDialog));
                            editDeviceDialog.noComposed = e.target.checked;
                            this.setState({ editDeviceDialog });
                        }}
                    />}
                    label={<span style={{ fontSize: 'smaller' }}>{I18n.t('Do not compose devices (Alexa does not support composed devices yet)')}</span>}
                />
                <FormControl
                    style={{ width: '100%', marginTop: 30 }}
                    error={!this.state.editDeviceDialog.deviceType}
                >
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
                    fullWidth
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
                        error={!this.state.editDeviceDialog.dimmerOnLevel}
                        variant="standard"
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
                {isCommissioned ? I18n.t('Bridge is already commissioned. You cannot change the name or the vendor/product ID.') : null}
            </DialogContent>
            <DialogActions>
                {!isCommissioned ? <Button
                    onClick={() => save()}
                    startIcon={<Save />}
                    disabled={isDisabled}
                    color="primary"
                    variant="contained"
                >
                    {I18n.t('Apply')}
                </Button> : null}
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

    renderDeleteDialog() {
        if (!this.state.deleteDialog) {
            return null;
        }

        if (this.state.suppressDelete) {
            setTimeout(() => {
                if (this.state.suppressDelete > Date.now()) {
                    const matter = JSON.parse(JSON.stringify(this.props.matter));
                    if (this.state.deleteDialog.type === 'bridge') {
                        matter.bridges.splice(this.state.deleteDialog.bridge, 1);
                    } else if (this.state.deleteDialog.bridge !== undefined) {
                        matter.bridges[this.state.deleteDialog.bridge].list.splice(this.state.deleteDialog.device, 1);
                    }

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
                {`${
                    this.state.deleteDialog.type === 'bridge' ?
                        I18n.t('Do you want to delete bridge') :
                        I18n.t('Do you want to delete device')} ${
                    this.state.deleteDialog.name
                }?`}
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
                        if (this.state.deleteDialog.type === 'bridge') {
                            matter.bridges.splice(this.state.deleteDialog.bridge, 1);
                        } else if (this.state.deleteDialog.bridge !== undefined) {
                            matter.bridges[this.state.deleteDialog.bridge].list.splice(this.state.deleteDialog.device, 1);
                        }
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
        const data = this.props.bridgeStates[this.state.showDebugData.uuid];

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
                                    {Bridges.getStatusIcon(data.status)}
                                    <span style={{ marginLeft: 10 }}>{I18n.t(`status_${data.status}`)}</span>
                                </TableCell>
                            </TableRow>
                            {data.connectionInfo.map((info, i) => <TableRow key={i}>
                                <TableCell>
                                    {info.vendor}
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

    renderAddDeviceDialog() {
        if (!this.state.addDeviceDialog) {
            return null;
        }

        if (this.state.addDeviceDialog.noAutoDetect) {
            this.bridgeIndex = this.state.addDeviceDialog.bridgeIndex;
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
                                bridgeIndex: this.bridgeIndex,
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
                                bridgeIndex: this.bridgeIndex,
                                hasOnState: controls[0].devices[0].hasOnState,
                            },
                        });
                    }
                    this.bridgeIndex = null;
                }}
            />;
        }

        return <DeviceDialog
            onClose={() => this.setState({ addDeviceDialog: false })}
            {...this.state.addDeviceDialog}
            addDevices={devices => this.addDevicesToBridge(devices, this.state.addDeviceDialog.bridgeIndex, true)}
            matter={this.props.matter}
            socket={this.props.socket}
            themeType={this.props.themeType}
            detectedDevices={this.props.detectedDevices}
            setDetectedDevices={detectedDevices => this.props.setDetectedDevices(detectedDevices)}
        />;
    }

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
            </DialogContent>
            <DialogActions>
                <Button
                    onClick={() => {
                        this.addDevicesToBridge([{
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

    renderDevice(bridge, bridgeIndex, device, devIndex) {
        return <TableRow
            key={devIndex}
            style={{ opacity: device.enabled && bridge.enabled ? 1 : 0.4 }}
        >
            <TableCell style={{ border: 0 }} />
            <TableCell>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                    <div style={{ marginRight: 8 }} title={device.type}>
                        {DEVICE_ICONS[device.type] || <QuestionMark />}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <div>
                            {getText(device.name)}
                            <span className={this.props.classes.deviceOid}>
                                (
                                {device.oid}
                                )
                            </span>
                        </div>
                        <div className={this.props.classes.deviceType}>
                            {`${I18n.t('Device type')}: ${I18n.t(device.type)}`}
                        </div>
                    </div>
                </div>
            </TableCell>
            <TableCell style={{ width: 0 }}>
                <Switch
                    checked={device.enabled}
                    onChange={e => {
                        const matter = JSON.parse(JSON.stringify(this.props.matter));
                        matter.bridges[bridgeIndex].list[devIndex].enabled = e.target.checked;
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
                                    auto: device.auto,
                                    deviceType: device.type,
                                    originalDeviceType: device.type,
                                    bridgeIndex,
                                    device: devIndex,
                                    noComposed: !!device.noComposed,
                                    originalNoComposed: !!device.noComposed,
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
                <Tooltip title={I18n.t('Delete device')} classes={{ popper: this.props.classes.tooltip }}>
                    <IconButton onClick={() => {
                        this.setState(
                            {
                                deleteDialog: {
                                    type: 'device',
                                    name: getText(device.name),
                                    bridge: bridgeIndex,
                                    device: devIndex,
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

    renderQrCodeDialog() {
        if (!this.state.showQrCode) {
            return null;
        }
        return <Dialog
            onClose={() => this.setState({ showQrCode: null })}
            open={!0}
            maxWidth="md"
        >
            <DialogTitle>{I18n.t('QR Code to connect ')}</DialogTitle>
            <DialogContent>
                <div style={{ background: 'white', padding: 16 }}>
                    <QRCode value={this.props.bridgeStates[this.state.showQrCode.uuid].qrPairingCode} />
                </div>
                <TextField
                    value={this.props.bridgeStates[this.state.showQrCode.uuid].manualPairingCode}
                    InputProps={{
                        readOnly: true,
                        endAdornment: <InputAdornment position="end">
                            <IconButton
                                onClick={() => {
                                    Utils.copyToClipboard(this.props.bridgeStates[this.state.showQrCode.uuid].manualPairingCode);
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

    static getStatusColor(status) {
        if (status === 'creating') {
            return '#000';
        }
        if (status === 'waitingForCommissioning') {
            return 'blue';
        }
        if (status === 'commissioned') {
            return 'orange';
        }
        if (status === 'connected') {
            return 'green';
        }
        return 'grey';
    }

    static getStatusIcon(status) {
        const color = Bridges.getStatusColor(status);
        if (status === 'creating') {
            return <SignalWifiStatusbarNull style={{ color }} />;
        }
        if (status === 'waitingForCommissioning') {
            return <QrCode style={{ color }} />;
        }
        if (status === 'commissioned') {
            return <WifiOff style={{ color }} />;
        }
        if (status === 'connected') {
            return <Wifi style={{ color }} />;
        }
        return <QuestionMark style={{ color }} />;
    }

    renderStatus(bridge) {
        if (!this.props.bridgeStates[bridge.uuid]) {
            return null;
        }
        if (this.props.bridgeStates[bridge.uuid].status === 'waitingForCommissioning') {
            return <Tooltip title={I18n.t('Bridge is not commissioned. Show QR Code got commissioning')} classes={{ popper: this.props.classes.tooltip }}>
                <IconButton
                    style={{ height: 40 }}
                    onClick={() => this.setState({ showQrCode: bridge })}
                >
                    <QrCode />
                </IconButton>
            </Tooltip>;
        }
        if (this.props.bridgeStates[bridge.uuid].status) {
            return <Tooltip title={I18n.t('Device is already commissioning. Show status information')} classes={{ popper: this.props.classes.tooltip }}>
                <IconButton
                    style={{ height: 40 }}
                    onClick={e => {
                        e.stopPropagation();
                        this.setState({ showDebugData: bridge });
                    }}
                >
                    {Bridges.getStatusIcon(this.props.bridgeStates[bridge.uuid].status)}
                </IconButton>
            </Tooltip>;
        }
        return null;
    }

    renderBridge(bridge, bridgeIndex) {
        const enabledDevices = bridge.list.filter(d => d.enabled).length;
        let countText;
        if (!bridge.list.length) {
            countText = null;
        } else if (bridge.list.length !== enabledDevices) {
            countText = `(${enabledDevices}/${bridge.list.length})`;
        } else {
            countText = `(${bridge.list.length})`;
        }

        const allowDisable = this.props.matter.bridges.filter(b => b.enabled).length > 1;

        return <React.Fragment key={bridgeIndex}>
            <TableRow
                className={this.props.classes.bridgeButtonsAndTitle}
                sx={() => ({
                    opacity: bridge.enabled ? 1 : 0.4,
                    '&>td:first-child': {
                        borderTopLeftRadius: 4,
                        borderBottomLeftRadius: 4,
                    },
                    '&>td:last-child': {
                        borderTopRightRadius: 4,
                        borderBottomRightRadius: 4,
                    },
                })}
            >
                <TableCell style={{ width: 0 }} className={this.props.classes.bridgeButtonsAndTitle}>
                    <IconButton
                        size="small"
                        className={this.props.classes.bridgeButtonsAndTitleColor}
                        onClick={() => {
                            const bridgesOpened = JSON.parse(JSON.stringify(this.state.bridgesOpened));
                            bridgesOpened[bridgeIndex] = !bridgesOpened[bridgeIndex];
                            window.localStorage.setItem(`${this.adapterName}.${this.instance}.bridgesOpened`, JSON.stringify(bridgesOpened));
                            this.setState({ bridgesOpened });
                        }}
                    >
                        {this.state.bridgesOpened[bridgeIndex] ? <KeyboardArrowUp /> : <KeyboardArrowDown />}
                    </IconButton>
                </TableCell>
                <TableCell
                    className={`${this.props.classes.bridgeHeader} ${this.props.classes.bridgeButtonsAndTitle}`}
                    onClick={() => {
                        const bridgesOpened = JSON.parse(JSON.stringify(this.state.bridgesOpened));
                        bridgesOpened[bridgeIndex] = !bridgesOpened[bridgeIndex];
                        window.localStorage.setItem(`${this.adapterName}.${this.instance}.bridgesOpened`, JSON.stringify(bridgesOpened));
                        this.setState({ bridgesOpened });
                    }}
                >
                    <div className={this.props.classes.bridgeDiv}>
                        <div className={this.props.classes.bridgeName}>
                            {getText(bridge.name)}
                            <span className={this.props.classes.devicesCount}>{countText}</span>
                        </div>
                        <div>
                            <span className={this.props.classes.bridgeTitle}>
                                {I18n.t('Vendor ID')}
                                :
                            </span>
                            <span className={this.props.classes.bridgeValue}>{bridge.vendorID || ''}</span>
                            <span className={this.props.classes.bridgeTitle}>
,
                                {I18n.t('Product ID')}
                                :
                            </span>
                            <span className={this.props.classes.bridgeValue}>{bridge.productID || ''}</span>
                        </div>
                    </div>
                    <div className={this.props.classes.flexGrow} />
                    {this.renderStatus(bridge)}
                </TableCell>
                <TableCell style={{ width: 0 }} className={this.props.classes.bridgeButtonsAndTitle}>
                    <Tooltip
                        title={bridge.enabled && !allowDisable ? I18n.t('At least one bridge must be enabled') : I18n.t('Enable/disable bridge')}
                        classes={{ popper: this.props.classes.tooltip }}
                    >
                        <span>
                            <Switch
                                disabled={bridge.enabled && !allowDisable}
                                checked={bridge.enabled}
                                onClick={e => e.stopPropagation()}
                                onChange={e => {
                                    const matter = JSON.parse(JSON.stringify(this.props.matter));
                                    matter.bridges[bridgeIndex].enabled = e.target.checked;
                                    this.props.updateConfig(matter);
                                }}
                            />
                        </span>
                    </Tooltip>
                </TableCell>
                <TableCell style={{ width: 0 }} className={this.props.classes.bridgeButtonsAndTitle}>
                    <Tooltip title={I18n.t('Edit bridge')} classes={{ popper: this.props.classes.tooltip }}>
                        <IconButton
                            className={this.props.classes.bridgeButtonsAndTitleColor}
                            onClick={e => {
                                e.stopPropagation();
                                this.setState(
                                    {
                                        editBridgeDialog: {
                                            type: 'bridge',
                                            name: getText(bridge.name),
                                            originalName: getText(bridge.name),
                                            bridgeIndex,
                                            vendorID: bridge.vendorID,
                                            originalVendorID: bridge.vendorID,
                                            productID: bridge.productID,
                                            originalProductID: bridge.productID,
                                        },
                                    },
                                );
                            }}
                        >
                            <Edit />
                        </IconButton>
                    </Tooltip>
                </TableCell>
                <TableCell style={{ width: 0 }} className={this.props.classes.bridgeButtonsAndTitle}>
                    <Tooltip
                        classes={{ popper: this.props.classes.tooltip }}
                        title={bridge.enabled && !allowDisable ? I18n.t('At least one enabled bridge must exist') : I18n.t('Delete bridge')}
                    >
                        <span>
                            <IconButton
                                className={this.props.classes.bridgeButtonsAndTitleColor}
                                disabled={bridge.enabled && !allowDisable}
                                onClick={e => {
                                    e.stopPropagation();
                                    this.setState(
                                        {
                                            deleteDialog: {
                                                type: 'bridge',
                                                name: getText(bridge.name),
                                                bridge: bridgeIndex,
                                            },
                                        },
                                    );
                                }}
                            >
                                <Delete />
                            </IconButton>
                        </span>
                    </Tooltip>
                </TableCell>
            </TableRow>
            {this.state.bridgesOpened[bridgeIndex] ? <>
                <TableRow>
                    <TableCell style={{ border: 0 }} />
                    <TableCell
                        style={{
                            fontWeight: 'bold',
                            opacity: bridge.enabled ? 1 : 0.5,
                            paddingLeft: 8,
                        }}
                        className={this.props.classes.devicesHeader}
                    >
                        {I18n.t('Devices')}
                    </TableCell>
                    <TableCell style={{ width: 0 }} className={this.props.classes.devicesHeader}>
                    </TableCell>
                    <TableCell style={{ width: 0 }} className={this.props.classes.devicesHeader}>
                        <Tooltip title={I18n.t('Add device with auto-detection')} classes={{ popper: this.props.classes.tooltip }}>
                            <IconButton
                                onClick={async () => {
                                    const isLicenseOk = await this.props.checkLicenseOnAdd('addDeviceToBridge');
                                    if (!isLicenseOk) {
                                        this.props.alive && this.props.showToast('You need ioBroker.pro assistant or remote subscription to have more than 5 devices in bridge');
                                        return;
                                    }
                                    this.setState({
                                        addDeviceDialog: {
                                            noAutoDetect: false,
                                            name: getText(bridge.name),
                                            bridgeIndex,
                                            devices: bridge.list,
                                        },
                                    });
                                }}
                            >
                                <Add />
                            </IconButton>
                        </Tooltip>
                    </TableCell>
                    <TableCell style={{ width: 0 }} className={this.props.classes.devicesHeader}>
                        <Tooltip title={I18n.t('Add device from one data point')} classes={{ popper: this.props.classes.tooltip }}>
                            <IconButton
                                style={{ color: 'gray' }}
                                onClick={async () => {
                                    const isLicenseOk = await this.props.checkLicenseOnAdd('addDeviceToBridge');
                                    if (!isLicenseOk) {
                                        this.props.alive && this.props.showToast('You need ioBroker.pro assistant or remote subscription to have more than 5 devices in bridge');
                                        return;
                                    }
                                    this.setState({
                                        addDeviceDialog: {
                                            noAutoDetect: true,
                                            name: getText(bridge.name),
                                            bridgeIndex,
                                            devices: bridge.list,
                                        },
                                    });
                                }}
                            >
                                <Add />
                            </IconButton>
                        </Tooltip>
                    </TableCell>
                </TableRow>
                {bridge.list.map((device, devIndex) => this.renderDevice(bridge, bridgeIndex, device, devIndex))}
            </> : null}
        </React.Fragment>;
    }

    render() {
        return <div>
            {this.renderAddDeviceDialog()}
            {this.renderAddCustomDeviceDialog()}
            {this.renderDeleteDialog()}
            {this.renderBridgeEditDialog()}
            {this.renderDeviceEditDialog()}
            {this.renderQrCodeDialog()}
            {this.renderDebugDialog()}
            <Tooltip title={I18n.t('Add bridge')} classes={{ popper: this.props.classes.tooltip }}>
                <Fab
                    onClick={async () => {
                        const isLicenseOk = await this.props.checkLicenseOnAdd('addBridge');
                        if (!isLicenseOk) {
                            this.props.alive && this.props.showToast('You need ioBroker.pro assistant or remote subscription to have more than one bridge');
                            return;
                        }
                        let i = 1;
                        const name = `${I18n.t('New bridge')} `;
                        while (this.props.matter.bridges.find(b => b.name === name + i)) {
                            i++;
                        }
                        this.setState({
                            editBridgeDialog: {
                                type: 'bridge',
                                name: name + i,
                                originalName: '',
                                add: true,
                                vendorID: '0xFFF1',
                                originalVendorID: '0xFFF1',
                                productID: '0x8000',
                                originalProductID: '0x8000',
                            },
                        });
                    }}
                    style={{
                        position: 'absolute',
                        right: 20,
                        bottom: 84,
                    }}
                >
                    <Add />
                </Fab>
            </Tooltip>
            {this.props.matter.bridges.length ? <div>
                <Tooltip title={I18n.t('Expand all')} classes={{ popper: this.props.classes.tooltip }}>
                    <span>
                        <IconButton
                            onClick={() => {
                                const bridgesOpened = JSON.parse(JSON.stringify(this.state.bridgesOpened));
                                Object.keys(bridgesOpened).forEach(key => bridgesOpened[key] = true);
                                window.localStorage.setItem(`${this.adapterName}.${this.instance}.bridgesOpened`, JSON.stringify(bridgesOpened));
                                this.setState({ bridgesOpened });
                            }}
                            disabled={Object.values(this.state.bridgesOpened).every(v => v === true)}
                        >
                            <UnfoldMore />
                        </IconButton>
                    </span>
                </Tooltip>
                <Tooltip title={I18n.t('Collapse all')} classes={{ popper: this.props.classes.tooltip }}>
                    <span>
                        <IconButton
                            onClick={() => {
                                const bridgesOpened = JSON.parse(JSON.stringify(this.state.bridgesOpened));
                                Object.keys(bridgesOpened).forEach(key => bridgesOpened[key] = false);
                                window.localStorage.setItem(`${this.adapterName}.${this.instance}.bridgesOpened`, JSON.stringify(bridgesOpened));
                                this.setState({ bridgesOpened });
                            }}
                            disabled={Object.values(this.state.bridgesOpened).every(v => v === false)}
                        >
                            <UnfoldLess />
                        </IconButton>
                    </span>
                </Tooltip>
            </div> : I18n.t('No bridges created. Create one, by clicking on the "+" button in the bottom right corner.')}
            <Table size="small" style={{ width: '100%', maxWidth: 600 }} padding="none" className={this.props.classes.table}>
                <TableBody>
                    {this.props.matter.bridges.map((bridge, bridgeIndex) => this.renderBridge(bridge, bridgeIndex))}
                </TableBody>
            </Table>
        </div>;
    }
}

Bridges.propTypes = {
    alive: PropTypes.bool,
    matter: PropTypes.object,
    socket: PropTypes.object,
    productIDs: PropTypes.array,
    updateConfig: PropTypes.func,
    themeType: PropTypes.string,
    detectedDevices: PropTypes.array,
    setDetectedDevices: PropTypes.func,
    bridgeStates: PropTypes.object,
    showToast: PropTypes.func,
    commissioning: PropTypes.object,
    checkLicenseOnAdd: PropTypes.func,
};

export default withStyles(styles)(Bridges);
