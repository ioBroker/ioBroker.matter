import { Types } from '@iobroker/type-detector';
import React from 'react';
import { v4 as uuidv4 } from 'uuid';

import {
    Add,
    Close,
    Delete,
    DomainDisabled,
    Edit,
    KeyboardArrowDown,
    KeyboardArrowUp,
    QuestionMark,
    Save,
    SettingsInputAntenna,
    UnfoldLess,
    UnfoldMore,
} from '@mui/icons-material';
import {
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
} from '@mui/material';

import { I18n, SelectID, type IobTheme } from '@iobroker/adapter-react-v5';

import type {
    BridgeDescription,
    BridgeDeviceDescription,
    DetectedDevice,
    DetectedRoom,
    DeviceDescription,
    MatterConfig,
} from '@/types';
import DeviceDialog, { DEVICE_ICONS, SUPPORTED_DEVICES } from '../components/DeviceDialog';
import { clone, detectDevices, getText } from '../Utils';
import BridgesAndDevices, {
    STYLES,
    type BridgesAndDevicesProps,
    type BridgesAndDevicesState,
} from './BridgesAndDevices';

const styles: Record<string, any> = {
    ...STYLES,
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
    devicesHeader: (theme: IobTheme) => ({
        backgroundColor: theme.palette.mode === 'dark' ? '#3e3d3d' : '#c0c0c0',
    }),
    bridgeButtonsAndTitle: (theme: IobTheme) => ({
        backgroundColor: theme.palette.secondary.main,
        color: theme.palette.secondary.contrastText,
    }),
    bridgeButtonsAndTitleColor: (theme: IobTheme) => ({
        color: theme.palette.secondary.contrastText,
    }),
};

interface BridgesProps extends BridgesAndDevicesProps {
    checkLicenseOnAdd: (
        type: 'addBridge' | 'addDevice' | 'addDeviceToBridge',
        config?: MatterConfig,
    ) => Promise<boolean>;
}

interface BridgesState extends BridgesAndDevicesState {
    editBridgeDialog: {
        type: 'bridge';
        name: string;
        originalName: string;
        bridgeIndex?: number;
        vendorID: string;
        originalVendorID: string;
        productID: string;
        originalProductID: string;
        add?: boolean;
    } | null;
    editDeviceDialog: {
        type: 'device';
        name: string;
        originalName: string;
        auto: boolean;
        deviceType: Types | '';
        originalDeviceType: string;
        bridgeIndex: number;
        device: number;
        noComposed: boolean;
        originalNoComposed: boolean;
        dimmerOnLevel: number;
        originalDimmerOnLevel: number;
        dimmerUseLastLevelForOn: boolean;
        originalDimmerUseLastLevelForOn: boolean;
        actionAllowedByIdentify: boolean;
        originalActionAllowedByIdentify: boolean;
        hasOnState: boolean;
    } | null;
    addDeviceDialog: {
        bridgeIndex: number;
        noAutoDetect: boolean;
        name: string;
        devices: BridgeDeviceDescription[];
    } | null;
    addCustomDeviceDialog: {
        oid: string;
        name: string;
        deviceType: Types | '';
        bridgeIndex: number;
        hasOnState?: boolean;
    } | null;
    bridgesOpened: Record<string, boolean>;
    deleteDialog: {
        deviceIndex?: number;
        bridgeIndex: number;
        name: string;
        type: 'bridge' | 'device';
    } | null;
    suppressDeleteTime: number;
    suppressDeleteEnabled: boolean;
}

export class Bridges extends BridgesAndDevices<BridgesProps, BridgesState> {
    private bridgeIndex: number | null = null;

    constructor(props: BridgesProps) {
        super(props);
        let bridgesOpened: Record<string, boolean> = {};
        try {
            const bridgesOpenedStr = window.localStorage.getItem(`matter.${props.instance}.bridgesOpened`);
            if (bridgesOpenedStr) {
                bridgesOpened = JSON.parse(bridgesOpenedStr) || {};
            }
        } catch {
            //
        }

        Object.assign(this.state, {
            addDeviceDialog: null,
            editBridgeDialog: null,
            editDeviceDialog: null,
            bridgesOpened,
        });
    }

    componentDidMount() {
        super.componentDidMount();

        if (!this.props.matter.bridges.length) {
            setTimeout(() => {
                const matter = clone(this.props.matter);
                matter.bridges.push({
                    name: I18n.t('Default bridge'),
                    enabled: true,
                    vendorID: '0xFFF1',
                    productID: '0x8000',
                    list: [],
                    uuid: uuidv4(),
                });
                this.props.updateConfig(matter);
            }, 100);
        }
    }

    async addDevicesToBridge(devices: DetectedDevice[], bridgeIndex: number, isAutoDetected: boolean) {
        const matter = clone(this.props.matter);
        const bridge = matter.bridges[bridgeIndex];
        for (let d = 0; d < devices.length; d++) {
            const device = devices[d];
            if (!bridge.list.find(dd => dd.oid === device._id)) {
                if (await this.props.checkLicenseOnAdd('addDeviceToBridge', matter)) {
                    const obj: BridgeDeviceDescription = {
                        uuid: uuidv4(),
                        name: getText(device.common.name),
                        oid: device._id,
                        type: device.deviceType,
                        enabled: true,
                        noComposed: true,
                        auto: isAutoDetected,
                        actionAllowedByIdentify: false,
                    };
                    if (device.deviceType === Types.dimmer) {
                        obj.hasOnState = device.hasOnState;
                        obj.actionAllowedByIdentify = true;
                    } else if (device.deviceType === Types.light) {
                        obj.actionAllowedByIdentify = true;
                    }

                    bridge.list.push(obj);
                }
            }
        }

        this.props.updateConfig(matter);
    }

    renderBridgeEditDialog() {
        if (!this.state.editBridgeDialog) {
            return null;
        }
        const isCommissioned =
            !!this.props.commissioning[this.props.matter.bridges[this.state.editBridgeDialog.bridgeIndex || 0].uuid];

        const save = () => {
            if (!this.state.editBridgeDialog) {
                return;
            }
            const matter = clone(this.props.matter);
            if (this.state.editBridgeDialog.add) {
                matter.bridges.push({
                    name: this.state.editBridgeDialog.name,
                    enabled: true,
                    productID: this.state.editBridgeDialog.productID,
                    vendorID: this.state.editBridgeDialog.vendorID,
                    list: [],
                    uuid: uuidv4(),
                });
            } else if (this.state.editBridgeDialog.bridgeIndex !== undefined) {
                matter.bridges[this.state.editBridgeDialog.bridgeIndex].name = this.state.editBridgeDialog.name;
                matter.bridges[this.state.editBridgeDialog.bridgeIndex].productID =
                    this.state.editBridgeDialog.productID;
                matter.bridges[this.state.editBridgeDialog.bridgeIndex].vendorID = this.state.editBridgeDialog.vendorID;
            }

            this.setState({ editBridgeDialog: null }, () => this.props.updateConfig(matter));
        };

        const isDisabled =
            this.state.editBridgeDialog.name === this.state.editBridgeDialog.originalName &&
            this.state.editBridgeDialog.vendorID === this.state.editBridgeDialog.originalVendorID &&
            this.state.editBridgeDialog.productID === this.state.editBridgeDialog.originalProductID;

        return (
            <Dialog onClose={() => this.setState({ editBridgeDialog: null })} open={!0}>
                <DialogTitle>
                    {this.state.editBridgeDialog.add
                        ? I18n.t('Add bridge')
                        : `${I18n.t('Edit bridge')} "${this.state.editBridgeDialog?.originalName}"`}
                </DialogTitle>
                <DialogContent>
                    <TextField
                        label={I18n.t('Name')}
                        disabled={isCommissioned}
                        value={this.state.editBridgeDialog.name}
                        onChange={e => {
                            const editBridgeDialog = clone(this.state.editBridgeDialog);
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
                            const editBridgeDialog = clone(this.state.editBridgeDialog);
                            editBridgeDialog.vendorID = e.target.value;
                            this.setState({ editBridgeDialog });
                        }}
                        label={I18n.t('Vendor ID')}
                        helperText={<span style={{ display: 'block', height: 20 }} />}
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
                        value={this.state.editBridgeDialog.productID}
                        onChange={e => {
                            const editBridgeDialog = clone(this.state.editBridgeDialog);
                            editBridgeDialog.productID = e.target.value;
                            this.setState({ editBridgeDialog });
                        }}
                        label={I18n.t('Product ID')}
                        helperText={<span style={{ display: 'block', height: 20 }} />}
                        variant="standard"
                    >
                        {this.props.productIDs.map(productID => (
                            <MenuItem key={productID} value={productID}>
                                {productID}
                            </MenuItem>
                        ))}
                    </TextField>
                    {isCommissioned
                        ? I18n.t('Bridge is already commissioned. You cannot change the name or the vendor/product ID.')
                        : null}
                </DialogContent>
                <DialogActions>
                    {!isCommissioned ? (
                        <Button
                            onClick={() => save()}
                            startIcon={this.state.editBridgeDialog.add ? <Add /> : <Save />}
                            disabled={isDisabled}
                            color="primary"
                            variant="contained"
                        >
                            {this.state.editBridgeDialog.add ? I18n.t('Add') : I18n.t('Apply')}
                        </Button>
                    ) : null}
                    <Button
                        onClick={() => this.setState({ editBridgeDialog: null })}
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

    renderDeviceEditDialog() {
        if (!this.state.editDeviceDialog) {
            return null;
        }
        const isCommissioned =
            !!this.props.commissioning[this.props.matter.bridges[this.state.editDeviceDialog.bridgeIndex].uuid];

        const save = () => {
            if (!this.state.editDeviceDialog) {
                return;
            }
            const matter = clone(this.props.matter);
            const device =
                matter.bridges[this.state.editDeviceDialog.bridgeIndex].list[this.state.editDeviceDialog.device];
            device.name = this.state.editDeviceDialog.name;
            if (!device.auto) {
                device.type = this.state.editDeviceDialog.deviceType as Types;
            }

            delete device.dimmerOnLevel;
            delete device.dimmerUseLastLevelForOn;

            if (device.type === 'dimmer') {
                device.dimmerUseLastLevelForOn = this.state.editDeviceDialog.dimmerUseLastLevelForOn;
                if (!device.dimmerUseLastLevelForOn) {
                    device.dimmerOnLevel = this.state.editDeviceDialog.dimmerOnLevel;
                }
            }
            device.actionAllowedByIdentify = this.state.editDeviceDialog.actionAllowedByIdentify;

            this.setState({ editDeviceDialog: null }, () => this.props.updateConfig(matter));
        };

        const isDisabled =
            (this.state.editDeviceDialog.name === this.state.editDeviceDialog.originalName &&
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
                <DialogTitle>{`${I18n.t('Edit device')} "${this.state.editDeviceDialog?.originalName}"`}</DialogTitle>
                <DialogContent>
                    <TextField
                        label={I18n.t('Name')}
                        disabled={isCommissioned}
                        value={this.state.editDeviceDialog.name}
                        onChange={e => {
                            const editDeviceDialog = clone(this.state.editDeviceDialog);
                            editDeviceDialog.name = e.target.value;
                            this.setState({ editDeviceDialog });
                        }}
                        onKeyUp={e => e.key === 'Enter' && !isDisabled && save()}
                        variant="standard"
                        fullWidth
                    />
                    <FormControlLabel
                        disabled={isCommissioned}
                        control={
                            <Checkbox
                                checked={this.state.editDeviceDialog.noComposed}
                                onChange={e => {
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
                                checked={this.state.editDeviceDialog.actionAllowedByIdentify}
                                onChange={e => {
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
                                    checked={this.state.editDeviceDialog.dimmerUseLastLevelForOn}
                                    onChange={e => {
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
                                error={!this.state.editDeviceDialog.dimmerOnLevel}
                                variant="standard"
                                value={this.state.editDeviceDialog.dimmerOnLevel}
                                onChange={e => {
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
                        ? I18n.t('Bridge is already commissioned. You cannot change the name or the vendor/product ID.')
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

    renderDeleteDialog() {
        if (!this.state.deleteDialog) {
            return null;
        }

        if (this.state.suppressDeleteTime && this.state.suppressDeleteTime > Date.now()) {
            setTimeout(() => {
                if (!this.state.deleteDialog) {
                    return;
                }
                const matter: MatterConfig = clone(this.props.matter);
                if (this.state.deleteDialog.type === 'bridge') {
                    matter.bridges[this.state.deleteDialog.bridgeIndex].deleted = true;
                } else if (this.state.deleteDialog.bridgeIndex !== undefined) {
                    matter.bridges[this.state.deleteDialog.bridgeIndex].list.splice(
                        this.state.deleteDialog.deviceIndex || 0,
                        1,
                    );
                }

                this.setState({ deleteDialog: null }, () => this.props.updateConfig(matter));
            }, 50);
            return null;
        }

        return (
            <Dialog onClose={() => this.setState({ deleteDialog: null })} open={!0}>
                <DialogTitle>{I18n.t('Delete')}</DialogTitle>
                <DialogContent>
                    {`${
                        this.state.deleteDialog.type === 'bridge'
                            ? I18n.t('Do you want to delete bridge')
                            : I18n.t('Do you want to delete device')
                    } ${this.state.deleteDialog.name}?`}
                    <FormControlLabel
                        control={
                            <Checkbox
                                checked={this.state.suppressDeleteEnabled}
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
                            if (this.state.deleteDialog) {
                                if (this.state.deleteDialog.type === 'bridge') {
                                    matter.bridges.splice(this.state.deleteDialog.bridgeIndex, 1);
                                } else if (this.state.deleteDialog.bridgeIndex !== undefined) {
                                    matter.bridges[this.state.deleteDialog.bridgeIndex].list.splice(
                                        this.state.deleteDialog.deviceIndex || 0,
                                        1,
                                    );
                                }
                            }
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

    renderAddDeviceDialog() {
        if (!this.state.addDeviceDialog) {
            return null;
        }

        if (this.state.addDeviceDialog.noAutoDetect) {
            this.bridgeIndex = this.state.addDeviceDialog.bridgeIndex;
            return (
                <SelectID
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
                                    bridgeIndex: this.bridgeIndex as number,
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
                                    bridgeIndex: this.bridgeIndex as number,
                                    hasOnState: controls[0].devices[0].hasOnState,
                                },
                            });
                        }
                        this.bridgeIndex = null;
                    }}
                />
            );
        }

        return (
            <DeviceDialog
                onClose={() => this.setState({ addDeviceDialog: null })}
                {...this.state.addDeviceDialog}
                addDevices={(devices: DetectedDevice[]) =>
                    this.addDevicesToBridge(devices, this.state.addDeviceDialog?.bridgeIndex || 0, true)
                }
                matter={this.props.matter}
                socket={this.props.socket}
                detectedDevices={this.props.detectedDevices}
                setDetectedDevices={(detectedDevices: DetectedRoom[]) => this.props.setDetectedDevices(detectedDevices)}
                type="device"
                name={this.props.matter.bridges[this.state.addDeviceDialog.bridgeIndex].name}
            />
        );
    }

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
                                const addCustomDeviceDialog = clone(this.state.addCustomDeviceDialog);
                                addCustomDeviceDialog.deviceType = e.target.value as Types;
                                this.setState({ addCustomDeviceDialog });
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
                </DialogContent>
                <DialogActions>
                    <Button
                        onClick={() => {
                            this.state.addCustomDeviceDialog &&
                                this.addDevicesToBridge(
                                    [
                                        {
                                            _id: this.state.addCustomDeviceDialog.oid,
                                            common: {
                                                name: this.state.addCustomDeviceDialog.name,
                                            },
                                            deviceType: this.state.addCustomDeviceDialog.deviceType as Types,
                                            hasOnState: this.state.addCustomDeviceDialog.hasOnState,
                                            // ignored
                                            type: 'device',
                                            states: [],
                                            roomName: '',
                                        },
                                    ],
                                    this.state.addCustomDeviceDialog.bridgeIndex,
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

    renderDevice(bridge: BridgeDescription, bridgeIndex: number, device: DeviceDescription, devIndex: number) {
        const isLast = devIndex === bridge.list.length - 1;
        return (
            <TableRow key={devIndex} style={{ opacity: device.enabled && bridge.enabled ? 1 : 0.4 }}>
                <TableCell style={{ border: 0, borderBottomLeftRadius: isLast ? 4 : 0 }} />
                <TableCell>
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                        <div style={{ marginRight: 8 }} title={device.type}>
                            {DEVICE_ICONS[device.type] || <QuestionMark />}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <div>
                                {getText(device.name)}
                                <span style={styles.deviceOid}>({device.oid})</span>
                            </div>
                            <div style={styles.deviceType}>{`${I18n.t('Device type')}: ${I18n.t(device.type)}`}</div>
                        </div>
                    </div>
                </TableCell>
                <TableCell />
                <TableCell style={{ width: 0 }}>
                    <Switch
                        checked={device.enabled}
                        onChange={e => {
                            const matter = clone(this.props.matter);
                            matter.bridges[bridgeIndex].list[devIndex].enabled = e.target.checked;
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
                                        auto: !!device.auto,
                                        deviceType: device.type,
                                        originalDeviceType: device.type,
                                        bridgeIndex,
                                        device: devIndex,
                                        noComposed: !!device.noComposed,
                                        originalNoComposed: !!device.noComposed,
                                        dimmerOnLevel: parseFloat(device.dimmerOnLevel as any as string) || 0,
                                        originalDimmerOnLevel: parseFloat(device.dimmerOnLevel as any as string) || 0,
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
                <TableCell style={{ width: 0, borderBottomRightRadius: isLast ? 4 : 0 }}>
                    <Tooltip title={I18n.t('Delete device')} componentsProps={{ popper: { sx: styles.tooltip } }}>
                        <IconButton
                            onClick={() => {
                                this.setState({
                                    deleteDialog: {
                                        type: 'device',
                                        name: getText(device.name),
                                        bridgeIndex,
                                        deviceIndex: devIndex,
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

    renderBridge(bridge: BridgeDescription, bridgeIndex: number) {
        if (bridge.deleted) {
            return null;
        }

        const enabledDevices = bridge.list.filter(d => d.enabled).length;
        let countText: string | null;
        if (!bridge.list.length) {
            countText = null;
        } else if (bridge.list.length !== enabledDevices) {
            countText = `(${enabledDevices}/${bridge.list.length})`;
        } else {
            countText = `(${bridge.list.length})`;
        }

        const allowDisable = this.props.matter.bridges.filter(b => b.enabled).length > 1;

        return (
            <React.Fragment key={bridgeIndex}>
                <TableRow style={{ opacity: bridge.enabled ? 1 : 0.4 }} sx={styles.bridgeButtonsAndTitle}>
                    <TableCell
                        style={{
                            width: 0,
                            borderTopLeftRadius: 4,
                            borderBottomLeftRadius: this.state.bridgesOpened[bridgeIndex] ? 0 : 4,
                        }}
                        sx={styles.bridgeButtonsAndTitle}
                    >
                        <IconButton
                            size="small"
                            sx={styles.bridgeButtonsAndTitleColor}
                            onClick={() => {
                                const bridgesOpened = clone(this.state.bridgesOpened);
                                bridgesOpened[bridgeIndex] = !bridgesOpened[bridgeIndex];
                                window.localStorage.setItem(
                                    `matter.${this.props.instance}.bridgesOpened`,
                                    JSON.stringify(bridgesOpened),
                                );
                                this.setState({ bridgesOpened });
                            }}
                        >
                            {this.state.bridgesOpened[bridgeIndex] ? <KeyboardArrowUp /> : <KeyboardArrowDown />}
                        </IconButton>
                    </TableCell>
                    <TableCell
                        style={styles.bridgeHeader}
                        sx={styles.bridgeButtonsAndTitle}
                        onClick={() => {
                            const bridgesOpened = clone(this.state.bridgesOpened);
                            bridgesOpened[bridgeIndex] = !bridgesOpened[bridgeIndex];
                            window.localStorage.setItem(
                                `matter.${this.props.instance}.bridgesOpened`,
                                JSON.stringify(bridgesOpened),
                            );
                            this.setState({ bridgesOpened });
                        }}
                    >
                        <div style={styles.bridgeDiv}>
                            <div style={styles.bridgeName}>
                                {getText(bridge.name)}
                                <span style={styles.devicesCount}>{countText}</span>
                            </div>
                            <div>
                                <span style={styles.bridgeTitle}>{I18n.t('Vendor ID')}:</span>
                                <span style={styles.bridgeValue}>{bridge.vendorID || ''}</span>
                                <span style={styles.bridgeTitle}>,{I18n.t('Product ID')}:</span>
                                <span style={styles.bridgeValue}>{bridge.productID || ''}</span>
                            </div>
                        </div>
                        <div style={styles.flexGrow} />
                        {this.renderStatus(bridge)}
                    </TableCell>
                    <TableCell style={{ width: 0 }} sx={styles.bridgeButtonsAndTitle} />
                    <TableCell style={{ width: 0 }} sx={styles.bridgeButtonsAndTitle}>
                        <Tooltip
                            title={
                                bridge.enabled && !allowDisable
                                    ? I18n.t('At least one bridge must be enabled')
                                    : I18n.t('Enable/disable bridge')
                            }
                            componentsProps={{ popper: { sx: styles.tooltip } }}
                        >
                            <span>
                                <Switch
                                    disabled={false /* bridge.enabled && !allowDisable */}
                                    checked={bridge.enabled}
                                    onClick={e => e.stopPropagation()}
                                    onChange={e => {
                                        const matter: MatterConfig = clone(this.props.matter);
                                        matter.bridges[bridgeIndex].enabled = e.target.checked;
                                        this.props.updateConfig(matter);
                                    }}
                                />
                            </span>
                        </Tooltip>
                    </TableCell>
                    <TableCell style={{ width: 0 }} sx={styles.bridgeButtonsAndTitle}>
                        <Tooltip title={I18n.t('Edit bridge')} componentsProps={{ popper: { sx: styles.tooltip } }}>
                            <IconButton
                                sx={styles.bridgeButtonsAndTitleColor}
                                onClick={e => {
                                    e.stopPropagation();
                                    this.setState({
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
                                    });
                                }}
                            >
                                <Edit />
                            </IconButton>
                        </Tooltip>
                    </TableCell>
                    <TableCell
                        style={{
                            width: 0,
                            borderTopRightRadius: 4,
                            borderBottomRightRadius: this.state.bridgesOpened[bridgeIndex] ? 0 : 4,
                        }}
                        sx={styles.bridgeButtonsAndTitle}
                    >
                        <Tooltip
                            componentsProps={{ popper: { sx: styles.tooltip } }}
                            title={
                                bridge.enabled && !allowDisable
                                    ? I18n.t('At least one enabled bridge must exist')
                                    : I18n.t('Delete bridge')
                            }
                        >
                            <span>
                                <IconButton
                                    sx={styles.bridgeButtonsAndTitleColor}
                                    disabled={bridge.enabled && !allowDisable}
                                    onClick={e => {
                                        e.stopPropagation();
                                        this.setState({
                                            deleteDialog: {
                                                type: 'bridge',
                                                name: getText(bridge.name),
                                                bridgeIndex,
                                            },
                                        });
                                    }}
                                >
                                    <Delete />
                                </IconButton>
                            </span>
                        </Tooltip>
                    </TableCell>
                </TableRow>
                {this.state.bridgesOpened[bridgeIndex] ? (
                    <>
                        <TableRow>
                            <TableCell style={{ border: 0 }} />
                            <TableCell
                                style={{
                                    fontWeight: 'bold',
                                    opacity: bridge.enabled ? 1 : 0.5,
                                    paddingLeft: 8,
                                }}
                                sx={styles.devicesHeader}
                            >
                                {I18n.t('Devices')}
                            </TableCell>
                            <TableCell
                                style={{
                                    width: 0,
                                    textAlign: 'center',
                                    opacity: bridge.enabled ? 1 : 0.5,
                                }}
                                sx={styles.devicesHeader}
                            >
                                {this.props.alive &&
                                bridge.enabled &&
                                this.props.nodeStates[bridge.uuid]?.status === 'waitingForCommissioning' ? (
                                    <Tooltip
                                        title={I18n.t('Re-announce')}
                                        componentsProps={{ popper: { sx: styles.tooltip } }}
                                    >
                                        <IconButton
                                            onClick={() => {
                                                this.props.socket
                                                    .sendTo(`matter.${this.props.instance}`, 'deviceReAnnounce', {
                                                        uuid: bridge.uuid,
                                                    })
                                                    .then(result => {
                                                        if (result.error) {
                                                            window.alert(`Cannot re-announce: ${result.error}`);
                                                        } else {
                                                            this.props.updateNodeStates({
                                                                [bridge.uuid]: result.result,
                                                            });
                                                        }
                                                    });
                                            }}
                                        >
                                            <SettingsInputAntenna />
                                        </IconButton>
                                    </Tooltip>
                                ) : null}
                            </TableCell>
                            <TableCell
                                style={{
                                    width: 0,
                                    textAlign: 'center',
                                    opacity: bridge.enabled ? 1 : 0.5,
                                }}
                                sx={styles.devicesHeader}
                            >
                                {this.props.alive && bridge.enabled ? (
                                    <Tooltip
                                        title={I18n.t('Reset to factory defaults')}
                                        componentsProps={{ popper: { sx: styles.tooltip } }}
                                    >
                                        <IconButton
                                            onClick={() =>
                                                this.setState({
                                                    showResetDialog: { bridgeOrDevice: bridge, step: 0 },
                                                })
                                            }
                                        >
                                            <DomainDisabled />
                                        </IconButton>
                                    </Tooltip>
                                ) : null}
                            </TableCell>
                            <TableCell
                                style={{ width: 0, opacity: bridge.enabled ? 1 : 0.5 }}
                                sx={styles.devicesHeader}
                            >
                                <Tooltip
                                    title={I18n.t('Add device with auto-detection')}
                                    componentsProps={{ popper: { sx: styles.tooltip } }}
                                >
                                    <IconButton
                                        onClick={async () => {
                                            const isLicenseOk = await this.props.checkLicenseOnAdd('addDeviceToBridge');
                                            if (!isLicenseOk) {
                                                this.props.alive &&
                                                    this.props.showToast(
                                                        I18n.t(
                                                            'You need ioBroker.pro assistant or remote subscription to have more than 5 devices in bridge',
                                                        ),
                                                    );
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
                            <TableCell
                                style={{ width: 0, opacity: bridge.enabled ? 1 : 0.5 }}
                                sx={styles.devicesHeader}
                            >
                                <Tooltip
                                    title={I18n.t('Add device from one state')}
                                    componentsProps={{ popper: { sx: styles.tooltip } }}
                                >
                                    <IconButton
                                        style={{ color: 'gray' }}
                                        onClick={async () => {
                                            const isLicenseOk = await this.props.checkLicenseOnAdd('addDeviceToBridge');
                                            if (!isLicenseOk) {
                                                this.props.alive &&
                                                    this.props.showToast(
                                                        I18n.t(
                                                            'You need ioBroker.pro assistant or remote subscription to have more than 5 devices in bridge',
                                                        ),
                                                    );
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
                        {bridge.list.map((device, devIndex) =>
                            this.renderDevice(bridge, bridgeIndex, device, devIndex),
                        )}
                    </>
                ) : null}
            </React.Fragment>
        );
    }

    render() {
        return (
            <div>
                {this.renderAddDeviceDialog()}
                {this.renderAddCustomDeviceDialog()}
                {this.renderDeleteDialog()}
                {this.renderBridgeEditDialog()}
                {this.renderDeviceEditDialog()}
                {this.renderQrCodeDialog()}
                {this.renderDebugDialog()}
                {this.renderResetDialog()}
                <Tooltip title={I18n.t('Add bridge')} componentsProps={{ popper: { sx: styles.tooltip } }}>
                    <Fab
                        color="primary"
                        size="small"
                        onClick={async () => {
                            const isLicenseOk = await this.props.checkLicenseOnAdd('addBridge');
                            if (!isLicenseOk) {
                                this.props.alive &&
                                    this.props.showToast(
                                        'You need ioBroker.pro assistant or remote subscription to have more than one bridge',
                                    );
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
                            right: 15,
                            bottom: 10,
                        }}
                    >
                        <Add />
                    </Fab>
                </Tooltip>
                {this.props.matter.bridges.length ? (
                    <div>
                        <Tooltip title={I18n.t('Expand all')} componentsProps={{ popper: { sx: styles.tooltip } }}>
                            <span>
                                <IconButton
                                    onClick={() => {
                                        const bridgesOpened = clone(this.state.bridgesOpened);
                                        Object.keys(bridgesOpened).forEach(key => (bridgesOpened[key] = true));
                                        window.localStorage.setItem(
                                            `matter.${this.props.instance}.bridgesOpened`,
                                            JSON.stringify(bridgesOpened),
                                        );
                                        this.setState({ bridgesOpened });
                                    }}
                                    disabled={Object.values(this.state.bridgesOpened).every(v => v === true)}
                                >
                                    <UnfoldMore />
                                </IconButton>
                            </span>
                        </Tooltip>
                        <Tooltip title={I18n.t('Collapse all')} componentsProps={{ popper: { sx: styles.tooltip } }}>
                            <span>
                                <IconButton
                                    onClick={() => {
                                        const bridgesOpened = clone(this.state.bridgesOpened);
                                        Object.keys(bridgesOpened).forEach(key => (bridgesOpened[key] = false));
                                        window.localStorage.setItem(
                                            `matter.${this.props.instance}.bridgesOpened`,
                                            JSON.stringify(bridgesOpened),
                                        );
                                        this.setState({ bridgesOpened });
                                    }}
                                    disabled={Object.values(this.state.bridgesOpened).every(v => v === false)}
                                >
                                    <UnfoldLess />
                                </IconButton>
                            </span>
                        </Tooltip>
                    </div>
                ) : (
                    I18n.t('No bridges created. Create one, by clicking on the "+" button in the bottom right corner.')
                )}
                <Table size="small" style={{ width: '100%', maxWidth: 600 }} padding="none" sx={styles.table}>
                    <TableBody>
                        {this.props.matter.bridges.map((bridge, bridgeIndex) => this.renderBridge(bridge, bridgeIndex))}
                    </TableBody>
                </Table>
            </div>
        );
    }
}

export default Bridges;
