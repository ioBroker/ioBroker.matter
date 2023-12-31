import { CommissioningServer, MatterServer } from '@project-chip/matter-node.js';

import { VendorId } from '@project-chip/matter-node.js/datatype';
import { DeviceTypes } from '@project-chip/matter-node.js/device';
import { Logger } from '@project-chip/matter-node.js/log';

import { GenericDevice } from '../lib';
import { DeviceDescription } from '../ioBrokerStorageTypes';

import matterDeviceFactory from './matterFactory';
import VENDOR_IDS from './vendorIds';
import { NodeStateResponse, NodeStates } from './BridgedDevicesNode';
import { MatterAdapter } from '../main';

export interface DeviceCreateOptions {
    adapter: MatterAdapter;
    parameters: DeviceOptions,
    device: GenericDevice;
    matterServer: MatterServer;
    deviceOptions: DeviceDescription;
}

export interface DeviceOptions {
    uuid: string;
    passcode: number;
    discriminator: number;
    vendorid: number;
    productid: number;
    devicename: string;
    productname: string;
}

class Device {
    private matterServer: MatterServer | undefined;
    private parameters: DeviceOptions;
    private readonly device: GenericDevice;
    private commissioningServer: CommissioningServer | undefined;
    private deviceOptions: DeviceDescription;
    private adapter: MatterAdapter;
    private commissioned: boolean | null = null;

    constructor(options: DeviceCreateOptions) {
        this.adapter = options.adapter;
        this.parameters = options.parameters;
        this.device = options.device;
        this.matterServer = options.matterServer;
        this.deviceOptions = options.deviceOptions;
    }

    async init(): Promise<void> {
        const commissionedObj = await this.adapter.getObjectAsync(`devices.${this.parameters.uuid}.commissioned`);
        if (!commissionedObj) {
            await this.adapter.setObjectAsync(`devices.${this.parameters.uuid}.commissioned`, {
                type: 'state',
                common: {
                    name: 'commissioned',
                    type: 'boolean',
                    role: 'indicator',
                    read: true,
                    write: false,
                },
                native: {},
            });
        }

        /**
         * Collect all needed data
         *
         * This block makes sure to collect all needed data from cli or storage. Replace this with where ever your data
         * come from.
         *
         * Note: This example also uses the initialized storage system to store the device parameter data for convenience
         * and easy reuse. When you also do that, be careful to not overlap with Matter-Server own contexts
         * (so maybe better not ;-)).
         */
        const deviceName = this.parameters.devicename || 'Matter device';
        const deviceType = DeviceTypes.AGGREGATOR.code;
        const vendorName = 'ioBroker';
        const passcode = this.parameters.passcode; // 20202021;
        const discriminator = this.parameters.discriminator; // 3840);

        // product name / id and vendor id should match what is in the device certificate
        const vendorId = this.parameters.vendorid; // 0xfff1;
        const productName = this.deviceOptions.name;
        const productId = this.parameters.productid; // 0x8000;

        const uniqueId = this.parameters.uuid.replace(/-/g, '').split('.').pop() || '0000000000000000';

        /**
         * Create Matter Server and CommissioningServer Node
         *
         * To allow the device to be announced, found, paired and operated, we need a MatterServer instance and add a
         * commissioningServer to it and add the just created device instance to it.
         * The CommissioningServer node defines the port where the server listens for the UDP packages of the Matter protocol
         * and initializes deice specific certificates and such.
         *
         * The below logic also adds command handlers for commands of clusters that normally are handled internally
         * like testEventTrigger (General Diagnostic Cluster) that can be implemented with the logic when these commands
         * are called.
         */
        this.commissioningServer = new CommissioningServer({
            deviceName,
            deviceType,
            passcode,
            discriminator,
            basicInformation: {
                vendorName,
                vendorId: VendorId(vendorId),
                nodeLabel: productName,
                productName,
                productLabel: productName,
                productId,
                serialNumber: uniqueId,
            },
            activeSessionsChangedCallback: async fabricIndex => {
                this.adapter.log.debug(
                    `activeSessionsChangedCallback: Active sessions changed on Fabric ${fabricIndex}` +
                    Logger.toJSON(this.commissioningServer?.getActiveSessionInformation(fabricIndex)));
                await this.adapter.sendToGui({ command: 'updateStates', states: { [this.parameters.uuid]: await this.getState() }});
            },
            commissioningChangedCallback: async fabricIndex => {
                this.adapter.log.debug(
                    `commissioningChangedCallback: Commissioning changed on Fabric ${fabricIndex}: ${Logger.toJSON(this.commissioningServer?.getCommissionedFabricInformation(fabricIndex)[0])}`);
                await this.adapter.sendToGui({ command: 'updateStates', states: { [this.parameters.uuid]: await this.getState() }});
            },
        });

        /**
         * Create Device instance and add needed Listener
         *
         * Create an instance of the matter device class you want to use.
         * This example uses the OnOffLightDevice or OnOffPluginUnitDevice depending on the value of the type parameter.
         * To execute the on/off scripts defined as parameters, a listener for the onOff attribute is registered via the
         * device-specific API.
         *
         * The below logic also adds command handlers for commands of clusters that normally are handled device internally
         * like identify that can be implemented with the logic when these commands are called.
         */

        const ioBrokerDevice = this.device;
        const mappingDevice = await matterDeviceFactory(ioBrokerDevice, this.deviceOptions.name, this.parameters.uuid);
        if (mappingDevice) {
            this.commissioningServer.addDevice(mappingDevice.getMatterDevice());
        } else {
            this.adapter.log.error(`ioBroker Device "${this.device.getDeviceType()}" is not supported`);
        }

        try {
            this.matterServer?.addCommissioningServer(this.commissioningServer, { uniqueStorageKey: this.parameters.uuid });
        } catch (e) {
            this.adapter.log.error(`Could not add commissioning server for device ${this.parameters.uuid}: ${e.message}`);
        }
    }

    async getState(): Promise<NodeStateResponse> {
        if (!this.commissioningServer) {
            return {
                status: NodeStates.Creating,
            };
        }
        /**
         * Print Pairing Information
         *
         * If the device is not already commissioned (this info is stored in the storage system) then get and print the
         * pairing details. This includes the QR code that can be scanned by the Matter app to pair the device.
         */

        // this.adapter.log.info('Listening');

        if (!this.commissioningServer.isCommissioned()) {
            if (this.commissioned !== false) {
                this.commissioned = false;
                await this.adapter.setStateAsync(`devices.${this.parameters.uuid}.commissioned`, this.commissioned, true);
            }
            const pairingData = this.commissioningServer.getPairingCode();
            // const { qrPairingCode, manualPairingCode } = pairingData;
            // console.log(QrCode.encode(qrPairingCode));
            // console.log(
            //     `QR Code URL: https://project-chip.github.io/connectedhomeip/qrcode.html?data=${qrPairingCode}`,
            // );
            // console.log(`Manual pairing code: ${manualPairingCode}`);
            return {
                status: NodeStates.WaitingForCommissioning,
                qrPairingCode: pairingData.qrPairingCode,
                manualPairingCode: pairingData.manualPairingCode,
            };
        } else {
            if (this.commissioned !== true) {
                this.commissioned = true;
                await this.adapter.setStateAsync(`devices.${this.parameters.uuid}.commissioned`, this.commissioned, true);
            }

            const activeSession = this.commissioningServer.getActiveSessionInformation();
            const fabric = this.commissioningServer.getCommissionedFabricInformation();

            const connectionInfo: any = activeSession.map(session => {
                const vendorId = session?.fabric?.rootVendorId;
                return {
                    vendor: (vendorId && VENDOR_IDS[vendorId]) || `0x${(vendorId || 0).toString(16)}`,
                    connected: !!session.numberOfActiveSubscriptions,
                    label: session?.fabric?.label,
                };
            });

            fabric.forEach(fabric => {
                if (!activeSession.find(session => session.fabric?.fabricId === fabric.fabricId)) {
                    connectionInfo.push({
                        vendor: VENDOR_IDS[fabric?.rootVendorId] || `0x${(fabric?.rootVendorId || 0).toString(16)}`,
                        connected: false,
                        label: fabric?.label,
                    });
                }
            });

            if (connectionInfo.find((info: any) => info.connected)) {
                console.log('Device is already commissioned and connected with controller');
                return {
                    status: NodeStates.ConnectedWithController,
                    connectionInfo,
                };
            } else {
                console.log('Device is already commissioned. Waiting for controllers to connect ...');
                return {
                    status: NodeStates.Commissioned,
                    connectionInfo,
                };
            }
        }
    }

    async advertise(): Promise<void> {
        await this.commissioningServer?.advertise();
    }

    async factoryReset(): Promise<void> {
        await this.commissioningServer?.factoryReset();
    }

    async stop(): Promise<void> {
        this.commissioningServer && this.matterServer?.removeCommissioningServer(this.commissioningServer);
        await this.device.destroy();
    }
}

export default Device;