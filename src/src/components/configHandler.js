import PropTypes from 'prop-types';

class ConfigHandler {
    constructor() {
        this.socket = null;
        this.config = null;
        this.configLoaded = false;
    }

    async loadConfig() {
        const devicesAndBridges = await this.props.socket.getObjectViewAsync(
            'system',
            'state',
            {
                startkey: `matter.${this.props.instance}.`,
                endkey: `matter.${this.props.instance}.\u9999`,
            },
        );
        const controllerObj = await this.props.socket.getObject(`matter.${this.props.instance}.controller`);
        const len = `matter.${this.props.instance}.`.length;
        const devices = []
        const bridges = [];
        // List devices
        Object.keys(devicesAndBridges).forEach(id => {
            if (id.substring(len).startsWith('devices.')) {
                devices.push({
                    uuid: id.substring(len + 8),
                    ...devicesAndBridges[id].native,
                });
            } else if (id.substring(len).startsWith('bridges.')) {
                bridges.push({
                    uuid: id.substring(len + 8),
                    ...devicesAndBridges[id].native,
                })
            }
        });

        return {
            controller: controllerObj.native,
            devices,
            bridges,
        };
    }
}

ConfigHandler.propTypes = {
    socket: PropTypes.object.isRequired,
    onChanged: PropTypes.func.isRequired,
    instance: PropTypes.number.isRequired,
};