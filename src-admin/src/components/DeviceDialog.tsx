import React, { Component } from 'react';

import {
    Accordion,
    AccordionDetails,
    AccordionSummary,
    Button,
    Checkbox,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    IconButton as MuiIconButton,
    LinearProgress,
    MenuItem,
    Switch,
    TextField,
    Tooltip,
} from '@mui/material';

import { Add, Close, ExpandMore } from '@mui/icons-material';

import {
    type AdminConnection,
    I18n,
    Icon,
    type IobTheme,
    type ThemeType,
    DeviceTypeIcon,
    IconExpert,
} from '@iobroker/adapter-react-v5';
import { Types } from '@iobroker/type-detector';

import { clone, detectDevices, getText } from '../Utils';
import type { DetectedDevice, DetectedRoom, MatterConfig } from '../types';

export const SUPPORTED_DEVICES: Types[] = [
    Types.blind,
    Types.blindButtons,
    Types.button,
    Types.buttonSensor,
    Types.cie,
    Types.ct,
    Types.dimmer,
    Types.door,
    Types.floodAlarm,
    Types.hue,
    Types.humidity,
    Types.illuminance,
    Types.light,
    Types.lock,
    Types.motion,
    Types.rgb,
    Types.rgbSingle,
    Types.rgbwSingle,
    Types.socket,
    Types.temperature,
    Types.thermostat,
    Types.window,
];

const productIds: string[] = [];
for (let i = 0x8000; i <= 0x801f; i++) {
    productIds.push(`0x${i.toString(16)}`);
}

const styles: Record<string, any> = {
    dialogContent: {
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
        overflow: 'hidden',
    },
    header: {
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
        overflow: 'hidden',
    },
    summaryDiv: {
        display: 'flex',
        alignItems: 'center',
        width: '100%',
    },
    icon: {
        width: 24,
        height: 24,
        marginRight: 8,
    },
    flexGrow: {
        flexGrow: 1,
    },
    selectedText: {
        fontSize: 12,
        opacity: 0.7,
        marginLeft: 20,
        minWidth: 160,
    },
    details: (theme: IobTheme) => ({
        backgroundColor: theme.palette.mode === 'dark' ? '#111' : '#eee',
    }),
    summaryBody: {
        display: 'flex',
        alignItems: 'center',
        marginLeft: 20,
        marginBottom: 20,
        gap: 4,
    },
    spaceHolder: {
        display: 'block',
        height: 20,
    },
    flex: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
    },
    firstTitle: {
        marginRight: 8,
        width: 'calc(50% - 40px)',
        // flexGrow: 1,
        textAlign: 'right',
    },
    secondTitle: {
        marginLeft: 8,
        width: 'calc(50% - 40px)',
        // flexGrow: 1,
    },
};

interface DeviceDialogProps {
    /** Undefined if no detection ran yet */
    detectedDevices?: DetectedRoom[];
    matter: MatterConfig;
    socket: AdminConnection;
    setDetectedDevices: (detectedDevices: DetectedRoom[]) => void;
    addDevices: (devices: DetectedDevice[]) => void;
    onClose: () => void;
    type: 'bridge' | 'device';
    name?: ioBroker.StringOrTranslated;
    devicesInBridge?: number;
    /** If dialog should check the number of devices */
    checkAddedDevices?: number;
    themeType: ThemeType;
    expertMode: boolean;
    setExpertMode: (expertMode: boolean) => void;
}

interface DeviceDialogState {
    rooms: DetectedRoom[] | null;
    devicesChecked: Record<string, boolean>;
    roomsChecked: Record<string, boolean>;
    usedDevices: Record<string, boolean>;
    ignoreUsedDevices: boolean;
    useRoomNames: boolean;
    showUnsupported: boolean;
    deviceNames: Record<string, string>;
    deviceRoomTypeNames: Record<string, string>;
    expanded: string[];
    showCommissioningHint: DetectedDevice[] | null;
}

class DeviceDialog extends Component<DeviceDialogProps, DeviceDialogState> {
    constructor(props: DeviceDialogProps) {
        super(props);
        const expandedStr = window.localStorage.getItem('matter.expanded') || '[]';
        let expanded: string[];
        try {
            expanded = JSON.parse(expandedStr);
        } catch {
            expanded = [];
        }

        this.state = {
            rooms: null,
            devicesChecked: {},
            roomsChecked: {},
            usedDevices: {},
            ignoreUsedDevices: window.localStorage.getItem('matter.ignoreUsedDevices') !== 'false',
            useRoomNames: window.localStorage.getItem('matter.useRoomNames') !== 'false',
            showUnsupported: window.localStorage.getItem('matter.showUnsupported') === 'true',
            deviceNames: {},
            deviceRoomTypeNames: {},
            showCommissioningHint: null,
            expanded,
        };
    }

    async componentDidMount(): Promise<void> {
        const detectedDevices =
            this.props.detectedDevices || (await detectDevices(this.props.socket, I18n.getLanguage()));

        if (!this.props.detectedDevices) {
            setTimeout(() => this.props.setDetectedDevices(detectedDevices), 100);
        }

        let rooms = clone(detectedDevices);

        // ignore buttons
        rooms.forEach(room => (room.devices = room.devices.filter(device => device.common.role !== 'button')));

        // ignore empty rooms
        rooms = rooms.filter(room => room.devices.length);

        // Fix names
        rooms.forEach(room => {
            room.devices.forEach(device => {
                // Device.Name.Room => Device Name Room
                device.common.name = (getText(device.common.name) || '').replace(/\./g, ' ').trim();
                // delete room name from device name
                if (device.roomName) {
                    device.common.name = device.common.name.replace(getText(device.roomName), '').trim();
                }
            });
        });

        const _checked: Record<string, boolean> = {};
        const devicesChecked: Record<string, boolean> = {};
        const roomsChecked: Record<string, boolean> = {};
        const deviceNames: Record<string, string> = {};
        const deviceRoomTypeNames: Record<string, string> = {};
        rooms.forEach(room => {
            roomsChecked[room._id] = true;
            room.devices.forEach(device => {
                devicesChecked[device._id] = false;
                device.vendorID = '0xFFF1';
                device.productID = '0x8000';
                device.states.forEach(state => (_checked[state._id] = true));
                deviceNames[device._id] = getText(device.common.name);
                deviceRoomTypeNames[device._id] = `${getText(room.common.name)} ${I18n.t(device.deviceType)}`;
                device.common.name = this.state.useRoomNames
                    ? deviceRoomTypeNames[device._id]
                    : deviceNames[device._id];
            });
        });

        const usedDevices: Record<string, boolean> = {};
        this.props.matter.devices.forEach(device => (usedDevices[device.oid] = true));

        this.props.matter.bridges.forEach(bridge => bridge.list.forEach(device => (usedDevices[device.oid] = true)));

        this.setState({
            rooms,
            devicesChecked,
            roomsChecked,
            usedDevices,
            deviceNames,
            deviceRoomTypeNames,
        });
    }

    handleSubmit = (): void => {
        const devices: DetectedDevice[] = [];
        this.state.rooms?.forEach(room => {
            room.devices.forEach(device => {
                if (this.state.devicesChecked[device._id]) {
                    devices.push(device);
                }
            });
        });

        if (
            this.props.checkAddedDevices &&
            devices.length &&
            (this.props.devicesInBridge || 0) + devices.length > this.props.checkAddedDevices
        ) {
            this.setState({ showCommissioningHint: devices });
        } else {
            this.props.addDevices(devices);
            this.props.onClose();
        }
    };

    renderCommissioningHintDialog(): React.JSX.Element | null {
        if (!this.state.showCommissioningHint) {
            return null;
        }

        return (
            <Dialog
                onClose={() => this.setState({ showCommissioningHint: null })}
                open={!0}
            >
                <DialogTitle>{I18n.t('Warning')}</DialogTitle>
                <DialogContent>{I18n.t('Warning about 15 devices')}</DialogContent>
                <DialogActions>
                    <Button
                        onClick={() => {
                            if (this.state.showCommissioningHint) {
                                const devices: DetectedDevice[] = this.state.showCommissioningHint;
                                this.setState({ showCommissioningHint: null }, () => {
                                    this.props.addDevices(devices);
                                    this.props.onClose();
                                });
                            }
                        }}
                        startIcon={<Add />}
                        color="primary"
                        variant="contained"
                    >
                        {I18n.t('Add')}
                    </Button>
                    <Button
                        onClick={() => this.setState({ showCommissioningHint: null })}
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

    renderDevice(
        roomIndex: number,
        room: DetectedRoom,
        deviceIndex: number,
        device: DetectedDevice,
    ): React.JSX.Element | null {
        const supported = SUPPORTED_DEVICES.includes(device.deviceType);

        if (!supported && !this.state.showUnsupported) {
            return null;
        }

        return (
            <div
                key={device._id}
                style={{
                    backgroundColor: 'transparent',
                    opacity: supported ? 1 : 0.3,
                }}
            >
                {supported ? null : <div style={{ marginLeft: 20 }}>{I18n.t('Not supported yet')}</div>}
                <div
                    style={{
                        ...styles.summaryBody,
                        opacity: this.state.roomsChecked[room._id] ? 1 : 0.5,
                    }}
                >
                    <Checkbox
                        checked={this.state.devicesChecked[device._id]}
                        disabled={!supported}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                            const devicesChecked = clone(this.state.devicesChecked);
                            devicesChecked[device._id] = e.target.checked;
                            this.setState({ devicesChecked });
                        }}
                        onClick={e => e.stopPropagation()}
                    />
                    <span style={{ marginRight: 8 }}>
                        <DeviceTypeIcon
                            type={device.deviceType}
                            title
                        />
                    </span>
                    <TextField
                        variant="standard"
                        disabled={!supported}
                        fullWidth
                        label={device._id}
                        helperText={
                            <span style={{ fontStyle: 'italic' }}>
                                {`${I18n.t('Device type')}: ${I18n.t(`type-${device.deviceType}`)}`}
                            </span>
                        }
                        value={device.common.name}
                        onChange={e => {
                            if (!this.state.rooms) {
                                return;
                            }

                            const rooms = clone(this.state.rooms);
                            rooms[roomIndex].devices[deviceIndex].common.name = e.target.value;
                            this.setState({ rooms });
                        }}
                    />
                    {this.props.type === 'device' && this.props.expertMode ? (
                        <>
                            <TextField
                                select
                                disabled={!supported}
                                style={{ minWidth: 'initial' }}
                                value={device.vendorID}
                                onChange={e => {
                                    if (!this.state.rooms) {
                                        return;
                                    }

                                    const rooms = clone(this.state.rooms);
                                    rooms[roomIndex].devices[deviceIndex].vendorID = e.target.value;
                                    this.setState({ rooms });
                                }}
                                label={I18n.t('Vendor ID')}
                                helperText={<span style={styles.spaceHolder} />}
                                variant="standard"
                            >
                                {['0xFFF1', '0xFFF2', '0xFFF3', '0xFFF4'].map(vendorId => (
                                    <MenuItem
                                        key={vendorId}
                                        value={vendorId}
                                    >
                                        {vendorId}
                                    </MenuItem>
                                ))}
                            </TextField>
                            <TextField
                                select
                                disabled={!supported}
                                style={{ minWidth: 'initial' }}
                                value={device.productID}
                                onChange={e => {
                                    if (!this.state.rooms) {
                                        return;
                                    }

                                    const rooms = clone(this.state.rooms);
                                    rooms[roomIndex].devices[deviceIndex].productID = e.target.value;
                                    this.setState({ rooms });
                                }}
                                label={I18n.t('Product ID')}
                                helperText={<span style={styles.spaceHolder} />}
                                variant="standard"
                            >
                                {productIds.map(productId => (
                                    <MenuItem
                                        key={productId}
                                        value={productId}
                                    >
                                        {productId}
                                    </MenuItem>
                                ))}
                            </TextField>
                        </>
                    ) : null}
                </div>
            </div>
        );
    }

    render(): React.JSX.Element {
        const counters =
            this.state.rooms?.map(room =>
                room.devices.reduce((a, b) => a + (this.state.devicesChecked[b._id] ? 1 : 0), 0),
            ) || [];

        const absoluteLengths =
            this.state.rooms?.map(room => {
                if (this.state.ignoreUsedDevices) {
                    return room.devices.filter(device => !this.state.usedDevices[device._id]).length;
                }

                return room.devices.length;
            }) || [];

        const lengths =
            this.state.rooms?.map(room => {
                if (this.state.ignoreUsedDevices) {
                    return room.devices.filter(
                        device => !this.state.usedDevices[device._id] && SUPPORTED_DEVICES.includes(device.deviceType),
                    ).length;
                }

                return room.devices.filter(device => SUPPORTED_DEVICES.includes(device.deviceType)).length;
            }) || [];

        const devices: DetectedDevice[] = [];
        this.state.rooms?.forEach(room => {
            room.devices.forEach(device => {
                if (this.state.devicesChecked[device._id]) {
                    devices.push(device);
                }
            });
        });

        let showHint: React.JSX.Element | null = null;
        if (
            this.props.checkAddedDevices &&
            devices.length &&
            (this.props.devicesInBridge || 0) + devices.length > this.props.checkAddedDevices
        ) {
            showHint = (
                <div style={{ color: this.props.themeType === 'dark' ? '#ff5555' : '#980000', fontSize: 14 }}>
                    {I18n.t('Warning about 15 devices')}
                </div>
            );
        }

        return (
            <Dialog
                open={!0}
                onClose={this.props.onClose}
                fullWidth
            >
                {this.renderCommissioningHintDialog()}
                <DialogTitle style={{ display: 'flex', width: 'calc(100% - 48px)' }}>
                    {`${I18n.t('Add devices')}${this.props.type === 'bridge' ? ` ${I18n.t('to bridge')} ${getText(this.props.name)}` : ''}`}
                    <div style={{ flexGrow: 1 }} />
                    <Tooltip
                        title={I18n.t('Toggle expert mode')}
                        slotProps={{ popper: { sx: { pointerEvents: 'none' } } }}
                    >
                        <MuiIconButton
                            onClick={() => this.props.setExpertMode(!this.props.expertMode)}
                            color={this.props.expertMode ? 'primary' : 'default'}
                        >
                            <IconExpert />
                        </MuiIconButton>
                    </Tooltip>
                </DialogTitle>
                <DialogContent style={styles.dialogContent}>
                    {showHint}
                    {this.state.rooms ? (
                        <div style={styles.header}>
                            <div style={styles.flex}>
                                <div style={styles.firstTitle}>{I18n.t('All devices')}</div>
                                <div>
                                    <Switch
                                        checked={this.state.ignoreUsedDevices || false}
                                        onChange={e => {
                                            const devicesChecked = clone(this.state.devicesChecked);
                                            Object.keys(devicesChecked).forEach(deviceId => {
                                                if (e.target.checked && this.state.usedDevices[deviceId]) {
                                                    devicesChecked[deviceId] = false;
                                                }
                                            });
                                            window.localStorage.setItem(
                                                'matter.ignoreUsedDevices',
                                                e.target.checked ? 'true' : 'false',
                                            );
                                            this.setState({
                                                devicesChecked,
                                                ignoreUsedDevices: e.target.checked,
                                            });
                                        }}
                                    />
                                </div>
                                <div style={styles.secondTitle}>{I18n.t('Not used devices')}</div>
                            </div>
                            <div style={styles.flex}>
                                <div style={styles.firstTitle}>{I18n.t('Device names')}</div>
                                <div>
                                    <Switch
                                        checked={this.state.useRoomNames || false}
                                        onChange={e => {
                                            window.localStorage.setItem(
                                                'matter.useRoomNames',
                                                e.target.checked ? 'true' : 'false',
                                            );

                                            if (!this.state.rooms) {
                                                return;
                                            }

                                            const rooms = clone(this.state.rooms);
                                            if (e.target.checked) {
                                                rooms.forEach(room => {
                                                    room.devices.forEach(device => {
                                                        if (device.common.name === this.state.deviceNames[device._id]) {
                                                            device.common.name =
                                                                this.state.deviceRoomTypeNames[device._id];
                                                        }
                                                    });
                                                });
                                            } else {
                                                rooms.forEach(room => {
                                                    room.devices.forEach(device => {
                                                        if (
                                                            device.common.name ===
                                                            this.state.deviceRoomTypeNames[device._id]
                                                        ) {
                                                            device.common.name = this.state.deviceNames[device._id];
                                                        }
                                                    });
                                                });
                                            }

                                            this.setState({ useRoomNames: e.target.checked, rooms });
                                        }}
                                    />
                                </div>
                                <div style={styles.secondTitle}>{I18n.t('Room plus device type names')}</div>
                            </div>
                            <div style={styles.flex}>
                                <div style={{ ...styles.firstTitle, fontSize: 'smaller' }}>
                                    {I18n.t('Hide unsupported devices')}
                                </div>
                                <div>
                                    <Switch
                                        checked={this.state.showUnsupported || false}
                                        onChange={e => {
                                            window.localStorage.setItem(
                                                'matter.showUnsupported',
                                                e.target.checked ? 'true' : 'false',
                                            );
                                            this.setState({ showUnsupported: e.target.checked });
                                        }}
                                    />
                                </div>
                                <div style={{ ...styles.secondTitle, fontSize: 'smaller' }}>
                                    {I18n.t('Show unsupported devices')}
                                </div>
                            </div>
                            <div style={{ flex: 1, overflowY: 'auto' }}>
                                {!this.state.rooms.length ? <div>{I18n.t('Nothing detected')}</div> : null}
                                {this.state.rooms.map((room, roomIndex) => {
                                    if (!absoluteLengths[roomIndex]) {
                                        return null;
                                    }
                                    if (
                                        !this.state.showUnsupported &&
                                        !room.devices.filter(device => SUPPORTED_DEVICES.includes(device.deviceType))
                                            .length
                                    ) {
                                        return null;
                                    }

                                    return (
                                        <div key={room._id}>
                                            <Accordion
                                                expanded={this.state.expanded.includes(room._id)}
                                                onChange={() => {
                                                    const expanded = clone(this.state.expanded);
                                                    const pos = expanded.indexOf(room._id);
                                                    if (pos === -1) {
                                                        expanded.push(room._id);
                                                    } else {
                                                        expanded.splice(pos, 1);
                                                    }
                                                    this.setState({ expanded });
                                                    window.localStorage.setItem(
                                                        'matter.expanded',
                                                        JSON.stringify(expanded),
                                                    );
                                                }}
                                            >
                                                <AccordionSummary expandIcon={<ExpandMore />}>
                                                    <div style={styles.summaryDiv}>
                                                        {room.common.icon ? (
                                                            <Icon
                                                                src={room.common.icon}
                                                                style={styles.icon}
                                                                alt=""
                                                            />
                                                        ) : null}

                                                        <div style={styles.flexGrow}>{getText(room.common.name)}</div>

                                                        <Checkbox
                                                            title={I18n.t('Select/Unselect all devices in room')}
                                                            indeterminate={
                                                                counters[roomIndex] !== lengths[roomIndex] &&
                                                                !!counters[roomIndex]
                                                            }
                                                            checked={counters[roomIndex] === lengths[roomIndex]}
                                                            onClick={e => {
                                                                e.stopPropagation();
                                                                e.preventDefault();
                                                                const devicesChecked = clone(this.state.devicesChecked);
                                                                if (counters[roomIndex] === lengths[roomIndex]) {
                                                                    room.devices.forEach(
                                                                        device => (devicesChecked[device._id] = false),
                                                                    );
                                                                } else {
                                                                    room.devices.forEach(device => {
                                                                        if (
                                                                            SUPPORTED_DEVICES.includes(
                                                                                device.deviceType,
                                                                            ) &&
                                                                            (!this.state.ignoreUsedDevices ||
                                                                                !this.state.usedDevices[device._id])
                                                                        ) {
                                                                            devicesChecked[device._id] = true;
                                                                        }
                                                                    });
                                                                }
                                                                this.setState({ devicesChecked });
                                                            }}
                                                        />
                                                        <div style={styles.selectedText}>
                                                            {I18n.t(
                                                                '%s of %s devices selected',
                                                                counters[roomIndex],
                                                                lengths[roomIndex],
                                                            )}
                                                        </div>
                                                    </div>
                                                </AccordionSummary>
                                                <AccordionDetails sx={styles.details}>
                                                    {this.state.expanded.includes(room._id) &&
                                                        room.devices.map((device, deviceIndex) => {
                                                            if (
                                                                this.state.ignoreUsedDevices &&
                                                                this.state.usedDevices[device._id]
                                                            ) {
                                                                return null;
                                                            }
                                                            return this.renderDevice(
                                                                roomIndex,
                                                                room,
                                                                deviceIndex,
                                                                device,
                                                            );
                                                        })}
                                                </AccordionDetails>
                                            </Accordion>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ) : (
                        <LinearProgress />
                    )}
                </DialogContent>
                <DialogActions>
                    <Button
                        variant="contained"
                        disabled={!this.state.rooms || counters?.reduce((a, b) => a + b, 0) === 0}
                        onClick={this.handleSubmit}
                        startIcon={<Add />}
                    >
                        {I18n.t(
                            'Add %s device(s)',
                            counters?.reduce((a, b) => a + b, 0),
                        )}
                    </Button>
                    <Button
                        variant="contained"
                        onClick={() => this.props.onClose()}
                        startIcon={<Close />}
                        color="grey"
                    >
                        {I18n.t('Cancel')}
                    </Button>
                </DialogActions>
            </Dialog>
        );
    }
}

export default DeviceDialog;
