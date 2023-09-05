import React from 'react';
import { withStyles } from '@mui/styles';
import { ThemeProvider, StyledEngineProvider } from '@mui/material/styles';

import AppBar from '@mui/material/AppBar';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';

import GenericApp from '@iobroker/adapter-react-v5/GenericApp';
import { I18n, Loader, AdminConnection } from '@iobroker/adapter-react-v5';
import {
    Accordion, AccordionDetails, AccordionSummary, IconButton, Switch,
} from '@mui/material';
import { Add, Delete, Edit } from '@mui/icons-material';
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
                                name: 'Blabla',
                                enabled: true,
                            },
                            {
                                oid: 'hmip.1.lightABC',
                                type: 'from Typedetector',
                                name: 'Blabla',
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
                                name: 'Blabla',
                                enabled: true,
                            },
                            {
                                oid: 'hmip.1.lightABC',
                                type: 'from Typedetector',
                                name: 'Blabla',
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

    renderBridges() {
        return <div>
            <div>
                <IconButton onClick={() => this.setState(
                    {
                        dialog: {
                            type: 'bridge',
                        },
                    },
                )}
                >
                    <Add />
                </IconButton>
            </div>
            {
                this.state.matter.bridges.list.map((bridge, index) => <div key={index}>
                    <Accordion>
                        <AccordionSummary>
                            {bridge.name}
                            <Switch
                                checked={bridge.enabled}
                                onChange={e => {
                                    const matter = JSON.parse(JSON.stringify(this.state.matter));
                                    matter.bridges.list[index].enabled = e.target.checked;
                                    this.setState({ matter });
                                }}
                            />
                        </AccordionSummary>
                        <AccordionDetails>
                            <div>{I18n.t('Devices')}</div>
                            <div>
                                <IconButton onClick={() => this.setState(
                                    {
                                        dialog: {
                                            type: 'bridge',
                                            bridge,
                                        },
                                    },
                                )}
                                >
                                    <Add />
                                </IconButton>
                            </div>
                            {bridge.list.map((device, index2) => <div key={index2}>
                                {device.name}
                                <IconButton onClick={() => {
                                    const matter = JSON.parse(JSON.stringify(this.state.matter));
                                    matter.bridges.list[index].list.splice(index2, 1);
                                    this.setState({ matter });
                                }}
                                >
                                    <Delete />
                                </IconButton>
                            </div>)}
                        </AccordionDetails>
                    </Accordion>
                </div>)
            }
        </div>;
    }

    renderDevices() {
        return <div>
            <div>
                <IconButton onClick={() => this.setState(
                    {
                        dialog: {
                            type: 'device',
                        },
                    },
                )}
                >
                    <Add />
                </IconButton>
            </div>
            {
                this.state.matter.devices.list.map((device, index) => <div key={index}>
                    {device.name}
                    <Switch
                        checked={device.enabled}
                        onChange={e => {
                            const matter = JSON.parse(JSON.stringify(this.state.matter));
                            matter.devices.list[index].enabled = e.target.checked;
                            this.setState({ matter });
                        }}
                    />
                    <IconButton onClick={() => {
                        const matter = JSON.parse(JSON.stringify(this.state.matter));
                        matter.devices.list.splice(index, 1);
                        this.setState({ matter });
                    }}
                    >
                        <Delete />
                    </IconButton>
                </div>)
            }
        </div>;
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
                    socket={this.socket}
                />
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
