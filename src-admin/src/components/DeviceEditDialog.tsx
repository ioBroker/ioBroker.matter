import React, { Component } from 'react';

import {
    Button,
    Checkbox,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    FormControl,
    FormControlLabel,
    InputLabel,
    MenuItem,
    Select,
    TextField,
} from '@mui/material';
import { Close, Save } from '@mui/icons-material';

import { Types } from '@iobroker/type-detector';
import { I18n, IconDeviceType, type ThemeType } from '@iobroker/adapter-react-v5';

import { SUPPORTED_DEVICES } from './DeviceDialog';
import { clone } from '../Utils';
import TypeSelector from './TypeSelector';

export type DeviceData = {
    name: string;
    deviceType: Types | '';
    vendorID: string;
    productID: string;
    noComposed: boolean;
    dimmerOnLevel: number;
    dimmerUseLastLevelForOn: boolean;
    actionAllowedByIdentify: boolean;
};

interface DeviceEditDialogProps {
    data: DeviceData;
    isCommissioned: boolean;
    onClose(data?: DeviceData): void;
    productIDs: string[];
    auto: boolean;
    hasOnState: boolean;
    themeType: ThemeType;
}

interface DeviceEditDialogState {
    data: DeviceData;
}

export default class DeviceEditDialog extends Component<DeviceEditDialogProps, DeviceEditDialogState> {
    constructor(props: DeviceEditDialogProps) {
        super(props);
        this.state = {
            data: JSON.parse(JSON.stringify(this.props.data)),
        };
    }

    render(): React.JSX.Element {
        const isChanged = Object.keys(this.state.data).find(
            key => (this.props.data as Record<string, any>)[key] !== (this.state.data as Record<string, any>)[key],
        );

        const isDisabled =
            !isChanged ||
            (this.state.data.deviceType === 'dimmer' &&
                !this.state.data.dimmerUseLastLevelForOn &&
                !this.state.data.dimmerOnLevel) ||
            !this.state.data.deviceType;

        return (
            <Dialog
                onClose={() => this.props.onClose()}
                open={!0}
            >
                <DialogTitle>{`${I18n.t('Edit device')} ${this.props.data.name}`}</DialogTitle>
                <DialogContent>
                    <TextField
                        label={I18n.t('Name')}
                        disabled={this.props.isCommissioned}
                        value={this.state.data.name}
                        onChange={e => {
                            const data = clone(this.state.data);
                            data.name = e.target.value;
                            this.setState({ data });
                        }}
                        onKeyUp={e => e.key === 'Enter' && !isDisabled && this.props.onClose(this.state.data)}
                        variant="standard"
                        fullWidth
                    />
                    <div
                        style={{
                            width: '100%',
                            display: 'flex',
                            flexWrap: 'wrap',
                            gap: 8,
                            marginTop: 16,
                            justifyContent: 'stretch',
                        }}
                    >
                        <TextField
                            select
                            style={{ width: 'calc(50% - 4px)' }}
                            disabled={this.props.isCommissioned}
                            value={this.state.data.vendorID}
                            onChange={e => {
                                const data = clone(this.state.data);
                                data.vendorID = e.target.value;
                                this.setState({ data });
                            }}
                            label={I18n.t('Vendor ID')}
                            variant="standard"
                        >
                            {['0xFFF1', '0xFFF2', '0xFFF3', '0xFFF4'].map(vendorID => (
                                <MenuItem
                                    key={vendorID}
                                    value={vendorID}
                                >
                                    {vendorID}
                                </MenuItem>
                            ))}
                        </TextField>
                        <TextField
                            select
                            style={{ width: 'calc(50% - 4px)' }}
                            disabled={this.props.isCommissioned}
                            value={this.state.data.productID}
                            onChange={e => {
                                const data = clone(this.state.data);
                                data.productID = e.target.value;
                                this.setState({ data });
                            }}
                            label={I18n.t('Product ID')}
                            variant="standard"
                        >
                            {this.props.productIDs.map(productID => (
                                <MenuItem
                                    key={productID}
                                    value={productID}
                                >
                                    {productID}
                                </MenuItem>
                            ))}
                        </TextField>
                    </div>

                    <FormControlLabel
                        control={
                            <Checkbox
                                checked={this.state.data.noComposed}
                                disabled={this.props.isCommissioned}
                                onChange={e => {
                                    const data = clone(this.state.data);
                                    data.noComposed = e.target.checked;
                                    this.setState({ data });
                                }}
                            />
                        }
                        label={
                            <span style={{ fontSize: 'smaller' }}>
                                {I18n.t('Do not compose devices (Alexa does not support composed devices yet)')}
                            </span>
                        }
                    />
                    <TypeSelector
                        themeType={this.props.themeType}
                        style={{ width: '100%', marginTop: 30 }}
                        value={this.state.data.deviceType}
                        disabled={this.props.isCommissioned || this.props.auto}
                        supportedDevices={SUPPORTED_DEVICES}
                        onChange={value => {
                            if (!this.state.data) {
                                return;
                            }

                            const data = clone(this.state.data);
                            data.deviceType = value;
                            this.setState({ data });
                        }}
                    />
                    <FormControlLabel
                        style={{ width: '100%', marginTop: 30 }}
                        label={I18n.t('Allow action by identify')}
                        control={
                            <Checkbox
                                checked={this.state.data.actionAllowedByIdentify}
                                onChange={e => {
                                    if (!this.state.data) {
                                        return;
                                    }

                                    const data = clone(this.state.data);
                                    data.actionAllowedByIdentify = e.target.checked;
                                    this.setState({ data });
                                }}
                            />
                        }
                    />
                    {this.state.data.deviceType === 'dimmer' && !this.props.hasOnState ? (
                        <FormControlLabel
                            style={{ marginTop: 20 }}
                            label={I18n.t('Use last value for ON')}
                            control={
                                <Checkbox
                                    checked={this.state.data.dimmerUseLastLevelForOn}
                                    onChange={e => {
                                        if (!this.state.data) {
                                            return;
                                        }

                                        const data = clone(this.state.data);
                                        data.dimmerUseLastLevelForOn = e.target.checked;
                                        this.setState({ data });
                                    }}
                                />
                            }
                        />
                    ) : null}
                    {this.state.data.deviceType === 'dimmer' &&
                    !this.props.hasOnState &&
                    !this.state.data.dimmerUseLastLevelForOn ? (
                        <FormControl style={{ width: '100%', marginTop: 30 }}>
                            <InputLabel>{I18n.t('Brightness by ON')}</InputLabel>
                            <Select
                                variant="standard"
                                error={!this.state.data.dimmerOnLevel}
                                value={this.state.data.dimmerOnLevel}
                                onChange={e => {
                                    if (!this.state.data) {
                                        return;
                                    }

                                    const data = clone(this.state.data);
                                    data.dimmerOnLevel = e.target.value as number;
                                    this.setState({ data });
                                }}
                                renderValue={value => `${value}%`}
                            >
                                {[10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map(type => (
                                    <MenuItem
                                        key={type}
                                        value={type}
                                    >
                                        {`${type}%`}
                                    </MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                    ) : null}
                    {this.props.isCommissioned
                        ? I18n.t('Device is already commissioned. You cannot change the name or the vendor/product ID.')
                        : null}
                </DialogContent>
                <DialogActions>
                    <Button
                        onClick={() => this.props.onClose(this.state.data)}
                        startIcon={<Save />}
                        disabled={isDisabled}
                        color="primary"
                        variant="contained"
                    >
                        {I18n.t('Apply')}
                    </Button>
                    <Button
                        onClick={() => this.props.onClose()}
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
}
