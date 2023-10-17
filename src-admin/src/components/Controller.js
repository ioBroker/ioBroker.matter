import React from 'react';
import PropTypes from 'prop-types';
import { withStyles } from '@mui/styles';

import {
    Switch,
} from '@mui/material';

import { I18n } from '@iobroker/adapter-react-v5';

const styles = () => ({

});

class Controller extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
        };
    }

    render() {
        return <div>
            {I18n.t('Off')}
            <Switch
                checked={this.props.matter.controller.enabled}
                onChange={e => {
                    const matter = JSON.parse(JSON.stringify(this.props.matter));
                    matter.controller.enabled = e.target.checked;
                    this.props.updateConfig(matter);
                }}
            />
            {I18n.t('On')}
        </div>;
    }
}

Controller.propTypes = {
    matter: PropTypes.object,
    updateConfig: PropTypes.func,
};

export default withStyles(styles)(Controller);
