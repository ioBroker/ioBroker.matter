import { CommissioningServer, MatterServer } from '@project-chip/matter-node.js';

import { VendorId } from '@project-chip/matter-node.js/datatype';
import { Aggregator, DeviceTypes, OnOffPluginUnitDevice } from '@project-chip/matter-node.js/device';
import { QrCode } from '@project-chip/matter-node.js/schema';
import { StorageManager } from '@project-chip/matter-node.js/storage';

import { StorageIoBroker } from './StorageIoBroker';
import { GenericDevice, Socket } from '../lib';

export interface BridgeOptions {
    passcode: number;
    discriminator: number;
    vendorid: number;
    productid: number;
    devicename: string;
    productname: string;
}

class BridgedDevice {
    private matterServer: MatterServer | undefined;
    private adapter: ioBroker.Adapter;
    private options: BridgeOptions;
    private uuid: string;
    private devices: GenericDevice[];

    constructor(adapter: ioBroker.Adapter, uuid: string, options: BridgeOptions, devices: GenericDevice[]) {
        this.adapter = adapter;
        this.options = options;
        this.uuid = uuid;
        this.devices = devices;
    }

    async start() {
        const storage = new StorageIoBroker(this.adapter, this.uuid);

        /**
         * Initialize the storage system.
         *
         * The storage manager is then also used by the Matter server, so this code block in general is required,
         * but you can choose a different storage backend as long as it implements the required API.
         */

        const storageManager = new StorageManager(storage);
        await storageManager.initialize();

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

        const deviceName = this.options.devicename || "Matter Bridge device";
        const deviceType = DeviceTypes.AGGREGATOR.code;
        const vendorName = "ioBroker";
        const passcode = this.options.passcode; // 20202021;
        const discriminator = this.options.discriminator; // 3840);

        // product name / id and vendor id should match what is in the device certificate
        const vendorId = this.options.vendorid;// 0xfff1;
        const productName = `ioBroker OnOff-Bridge`;
        const productId = this.options.productid; // 0x8000;

        const port = 5540;

        const uniqueId = this.uuid;

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

        this.matterServer = new MatterServer(storageManager);

        const commissioningServer = new CommissioningServer({
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
                serialNumber: `io-broker-${uniqueId}`,
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
            onOffDevice.addCommandHandler('identify', async ({ request: { identifyTime } }) => {
                console.log(
                    `Identify called for OnOffDevice ${onOffDevice.name} with id: ${i} and identifyTime: ${identifyTime}`,
                );
            });

            const name = `OnOff Socket ${i}`;
            aggregator.addBridgedDevice(onOffDevice, {
                nodeLabel: name,
                productName: name,
                productLabel: name,
                serialNumber: `io-broker-${uniqueId}-${i}`,
                reachable: true,
            });
        }

        commissioningServer.addDevice(aggregator);

        this.matterServer.addCommissioningServer(commissioningServer);

        /**
         * Start the Matter Server
         *
         * After everything was plugged together we can start the server. When not delayed announcement is set for the
         * CommissioningServer node then this command also starts the announcement of the device into the network.
         */

        await this.matterServer.start();

        /**
         * Print Pairing Information
         *
         * If the device is not already commissioned (this info is stored in the storage system) then get and print the
         * pairing details. This includes the QR code that can be scanned by the Matter app to pair the device.
         */

        this.adapter.log.info('Listening');

        if (!commissioningServer.isCommissioned()) {
            const pairingData = commissioningServer.getPairingCode();
            const { qrPairingCode, manualPairingCode } = pairingData;

            console.log(QrCode.encode(qrPairingCode));
            console.log(
                `QR Code URL: https://project-chip.github.io/connectedhomeip/qrcode.html?data=${qrPairingCode}`,
            );
            console.log(`Manual pairing code: ${manualPairingCode}`);
        } else {
            console.log("Device is already commissioned. Waiting for controllers to connect ...");
        }
    }

    async stop() {
        for (let d = 0; d < this.devices.length; d++) {
            await this.devices[d].destroy();
        }

        await this.matterServer?.close();
    }
}

export default BridgedDevice;