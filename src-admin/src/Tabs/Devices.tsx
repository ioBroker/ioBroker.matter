import { Types } from '@iobroker/type-detector';
import React from 'react';
import { v4 as uuidv4 } from 'uuid';

import {
    Add,
    AutoMode,
    Close,
    Delete,
    DomainDisabled,
    Edit,
    FormatListBulleted,
    Info,
    QuestionMark,
    Save,
} from '@mui/icons-material';
import {
    Box,
    Button,
    Checkbox,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Fab,
    FormControl,
    FormControlLabel,
    IconButton,
    InputLabel,
    MenuItem,
    Select,
    Switch,
    Table,
    TableBody,
    TableCell,
    TableRow,
    TextField,
    Tooltip,
    Typography,
} from '@mui/material';

import { I18n, SelectID } from '@iobroker/adapter-react-v5';

import DeviceDialog, { DEVICE_ICONS, SUPPORTED_DEVICES } from '../components/DeviceDialog';
import type { DetectedDevice, DeviceDescription, MatterConfig } from '../types';
import { clone, detectDevices, getText } from '../Utils';
import BridgesAndDevices, {
    type BridgesAndDevicesProps,
    type BridgesAndDevicesState,
    STYLES,
} from './BridgesAndDevices';

const styles: Record<string, React.CSSProperties> = {
    ...STYLES,
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
};

interface DevicesProps extends BridgesAndDevicesProps {
    checkLicenseOnAdd: (config?: MatterConfig) => Promise<boolean>;
}

interface DevicesState extends BridgesAndDevicesState {
    /** Open Dialog to select further options to add a device */
    addDevicePreDialog: boolean;
    addDeviceDialog: {
        devices: DeviceDescription[];
        noAutoDetect: boolean;
    } | null;
    addCustomDeviceDialog: {
        oid: string;
        name: string;
        deviceType: Types | '';
        vendorID: string;
        productID: string;
        noComposed?: boolean;
        hasOnState?: boolean;
    } | null;
    editDeviceDialog: {
        type: 'device';
        originalDeviceType: Types | '';
        deviceType: Types | '';
        deviceIndex: number;
        name: string;
        originalName: string;
        auto: boolean;
        vendorID: string;
        productID: string;
        originalVendorID: string;
        originalProductID: string;
        originalNoComposed: boolean;
        noComposed: boolean;
        dimmerOnLevel: number;
        originalDimmerOnLevel: number;
        dimmerUseLastLevelForOn: boolean;
        originalDimmerUseLastLevelForOn: boolean;
        actionAllowedByIdentify: boolean;
        originalActionAllowedByIdentify: boolean;
        hasOnState: boolean;
    } | null;
    deleteDialog: {
        deviceIndex: number;
        name: string;
        type: 'device';
    } | null;
    suppressDeleteTime: number;
    suppressDeleteEnabled: boolean;
}

class Devices extends BridgesAndDevices<DevicesProps, DevicesState> {
    constructor(props: DevicesProps) {
        super(props);
        Object.assign(this.state, {
            addDeviceDialog: null,
            addCustomDeviceDialog: null,
            editDeviceDialog: null,
            deleteDialog: null,
            suppressDeleteTime: 0,
            suppressDeleteEnabled: false,
        });
    }

    renderDeleteDialog() {
        if (!this.state.deleteDialog) {
            return null;
        }

        if (this.state.suppressDeleteTime) {
            setTimeout(() => {
                if (this.state.suppressDeleteTime > Date.now()) {
                    if (this.state.deleteDialog) {
                        const matter = clone(this.props.matter);
                        matter.devices[this.state.deleteDialog.deviceIndex].deleted = true;
                        this.setState({ deleteDialog: null }, () => this.props.updateConfig(matter));
                    }
                } else {
                    this.setState({ suppressDeleteTime: 0 });
                }
            }, 50);
            return null;
        }

        return (
            <Dialog onClose={() => this.setState({ deleteDialog: null })} open={!0}>
                <DialogTitle>{I18n.t('Delete')}</DialogTitle>
                <DialogContent>
                    {`${I18n.t('Do you want to delete device')} ${this.state.deleteDialog.name}?`}
                    <FormControlLabel
                        control={
                            <Checkbox
                                checked={!!this.state.suppressDeleteEnabled}
                                onChange={e => this.setState({ suppressDeleteEnabled: e.target.checked })}
                            />
                        }
                        label={I18n.t('Suppress question for 2 minutes')}
                    />
                </DialogContent>
                <DialogActions>
                    <Button
                        onClick={() => {
                            const matter = clone(this.props.matter);
                            this.state.deleteDialog && matter.devices.splice(this.state.deleteDialog.deviceIndex, 1);
                            this.setState(
                                {
                                    deleteDialog: null,
                                    suppressDeleteTime: this.state.suppressDeleteEnabled ? Date.now() + 120_000 : 0,
                                },
                                () => this.props.updateConfig(matter),
                            );
                        }}
                        startIcon={<Delete />}
                        color="primary"
                        variant="contained"
                    >
                        {I18n.t('Delete')}
                    </Button>
                    <Button
                        onClick={() => this.setState({ deleteDialog: null })}
                        startIcon={<Close />}
                        color="grey"
                        variant="contained"
                    >
                        {I18n.t('Cancel')}
                    </Button>
                </DialogActions>
            </Dialog>
        );
    }

    renderEditDeviceDialog() {
        if (!this.state.editDeviceDialog) {
            return null;
        }

        const isCommissioned =
            !!this.props.commissioning[this.props.matter.devices[this.state.editDeviceDialog.deviceIndex].uuid];

        const save = () => {
            if (!this.state.editDeviceDialog) {
                return;
            }
            const matter = clone(this.props.matter);
            const device: DeviceDescription = matter.devices[this.state.editDeviceDialog.deviceIndex];
            device.name = this.state.editDeviceDialog.name;
            device.productID = this.state.editDeviceDialog.productID;
            device.vendorID = this.state.editDeviceDialog.vendorID;
            device.noComposed = this.state.editDeviceDialog.noComposed;
            if (!device.auto) {
                device.type = this.state.editDeviceDialog.deviceType as Types;
            }

            delete device.dimmerUseLastLevelForOn;
            delete device.dimmerOnLevel;
            device.actionAllowedByIdentify = this.state.editDeviceDialog.actionAllowedByIdentify;

            if (device.type === 'dimmer') {
                if (!device.hasOnState) {
                    device.dimmerUseLastLevelForOn = this.state.editDeviceDialog.dimmerUseLastLevelForOn;
                    if (!device.dimmerUseLastLevelForOn) {
                        device.dimmerOnLevel = this.state.editDeviceDialog.dimmerOnLevel;
                    }
                }
            }

            this.setState({ editDeviceDialog: null }, () => this.props.updateConfig(matter));
        };

        const isDisabled =
            (this.state.editDeviceDialog.name === this.state.editDeviceDialog.originalName &&
                this.state.editDeviceDialog?.vendorID === this.state.editDeviceDialog?.originalVendorID &&
                this.state.editDeviceDialog?.productID === this.state.editDeviceDialog?.originalProductID &&
                this.state.editDeviceDialog.deviceType === this.state.editDeviceDialog.originalDeviceType &&
                this.state.editDeviceDialog.dimmerOnLevel === this.state.editDeviceDialog.originalDimmerOnLevel &&
                this.state.editDeviceDialog.dimmerUseLastLevelForOn ===
                    this.state.editDeviceDialog.originalDimmerUseLastLevelForOn &&
                this.state.editDeviceDialog.actionAllowedByIdentify ===
                    this.state.editDeviceDialog.originalActionAllowedByIdentify &&
                this.state.editDeviceDialog.noComposed === this.state.editDeviceDialog.originalNoComposed) ||
            (!this.state.editDeviceDialog.dimmerUseLastLevelForOn && !this.state.editDeviceDialog.dimmerOnLevel) ||
            !this.state.editDeviceDialog.deviceType;

        return (
            <Dialog onClose={() => this.setState({ editDeviceDialog: null })} open={!0}>
                <DialogTitle>{`${I18n.t('Edit device')} ${this.state.editDeviceDialog?.originalName}`}</DialogTitle>
                <DialogContent>
                    <TextField
                        label={I18n.t('Name')}
                        disabled={isCommissioned}
                        value={this.state.editDeviceDialog.name}
                        onChange={e => {
                            if (!this.state.editDeviceDialog) {
                                return;
                            }

                            const editDeviceDialog = clone(this.state.editDeviceDialog);
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
                            if (!this.state.editDeviceDialog) {
                                return;
                            }

                            const editDeviceDialog = clone(this.state.editDeviceDialog);
                            editDeviceDialog.vendorID = e.target.value;
                            this.setState({ editDeviceDialog });
                        }}
                        label={I18n.t('Vendor ID')}
                        variant="standard"
                    >
                        {['0xFFF1', '0xFFF2', '0xFFF3', '0xFFF4'].map(vendorID => (
                            <MenuItem key={vendorID} value={vendorID}>
                                {vendorID}
                            </MenuItem>
                        ))}
                    </TextField>
                    <TextField
                        select
                        disabled={isCommissioned}
                        style={{ width: 'calc(50% - 8px)', marginTop: 16 }}
                        value={this.state.editDeviceDialog.productID}
                        onChange={e => {
                            if (!this.state.editDeviceDialog) {
                                return;
                            }

                            const editDeviceDialog = clone(this.state.editDeviceDialog);
                            editDeviceDialog.productID = e.target.value;
                            this.setState({ editDeviceDialog });
                        }}
                        label={I18n.t('Product ID')}
                        variant="standard"
                    >
                        {this.props.productIDs.map(productID => (
                            <MenuItem key={productID} value={productID}>
                                {productID}
                            </MenuItem>
                        ))}
                    </TextField>
                    <FormControlLabel
                        control={
                            <Checkbox
                                checked={this.state.editDeviceDialog.noComposed}
                                disabled={isCommissioned}
                                onChange={e => {
                                    if (!this.state.editDeviceDialog) {
                                        return;
                                    }

                                    const editDeviceDialog = clone(this.state.editDeviceDialog);
                                    editDeviceDialog.noComposed = e.target.checked;
                                    this.setState({ editDeviceDialog });
                                }}
                            />
                        }
                        label={
                            <span style={{ fontSize: 'smaller' }}>
                                {I18n.t('Do not compose devices (Alexa does not support composed devices yet)')}
                            </span>
                        }
                    />
                    <FormControl style={{ width: '100%', marginTop: 30 }}>
                        <InputLabel>{I18n.t('Device type')}</InputLabel>
                        <Select
                            variant="standard"
                            disabled={isCommissioned || this.state.editDeviceDialog.auto}
                            value={this.state.editDeviceDialog.deviceType}
                            onChange={e => {
                                if (!this.state.editDeviceDialog) {
                                    return;
                                }

                                const editDeviceDialog = clone(this.state.editDeviceDialog);
                                editDeviceDialog.deviceType = e.target.value as Types;
                                this.setState({ editDeviceDialog });
                            }}
                            renderValue={value => (
                                <span>
                                    <span>{DEVICE_ICONS[value] || <QuestionMark />}</span>
                                    {I18n.t(value)}
                                </span>
                            )}
                        >
                            {Object.keys(Types)
                                .filter(key => SUPPORTED_DEVICES.includes(key as Types))
                                .map(type => (
                                    <MenuItem key={type} value={type}>
                                        <span>{DEVICE_ICONS[type as Types] || <QuestionMark />}</span>
                                        {I18n.t(type)}
                                    </MenuItem>
                                ))}
                        </Select>
                    </FormControl>
                    <FormControlLabel
                        style={{ width: '100%', marginTop: 30 }}
                        label={I18n.t('Allow action by identify')}
                        control={
                            <Checkbox
                                checked={!!this.state.editDeviceDialog.actionAllowedByIdentify}
                                onChange={e => {
                                    if (!this.state.editDeviceDialog) {
                                        return;
                                    }

                                    const editDeviceDialog = clone(this.state.editDeviceDialog);
                                    editDeviceDialog.actionAllowedByIdentify = e.target.checked;
                                    this.setState({ editDeviceDialog });
                                }}
                            />
                        }
                    />
                    {this.state.editDeviceDialog.deviceType === 'dimmer' && !this.state.editDeviceDialog.hasOnState ? (
                        <FormControlLabel
                            style={{ marginTop: 20 }}
                            label={I18n.t('Use last value for ON')}
                            control={
                                <Checkbox
                                    checked={!!this.state.editDeviceDialog.dimmerUseLastLevelForOn}
                                    onChange={e => {
                                        if (!this.state.editDeviceDialog) {
                                            return;
                                        }

                                        const editDeviceDialog = clone(this.state.editDeviceDialog);
                                        editDeviceDialog.dimmerUseLastLevelForOn = e.target.checked;
                                        this.setState({ editDeviceDialog });
                                    }}
                                />
                            }
                        />
                    ) : null}
                    {this.state.editDeviceDialog.deviceType === 'dimmer' &&
                    !this.state.editDeviceDialog.hasOnState &&
                    !this.state.editDeviceDialog.dimmerUseLastLevelForOn ? (
                        <FormControl style={{ width: '100%', marginTop: 30 }}>
                            <InputLabel>{I18n.t('Brightness by ON')}</InputLabel>
                            <Select
                                variant="standard"
                                error={!this.state.editDeviceDialog.dimmerOnLevel}
                                value={this.state.editDeviceDialog.dimmerOnLevel}
                                onChange={e => {
                                    if (!this.state.editDeviceDialog) {
                                        return;
                                    }

                                    const editDeviceDialog = clone(this.state.editDeviceDialog);

                                    editDeviceDialog.dimmerOnLevel = e.target.value as number;
                                    this.setState({ editDeviceDialog });
                                }}
                                renderValue={value => `${value}%`}
                            >
                                {[10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map(type => (
                                    <MenuItem key={type} value={type}>
                                        {`${type}%`}
                                    </MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                    ) : null}
                    {isCommissioned
                        ? I18n.t('Device is already commissioned. You cannot change the name or the vendor/product ID.')
                        : null}
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
                        onClick={() => this.setState({ editDeviceDialog: null })}
                        startIcon={<Close />}
                        color="grey"
                        variant="contained"
                    >
                        {I18n.t('Cancel')}
                    </Button>
                </DialogActions>
            </Dialog>
        );
    }

    addDevices = async (devices: DetectedDevice[], isAutoDetected: boolean) => {
        const matter = clone(this.props.matter);

        for (const device of devices) {
            if (!matter.devices.find(d => d.oid === device._id)) {
                if (await this.props.checkLicenseOnAdd(matter)) {
                    const obj: DeviceDescription = {
                        uuid: uuidv4(),
                        name: getText(device.common.name),
                        oid: device._id,
                        type: device.deviceType,
                        auto: isAutoDetected,
                        productID: device.productID || '0x8000',
                        vendorID: device.vendorID || '0xFFF1',
                        noComposed: true,
                        enabled: true,
                        actionAllowedByIdentify: false,
                    };
                    if (device.deviceType === Types.dimmer) {
                        obj.hasOnState = device.hasOnState;
                        obj.actionAllowedByIdentify = true;
                    } else if (device.deviceType === 'light') {
                        obj.actionAllowedByIdentify = true;
                    }
                    matter.devices.push(obj);
                }
            }
        }

        this.props.updateConfig(matter);
    };

    renderAddCustomDeviceDialog() {
        if (!this.state.addCustomDeviceDialog) {
            return null;
        }
        return (
            <Dialog open={!0} onClose={() => this.setState({ addCustomDeviceDialog: null })}>
                <DialogTitle>{I18n.t('Configure custom device')}</DialogTitle>
                <DialogContent>
                    <TextField
                        label={I18n.t('Name')}
                        value={this.state.addCustomDeviceDialog.name}
                        onChange={e => {
                            if (!this.state.addCustomDeviceDialog) {
                                return;
                            }

                            const addCustomDeviceDialog = clone(this.state.addCustomDeviceDialog);
                            addCustomDeviceDialog.name = e.target.value;
                            this.setState({ addCustomDeviceDialog });
                        }}
                        variant="standard"
                        fullWidth
                    />
                    <FormControl style={{ width: '100%', marginTop: 30 }}>
                        <InputLabel
                            style={
                                this.state.addCustomDeviceDialog.deviceType
                                    ? { transform: 'translate(0px, -9px) scale(0.75)' }
                                    : undefined
                            }
                        >
                            {I18n.t('Device type')}
                        </InputLabel>
                        <Select
                            variant="standard"
                            value={this.state.addCustomDeviceDialog.deviceType}
                            onChange={e => {
                                if (!this.state.addCustomDeviceDialog) {
                                    return;
                                }

                                const addCustomDeviceDialog = clone(this.state.addCustomDeviceDialog);
                                addCustomDeviceDialog.deviceType = e.target.value as Types;
                                this.setState({ addCustomDeviceDialog });
                            }}
                        >
                            {Object.keys(Types)
                                .filter(key => SUPPORTED_DEVICES.includes(key as Types))
                                .map(type => (
                                    <MenuItem key={type} value={type}>
                                        {I18n.t(type)}
                                    </MenuItem>
                                ))}
                        </Select>
                    </FormControl>
                    <TextField
                        select
                        style={{ width: 'calc(50% - 8px)', marginRight: 16, marginTop: 16 }}
                        value={this.state.addCustomDeviceDialog.vendorID}
                        onChange={e => {
                            if (!this.state.addCustomDeviceDialog) {
                                return;
                            }

                            const addCustomDeviceDialog = clone(this.state.addCustomDeviceDialog);
                            addCustomDeviceDialog.vendorID = e.target.value;
                            this.setState({ addCustomDeviceDialog });
                        }}
                        label={I18n.t('Vendor ID')}
                        variant="standard"
                    >
                        {['0xFFF1', '0xFFF2', '0xFFF3', '0xFFF4'].map(vendorID => (
                            <MenuItem key={vendorID} value={vendorID}>
                                {vendorID}
                            </MenuItem>
                        ))}
                    </TextField>
                    <TextField
                        select
                        style={{ width: 'calc(50% - 8px)', marginTop: 16 }}
                        value={this.state.addCustomDeviceDialog.productID}
                        onChange={e => {
                            if (!this.state.addCustomDeviceDialog) {
                                return;
                            }

                            const addCustomDeviceDialog = clone(this.state.addCustomDeviceDialog);
                            addCustomDeviceDialog.productID = e.target.value;
                            this.setState({ addCustomDeviceDialog });
                        }}
                        label={I18n.t('Product ID')}
                        variant="standard"
                    >
                        {this.props.productIDs.map(productID => (
                            <MenuItem key={productID} value={productID}>
                                {productID}
                            </MenuItem>
                        ))}
                    </TextField>
                    <FormControlLabel
                        control={
                            <Checkbox
                                checked={this.state.addCustomDeviceDialog.noComposed}
                                onChange={e => {
                                    if (!this.state.addCustomDeviceDialog) {
                                        return;
                                    }

                                    const addCustomDeviceDialog = clone(this.state.addCustomDeviceDialog);
                                    addCustomDeviceDialog.noComposed = e.target.checked;
                                    this.setState({ addCustomDeviceDialog });
                                }}
                            />
                        }
                        label={
                            <span style={{ fontSize: 'smaller' }}>
                                {I18n.t('Do not compose devices (Alexa does not support composed devices yet)')}
                            </span>
                        }
                    />
                </DialogContent>
                <DialogActions>
                    <Button
                        onClick={() => {
                            this.state.addCustomDeviceDialog &&
                                this.addDevices(
                                    [
                                        {
                                            _id: this.state.addCustomDeviceDialog.oid,
                                            common: {
                                                name: this.state.addCustomDeviceDialog.name,
                                            },
                                            deviceType: this.state.addCustomDeviceDialog.deviceType as Types,
                                            hasOnState: !!this.state.addCustomDeviceDialog.hasOnState,
                                            // ignored
                                            type: 'device',
                                            states: [],
                                            roomName: '',
                                        },
                                    ],
                                    false,
                                );

                            this.setState({ addCustomDeviceDialog: null });
                        }}
                        startIcon={<Add />}
                        disabled={!this.state.addCustomDeviceDialog.deviceType}
                        color="primary"
                        variant="contained"
                    >
                        {I18n.t('Add')}
                    </Button>
                    <Button
                        onClick={() => this.setState({ addCustomDeviceDialog: null })}
                        startIcon={<Close />}
                        color="grey"
                        variant="contained"
                    >
                        {I18n.t('Cancel')}
                    </Button>
                </DialogActions>
            </Dialog>
        );
    }

    /**
     * Render dialog to select if devices should be added from state or detected automatically
     */
    renderAddDevicesPreDialog(): React.ReactNode {
        if (!this.state.addDevicePreDialog) {
            return null;
        }

        return (
            <Dialog open={!0} onClose={() => this.setState({ addDevicePreDialog: false })}>
                <DialogTitle>{I18n.t('Add device')}</DialogTitle>
                <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    <Button
                        onClick={() => {
                            this.setState({
                                addDevicePreDialog: false,
                                addDeviceDialog: {
                                    devices: this.props.matter.devices,
                                    noAutoDetect: false,
                                },
                            });
                        }}
                        startIcon={<AutoMode />}
                        color="primary"
                        variant="contained"
                        sx={{ justifyContent: 'flex-start' }}
                    >
                        {I18n.t('Add device with auto-detection')}
                    </Button>
                    <Button
                        onClick={() => {
                            this.setState({
                                addDevicePreDialog: false,
                                addDeviceDialog: {
                                    devices: this.props.matter.devices,
                                    noAutoDetect: true,
                                },
                            });
                        }}
                        startIcon={<FormatListBulleted />}
                        color="primary"
                        variant="contained"
                        sx={{ justifyContent: 'flex-start' }}
                    >
                        {I18n.t('Add device from one state')}
                    </Button>
                </DialogContent>
            </Dialog>
        );
    }

    renderAddDevicesDialog() {
        if (!this.state.addDeviceDialog) {
            return null;
        }

        if (this.state.addDeviceDialog.noAutoDetect) {
            return (
                <SelectID
                    types={['device', 'channel', 'state']}
                    dialogName="matter"
                    themeType={this.props.themeType}
                    socket={this.props.socket}
                    theme={this.props.theme}
                    onClose={() => this.setState({ addDeviceDialog: null })}
                    onOk={async (_oid, name) => {
                        const oid: string | undefined = Array.isArray(_oid) ? _oid[0] : (_oid as string);
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
                />
            );
        }

        return (
            <DeviceDialog
                onClose={() => this.setState({ addDeviceDialog: null })}
                addDevices={(devices: DetectedDevice[]) => this.addDevices(devices, true)}
                matter={this.props.matter}
                socket={this.props.socket}
                detectedDevices={this.props.detectedDevices}
                setDetectedDevices={detectedDevices => this.props.setDetectedDevices(detectedDevices)}
                type="device"
            />
        );
    }

    /**
     * Render a single device in a table
     * @param device the device description
     * @param index table index
     */
    renderDevice(device: DeviceDescription, index: number): React.JSX.Element | null {
        if (device.deleted) {
            return null;
        }

        return (
            <TableRow key={index} style={{ opacity: device.enabled ? 1 : 0.4 }}>
                <TableCell>
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                        <span style={{ marginRight: 8 }} title={device.type}>
                            {DEVICE_ICONS[device.type] || <QuestionMark />}
                        </span>
                        <div style={styles.bridgeDiv}>
                            <div style={styles.deviceName}>
                                {getText(device.name)}
                                <span style={styles.deviceOid}>({device.oid})</span>
                            </div>
                            <div>
                                <span style={styles.deviceTitle}>{I18n.t('Vendor ID')}:</span>
                                <span style={styles.deviceValue}>{device.vendorID || ''},</span>
                                <span style={styles.deviceTitle}>{I18n.t('Product ID')}:</span>
                                <span style={styles.deviceValue}>{device.productID || ''},</span>
                                <span style={styles.deviceType}>{I18n.t('Device type')}:</span>
                                <span style={styles.deviceType}>{I18n.t(device.type)}</span>
                            </div>
                        </div>
                    </div>
                </TableCell>
                <TableCell style={{ width: 0 }}>{this.renderStatus(device)}</TableCell>
                <TableCell style={{ width: 0 }}>
                    <Switch
                        checked={device.enabled}
                        onChange={e => {
                            const matter = clone(this.props.matter);
                            matter.devices[index].enabled = e.target.checked;
                            this.props.updateConfig(matter);
                        }}
                    />
                </TableCell>
                <TableCell style={{ width: 0 }}>
                    <Tooltip title={I18n.t('Edit device')} componentsProps={{ popper: { sx: styles.tooltip } }}>
                        <IconButton
                            onClick={() => {
                                this.setState({
                                    editDeviceDialog: {
                                        type: 'device',
                                        name: getText(device.name),
                                        originalName: getText(device.name),
                                        deviceIndex: index,
                                        auto: !!device.auto,
                                        deviceType: device.type,
                                        originalDeviceType: device.type,
                                        vendorID: device.vendorID || '',
                                        productID: device.productID || '',
                                        originalVendorID: device.vendorID || '',
                                        originalProductID: device.productID || '',
                                        originalNoComposed: !!device.noComposed,
                                        noComposed: !!device.noComposed,
                                        dimmerOnLevel: Number(device.dimmerOnLevel) || 0,
                                        originalDimmerOnLevel: Number(device.dimmerOnLevel) || 0,
                                        dimmerUseLastLevelForOn: !!device.dimmerUseLastLevelForOn,
                                        originalDimmerUseLastLevelForOn: !!device.dimmerUseLastLevelForOn,
                                        actionAllowedByIdentify: !!device.actionAllowedByIdentify,
                                        originalActionAllowedByIdentify: !!device.actionAllowedByIdentify,
                                        hasOnState: !!device.hasOnState,
                                    },
                                });
                            }}
                        >
                            <Edit />
                        </IconButton>
                    </Tooltip>
                </TableCell>
                <TableCell style={{ width: 0 }}>
                    {this.props.alive ? (
                        <Tooltip
                            title={I18n.t('Reset to factory defaults')}
                            componentsProps={{ popper: { sx: styles.tooltip } }}
                        >
                            <IconButton
                                onClick={() =>
                                    this.setState({
                                        showResetDialog: { bridgeOrDevice: device, step: 0 },
                                    })
                                }
                            >
                                <DomainDisabled />
                            </IconButton>
                        </Tooltip>
                    ) : null}
                </TableCell>
                <TableCell style={{ width: 0 }} />
                <TableCell style={{ width: 0 }}>
                    <Tooltip title={I18n.t('Delete device')} componentsProps={{ popper: { sx: styles.tooltip } }}>
                        <IconButton
                            onClick={() => {
                                this.setState({
                                    deleteDialog: {
                                        type: 'device',
                                        name: getText(device.name),
                                        deviceIndex: index,
                                    },
                                });
                            }}
                        >
                            <Delete />
                        </IconButton>
                    </Tooltip>
                </TableCell>
            </TableRow>
        );
    }

    render() {
        return (
            <div>
                {this.renderDeleteDialog()}
                {this.renderEditDeviceDialog()}
                {this.renderAddDevicesPreDialog()}
                {this.renderAddDevicesDialog()}
                {this.renderAddCustomDeviceDialog()}
                {this.renderDebugDialog()}
                {this.renderQrCodeDialog()}
                {this.renderResetDialog()}
                <Box sx={styles.infoBox}>
                    <Info />
                    <Typography sx={{ whiteSpace: 'pre' }}>
                        {I18n.t(
                            'Additionally to bridges you can also expose ioBroker states as stand alone matter devices. They can all be paired individually. You should prefer to use bridges.',
                        )}
                    </Typography>
                </Box>
                <Tooltip title={I18n.t('Add device')} componentsProps={{ popper: { sx: styles.tooltip } }}>
                    <Fab
                        color="primary"
                        size="small"
                        onClick={() =>
                            this.setState({
                                addDevicePreDialog: true,
                            })
                        }
                        style={{
                            position: 'absolute',
                            right: 15,
                            bottom: 10,
                        }}
                    >
                        <Add />
                    </Fab>
                </Tooltip>
                {!this.props.matter.devices.length ? (
                    I18n.t(
                        'No one device created. Create one, by clicking on the "+" button in the bottom right corner.',
                    )
                ) : (
                    <Table size="small" style={{ width: '100%' }} padding="none">
                        <TableBody>
                            {this.props.matter.devices.map((device, index) => this.renderDevice(device, index))}
                        </TableBody>
                    </Table>
                )}
            </div>
        );
    }
}

export default Devices;
