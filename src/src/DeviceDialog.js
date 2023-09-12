import { useEffect, useState } from 'react';
import { I18n } from '@iobroker/adapter-react-v5';
import {
    Accordion, AccordionDetails, AccordionSummary, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, Icon, LinearProgress, Switch, TextField,
} from '@mui/material';
import {
    Add, Blinds, Close, DirectionsRun, ExpandMore, Lightbulb, Lock, Palette, PlayArrowRounded, Power, SensorDoor, Thermostat, TipsAndUpdates, Tune, VolumeUp, Water, WaterDrop, WbSunny, Whatshot, Window,
} from '@mui/icons-material';
import { detectDevices, getText } from './Utils';

const deviceIcons = {
    blind: <Blinds />,
    dimmer: <TipsAndUpdates />,
    door: <SensorDoor />,
    fireAlarm: <Whatshot />,
    floodAlarm: <Water />,
    humidity: <WaterDrop />,
    levelSlider: <Tune />,
    light: <Lightbulb />,
    lock: <Lock />,
    media: <PlayArrowRounded />,
    motion: <DirectionsRun />,
    rgp: <Palette />,
    socket: <Power />,
    temperature: <Thermostat />,
    thermostat: <Thermostat />,
    volume: <VolumeUp />,
    volumeGroup: <VolumeUp />,
    weatherForecast: <WbSunny />,
    window: <Window />,
    windowTilt: <Window />,
};

const DeviceDialog = props => {
    const [rooms, setRooms] = useState(null);
    const [devicesChecked, setDevicesChecked] = useState({});
    const [roomsChecked, setRoomsChecked] = useState({});
    const [usedDevices, setUsedDevices] = useState({});
    const [ignoreUsedDevices, setIgnoreUsedDevices] = useState(false);

    useEffect(() => {
        (async () => {
            if (!props.open) {
                return;
            }
            let _rooms = (await detectDevices(props.socket)) || [];
            // ignore buttons
            _rooms.forEach(room => {
                room.devices = room.devices.filter(device => device.common.role !== 'button');
            });
            // ignore empty rooms
            _rooms = _rooms.filter(room => room.devices.length);

            // Fix names
            _rooms.forEach(room => {
                room.devices.forEach(device => {
                    // Device.Name.Room => Device Name Room
                    device.common.name = (getText(device.common.name) || '').replace(/\./g, ' ').trim();
                    // delete room name from device name
                    if (device.roomName) {
                        device.common.name = device.common.name.replace(getText(device.roomName), '').trim();
                    }
                });
            });

            setRooms(_rooms);
            const _checked = {};
            const _devicesChecked = {};
            const _roomsChecked = {};
            _rooms.forEach(room => {
                _roomsChecked[room._id] = true;
                room.devices.forEach(device => {
                    _devicesChecked[device._id] = false;
                    device.states.forEach(state => {
                        _checked[state._id] = true;
                    });
                });
                if (props.devices) {
                    room.devices = room.devices.filter(device => !props.devices.find(_device => _device.oid === device._id));
                }
            });
            setDevicesChecked(_devicesChecked);
            setRoomsChecked(_roomsChecked);

            const _usedDevices = {};
            props.matter.devices.list.forEach(device => {
                _usedDevices[device.oid] = true;
            });
            props.matter.bridges.list.forEach(bridge => {
                bridge.list.forEach(device => {
                    _usedDevices[device.oid] = true;
                });
            });
            setUsedDevices(_usedDevices);
        })();
    }, [props.open, props.socket]);

    const handleSubmit = () => {
        const devices = [];
        rooms.forEach(room => {
            room.devices.forEach(device => {
                if (devicesChecked[device._id]) {
                    devices.push(device);
                }
            });
        });
        props.addDevices(devices);
        props.onClose();
    };

    const counters = rooms?.map(room => room.devices.reduce((a, b) => a + (devicesChecked[b._id] ? 1 : 0), 0));
    const lengths = rooms?.map(room => {
        if (ignoreUsedDevices) {
            return room.devices.filter(device => !usedDevices[device._id]).length;
        }
        return room.devices.length;
    });

    return <Dialog
        open={props.open}
        onClose={props.onClose}
        fullWidth
    >
        <DialogTitle>{I18n.t('Add devices') + (props.type === 'bridge' ? ` ${I18n.t('to bridge')} ${props.name}` : '')}</DialogTitle>
        <DialogContent style={{
            display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden',
        }}
        >
            {rooms ? <div style={{
                display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden',
            }}
            >
                <div>
                    {I18n.t('All devices')}
                    <Switch
                        checked={ignoreUsedDevices || false}
                        onChange={e => {
                            setIgnoreUsedDevices(e.target.checked);
                            const _devicesChecked = JSON.parse(JSON.stringify(devicesChecked));
                            Object.keys(_devicesChecked).forEach(deviceId => {
                                if (e.target.checked && usedDevices[deviceId]) {
                                    _devicesChecked[deviceId] = false;
                                }
                            });
                            setDevicesChecked(_devicesChecked);
                        }}
                    />
                    {I18n.t('Not used devices')}
                </div>
                <div style={{ flex: 1, overflowY: 'auto' }}>
                    {!rooms.length ? <div>{I18n.t('Nothing detected')}</div> : null}
                    {rooms.map((room, roomId) => <div key={room._id}>
                        <Accordion>
                            <AccordionSummary expandIcon={<ExpandMore />}>
                                <div style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
                                    {room.common.icon ? <Icon src={room.common.icon} style={{ width: 24, height: 24, marginRight: 8 }} alt="" /> : null}

                                    <div style={{ flexGrow: 1 }}>{getText(room.common.name)}</div>

                                    <Checkbox
                                        title={I18n.t('Select/Unselect all devices in room')}
                                        indeterminate={counters[roomId] !== room.devices.length && counters[roomId]}
                                        checked={counters[roomId] === room.devices.length}
                                        onClick={e => {
                                            e.stopPropagation();
                                            e.preventDefault();
                                            const _devicesChecked = JSON.parse(JSON.stringify(devicesChecked));
                                            if (counters[roomId] === room.devices.length) {
                                                room.devices.forEach(device => {
                                                    _devicesChecked[device._id] = false;
                                                });
                                            } else {
                                                room.devices.forEach(device => {
                                                    _devicesChecked[device._id] = true;
                                                });
                                            }
                                            setDevicesChecked(_devicesChecked);
                                        }}
                                    />
                                    <div style={{ fontSize: 12, opacity: 0.7, marginLeft: 20 }}>{I18n.t('%s of %s devices selected', counters[roomId], lengths[roomId])}</div>
                                </div>
                            </AccordionSummary>
                            <AccordionDetails sx={{ backgroundColor: props.themeType === 'dark' ? '#111' : '#eee' }}>
                                {room.devices.map((device, deviceId) => {
                                    if (ignoreUsedDevices && usedDevices[device._id]) {
                                        return null;
                                    }
                                    return <div key={device._id} style={{ backgroundColor: 'transparent' }}>
                                        <div
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                marginLeft: 20,
                                                marginBottom: 20,
                                                opacity: roomsChecked[room._id] ? 1 : 0.5,
                                            }}
                                        >
                                            <Checkbox
                                                checked={devicesChecked[device._id]}
                                                onChange={e => {
                                                    const _devicesChecked = JSON.parse(JSON.stringify(devicesChecked));
                                                    _devicesChecked[device._id] = e.target.checked;
                                                    setDevicesChecked(_devicesChecked);
                                                }}
                                                onClick={e => e.stopPropagation()}
                                            />
                                            <span style={{ marginRight: 8 }}>
                                                {device.common.icon ?
                                                    <Icon src={device.common.icon} style={{ width: 24, height: 24 }} alt="" />
                                                    :
                                                    (deviceIcons[device.deviceType] || <Lightbulb />)}
                                            </span>
                                            <TextField
                                                variant="standard"
                                                fullWidth
                                                label={device._id}
                                                helperText={<span style={{ fontStyle: 'italic' }}>
                                                    {`${I18n.t('Device type')}: ${I18n.t(device.deviceType)}`}
                                                </span>}
                                                value={device.common.name}
                                                onChange={e => {
                                                    const _rooms = JSON.parse(JSON.stringify(rooms));
                                                    _rooms[roomId].devices[deviceId].common.name = e.target.value;
                                                    setRooms(_rooms);
                                                }}
                                            />
                                        </div>
                                    </div>;
                                })}
                            </AccordionDetails>
                        </Accordion>
                    </div>)}
                </div>
            </div> : <LinearProgress />}
        </DialogContent>
        <DialogActions>
            <Button
                variant="contained"
                disabled={counters?.reduce((a, b) => a + b, 0) === 0}
                onClick={handleSubmit}
                startIcon={<Add />}
            >
                {I18n.t('Add devices')}
            </Button>
            <Button
                variant="contained"
                onClick={() => props.onClose()}
                startIcon={<Close />}
                color="grey"
            >
                {I18n.t('Cancel')}
            </Button>
        </DialogActions>
    </Dialog>;
};

export default DeviceDialog;
