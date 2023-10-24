import {
    CommissioningController,
    CommissioningServer,
    MatterServer,
    NodeCommissioningOptions,
} from '@project-chip/matter-node.js';
import { CommissioningOptions } from "@project-chip/matter-node.js/protocol";
import {
    BasicInformationCluster,
    DescriptorCluster,
    GeneralCommissioning,
    OnOffCluster,
} from "@project-chip/matter-node.js/cluster";
import { VendorId } from '@project-chip/matter-node.js/datatype';
import { DeviceTypes } from '@project-chip/matter-node.js/device';

import { GenericDevice } from '../lib';
import { DeviceDescription } from '../ioBrokerStorageTypes';

import matterDeviceFabric from './matterFabric';
import VENDOR_IDS from './vendorIds';
import { NodeStateResponse, NodeStates } from './BridgedDevicesNode';

export interface DeviceCreateOptions {
    adapter: ioBroker.Adapter;
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

class Controller {
    private matterServer: MatterServer | undefined;
    private parameters: DeviceOptions;
    private device: GenericDevice;
    private commissioningServer: CommissioningServer | undefined;
    private deviceOptions: DeviceDescription;
    private adapter: ioBroker.Adapter;
    private commissioned: boolean | null = null;

    constructor(options: DeviceCreateOptions) {
        this.adapter = options.adapter;
        this.parameters = options.parameters;
        this.device = options.device;
        this.matterServer = options.matterServer;
        this.deviceOptions = options.deviceOptions;
    }

    async init(): Promise<void> {
        const commissionedObj = await this.adapter.getForeignObjectAsync(`matter.0.devices.${this.parameters.uuid}.commissioned`);
        if (!commissionedObj) {
            await this.adapter.setForeignObjectAsync(`matter.0.devices.${this.parameters.uuid}.commissioned`, {
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
         * and easy reuse. When you also do that be careful to not overlap with Matter-Server own contexts
         * (so maybe better not ;-)).
         */
        const deviceName = this.parameters.devicename || 'Matter device';
        const deviceType = DeviceTypes.AGGREGATOR.code;
        const vendorName = 'ioBroker';
        const passcode = this.parameters.passcode; // 20202021;
        const discriminator = this.parameters.discriminator; // 3840);

        // product name / id and vendor id should match what is in the device certificate
        const vendorId = this.parameters.vendorid;// 0xfff1;
        const productName = `ioBroker OnOff-Bridge`;
        const productId = this.parameters.productid; // 0x8000;

        const port = 5540;

        const uniqueId = this.parameters.uuid.replace(/-/g, '').split('.').pop() || '0000000000000000';

        const commissioningOptions: CommissioningOptions = {
            regulatoryLocation: GeneralCommissioning.RegulatoryLocationType.IndoorOutdoor,
            regulatoryCountryCode: 'XX',
        };
        const commissioningController = new CommissioningController({
            autoConnect: false,
        });
        this.matterServer?.addCommissioningController(commissioningController);
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
                await this.adapter.setForeignStateAsync(`matter.0.devices.${this.parameters.uuid}.commissioned`, this.commissioned, true);
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
                await this.adapter.setForeignStateAsync(`matter.0.devices.${this.parameters.uuid}.commissioned`, this.commissioned, true);
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
                console.log('Controller is already commissioned and connected with controller');
                return {
                    status: NodeStates.ConnectedWithController,
                    connectionInfo,
                };
            } else {
                console.log('Controller is already commissioned. Waiting for controllers to connect ...');
                return {
                    status: NodeStates.Commissioned,
                    connectionInfo,
                };
            }
        }
    }

    async stop(): Promise<void> {
        await this.device.destroy();
    }
}

export default Controller;