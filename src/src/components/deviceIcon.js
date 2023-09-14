import React from 'react';
import PropTypes from 'prop-types';

import {
    Blinds, DirectionsRun,
    Lightbulb,
    Lock, Palette, PlayArrowRounded, Power,
    SensorDoor, Thermostat,
    TipsAndUpdates,
    Tune, VolumeUp,
    Water,
    WaterDrop, WbSunny,
    Whatshot, Window,
    QuestionMark,
} from '@mui/icons-material';

const deviceIcons = {
    blind: <Blinds/>,
    dimmer: <TipsAndUpdates/>,
    door: <SensorDoor/>,
    fireAlarm: <Whatshot/>,
    floodAlarm: <Water/>,
    humidity: <WaterDrop/>,
    levelSlider: <Tune/>,
    light: <Lightbulb/>,
    lock: <Lock/>,
    media: <PlayArrowRounded/>,
    motion: <DirectionsRun/>,
    rgp: <Palette/>,
    socket: <Power/>,
    temperature: <Thermostat/>,
    thermostat: <Thermostat/>,
    volume: <VolumeUp/>,
    volumeGroup: <VolumeUp/>,
    weatherForecast: <WbSunny/>,
    window: <Window/>,
    windowTilt: <Window/>,
};

const matterMapping = {
    POWER_SOURCE: 'socket',
    ON_OFF_LIGHT: 'light',
    DIMMABLE_LIGHT: 'dimmer',
    COLOR_TEMPERATURE_LIGHT: 'rgb',
    EXTENDED_COLOR_LIGHT: 'rgp',
};

class DeviceIcon extends React.Component {
    render() {
        if (this.props.ioBrokerType) {
            return deviceIcons[this.props.ioBrokerType] || <QuestionMark/>;
        }
        if (this.props.matterType) {
            return deviceIcons[this.props.matterType] || <QuestionMark/>;
        }
        return <QuestionMark/>;
    }
}

DeviceIcon.propTypes = {
    ioBrokerType: PropTypes.string,
    matterType: PropTypes.string,
};

export default DeviceIcon;