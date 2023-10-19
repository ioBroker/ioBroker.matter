import { CommissioningServer, MatterServer } from '@project-chip/matter-node.js';

import { VendorId } from '@project-chip/matter-node.js/datatype';
import { Aggregator, DeviceTypes, OnOffPluginUnitDevice } from '@project-chip/matter-node.js/device';
import { toJson } from '@project-chip/matter.js/storage';

import { GenericDevice, Socket } from '../lib';

export interface BridgeCreateOptions {
    adapter: ioBroker.Adapter;
    parameters: BridgeOptions,
    devices: GenericDevice[];
    sendToGui: (data: any) => Promise<void>;
    matterServer: MatterServer;
}

export interface BridgeOptions {
    uuid: string;
    passcode: number;
    discriminator: number;
    vendorid: number;
    productid: number;
    devicename: string;
    productname: string;
}

export enum BridgeStates {
    Creating = 'creating',
    Listening = 'listening',
    Commissioned = 'commissioned',
}

class BridgedDevice {
    private matterServer: MatterServer | undefined;
    private adapter: ioBroker.Adapter;
    private parameters: BridgeOptions;
    private devices: GenericDevice[];
    private sendToGui: (data: any) => Promise<void> | undefined;
    private commissioningServer: CommissioningServer | undefined;

    constructor(options: BridgeCreateOptions) {
        this.adapter = options.adapter;
        this.parameters = options.parameters;
        this.devices = options.devices;
        this.sendToGui = options.sendToGui;
        this.matterServer = options.matterServer;
    }

    async init() {
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
        const deviceName = this.parameters.devicename || "Matter Bridge device";
        const deviceType = DeviceTypes.AGGREGATOR.code;
        const vendorName = "ioBroker";
        const passcode = this.parameters.passcode; // 20202021;
        const discriminator = this.parameters.discriminator; // 3840);

        // product name / id and vendor id should match what is in the device certificate
        const vendorId = this.parameters.vendorid;// 0xfff1;
        const productName = `ioBroker OnOff-Bridge`;
        const productId = this.parameters.productid; // 0x8000;

        const port = 5540;

        const uniqueId = this.parameters.uuid.replace(/-/g, '').split('.').pop() || '0000000000000000';

        /**
         * Create Matter Server and CommissioningServer Node
         *
         * To allow the device to be announced, found, paired and operated we need a MatterServer instance and add a
         * commissioningServer to it and add the just created device instance to it.
         * The CommissioningServer node defines the port where the server listens for the UDP packages of the Matter protocol
         * and initializes deice specific certificates and such.
         *
         * The below logic also adds command handlers for commands of clusters that normally are handled internally
         * like testEventTrigger (General Diagnostic Cluster) that can be implemented with the logic when these commands
         * are called.
         */
        this.commissioningServer = new CommissioningServer({
            port,
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
        });

        /**
         * Create Device instance and add needed Listener
         *
         * Create an instance of the matter device class you want to use.
         * This example uses the OnOffLightDevice or OnOffPluginUnitDevice depending on the value of the type parameter.
         * To execute the on/off scripts defined as parameters, a listener for the onOff attribute is registered via the
         * device specific API.
         *
         * The below logic also adds command handlers for commands of clusters that normally are handled device internally
         * like identify that can be implemented with the logic when these commands are called.
         */

        const aggregator = new Aggregator();

        for (let i = 1; i <= this.devices.length; i++) {
            const device = this.devices[i - 1] as Socket;
            const onOffDevice = new OnOffPluginUnitDevice();

            onOffDevice.addOnOffListener(on => device.setPower(on));
            onOffDevice.addCommandHandler('identify', async ({request: {identifyTime}}) => {
                console.log(
                    `Identify called for OnOffDevice ${onOffDevice.name} with id: ${i} and identifyTime: ${identifyTime}`,
                );
            });

            const name = `OnOff Socket ${i}`;
            aggregator.addBridgedDevice(onOffDevice, {
                nodeLabel: name,
                productName: name,
                productLabel: name,
                uniqueId: i.toString().padStart(4, '0') + uniqueId.substring(4),
                reachable: true,
            });
        }

        this.commissioningServer.addDevice(aggregator);

        this.matterServer?.addCommissioningServer(this.commissioningServer, { uniqueNodeId: this.parameters.uuid });
    }

    async getState(): Promise<BridgeStates> {
        if (!this.commissioningServer) {
            this.sendToGui({
                uuid: this.parameters.uuid,
                command: 'status',
                data: 'creating',
            });
            return BridgeStates.Creating;
        }
        /**
         * Print Pairing Information
         *
         * If the device is not already commissioned (this info is stored in the storage system) then get and print the
         * pairing details. This includes the QR code that can be scanned by the Matter app to pair the device.
         */

        // this.adapter.log.info('Listening');

        if (!this.commissioningServer.isCommissioned()) {
            const pairingData = this.commissioningServer.getPairingCode();
            this.sendToGui({
                uuid: this.parameters.uuid,
                command: 'showQRCode',
                qrPairingCode: pairingData.qrPairingCode,
                manualPairingCode: pairingData.manualPairingCode,
            });
            // const { qrPairingCode, manualPairingCode } = pairingData;
            // console.log(QrCode.encode(qrPairingCode));
            // console.log(
            //     `QR Code URL: https://project-chip.github.io/connectedhomeip/qrcode.html?data=${qrPairingCode}`,
            // );
            // console.log(`Manual pairing code: ${manualPairingCode}`);
            return BridgeStates.Listening;
        } else {
            const activeSession = this.commissioningServer.getActiveSessionInformation();
            const fabric = this.commissioningServer.getCommissionedFabricInformation();

            this.sendToGui({
                uuid: this.parameters.uuid,
                command: 'status',
                data: 'connecting',
                activeSession: toJson(activeSession),
                fabric: toJson(fabric),
            });
            console.log('Device is already commissioned. Waiting for controllers to connect ...');
            return BridgeStates.Commissioned;
        }
    }

    async stop() {
        for (let d = 0; d < this.devices.length; d++) {
            await this.devices[d].destroy();
        }
    }
}

export default BridgedDevice;