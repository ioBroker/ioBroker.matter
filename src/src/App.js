import React from 'react';
import { withStyles } from '@mui/styles';
import { v4 as uuidv4 } from 'uuid';
import { ThemeProvider, StyledEngineProvider } from '@mui/material/styles';

import {
    AppBar,
    Tabs,
    Tab,
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    IconButton,
    Switch,
    Tooltip,
    TextField,
    Table,
    TableRow,
    TableCell,
    Collapse,
} from '@mui/material';

import {
    Add, Close, Delete, Edit, KeyboardArrowDown, KeyboardArrowUp, Save,
} from '@mui/icons-material';

import GenericApp from '@iobroker/adapter-react-v5/GenericApp';
import { I18n, Loader, AdminConnection } from '@iobroker/adapter-react-v5';
import { detectDevices, getText } from './Utils';
import DeviceDialog from './DeviceDialog';

const styles = theme => ({
    root: {},
    tabContent: {
        padding: 10,
        height: 'calc(100% - 64px - 48px - 20px)',
        overflow: 'auto',
    },
    tabContentIFrame: {
        padding: 10,
        height: 'calc(100% - 64px - 48px - 20px - 38px)',
        overflow: 'auto',
    },
    selected: {
        color: theme.palette.mode === 'dark' ? undefined : '#FFF !important',
    },
    indicator: {
        backgroundColor: theme.palette.mode === 'dark' ? theme.palette.secondary.main : '#FFF',
    },
});

class App extends GenericApp {
    constructor(props) {
        const extendedProps = { ...props };
        extendedProps.encryptedFields = ['pass'];
        extendedProps.Connection = AdminConnection;
        extendedProps.translations = {
            en: require('./i18n/en'),
            de: require('./i18n/de'),
            ru: require('./i18n/ru'),
            pt: require('./i18n/pt'),
            nl: require('./i18n/nl'),
            fr: require('./i18n/fr'),
            it: require('./i18n/it'),
            es: require('./i18n/es'),
            pl: require('./i18n/pl'),
            uk: require('./i18n/uk'),
            'zh-cn': require('./i18n/zh-cn'),
        };

        extendedProps.sentryDSN = window.sentryDSN;
        // extendedProps.socket = {
        //     protocol: 'http:',
        //     host: '192.168.178.45',
        //     port: 8081,
        // };

        super(props, extendedProps);

        this.state.selectedTab = window.localStorage.getItem(`${this.adapterName}.${this.instance}.selectedTab`) || 'controller';

        this.state.bridgesOpened = {};
        try {
            this.state.bridgesOpened = JSON.parse(window.localStorage.getItem(`${this.adapterName}.${this.instance}.bridgesOpened`)) || {};
        } catch {
            //
        }

        this.state.devices = [];

        this.state.dialog = false;
    }

    async onConnectionReady() {
        this.socket.getState(`${this.adapterName}.${this.instance}.info.ackTempPassword`)
            .then(state => {
                if (!state || !state.val) {
                    this.setState({ showAckTempPasswordDialog: true });
                }
            });
        this.setState({ devices: await detectDevices(this.socket) });
        const matter = JSON.parse(JSON.stringify(this.state.native));
        matter.controller = matter.controller || { enabled: true };
        matter.devices = matter.devices || { settings: {}, list: [] };
        matter.bridges = matter.bridges || { settings: {}, list: [] };
        const changed = this.getIsChanged(matter);
        this.setState({ native: matter, changed });
    }

    renderController() {
        return <div>
            {I18n.t('Off')}
            <Switch
                checked={this.state.native.controller.enabled}
                onChange={e => {
                    const matter = JSON.parse(JSON.stringify(this.state.native));
                    matter.controller.enabled = e.target.checked;
                    this.updateNativeValue('controller', matter.controller);
                }}
            />
            {I18n.t('On')}
        </div>;
    }

    addDevices = devices => {
        const matter = JSON.parse(JSON.stringify(this.state.native));
        devices.forEach(device => {
            if (!matter.devices.list.find(d => d.oid === device)) {
                matter.devices.list.push({
                    oid: device._id,
                    type: device.deviceType,
                    name: getText(device.common.name),
                    uuid: uuidv4(),
                    enabled: true,
                });
            }
        });
        this.updateNativeValue('devices', matter.devices);
    };

    addDevicesToBridge = devices => {
        const matter = JSON.parse(JSON.stringify(this.state.native));
        if (this.state.dialog.bridge !== undefined) {
            const bridge = matter.bridges.list[this.state.dialog.bridge];
            devices.forEach(device => {
                if (!bridge.list.find(d => d.oid === device._id)) {
                    bridge.list.push({
                        oid: device._id,
                        type: device.deviceType,
                        name: getText(device.common.name),
                        uuid: uuidv4(),
                        enabled: true,
                    });
                }
            });
        } else {
            const bridge = {
                name: 'New bridge',
                enabled: true,
                list: devices.map(device => ({
                    oid: device._id,
                    type: device.deviceType,
                    name: getText(device.common.name),
                    enabled: true,
                })),
                uuid: uuidv4(),
            };
            matter.bridges.list.push(bridge);
        }
        this.updateNativeValue('bridges', matter.bridges);
    };

    renderBridges() {
        return <div>
            <div>
                <Tooltip title={I18n.t('Add bridge')}>
                    <IconButton onClick={() => this.setState(
                        {
                            editDialog: {
                                type: 'bridge',
                                add: true,
                            },
                        },
                    )}
                    >
                        <Add />
                    </IconButton>
                </Tooltip>
            </div>
            <Table size="small" style={{ width: 'initial' }} padding="none">
                {
                    this.state.native.bridges.list.map((bridge, index) => <React.Fragment key={index}>
                        <TableRow>
                            <TableCell>
                                <IconButton
                                    size="small"
                                    onClick={() => {
                                        const bridgesOpened = JSON.parse(JSON.stringify(this.state.bridgesOpened));
                                        bridgesOpened[index] = !bridgesOpened[index];
                                        window.localStorage.setItem(`${this.adapterName}.${this.instance}.bridgesOpened`, JSON.stringify(bridgesOpened));
                                        this.setState({ bridgesOpened });
                                    }}
                                >
                                    {this.state.bridgesOpened[index] ? <KeyboardArrowUp /> : <KeyboardArrowDown />}
                                </IconButton>
                            </TableCell>
                            <TableCell
                                style={{ cursor: 'pointer' }}
                                onClick={() => {
                                    const bridgesOpened = JSON.parse(JSON.stringify(this.state.bridgesOpened));
                                    bridgesOpened[index] = !bridgesOpened[index];
                                    window.localStorage.setItem(`${this.adapterName}.${this.instance}.bridgesOpened`, JSON.stringify(bridgesOpened));
                                    this.setState({ bridgesOpened });
                                }}
                            >
                                <h4>{bridge.name}</h4>
                            </TableCell>
                            <TableCell>
                                <Switch
                                    checked={bridge.enabled}
                                    onClick={e => e.stopPropagation()}
                                    onChange={e => {
                                        const matter = JSON.parse(JSON.stringify(this.state.native));
                                        matter.bridges.list[index].enabled = e.target.checked;
                                        this.updateNativeValue('bridges', matter.bridges);
                                    }}
                                />
                            </TableCell>
                            <TableCell>
                                <Tooltip title={I18n.t('Edit bridge')}>
                                    <IconButton onClick={e => {
                                        e.stopPropagation();
                                        this.setState(
                                            {
                                                editDialog: {
                                                    type: 'bridge',
                                                    name: bridge.name,
                                                    originalName: bridge.name,
                                                    bridge: index,
                                                },
                                            },
                                        );
                                    }}
                                    >
                                        <Edit />
                                    </IconButton>
                                </Tooltip>
                            </TableCell>
                            <TableCell>
                                <Tooltip title={I18n.t('Delete bridge')}>
                                    <IconButton onClick={e => {
                                        e.stopPropagation();
                                        this.setState(
                                            {
                                                deleteDialog: {
                                                    type: 'bridge',
                                                    name: bridge.name,
                                                    bridge: index,
                                                },
                                            },
                                        );
                                    }}
                                    >
                                        <Delete />
                                    </IconButton>
                                </Tooltip>
                            </TableCell>
                        </TableRow>
                        <TableRow>
                            <TableCell colSpan={5} style={{ paddingLeft: 10 }}>
                                <Collapse in={this.state.bridgesOpened[index] || false} timeout="auto" unmountOnExit>
                                    <div>
                                        <b>{I18n.t('Devices')}</b>
                                        <Tooltip title={I18n.t('Add device')}>
                                            <IconButton onClick={() => this.setState(
                                                {
                                                    dialog: {
                                                        type: 'bridge',
                                                        name: bridge.name,
                                                        bridge: index,
                                                        devices: bridge.list,
                                                        addDevices: this.addDevicesToBridge,
                                                    },
                                                },
                                            )}
                                            >
                                                <Add />
                                            </IconButton>
                                        </Tooltip>
                                    </div>
                                    <Table size="small" style={{ width: 'initial' }} padding="none">
                                        {bridge.list.map((device, index2) => <TableRow key={index2}>
                                            <TableCell>
                                                {device.name}
                                            </TableCell>
                                            <TableCell>
                                                <Switch
                                                    checked={device.enabled}
                                                    onChange={e => {
                                                        const matter = JSON.parse(JSON.stringify(this.state.native));
                                                        matter.bridges.list[index].list[index2].enabled = e.target.checked;
                                                        this.updateNativeValue('bridges', matter.bridges);
                                                    }}
                                                />
                                            </TableCell>
                                            <TableCell>
                                                <Tooltip title={I18n.t('Edit device')}>
                                                    <IconButton onClick={() => {
                                                        this.setState(
                                                            {
                                                                editDialog: {
                                                                    type: 'device',
                                                                    name: device.name,
                                                                    originalName: device.name,
                                                                    bridge: index,
                                                                    device: index2,
                                                                },
                                                            },
                                                        );
                                                    }}
                                                    >
                                                        <Edit />
                                                    </IconButton>
                                                </Tooltip>
                                            </TableCell>
                                            <TableCell>
                                                <Tooltip title={I18n.t('Delete device')}>
                                                    <IconButton onClick={() => {
                                                        this.setState(
                                                            {
                                                                deleteDialog: {
                                                                    type: 'device',
                                                                    name: device.name,
                                                                    bridge: index,
                                                                    device: index2,
                                                                },
                                                            },
                                                        );
                                                    }}
                                                    >
                                                        <Delete />
                                                    </IconButton>
                                                </Tooltip>
                                            </TableCell>
                                        </TableRow>)}
                                    </Table>
                                </Collapse>
                            </TableCell>
                        </TableRow>
                    </React.Fragment>)
                }
            </Table>
        </div>;
    }

    renderDevices() {
        return <div>
            <div>
                <Tooltip title={I18n.t('Add device')}>
                    <IconButton onClick={() => this.setState(
                        {
                            dialog: {
                                type: 'device',
                                devices: this.state.devices.list,
                                addDevices: this.addDevices,
                            },
                        },
                    )}
                    >
                        <Add />
                    </IconButton>
                </Tooltip>
            </div>
            <Table size="small" style={{ width: 'initial' }} padding="none">
                {
                    this.state.native.devices.list.map((device, index) => <TableRow key={index}>
                        <TableCell>
                            {device.name}
                        </TableCell>
                        <TableCell>
                            <Switch
                                checked={device.enabled}
                                onChange={e => {
                                    const matter = JSON.parse(JSON.stringify(this.state.native));
                                    matter.devices.list[index].enabled = e.target.checked;
                                    this.updateNativeValue('devices', matter.devices);
                                }}
                            />
                        </TableCell>
                        <TableCell>
                            <Tooltip title={I18n.t('Edit device')}>
                                <IconButton onClick={() => {
                                    this.setState(
                                        {
                                            editDialog: {
                                                type: 'device',
                                                name: device.name,
                                                originalName: device.name,
                                                device: index,
                                            },
                                        },
                                    );
                                }}
                                >
                                    <Edit />
                                </IconButton>
                            </Tooltip>
                        </TableCell>
                        <TableCell>
                            <Tooltip title={I18n.t('Delete device')}>
                                <IconButton onClick={() => {
                                    this.setState(
                                        {
                                            deleteDialog: {
                                                type: 'device',
                                                name: device.name,
                                                device: index,
                                            },
                                        },
                                    );
                                }}
                                >
                                    <Delete />
                                </IconButton>
                            </Tooltip>
                        </TableCell>
                    </TableRow>)
                }
            </Table>
        </div>;
    }

    renderEditDialog() {
        return <Dialog onClose={() => this.setState({ editDialog: false })} open={!!this.state.editDialog}>
            <DialogTitle>
                {this.state.editDialog?.add ?
                    I18n.t('Add bridge') :
                    `${
                        this.state.editDialog?.type === 'bridge' ? I18n.t('Edit bridge') : I18n.t('Edit device')
                    } ${
                        this.state.editDialog?.originalName
                    }`}
            </DialogTitle>
            {this.state.editDialog && <DialogContent>
                <TextField
                    label={I18n.t('Name')}
                    value={this.state.editDialog.name}
                    onChange={e => {
                        const editDialog = JSON.parse(JSON.stringify(this.state.editDialog));
                        editDialog.name = e.target.value;
                        this.setState({ editDialog });
                    }}
                    variant="standard"
                />
            </DialogContent>}
            <DialogActions>
                <Button
                    onClick={() => this.setState({ editDialog: false })}
                    startIcon={<Close />}
                    color="grey"
                    variant="contained"
                >
                    {I18n.t('Cancel')}
                </Button>
                <Button
                    onClick={() => {
                        const matter = JSON.parse(JSON.stringify(this.state.native));
                        if (this.state.editDialog.add) {
                            matter.bridges.list.push({
                                name: this.state.editDialog.name,
                                enabled: true,
                                list: [],
                                uuid: uuidv4(),
                            });
                            this.updateNativeValue('bridges', matter.bridges);
                        } else if (this.state.editDialog.type === 'bridge') {
                            matter.bridges.list[this.state.editDialog.bridge].name = this.state.editDialog.name;
                            this.updateNativeValue('bridges', matter.bridges);
                        } else if (this.state.editDialog.bridge !== undefined) {
                            matter.bridges.list[this.state.editDialog.bridge].list[this.state.editDialog.device].name = this.state.editDialog.name;
                            this.updateNativeValue('bridges', matter.bridges);
                        } else {
                            matter.devices.list[this.state.editDialog.device].name = this.state.editDialog.name;
                            this.updateNativeValue('devices', matter.devices);
                        }
                        this.setState({ editDialog: false });
                    }}
                    startIcon={this.state.editDialog?.add ? <Add /> : <Save />}
                    color="primary"
                    variant="contained"
                >
                    {this.state.editDialog?.add ? I18n.t('Add') : I18n.t('Save')}
                </Button>
            </DialogActions>
        </Dialog>;
    }

    renderDeleteDialog() {
        return <Dialog onClose={() => this.setState({ deleteDialog: false })} open={!!this.state.deleteDialog}>
            <DialogTitle>{I18n.t('Delete')}</DialogTitle>
            {this.state.deleteDialog && <DialogContent>
                {`${
                    this.state.deleteDialog.type === 'bridge' ?
                        I18n.t('Do you want to delete bridge') :
                        I18n.t('Do you want to delete device')} ${
                    this.state.deleteDialog.name
                }?`}
            </DialogContent>}
            <DialogActions>
                <Button
                    onClick={() => this.setState({ deleteDialog: false })}
                    startIcon={<Close />}
                    color="grey"
                    variant="contained"
                >
                    {I18n.t('Cancel')}
                </Button>
                <Button
                    onClick={() => {
                        const matter = JSON.parse(JSON.stringify(this.state.native));
                        if (this.state.deleteDialog.type === 'bridge') {
                            matter.bridges.list.splice(this.state.deleteDialog.bridge, 1);
                            this.updateNativeValue('bridges', matter.bridges);
                        } else if (this.state.deleteDialog.bridge !== undefined) {
                            matter.bridges.list[this.state.deleteDialog.bridge].list.splice(this.state.deleteDialog.device, 1);
                            this.updateNativeValue('bridges', matter.bridges);
                        } else {
                            matter.devices.list.splice(this.state.deleteDialog.device, 1);
                            this.updateNativeValue('devices', matter.devices);
                        }
                        this.setState({ deleteDialog: false });
                    }}
                    startIcon={<Delete />}
                    color="primary"
                    variant="contained"
                >
                    {I18n.t('Delete')}
                </Button>
            </DialogActions>
        </Dialog>;
    }

    render() {
        if (!this.state.loaded || !this.state.native.controller || !this.state.devices || !this.state.native.bridges) {
            return <StyledEngineProvider injectFirst>
                <ThemeProvider theme={this.state.theme}>
                    <Loader theme={this.state.themeType} />
                </ThemeProvider>
            </StyledEngineProvider>;
        }

        return <StyledEngineProvider injectFirst>
            <ThemeProvider theme={this.state.theme}>
                <DeviceDialog
                    open={!!this.state.dialog}
                    onClose={() => this.setState({ dialog: false })}
                    {...(this.state.dialog || {})}
                    matter={this.state.native}
                    socket={this.socket}
                />
                {this.renderEditDialog()}
                {this.renderDeleteDialog()}
                <div className="App" style={{ background: this.state.theme.palette.background.default, color: this.state.theme.palette.text.primary }}>
                    <AppBar position="static">
                        <Tabs
                            value={this.state.selectedTab || 'controller'}
                            onChange={(e, value) => {
                                this.setState({ selectedTab: value });
                                window.localStorage.setItem(`${this.adapterName}.${this.instance}.selectedTab`, value);
                            }}
                            scrollButtons="auto"
                            classes={{ indicator: this.props.classes.indicator }}
                        >
                            <Tab classes={{ selected: this.props.classes.selected }} label={I18n.t('Controller')} value="controller" />
                            <Tab classes={{ selected: this.props.classes.selected }} label={I18n.t('Bridges')} value="bridges" />
                            <Tab classes={{ selected: this.props.classes.selected }} label={I18n.t('Devices')} value="devices" />
                        </Tabs>
                    </AppBar>

                    <div className={this.isIFrame ? this.props.classes.tabContentIFrame : this.props.classes.tabContent}>
                        {this.state.selectedTab === 'controller' && this.renderController()}
                        {this.state.selectedTab === 'bridges' && this.renderBridges()}
                        {this.state.selectedTab === 'devices' && this.renderDevices()}
                    </div>
                    {this.renderError()}
                    {this.renderSaveCloseButtons()}
                </div>
            </ThemeProvider>
        </StyledEngineProvider>;
    }
}

export default withStyles(styles)(App);
