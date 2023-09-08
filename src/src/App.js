import React from 'react';
import { withStyles } from '@mui/styles';
import { v4 as uuidv4 } from 'uuid';
import { ThemeProvider, StyledEngineProvider } from '@mui/material/styles';

import {
    AppBar,
    Tabs,
    Tab,
    Accordion,
    AccordionDetails,
    AccordionSummary,
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    IconButton,
    Switch,
    Tooltip,
} from '@mui/material';

import { Add, Delete, Edit } from '@mui/icons-material';

import GenericApp from '@iobroker/adapter-react-v5/GenericApp';
import { I18n, Loader, AdminConnection } from '@iobroker/adapter-react-v5';

import { detectDevices } from './Utils';
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

        this.state.matter = {
            controller: {
                enabled: true,
            },
            bridges: {
                settings: {
                },
                list: [
                    {
                        name: 'Blabla1',
                        enabled: true,
                        list: [
                            {
                                oid: 'hmip.1.lightABC',
                                type: 'from Typedetector',
                                name: 'Blabla1',
                                enabled: true,
                            },
                            {
                                oid: 'hmip.1.lightABC',
                                type: 'from Typedetector',
                                name: 'Blabla2',
                                enabled: true,
                            },
                        ],
                    },
                    {
                        name: 'Blabla2',
                        enabled: true,
                        list: [
                            {
                                oid: 'hmip.1.lightABC',
                                type: 'from Typedetector',
                                name: 'Blabla1',
                                enabled: true,
                            },
                            {
                                oid: 'hmip.1.lightABC',
                                type: 'from Typedetector',
                                name: 'Blabla2',
                                enabled: true,
                            },
                        ],
                    },

                ],
            },
            devices: {
                settings: {
                },
                list: [
                    {
                        oid: 'hmip.1.lightABC',
                        type: 'from Typedetector',
                        name: 'Blabla',
                        enabled: true,
                    },
                ],
            },
        };

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
    }

    renderController() {
        return <Switch
            checked={this.state.matter.controller.enabled}
            onChange={e => {
                const matter = JSON.parse(JSON.stringify(this.state.matter));
                matter.controller.enabled = e.target.checked;
                this.setState({ matter });
            }}
        />;
    }

    addDevices = devices => {
        const matter = JSON.parse(JSON.stringify(this.state.matter));
        devices.forEach(device => {
            if (!matter.devices.list.find(d => d.oid === device)) {
                matter.devices.list.push({
                    oid: device,
                    type: 'from Typedetector',
                    name: device,
                    uuid: uuidv4(),
                });
            }
        });
        this.setState({ matter });
    };

    addDevicesToBridge = devices => {
        const matter = JSON.parse(JSON.stringify(this.state.matter));
        if (this.state.dialog.bridge) {
            const bridge = matter.bridges.list[this.state.dialog.bridge];
            devices.forEach(device => {
                if (!bridge.list.find(d => d.oid === device)) {
                    bridge.list.push({
                        oid: device,
                        type: 'from Typedetector',
                        name: device,
                        uuid: uuidv4(),
                    });
                }
            });
        } else {
            const bridge = {
                name: 'New bridge',
                enabled: true,
                list: devices.map(device => ({
                    oid: device, type: 'from Typedetector', name: 'Blabla', enabled: true,
                })),
                uuid: uuidv4(),
            };
            matter.bridges.list.push(bridge);
        }
        this.setState({ matter });
    };

    renderBridges() {
        return <div>
            <div>
                <Tooltip title={I18n.t('Add bridge')}>
                    <IconButton onClick={() => this.setState(
                        {
                            dialog: {
                                type: 'bridge',
                                addDevices: this.addDevicesToBridge,
                            },
                        },
                    )}
                    >
                        <Add />
                    </IconButton>
                </Tooltip>
            </div>
            {
                this.state.matter.bridges.list.map((bridge, index) => <Accordion key={index}>
                    <AccordionSummary>
                        <div style={{ display: 'flex', alignItems: 'center' }}>
                            <h4>{bridge.name}</h4>
                            <Switch
                                checked={bridge.enabled}
                                onClick={e => e.stopPropagation()}
                                onChange={e => {
                                    const matter = JSON.parse(JSON.stringify(this.state.matter));
                                    matter.bridges.list[index].enabled = e.target.checked;
                                    this.setState({ matter });
                                }}
                            />
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
                        </div>
                    </AccordionSummary>
                    <AccordionDetails>
                        <div>
                            <b>{I18n.t('Devices')}</b>
                            <Tooltip title={I18n.t('Add device')}>
                                <IconButton onClick={() => this.setState(
                                    {
                                        dialog: {
                                            type: 'bridge',
                                            bridge: index,
                                            addDevices: this.addDevicesToBridge,
                                        },
                                    },
                                )}
                                >
                                    <Add />
                                </IconButton>
                            </Tooltip>
                        </div>
                        {bridge.list.map((device, index2) => <div key={index2}>
                            {device.name}
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
                        </div>)}
                    </AccordionDetails>
                </Accordion>)
            }
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
                                addDevices: this.addDevices,
                            },
                        },
                    )}
                    >
                        <Add />
                    </IconButton>
                </Tooltip>
            </div>
            {
                this.state.matter.devices.list.map((device, index) => <div key={index} style={{ display: 'flex', alignItems: 'center' }}>
                    {device.name}
                    <Switch
                        checked={device.enabled}
                        onChange={e => {
                            const matter = JSON.parse(JSON.stringify(this.state.matter));
                            matter.devices.list[index].enabled = e.target.checked;
                            this.setState({ matter });
                        }}
                    />
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
                </div>)
            }
        </div>;
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
                <Button onClick={() => this.setState({ deleteDialog: false })} color="primary">
                    {I18n.t('Cancel')}
                </Button>
                <Button
                    onClick={() => {
                        const matter = JSON.parse(JSON.stringify(this.state.matter));
                        if (this.state.deleteDialog.type === 'bridge') {
                            matter.bridges.list.splice(this.state.deleteDialog.bridge, 1);
                        } else if (this.state.deleteDialog.bridge !== undefined) {
                            matter.bridges.list[this.state.deleteDialog.bridge].list.splice(this.state.deleteDialog.device, 1);
                        } else {
                            matter.devices.list.splice(this.state.deleteDialog.device, 1);
                        }
                        this.setState({ matter, deleteDialog: false });
                    }}
                    color="primary"
                >
                    {I18n.t('Delete')}
                </Button>
            </DialogActions>
        </Dialog>;
    }

    render() {
        if (!this.state.loaded) {
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
                    type={this.state.dialog.type}
                    device={this.state.dialog.device}
                    bridge={this.state.dialog.bridge}
                    addDevices={this.state.dialog.addDevices}
                    socket={this.socket}
                />
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
