import React from 'react';
import PropTypes from 'prop-types';
import { withStyles } from '@mui/styles';
import { v4 as uuidv4 } from 'uuid';
import QRCode from 'react-qr-code';

import {
    Button, Checkbox,
    Dialog, DialogActions, DialogContent, DialogTitle,
    Fab, FormControlLabel, IconButton, InputAdornment, MenuItem, Switch, Table,
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

import { I18n, Utils } from '@iobroker/adapter-react-v5';

import DeviceDialog, { DEVICE_ICONS } from '../DeviceDialog';
import { getText } from '../Utils';

const styles = () => ({
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
            dialog: null,
            editDialog: null,
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

    addDevicesToBridge = devices => {
        const matter = JSON.parse(JSON.stringify(this.props.matter));
        const bridge = matter.bridges[this.state.dialog.bridge];
        devices.forEach(device => {
            if (!bridge.list.find(d => d.oid === device._id)) {
                bridge.list.push({
                    uuid: uuidv4(),
                    name: getText(device.common.name),
                    oid: device._id,
                    type: device.deviceType,
                    enabled: true,
                    noComposed: true,
                });
            }
        });

        this.props.updateConfig(matter);
    };

    renderEditDialog() {
        if (!this.state.editDialog) {
            return null;
        }
        const isCommissioned = !!this.props.commissioning[this.props.matter[this.state.editDialog.bridgeIndex]];

        const save = () => {
            const matter = JSON.parse(JSON.stringify(this.props.matter));
            if (this.state.editDialog.add) {
                matter.bridges.push({
                    name: this.state.editDialog.name,
                    enabled: true,
                    productID: this.state.editDialog.productID,
                    vendorID: this.state.editDialog.vendorID,
                    list: [],
                    uuid: uuidv4(),
                });
            } else if (this.state.editDialog.type === 'bridge') {
                matter.bridges[this.state.editDialog.bridgeIndex].name = this.state.editDialog.name;
                matter.bridges[this.state.editDialog.bridgeIndex].productID = this.state.editDialog.productID;
                matter.bridges[this.state.editDialog.bridgeIndex].vendorID = this.state.editDialog.vendorID;
            } else if (this.state.editDialog.bridgeIndex !== undefined) {
                matter.bridges[this.state.editDialog.bridgeIndex].list[this.state.editDialog.device].name = this.state.editDialog.name;
            }

            this.setState({ editDialog: false }, () => this.props.updateConfig(matter));
        };

        const isDisabled =
            this.state.editDialog.name === this.state.editDialog.originalName &&
            this.state.editDialog.vendorID === this.state.editDialog.originalVendorID &&
            this.state.editDialog.productID === this.state.editDialog.originalProductID &&
            this.state.editDialog.noComposed === this.state.editDialog.originalNoComposed;

        return <Dialog onClose={() => this.setState({ editDialog: false })} open={!0}>
            <DialogTitle>
                {this.state.editDialog.type === 'device' ? `${I18n.t('Edit bridge')} "${this.state.editDialog?.originalName}"` :
                    (this.state.editDialog.add ?
                        I18n.t('Add bridge') :
                        `${I18n.t('Edit bridge')} "${this.state.editDialog?.originalName}"`)}
            </DialogTitle>
            <DialogContent>
                <TextField
                    label={I18n.t('Name')}
                    disabled={isCommissioned}
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
                {this.state.editDialog.vendorID !== false ? <TextField
                    select
                    disabled={isCommissioned}
                    style={{ width: 'calc(50% - 8px)', marginRight: 16, marginTop: 16 }}
                    value={this.state.editDialog.vendorID}
                    onChange={e => {
                        const editDialog = JSON.parse(JSON.stringify(this.state.editDialog));
                        editDialog.vendorID = e.target.value;
                        this.setState({ editDialog });
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
                </TextField> : null}
                {this.state.editDialog.productID !== false ? <TextField
                    select
                    disabled={isCommissioned}
                    style={{ width: 'calc(50% - 8px)', marginTop: 16 }}
                    value={this.state.editDialog.productID}
                    onChange={e => {
                        const editDialog = JSON.parse(JSON.stringify(this.state.editDialog));
                        editDialog.productID = e.target.value;
                        this.setState({ editDialog });
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
                </TextField> : null}
                {this.state.editDialog.type === 'device' ? <FormControlLabel
                    variant="standard"
                    disabled={isCommissioned}
                    control={<Checkbox
                        checked={this.state.editDialog.noComposed}
                        onChange={e => {
                            const editDialog = JSON.parse(JSON.stringify(this.state.editDialog));
                            editDialog.noComposed = e.target.checked;
                            this.setState({ editDialog });
                        }}
                    />}
                    label={<span style={{ fontSize: 'smaller' }}>{I18n.t('Do not compose devices (Alexa does not support composed devices yet)')}</span>}
                /> : null}
                {isCommissioned ? I18n.t('Bridge is already commissioned. You cannot change the name or the vendor/product ID.') : null}
            </DialogContent>
            <DialogActions>
                {!isCommissioned ? <Button
                    onClick={() => save()}
                    startIcon={this.state.editDialog.add ? <Add /> : <Save />}
                    disabled={isDisabled}
                    color="primary"
                    variant="contained"
                >
                    {this.state.editDialog.add ? I18n.t('Add') : I18n.t('Apply')}
                </Button> : null}
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

    renderDeviceDialog() {
        if (!this.state.dialog) {
            return null;
        }

        return <DeviceDialog
            onClose={() => this.setState({ dialog: false })}
            {...this.state.dialog}
            matter={this.props.matter}
            socket={this.props.socket}
            themeType={this.props.themeType}
            detectedDevices={this.props.detectedDevices}
            setDetectedDevices={detectedDevices => this.props.setDetectedDevices(detectedDevices)}
        />;
    }

    renderDevice(bridge, bridgeIndex, device, devIndex) {
        return <TableRow
            key={devIndex}
            style={{ opacity: device.enabled && bridge.enabled ? 1 : 0.4 }}
        >
            <TableCell style={{ border: 0 }} />
            <TableCell>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                    <span style={{ marginRight: 8 }} title={device.type}>
                        {DEVICE_ICONS[device.type] || <QuestionMark />}
                    </span>
                    {getText(device.name)}
                    <span className={this.props.classes.deviceOid}>
                        (
                        {device.oid}
                        )
                    </span>
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
                <Tooltip title={I18n.t('Edit device')}>
                    <IconButton onClick={() => {
                        this.setState(
                            {
                                editDialog: {
                                    type: 'device',
                                    name: getText(device.name),
                                    originalName: getText(device.name),
                                    bridgeIndex,
                                    device: devIndex,
                                    vendorID: false,
                                    productID: false,
                                    noComposed: !!device.noComposed,
                                    originalNoComposed: !!device.noComposed,
                                    originalVendorID: false,
                                    originalProductID: false,
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
            return <Tooltip title={I18n.t('Bridge is not commissioned. Show QR Code got commissioning')}>
                <IconButton
                    style={{ height: 40 }}
                    onClick={() => this.setState({ showQrCode: bridge })}
                >
                    <QrCode />
                </IconButton>
            </Tooltip>;
        }
        if (this.props.bridgeStates[bridge.uuid].status) {
            return <Tooltip title={I18n.t('Device is already commissioning. Show status information')}>
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
                sx={theme => (
                    {
                        backgroundColor: theme.palette.secondary.main,
                        '&>td:first-child': {
                            borderTopLeftRadius: 4,
                            borderBottomLeftRadius: 4,
                        },
                        '&>td:last-child': {
                            borderTopRightRadius: 4,
                            borderBottomRightRadius: 4,
                        },
                        opacity: bridge.enabled ? 1 : 0.4,
                    }
                )}
            >
                <TableCell style={{ width: 0 }}>
                    <IconButton
                        size="small"
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
                    className={this.props.classes.bridgeHeader}
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
                <TableCell style={{ width: 0 }}>
                    <Tooltip title={bridge.enabled && !allowDisable ? I18n.t('At least one bridge must be enabled') : I18n.t('Enable/disable bridge')}>
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
                <TableCell style={{ width: 0 }}>
                    <Tooltip title={I18n.t('Edit bridge')}>
                        <IconButton onClick={e => {
                            e.stopPropagation();
                            this.setState(
                                {
                                    editDialog: {
                                        type: 'bridge',
                                        name: getText(bridge.name),
                                        originalName: getText(bridge.name),
                                        bridgeIndex,
                                        vendorID: bridge.vendorID,
                                        originalVendorID: bridge.vendorID,
                                        productID: bridge.productID,
                                        originalProductID: bridge.productID,
                                        noComposed: false,
                                        originalNoComposed: false,
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
                    <Tooltip
                        title={bridge.enabled && !allowDisable ? I18n.t('At least one enabled bridge must exist') : I18n.t('Delete bridge')}
                    >
                        <span>
                            <IconButton
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
                    <TableCell style={{ border: 0, opacity: bridge.enabled ? 1 : 0.5 }}>
                        <b>{I18n.t('Devices')}</b>
                        <Tooltip title={I18n.t('Add device')}>
                            <IconButton onClick={async () => {
                                const isLicenseOk = await this.props.checkLicenseOnAdd('addDeviceToBridge');
                                if (!isLicenseOk) {
                                    this.props.alive && this.props.showToast('You need ioBroker.pro assistant or remote subscription to have more than 5 devices in bridge');
                                    return;
                                }
                                this.setState({
                                    dialog: {
                                        type: 'bridge',
                                        name: getText(bridge.name),
                                        bridge: bridgeIndex,
                                        devices: bridge.list,
                                        addDevices: this.addDevicesToBridge,
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
            {this.renderDeviceDialog()}
            {this.renderDeleteDialog()}
            {this.renderEditDialog()}
            {this.renderQrCodeDialog()}
            {this.renderDebugDialog()}
            <Tooltip title={I18n.t('Add bridge')}>
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
                            editDialog: {
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
                <Tooltip title={I18n.t('Expand all')}>
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
                <Tooltip title={I18n.t('Collapse all')}>
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
            <Table size="small" style={{ width: '100%', maxWidth: 600 }} padding="none">
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
